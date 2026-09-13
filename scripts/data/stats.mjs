/**
 * The little readouts under the doll: armour class, attunement, and how loaded down the
 * character is. dnd5e computes all three already; these only shape its numbers for display.
 */

/**
 * Attunement as pips — one per allowed attunement, filled for each in use, with any over the
 * limit drawn as warning pips rather than silently dropped.
 * @param {number} used
 * @param {number} max
 * @returns {{used: number, max: number, over: boolean, pips: {filled: boolean, over: boolean}[]}}
 */
export function attunementPips(used, max) {
  const u = Math.max(0, Math.floor(Number(used) || 0));
  const m = Math.max(0, Math.floor(Number(max) || 0));
  const pips = [];
  for ( let i = 0; i < Math.max(u, m); i++ ) pips.push({ filled: i < u, over: i >= m });
  return { used: u, max: m, over: u > m, pips };
}

/**
 * Encumbrance as a bar. dnd5e already exposes `pct`; this adds a band so the bar can change
 * colour at the system's own thresholds rather than at numbers we invent.
 * @param {object} [enc]  `actor.system.attributes.encumbrance`.
 * @returns {{value: number, max: number, pct: number, band: "light"|"encumbered"|"heavy"|"over"}|null}
 */
export function encumbranceBar(enc) {
  if ( !enc || !Number.isFinite(enc.max) || (enc.max <= 0) ) return null;
  const value = Number(enc.value) || 0;
  const pct = Math.min(100, Math.max(0, Number.isFinite(enc.pct) ? enc.pct : (value * 100) / enc.max));
  const thresholds = enc.thresholds ?? {};
  let band = "light";
  if ( value > enc.max ) band = "over";
  else if ( Number.isFinite(thresholds.heavilyEncumbered) && (value > thresholds.heavilyEncumbered) ) band = "heavy";
  else if ( Number.isFinite(thresholds.encumbered) && (value > thresholds.encumbered) ) band = "encumbered";
  return { value, max: enc.max, pct, band };
}

/** CSS-safe rarity token: `"veryRare"` → `"veryrare"`, unknown → `""`. */
export function rarityClass(rarity) {
  const key = String(rarity ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return ["common", "uncommon", "rare", "veryrare", "legendary", "artifact"].includes(key) ? key : "";
}
