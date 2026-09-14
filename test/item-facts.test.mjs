import { describe, expect, it } from "vitest";
import { canAttune, itemFacts, needsAttunement } from "../scripts/data/item-facts.mjs";
import { source } from "./helpers/items.mjs";

describe("itemFacts", () => {
  it("snapshots a dnd5e item", () => {
    const facts = itemFacts(source({
      id: "abc", name: "Flame Tongue", type: "weapon", subtype: "martialM", properties: ["mgc", "ver"],
      equipped: true, attuned: true, attunement: "required", rarity: "rare", sort: 5
    }));
    expect(facts).toMatchObject({
      id: "abc", uuid: "Actor.hero.Item.abc", name: "Flame Tongue", type: "weapon", subtype: "martialM",
      properties: ["mgc", "ver"], equipped: true, attuned: true, attunement: "required", rarity: "rare",
      sort: 5, slottable: true, twoHanded: false, identified: true, slotOverride: null
    });
  });

  it("reads properties from a Set or an array", () => {
    const asArray = source({ name: "Maul", type: "weapon", properties: [] });
    asArray.system.properties = ["two", "hvy"];
    expect(itemFacts(asArray).twoHanded).toBe(true);
  });

  it("marks two-handed only for weapons", () => {
    expect(itemFacts(source({ name: "Greatsword", type: "weapon", properties: ["two"] })).twoHanded).toBe(true);
    expect(itemFacts(source({ name: "Odd Shield", subtype: "shield", properties: ["two"] })).twoHanded).toBe(false);
  });

  it("decides slottable by type, and for consumables by subtype", () => {
    expect(itemFacts(source({ name: "x", type: "equipment" })).slottable).toBe(true);
    expect(itemFacts(source({ name: "x", type: "consumable", subtype: "wand" })).slottable).toBe(true);
    expect(itemFacts(source({ name: "x", type: "consumable", subtype: "potion" })).slottable).toBe(false);
    // Every tool has a slot: instruments their own, everything else the tools slot.
    expect(itemFacts(source({ name: "x", type: "tool" })).slottable).toBe(true);
    expect(itemFacts(source({ name: "x", type: "tool", subtype: "game" })).slottable).toBe(true);
    expect(itemFacts(source({ name: "x", type: "loot" })).slottable).toBe(false);
  });

  it("requires the system to model equipping at all", () => {
    const item = source({ name: "Homebrew", type: "equipment" });
    delete item.system.equipped;
    expect(itemFacts(item).slottable).toBe(false);
  });

  it("survives an item with almost no data", () => {
    const facts = itemFacts({ name: "Broken" });
    expect(facts).toMatchObject({ id: "", name: "Broken", type: "", slottable: false, equipped: false });
    expect(itemFacts(null).slottable).toBe(false);
  });

  it("reads a pinned slot from the module flag", () => {
    expect(itemFacts(source({ name: "Odd Boots", slot: "trinket" })).slotOverride).toBe("trinket");
  });

  it("treats only an explicit identified:false as unidentified", () => {
    const item = source({ name: "Mystery" });
    expect(itemFacts(item).identified).toBe(true);
    item.system.identified = false;
    expect(itemFacts(item).identified).toBe(false);
  });
});

describe("attunement helpers", () => {
  it("canAttune for required and optional", () => {
    expect(canAttune({ attunement: "required" })).toBe(true);
    expect(canAttune({ attunement: "optional" })).toBe(true);
    expect(canAttune({ attunement: "" })).toBe(false);
  });

  it("needsAttunement only when required and not attuned", () => {
    expect(needsAttunement({ attunement: "required", attuned: false })).toBe(true);
    expect(needsAttunement({ attunement: "required", attuned: true })).toBe(false);
    expect(needsAttunement({ attunement: "optional", attuned: false })).toBe(false);
  });
});

describe("itemFacts: what the loadout says about gear", () => {
  it("keeps the real name of an unidentified item apart from the one shown", () => {
    const facts = itemFacts(source({ name: "Unidentified Boots", realName: "Boots of Speed", system: { identified: false } }));
    expect(facts).toMatchObject({ name: "Unidentified Boots", sourceName: "Boots of Speed", identified: false });
  });

  it("reads proficiency only where it applies, and survives a getter that throws", () => {
    expect(itemFacts(source({ name: "Axe", type: "weapon", system: { proficiencyMultiplier: 0 } })).proficient).toBe(0);
    expect(itemFacts(source({ name: "Ring", subtype: "ring", system: { proficiencyMultiplier: 0 } })).proficient).toBeNull();
    const orphan = source({ name: "Plate", subtype: "heavy" });
    Object.defineProperty(orphan.system, "proficiencyMultiplier", { get() { throw new Error("no actor"); } });
    expect(itemFacts(orphan).proficient).toBeNull();
  });

  it("reads strength, uses, quantity and armour", () => {
    const facts = itemFacts(source({
      name: "Plate Armor", subtype: "heavy",
      system: { strength: 15, quantity: 1, armor: { value: 19, base: 18, dex: 0 }, uses: { max: "3", spent: 1 } }
    }));
    expect(facts).toMatchObject({ strength: 15, quantity: 1, armor: { value: 19, base: 18, dex: 0 }, uses: { value: 2, max: 3 } });
    expect(itemFacts(source({ name: "Cloak", subtype: "wondrous", system: { strength: 15 } })).strength).toBe(15);
    expect(itemFacts(source({ name: "Dagger", type: "weapon" })).armor).toBeNull();
    expect(itemFacts(source({ name: "Studded", subtype: "light", system: { armor: { value: 12, dex: "" } } })).armor.dex).toBeNull();
  });

  it("reads damage from dnd5e's labels, and works out the versatile dice", () => {
    const sword = source({ name: "Longsword", type: "weapon", properties: ["ver"], system: {
      damage: { base: { formula: "1d8", number: 1, denomination: 8, steppedDenomination: () => 10 }, versatile: { number: null, denomination: null } }
    } });
    sword.labels = { damage: "1d8", damageTypes: "Slashing" };
    expect(itemFacts(sword).damage).toEqual({ formula: "1d8", types: "Slashing", versatile: "1d10" });
    expect(itemFacts(source({ name: "Club", type: "weapon" })).damage).toBeNull();
  });
});
