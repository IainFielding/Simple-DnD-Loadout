/**
 * Run on the *player's* client: the doll is exactly as writable as the sheet, and no more.
 */

import { HERO, STRANGER } from "./provision.mjs";
import { Report, gear, load, waitFor } from "./harness.mjs";

const MODULE = "sogrom-simple-dnd5e-paper-doll";

export async function all() {
  const report = new Report();
  try {
    const mod = await load();
    const hero = game.actors.getName(HERO);
    const stranger = game.actors.getName(STRANGER);

    report.check("the player owns the hero", hero?.isOwner === true);
    report.check("the player can see but not own the stranger", !!stranger && !stranger.isOwner);

    // Own character: writable.
    const ctx = mod.context.buildDollContext(hero, { surface: "tab", editable: hero.sheet.isEditable });
    report.check("the hero's doll is editable", ctx.editable);
    report.check("a player can equip their own character", await mod.actions.equipToSlot(hero, gear(hero, "cloak"), "back", { notify: false }));
    await waitFor(() => gear(hero, "cloak").system.equipped, "the cloak to equip for the player");
    report.check("…and take it off again", await mod.actions.unequipSlot(hero, "back", { notify: false }));

    // Someone else's character: read-only, and refused if forced.
    const sheet = stranger.sheet;
    await sheet.render({ force: true, tab: "sogromPaperDoll" });
    const root = await waitFor(() => sheet.element?.querySelector(".sogrom-doll"), "the stranger's doll");
    report.check("the stranger's doll renders read-only", root.classList.contains("is-readonly"));
    report.check("…with nothing draggable", !root.querySelector('[draggable="true"]'));
    report.check("…and no portrait button", !root.querySelector('[data-pd-action="portrait"]'));
    const forced = await mod.actions.equipToSlot(stranger, gear(stranger, "boots"), "feet", { notify: false });
    report.check("forcing an equip on the stranger is refused", forced === false);
    report.check("…and nothing was written", !gear(stranger, "boots").system.equipped && !stranger.getFlag(MODULE, "slots"));
    await sheet.close();

    // Foreign drops are GM-only by default.
    report.check("a player may not drop sidebar items by default", !mod.actions.mayDropForeign(game.user, hero));
  } catch ( err ) {
    report.fail("player suite threw", err);
  }
  return { playerSuite: report.summary };
}
