import { beforeEach, describe, expect, it } from "vitest";
import { SETTINGS } from "../scripts/config.mjs";
import { describeChanges } from "../scripts/data/changes.mjs";
import { planPlace, planRemove } from "../scripts/data/layout.mjs";
import { applySet, equipToSlot, saveSet, unequipItem, unequipSlot } from "../scripts/loadout/actions.mjs";
import { readLayout } from "../scripts/loadout/context.mjs";
import { installFoundryShims } from "./helpers/foundry-shims.mjs";
import { fakeActor } from "./helpers/actor.mjs";

beforeEach(() => installFoundryShims());

const itemNamed = (actor, name) => actor.items.find(i => i.name === name);

/** Plan a placement on an actor and describe it, as the write path would. */
function describePlace(actor, name, targetKey, sourceKey = null) {
  const { layout, items } = readLayout(actor);
  const plan = planPlace(layout, { targetKey, item: items.find(i => i.name === name), sourceKey });
  return describeChanges(layout, plan).map(summary);
}

/** A change reduced to names and slot keys. */
const summary = ({ action, item, other, from, to }) => ({
  action, item: item.name, other: other?.name ?? null, from: from?.key ?? null, to: to?.key ?? null
});

const cards = () => ChatMessage.created.map(message => ({ ...message, content: JSON.parse(message.content) }));

describe("describeChanges", () => {
  it("equips into an empty slot", () => {
    const actor = fakeActor({ items: [{ name: "Boots of Speed", subtype: "wondrous" }] });
    expect(describePlace(actor, "Boots of Speed", "feet")).toEqual([
      { action: "equip", item: "Boots of Speed", other: null, from: null, to: "feet" }
    ]);
  });

  it("says one line when the new item replaces the occupant", () => {
    const actor = fakeActor({ items: [
      { name: "Chain Mail", subtype: "heavy", equipped: true },
      { name: "Leather Armor", subtype: "light" }
    ] });
    expect(describePlace(actor, "Leather Armor", "body")).toEqual([
      { action: "replace", item: "Leather Armor", other: "Chain Mail", from: null, to: "body" }
    ]);
  });

  it("moves between slots", () => {
    const actor = fakeActor({ items: [{ name: "Ring A", subtype: "ring", equipped: true }] });
    expect(describePlace(actor, "Ring A", "ring-2", "ring-1")).toEqual([
      { action: "move", item: "Ring A", other: null, from: "ring-1", to: "ring-2" }
    ]);
  });

  it("folds two placements into one swap", () => {
    const actor = fakeActor({ items: [
      { name: "Ring A", subtype: "ring", equipped: true, sort: 1 },
      { name: "Ring B", subtype: "ring", equipped: true, sort: 2 }
    ] });
    expect(describePlace(actor, "Ring A", "ring-2", "ring-1")).toEqual([
      { action: "swap", item: "Ring A", other: "Ring B", from: "ring-1", to: "ring-2" }
    ]);
  });

  it("reports the off hand a two-handed weapon clears", () => {
    const actor = fakeActor({ items: [
      { name: "Shield", subtype: "shield", equipped: true },
      { name: "Greatsword", type: "weapon", subtype: "martialM", properties: ["two"] }
    ] });
    expect(describePlace(actor, "Greatsword", "mainHand")).toEqual([
      { action: "equip", item: "Greatsword", other: null, from: null, to: "mainHand" },
      { action: "unequip", item: "Shield", other: null, from: "offHand", to: null }
    ]);
  });

  it("packs into camp and takes out of camp", () => {
    game.settings._values[SETTINGS.slotLayout] = { camp: true };
    const actor = fakeActor({ items: [{ name: "Fine Clothes", subtype: "clothing" }] });
    expect(describePlace(actor, "Fine Clothes", "campOutfit")).toEqual([
      { action: "pack", item: "Fine Clothes", other: null, from: null, to: "campOutfit" }
    ]);
    const packed = fakeActor({ items: [{ name: "Fine Clothes", subtype: "clothing" }] });
    packed.flags["sogrom-simple-dnd5e-loadout"].slots = { campOutfit: itemNamed(packed, "Fine Clothes").id };
    const { layout } = readLayout(packed);
    expect(describeChanges(layout, planRemove(layout, "campOutfit")).map(summary)).toEqual([
      { action: "unpack", item: "Fine Clothes", other: null, from: "campOutfit", to: null }
    ]);
  });
});

describe("chat cards", () => {
  it("post nothing while the setting is off, its default", async () => {
    const actor = fakeActor({ items: [{ name: "Boots of Speed", subtype: "wondrous" }] });
    await equipToSlot(actor, itemNamed(actor, "Boots of Speed"), "feet");
    expect(ChatMessage.created).toEqual([]);
  });

  it("post publicly, spoken by the actor, with escaped names", async () => {
    game.settings._values[SETTINGS.chatCards] = "public";
    const actor = fakeActor({ items: [{ name: "Boots <of> Speed", subtype: "wondrous", img: "boots.webp" }] });
    await equipToSlot(actor, itemNamed(actor, "Boots <of> Speed"), "feet");
    const [card] = cards();
    expect(card.whisper).toEqual([]);
    expect(card.speaker).toEqual({ actor: "hero", alias: "Hero" });
    expect(card.content.path).toContain("chat-card.hbs");
    expect(card.content.lines).toHaveLength(1);
    expect(card.content.lines[0].img).toBe("boots.webp");
    expect(card.content.lines[0].text).toContain("chat.change.equip");
    expect(card.content.lines[0].text).not.toContain("<of>");
  });

  it("whisper to the GMs when set to Gamemaster only", async () => {
    game.settings._values[SETTINGS.chatCards] = "gm";
    const actor = fakeActor({ items: [{ name: "Cloak of Protection", subtype: "wondrous", equipped: true }] });
    await unequipSlot(actor, "back");
    const [card] = cards();
    expect(card.whisper).toEqual(["gm-user"]);
    expect(card.content.lines[0].text).toContain("chat.change.unequip");
  });

  it("post nothing for a refused change", async () => {
    game.settings._values[SETTINGS.chatCards] = "public";
    const actor = fakeActor({ items: [{ name: "Chain Mail", subtype: "heavy" }] });
    await equipToSlot(actor, itemNamed(actor, "Chain Mail"), "head", { notify: false });
    expect(ChatMessage.created).toEqual([]);
  });

  it("name no slot for an item taken off from Also Worn", async () => {
    game.settings._values[SETTINGS.chatCards] = "public";
    const actor = fakeActor({ items: [
      { name: "Ring A", subtype: "ring", equipped: true, sort: 1 },
      { name: "Ring B", subtype: "ring", equipped: true, sort: 2 },
      { name: "Ring C", subtype: "ring", equipped: true, sort: 3 }
    ] });
    await unequipItem(actor, itemNamed(actor, "Ring C"));
    expect(cards()[0].content.lines.map(l => l.text)).toEqual([expect.stringContaining("chat.change.unequipWorn")]);
  });

  it("put the set's name in the flavour and one line per change", async () => {
    const actor = fakeActor({ items: [
      { name: "Chain Mail", subtype: "heavy", equipped: true },
      { name: "Leather Armor", subtype: "light" }
    ] });
    const battle = await saveSet(actor, "Battle");
    await equipToSlot(actor, itemNamed(actor, "Leather Armor"), "body");
    game.settings._values[SETTINGS.chatCards] = "public";
    await applySet(actor, battle.id);
    const [card] = cards();
    expect(card.flavor).toContain("chat.flavorSet");
    expect(card.flavor).toContain("Battle");
    expect(card.content.lines.map(l => l.text)).toEqual([expect.stringContaining("chat.change.replace")]);
  });

  it("never fail the change when posting throws", async () => {
    game.settings._values[SETTINGS.chatCards] = "public";
    ChatMessage.create = async () => { throw new Error("offline"); };
    const actor = fakeActor({ items: [{ name: "Boots of Speed", subtype: "wondrous" }] });
    expect(await equipToSlot(actor, itemNamed(actor, "Boots of Speed"), "feet")).toBe(true);
  });
});
