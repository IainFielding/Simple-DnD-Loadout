import { beforeEach, describe, expect, it } from "vitest";
import { HOOKS, MODULE_ID, SETTINGS } from "../scripts/config.mjs";
import { buildDollContext, portraitFor, readLayout, slotLabel } from "../scripts/doll/context.mjs";
import {
  dropItemOnSlot, equipToSlot, mayDropForeign, toggleAttunement, unequipSlot
} from "../scripts/doll/actions.mjs";
import { installFoundryShims } from "./helpers/foundry-shims.mjs";
import { fakeActor, worldItem } from "./helpers/actor.mjs";

const itemNamed = (actor, name) => actor.items.find(i => i.name === name);

beforeEach(() => installFoundryShims());

describe("buildDollContext", () => {
  it("groups dressed cells by layout column", () => {
    const actor = fakeActor({ items: [{ name: "Boots of Speed", subtype: "wondrous", equipped: true }] });
    const ctx = buildDollContext(actor, { surface: "tab", editable: true });
    expect(ctx.groups.left.map(c => c.kind)).toEqual(["head", "neck", "back", "body", "wrists"]);
    expect(ctx.groups.hands.map(c => c.key)).toEqual(["mainHand", "offHand", "ranged-1", "ranged-2"]);
    expect(ctx.showBar).toBe(true);
    expect(ctx.groups.kit.map(c => c.label)).toEqual(["light", "instrument", "tools"].map(k => `${MODULE_ID}.slot.kind.${k}`));
    const feet = ctx.groups.right.find(c => c.key === "feet");
    expect(feet.item.name).toBe("Boots of Speed");
    expect(feet.draggable).toBe(true);
    expect(feet.tooltipClass).toContain("item-tooltip");
    expect(feet.tooltip).toContain(`data-uuid="${feet.item.uuid}"`);
  });

  it("nothing is draggable when the doll is read-only", () => {
    const actor = fakeActor({ items: [{ name: "Boots of Speed", subtype: "wondrous", equipped: true }], isOwner: false });
    const ctx = buildDollContext(actor);
    expect(ctx.editable).toBe(false);
    expect(Object.values(ctx.groups).flat().some(c => c.draggable)).toBe(false);
  });

  it("says attunement state in the accessible name", () => {
    const actor = fakeActor({ items: [
      { name: "Cloak of Protection", subtype: "wondrous", equipped: true, attunement: "required", attuned: true },
      { name: "Amulet of Health", subtype: "wondrous", equipped: true, attunement: "required", attuned: false }
    ] });
    const cells = Object.values(buildDollContext(actor, { editable: true }).groups).flat();
    expect(cells.find(c => c.key === "back").ariaLabel).toContain("slot.attuned");
    expect(cells.find(c => c.key === "neck").ariaLabel).toContain("slot.inert");
    expect(cells.find(c => c.key === "neck").item.inert).toBe(true);
  });

  it("describes a blocked off hand and ghosts the two-handed weapon", () => {
    const actor = fakeActor({ items: [{ name: "Greatsword", type: "weapon", properties: ["two"], equipped: true, img: "gs.webp" }] });
    const off = buildDollContext(actor).groups.hands.find(c => c.key === "offHand");
    expect(off.blocked).toBe(true);
    expect(off.ghost).toBe("gs.webp");
    expect(off.ariaLabel).toContain("slot.blocked");
  });

  it("carries the stats dnd5e computed", () => {
    const ctx = buildDollContext(fakeActor());
    expect(ctx.stats.ac).toBe(16);
    expect(ctx.stats.attunement.pips).toHaveLength(3);
    expect(ctx.stats.encumbrance).toMatchObject({ pct: 20, band: "light" });
  });

  it("only the dock shows the name", () => {
    expect(buildDollContext(fakeActor(), { surface: "dock" }).showName).toBe(true);
    expect(buildDollContext(fakeActor(), { surface: "tab" }).showName).toBe(false);
  });

  it("wears the Ember skin only when Ember is active", () => {
    expect(buildDollContext(fakeActor()).ember).toBe(false);
    game.modules.get = id => (id === "ember" ? { active: true } : null);
    expect(buildDollContext(fakeActor()).ember).toBe(true);
  });

  it("groups camp slots together only when camp clothes are on", () => {
    expect(buildDollContext(fakeActor()).groups.camp).toEqual([]);
    game.settings._values[SETTINGS.slotLayout] = { camp: true };
    expect(buildDollContext(fakeActor()).groups.camp.map(c => c.key)).toEqual(["campOutfit", "campUnderwear", "campFootwear"]);
  });

  it("keeps the bar while kit remains, and drops it only when kit and trinkets are both off", () => {
    game.settings._values[SETTINGS.slotLayout] = { trinkets: 0 };
    expect(buildDollContext(fakeActor()).showBar).toBe(true);
    game.settings._values[SETTINGS.slotLayout] = { trinkets: 0, disabled: ["light", "instrument", "tools"] };
    expect(buildDollContext(fakeActor()).showBar).toBe(false);
  });

  it("honours the slot layout setting", () => {
    game.settings._values[SETTINGS.slotLayout] = { rings: 4, trinkets: 0, disabled: ["head"] };
    const ctx = buildDollContext(fakeActor());
    expect(ctx.groups.right.filter(c => c.kind === "ring")).toHaveLength(4);
    expect(ctx.groups.trinkets).toHaveLength(0);
    expect(ctx.groups.left.some(c => c.kind === "head")).toBe(false);
  });
});

describe("portraitFor", () => {
  it("falls back to the actor image with default framing", () => {
    expect(portraitFor(fakeActor())).toEqual({ src: "hero.webp", fit: "cover", focus: 20, placeholder: false });
  });

  it("uses and sanitises the flag", () => {
    const actor = fakeActor({ portrait: { src: "full-body.webp", fit: "contain", focus: 250 } });
    expect(portraitFor(actor)).toEqual({ src: "full-body.webp", fit: "contain", focus: 100, placeholder: false });
    expect(portraitFor(fakeActor({ portrait: { fit: "stretch", focus: "x" } })).fit).toBe("cover");
  });
});

describe("slotLabel", () => {
  it("numbers repeated kinds only", () => {
    expect(slotLabel({ kind: "ring", index: 2 }, { ring: 2 })).toContain("slot.numbered");
    expect(slotLabel({ kind: "head", index: 1 }, { ring: 2 })).toBe(`${MODULE_ID}.slot.kind.head`);
  });
});

describe("equipToSlot", () => {
  it("writes the flag without a render, then the item — one visible re-render, in the right place", async () => {
    const actor = fakeActor({ items: [{ name: "Boots of Speed", subtype: "wondrous" }] });
    const boots = itemNamed(actor, "Boots of Speed");
    expect(await equipToSlot(actor, boots, "feet")).toBe(true);
    expect(actor.writes.map(w => w.op)).toEqual(["actor.update", "items.update"]);
    expect(actor.writes[0].options).toEqual({ render: false });
    expect(actor.writes[1].updates).toEqual([{ _id: boots.id, "system.equipped": true }]);
    expect(readLayout(actor).layout.cells.find(c => c.key === "feet").item.id).toBe(boots.id);
  });

  it("a pure move between slots is a single rendering flag write", async () => {
    const actor = fakeActor({ items: [{ name: "Ring A", subtype: "ring", equipped: true }] });
    const ringA = itemNamed(actor, "Ring A");
    await equipToSlot(actor, ringA, "ring-2", { sourceKey: "ring-1" });
    expect(actor.writes.map(w => w.op)).toEqual(["actor.update"]);
    expect(actor.writes[0].options).toEqual({ render: true });
  });

  it("fires unequipped for the displaced item and equipped for the placed one", async () => {
    const actor = fakeActor({ items: [
      { name: "Chain Mail", subtype: "heavy", equipped: true },
      { name: "Leather Armor", subtype: "light" }
    ] });
    const events = [];
    Hooks.on(HOOKS.unequipped, p => events.push(["off", p.item.name, p.slot]));
    Hooks.on(HOOKS.equipped, p => events.push(["on", p.item.name, p.slot]));
    await equipToSlot(actor, itemNamed(actor, "Leather Armor"), "body");
    expect(events).toEqual([["off", "Chain Mail", "body"], ["on", "Leather Armor", "body"]]);
  });

  it("preEquip returning false vetoes before anything is written", async () => {
    const actor = fakeActor({ items: [{ name: "Boots of Speed", subtype: "wondrous" }] });
    Hooks.on(HOOKS.preEquip, () => false);
    expect(await equipToSlot(actor, itemNamed(actor, "Boots of Speed"), "feet")).toBe(false);
    expect(actor.writes).toEqual([]);
    expect(ui.notifications.shown[0].message).toContain("reject.vetoed");
  });

  it("refuses a non-owner, and an item from another actor", async () => {
    const actor = fakeActor({ items: [{ name: "Boots of Speed", subtype: "wondrous" }], isOwner: false });
    expect(await equipToSlot(actor, itemNamed(actor, "Boots of Speed"), "feet")).toBe(false);
    const other = fakeActor({ items: [{ name: "Cloak of Elvenkind", subtype: "wondrous" }] });
    const mine = fakeActor();
    expect(await equipToSlot(mine, itemNamed(other, "Cloak of Elvenkind"), "back")).toBe(false);
    expect(actor.writes).toEqual([]);
    expect(mine.writes).toEqual([]);
  });

  it("explains a refusal with the item, slot and blocking weapon", async () => {
    const actor = fakeActor({ items: [
      { name: "Greatsword", type: "weapon", properties: ["two"], equipped: true },
      { name: "Shield", subtype: "shield" }
    ] });
    await equipToSlot(actor, itemNamed(actor, "Shield"), "offHand");
    expect(ui.notifications.shown[0].message).toContain("reject.offHandBlocked");
    expect(ui.notifications.shown[0].message).toContain("Greatsword");
  });

  it("stays quiet when asked to (the API path)", async () => {
    const actor = fakeActor({ items: [{ name: "Chain Mail", subtype: "heavy" }] });
    expect(await equipToSlot(actor, itemNamed(actor, "Chain Mail"), "head", { notify: false })).toBe(false);
    expect(ui.notifications.shown).toEqual([]);
  });
});

describe("camp clothes through the write path", () => {
  it("packing worn boots into camp unequips them, and unpacking writes no item change", async () => {
    game.settings._values[SETTINGS.slotLayout] = { camp: true };
    const actor = fakeActor({ items: [{ name: "Boots of Speed", subtype: "wondrous", equipped: true }] });
    const bootsItem = itemNamed(actor, "Boots of Speed");
    expect(await equipToSlot(actor, bootsItem, "campFootwear", { sourceKey: "feet" })).toBe(true);
    expect(bootsItem.system.equipped).toBe(false);
    expect(readLayout(actor).layout.cells.find(c => c.key === "campFootwear").item.id).toBe(bootsItem.id);

    actor.writes.length = 0;
    expect(await unequipSlot(actor, "campFootwear")).toBe(true);
    expect(actor.writes.map(w => w.op)).toEqual(["actor.update"]);
  });
});

describe("unequipSlot", () => {
  it("clears the slot and unequips", async () => {
    const actor = fakeActor({ items: [{ name: "Cloak of Protection", subtype: "wondrous", equipped: true }] });
    expect(await unequipSlot(actor, "back")).toBe(true);
    expect(actor.writes[1].updates[0]["system.equipped"]).toBe(false);
    expect(readLayout(actor).layout.cells.find(c => c.key === "back").item).toBeNull();
  });

  it("refuses an empty slot", async () => {
    expect(await unequipSlot(fakeActor(), "back", { notify: false })).toBe(false);
  });
});

describe("dropItemOnSlot", () => {
  it("places an owned item directly", async () => {
    const actor = fakeActor({ items: [{ name: "Boots of Speed", subtype: "wondrous" }] });
    expect(await dropItemOnSlot(actor, itemNamed(actor, "Boots of Speed"), "feet")).toBe(true);
    expect(actor.writes.some(w => w.op === "items.create")).toBe(false);
  });

  it("copies a foreign item into the inventory, then equips it, when allowed", async () => {
    game.user.isGM = true;
    const actor = fakeActor();
    const dropped = worldItem({ name: "Boots of Elvenkind", subtype: "wondrous" });
    expect(await dropItemOnSlot(actor, dropped, "feet")).toBe(true);
    const create = actor.writes.find(w => w.op === "items.create");
    expect(create.data[0]._id).toBeUndefined();
    expect(create.data[0].system.equipped).toBe(false);
    expect(readLayout(actor).layout.cells.find(c => c.key === "feet").item.name).toBe("Boots of Elvenkind");
  });

  it("refuses a foreign item the slot would not take without creating a stray copy", async () => {
    game.user.isGM = true;
    const actor = fakeActor();
    const armour = worldItem({ name: "Plate Armor", subtype: "heavy" });
    expect(await dropItemOnSlot(actor, armour, "head")).toBe(false);
    expect(actor.writes).toEqual([]);
  });

  it("refuses foreign items for players under the default setting", async () => {
    const actor = fakeActor();
    expect(await dropItemOnSlot(actor, worldItem({ name: "Boots", subtype: "wondrous" }), "feet")).toBe(false);
    expect(actor.writes).toEqual([]);
  });
});

describe("mayDropForeign", () => {
  it("follows the setting", () => {
    const gm = { isGM: true };
    const player = { isGM: false };
    const owned = { isOwner: true };
    game.settings._values[SETTINGS.foreignDrops] = "gm";
    expect([mayDropForeign(gm, owned), mayDropForeign(player, owned)]).toEqual([true, false]);
    game.settings._values[SETTINGS.foreignDrops] = "owner";
    expect([mayDropForeign(player, owned), mayDropForeign(player, { isOwner: false })]).toEqual([true, false]);
    game.settings._values[SETTINGS.foreignDrops] = "none";
    expect(mayDropForeign(gm, owned)).toBe(false);
    game.settings._values[SETTINGS.foreignDrops] = "nonsense";
    expect(mayDropForeign(player, owned)).toBe(false);
  });
});

describe("toggleAttunement", () => {
  it("toggles and warns when going over the limit", async () => {
    const actor = fakeActor({
      items: [{ name: "Ring of Protection", subtype: "ring", attunement: "required", equipped: true }],
      attributes: { attunement: { value: 4, max: 3 } }
    });
    const ringItem = itemNamed(actor, "Ring of Protection");
    await toggleAttunement(actor, ringItem);
    expect(ringItem.system.attuned).toBe(true);
    expect(ui.notifications.shown[0].message).toContain("notify.attuneOver");
  });

  it("does nothing for a non-owner", async () => {
    const actor = fakeActor({ items: [{ name: "Ring", subtype: "ring", attunement: "required" }], isOwner: false });
    await toggleAttunement(actor, itemNamed(actor, "Ring"));
    expect(actor.writes).toEqual([]);
  });
});

describe("portraitFor placeholder", () => {
  it("flags Foundry's stock silhouettes so they can be dimmed", () => {
    const actor = fakeActor();
    actor.img = "icons/svg/mystery-man.svg";
    expect(portraitFor(actor).placeholder).toBe(true);
  });
});
