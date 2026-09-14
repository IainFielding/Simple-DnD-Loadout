/**
 * Saved sets: a named record of what a character wears where — "Battle", "Travel", "Court" — that one
 * click puts back on.
 *
 * A set is a snapshot of the loadout: every filled slot, plus the items worn under Also Worn. Applying
 * it means "wear exactly this": the saved items go back in their saved slots, and every other item
 * worn in a slot comes off. Items that are no longer carried are skipped and reported. An item whose
 * saved slot has gone (the GM changed the layout) or no longer takes it (Strict Slot Matching) is
 * still worn, and the loadout places it wherever it fits, the same as an item equipped from the
 * inventory.
 *
 * Sets live in one actor flag as an array, so an update replaces the list whole and deleting a set
 * needs no deletion operators.
 *
 * Pure: plans the writes, performs none (`loadout/actions.mjs` does).
 */

import { accepts } from "./classify.mjs";
import { handPairs, snapshot } from "./layout.mjs";
import { isCampSlot, kindOfKey } from "./slots.mjs";

/** Most sets a character keeps. Past this the drawer stops being a quick choice. */
export const MAX_SETS = 10;

/** Longest set name kept. */
export const MAX_SET_NAME = 40;

/**
 * @typedef {object} SavedSet
 * @property {string} id
 * @property {string} name
 * @property {Record<string, string>} slots  Slot key → item id, filled slots only.
 * @property {string[]} alsoWorn             Items worn with no slot when the set was saved.
 * @property {Record<string, string>} names  Item id → name when saved, to name what has gone missing.
 */

/** Trim and shorten a name; empty when there is nothing usable. */
export function cleanSetName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SET_NAME);
}

/**
 * Read the stored sets, dropping anything malformed rather than failing the loadout over it.
 * @param {*} raw  The `sets` flag.
 * @returns {SavedSet[]}
 */
export function normaliseSets(raw) {
  if ( !Array.isArray(raw) ) return [];
  const seen = new Set();
  const sets = [];
  for ( const entry of raw ) {
    const id = typeof entry?.id === "string" ? entry.id : "";
    const name = cleanSetName(entry?.name);
    if ( !id || !name || seen.has(id) ) continue;
    seen.add(id);
    const slots = {};
    for ( const [key, itemId] of Object.entries(entry.slots ?? {}) ) {
      if ( (typeof itemId === "string") && itemId ) slots[key] = itemId;
    }
    const alsoWorn = Array.isArray(entry.alsoWorn) ? entry.alsoWorn.filter(i => (typeof i === "string") && i) : [];
    const names = (entry.names && (typeof entry.names === "object")) ? { ...entry.names } : {};
    sets.push({ id, name, slots, alsoWorn, names });
    if ( sets.length >= MAX_SETS ) break;
  }
  return sets;
}

/**
 * Record what the loadout shows now as a set.
 * @param {import("./layout.mjs").Layout} layout
 * @param {{id: string, name: string}} identity
 * @returns {SavedSet}
 */
export function captureSet(layout, { id, name }) {
  const slots = {};
  const names = {};
  for ( const cell of layout.cells ) {
    if ( !cell.item ) continue;
    slots[cell.key] = cell.item.id;
    names[cell.item.id] = cell.item.name;
  }
  const alsoWorn = layout.unslotted.map(item => item.id);
  for ( const item of layout.unslotted ) names[item.id] = item.name;
  return { id, name: cleanSetName(name), slots, alsoWorn, names };
}

/**
 * Find a set by id, or failing that by name, ignoring case.
 * @param {SavedSet[]} sets
 * @param {string} idOrName
 * @returns {SavedSet|null}
 */
export function findSet(sets, idOrName) {
  const wanted = String(idOrName ?? "");
  const byId = sets.find(s => s.id === wanted);
  if ( byId ) return byId;
  const name = cleanSetName(wanted).toLocaleLowerCase();
  return name ? (sets.find(s => s.name.toLocaleLowerCase() === name) ?? null) : null;
}

/**
 * Add a set, or replace the one with the same name (which keeps its id).
 * @param {SavedSet[]} sets
 * @param {SavedSet} set
 * @returns {{sets: SavedSet[], set: SavedSet, replaced: boolean}|{error: string}}
 *   `error` is a key under `reject.` in lang.
 */
export function upsertSet(sets, set) {
  if ( !set.name ) return { error: "setNoName" };
  const existing = findSet(sets, set.name);
  if ( existing ) {
    const replacement = { ...set, id: existing.id };
    return { sets: sets.map(s => (s === existing ? replacement : s)), set: replacement, replaced: true };
  }
  if ( sets.length >= MAX_SETS ) return { error: "setsFull" };
  return { sets: [...sets, set], set, replaced: false };
}

/**
 * The saved set the loadout is wearing exactly right now, if any.
 * @param {SavedSet[]} sets
 * @param {import("./layout.mjs").Layout} layout
 * @returns {SavedSet|null}
 */
export function matchingSet(sets, layout) {
  const current = snapshot(layout);
  const unslotted = new Set(layout.unslotted.map(item => item.id));
  return sets.find(set => {
    const keys = new Set([...Object.keys(current), ...Object.keys(set.slots)]);
    for ( const key of keys ) if ( (set.slots[key] ?? null) !== (current[key] ?? null) ) return false;
    return (set.alsoWorn.length === unslotted.size) && set.alsoWorn.every(id => unslotted.has(id));
  }) ?? null;
}

/**
 * Plan putting a saved set back on.
 * @param {import("./layout.mjs").Layout} layout  The loadout as it is now.
 * @param {import("./item-facts.mjs").ItemFacts[]} items  Everything the actor carries.
 * @param {SavedSet} set
 * @returns {import("./layout.mjs").Plan & {missing: string[], unchanged: boolean}}
 *   `missing` names saved items the actor no longer carries.
 */
export function planApplySet(layout, items, set) {
  const byId = new Map(items.map(item => [item.id, item]));
  const pairs = handPairs(layout.cells);
  const previous = snapshot(layout);
  const next = Object.fromEntries(layout.cells.map(cell => [cell.key, null]));
  const wear = new Set();
  const missing = new Set();
  const placedIds = new Set();

  const lookup = id => {
    const item = byId.get(id);
    if ( item?.slottable ) return item;
    missing.add(set.names?.[id] || id);
    return null;
  };

  // Cells run main hand before off hand in each pair, so the off hand is judged against the main
  // hand this set puts on, not the one being taken off.
  for ( const cell of layout.cells ) {
    const id = set.slots[cell.key];
    if ( !id || placedIds.has(id) ) continue;
    const item = lookup(id);
    if ( !item ) continue;
    const camp = isCampSlot(cell);
    const asOff = pairs.find(p => p.off === cell);
    const mainItem = asOff ? byId.get(next[asOff.main.key] ?? "") : null;
    const fits = accepts(cell.kind, item, { strict: layout.strict }).ok
      && !(asOff && (item.twoHanded || mainItem?.twoHanded));
    if ( fits ) {
      next[cell.key] = id;
      placedIds.add(id);
    }
    // Packed items stay packed even when their camp slot won't take them; anything else is worn.
    if ( !camp ) wear.add(id);
  }

  // Saved slots the layout no longer has: the items are still worn, wherever they now fit.
  for ( const [key, id] of Object.entries(set.slots) ) {
    if ( key in next ) continue;
    const kind = kindOfKey(key);
    if ( lookup(id) && !(kind && isCampSlot({ kind })) ) wear.add(id);
  }
  for ( const id of set.alsoWorn ) if ( lookup(id) ) wear.add(id);

  const equip = [];
  const unequip = [];
  for ( const item of items ) {
    if ( !item.slottable ) continue;
    const shouldWear = wear.has(item.id);
    if ( shouldWear && !item.equipped ) equip.push(item.id);
    else if ( !shouldWear && item.equipped ) unequip.push(item.id);
  }

  const placed = [];
  const removed = [];
  for ( const key of Object.keys(next) ) {
    if ( previous[key] === next[key] ) continue;
    if ( previous[key] ) removed.push({ item: byId.get(previous[key]), key });
    if ( next[key] ) placed.push({ item: byId.get(next[key]), key });
  }
  // Also Worn items coming off were in no slot.
  for ( const item of layout.unslotted ) if ( unequip.includes(item.id) ) removed.push({ item, key: null });

  const unchanged = !equip.length && !unequip.length && !placed.length && !removed.length;
  return { assignments: next, equip, unequip, placed, removed, missing: [...missing], unchanged };
}
