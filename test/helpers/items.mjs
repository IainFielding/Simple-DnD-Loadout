/**
 * Item builders for the tests: dnd5e-shaped source objects run through the real `itemFacts`, so
 * every test exercises the same snapshotting the module does rather than hand-written facts.
 */

import { itemFacts } from "../../scripts/data/item-facts.mjs";

let counter = 0;

/**
 * @param {object} spec
 * @param {string} spec.name
 * @param {string} [spec.type="equipment"]
 * @param {string} [spec.subtype=""]
 * @param {string} [spec.img=""]
 * @param {string[]} [spec.properties=[]]
 * @param {boolean} [spec.equipped=false]
 * @param {boolean} [spec.attuned=false]
 * @param {string} [spec.attunement=""]
 * @param {string} [spec.rarity=""]
 * @param {number} [spec.sort=0]
 * @param {string} [spec.id]
 * @param {string} [spec.slot]   A pinned slot flag.
 */
export function source({
  name, type = "equipment", subtype = "", img = "", properties = [], equipped = false,
  attuned = false, attunement = "", rarity = "", sort = 0, id, slot
}) {
  const _id = id ?? `item${String(++counter).padStart(12, "0")}`;
  return {
    id: _id,
    uuid: `Actor.hero.Item.${_id}`,
    name,
    type,
    img,
    sort,
    flags: slot ? { "sogrom-simple-dnd5e-paper-doll": { slot } } : {},
    system: {
      type: { value: subtype },
      properties: new Set(properties),
      equipped,
      attuned,
      attunement,
      rarity
    }
  };
}

/** Facts for one item spec. */
export const make = spec => itemFacts(source(spec));

/* Common gear, as facts. Each call makes a fresh id. */
export const longsword = (extra = {}) => make({ name: "Longsword", type: "weapon", subtype: "martialM", properties: ["ver"], ...extra });
export const dagger = (extra = {}) => make({ name: "Dagger", type: "weapon", subtype: "simpleM", properties: ["fin", "lgt", "thr"], ...extra });
export const greatsword = (extra = {}) => make({ name: "Greatsword", type: "weapon", subtype: "martialM", properties: ["hvy", "two"], ...extra });
export const shield = (extra = {}) => make({ name: "Shield", subtype: "shield", ...extra });
export const chainMail = (extra = {}) => make({ name: "Chain Mail", subtype: "heavy", ...extra });
export const leather = (extra = {}) => make({ name: "Leather Armor", subtype: "light", ...extra });
export const ring = (name = "Ring of Protection", extra = {}) => make({ name, subtype: "ring", attunement: "required", ...extra });
export const boots = (extra = {}) => make({ name: "Boots of Speed", subtype: "wondrous", img: "icons/equipment/feet/boots-leather-green.webp", ...extra });
export const cloak = (extra = {}) => make({ name: "Cloak of Protection", subtype: "wondrous", img: "icons/equipment/back/cloak-heavy-fur-blue.webp", attunement: "required", ...extra });
export const amulet = (extra = {}) => make({ name: "Amulet of Health", subtype: "wondrous", img: "icons/equipment/neck/pendant-faceted-red.webp", attunement: "required", ...extra });
export const iounStone = (extra = {}) => make({ name: "Ioun Stone of Protection", subtype: "wondrous", img: "icons/commodities/gems/gem-rough-ball-purple.webp", ...extra });
export const potion = (extra = {}) => make({ name: "Potion of Healing", type: "consumable", subtype: "potion", ...extra });
export const longbow = (extra = {}) => make({ name: "Longbow", type: "weapon", subtype: "martialR", properties: ["amm", "hvy", "two"], ...extra });
export const handCrossbow = (extra = {}) => make({ name: "Hand Crossbow", type: "weapon", subtype: "martialR", properties: ["amm", "lgt", "lod"], ...extra });
export const javelin = (extra = {}) => make({ name: "Javelin", type: "weapon", subtype: "simpleM", properties: ["thr"], ...extra });
export const torch = (extra = {}) => make({ name: "Torch", type: "consumable", subtype: "trinket", img: "icons/sundries/lights/torch-brown-lit.webp", ...extra });
export const lute = (extra = {}) => make({ name: "Lute", type: "tool", subtype: "music", ...extra });
export const smithsTools = (extra = {}) => make({ name: "Smith's Tools", type: "tool", subtype: "art", ...extra });
