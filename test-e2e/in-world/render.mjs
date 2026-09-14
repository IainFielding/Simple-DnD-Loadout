/**
 * Fixtures for screenshots, and the Ember skin's assertions.
 *
 * Nothing here judges how the loadout *looks* — that is what the screenshots are for, and a person
 * looks at them. What is asserted is everything a screenshot would hide: that the skin class is
 * applied, that each of Ember's files the skin names actually loads, and that the loadout never
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

/**
 * Dress the hero so the screenshot shows every state: rarities, attunement, both kinds of blocked
 * hand, kit, camp clothes, a gear warning, charges and a stack, and a saved set being worn.
 */
async function dressHero(mod, hero) {
  await resetGear(hero);
  const { equipToSlot, saveSet, toggleAttunement } = mod.actions;
  // A trained fighter, so the one warning in the picture is the one put there on purpose: plate
  // armour heavier than their Strength. The extra items are strays, removed by the next reset.
  await hero.update({
    "system.traits.armorProf.value": ["lgt", "med", "hvy", "shl"],
    "system.traits.weaponProf.value": ["sim", "mar"]
  });
  const created = await hero.createEmbeddedDocuments("Item", [
    { name: "[e2e] Plate Armor", type: "equipment", img: "icons/equipment/chest/breastplate-banded-steel-gold.webp",
      system: { type: { value: "heavy" }, armor: { value: 18, dex: 0 }, strength: 18 } },
    { name: "[e2e] Ring of Spell Storing", type: "equipment", img: "icons/equipment/finger/ring-cabochon-gold-blue.webp",
      system: { type: { value: "ring" }, rarity: "rare", properties: ["mgc"], uses: { max: "5", spent: 2 } } },
    { name: "[e2e] Torches", type: "consumable", img: "icons/sundries/lights/torch-brown-lit.webp",
      system: { type: { value: "trinket" }, quantity: 10 } }
  ]);
  // By name: createEmbeddedDocuments does not promise to return documents in the order they were sent.
  const [plate, spellRing, torches] = ["[e2e] Plate Armor", "[e2e] Ring of Spell Storing", "[e2e] Torches"]
    .map(name => created.find(i => i.name === name));
  await equipToSlot(hero, plate, "body", { notify: false });
  await equipToSlot(hero, spellRing, "ring-2", { notify: false });
  await equipToSlot(hero, torches, "light", { notify: false });
  await equipToSlot(hero, gear(hero, "greatsword"), "mainHand", { notify: false });
  await equipToSlot(hero, gear(hero, "cloak"), "back", { notify: false });
  await equipToSlot(hero, gear(hero, "boots"), "feet", { notify: false });
  await equipToSlot(hero, gear(hero, "ringProtection"), "ring-1", { notify: false });
  await equipToSlot(hero, gear(hero, "ioun"), "trinket-1", { notify: false });
  await equipToSlot(hero, gear(hero, "longbow"), "ranged-1", { notify: false });
  await equipToSlot(hero, gear(hero, "handCrossbow"), "ranged-2", { notify: false });
  await equipToSlot(hero, gear(hero, "lute"), "instrument", { notify: false });
  await equipToSlot(hero, gear(hero, "smiths"), "tools", { notify: false });
  // Camp clothes, switched on for the picture and restored by the caller.
  await equipToSlot(hero, gear(hero, "travelers"), "campOutfit", { notify: false });
  await equipToSlot(hero, gear(hero, "smallclothes"), "campUnderwear", { notify: false });
  await equipToSlot(hero, gear(hero, "shoes"), "campFootwear", { notify: false });
  await toggleAttunement(hero, gear(hero, "cloak"));
  await toggleAttunement(hero, gear(hero, "ringProtection"));
  // Last, so the footer names the set: it matches only while the loadout is exactly as saved.
  await saveSet(hero, "Battle", { notify: false });
}

/** Tidy 5e's character sheet class id, when Tidy is active. It registers under the system's scope. */
function tidySheetId() {
  return Object.values(CONFIG.Actor.sheetClasses.character ?? {}).find(s => /\.Tidy5e/.test(s.id))?.id ?? null;
}

/**
 * Dress the hero and open the picture the world is about, for a screenshot:
 * - normally, dnd5e's sheet on the Loadout tab with the dock beside it;
 * - with `tidy`, Tidy 5e's sheet on its Loadout tab (registered through Tidy's API), with the dock
 *   beside it.
 * {@link teardown} puts the hero back on dnd5e's sheet.
 * @param {{tidy?: boolean}} [options]
 */
export async function showcase({ tidy = false } = {}) {
  const mod = await load();
  const hero = game.actors.getName(HERO);
  await closeAll();
  await game.settings.set("sogrom-simple-dnd5e-loadout", "slotLayout", { ...game.settings.get("sogrom-simple-dnd5e-loadout", "slotLayout"), camp: true });
  await dressHero(mod, hero);
  let sheet;
  const tidyId = tidy ? tidySheetId() : null;
  if ( tidyId ) {
    await hero.setFlag("core", "sheetClass", tidyId);
    hero._sheet = null;
    sheet = hero.sheet;
    await sheet.render({ force: true });
    await waitFor(() => sheet.rendered, "Tidy's sheet");
    sheet.selectTab("sogromLoadout");
  } else {
    ({ sheet } = await openTab(hero));
  }
  sheet.setPosition({ left: 560, top: 40, height: 1000 });
  const dock = await mod.dock.LoadoutDock.open(sheet);
  await waitFor(() => dock?.rendered, "the dock");
  // On dnd5e's sheet, the tab shows the body picker (each armour's AC against the plate worn now)
  // while the dock beside it shows the whole loadout. Tidy's picture shows its tab and the dock untouched.
  if ( !tidyId ) {
    const root = await waitFor(() => sheet.element?.querySelector('[data-tab="sogromLoadout"] .sogrom-loadout'), "the tab's loadout");
    await mod.controller.openPicker({ root, actor: hero, editable: true }, "body");
    await waitFor(() => root.isConnected && root.querySelector(".lo-picker"), "the body picker");
  }
  // Let tooltips' spinners and images settle.
  await new Promise(r => setTimeout(r, 800));
  return { sheet: sheet.id, sheetClass: sheet.constructor.name, dock: dock.id };
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
    report.check("the loadout wears the Ember skin", root().classList.contains("sogrom-ember"));
    const ground = getComputedStyle(root()).backgroundImage;
    report.check("…with Ember's codex ground", ground.includes("codex-background-dark"), ground);

    for ( const asset of EMBER_ASSETS ) {
      const url = `/modules/ember/${asset}`;
      const response = await fetch(url, { method: "HEAD" });
      report.check(`Ember asset loads: ${asset}`, response.ok, `${response.status} ${url}`);
    }

    await document.fonts.ready;
    report.check("Ember's heading face is available", document.fonts.check('16px "Pirate Scroll"'));

    // A character Ember has not finished building gets Ember's creation sheet. The loadout must not
    // offer to dock to it, and asking must not open it. (Not rendered here: in a world without the
    // Ember adventure imported, the creation sheet itself cannot draw.)
    const fresh = await Actor.create({ name: "[e2e] Mid-Creation", type: "character" });
    try {
      report.equal("a new character in an Ember world gets Ember's creation sheet", fresh.getFlag("core", "sheetClass"), "ember.EmberCharacterCreationSheet");
      report.check("…which the loadout will not dock to", !mod.dock.canDock(fresh.sheet));
      const opened = await game.modules.get("sogrom-simple-dnd5e-loadout").api.openDock(fresh);
      report.check("…and api.openDock refuses without opening it", opened === null && !fresh.sheet.rendered);
    } finally {
      await fresh.delete();
    }

    // Ember's creation sheet is registered for characters but is not something to dock beside.
    const creation = Object.values(CONFIG.Actor.sheetClasses.character ?? {}).find(s => s.id?.startsWith("ember."));
    report.check("Ember's creation sheet is registered", !!creation);
    if ( creation ) {
      const probe = { document: hero, options: creation.cls.DEFAULT_OPTIONS };
      report.check("…and the loadout will not dock to it", !mod.dock.canDock(probe));
    }
    await sheet.close();
  } catch ( err ) {
    report.fail("ember suite threw", err);
  }
  return { emberSuite: report.summary };
}

/**
 * The docked loadout beside Tidy 5e's character sheet — a sheet this module has no code for. What makes
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
    // Tidy registers under the system's scope ("dnd5e.Tidy5eCharacterSheetQuadrone"), not its own.
    const tidy = tidySheetId() && CONFIG.Actor.sheetClasses.character[tidySheetId()];
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
    report.check("Tidy's header offers the Loadout control", controls.includes("sogromLoadout"), controls.join(", "));

    // The Loadout tab, registered through Tidy's own tab API.
    report.check("Tidy's sheet has a Loadout tab", !!sheet.element.querySelector('[data-tab-id="sogromLoadout"]'));
    await game.modules.get("sogrom-simple-dnd5e-loadout").api.openTab(hero);
    const tidyRoot = () => sheet.element.querySelector('[data-tab-contents-for="sogromLoadout"] .sogrom-loadout');
    await waitFor(() => tidyRoot()?.checkVisibility?.(), "the Loadout tab to show in Tidy");
    report.check("api.openTab switches Tidy's sheet to the Loadout tab", true);
    report.equal("…which draws the loadout", tidyRoot().querySelectorAll(".lo-slot").length > 0, true);
    // Switching tabs redraws Tidy's tab contents a moment later; click once the loadout has settled.
    let settled = tidyRoot();
    await waitFor(async () => {
      await new Promise(r => setTimeout(r, 250));
      const same = tidyRoot() === settled;
      settled = tidyRoot();
      return same;
    }, "Tidy's tab to settle");
    tidyRoot().querySelector('.lo-slot[data-lo-slot="ring-1"]').click();
    const picker = await waitFor(() => tidyRoot()?.querySelector(".lo-picker"), "the picker in Tidy's tab");
    picker.querySelector(`[data-lo-choose="${gear(hero, "ringWarmth").id}"]`)?.click();
    await waitFor(() => gear(hero, "ringWarmth").system.equipped, "the picked ring to equip from Tidy's tab");
    report.check("choosing from the picker in Tidy's tab equips", true);
    const ring = await waitFor(() => tidyRoot()?.querySelector(`.lo-slot[data-lo-slot="ring-1"][data-lo-item="${gear(hero, "ringWarmth").id}"]`), "Tidy's tab to redraw the ring");
    report.check("…and Tidy redraws the tab with it", !!ring);
    let sorts = 0;
    const sortHook = Hooks.on("preUpdateItem", (_item, changes) => { if ( "sort" in changes ) sorts++; });
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: gear(hero, "dagger").uuid }));
    tidyRoot().querySelector('.lo-slot[data-lo-slot="offHand"]').dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    await waitFor(() => gear(hero, "dagger").system.equipped, "the dagger dropped on Tidy's tab to equip");
    Hooks.off("preUpdateItem", sortHook);
    report.check("dropping on a slot in Tidy's tab equips, still bound after a redraw", true);
    report.equal("…without Tidy also sorting the inventory", sorts, 0);

    // Tidy's play and edit modes: play uses a worn item, edit opens it.
    const dagger = gear(hero, "dagger");
    let used = 0;
    dagger.use = async () => { used++; };
    try {
      await sheet.changeSheetMode(1);
      const inTidy = () => tidyRoot()?.querySelector(`.lo-slot[data-lo-slot="offHand"][data-lo-item="${dagger.id}"]`);
      await waitFor(() => (sheet.sheetMode === 1) && inTidy(), "Tidy in play mode");
      inTidy().click();
      await waitFor(() => used === 1, "the dagger to be used from Tidy's tab");
      report.check("in Tidy's play mode, clicking a worn item uses it", !dagger.sheet.rendered);
      const portraitButton = () => tidyRoot()?.querySelector("[data-lo-action='portrait']");
      report.check("…where the portrait button is hidden", !!portraitButton() && getComputedStyle(portraitButton()).display === "none");
      await sheet.changeSheetMode(2);
      await waitFor(() => (sheet.sheetMode === 2) && inTidy(), "Tidy in edit mode");
      inTidy().click();
      await waitFor(() => dagger.sheet.rendered, "the dagger's sheet from Tidy's tab");
      report.check("in Tidy's edit mode, clicking it opens it", used === 1);
      report.check("…where the portrait button is available", !!portraitButton() && getComputedStyle(portraitButton()).display !== "none");
      await dagger.sheet.close();
    } finally {
      delete dagger.use;
      await sheet.changeSheetMode(1);
    }
    await mod.actions.unequipSlot(hero, "offHand", { notify: false });
    await mod.actions.unequipSlot(hero, "ring-1", { notify: false });

    const dock = await mod.dock.LoadoutDock.open(sheet);
    await waitFor(() => dock?.rendered && dock.element.querySelector(".sogrom-loadout"), "the dock beside Tidy");
    const gap = sheet.element.getBoundingClientRect().left - dock.element.getBoundingClientRect().right;
    report.check("the dock docks beside Tidy's sheet", Math.abs(gap) <= 2, `gap ${gap}`);

    await mod.actions.equipToSlot(hero, gear(hero, "cloak"), "back", { notify: false });
    await waitFor(() => dock.element.querySelector('.lo-slot[data-lo-slot="back"].is-filled'), "the dock to update");
    report.check("equipping through the dock's loadout updates it beside Tidy", true);

    sheet.setPosition({ left: 820 });
    await new Promise(r => requestAnimationFrame(r));
    const moved = sheet.element.getBoundingClientRect().left - dock.element.getBoundingClientRect().right;
    report.check("the dock follows Tidy's sheet", Math.abs(moved) <= 2, `gap ${moved}`);

    await sheet.close();
    await waitFor(() => !mod.dock.LoadoutDock.for(sheet), "the dock to close with Tidy's sheet");
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
  const hero = game.actors.getName(HERO);
  if ( hero?.getFlag("core", "sheetClass") && /\.Tidy5e/.test(hero.getFlag("core", "sheetClass")) ) {
    await hero.unsetFlag("core", "sheetClass");
    hero._sheet = null;
  }
  const layout = game.settings.get("sogrom-simple-dnd5e-loadout", "slotLayout");
  if ( layout?.camp ) await game.settings.set("sogrom-simple-dnd5e-loadout", "slotLayout", { ...layout, camp: false });
}
