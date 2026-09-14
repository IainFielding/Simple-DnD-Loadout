/**
 * Configuration for the end-to-end harness — **copy this to `config.mjs` and edit the paths**.
 *
 * The harness drives a *real* Foundry install, so the paths below are specific to the machine it
 * runs on. `config.mjs` is gitignored for that reason; this file is the tracked template.
 */

/** Where Foundry Virtual Tabletop itself is installed (the dir holding `main.mjs`). */
export const FOUNDRY_ROOT = "C:/FoundryVTT";

/** Foundry's user data root (the dir holding `Data/`, `Config/`, `Logs/`). */
export const DATA_PATH = "C:/Users/<you>/AppData/Local/FoundryVTT";

/** Foundry's `Data/` dir, where worlds/modules/systems live. */
export const DATA_DIR = `${DATA_PATH}/Data`;

/**
 * Port for the harness's own Foundry instance. Deliberately none of 30000 (a Foundry you already
 * have running), 30099 (the Character Creator's harness) or 30098 (the Magic Shop's). Foundry's
 * data-directory lock still means only one of them can run at a time.
 */
export const PORT = 30097;

export const BASE_URL = `http://127.0.0.1:${PORT}`;

/** The module under test, junction-linked into `Data/modules` by `npm run link-module`. */
export const MODULE_ID = "sogrom-simple-dnd5e-loadout";

/** The repo root, i.e. the junction target. */
export const MODULE_SOURCE = "H:/Code/FoundryModules/Simple-DnD-Loadout";

/** The system the test worlds run, and the version this harness was written against. */
export const SYSTEM = "dnd5e";
export const SYSTEM_VERSION = "6.0.1";
export const CORE_VERSION = "14.367";

/**
 * The test worlds. `id` doubles as the directory name under `Data/worlds`.
 *
 * `loadout`        the module alone on dnd5e. Every fixture item is hand-built by provisioning,
 *                    so no content pack is needed and nothing depends on a pack's version.
 * `loadout-ember`  the same plus Ember, for the skin: the class, the borrowed art actually
 *                    loading, and Ember's creation sheet never getting a dock.
 * `loadout-tidy`   the same plus Tidy 5e Sheet: the dock beside a third-party character sheet.
 *                    Green with Tidy 14.1.0 (2026-09-14). Tidy 13.x declared dnd5e ≤ 5.3.x and
 *                    would not activate on 6.x.
 */
export const WORLDS = {
  loadout: {
    id: "loadout",
    title: "Loadout",
    description: "<p>Automated harness for the Simple D&amp;D Loadout. Characters named "
      + "[e2e] are rebuilt every run.</p>",
    modules: [MODULE_ID],
    ember: false
  },
  "loadout-ember": {
    id: "loadout-ember",
    title: "Loadout (Ember)",
    description: "<p>The Loadout harness with Ember enabled, for the Ember skin.</p>",
    modules: [MODULE_ID, "ember"],
    ember: true
  },
  "loadout-tidy": {
    id: "loadout-tidy",
    title: "Loadout (Tidy 5e)",
    description: "<p>The Loadout harness with Tidy 5e Sheet enabled, for the docked loadout beside "
      + "a sheet this module knows nothing about.</p>",
    modules: [MODULE_ID, "tidy5e-sheet"],
    tidy: true
  }
};

/** The Gamemaster Foundry auto-creates on a world with none. */
export const GM_USER = "Gamemaster";

/**
 * One player, who owns the hero and can only observe the stranger — enough to prove the loadout is
 * read-only where the sheet is, and writable where it is not.
 */
export const PLAYERS = [
  { name: "Player One", owns: "[e2e] Loadout Hero", observes: "[e2e] Stranger" }
];

/** Set true to watch the browser drive Foundry. `HEADED=1 npm test` also flips it. */
export const HEADED = process.env.HEADED === "1";

export const SERVER_TIMEOUT_MS = 120_000;
export const WORLD_READY_TIMEOUT_MS = 90_000;
