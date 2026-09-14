import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLAGS, HOOKS, MODULE_ID, SETTINGS } from "../scripts/config.mjs";
import { buildLoadoutContext, buildPickerContext, buildSetsContext, readLayout, readSets } from "../scripts/loadout/context.mjs";
import { applySet, deleteSet, equipToSlot, saveSet, unequipItem } from "../scripts/loadout/actions.mjs";
import { createApi } from "../scripts/api.mjs";
import { installFoundryShims } from "./helpers/foundry-shims.mjs";
import { fakeActor } from "./helpers/actor.mjs";

// The API module also opens docks and sheet tabs, which need Foundry's application classes.
vi.mock("../scripts/sheet/dock.mjs", () => ({ LoadoutDock: class {}, canDock: () => false }));
vi.mock("../scripts/sheet/tab.mjs", () => ({ showTab: async () => {} }));

const itemNamed = (actor, name) => actor.items.find(i => i.name === name);
const cellsOf = ctx => Object.values(ctx.groups).flat();
const cell = (ctx, key) => cellsOf(ctx).find(c => c.key === key);

beforeEach(() => installFoundryShims());

describe("unidentified items", () => {
  const mystery = {
    name: "Unidentified Wondrous Item", realName: "Cloak of Displacement", subtype: "wondrous", equipped: true,
    rarity: "rare", attunement: "required", attuned: true, system: { identified: false }
  };

  it("give a player neither rarity nor attunement", () => {
    const ctx = buildLoadoutContext(fakeActor({ items: [mystery] }), { editable: true });
    const back = cell(ctx, "back");
    expect(back.item).toMatchObject({ name: "Unidentified Wondrous Item", rarity: "", attuned: false, inert: false, canAttune: false, concealed: true });
    expect(back.ariaLabel).not.toContain("slot.attuned");
  });

  it("go where their real name says, so identifying them moves nothing", () => {
    const ctx = buildLoadoutContext(fakeActor({ items: [mystery] }));
    expect(cell(ctx, "back").item).not.toBeNull();
  });

  it("show the Gamemaster everything", () => {
    game.user.isGM = true;
    const back = cell(buildLoadoutContext(fakeActor({ items: [mystery] })), "back");
    expect(back.item).toMatchObject({ rarity: "rare", attuned: true, concealed: false });
  });

  it("keep rarity out of the picker too", () => {
    const actor = fakeActor({ items: [{ ...mystery, equipped: false }] });
    const [candidate] = buildPickerContext(actor, "back").candidates;
    expect(candidate).toMatchObject({ rarity: "", canAttune: false });
  });
});

describe("gear warnings and counters on slots", () => {
  const plate = { name: "Plate Armor", subtype: "heavy", equipped: true, system: { strength: 15, proficiencyMultiplier: 0, armor: { value: 18, dex: 0 } } };

  it("mark a worn item, and say why in the accessible name and the item's tooltip", () => {
    const ctx = buildLoadoutContext(fakeActor({ items: [plate], abilities: { str: { value: 12, mod: 1 } } }));
    const body = cell(ctx, "body");
    expect(body.item.warnings).toEqual([`${MODULE_ID}.gear.notProficientArmor`, `${MODULE_ID}.gear.strength:{"score":15}`]);
    expect(body.ariaLabel).toContain("gear.strength");
    expect(body.tooltipExtras).toContain("gear.notProficientArmor");
  });

  it("don't mark packed camp clothes", () => {
    game.settings._values[SETTINGS.slotLayout] = { camp: true };
    const actor = fakeActor({
      items: [{ name: "Fine Clothes", subtype: "clothing", system: { proficiencyMultiplier: 0, strength: 20 } }],
      slots: {}
    });
    const shirt = itemNamed(actor, "Fine Clothes");
    actor.flags[MODULE_ID].slots = { campOutfit: shirt.id };
    const outfit = cell(buildLoadoutContext(actor), "campOutfit");
    expect(outfit.item.warnings).toEqual([]);
  });

  it("show charges left, and flag an empty wand", () => {
    const actor = fakeActor({ items: [
      { name: "Wand of Web", type: "consumable", subtype: "wand", equipped: true, system: { uses: { max: 7, value: 0 } } }
    ] });
    const main = cell(buildLoadoutContext(actor), "mainHand");
    expect(main.item.counter).toMatchObject({ text: "0/7", empty: true });
    expect(main.ariaLabel).toContain("gear.uses");
  });
});

describe("buildPickerContext", () => {
  it("shows each candidate's numbers and how it compares with the occupant", () => {
    const actor = fakeActor({
      abilities: { dex: { value: 14, mod: 2 } },
      items: [
        { name: "Leather Armor", subtype: "light", equipped: true, system: { armor: { value: 11, dex: null } } },
        { name: "Half Plate", subtype: "medium", system: { armor: { value: 15, dex: 2 }, proficiencyMultiplier: 0 } },
        { name: "Padded Armor", subtype: "light", system: { armor: { value: 11, dex: null } } }
      ]
    });
    const picker = buildPickerContext(actor, "body");
    const half = picker.candidates.find(c => c.name === "Half Plate");
    expect(half.stat).toContain("gear.armorDexMax");
    expect(half.delta).toMatchObject({ text: "+4", up: true });
    expect(half.warnings).toEqual([`${MODULE_ID}.gear.notProficientArmor`]);
    // Equal armour class: no chip at all.
    expect(picker.candidates.find(c => c.name === "Padded Armor").delta).toBeNull();
  });

  it("is null for a slot the loadout doesn't have", () => {
    expect(buildPickerContext(fakeActor(), "ring-9")).toBeNull();
  });
});

describe("unequipItem", () => {
  it("takes an Also Worn item off through the write path, firing unequipped with no slot", async () => {
    const actor = fakeActor({ items: ["A", "B", "C"].map(n => ({ name: `Ring ${n}`, subtype: "ring", equipped: true })) });
    const extra = itemNamed(actor, "Ring C");
    expect(readLayout(actor).layout.unslotted.map(i => i.id)).toEqual([extra.id]);
    const events = [];
    Hooks.on(HOOKS.unequipped, p => events.push([p.item.name, p.slot]));
    expect(await unequipItem(actor, extra)).toBe(true);
    expect(extra.system.equipped).toBe(false);
    expect(events).toEqual([["Ring C", null]]);
  });

  it("empties the slot of a slotted item", async () => {
    const actor = fakeActor({ items: [{ name: "Chain Mail", subtype: "heavy", equipped: true }] });
    expect(await unequipItem(actor, itemNamed(actor, "Chain Mail"))).toBe(true);
    expect(readLayout(actor).layout.cells.find(c => c.key === "body").item).toBeNull();
  });

  it("refuses a non-owner", async () => {
    const actor = fakeActor({ items: [{ name: "Ring", subtype: "ring", equipped: true }], isOwner: false });
    expect(await unequipItem(actor, itemNamed(actor, "Ring"), { notify: false })).toBe(false);
    expect(actor.writes).toEqual([]);
  });
});

describe("saved sets through the write path", () => {
  const kit = () => fakeActor({ items: [
    { name: "Chain Mail", subtype: "heavy", equipped: true },
    { name: "Longsword", type: "weapon", subtype: "martialM", equipped: true },
    { name: "Shield", subtype: "shield", equipped: true },
    { name: "Fine Clothes", subtype: "clothing" }
  ] });

  it("saves, swaps out, and puts a set back on", async () => {
    const actor = kit();
    const battle = await saveSet(actor, "Battle");
    expect(readSets(actor).map(s => s.name)).toEqual(["Battle"]);
    expect(ui.notifications.shown.at(-1).message).toContain("sets.saved");
    expect(buildLoadoutContext(actor, { editable: true }).sets.current).toBe("Battle");

    await equipToSlot(actor, itemNamed(actor, "Fine Clothes"), "body");
    expect(buildLoadoutContext(actor, { editable: true }).sets.current).toBe("");

    const events = [];
    Hooks.on(HOOKS.setApplied, p => events.push(p.set.name));
    expect(await applySet(actor, battle.id)).toBe(true);
    expect(itemNamed(actor, "Chain Mail").system.equipped).toBe(true);
    expect(itemNamed(actor, "Fine Clothes").system.equipped).toBe(false);
    expect(buildLoadoutContext(actor, { editable: true }).sets.current).toBe("Battle");
    expect(events).toEqual(["Battle"]);
    // Already wearing it: nothing to do.
    expect(await applySet(actor, "battle")).toBe(false);
  });

  it("replaces a set saved under the same name", async () => {
    const actor = kit();
    const first = await saveSet(actor, "Battle");
    const second = await saveSet(actor, "BATTLE");
    expect(second.id).toBe(first.id);
    expect(readSets(actor)).toHaveLength(1);
    expect(ui.notifications.shown.at(-1).message).toContain("sets.updated");
  });

  it("warns about saved items no longer carried", async () => {
    const actor = kit();
    await saveSet(actor, "Battle");
    actor.items.delete(itemNamed(actor, "Shield").id);
    await equipToSlot(actor, itemNamed(actor, "Fine Clothes"), "body");
    ui.notifications.shown.length = 0;
    expect(await applySet(actor, "Battle")).toBe(true);
    expect(ui.notifications.shown[0]).toMatchObject({ type: "warn" });
    expect(ui.notifications.shown[0].message).toContain("Shield");
  });

  it("finds a deleted and re-added item by name, and stores its new id in the set", async () => {
    const actor = kit();
    await saveSet(actor, "Battle");
    const oldShield = itemNamed(actor, "Shield");
    actor.items.delete(oldShield.id);
    const [newShield] = await actor.createEmbeddedDocuments("Item", [{ name: "Shield", type: "equipment", system: { type: { value: "shield" } } }]);
    ui.notifications.shown.length = 0;
    expect(await applySet(actor, "Battle")).toBe(true);
    expect(newShield.system.equipped).toBe(true);
    expect(ui.notifications.shown).toEqual([]);
    const [stored] = readSets(actor);
    expect(stored.slots.offHand).toBe(newShield.id);
    expect(buildLoadoutContext(actor, { editable: true }).sets.current).toBe("Battle");
  });

  it("preApplySet can refuse before anything is written", async () => {
    const actor = kit();
    await saveSet(actor, "Battle");
    await equipToSlot(actor, itemNamed(actor, "Fine Clothes"), "body");
    Hooks.on(HOOKS.preApplySet, () => false);
    actor.writes.length = 0;
    expect(await applySet(actor, "Battle")).toBe(false);
    expect(actor.writes).toEqual([]);
  });

  it("asks preEquip about every item the set puts in a slot, so a set can't bypass a refusal", async () => {
    const actor = kit();
    await saveSet(actor, "Battle");
    await equipToSlot(actor, itemNamed(actor, "Fine Clothes"), "body");
    const asked = [];
    Hooks.on(HOOKS.preEquip, ({ item, slot }) => {
      asked.push(slot);
      return item.name !== "Chain Mail";
    });
    actor.writes.length = 0;
    expect(await applySet(actor, "Battle", { notify: false })).toBe(false);
    expect(asked).toContain("body");
    expect(actor.writes).toEqual([]);
  });

  it("deletes a set, and refuses one that doesn't exist", async () => {
    const actor = kit();
    const set = await saveSet(actor, "Battle");
    expect(await deleteSet(actor, set.id)).toBe(true);
    expect(readSets(actor)).toEqual([]);
    expect(await deleteSet(actor, set.id, { notify: false })).toBe(false);
    expect(await applySet(actor, "Battle", { notify: false })).toBe(false);
  });

  it("refuses a nameless set and a non-owner", async () => {
    expect(await saveSet(kit(), "   ", { notify: false })).toBeNull();
    const stranger = fakeActor({ isOwner: false });
    expect(await saveSet(stranger, "Mine", { notify: false })).toBeNull();
    expect(stranger.writes).toEqual([]);
  });

  it("offers the button only to someone who may change the loadout, and describes each set", async () => {
    const actor = kit();
    await saveSet(actor, "Battle");
    expect(buildLoadoutContext(actor, { editable: false }).sets).toBeNull();
    const drawer = buildSetsContext(actor);
    expect(drawer.sets).toHaveLength(1);
    expect(drawer.sets[0]).toMatchObject({ name: "Battle", current: true });
  });

  it("stores sets as a list on the actor", async () => {
    const actor = kit();
    await saveSet(actor, "Battle");
    expect(Array.isArray(actor.flags[MODULE_ID][FLAGS.sets])).toBe(true);
  });
});

describe("api", () => {
  it("unequips an Also Worn item and manages sets quietly", async () => {
    const api = createApi();
    const actor = fakeActor({ items: ["A", "B", "C"].map(n => ({ name: `Ring ${n}`, subtype: "ring", equipped: true })) });
    expect(await api.unequip(actor, itemNamed(actor, "Ring C"))).toBe(true);

    const id = await api.saveSet(actor, "Two rings");
    expect(api.sets(actor)).toEqual([expect.objectContaining({ id, name: "Two rings" })]);
    await api.unequip(actor, "ring-1");
    expect(await api.applySet(actor, "Two rings")).toBe(true);
    expect(itemNamed(actor, "Ring A").system.equipped).toBe(true);
    expect(await api.deleteSet(actor, id)).toBe(true);
    expect(ui.notifications.shown).toEqual([]);
  });
});
