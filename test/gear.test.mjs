import { describe, expect, it } from "vitest";
import { gearCounter, gearDelta, gearStat, gearWarnings } from "../scripts/data/gear.mjs";
import { make } from "./helpers/items.mjs";

const plate = (extra = {}) => make({
  name: "Plate Armor", subtype: "heavy", system: { armor: { value: 18, base: 18, dex: 0 }, strength: 15, proficiencyMultiplier: 1 }, ...extra
});
const halfPlate = (system = {}) => make({ name: "Half Plate", subtype: "medium", system: { armor: { value: 15, dex: 2 }, ...system } });
const studded = (system = {}) => make({ name: "Studded Leather", subtype: "light", system: { armor: { value: 12, dex: null }, ...system } });

describe("gearWarnings", () => {
  it("warns about a weapon or armour the character isn't proficient with", () => {
    const sword = make({ name: "Longsword", type: "weapon", subtype: "martialM", system: { proficiencyMultiplier: 0 } });
    expect(gearWarnings(sword)).toEqual([{ key: "notProficientWeapon" }]);
    expect(gearWarnings(halfPlate({ proficiencyMultiplier: 0 }))).toEqual([{ key: "notProficientArmor" }]);
  });

  it("says nothing when proficient, or when proficiency is unknown", () => {
    expect(gearWarnings(halfPlate({ proficiencyMultiplier: 1 }))).toEqual([]);
    expect(gearWarnings(halfPlate())).toEqual([]);
    // Half proficiency still counts as proficient.
    expect(gearWarnings(halfPlate({ proficiencyMultiplier: 0.5 }))).toEqual([]);
  });

  it("warns when Strength is below what the armour needs", () => {
    expect(gearWarnings(plate(), { strength: 13 })).toEqual([{ key: "strength", data: { score: 15 } }]);
    expect(gearWarnings(plate(), { strength: 15 })).toEqual([]);
    // Without the character's score there is nothing to compare.
    expect(gearWarnings(plate(), {})).toEqual([]);
  });
});

describe("gearCounter", () => {
  it("prefers charges, then quantity above one", () => {
    const wand = make({ name: "Wand of Magic Missiles", type: "consumable", subtype: "wand", system: { uses: { max: 7, value: 3 }, quantity: 1 } });
    expect(gearCounter(wand)).toEqual({ kind: "uses", value: 3, max: 7 });
    const javelins = make({ name: "Javelin", type: "weapon", system: { quantity: 5 } });
    expect(gearCounter(javelins)).toEqual({ kind: "quantity", value: 5 });
    expect(gearCounter(make({ name: "Dagger", type: "weapon", system: { quantity: 1 } }))).toBeNull();
  });
});

describe("gearStat", () => {
  it("heavy armour ignores Dexterity, medium caps it, light takes all of it", () => {
    expect(gearStat(plate(), { dexMod: 3 })).toMatchObject({ key: "armor", data: { ac: 18 }, effective: 18 });
    expect(gearStat(halfPlate(), { dexMod: 3 })).toMatchObject({ key: "armorDexMax", data: { ac: 15, max: 2 }, effective: 17 });
    expect(gearStat(studded(), { dexMod: 3 })).toMatchObject({ key: "armorDex", data: { ac: 12 }, effective: 15 });
  });

  it("leaves a magic bonus out for an unidentified item seen by a player", () => {
    const magic = make({ name: "Armor", subtype: "light", system: { armor: { value: 14, base: 12, dex: null } } });
    expect(gearStat(magic).data.ac).toBe(14);
    expect(gearStat(magic, { concealed: true }).data.ac).toBe(12);
  });

  it("reads a shield as a bonus", () => {
    const shield = make({ name: "Shield", subtype: "shield", system: { armor: { value: 2 } } });
    expect(gearStat(shield)).toMatchObject({ category: "shield", key: "shield", data: { ac: 2 }, effective: 2 });
  });

  it("reads a weapon's damage, versatile included", () => {
    const sword = make({
      name: "Longsword", type: "weapon", subtype: "martialM", properties: ["ver"],
      system: { damage: { base: { formula: "1d8", number: 1, denomination: 8, steppedDenomination: () => 10 }, versatile: {} } }
    });
    expect(gearStat(sword)).toMatchObject({ category: "weapon", key: "damageVersatile", data: { formula: "1d8", versatile: "1d10" }, effective: null });
  });

  it("has nothing to say about a ring", () => {
    expect(gearStat(make({ name: "Ring", subtype: "ring" }))).toBeNull();
  });
});

describe("gearDelta", () => {
  it("compares like with like only", () => {
    const a = gearStat(plate(), { dexMod: 2 });
    const b = gearStat(studded(), { dexMod: 2 });
    expect(gearDelta(a, b)).toBe(4);
    expect(gearDelta(b, a)).toBe(-4);
    const shield = gearStat(make({ name: "Shield", subtype: "shield", system: { armor: { value: 2 } } }));
    expect(gearDelta(shield, a)).toBeNull();
    expect(gearDelta(a, null)).toBeNull();
  });
});
