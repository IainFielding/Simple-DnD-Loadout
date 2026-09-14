/**
 * What the doll shows, and what a drag or click should change.
 *
 * ## Two sources of truth, reconciled
 *
 * dnd5e already records *whether* an item is worn: `system.equipped`, which its own inventory tab
 * toggles, which drives AC, and which other modules read. The doll adds *where*: an actor flag
 * mapping slot keys to item ids. The two can disagree — a player unequips a cloak from the
 * inventory tab and the flag still says "back: cloak" — and the rule for that is simple:
 *
 *   **`system.equipped` wins.** The flag is a remembered preference, not a claim.
 *
 * Camp slots are the one exception, and the mirror image: they hold clothes packed for downtime,
 * so they show an assigned item only while it is *not* equipped. Equip it anywhere and it leaves
 * camp; put it in camp and it is unequipped, so a camp pair of Boots of Speed grants no speed.
 *
 * So an assignment to an unequipped, deleted or no-longer-fitting item is ignored (the slot draws
 * empty), and an equipped item with no assignment is placed where it naturally belongs. Nothing is
 * written while resolving — rendering a sheet must never update a document — but a stale entry
 * is harmless and useful: re-equip the cloak from the inventory and it returns to the slot it was
 * last in, because that entry is still there to honour.
 *
 * ## Planning
 *
 * {@link planPlace} and {@link planRemove} turn a player's intent into the exact writes needed,
 * without performing them: the next assignments map, plus which items to mark equipped or
 * unequipped. The controller applies a plan; the tests assert on one. Keeping these pure is what
 * lets every awkward case — swaps, two-handed weapons, a full ring row — be tested without
 * Foundry.
 */

import { accepts, classify } from "./classify.mjs";
import { isCampSlot } from "./slots.mjs";

/**
 * @typedef {import("./slots.mjs").SlotInstance & {
 *   item: import("./item-facts.mjs").ItemFacts|null,
 *   pinned: boolean,
 *   blocked: boolean,
 *   blockedBy: import("./item-facts.mjs").ItemFacts|null,
 *   conflict: boolean
 * }} Cell
 *
 * `pinned`   the item is here because the player put it here (an assignment), not by auto-placement
 * `blocked`  the off hand while a two-handed weapon is held; drawn as a ghost of that weapon
 * `conflict` blocked *and* holding something — only reachable through edits made elsewhere
 */

/**
 * @typedef {object} Layout
 * @property {Cell[]} cells
 * @property {import("./item-facts.mjs").ItemFacts[]} unslotted  Worn, but no free slot fits.
 * @property {boolean} strict
 */

/** Stable ordering for auto-placement: the inventory's own sort, then name, then id. */
function bySortThenName(a, b) {
  return (a.sort - b.sort) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/**
 * Resolve slot contents from assignments and item state.
 * @param {object} params
 * @param {import("./slots.mjs").SlotInstance[]} params.slots
 * @param {Record<string, string|null>} [params.assignments]
 * @param {import("./item-facts.mjs").ItemFacts[]} [params.items]
 * @param {boolean} [params.strict]
 * @returns {Layout}
 */
export function resolveLayout({ slots, assignments = {}, items = [], strict = false }) {
  const byId = new Map(items.map(item => [item.id, item]));
  const cells = slots.map(slot => ({
    ...slot, item: null, pinned: false, blocked: false, blockedBy: null, conflict: false
  }));
  const used = new Set();

  // 1. Honour what the player chose, where it is still true.
  for ( const cell of cells ) {
    const item = byId.get(assignments?.[cell.key] ?? "");
    if ( !item?.slottable || used.has(item.id) ) continue;
    // Worn slots show equipped items; camp slots show packed, unequipped ones.
    if ( item.equipped === isCampSlot(cell) ) continue;
    if ( !accepts(cell.kind, item, { strict }).ok ) continue;
    Object.assign(cell, { item, pinned: true });
    used.add(item.id);
  }

  // 2. Everything else that is worn goes where it naturally belongs, if there is room.
  const unslotted = [];
  const worn = items.filter(item => item.equipped && item.slottable && !used.has(item.id)).sort(bySortThenName);
  for ( const item of worn ) {
    const home = findHome(cells, item, strict);
    if ( home ) {
      home.item = item;
      used.add(item.id);
    }
    else unslotted.push(item);
  }

  markTwoHanded(cells);
  return { cells, unslotted, strict };
}

/** The kinds an item may auto-place into, most natural first. */
export function candidateKinds(item) {
  const natural = classify(item);
  if ( !natural ) return [];
  switch ( natural.kind ) {
    case "mainHand":
      return (item.type === "weapon") && !item.twoHanded ? ["mainHand", "offHand"] : ["mainHand"];
    case "ranged":
      // Slung first. A character with more bows than ranged slots is holding the next one.
      return item.twoHanded ? ["ranged", "mainHand"] : ["ranged", "mainHand", "offHand"];
    case "offHand":
    case "body":
    case "ring":
    case "trinket":
    case "light":
    case "instrument":
    case "tools":
      return [natural.kind];
    default:
      // A worn accessory with its own slot taken still counts: park it among the trinkets.
      return [natural.kind, "trinket"];
  }
}

/** The first empty cell an item can auto-place into without breaking the hands rule. */
function findHome(cells, item, strict) {
  const main = cells.find(c => c.kind === "mainHand");
  const off = cells.find(c => c.kind === "offHand");
  for ( const kind of candidateKinds(item) ) {
    for ( const cell of cells ) {
      if ( (cell.kind !== kind) || cell.item ) continue;
      if ( !accepts(kind, item, { strict }).ok ) continue;
      // Never *create* a two-handed conflict by auto-placement.
      if ( (kind === "mainHand") && item.twoHanded && off?.item ) continue;
      if ( (kind === "offHand") && main?.item?.twoHanded ) continue;
      return cell;
    }
  }
  return null;
}

/** Flag the off hand while the main hand holds a two-handed weapon. */
function markTwoHanded(cells) {
  const main = cells.find(c => c.kind === "mainHand");
  const off = cells.find(c => c.kind === "offHand");
  if ( !main?.item?.twoHanded || !off ) return;
  off.blocked = true;
  off.blockedBy = main.item;
  off.conflict = !!off.item;
}

/** The layout's current contents as an assignments map: every cell, auto-placed ones included. */
export function snapshot(layout) {
  return Object.fromEntries(layout.cells.map(cell => [cell.key, cell.item?.id ?? null]));
}

/**
 * @typedef {object} Plan
 * @property {Record<string, string|null>} assignments  The complete next assignments map.
 * @property {string[]} equip     Item ids to mark `system.equipped = true`.
 * @property {string[]} unequip   Item ids to mark `system.equipped = false`.
 * @property {{item: object, key: string}[]} placed    For the `equipped` hook.
 * @property {{item: object, key: string}[]} removed   For the `unequipped` hook.
 */

/**
 * @typedef {{error: string}} Refusal  `error` is a key under `reject.` in lang.
 */

/**
 * Plan putting an item into a slot.
 *
 * - **Into an empty slot**: it goes there, and is marked equipped if it was not.
 * - **Onto an occupied slot**: the occupant comes off (unequipped) — unless the item was dragged
 *   *from another slot* and the occupant fits back where it came from, in which case they swap.
 * - **An item already in a different slot** moves rather than duplicating.
 * - **A two-handed weapon into the main hand** clears the off hand.
 * - **Anything into a blocked off hand** is refused, with a reason that names the weapon's rule,
 *   rather than silently unequipping the greatsword the player is holding.
 *
 * @param {Layout} layout
 * @param {object} params
 * @param {string} params.targetKey
 * @param {import("./item-facts.mjs").ItemFacts} params.item
 * @param {string|null} [params.sourceKey]  The slot the item was dragged from, if any.
 * @returns {Plan|Refusal}
 */
export function planPlace(layout, { targetKey, item, sourceKey = null }) {
  const cell = (key) => layout.cells.find(c => c.key === key);
  const target = cell(targetKey);
  if ( !target ) return { error: "unknownSlot" };
  if ( !item ) return { error: "notSlottable" };

  const verdict = accepts(target.kind, item, { strict: layout.strict });
  if ( !verdict.ok ) return { error: verdict.reason };

  const main = layout.cells.find(c => c.kind === "mainHand");
  if ( (target.kind === "offHand") && main?.item?.twoHanded && (main.item.id !== item.id) ) {
    return { error: "offHandBlocked" };
  }

  const next = snapshot(layout);
  const itemsById = new Map(layout.cells.filter(c => c.item).map(c => [c.item.id, c.item]));
  const placed = [{ item, key: targetKey }];
  const removed = [];
  const involved = new Map([[item.id, item]]);

  // Lift the item out of wherever it currently sits.
  for ( const [key, id] of Object.entries(next) ) if ( (id === item.id) && (key !== targetKey) ) next[key] = null;

  const occupantId = next[targetKey];
  next[targetKey] = item.id;

  if ( occupantId && (occupantId !== item.id) ) {
    const occupant = itemsById.get(occupantId);
    const source = sourceKey && (sourceKey !== targetKey) ? cell(sourceKey) : null;
    // Only a two-handed weapon can conflict with a swap, and it can only ever sit in the main
    // hand — so a swap never lands one in a position the two-handed rule below would undo.
    const swapOk = source && (next[sourceKey] === null)
      && accepts(source.kind, occupant, { strict: layout.strict }).ok;
    involved.set(occupant.id, occupant);
    if ( swapOk ) {
      next[sourceKey] = occupant.id;
      placed.push({ item: occupant, key: sourceKey });
    } else {
      removed.push({ item: occupant, key: targetKey });
    }
  }

  // A two-handed grip needs the other hand free.
  if ( (target.kind === "mainHand") && item.twoHanded ) {
    const offKey = layout.cells.find(c => c.kind === "offHand")?.key;
    const offId = offKey ? next[offKey] : null;
    if ( offId && (offId !== item.id) ) {
      next[offKey] = null;
      involved.set(offId, itemsById.get(offId));
      removed.push({ item: itemsById.get(offId), key: offKey });
    }
  }

  // Equipped state follows from where each touched item ends up: in a worn slot it is equipped;
  // in a camp slot, or nowhere, it is not. Items this plan did not touch keep their state.
  const wornKeys = new Set(layout.cells.filter(c => !isCampSlot(c)).map(c => c.key));
  const worn = id => Object.entries(next).some(([key, value]) => (value === id) && wornKeys.has(key));
  const equip = [];
  const unequip = [];
  for ( const touched of involved.values() ) {
    const shouldWear = worn(touched.id);
    if ( shouldWear && !touched.equipped ) equip.push(touched.id);
    else if ( !shouldWear && touched.equipped ) unequip.push(touched.id);
  }

  return { assignments: next, equip, unequip, placed, removed };
}

/**
 * Plan emptying a slot: the item comes off and is marked unequipped.
 * @param {Layout} layout
 * @param {string} key
 * @returns {Plan|Refusal}
 */
export function planRemove(layout, key) {
  const target = layout.cells.find(c => c.key === key);
  if ( !target ) return { error: "unknownSlot" };
  if ( !target.item ) return { error: "emptySlot" };
  const next = snapshot(layout);
  next[key] = null;
  return {
    assignments: next,
    equip: [],
    // A camp item was never equipped; taking it out of camp just unpacks it.
    unequip: target.item.equipped ? [target.item.id] : [],
    placed: [],
    removed: [{ item: target.item, key }]
  };
}

/**
 * The best slot for an item when the caller did not name one — the API's `equip(actor, item)`.
 * An empty slot the item naturally belongs in is preferred; failing that, the first natural slot
 * whose current occupant it would replace. A slot that would refuse the item is never suggested.
 * @param {Layout} layout
 * @param {import("./item-facts.mjs").ItemFacts} item
 * @returns {string|null}
 */
export function suggestSlot(layout, item) {
  const kinds = candidateKinds(item);
  const ordered = kinds.flatMap(kind => layout.cells.filter(c => c.kind === kind));
  const placeable = cell => !planPlace(layout, { targetKey: cell.key, item }).error;
  const current = ordered.find(c => c.item?.id === item.id);
  if ( current ) return current.key;
  return (ordered.find(c => !c.item && !c.blocked && placeable(c)) ?? ordered.find(placeable))?.key ?? null;
}

/**
 * The items a player could put in a slot right now, for the click-to-pick drawer: everything the
 * slot accepts, worn items elsewhere included (picking one moves it), the slot's own occupant
 * excluded. Unworn items are listed first, since those are what a picker is usually for.
 * @param {Layout} layout
 * @param {string} key
 * @param {import("./item-facts.mjs").ItemFacts[]} items  The actor's items.
 * @returns {{item: object, wornIn: string|null}[]}
 */
export function candidatesFor(layout, key, items) {
  const target = layout.cells.find(c => c.key === key);
  if ( !target ) return [];
  const where = new Map(layout.cells.filter(c => c.item).map(c => [c.item.id, c.key]));
  return items
    .filter(item => item.slottable && (item.id !== target.item?.id))
    .filter(item => accepts(target.kind, item, { strict: layout.strict }).ok)
    .map(item => ({ item, wornIn: where.get(item.id) ?? null }))
    .sort((a, b) => (Number(a.item.equipped) - Number(b.item.equipped)) || bySortThenName(a.item, b.item));
}
