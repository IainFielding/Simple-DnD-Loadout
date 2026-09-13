/**
 * Reduce a dnd5e Item to the plain facts the doll reasons about.
 *
 * Everything downstream — the classifier, the layout resolver, the equip planner — works on these
 * snapshots rather than on live documents. That is what lets all of it run under plain Node in
 * the unit tests, and it means the rules are written once against a shape we control instead of
 * against dnd5e's data model, which renamed fields between 5.x and 6.x.
 *
 * Reads are defensive throughout: a homebrew item missing half its system data still produces a
 * valid snapshot, it just classifies as nothing in particular.
 */

import { MODULE_ID } from "../config.mjs";

/** Item types that can ever go in a slot. Tools, containers and loot never do. */
export const SLOTTABLE_TYPES = Object.freeze(["weapon", "equipment", "consumable"]);

/** Consumable subtypes that are worn or held rather than used up in a pocket. */
export const WORN_CONSUMABLE_SUBTYPES = Object.freeze(["wand", "rod", "trinket", "wondrous"]);

/** dnd5e armour subtypes (`CONFIG.DND5E.armorTypes`), minus the shield. */
export const ARMOR_SUBTYPES = Object.freeze(["light", "medium", "heavy", "natural"]);

/** Equipment subtypes that are neither armour nor a shield: things you wear or carry. */
export const WEARABLE_SUBTYPES = Object.freeze(["clothing", "trinket", "wondrous", "ring", "rod", "wand"]);

/**
 * @typedef {object} ItemFacts
 * @property {string} id
 * @property {string} uuid
 * @property {string} name
 * @property {string} img
 * @property {string} type          Document subtype: "weapon", "equipment", …
 * @property {string} subtype       `system.type.value`: "heavy", "ring", "martialM", …
 * @property {string[]} properties  `system.properties`, as an array.
 * @property {boolean} equipped
 * @property {boolean} attuned
 * @property {string} attunement    "", "required" or "optional".
 * @property {string} rarity
 * @property {boolean} identified
 * @property {number} sort
 * @property {string|null} slotOverride  A kind pinned by flag, overriding the classifier.
 * @property {boolean} slottable    Whether this item can go in any slot at all.
 * @property {boolean} twoHanded
 */

/**
 * Snapshot an Item (or anything item-shaped) as {@link ItemFacts}.
 * @param {object} item
 * @returns {ItemFacts}
 */
export function itemFacts(item) {
  const system = item?.system ?? {};
  const type = String(item?.type ?? "");
  const subtype = String(system.type?.value ?? "");
  const properties = toArray(system.properties);
  const slottable = SLOTTABLE_TYPES.includes(type)
    && ((type !== "consumable") || WORN_CONSUMABLE_SUBTYPES.includes(subtype))
    && ("equipped" in system);

  return {
    id: String(item?.id ?? item?._id ?? ""),
    uuid: String(item?.uuid ?? ""),
    name: String(item?.name ?? ""),
    img: String(item?.img ?? ""),
    type,
    subtype,
    properties,
    equipped: system.equipped === true,
    attuned: system.attuned === true,
    attunement: typeof system.attunement === "string" ? system.attunement : "",
    rarity: typeof system.rarity === "string" ? system.rarity : "",
    identified: system.identified !== false,
    sort: Number.isFinite(item?.sort) ? item.sort : 0,
    slotOverride: readOverride(item),
    slottable,
    twoHanded: (type === "weapon") && properties.includes("two")
  };
}

/** Whether an item can be attuned at all. */
export function canAttune(facts) {
  return (facts.attunement === "required") || (facts.attunement === "optional");
}

/** Whether an item needs attunement to work and is not attuned — worn but inert. */
export function needsAttunement(facts) {
  return (facts.attunement === "required") && !facts.attuned;
}

/** `system.properties` is a Set on live documents and an array in source data; take either. */
function toArray(value) {
  if ( value instanceof Set ) return [...value];
  if ( Array.isArray(value) ) return [...value];
  return [];
}

/** A slot kind pinned on the item, e.g. by another module or a GM macro. */
function readOverride(item) {
  const flag = item?.flags?.[MODULE_ID]?.slot;
  return (typeof flag === "string") && flag ? flag : null;
}
