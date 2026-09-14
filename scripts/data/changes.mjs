/**
 * What a plan changes, told the way a player would say it.
 *
 * A {@link import("./layout.mjs").Plan} records writes: which slot holds what next, and which items were
 * placed or removed. "Placed in the main hand" and "removed from the main hand" as two entries is how
 * the hooks want it; a chat card wants "swapped the longsword and the dagger". This turns the one into
 * the other, against the layout as it was before the plan, and stays pure so the tests can read every
 * case without Foundry.
 */

import { isCampSlot } from "./slots.mjs";

/**
 * @typedef {object} Change
 * @property {"equip"|"replace"|"move"|"swap"|"pack"|"unequip"|"unpack"} action
 *   `equip`    into a worn slot from no slot
 *   `replace`  into a worn slot from no slot, taking the slot's occupant off
 *   `move`     from one slot to another
 *   `swap`     two items trading slots
 *   `pack`     into a camp slot from no slot
 *   `unequip`  out of a worn slot, or off from Also Worn (`from` is null)
 *   `unpack`   out of a camp slot
 * @property {import("./item-facts.mjs").ItemFacts} item
 * @property {import("./item-facts.mjs").ItemFacts|null} other  The item replaced or swapped with.
 * @property {import("./layout.mjs").Cell|null} from
 * @property {import("./layout.mjs").Cell|null} to
 */

/**
 * @param {import("./layout.mjs").Layout} layout  The loadout before the plan was written.
 * @param {{placed: {item: object, key: string}[], removed: {item: object, key: string|null}[]}} plan
 * @returns {Change[]}  In the plan's order: placements first, then what only came off.
 */
export function describeChanges(layout, plan) {
  const cellOf = key => layout.cells.find(c => c.key === key) ?? null;
  const wasIn = new Map(layout.cells.filter(c => c.item).map(c => [c.item.id, c.key]));
  const placedAt = new Map(plan.placed.filter(p => p.item).map(p => [p.item.id, p.key]));
  const removedIds = new Set(plan.removed.filter(r => r.item).map(r => r.item.id));
  const told = new Set();
  const changes = [];

  for ( const { item, key } of plan.placed ) {
    if ( !item || told.has(item.id) ) continue;
    const from = wasIn.get(item.id) ?? null;
    const to = cellOf(key);
    const occupant = to?.item && (to.item.id !== item.id) ? to.item : null;
    told.add(item.id);

    // The item that was here went to where this one came from.
    if ( from && occupant && (placedAt.get(occupant.id) === from) ) {
      changes.push({ action: "swap", item, other: occupant, from: cellOf(from), to });
      told.add(occupant.id);
      continue;
    }
    if ( from ) {
      changes.push({ action: "move", item, other: null, from: cellOf(from), to });
      continue;
    }
    // The occupant came off rather than moving elsewhere: one line says both.
    const replaced = occupant && !placedAt.has(occupant.id) && removedIds.has(occupant.id) && !isCampSlot(to);
    if ( replaced ) told.add(occupant.id);
    const action = isCampSlot(to) ? "pack" : (replaced ? "replace" : "equip");
    changes.push({ action, item, other: replaced ? occupant : null, from: null, to });
  }

  for ( const { item, key } of plan.removed ) {
    if ( !item || told.has(item.id) ) continue;
    told.add(item.id);
    const from = key ? cellOf(key) : null;
    changes.push({ action: from && isCampSlot(from) ? "unpack" : "unequip", item, other: null, from, to: null });
  }

  return changes;
}
