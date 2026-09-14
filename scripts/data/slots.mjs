/**
 * The paper doll's slots: what kinds exist, how many of each, and where they are drawn.
 *
 * A slot *kind* ("ring") is a category of body location. A slot *instance* ("ring-2") is one
 * concrete place an item can sit, with a stable key that is what gets stored on the actor. Kinds
 * with a single instance use the bare kind as their key, so the common case reads naturally in
 * stored flags: `{head: "abc", "ring-1": "def", "ring-2": null}`.
 *
 * Keys never contain a dot. Foundry expands dotted flag keys into nested objects on write, which
 * would turn `ring.1` into `{ring: {1: …}}` and quietly break every lookup.
 *
 * No Foundry globals here — the unit tests import this file under plain Node.
 */

import { DEFAULTS, SETTINGS, clampInt } from "../config.mjs";

/** Most rings, trinkets and ranged slots a GM can configure. Past this the doll stops fitting its panel. */
export const MAX_RINGS = 4;
// Five trinkets plus light, instrument and tools make eight on one bar, which is what still fits
// the docked window's width on a single line.
export const MAX_TRINKETS = 5;
export const MAX_RANGED = 2;

/**
 * Every slot kind, in draw order within its group.
 *
 * `group` picks the column of the doll the slot is drawn in. `placeholder` is a core Foundry icon
 * (shipped with every install under `icons/`) shown faded while the slot is empty, so a player
 * can tell a glove slot from a boot slot at a glance without reading a label. `optional` kinds
 * can be switched off by the GM; the four that carry the game's mechanics — body armour, both
 * hands and rings — cannot, because hiding them would hide AC and attunement-relevant gear.
 */
export const SLOT_KINDS = Object.freeze({
  head: { group: "left", optional: true, placeholder: "icons/equipment/head/helm-barbute-engraved-steel.webp" },
  neck: { group: "left", optional: true, placeholder: "icons/equipment/neck/pendant-rough-red.webp" },
  back: { group: "left", optional: true, placeholder: "icons/equipment/back/cape-layered-red.webp" },
  body: { group: "left", optional: false, placeholder: "icons/equipment/chest/breastplate-layered-steel.webp" },
  wrists: { group: "left", optional: true, placeholder: "icons/equipment/wrist/bracer-banded-leather.webp" },
  hands: { group: "right", optional: true, placeholder: "icons/equipment/hand/glove-frayed-cloth-grey.webp" },
  waist: { group: "right", optional: true, placeholder: "icons/equipment/waist/belt-buckle-square-leather-brown.webp" },
  feet: { group: "right", optional: true, placeholder: "icons/equipment/feet/boots-armored-layered-steel.webp" },
  ring: { group: "right", optional: false, placeholder: "icons/equipment/finger/ring-band-gold.webp" },
  // Ranged weapons slung and ready, drawn to the right of the hands. A bow here is carried, not
  // gripped, so a two-handed one does not block the off hand. The count (0–2) is a setting.
  ranged: { group: "hands", optional: true, placeholder: "icons/weapons/bows/shortbow-recurve-bone.webp" },
  mainHand: { group: "hands", optional: false, placeholder: "icons/weapons/swords/shortsword-winged.webp" },
  offHand: { group: "hands", optional: false, placeholder: "icons/equipment/shield/heater-steel-worn.webp" },
  // Kit: the things a character works with rather than wears. Drawn on the trinket bar, ahead of
  // the trinkets, at trinket size.
  light: { group: "kit", optional: true, placeholder: "icons/sundries/lights/torch-brown-lit.webp" },
  instrument: { group: "kit", optional: true, placeholder: "icons/tools/instruments/lute-gold-brown.webp" },
  tools: { group: "kit", optional: true, placeholder: "icons/tools/smithing/hammer-sledge-steel-grey.webp" },
  trinket: { group: "trinkets", optional: true, placeholder: "icons/commodities/gems/gem-rough-ball-purple.webp" },
  // Camp clothes, as in Baldur's Gate 3: packed for downtime rather than worn, so placing an item
  // here unequips it. Switched on and off together by the `camp` flag of the layout, not one by
  // one, which is why they are not `optional` in the per-slot sense.
  campOutfit: { group: "camp", optional: false, camp: true, placeholder: "icons/equipment/chest/robe-collared-blue.webp" },
  campUnderwear: { group: "camp", optional: false, camp: true, placeholder: "icons/equipment/leg/cuisses-cloth-black.webp" },
  campFootwear: { group: "camp", optional: false, camp: true, placeholder: "icons/equipment/feet/shoes-leather-simple-brown.webp" }
});

/** The camp-clothes kinds, shown only when the GM turns camp clothes on. */
export const CAMP_KINDS = Object.freeze(Object.keys(SLOT_KINDS).filter(k => SLOT_KINDS[k].camp));

/**
 * Whether a slot is a camp slot. Camp slots hold items that are *not* equipped; every other slot
 * holds items that are.
 * @param {{kind: string}} slot
 * @returns {boolean}
 */
export function isCampSlot(slot) {
  return !!SLOT_KINDS[slot?.kind]?.camp;
}

/** Kinds whose instance count is a setting rather than a checkbox; zero turns them off. */
export const COUNTED_KINDS = Object.freeze(["ring", "trinket", "ranged"]);

/** Optional kinds governed by a checkbox in the slot settings. */
export const TOGGLED_KINDS = Object.freeze(Object.keys(SLOT_KINDS).filter(
  k => SLOT_KINDS[k].optional && !COUNTED_KINDS.includes(k)
));

/** Kinds a GM may switch off. */
export const OPTIONAL_KINDS = Object.freeze(Object.keys(SLOT_KINDS).filter(k => SLOT_KINDS[k].optional));

/** The groups the template lays out, in DOM order. */
export const SLOT_GROUPS = Object.freeze(["left", "right", "hands", "kit", "trinkets", "camp"]);

/**
 * Normalise a stored layout setting. Anything malformed falls back to the default for that
 * field rather than failing the whole doll: a world setting written by an older version, or
 * edited by hand, must never leave a character sheet unable to render.
 * @param {object} [raw]
 * @returns {{rings: number, trinkets: number, ranged: number, camp: boolean, disabled: string[]}}
 */
export function normaliseLayout(raw) {
  const fallback = DEFAULTS[SETTINGS.slotLayout];
  const source = (raw && (typeof raw === "object")) ? raw : {};
  const disabled = Array.isArray(source.disabled)
    ? [...new Set(source.disabled.filter(k => OPTIONAL_KINDS.includes(k)))]
    : [...fallback.disabled];
  const trinkets = clampInt(source.trinkets ?? fallback.trinkets, 0, MAX_TRINKETS);
  // A layout saved before ranged slots existed has no count; it gets the default rather than none.
  const ranged = clampInt(source.ranged ?? fallback.ranged, 0, MAX_RANGED);
  // A count of zero is the same as disabling the kind; keep the two in agreement so the settings
  // form shows what the doll does.
  if ( (trinkets === 0) && !disabled.includes("trinket") ) disabled.push("trinket");
  if ( (ranged === 0) && !disabled.includes("ranged") ) disabled.push("ranged");
  return {
    rings: clampInt(source.rings ?? fallback.rings, 1, MAX_RINGS),
    trinkets,
    ranged,
    // Off unless explicitly on: camp clothes are an opt-in for tables that want them.
    camp: source.camp === true,
    disabled
  };
}

/**
 * Turn the GM slot form's data into a layout. Unticked checkboxes are absent from form data, so
 * "enabled" arrives as the set of ticked kinds and every other optional kind is disabled. Trinkets
 * and ranged slots are governed by their counts rather than a checkbox.
 * @param {{rings?: *, trinkets?: *, ranged?: *, camp?: *, enabled?: Record<string, boolean>}} data  Expanded form data.
 * @returns {{rings: number, trinkets: number, ranged: number, camp: boolean, disabled: string[]}}
 */
export function layoutFromForm(data = {}) {
  const enabled = data.enabled ?? {};
  return normaliseLayout({
    rings: data.rings,
    trinkets: data.trinkets,
    ranged: data.ranged,
    camp: data.camp === true,
    disabled: TOGGLED_KINDS.filter(kind => !enabled[kind])
  });
}

/**
 * The slot key for the nth (1-based) instance of a kind.
 * @param {string} kind
 * @param {number} index  1-based.
 * @param {number} count  How many instances the kind has.
 * @returns {string}
 */
export function slotKey(kind, index, count) {
  return count > 1 ? `${kind}-${index}` : kind;
}

/**
 * The kind a slot key belongs to: `"ring-2"` → `"ring"`, `"head"` → `"head"`.
 * @param {string} key
 * @returns {string|null}  Null for a key that names no known kind.
 */
export function kindOfKey(key) {
  const kind = String(key ?? "").replace(/-\d+$/, "");
  return kind in SLOT_KINDS ? kind : null;
}

/**
 * @typedef {object} SlotInstance
 * @property {string} key          Stable storage key, e.g. `"ring-2"`.
 * @property {string} kind         A key of {@link SLOT_KINDS}.
 * @property {number} index        1-based position among its kind.
 * @property {string} group        Layout column.
 * @property {string} placeholder  Faded icon shown while empty.
 */

/**
 * Expand a layout setting into the ordered list of slot instances the doll draws.
 * @param {object} [layout]  The `slotLayout` setting; normalised here.
 * @returns {SlotInstance[]}
 */
export function buildSlots(layout) {
  const { rings, trinkets, ranged, camp, disabled } = normaliseLayout(layout);
  const counts = { ring: rings, trinket: trinkets, ranged };
  const slots = [];
  for ( const [kind, def] of Object.entries(SLOT_KINDS) ) {
    if ( disabled.includes(kind) ) continue;
    if ( def.camp && !camp ) continue;
    const count = counts[kind] ?? 1;
    for ( let i = 1; i <= count; i++ ) {
      slots.push({ key: slotKey(kind, i, count), kind, index: i, group: def.group, placeholder: def.placeholder });
    }
  }
  return orderHands(slots);
}

/**
 * Order the hands row: the weapons in hand on the left, the slung ranged weapons on the right —
 * `mainHand, offHand, ranged-1, ranged-2`. Done in the data rather than with CSS `order` so
 * keyboard focus moves through the row in the order it is drawn.
 * @param {SlotInstance[]} slots
 * @returns {SlotInstance[]}
 */
function orderHands(slots) {
  const hands = slots.filter(s => s.group === "hands");
  const rank = s => {
    if ( s.kind === "mainHand" ) return 0;
    if ( s.kind === "offHand" ) return 1;
    return 1 + s.index;
  };
  const ordered = [...hands].sort((a, b) => rank(a) - rank(b));
  let i = 0;
  return slots.map(s => (s.group === "hands" ? ordered[i++] : s));
}
