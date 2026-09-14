/**
 * Reduce a dnd5e Item to the plain facts the loadout reasons about.
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

/** Item types that can ever go in a slot. Containers and loot never do. */
export const SLOTTABLE_TYPES = Object.freeze(["weapon", "equipment", "consumable", "tool"]);

/** dnd5e weapon subtypes that are ranged weapons (`CONFIG.DND5E.weaponTypes`). */
export const RANGED_WEAPON_SUBTYPES = Object.freeze(["simpleR", "martialR"]);

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
 * @property {string} name          The name everyone sees: dnd5e swaps in the unidentified name.
 * @property {string} sourceName    The item's real name, for classification only; never displayed.
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
 * @property {boolean} ranged       A ranged weapon: simple or martial ranged.
 * @property {number|null} proficient  dnd5e's proficiency multiplier for a weapon, armour or shield;
 *                                     null for anything proficiency does not apply to.
 * @property {number|null} strength    The Strength score armour requires, if any.
 * @property {{value: number, max: number}|null} uses  Limited uses, when the item has any.
 * @property {number} quantity
 * @property {{value: number, base: number, dex: number|null}|null} armor
 *   Armour and shields: `value` includes a magical bonus, `base` does not; `dex` is the Dex cap
 *   (null for none).
 * @property {{formula: string, types: string, versatile: string}|null} damage  Weapons.
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
    // dnd5e replaces a live item's name with its unidentified name during data preparation; the
    // source keeps the real one. Placing boots on the feet gives nothing away that their icon has not.
    sourceName: String(item?._source?.name ?? item?.name ?? ""),
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
    twoHanded: (type === "weapon") && properties.includes("two"),
    ranged: (type === "weapon") && RANGED_WEAPON_SUBTYPES.includes(subtype),
    proficient: readProficiency(type, subtype, system),
    strength: (type === "equipment") && (Number(system.strength) > 0) ? Number(system.strength) : null,
    uses: readUses(system.uses),
    quantity: Number.isFinite(Number(system.quantity)) ? Number(system.quantity) : 1,
    armor: readArmor(type, subtype, system.armor),
    damage: readDamage(item, type, system)
  };
}

/** Whether proficiency matters for an item: weapons, armour and shields. */
function proficiencyApplies(type, subtype) {
  if ( type === "weapon" ) return true;
  return (type === "equipment") && (ARMOR_SUBTYPES.includes(subtype) || (subtype === "shield"));
}

/** dnd5e's proficiency multiplier, which already accounts for the actor's proficiencies. */
function readProficiency(type, subtype, system) {
  if ( !proficiencyApplies(type, subtype) ) return null;
  let value;
  try {
    value = system.proficiencyMultiplier;
  } catch {
    // The getter reads the owning actor; an item-shaped object without one has nothing to say.
    return null;
  }
  return Number.isFinite(value) ? value : null;
}

function readUses(uses) {
  const max = Number(uses?.max);
  if ( !(max > 0) ) return null;
  const value = Number.isFinite(Number(uses.value)) ? Number(uses.value) : max - (Number(uses.spent) || 0);
  return { value: Math.min(max, Math.max(0, value)), max };
}

function readArmor(type, subtype, armor) {
  if ( (type !== "equipment") || !(ARMOR_SUBTYPES.includes(subtype) || (subtype === "shield")) ) return null;
  const value = Number(armor?.value) || 0;
  if ( !value ) return null;
  const base = Number.isFinite(Number(armor?.base)) ? Number(armor.base) : value;
  const dex = (armor?.dex === null) || (armor?.dex === undefined) || (armor?.dex === "") ? null : Number(armor.dex);
  return { value, base, dex: Number.isFinite(dex) ? dex : null };
}

/**
 * A weapon's damage as dnd5e labels it. The versatile formula follows the system's attack rule: the
 * versatile part's own dice where set, otherwise the base dice one size up.
 */
function readDamage(item, type, system) {
  if ( type !== "weapon" ) return null;
  const base = system.damage?.base;
  const formula = String(item?.labels?.damage ?? base?.formula ?? "");
  if ( !formula ) return null;
  let versatile = "";
  if ( toArray(system.properties).includes("ver") ) {
    const v = system.damage?.versatile;
    const number = Number(v?.number) || Number(base?.number) || 0;
    let denomination = Number(v?.denomination) || 0;
    if ( !denomination ) {
      try {
        denomination = Number(base?.steppedDenomination?.()) || 0;
      } catch {
        denomination = 0;
      }
    }
    if ( number && denomination ) versatile = `${number}d${denomination}`;
  }
  return { formula, types: String(item?.labels?.damageTypes ?? ""), versatile };
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
