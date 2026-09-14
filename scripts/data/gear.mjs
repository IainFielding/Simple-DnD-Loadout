/**
 * What the loadout says about a piece of gear beyond where it goes: whether this character can use it
 * properly, how many charges or how many of it are left, and how it compares with what it would
 * replace.
 *
 * dnd5e has already worked out every number here (proficiency, prepared armour class, damage labels,
 * remaining uses). These functions only decide which of them to show and how they compare, and they
 * return lang keys rather than text so they stay testable under plain Node.
 *
 * Pure: takes {@link ItemFacts}, never a document.
 */

/**
 * @typedef {object} Note
 * @property {string} key    A key under `gear.` in lang.
 * @property {object} [data] Interpolation data.
 */

/**
 * Problems with wearing or wielding an item. dnd5e allows all of them, so they warn and never refuse.
 * @param {import("./item-facts.mjs").ItemFacts} facts
 * @param {object} [actor]
 * @param {number} [actor.strength]  The character's Strength score.
 * @returns {Note[]}
 */
export function gearWarnings(facts, { strength } = {}) {
  const warnings = [];
  if ( facts?.proficient === 0 ) {
    warnings.push({ key: facts.type === "weapon" ? "notProficientWeapon" : "notProficientArmor" });
  }
  if ( facts?.strength && Number.isFinite(strength) && (strength < facts.strength) ) {
    warnings.push({ key: "strength", data: { score: facts.strength } });
  }
  return warnings;
}

/**
 * The small number in a slot's corner: charges left, or how many of the item there are.
 * @param {import("./item-facts.mjs").ItemFacts} facts
 * @returns {{kind: "uses", value: number, max: number}|{kind: "quantity", value: number}|null}
 */
export function gearCounter(facts) {
  if ( facts?.uses ) return { kind: "uses", value: facts.uses.value, max: facts.uses.max };
  if ( facts?.quantity > 1 ) return { kind: "quantity", value: facts.quantity };
  return null;
}

/**
 * @typedef {Note & {category: "armor"|"shield"|"weapon", effective: number|null}} Stat
 * `effective` is the number compared between items of the same category: the armour class this
 * character would have from it, or a shield's bonus. Null for weapons, whose dice don't subtract.
 */

/**
 * The one line of numbers that matters for choosing an item.
 * @param {import("./item-facts.mjs").ItemFacts} facts
 * @param {object} [options]
 * @param {number} [options.dexMod=0]       The character's Dexterity modifier.
 * @param {boolean} [options.concealed=false]  Unidentified, seen by a player: leave out magic bonuses.
 * @returns {Stat|null}
 */
export function gearStat(facts, { dexMod = 0, concealed = false } = {}) {
  if ( facts?.armor ) {
    const ac = concealed ? facts.armor.base : facts.armor.value;
    if ( facts.subtype === "shield" ) return { category: "shield", key: "shield", data: { ac }, effective: ac };
    // As dnd5e's own armour class calculation: heavy armour ignores Dexterity, the rest cap it.
    const heavy = facts.subtype === "heavy";
    const cap = facts.armor.dex;
    const dex = heavy ? 0 : Math.min(Number(dexMod) || 0, cap ?? Infinity);
    const effective = ac + dex;
    if ( heavy || (cap === 0) ) return { category: "armor", key: "armor", data: { ac }, effective };
    if ( cap === null ) return { category: "armor", key: "armorDex", data: { ac }, effective };
    return { category: "armor", key: "armorDexMax", data: { ac, max: cap }, effective };
  }
  if ( facts?.damage ) {
    const { formula, types, versatile } = facts.damage;
    const key = versatile ? "damageVersatile" : "damage";
    return { category: "weapon", key, data: { formula, types, versatile }, effective: null };
  }
  return null;
}

/**
 * How much better or worse a candidate is than the item it would replace, where that is a single
 * number: armour class against armour class, shield against shield.
 * @param {Stat|null} candidate
 * @param {Stat|null} occupant
 * @returns {number|null}  Null when there is nothing meaningful to compare.
 */
export function gearDelta(candidate, occupant) {
  if ( !candidate || !occupant || (candidate.category !== occupant.category) ) return null;
  if ( !Number.isFinite(candidate.effective) || !Number.isFinite(occupant.effective) ) return null;
  return candidate.effective - occupant.effective;
}
