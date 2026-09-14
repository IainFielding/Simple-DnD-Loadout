/**
 * Entry point — module.json points Foundry here.
 *
 *   init   settings, templates, the public API, the dnd5e sheet tab, the keybinding
 *   ready  the `simpleLoadout.ready` hook, once everything above is live
 *
 * plus the always-on hooks that put the dock button in character sheet headers and, for users who
 * asked for it, open the dock along with the sheet.
 */

import {
  DEFAULTS, DOCK_SIDES, FOREIGN_DROP_MODES, HOOKS, MODULE_ID, SETTINGS, fireHook, log, setting, t, tpl
} from "./config.mjs";
import { registerApi } from "./api.mjs";
import { SlotConfigApp } from "./app/slot-config.mjs";
import { LoadoutDock, canDock } from "./sheet/dock.mjs";
import { installSheetTab } from "./sheet/tab.mjs";

/** Whether this world runs the system the module is written for. */
const isDnd5e = () => game.system?.id === "dnd5e";

Hooks.once("init", () => {
  registerSettings();
  registerApi();

  if ( !isDnd5e() ) {
    console.error(`${MODULE_ID} | requires the dnd5e game system; the loadout is disabled.`);
    return;
  }

  // The loadout and its slot are partials, shared by the sheet tab and the dock; the picker is
  // rendered on demand but preloaded so the first click does not wait on a fetch.
  foundry.applications.handlebars.loadTemplates({
    "sogrom-lo-loadout": tpl("loadout.hbs"),
    "sogrom-lo-slot": tpl("parts/slot.hbs"),
    "sogrom-lo-picker": tpl("parts/picker.hbs")
  });

  if ( setting(SETTINGS.sheetTab) ) installSheetTab();
  registerKeybindings();
});

Hooks.once("ready", () => {
  if ( !isDnd5e() ) return;
  const module = game.modules.get(MODULE_ID);
  fireHook(HOOKS.ready, { api: module?.api ?? null, version: module?.version ?? "" });
});

/* -------------------------------------------- */
/*  Sheet header button and auto-dock           */
/* -------------------------------------------- */

// `getHeaderControlsActorSheetV2` fires for every actor sheet built on ActorSheetV2 — dnd5e's own,
// Tidy 5e's, anyone's — which is what lets the dock work beside sheets we know nothing about.
Hooks.on("getHeaderControlsActorSheetV2", (sheet, controls) => {
  if ( !isDnd5e() || !setting(SETTINGS.dockButton) || !canDock(sheet) ) return;
  if ( controls.some(c => c.action === "sogromLoadout") ) return;
  controls.push({
    action: "sogromLoadout",
    icon: "fa-solid fa-person",
    label: `${MODULE_ID}.dock.toggle`,
    onClick: () => LoadoutDock.toggle(sheet)
  });
});

Hooks.on("renderActorSheetV2", (sheet, _element, _context, options) => {
  if ( !options?.isFirstRender || !isDnd5e() || !setting(SETTINGS.autoDock) || !canDock(sheet) ) return;
  // Next frame: the sheet has its final position once its own first render settles.
  requestAnimationFrame(() => LoadoutDock.open(sheet));
});

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.sheetTab, {
    name: t("settings.sheetTab.name"),
    hint: t("settings.sheetTab.hint"),
    scope: "world", config: true, type: Boolean, default: DEFAULTS[SETTINGS.sheetTab],
    // The tab is added to the sheet *class* at init; a live change cannot add or remove it from
    // sheets already constructed.
    requiresReload: true
  });
  game.settings.register(MODULE_ID, SETTINGS.dockButton, {
    name: t("settings.dockButton.name"),
    hint: t("settings.dockButton.hint"),
    scope: "world", config: true, type: Boolean, default: DEFAULTS[SETTINGS.dockButton]
  });
  game.settings.register(MODULE_ID, SETTINGS.dockSide, {
    name: t("settings.dockSide.name"),
    hint: t("settings.dockSide.hint"),
    scope: "client", config: true, type: String, default: DEFAULTS[SETTINGS.dockSide],
    choices: Object.fromEntries(DOCK_SIDES.map(side => [side, t(`settings.dockSide.${side}`)])),
    onChange: () => eachDock(dock => dock.follow())
  });
  game.settings.register(MODULE_ID, SETTINGS.autoDock, {
    name: t("settings.autoDock.name"),
    hint: t("settings.autoDock.hint"),
    scope: "client", config: true, type: Boolean, default: DEFAULTS[SETTINGS.autoDock]
  });
  game.settings.register(MODULE_ID, SETTINGS.strictSlots, {
    name: t("settings.strictSlots.name"),
    hint: t("settings.strictSlots.hint"),
    scope: "world", config: true, type: Boolean, default: DEFAULTS[SETTINGS.strictSlots],
    onChange: rerenderLoadouts
  });
  game.settings.register(MODULE_ID, SETTINGS.foreignDrops, {
    name: t("settings.foreignDrops.name"),
    hint: t("settings.foreignDrops.hint"),
    scope: "world", config: true, type: String, default: DEFAULTS[SETTINGS.foreignDrops],
    choices: Object.fromEntries(FOREIGN_DROP_MODES.map(mode => [mode, t(`settings.foreignDrops.${mode}`)]))
  });
  game.settings.register(MODULE_ID, SETTINGS.slotLayout, {
    scope: "world", config: false, type: Object,
    default: foundry.utils.deepClone(DEFAULTS[SETTINGS.slotLayout]),
    onChange: rerenderLoadouts
  });
  game.settings.registerMenu(MODULE_ID, "slotLayoutMenu", {
    name: t("settings.slotLayoutMenu.name"),
    label: t("settings.slotLayoutMenu.label"),
    hint: t("settings.slotLayoutMenu.hint"),
    icon: "fa-solid fa-person",
    type: SlotConfigApp,
    restricted: true
  });
  game.settings.register(MODULE_ID, SETTINGS.debug, {
    name: t("settings.debugLogging.name"),
    hint: t("settings.debugLogging.hint"),
    scope: "client", config: true, type: Boolean, default: DEFAULTS[SETTINGS.debug]
  });
}

function registerKeybindings() {
  game.keybindings.register(MODULE_ID, "toggleDock", {
    name: `${MODULE_ID}.keybindings.toggleDock.name`,
    hint: `${MODULE_ID}.keybindings.toggleDock.hint`,
    editable: [{ key: "KeyP", modifiers: ["Shift"] }],
    restricted: false,
    onDown: () => {
      const actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character;
      if ( !actor || (actor.type !== "character") ) return false;
      toggleDockFor(actor);
      return true;
    }
  });
}

/** Open the actor's sheet if needed, then toggle its dock. */
async function toggleDockFor(actor) {
  const sheet = actor.sheet;
  // Decide before rendering: an Ember character mid-creation has Ember's fullscreen creation sheet,
  // and opening that just to find it cannot be docked to would be a surprise.
  if ( !canDock(sheet) ) return;
  if ( !sheet.rendered ) await sheet.render({ force: true });
  await LoadoutDock.toggle(sheet);
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

function eachDock(fn) {
  for ( const app of foundry.applications.instances.values() ) if ( app instanceof LoadoutDock ) fn(app);
}

/** Re-render everything that draws a loadout, after a setting that changes what loadouts show. */
function rerenderLoadouts() {
  log("settings changed; re-rendering loadouts");
  for ( const app of foundry.applications.instances.values() ) {
    const isCharacterSheet = (app.document instanceof Actor) && (app.document.type === "character");
    if ( (app instanceof LoadoutDock) || isCharacterSheet ) app.render();
  }
}
