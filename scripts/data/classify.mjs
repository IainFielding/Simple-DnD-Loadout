/**
 * Where does an item go on the body, and may it go in a given slot?
 *
 * dnd5e knows an item is armour, a shield, a ring or a weapon, but it has no idea that "Boots of
 * Speed" go on the feet: every wondrous item shares one subtype. So the classifier reads the item
 * the way a player would, in a fixed order of trust:
 *
 *   1. flag      a kind pinned on the item (another module, a GM macro) — always wins
 *   2. type      what dnd5e's own data says: weapon, armour, shield, ring
 *   3. name      the head noun of the name: "Cloak of Protection" → back
 *   4. icon      the core icon folder: `icons/equipment/feet/…` → feet
 *   5. fallback  held rods and wands to the main hand, clothing to the body, anything else worn
 *                to a trinket slot
 *
 * **Name before icon, deliberately.** Surveying the dnd5e 6.0 packs, icons are wrong often enough
 * to matter — Circlet of Blasting and Headband of Intellect both use *ring* art, Cloak of the Manta
 * Ray uses a hood — while the name's head noun was right in every case checked. The icon is still
 * the better signal for non-English content, which is why it is kept as the next step rather than
 * dropped.
 *
 * Pure: takes {@link ItemFacts}, never a document.
 */

import { SLOT_KINDS } from "./slots.mjs";
import { ARMOR_SUBTYPES, WEARABLE_SUBTYPES } from "./item-facts.mjs";

/**
 * Head-noun patterns per kind, tried in this order. Order only matters for the rare name that
 * matches two — "Robe of the Archmagi" should be body, not back — so body sits before back.
 */
export const NAME_RULES = Object.freeze([
  ["head", /\b(helms?|helmets?|hats?|caps?|circlets?|crowns?|headbands?|diadems?|tiaras?|hoods?|masks?|goggles|eyes|lenses|spectacles|monocles?|coifs?|cowls?)\b/i],
  ["neck", /\b(amulets?|necklaces?|periapts?|medallions?|pendants?|talismans?|torcs?|chokers?|scarabs?|brooches?|lockets?|collars?|charms?)\b/i],
  ["body", /\b(robes?|vestments?|clothes|clothing|outfits?|garb|raiments?|costumes?|tunics?|shirts?|coats?|jerkins?|armou?r|mail|chain|plate|breastplates?|dresses?|gowns?)\b/i],
  ["back", /\b(cloaks?|capes?|mantles?|wings|shawls?|capelets?)\b/i],
  ["hands", /\b(gloves?|gauntlets?|mittens?|handwraps?)\b/i],
  ["wrists", /\b(bracers?|bracelets?|vambraces?|armbands?|wristbands?|bangles?)\b/i],
  ["waist", /\b(belts?|girdles?|sashes|sash|cummerbunds?)\b/i],
  ["feet", /\b(boots?|slippers?|shoes?|sandals?|greaves|sabatons?)\b/i],
  ["ring", /\b(rings?|signets?)\b/i]
]);

/** Core icon folders under `icons/equipment/` and the kind each one implies. */
export const ICON_FOLDERS = Object.freeze({
  head: "head",
  neck: "neck",
  back: "back",
  shoulder: "back",
  chest: "body",
  body: "body",
  hand: "hands",
  wrist: "wrists",
  waist: "waist",
  feet: "feet",
  leg: "feet",
  finger: "ring",
  shield: "offHand"
});

/** Weapon subtypes that never fit in a hand slot. */
const UNWIELDABLE_WEAPONS = Object.freeze(["siege"]);

/**
 * @typedef {object} Classification
 * @property {string} kind    A key of SLOT_KINDS.
 * @property {"flag"|"type"|"name"|"icon"|"fallback"} source  Which rule decided it.
 */

/**
 * Decide the slot kind an item naturally belongs in.
 * @param {import("./item-facts.mjs").ItemFacts} facts
 * @returns {Classification|null}  Null when the item cannot be slotted at all.
 */
export function classify(facts) {
  if ( !facts?.slottable ) return null;

  if ( facts.slotOverride && (facts.slotOverride in SLOT_KINDS) ) {
    return { kind: facts.slotOverride, source: "flag" };
  }

  // What the system itself knows.
  if ( facts.type === "weapon" ) {
    if ( UNWIELDABLE_WEAPONS.includes(facts.subtype) ) return null;
    return { kind: "mainHand", source: "type" };
  }
  if ( facts.type === "equipment" ) {
    if ( facts.subtype === "shield" ) return { kind: "offHand", source: "type" };
    if ( ARMOR_SUBTYPES.includes(facts.subtype) ) return { kind: "body", source: "type" };
    if ( facts.subtype === "ring" ) return { kind: "ring", source: "type" };
  }

  const byName = kindFromName(facts.name);
  if ( byName ) return { kind: byName, source: "name" };

  const byIcon = kindFromIcon(facts.img);
  if ( byIcon ) return { kind: byIcon, source: "icon" };

  if ( ["rod", "wand"].includes(facts.subtype) ) return { kind: "mainHand", source: "fallback" };
  if ( facts.subtype === "clothing" ) return { kind: "body", source: "fallback" };
  return { kind: "trinket", source: "fallback" };
}

/**
 * The kind named by an item's head noun. "X of Y" names are read on the X first — "Gloves of the
 * Ring" is gloves — and only if that says nothing is the whole name tried.
 * @param {string} name
 * @returns {string|null}
 */
export function kindFromName(name) {
  const text = String(name ?? "");
  if ( !text ) return null;
  const head = text.split(/\s+of\s+/i)[0];
  for ( const candidate of head === text ? [text] : [head, text] ) {
    // Earliest match wins across all rules, so "Cloak and Boots" is a cloak rather than whichever
    // rule happens to be listed first.
    let best = null;
    for ( const [kind, pattern] of NAME_RULES ) {
      const match = pattern.exec(candidate);
      if ( match && ((best === null) || (match.index < best.index)) ) best = { kind, index: match.index };
    }
    if ( best ) return best.kind;
  }
  return null;
}

/**
 * The kind implied by a core `icons/equipment/<folder>/…` path.
 * @param {string} img
 * @returns {string|null}
 */
export function kindFromIcon(img) {
  const match = /(?:^|\/)icons\/equipment\/([a-z]+)\//i.exec(String(img ?? ""));
  return match ? (ICON_FOLDERS[match[1].toLowerCase()] ?? null) : null;
}

/** Whether an item is worn rather than wielded or strapped on as armour. */
export function isWearable(facts) {
  if ( facts.type === "equipment" ) return WEARABLE_SUBTYPES.includes(facts.subtype) || !facts.subtype;
  if ( facts.type === "consumable" ) return ["trinket", "wondrous"].includes(facts.subtype);
  return false;
}

/** Whether an item is something held in a hand that is not a weapon: a rod, wand, orb or crystal. */
export function isHeldImplement(facts) {
  if ( !["equipment", "consumable"].includes(facts.type) ) return false;
  return ["rod", "wand", "trinket"].includes(facts.subtype);
}

/**
 * Whether a slot kind may hold an item.
 *
 * Two modes, set by the `strictSlots` world setting:
 *
 * - **Lenient** (default). Mechanics are enforced — armour on the body, shields and one-handed
 *   weapons in a hand, rings on fingers — but any worn accessory fits any accessory slot. The
 *   classifier's guess only decides where an item *lands by default*; a player who disagrees can
 *   drag it anywhere sensible. This matters for homebrew named in ways no rule anticipates.
 * - **Strict**. An accessory must go in the slot the classifier chose (trinket slots still take
 *   any accessory: they are the catch-all).
 *
 * @param {string} kind
 * @param {import("./item-facts.mjs").ItemFacts} facts
 * @param {object} [options]
 * @param {boolean} [options.strict=false]
 * @returns {{ok: true}|{ok: false, reason: string}}  `reason` is a key under `reject.` in lang.
 */
export function accepts(kind, facts, { strict = false } = {}) {
  const natural = classify(facts);
  if ( !natural ) return { ok: false, reason: "notSlottable" };
  if ( !(kind in SLOT_KINDS) ) return { ok: false, reason: "wrongSlot" };

  const refuse = { ok: false, reason: "wrongSlot" };
  const allow = { ok: true };
  // A kind pinned by flag is a deliberate decision; honour it in both modes.
  if ( natural.source === "flag" ) return natural.kind === kind ? allow : refuse;

  const isWeapon = facts.type === "weapon";
  const isShield = (facts.type === "equipment") && (facts.subtype === "shield");
  const isArmor = (facts.type === "equipment") && ARMOR_SUBTYPES.includes(facts.subtype);

  switch ( kind ) {
    case "mainHand":
      if ( isWeapon ) return allow;
      if ( natural.kind === "mainHand" ) return allow;
      return (!strict && isHeldImplement(facts)) ? allow : refuse;

    case "offHand":
      if ( isWeapon ) return facts.twoHanded ? { ok: false, reason: "twoHandedOffHand" } : allow;
      if ( isShield ) return allow;
      if ( natural.kind === "mainHand" ) return allow;
      return (!strict && isHeldImplement(facts)) ? allow : refuse;

    case "body":
      if ( isArmor ) return allow;
      if ( natural.kind === "body" ) return allow;
      return (!strict && (facts.subtype === "clothing")) ? allow : refuse;

    case "ring":
      if ( natural.kind === "ring" ) return allow;
      return (!strict && (facts.subtype === "ring")) ? allow : refuse;

    case "trinket":
      return (isWearable(facts) && !isArmor && !isShield) ? allow : refuse;

    default:
      // head, neck, back, hands, wrists, waist, feet — the accessory slots.
      if ( natural.kind === kind ) return allow;
      if ( strict ) return refuse;
      return (isWearable(facts) && !["ring", "rod", "wand"].includes(facts.subtype)) ? allow : refuse;
  }
}
