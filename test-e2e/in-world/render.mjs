/**
 * Fixtures for screenshots, and the Ember skin's assertions.
 *
 * Nothing here judges how the doll *looks* — that is what the screenshots are for, and a person
 * looks at them. What is asserted is everything a screenshot would hide: that the skin class is
 * applied, that each of Ember's files the skin names actually loads, and that the doll never
 * attaches to Ember's own creation sheet.
 */

import { HERO, closeAll, resetGear } from "./provision.mjs";
import { Report, gear, load, openTab, waitFor } from "./harness.mjs";

/**
 * Every Ember file styles/ember-skin.css references. Keep in step with the manifest at the top of
 * that stylesheet.
 */
export const EMBER_ASSETS = [
  "ui/elements/codex-background-dark.webp"
];

/** Dress the hero so the screenshot shows every state: rarities, attunement, a blocked hand. */
async function dressHero(mod, hero) {
  await resetGear(hero);
  const { equipToSlot, toggleAttunement } = mod.actions;
  await equipToSlot(hero, gear(hero, "chain"), "body", { notify: false });
  await equipToSlot(hero, gear(hero, "greatsword"), "mainHand", { notify: false });
  await equipToSlot(hero, gear(hero, "cloak"), "back", { notify: false });
  await equipToSlot(hero, gear(hero, "boots"), "feet", { notify: false });
  await equipToSlot(hero, gear(hero, "ringProtection"), "ring-1", { notify: false });
  await equipToSlot(hero, gear(hero, "ringWarmth"), "ring-2", { notify: false });
  await equipToSlot(hero, gear(hero, "ioun"), "trinket-1", { notify: false });
  await toggleAttunement(hero, gear(hero, "cloak"));
  await toggleAttunement(hero, gear(hero, "ringProtection"));
}

/** Open the hero's sheet on the doll tab, dock beside it, for a screenshot. */
export async function showcase() {
  const mod = await load();
  const hero = game.actors.getName(HERO);
  await closeAll();
  await dressHero(mod, hero);
  const { sheet } = await openTab(hero);
  sheet.setPosition({ left: 560, top: 40, height: 1000 });
  const dock = await mod.dock.PaperDollDock.open(sheet);
  await waitFor(() => dock?.rendered, "the dock");
  // Let tooltips' spinners and images settle.
  await new Promise(r => setTimeout(r, 800));
  return { sheet: sheet.id, dock: dock.id };
}

/** Assertions for the Ember world. */
export async function emberSuite() {
  const report = new Report();
  try {
    const mod = await load();
    const hero = game.actors.getName(HERO);
    report.check("Ember is active", game.modules.get("ember")?.active === true);

    await closeAll();
    const { sheet, root } = await openTab(hero);
    report.check("the doll wears the Ember skin", root().classList.contains("sogrom-ember"));
    const ground = getComputedStyle(root()).backgroundImage;
    report.check("…with Ember's codex ground", ground.includes("codex-background-dark"), ground);

    for ( const asset of EMBER_ASSETS ) {
      const url = `/modules/ember/${asset}`;
      const response = await fetch(url, { method: "HEAD" });
      report.check(`Ember asset loads: ${asset}`, response.ok, `${response.status} ${url}`);
    }

    await document.fonts.ready;
    report.check("Ember's heading face is available", document.fonts.check('16px "Pirate Scroll"'));

    // A character Ember has not finished building gets Ember's creation sheet. The doll must not
    // offer to dock to it, and asking must not open it. (Not rendered here: in a world without the
    // Ember adventure imported, the creation sheet itself cannot draw.)
    const fresh = await Actor.create({ name: "[e2e] Mid-Creation", type: "character" });
    try {
      report.equal("a new character in an Ember world gets Ember's creation sheet", fresh.getFlag("core", "sheetClass"), "ember.EmberCharacterCreationSheet");
      report.check("…which the doll will not dock to", !mod.dock.canDock(fresh.sheet));
      const opened = await game.modules.get("sogrom-simple-dnd5e-paper-doll").api.openDock(fresh);
      report.check("…and api.openDock refuses without opening it", opened === null && !fresh.sheet.rendered);
    } finally {
      await fresh.delete();
    }

    // Ember's creation sheet is registered for characters but is not something to dock beside.
    const creation = Object.values(CONFIG.Actor.sheetClasses.character ?? {}).find(s => s.id?.startsWith("ember."));
    report.check("Ember's creation sheet is registered", !!creation);
    if ( creation ) {
      const probe = { document: hero, options: creation.cls.DEFAULT_OPTIONS };
      report.check("…and the doll will not dock to it", !mod.dock.canDock(probe));
    }
    await sheet.close();
  } catch ( err ) {
    report.fail("ember suite threw", err);
  }
  return { emberSuite: report.summary };
}

/**
 * The docked doll beside Tidy 5e's character sheet — a sheet this module has no code for. What makes
 * it work is only that Tidy builds on ActorSheetV2, so the header hook and the `position`/`close`
 * events are there. The run's other suites still use dnd5e's own sheet, which Tidy leaves registered.
 */
export async function tidySuite() {
  const report = new Report();
  const hero = game.actors.getName(HERO);
  const previous = hero.getFlag("core", "sheetClass");
  try {
    const mod = await load();
    await closeAll();
    const tidy = Object.values(CONFIG.Actor.sheetClasses.character ?? {}).find(s => s.id.startsWith("tidy5e-sheet."));
    report.check("Tidy 5e registers a character sheet", !!tidy, Object.keys(CONFIG.Actor.sheetClasses.character ?? {}).join(", "));
    if ( !tidy ) return { tidySuite: report.summary };

    await hero.setFlag("core", "sheetClass", tidy.id);
    hero._sheet = null;
    const sheet = hero.sheet;
    await sheet.render({ force: true });
    await waitFor(() => sheet.rendered, "the Tidy sheet");
    sheet.setPosition({ left: 700, top: 60 });
    report.check("the sheet is Tidy's, not dnd5e's", !(sheet instanceof dnd5e.applications.actor.CharacterActorSheet), sheet.constructor.name);

    const controls = [...sheet._headerControlButtons()].map(c => c.action);
    report.check("Tidy's header offers the Paper Doll control", controls.includes("sogromPaperDoll"), controls.join(", "));

    const dock = await mod.dock.PaperDollDock.open(sheet);
    await waitFor(() => dock?.rendered && dock.element.querySelector(".sogrom-doll"), "the dock beside Tidy");
    const gap = sheet.element.getBoundingClientRect().left - dock.element.getBoundingClientRect().right;
    report.check("the dock docks beside Tidy's sheet", Math.abs(gap) <= 2, `gap ${gap}`);

    await mod.actions.equipToSlot(hero, gear(hero, "cloak"), "back", { notify: false });
    await waitFor(() => dock.element.querySelector('.pd-slot[data-pd-slot="back"].is-filled'), "the dock to update");
    report.check("equipping through the dock's doll updates it beside Tidy", true);

    sheet.setPosition({ left: 820 });
    await new Promise(r => requestAnimationFrame(r));
    const moved = sheet.element.getBoundingClientRect().left - dock.element.getBoundingClientRect().right;
    report.check("the dock follows Tidy's sheet", Math.abs(moved) <= 2, `gap ${moved}`);

    await sheet.close();
    await waitFor(() => !mod.dock.PaperDollDock.for(sheet), "the dock to close with Tidy's sheet");
    report.check("closing Tidy's sheet closes the dock", true);
  } catch ( err ) {
    report.fail("tidy suite threw", err);
  } finally {
    await closeAll();
    if ( previous ) await hero.setFlag("core", "sheetClass", previous);
    else await hero.unsetFlag("core", "sheetClass");
    hero._sheet = null;
  }
  return { tidySuite: report.summary };
}

export async function teardown() {
  await closeAll();
}
