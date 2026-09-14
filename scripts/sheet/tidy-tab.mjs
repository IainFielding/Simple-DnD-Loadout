/**
 * The Loadout tab on Tidy 5e Sheet's character sheet.
 *
 * Tidy draws its tabs itself (Svelte), so dnd5e's TABS/PARTS extension in `tab.mjs` never reaches it.
 * Tidy has a supported way in instead: its API, handed over by the `tidy5e-sheet.ready` hook,
 * registers a Handlebars tab. Tidy renders our template into the tab from `getData`, re-renders it
 * with every sheet render (`renderScheme: "handlebars"`), and calls `onRender` afterwards, which is
 * where the freshly drawn loadout is bound — the same partial and controller as dnd5e's tab and the
 * dock, so all three behave alike.
 *
 * Written against Tidy 5e 14.1.0's API. Nothing here runs unless Tidy is active and says it is ready.
 */

import { log, t, tpl } from "../config.mjs";
import { buildLoadoutContext } from "../loadout/context.mjs";
import { bindLoadout } from "../loadout/controller.mjs";
import { PortraitConfig } from "../app/portrait-config.mjs";
import { TAB_ID } from "./tab.mjs";
import { TIDY_ID, sheetMode } from "./sheet-mode.mjs";

/**
 * Whether a user may change this actor's loadout: an owner, and not in a locked compendium. The same
 * test as DocumentSheetV2#isEditable, made from the actor, because Tidy's `getData` gets the sheet's
 * context rather than the sheet.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function loadoutEditable(actor) {
  if ( !actor?.isOwner ) return false;
  return !(actor.pack && game.packs?.get(actor.pack)?.locked);
}

/**
 * Listen for Tidy's API and register the tab. Safe to call at init whether or not Tidy is installed:
 * without Tidy the hook simply never fires.
 */
export function installTidyTab() {
  Hooks.once(`${TIDY_ID}.ready`, api => {
    const HandlebarsTab = api?.models?.HandlebarsTab;
    if ( !HandlebarsTab || (typeof api.registerCharacterTab !== "function") ) {
      log("Tidy 5e is active but its tab API was not found; no Tidy tab");
      return;
    }
    api.registerCharacterTab(new HandlebarsTab({
      tabId: TAB_ID,
      title: () => t("title"),
      iconClass: "fa-solid fa-person",
      path: tpl("tidy-tab.hbs"),
      renderScheme: "handlebars",
      tabContentsClasses: ["sogrom-lo-tidy-tab"],
      getData: data => {
        const actor = data?.actor ?? data?.document;
        return { loadout: buildLoadoutContext(actor, { surface: "tab", editable: loadoutEditable(actor) }) };
      },
      onRender: ({ app, tabContentsElement }) => {
        const root = tabContentsElement?.querySelector(".sogrom-loadout");
        const actor = app?.document;
        if ( !root || !actor ) return;
        bindLoadout(root, {
          actor,
          editable: loadoutEditable(actor),
          mode: () => sheetMode(app),
          onPortrait: () => new PortraitConfig({ document: actor }).render({ force: true })
        });
      }
    }));
    log(`registered the Loadout tab with ${TIDY_ID}`);
  });
}
