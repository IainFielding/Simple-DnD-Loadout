/**
 * Run on the *player's* client: the loadout is exactly as writable as the sheet, and no more.
 */

import { HERO, STRANGER } from "./provision.mjs";
import { Report, gear, load, waitFor } from "./harness.mjs";

const MODULE = "sogrom-simple-dnd5e-loadout";

export async function all() {
  const report = new Report();
  try {
    const mod = await load();
    const hero = game.actors.getName(HERO);
    const stranger = game.actors.getName(STRANGER);

    report.check("the player owns the hero", hero?.isOwner === true);
    report.check("the player can see but not own the stranger", !!stranger && !stranger.isOwner);

    // Own character: writable.
    const ctx = mod.context.buildLoadoutContext(hero, { surface: "tab", editable: hero.sheet.isEditable });
    report.check("the hero's loadout is editable", ctx.editable);
    report.check("a player can equip their own character", await mod.actions.equipToSlot(hero, gear(hero, "cloak"), "back", { notify: false }));
    await waitFor(() => gear(hero, "cloak").system.equipped, "the cloak to equip for the player");
    report.check("…and take it off again", await mod.actions.unequipSlot(hero, "back", { notify: false }));

    // Someone else's character: read-only, and refused if forced.
    const sheet = stranger.sheet;
    await sheet.render({ force: true, tab: "sogromLoadout" });
    const root = await waitFor(() => sheet.element?.querySelector(".sogrom-loadout"), "the stranger's loadout");
    report.check("the stranger's loadout renders read-only", root.classList.contains("is-readonly"));
    report.check("…with nothing draggable", !root.querySelector('[draggable="true"]'));
    report.check("…and no portrait button", !root.querySelector('[data-lo-action="portrait"]'));
    const forced = await mod.actions.equipToSlot(stranger, gear(stranger, "boots"), "feet", { notify: false });
    report.check("forcing an equip on the stranger is refused", forced === false);
    report.check("…and nothing was written", !gear(stranger, "boots").system.equipped && !stranger.getFlag(MODULE, "slots"));
    await sheet.close();

    // Unidentified gear gives a player neither rarity nor attunement.
    const [mystery] = await hero.createEmbeddedDocuments("Item", [{
      name: "[e2e] Cloak of Elvenkind", type: "equipment", img: "icons/commodities/gems/gem-rough-cushion-blue.webp",
      system: { type: { value: "wondrous" }, rarity: "rare", properties: ["mgc"], attunement: "required", attuned: true,
        identified: false, unidentified: { name: "[e2e] Strange Garment" } }
    }]);
    try {
      await mod.actions.equipToSlot(hero, mystery, "back", { notify: false });
      const heroSheet = hero.sheet;
      await heroSheet.render({ force: true, tab: "sogromLoadout" });
      const back = await waitFor(() => heroSheet.element?.querySelector(`.lo-slot[data-lo-slot="back"][data-lo-item="${mystery.id}"]`), "the unidentified cloak");
      report.check("a player doesn't see an unidentified item's rarity", !back.className.includes("rarity-rare"), back.className);
      report.check("…or its attunement", !back.querySelector(".lo-badge--attuned"));
      back.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      const menu = await waitFor(() => document.querySelector("#context-menu"), "the slot menu");
      const labels = [...menu.querySelectorAll(".context-item")].map(li => li.textContent.trim());
      report.check("…and isn't offered to change its attunement", !labels.some(l => /attun/i.test(l)), labels.join(" | "));
      await heroSheet.close();
    } finally {
      await mystery.delete();
    }

    // Foreign drops are GM-only by default.
    report.check("a player may not drop sidebar items by default", !mod.actions.mayDropForeign(game.user, hero));
  } catch ( err ) {
    report.fail("player suite threw", err);
  }
  return { playerSuite: report.summary };
}
