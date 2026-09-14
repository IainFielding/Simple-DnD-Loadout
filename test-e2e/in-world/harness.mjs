/**
 * The assertions only a real world can answer, run inside Foundry's own page as the Gamemaster.
 *
 * Imports the module under test directly — Foundry serves this directory because the repo is
 * junction-linked into `Data/modules` — so these call the shipped code against real documents,
 * real dnd5e sheets and real DOM.
 *
 * ## What belongs here rather than in vitest
 *
 * The rules (what fits where, swaps, two-handed grips) are covered by the unit suite and are not
 * repeated. What lives here is what a unit test cannot see: that dnd5e actually renders our tab;
 * that a drop event on a slot really equips the item rather than also sorting the inventory; that
 * the dock actually follows a sheet as it moves, minimises and closes; that an item equipped from
 * the inventory tab shows up on an open doll.
 */

import { GEAR, HERO, STRANGER, closeAll, resetGear } from "./provision.mjs";

const MODULE = "sogrom-simple-dnd5e-paper-doll";
const BASE = `/modules/${MODULE}/scripts`;
const TAB = "sogromPaperDoll";

/* -------------------------------------------- */
/*  A very small test framework                 */
/* -------------------------------------------- */

export class Report {
  cases = [];

  check(name, condition, detail = "") {
    this.cases.push({ name, pass: !!condition, detail: condition ? "" : String(detail) });
    return !!condition;
  }

  equal(name, actual, expected) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    return this.check(name, pass, pass ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  near(name, actual, expected, tolerance = 2) {
    const pass = Math.abs(actual - expected) <= tolerance;
    return this.check(name, pass, pass ? "" : `expected ${expected} ±${tolerance}, got ${actual}`);
  }

  fail(name, err) {
    this.cases.push({ name, pass: false, detail: `${err?.message ?? err}\n${err?.stack ?? ""}` });
  }

  get summary() {
    const failed = this.cases.filter(c => !c.pass);
    return { total: this.cases.length, failed: failed.length, cases: this.cases };
  }
}

/** Poll until `fn` returns truthy, or throw after `timeout` ms with `label` in the message. */
export async function waitFor(fn, label, timeout = 5000) {
  const start = performance.now();
  for ( ;; ) {
    const value = await fn();
    if ( value ) return value;
    if ( performance.now() - start > timeout ) throw new Error(`timed out waiting for ${label}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const frame = () => new Promise(r => requestAnimationFrame(() => r()));

/** Import the module's own code. */
export async function load() {
  const [context, actions, dock, tab, controller] = await Promise.all([
    import(`${BASE}/doll/context.mjs`),
    import(`${BASE}/doll/actions.mjs`),
    import(`${BASE}/sheet/dock.mjs`),
    import(`${BASE}/sheet/tab.mjs`),
    import(`${BASE}/doll/controller.mjs`)
  ]);
  return { context, actions, dock, tab, controller };
}

/** The fixture item for a GEAR key. */
export function gear(actor, key) {
  const spec = GEAR.find(g => g.key === key);
  return actor.items.getName(spec.name);
}

/** Which item id the doll resolves into a slot. */
function slotItem(mod, actor, key) {
  return mod.context.readLayout(actor).layout.cells.find(c => c.key === key)?.item?.id ?? null;
}

/** Open a character's sheet on the doll tab and return the sheet and the doll root. */
export async function openTab(actor) {
  const sheet = actor.sheet;
  await sheet.render({ force: true, tab: TAB });
  await waitFor(() => sheet.rendered && sheet.element?.querySelector(`[data-tab="${TAB}"] .sogrom-doll`), "the doll tab");
  sheet.changeTab(TAB, "primary");
  return { sheet, root: () => sheet.element.querySelector(`[data-tab="${TAB}"] .sogrom-doll`) };
}

/** A real drop event carrying an Item payload, dispatched at a slot. */
function dropOn(slot, payload) {
  const dataTransfer = new DataTransfer();
  dataTransfer.setData("text/plain", JSON.stringify(payload));
  slot.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
}

/* -------------------------------------------- */
/*  Entry point                                 */
/* -------------------------------------------- */

/**
 * Run every GM-side suite.
 * @returns {Promise<Record<string, object>>}
 */
export async function all() {
  const mod = await load();
  const results = {};
  const suites = { tabSuite, equipSuite, kitSuite, campSuite, barSuite, domSuite, dockSuite, apiSuite, settingsSuite, configSuite };
  for ( const [name, suite] of Object.entries(suites) ) {
    const report = new Report();
    const hero = game.actors.getName(HERO);
    try {
      await closeAll();
      await resetGear(hero);
      await suite(report, mod, hero);
    } catch ( err ) {
      report.fail(`${name} threw`, err);
    }
    results[name] = report.summary;
  }
  await closeAll();
  return results;
}

/* -------------------------------------------- */
/*  Suites                                      */
/* -------------------------------------------- */

/** dnd5e renders our tab, with the doll in it, and the tab switches like the system's own. */
async function tabSuite(report, mod, hero) {
  const Sheet = dnd5e.applications.actor.CharacterActorSheet;
  report.check("the tab is registered on CharacterActorSheet", Sheet.TABS.some(t => t.tab === TAB));
  report.check("the part sits inside the tab container", Sheet.PARTS[TAB]?.container?.id === "tabs");

  const { sheet, root } = await openTab(hero);
  report.check("the sheet is dnd5e's character sheet", sheet instanceof Sheet);
  report.check("the nav shows the tab button", !!sheet.element.querySelector(`nav.tabs [data-tab="${TAB}"]`));
  report.check("the doll tab is active", sheet.element.querySelector(`section.tab[data-tab="${TAB}"]`)?.classList.contains("active"));
  report.equal("the default doll draws 21 slots", root().querySelectorAll(".pd-slot").length, 21);
  report.equal("the hands row reads main, off, then ranged 1 and 2", [...root().querySelectorAll(".pd-hands .pd-slot")].map(s => s.dataset.pdSlot), ["mainHand", "offHand", "ranged-1", "ranged-2"]);
  const hand = key => root().querySelector(`.pd-slot[data-pd-slot="${key}"]`).getBoundingClientRect();
  report.check("the weapons in hand are left of the ranged slots", (hand("offHand").right < hand("ranged-1").left) && (hand("mainHand").right <= hand("offHand").left));
  report.equal("the bar holds light, instrument, tools, then the trinkets", [...root().querySelectorAll(".pd-trinkets .pd-slot")].map(s => s.dataset.pdSlot), ["light", "instrument", "tools", "trinket-1", "trinket-2", "trinket-3", "trinket-4"]);
  const sizes = [...root().querySelectorAll(".pd-trinkets .pd-slot")].map(s => Math.round(s.getBoundingClientRect().width));
  report.check("kit slots are the same size as trinkets", new Set(sizes).size === 1, sizes.join(", "));
  report.check("no slot uses dnd5e's data-item-id", !root().querySelector("[data-item-id]"));

  sheet.changeTab("inventory", "primary");
  await frame();
  report.check("switching away hides the doll", !sheet.element.querySelector(`section.tab[data-tab="${TAB}"]`)?.classList.contains("active"));

  await mod.tab.showTab(hero);
  report.check("showTab switches an open sheet back", sheet.element.querySelector(`section.tab[data-tab="${TAB}"]`)?.classList.contains("active"));

  // An item equipped the ordinary way — the inventory tab's toggle — appears on the doll.
  await gear(hero, "chain").update({ "system.equipped": true });
  await waitFor(() => root()?.querySelector(`.pd-slot[data-pd-slot="body"].is-filled`), "chain mail on the body slot");
  report.check("equipping from the inventory shows the item on the doll", true);
  report.equal("AC readout follows dnd5e's computed AC", Number(root().querySelector(".pd-stat--ac .pd-stat-value")?.textContent), hero.system.attributes.ac.value);
}

/** The write path against real documents. */
async function equipSuite(report, mod, hero) {
  const { equipToSlot, unequipSlot, toggleAttunement } = mod.actions;
  const longsword = gear(hero, "longsword");
  const shield = gear(hero, "shield");
  const greatsword = gear(hero, "greatsword");

  report.check("equip longsword to main hand", await equipToSlot(hero, longsword, "mainHand"));
  report.check("…marks it equipped", longsword.system.equipped === true);
  report.equal("…records the slot", hero.getFlag(MODULE, "slots")?.mainHand, longsword.id);

  await equipToSlot(hero, shield, "offHand");
  report.equal("shield in the off hand", slotItem(mod, hero, "offHand"), shield.id);

  await equipToSlot(hero, greatsword, "mainHand");
  report.check("a greatsword clears both hands", !longsword.system.equipped && !shield.system.equipped);
  report.check("…and is itself equipped in the main hand", greatsword.system.equipped && slotItem(mod, hero, "mainHand") === greatsword.id);
  report.check("…and the off hand is blocked", mod.context.readLayout(hero).layout.cells.find(c => c.key === "offHand").blocked);

  report.check("the blocked off hand refuses a shield", !(await equipToSlot(hero, shield, "offHand", { notify: false })));
  report.check("…without equipping it", !shield.system.equipped);

  // Rings: three into two slots, then a swap.
  const rings = ["ringProtection", "ringWarmth", "ringSwimming"].map(k => gear(hero, k));
  await equipToSlot(hero, rings[0], "ring-1");
  await equipToSlot(hero, rings[1], "ring-2");
  await equipToSlot(hero, rings[2], "ring-1");
  report.check("a third ring replaces the first, unequipping it", !rings[0].system.equipped && rings[2].system.equipped);
  await equipToSlot(hero, rings[2], "ring-2", { sourceKey: "ring-1" });
  report.equal("dragging between ring slots swaps them", [slotItem(mod, hero, "ring-1"), slotItem(mod, hero, "ring-2")], [rings[1].id, rings[2].id]);

  // Accessories: lenient placement, then back out.
  const boots = gear(hero, "boots");
  report.check("lenient mode lets boots go in a trinket slot", await equipToSlot(hero, boots, "trinket-2"));
  report.check("unequipSlot takes them off", await unequipSlot(hero, "trinket-2") && !boots.system.equipped);

  // Unequipping through the doll forgets the slot, so equipping again lands in the natural one…
  await boots.update({ "system.equipped": true });
  report.equal("after a doll unequip, re-equipping uses the natural slot", slotItem(mod, hero, "feet"), boots.id);

  // …but unequipping from the inventory tab leaves the doll's memory alone, so the item comes back
  // to where the player last put it.
  await equipToSlot(hero, boots, "trinket-4");
  await boots.update({ "system.equipped": false });
  report.equal("an inventory-tab unequip empties the slot", slotItem(mod, hero, "trinket-4"), null);
  await boots.update({ "system.equipped": true });
  report.equal("…and re-equipping returns the item to it", slotItem(mod, hero, "trinket-4"), boots.id);

  // Attunement is real dnd5e attunement.
  const cloak = gear(hero, "cloak");
  await equipToSlot(hero, cloak, "back");
  const before = hero.system.attributes.attunement.value;
  await toggleAttunement(hero, cloak);
  report.check("attuning sets system.attuned", cloak.system.attuned === true);
  report.equal("…and dnd5e counts it", hero.system.attributes.attunement.value, before + 1);

  // Unslottable items are refused up front.
  report.check("a potion is refused", !(await equipToSlot(hero, gear(hero, "potion"), "trinket-1", { notify: false })));

  // Hooks fire with live documents.
  const seen = [];
  const on = Hooks.on("simplePaperDoll.equipped", ({ item, slot }) => seen.push(`${item?.name}@${slot}`));
  const veto = Hooks.on("simplePaperDoll.preEquip", ({ item }) => item.name !== "Dagger");
  await equipToSlot(hero, gear(hero, "leather"), "body");
  const vetoed = await equipToSlot(hero, gear(hero, "dagger"), "mainHand", { notify: false });
  Hooks.off("simplePaperDoll.equipped", on);
  Hooks.off("simplePaperDoll.preEquip", veto);
  report.check("equipped hook fires with the live item", seen.includes("Leather Armor@body"), seen.join(", "));
  report.check("preEquip can veto", vetoed === false && !gear(hero, "dagger").system.equipped);
}

/** The ranged and kit slots, against real dnd5e weapon, consumable and tool documents. */
async function kitSuite(report, mod, hero) {
  const { equipToSlot } = mod.actions;
  const { layout } = mod.context.readLayout(hero);
  const has = key => layout.cells.some(c => c.key === key);
  report.check("the default doll has both ranged slots and the kit row", ["ranged-1", "ranged-2", "light", "instrument", "tools"].every(has));

  // Equipping the ordinary way lands each in its own slot.
  for ( const key of ["longbow", "torch", "lute", "smiths"] ) await gear(hero, key).update({ "system.equipped": true });
  report.equal("an equipped longbow is slung, not held", slotItem(mod, hero, "ranged-1"), gear(hero, "longbow").id);
  report.equal("an equipped torch goes to the light slot", slotItem(mod, hero, "light"), gear(hero, "torch").id);
  report.equal("a lute goes to the instrument slot", slotItem(mod, hero, "instrument"), gear(hero, "lute").id);
  report.equal("smith's tools go to the tools slot", slotItem(mod, hero, "tools"), gear(hero, "smiths").id);

  // A slung two-handed bow leaves both hands free.
  report.check("a shield still fits the off hand beside a slung longbow", await equipToSlot(hero, gear(hero, "shield"), "offHand", { notify: false }));
  report.check("…and the longbow stays equipped", gear(hero, "longbow").system.equipped);

  // A torch in the off hand.
  report.check("the torch moves into the off hand", await equipToSlot(hero, gear(hero, "torch"), "offHand", { sourceKey: "light", notify: false }));
  report.check("…replacing the shield", !gear(hero, "shield").system.equipped && slotItem(mod, hero, "light") === null);

  // Gripping the longbow blocks the off hand and drops the torch.
  report.check("the longbow moves into the main hand", await equipToSlot(hero, gear(hero, "longbow"), "mainHand", { sourceKey: "ranged-1", notify: false }));
  report.check("…which drops the torch from the off hand", !gear(hero, "torch").system.equipped);
  report.check("…and blocks it", mod.context.readLayout(hero).layout.cells.find(c => c.key === "offHand").blocked);

  // Refusals.
  report.check("a lute will not go on the head", !(await equipToSlot(hero, gear(hero, "lute"), "head", { notify: false })));
  report.check("a longsword will not go in a ranged slot", !(await equipToSlot(hero, gear(hero, "longsword"), "ranged-2", { notify: false })));
  report.check("a tinderbox is not a light source", !(await equipToSlot(hero, gear(hero, "tinderbox"), "light", { notify: false })));
  report.check("a hand crossbow fills the second ranged slot", await equipToSlot(hero, gear(hero, "handCrossbow"), "ranged-2", { notify: false }));

  // The picker for a kit slot lists only that kind.
  const { root, sheet } = await openTab(hero);
  root().querySelector('.pd-slot[data-pd-slot="light"]').click();
  const picker = await waitFor(() => root()?.querySelector(".pd-picker"), "the light picker");
  report.equal("the light picker lists only light sources", [...picker.querySelectorAll(".pd-picker-name")].map(n => n.textContent.trim()), ["Torch"]);
  await sheet.close();
}

/** The fullest bar — five trinkets and the kit — fits the narrow dock on one line. */
async function barSuite(report, mod, hero) {
  const before = game.settings.get(MODULE, "slotLayout");
  try {
    await game.settings.set(MODULE, "slotLayout", { ...foundry.utils.deepClone(before), trinkets: 99 });
    report.equal("the trinket count clamps to five", game.modules.get(MODULE) && mod.context.readLayout(hero).counts.trinket, 5);
    const sheet = hero.sheet;
    await sheet.render({ force: true });
    await waitFor(() => sheet.rendered, "the sheet");
    sheet.setPosition({ left: 700, top: 40 });
    const dock = await mod.dock.PaperDollDock.open(sheet);
    const bar = await waitFor(() => dock?.rendered && dock.element.querySelector(".pd-trinkets"), "the dock's bar");
    await frame();
    const slots = [...bar.querySelectorAll(".pd-slot")];
    report.equal("the full bar has eight slots", slots.length, 8);
    const tops = new Set(slots.map(s => Math.round(s.getBoundingClientRect().top)));
    report.equal("…all on one line in the dock", tops.size, 1);
    const weapons = ["mainHand", "offHand", "ranged-1", "ranged-2"].map(key => dock.element.querySelector(`.pd-slot[data-pd-slot="${key}"]`).getBoundingClientRect());
    report.equal("all four weapon slots are the same size", new Set(weapons.map(r => `${Math.round(r.width)}x${Math.round(r.height)}`)).size, 1);
    report.equal("…and fit the dock on one line", new Set(weapons.map(r => Math.round(r.top))).size, 1);
    await sheet.close();
  } finally {
    await game.settings.set(MODULE, "slotLayout", before);
  }
}

/** Where every slot is drawn, by key, in viewport pixels. */
function slotRects(root) {
  return Object.fromEntries([...root.querySelectorAll(".pd-slot")].map(el => {
    const r = el.getBoundingClientRect();
    return [el.dataset.pdSlot, [r.left, r.top, r.width, r.height].map(v => Math.round(v * 2) / 2)];
  }));
}

/** Keys whose position or size differs between two slot maps, ignoring slots only one has. */
function movedSlots(before, after) {
  return Object.keys(before).filter(key => (key in after) && (JSON.stringify(before[key]) !== JSON.stringify(after[key])));
}

/** Camp clothes: behind the GM option, grouped, moving nothing, and packed rather than worn. */
async function campSuite(report, mod, hero) {
  const before = game.settings.get(MODULE, "slotLayout");
  const layoutWith = camp => ({ ...foundry.utils.deepClone(before), camp });
  const { equipToSlot, unequipSlot } = mod.actions;
  try {
    await game.settings.set(MODULE, "slotLayout", layoutWith(false));

    // --- The tab: off, then on.
    const { sheet, root } = await openTab(hero);
    sheet.setPosition({ left: 560, top: 40, width: 800, height: 1000 });
    await frame();
    report.check("camp clothes are off by default: no camp group", !root().querySelector(".pd-camp"));
    const tabOff = slotRects(root());

    const dock = await mod.dock.PaperDollDock.open(sheet);
    await waitFor(() => dock?.rendered && dock.element.querySelector(".sogrom-doll"), "the dock");
    const dockRoot = () => dock.element.querySelector(".sogrom-doll");
    await frame();
    const dockOff = slotRects(dockRoot());

    await game.settings.set(MODULE, "slotLayout", layoutWith(true));
    await waitFor(() => root()?.querySelectorAll(".pd-camp .pd-slot").length === 3, "the camp group in the tab");
    await waitFor(() => dockRoot()?.querySelectorAll(".pd-camp .pd-slot").length === 3, "the camp group in the dock");
    await frame();

    const group = root().querySelector(".pd-camp");
    report.equal("the GM option adds exactly the three camp slots, in order",
      [...group.querySelectorAll(".pd-slot")].map(s => s.dataset.pdSlot), ["campOutfit", "campUnderwear", "campFootwear"]);
    const style = getComputedStyle(group);
    report.check("the three are grouped inside one visible border",
      (parseFloat(style.borderTopWidth) >= 1) && (style.borderTopStyle !== "none"), `${style.borderTopWidth} ${style.borderTopStyle}`);
    report.check("the group sits inside the stage", !!group.closest(".pd-stage"));

    const tabMoved = movedSlots(tabOff, slotRects(root()));
    report.equal("turning camp on moves no existing slot in the sheet tab", tabMoved, []);
    const dockMoved = movedSlots(dockOff, slotRects(dockRoot()));
    report.equal("…or in the docked window", dockMoved, []);

    // The group must not sit on top of another slot.
    const g = group.getBoundingClientRect();
    const overlaps = [...root().querySelectorAll(".pd-slot:not(.pd-camp .pd-slot)")].filter(el => {
      const r = el.getBoundingClientRect();
      return (r.left < g.right) && (r.right > g.left) && (r.top < g.bottom) && (r.bottom > g.top);
    }).map(el => el.dataset.pdSlot);
    report.equal("the camp group covers no other slot", overlaps, []);
    const d = dockRoot().querySelector(".pd-camp").getBoundingClientRect();
    const dockOverlaps = [...dockRoot().querySelectorAll(".pd-slot:not(.pd-camp .pd-slot)")].filter(el => {
      const r = el.getBoundingClientRect();
      return (r.left < d.right) && (r.right > d.left) && (r.top < d.bottom) && (r.bottom > d.top);
    }).map(el => el.dataset.pdSlot);
    report.equal("…in the dock either", dockOverlaps, []);

    // --- Packed, not worn.
    const boots = gear(hero, "boots");
    await equipToSlot(hero, boots, "feet", { notify: false });
    report.check("boots of speed on the feet are equipped", boots.system.equipped);
    report.check("dragging them into camp footwear succeeds", await equipToSlot(hero, boots, "campFootwear", { sourceKey: "feet", notify: false }));
    report.check("…and unequips them, so their magic stops", !boots.system.equipped);

    const shoes = gear(hero, "shoes");
    await equipToSlot(hero, shoes, "feet", { notify: false });
    report.check("soft shoes go on the feet", shoes.system.equipped);
    report.check("the packed boots stay in camp meanwhile", slotItem(mod, hero, "campFootwear") === boots.id);

    report.check("swap: boots from camp onto the feet", await equipToSlot(hero, boots, "feet", { sourceKey: "campFootwear", notify: false }));
    report.check("…equips the boots", boots.system.equipped);
    report.check("…and packs the shoes into camp, unequipped", !shoes.system.equipped && slotItem(mod, hero, "campFootwear") === shoes.id);

    const clothes = gear(hero, "travelers");
    report.check("traveler's clothes pack as a camp outfit", await equipToSlot(hero, clothes, "campOutfit", { notify: false }));
    report.check("…without being equipped", !clothes.system.equipped);
    report.check("smallclothes pack as underwear", await equipToSlot(hero, gear(hero, "smallclothes"), "campUnderwear", { notify: false }));
    report.check("chain mail is refused as a camp outfit", !(await equipToSlot(hero, gear(hero, "chain"), "campOutfit", { notify: false })));

    // The menu on a camp slot unpacks rather than unequips.
    await waitFor(() => root()?.querySelector('.pd-slot[data-pd-slot="campOutfit"].is-filled'), "the packed outfit drawn");
    const slot = root().querySelector('.pd-slot[data-pd-slot="campOutfit"]');
    const rect = slot.getBoundingClientRect();
    slot.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.x + 5, clientY: rect.y + 5 }));
    const menu = await waitFor(() => document.querySelector("#context-menu"), "the camp slot menu");
    const labels = [...menu.querySelectorAll(".context-item")].map(li => li.textContent.trim());
    report.check("a camp slot's menu offers Take Out of Camp, not Unequip", labels.includes("Take Out of Camp") && !labels.includes("Unequip"), labels.join(" | "));
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    report.check("taking the outfit out of camp works", await unequipSlot(hero, "campOutfit", { notify: false }));
    report.check("…and leaves it unequipped", !clothes.system.equipped && slotItem(mod, hero, "campOutfit") === null);

    // --- The GM switch: off again hides the group, and the packed items are simply in the pack.
    await game.settings.set(MODULE, "slotLayout", layoutWith(false));
    await waitFor(() => !root()?.querySelector(".pd-camp"), "the camp group to go");
    report.check("turning the option off removes the group", true);
    report.check("…and nothing packed became equipped", !shoes.system.equipped && !gear(hero, "smallclothes").system.equipped);

    await sheet.close();

    // --- The tools slot takes kits and gaming sets.
    report.check("thieves' tools go in the tools slot", await equipToSlot(hero, gear(hero, "thieves"), "tools", { notify: false }));
    report.check("dice go in the tools slot", await equipToSlot(hero, gear(hero, "dice"), "tools", { notify: false }));
    const tab = await openTab(hero);
    tab.root().querySelector('.pd-slot[data-pd-slot="instrument"]').click();
    const instrumentPicker = await waitFor(() => tab.root()?.querySelector(".pd-picker"), "the instrument picker");
    report.equal("the instrument picker still lists only instruments", [...instrumentPicker.querySelectorAll(".pd-picker-name")].map(n => n.textContent.trim()), ["Lute"]);
    await tab.sheet.close();
  } finally {
    await game.settings.set(MODULE, "slotLayout", before);
  }
}

/** Real events at the rendered doll. */
async function domSuite(report, mod, hero) {
  const { sheet, root } = await openTab(hero);
  const dagger = gear(hero, "dagger");

  // Drop.
  let inventorySorts = 0;
  const sortHook = Hooks.on("preUpdateItem", (_item, changes) => { if ( "sort" in changes ) inventorySorts++; });
  dropOn(root().querySelector('.pd-slot[data-pd-slot="offHand"]'), { type: "Item", uuid: dagger.uuid });
  await waitFor(() => dagger.system.equipped, "the dropped dagger to equip");
  Hooks.off("preUpdateItem", sortHook);
  report.check("dropping an owned item on a slot equips it there", slotItem(mod, hero, "offHand") === dagger.id);
  report.equal("the sheet's own drop handler did not also sort the inventory", inventorySorts, 0);

  // Drag between slots carries the source slot.
  await waitFor(() => root()?.querySelector('.pd-slot[data-pd-slot="offHand"].is-filled'), "re-render");
  dropOn(root().querySelector('.pd-slot[data-pd-slot="mainHand"]'), {
    type: "Item", uuid: dagger.uuid, [MODULE]: { actor: hero.uuid, slot: "offHand" }
  });
  await waitFor(() => slotItem(mod, hero, "mainHand") === dagger.id, "the dagger to move hands");
  report.check("dragging from one slot to another moves the item", slotItem(mod, hero, "offHand") === null);

  // A world item from the sidebar, as the GM (allowed by default).
  const worldBoots = await Item.create({ name: "[e2e] Sidebar Boots", type: "equipment", img: "icons/equipment/feet/boots-leather-green.webp", system: { type: { value: "wondrous" } } });
  try {
    await waitFor(() => root()?.querySelector('.pd-slot[data-pd-slot="feet"]'), "re-render");
    dropOn(root().querySelector('.pd-slot[data-pd-slot="feet"]'), { type: "Item", uuid: worldBoots.uuid });
    const copy = await waitFor(() => hero.items.getName("[e2e] Sidebar Boots"), "a copy in the inventory");
    await waitFor(() => copy.system.equipped, "the copy to equip");
    report.check("a GM dropping a sidebar item copies it in and equips it", slotItem(mod, hero, "feet") === copy.id);
    await copy.delete();
  } finally {
    await worldBoots.delete();
  }

  // Picker.
  await waitFor(() => root()?.querySelector('.pd-slot[data-pd-slot="neck"]'), "re-render");
  root().querySelector('.pd-slot[data-pd-slot="ring-1"]').click();
  const picker = await waitFor(() => root()?.querySelector(".pd-picker"), "the picker to open");
  const names = [...picker.querySelectorAll(".pd-picker-name")].map(n => n.textContent.trim());
  report.equal("the ring picker lists exactly the rings", names.sort(), ["Ring of Protection", "Ring of Swimming", "Ring of Warmth"]);
  const search = picker.querySelector(".pd-picker-search");
  search.value = "warm";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  report.equal("search filters the list", [...picker.querySelectorAll("li:not([hidden]) .pd-picker-name")].map(n => n.textContent.trim()), ["Ring of Warmth"]);
  picker.querySelector(`[data-pd-choose="${gear(hero, "ringWarmth").id}"]`).click();
  await waitFor(() => gear(hero, "ringWarmth").system.equipped, "the picked ring to equip");
  report.check("choosing from the picker equips into that slot", slotItem(mod, hero, "ring-1") === gear(hero, "ringWarmth").id);

  // Escape closes the picker.
  await waitFor(() => root()?.querySelector('.pd-slot[data-pd-slot="head"]'), "re-render");
  root().querySelector('.pd-slot[data-pd-slot="head"]').click();
  const headPicker = await waitFor(() => root()?.querySelector(".pd-picker"), "the head picker");
  headPicker.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  report.check("Escape closes the picker", !root().querySelector(".pd-picker"));

  // Context menu.
  const ring = root().querySelector('.pd-slot[data-pd-slot="ring-1"]');
  const rect = ring.getBoundingClientRect();
  ring.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.x + 5, clientY: rect.y + 5 }));
  const menu = await waitFor(() => document.querySelector("#context-menu"), "the context menu");
  const labels = [...menu.querySelectorAll(".context-item")].map(li => li.textContent.trim());
  report.check("the slot menu offers View, Attune and Unequip", ["View Item", "Attune", "Unequip"].every(l => labels.includes(l)), labels.join(" | "));
  [...menu.querySelectorAll(".context-item")].find(li => li.textContent.trim() === "Unequip")?.click();
  await waitFor(() => !gear(hero, "ringWarmth").system.equipped, "unequip from the menu");
  report.check("Unequip from the menu takes the ring off", true);

  // Keyboard.
  await waitFor(() => root()?.querySelector('.pd-slot[data-pd-slot="mainHand"].is-filled'), "re-render");
  const main = root().querySelector('.pd-slot[data-pd-slot="mainHand"]');
  main.focus();
  main.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
  await waitFor(() => !dagger.system.equipped, "Delete to unequip");
  report.check("Delete on a focused slot unequips", true);

  await sheet.close();
}

/** The dock follows the sheet without wrapping it. */
async function dockSuite(report, mod, hero) {
  const { PaperDollDock, canDock } = mod.dock;
  const sheet = hero.sheet;
  await sheet.render({ force: true });
  await waitFor(() => sheet.rendered, "the sheet");
  sheet.setPosition({ left: 700, top: 60 });

  report.check("a character sheet can be docked to", canDock(sheet));
  report.check("an unpositioned sheet (like Ember's creation sheet) cannot", !canDock({ document: hero, options: { window: { positioned: false } } }));

  const dock = await PaperDollDock.open(sheet);
  await waitFor(() => dock?.rendered && dock.element.querySelector(".sogrom-doll"), "the dock");
  report.check("the header toggle finds the open dock", PaperDollDock.for(sheet) === dock);
  report.check("the dock registers in actor.apps", hero.apps[dock.id] === dock);

  const sheetRect = () => sheet.element.getBoundingClientRect();
  const dockRect = () => dock.element.getBoundingClientRect();
  report.check("docked on the left", dock.element.classList.contains("is-docked") && dock.element.dataset.dockSide === "left");
  report.near("its right edge meets the sheet's left edge", dockRect().right, sheetRect().left);
  report.near("its top matches the sheet", dockRect().top, sheetRect().top);

  sheet.setPosition({ left: 900, top: 120 });
  await frame();
  report.near("moving the sheet moves the dock", dockRect().right, sheetRect().left);
  report.near("…vertically too", dockRect().top, sheetRect().top);

  sheet.setPosition({ left: 10 });
  await frame();
  report.equal("no room on the left: it docks on the right", dock.element.dataset.dockSide, "right");
  report.near("…against the sheet's right edge", dockRect().left, sheetRect().right);

  // Keeps up with document changes without listening for them.
  await gear(hero, "cloak").update({ "system.equipped": true });
  await waitFor(() => dock.element.querySelector('.pd-slot[data-pd-slot="back"].is-filled'), "the dock to show the cloak");
  report.check("an item update re-renders the dock", true);

  await sheet.minimize();
  await waitFor(() => dock.element.hidden, "the dock to hide");
  report.check("minimising the sheet hides the dock", true);
  await sheet.maximize();
  await waitFor(() => !dock.element.hidden, "the dock to reappear");
  report.check("restoring the sheet shows it again", true);

  await sheet.close();
  // `rendered` goes false as soon as closing *starts*; the registry is cleared when it finishes.
  await waitFor(() => !PaperDollDock.for(sheet), "the dock to finish closing");
  report.check("closing the sheet closes the dock", !PaperDollDock.for(sheet));
  report.check("…and unregisters it from actor.apps", !hero.apps[dock.id]);

  // The header control is present on the sheet frame.
  await sheet.render({ force: true });
  await waitFor(() => sheet.rendered, "the sheet again");
  const controls = [...sheet._headerControlButtons()].map(c => c.action);
  report.check("the sheet header offers the Paper Doll control", controls.includes("sogromPaperDoll"), controls.join(", "));
  await sheet.close();
}

/** The public API, as another module would use it. */
async function apiSuite(report, _mod, hero) {
  const api = game.modules.get(MODULE)?.api;
  report.check("the API is published", !!api);
  report.equal("classify", api.classify(gear(hero, "boots")), { kind: "feet", source: "name" });
  report.check("equip without a slot picks the natural one", await api.equip(hero, gear(hero, "boots")));
  report.equal("…feet", api.layout(hero).slots.find(s => s.key === "feet").itemId, gear(hero, "boots").id);
  report.check("unequip by item", await api.unequip(hero, gear(hero, "boots")));
  report.check("…is unequipped", !gear(hero, "boots").system.equipped);
  report.check("equip into an explicit slot", await api.equip(hero, gear(hero, "ioun"), "trinket-3"));
  report.equal("layout reports unslotted ids", api.layout(hero).unslotted, []);
  report.check("equip refuses quietly", (await api.equip(hero, gear(hero, "potion"))) === false);

  const dock = await api.openDock(hero);
  report.check("openDock opens the sheet and the dock", hero.sheet.rendered && dock?.rendered);
  await hero.sheet.close();
}

/** World settings reshape open dolls. */
async function settingsSuite(report, mod, hero) {
  const { root } = await openTab(hero);
  const before = game.settings.get(MODULE, "slotLayout");
  try {
    await game.settings.set(MODULE, "slotLayout", { rings: 4, trinkets: 0, disabled: ["wrists"] });
    await waitFor(() => root()?.querySelectorAll('.pd-slot[data-pd-kind="ring"]').length === 4, "four ring slots");
    report.check("more rings appear on an open sheet", true);
    report.check("disabled slots disappear", !root().querySelector('.pd-slot[data-pd-kind="wrists"]'));
    report.check("zero trinkets leaves the kit on the bar and no trinket slots", !root().querySelector(".pd-slot--trinket") && root().querySelectorAll(".pd-trinkets .pd-slot").length === 3);

    // Something worn in a slot that is switched off stays equipped and is listed.
    await game.settings.set(MODULE, "slotLayout", { rings: 1, trinkets: 0, disabled: [] });
    await gear(hero, "ringProtection").update({ "system.equipped": true });
    await gear(hero, "ringWarmth").update({ "system.equipped": true });
    await waitFor(() => root()?.querySelector(".pd-unslotted .pd-chip"), "the Also Worn list");
    report.check("a worn item with no room is listed under Also Worn", true);
    report.check("…and stays equipped", gear(hero, "ringWarmth").system.equipped || gear(hero, "ringProtection").system.equipped);
  } finally {
    await game.settings.set(MODULE, "slotLayout", before);
  }
  await game.settings.set(MODULE, "strictSlots", true);
  try {
    const refused = !(await mod.actions.equipToSlot(hero, gear(hero, "boots"), "head", { notify: false }));
    report.check("strict mode refuses boots on the head", refused);
  } finally {
    await game.settings.set(MODULE, "strictSlots", false);
  }
  const stranger = game.actors.getName(STRANGER);
  report.check("the stranger exists for the player suite", !!stranger);
}

/** The two small windows: they render, and what they save is what the doll then reads. */
async function configSuite(report, mod, hero) {
  const { SlotConfigApp } = await import(`${BASE}/app/slot-config.mjs`);
  const { PortraitConfig } = await import(`${BASE}/app/portrait-config.mjs`);
  const before = game.settings.get(MODULE, "slotLayout");

  // Configure Slots.
  const slots = new SlotConfigApp();
  await slots.render({ force: true });
  await waitFor(() => slots.rendered && slots.element.querySelector("range-picker[name=rings]"), "the slot config form");
  report.equal("the slot form offers every toggleable slot", slots.element.querySelectorAll('input[name^="enabled."]').length, 10);
  report.check("…and the camp clothes switch", !!slots.element.querySelector('input[name="camp"]'));
  report.check("…and a ranged slot count", !!slots.element.querySelector("range-picker[name=ranged]"));
  try {
    slots.element.querySelector("range-picker[name=rings]").value = 3;
    slots.element.querySelector("range-picker[name=trinkets]").value = 2;
    slots.element.querySelector("range-picker[name=ranged]").value = 1;
    slots.element.querySelector('input[name="enabled.waist"]').checked = false;
    slots.element.querySelector('input[name="enabled.instrument"]').checked = false;
    await slots.submit();
    report.equal("submitting saves the layout", game.settings.get(MODULE, "slotLayout"), { rings: 3, trinkets: 2, ranged: 1, camp: false, disabled: ["waist", "instrument"] });
    report.equal("…which the doll reads", mod.context.readLayout(hero).layout.cells.filter(c => c.kind === "ring").length, 3);
  } finally {
    await game.settings.set(MODULE, "slotLayout", before);
    await slots.close();
  }

  // Portrait.
  const portrait = new PortraitConfig({ document: hero });
  await portrait.render({ force: true });
  await waitFor(() => portrait.rendered && portrait.element.querySelector("file-picker"), "the portrait form");
  report.check("the portrait form has a live preview", !!portrait.element.querySelector(".pd-portrait-preview img"));
  portrait.element.querySelector("file-picker").value = "icons/svg/cowled.svg";
  portrait.element.querySelector("select").value = "contain";
  portrait.element.querySelector("range-picker").value = 40;
  await portrait.submit();
  await waitFor(() => hero.getFlag(MODULE, "portrait")?.src, "the portrait flag");
  report.equal("submitting saves the portrait", mod.context.portraitFor(hero), { src: "icons/svg/cowled.svg", fit: "contain", focus: 40, placeholder: true });
  await hero.unsetFlag(MODULE, "portrait");
}
