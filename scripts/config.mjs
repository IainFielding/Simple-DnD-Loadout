/**
 * Shared constants and small runtime helpers for the Paper Doll.
 *
 * Kept free of Application and DOM concerns so every layer — the pure `data/` logic, the doll
 * controller, the sheet integration — can import from here without dragging UI in with it. The
 * unit tests import this file under plain Node, which is the practical test of that rule.
 */

/** The module's id. Must match `id` in module.json; `tools/validate-package.mjs` checks it. */
export const MODULE_ID = "sogrom-simple-dnd5e-paper-doll";

/**
 * The namespace every hook this module emits is prefixed with. camelCase of the title, as the
 * sibling modules do — `sogrom` alone would be ambiguous across a dozen packages. Changing it is a
 * breaking change for every consumer.
 */
export const HOOK_PREFIX = "simplePaperDoll";

/** Hooks this module fires. See docs/API.md for payloads. */
export const HOOKS = Object.freeze({
  /** `{api, version}` — the module is initialised and its sheet integration installed. */
  ready: `${HOOK_PREFIX}.ready`,
  /** `{actor, item, slot}` — cancellable; return `false` to refuse putting an item in a slot. */
  preEquip: `${HOOK_PREFIX}.preEquip`,
  /** `{actor, item, slot}` — an item was placed in a slot and marked equipped. */
  equipped: `${HOOK_PREFIX}.equipped`,
  /** `{actor, item, slot}` — an item was taken out of a slot and marked unequipped. */
  unequipped: `${HOOK_PREFIX}.unequipped`
});

/** Keys of every setting this module registers. */
export const SETTINGS = Object.freeze({
  sheetTab: "sheetTab",
  dockButton: "dockButton",
  dockSide: "dockSide",
  autoDock: "autoDock",
  strictSlots: "strictSlots",
  foreignDrops: "foreignDrops",
  slotLayout: "slotLayout",
  debug: "debugLogging"
});

/** Where the docked window sits relative to the sheet. */
export const DOCK_SIDES = Object.freeze(["left", "right"]);

/** Who may drop an item the actor does not already own (from a compendium or the sidebar). */
export const FOREIGN_DROP_MODES = Object.freeze(["gm", "owner", "none"]);

export const DEFAULTS = Object.freeze({
  [SETTINGS.sheetTab]: true,
  [SETTINGS.dockButton]: true,
  [SETTINGS.dockSide]: "left",
  [SETTINGS.autoDock]: false,
  [SETTINGS.strictSlots]: false,
  [SETTINGS.foreignDrops]: "gm",
  [SETTINGS.slotLayout]: Object.freeze({ rings: 2, trinkets: 4, ranged: 2, disabled: Object.freeze([]) }),
  [SETTINGS.debug]: false
});

/** Actor flag keys, under `flags[MODULE_ID]`. */
export const FLAGS = Object.freeze({
  /** `{[slotKey]: itemId|null}` — which item the player put in which slot. */
  slots: "slots",
  /** Optional portrait override: `{src, fit, focus}`. */
  portrait: "portrait"
});

/* -------------------------------------------- */
/*  Environment                                 */
/* -------------------------------------------- */

/**
 * Whether the Ember module is active. Ember ships no play sheet of its own for dnd5e — only a
 * character-creation sheet — so under Ember the doll works exactly as anywhere else; it just wears
 * the `sogrom-ember` skin (styles/ember-skin.css) so it reads as part of Ember's world.
 * @returns {boolean}
 */
export function emberActive() {
  return !!game.modules?.get("ember")?.active;
}

/**
 * Read a setting, returning the default rather than throwing when it is not registered yet.
 * Reads can arrive before `init` finishes (another module calling the API early, a logger), and
 * silence plus a sane default is the right failure mode for all of them.
 * @param {string} key  A value from {@link SETTINGS}.
 * @returns {*}
 */
export function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return DEFAULTS[key];
  }
}

/* -------------------------------------------- */
/*  Small helpers                               */
/* -------------------------------------------- */

/**
 * Localise one of this module's keys: `t("slot.kind.head")`.
 * @param {string} key     Key below the module namespace in lang/en.json.
 * @param {object} [data]  Interpolation data; when given, `format` is used.
 * @returns {string}
 */
export function t(key, data) {
  const full = `${MODULE_ID}.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

/**
 * Full path of one of this module's templates.
 * @param {string} rel  Path below `templates/`, including the extension.
 * @returns {string}
 */
export function tpl(rel) {
  return `modules/${MODULE_ID}/templates/${rel}`;
}

/** Debug log, silent unless this client switched debug logging on. */
export function log(...args) {
  if ( !setting(SETTINGS.debug) ) return;
  console.log(`${MODULE_ID} |`, ...args);
}

/**
 * Clamp to an integer range, returning `min` for anything that is not a finite number — stored
 * settings and form inputs arrive as `undefined`, `null` and `"3"` as often as numbers.
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if ( !Number.isFinite(n) ) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Fire a notification-only hook. A listener in another module throwing must never take an equip
 * down with it, so failures are logged and swallowed.
 * @param {string} hook
 * @param {object} payload
 */
export function fireHook(hook, payload) {
  log(`hook ${hook}`, payload);
  try {
    Hooks.callAll(hook, payload);
  } catch ( err ) {
    log(`listener threw on ${hook}`, err);
  }
}

/**
 * Fire a cancellable hook: `false` from any listener vetoes. A *throwing* listener is not a veto —
 * silently refusing an equip because someone else's module has a bug is the worse failure.
 * @param {string} hook
 * @param {object} payload
 * @returns {boolean}  Whether the action may proceed.
 */
export function callCancellable(hook, payload) {
  log(`hook ${hook}`, payload);
  try {
    return Hooks.call(hook, payload) !== false;
  } catch ( err ) {
    log(`listener threw on ${hook}`, err);
    return true;
  }
}
