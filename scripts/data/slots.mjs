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

/** Most rings and trinkets a GM can configure. Past this the doll stops fitting its panel. */
export const MAX_RINGS = 4;
export const MAX_TRINKETS = 8;

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
  mainHand: { group: "hands", optional: false, placeholder: "icons/weapons/swords/shortsword-winged.webp" },
  offHand: { group: "hands", optional: false, placeholder: "icons/equipment/shield/heater-steel-worn.webp" },
  trinket: { group: "trinkets", optional: true, placeholder: "icons/commodities/gems/gem-rough-ball-purple.webp" }
});

/** Kinds a GM may switch off. */
export const OPTIONAL_KINDS = Object.freeze(Object.keys(SLOT_KINDS).filter(k => SLOT_KINDS[k].optional));

/** The four groups the template lays out, in DOM order. */
export const SLOT_GROUPS = Object.freeze(["left", "right", "hands", "trinkets"]);

/**
 * Normalise a stored layout setting. Anything malformed falls back to the default for that
 * field rather than failing the whole doll: a world setting written by an older version, or
 * edited by hand, must never leave a character sheet unable to render.
 * @param {object} [raw]
 * @returns {{rings: number, trinkets: number, disabled: string[]}}
 */
export function normaliseLayout(raw) {
  const fallback = DEFAULTS[SETTINGS.slotLayout];
  const source = (raw && (typeof raw === "object")) ? raw : {};
  const disabled = Array.isArray(source.disabled)
    ? [...new Set(source.disabled.filter(k => OPTIONAL_KINDS.includes(k)))]
    : [...fallback.disabled];
  const trinkets = clampInt(source.trinkets ?? fallback.trinkets, 0, MAX_TRINKETS);
  // Zero trinkets is the same as disabling them; keep the two in agreement so the settings form
  // shows what the doll does.
  if ( (trinkets === 0) && !disabled.includes("trinket") ) disabled.push("trinket");
  return {
    rings: clampInt(source.rings ?? fallback.rings, 1, MAX_RINGS),
    trinkets,
    disabled
  };
}

/**
 * Turn the GM slot form's data into a layout. Unticked checkboxes are absent from form data, so
 * "enabled" arrives as the set of ticked kinds and every other optional kind is disabled. Trinkets
 * are governed by their count rather than a checkbox.
 * @param {{rings?: *, trinkets?: *, enabled?: Record<string, boolean>}} data  Expanded form data.
 * @returns {{rings: number, trinkets: number, disabled: string[]}}
 */
export function layoutFromForm(data = {}) {
  const enabled = data.enabled ?? {};
  return normaliseLayout({
    rings: data.rings,
    trinkets: data.trinkets,
    disabled: OPTIONAL_KINDS.filter(kind => (kind !== "trinket") && !enabled[kind])
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
  const { rings, trinkets, disabled } = normaliseLayout(layout);
  const counts = { ring: rings, trinket: trinkets };
  const slots = [];
  for ( const [kind, def] of Object.entries(SLOT_KINDS) ) {
    if ( disabled.includes(kind) ) continue;
    const count = counts[kind] ?? 1;
    for ( let i = 1; i <= count; i++ ) {
      slots.push({ key: slotKey(kind, i, count), kind, index: i, group: def.group, placeholder: def.placeholder });
    }
  }
  return slots;
}
