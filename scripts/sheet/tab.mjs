/**
 * The Loadout tab on dnd5e's own character sheet.
 *
 * Three pieces, all through extension points dnd5e provides:
 *
 * 1. `injectTab` adds a TABS entry and a PARTS entry to `CharacterActorSheet` at init.
 * 2. `dnd5e.prepareSheetContext` — the hook dnd5e fires while preparing each part — supplies our
 *    part's context, so the tab renders with the rest of the sheet.
 * 3. `renderCharacterActorSheet` binds the freshly rendered loadout after each render.
 *
 * Only the system's character sheet gets the tab. Other character sheets (Tidy 5e and friends)
 * still get the docked loadout through the header button, which works with any framed sheet.
 */

import { MODULE_ID, log, tpl } from "../config.mjs";
import { buildLoadoutContext } from "../loadout/context.mjs";
import { bindLoadout } from "../loadout/controller.mjs";
import { PortraitConfig } from "../app/portrait-config.mjs";
import { injectTab } from "./tab-inject.mjs";

/** The tab's id, on the sheet and in `sheet.changeTab`. */
export const TAB_ID = "sogromLoadout";

/**
 * Install the tab. Safe to call once at init; a no-op when dnd5e's sheet class is missing.
 * @returns {boolean}  Whether the tab is installed.
 */
export function installSheetTab() {
  const Sheet = globalThis.dnd5e?.applications?.actor?.CharacterActorSheet;
  if ( !Sheet ) {
    log("dnd5e CharacterActorSheet not found; no sheet tab");
    return false;
  }

  injectTab(Sheet, {
    id: TAB_ID,
    after: "inventory",
    part: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: tpl("sheet-tab.hbs"),
      scrollable: [""]
    },
    tab: { label: `${MODULE_ID}.title`, icon: "fa-solid fa-person" }
  });

  Hooks.on("dnd5e.prepareSheetContext", (sheet, partId, context) => {
    if ( partId !== TAB_ID ) return;
    context.loadout = buildLoadoutContext(sheet.document, { surface: "tab", editable: sheet.isEditable });
  });

  Hooks.on("renderCharacterActorSheet", (sheet, element) => {
    const root = element?.querySelector?.(`[data-tab="${TAB_ID}"] .sogrom-loadout`);
    if ( !root ) return;
    bindLoadout(root, {
      actor: sheet.document,
      editable: sheet.isEditable,
      onPortrait: () => new PortraitConfig({ document: sheet.document }).render({ force: true })
    });
  });

  return true;
}

/**
 * Show a character's loadout tab: switch an open sheet to it, or open the sheet on it.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function showTab(actor) {
  const sheet = actor?.sheet;
  if ( !sheet ) return;
  if ( sheet.rendered ) {
    sheet.changeTab?.(TAB_ID, "primary");
    sheet.bringToFront?.();
    return;
  }
  await sheet.render({ force: true, tab: TAB_ID });
}
