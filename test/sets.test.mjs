import { describe, expect, it } from "vitest";
import { buildSlots } from "../scripts/data/slots.mjs";
import { resolveLayout } from "../scripts/data/layout.mjs";
import {
  MAX_SETS, captureSet, cleanSetName, findSet, matchingSet, normaliseSets, planApplySet, upsertSet
} from "../scripts/data/sets.mjs";
import {
  boots, chainMail, cloak, greatsword, leather, longbow, longsword, ring, shield, softShoes
} from "./helpers/items.mjs";

/** A layout from items and assignments, like readLayout without Foundry. */
function layoutOf(items, { assignments = {}, layout = {}, strict = false } = {}) {
  return resolveLayout({ slots: buildSlots(layout), assignments, items, strict });
}

const wearing = (item) => ({ ...item, equipped: true });

describe("cleanSetName", () => {
  it("trims, collapses spaces and shortens", () => {
    expect(cleanSetName("  Battle   Gear ")).toBe("Battle Gear");
    expect(cleanSetName("x".repeat(80))).toHaveLength(40);
    expect(cleanSetName(null)).toBe("");
  });
});

describe("normaliseSets", () => {
  it("drops malformed entries and duplicates", () => {
    const sets = normaliseSets([
      { id: "a", name: "Battle", slots: { body: "armour", head: 5 }, alsoWorn: ["x", 3] },
      { id: "a", name: "Duplicate" },
      { id: "b", name: "  " },
      null,
      { name: "No id" }
    ]);
    expect(sets).toEqual([{ id: "a", name: "Battle", slots: { body: "armour" }, alsoWorn: ["x"], names: {} }]);
    expect(normaliseSets("nonsense")).toEqual([]);
  });
});

describe("captureSet / matchingSet", () => {
  it("records filled slots and Also Worn, and recognises the loadout wearing it", () => {
    const items = [wearing(chainMail()), wearing(ring("Ring A")), wearing(ring("Ring B")), wearing(ring("Ring C"))];
    const layout = layoutOf(items);
    const set = captureSet(layout, { id: "s1", name: "Battle" });
    expect(set.slots).toEqual({ body: items[0].id, "ring-1": items[1].id, "ring-2": items[2].id });
    expect(set.alsoWorn).toEqual([items[3].id]);
    expect(set.names[items[3].id]).toBe("Ring C");
    expect(matchingSet([set], layout)).toBe(set);

    const changed = layoutOf([items[0], items[1], items[2], { ...items[3], equipped: false }]);
    expect(matchingSet([set], changed)).toBeNull();
  });
});

describe("upsertSet / findSet", () => {
  it("replaces a set of the same name, keeping its id", () => {
    const first = { id: "a", name: "Battle", slots: {}, alsoWorn: [], names: {} };
    const result = upsertSet([first], { id: "b", name: "battle", slots: { head: "h" }, alsoWorn: [], names: {} });
    expect(result.replaced).toBe(true);
    expect(result.sets).toHaveLength(1);
    expect(result.set).toMatchObject({ id: "a", slots: { head: "h" } });
    expect(findSet(result.sets, "BATTLE").id).toBe("a");
    expect(findSet(result.sets, "a").name).toBe("battle");
  });

  it("refuses a nameless set and a full list", () => {
    expect(upsertSet([], { id: "a", name: "" })).toEqual({ error: "setNoName" });
    const full = Array.from({ length: MAX_SETS }, (_, i) => ({ id: `s${i}`, name: `Set ${i}` }));
    expect(upsertSet(full, { id: "new", name: "One more" })).toEqual({ error: "setsFull" });
  });
});

describe("planApplySet", () => {
  it("puts the saved items back and takes everything else off", () => {
    const mail = chainMail();
    const hide = leather();
    const sword = longsword();
    const guard = shield();
    const set = { id: "s", name: "Battle", slots: { body: mail.id, mainHand: sword.id, offHand: guard.id }, alsoWorn: [], names: {} };
    // Now wearing leather and boots, no weapons.
    const items = [mail, wearing(hide), sword, guard, wearing(boots())];
    const plan = planApplySet(layoutOf(items), items, set);
    expect(plan.assignments).toMatchObject({ body: mail.id, mainHand: sword.id, offHand: guard.id, feet: null });
    expect(plan.equip.sort()).toEqual([mail.id, sword.id, guard.id].sort());
    expect(plan.unequip.sort()).toEqual([hide.id, items[4].id].sort());
    expect(plan.removed.map(r => r.key).sort()).toEqual(["body", "feet"]);
    expect(plan.placed.map(p => p.key).sort()).toEqual(["body", "mainHand", "offHand"]);
    expect(plan.missing).toEqual([]);
    expect(plan.unchanged).toBe(false);
  });

  it("changes nothing when the set is already worn", () => {
    const items = [wearing(chainMail()), wearing(cloak())];
    const layout = layoutOf(items);
    const plan = planApplySet(layout, items, captureSet(layout, { id: "s", name: "Now" }));
    expect(plan.unchanged).toBe(true);
    expect([plan.equip, plan.unequip]).toEqual([[], []]);
  });

  it("names saved items that are no longer carried, and wears the rest", () => {
    const mail = chainMail();
    const set = { id: "s", name: "Battle", slots: { body: mail.id, head: "gone" }, alsoWorn: [], names: { gone: "Helm of Brilliance" } };
    const plan = planApplySet(layoutOf([mail]), [mail], set);
    expect(plan.missing).toEqual(["Helm of Brilliance"]);
    expect(plan.equip).toEqual([mail.id]);
  });

  it("judges the off hand against the main hand the set puts on", () => {
    const sword = longsword();
    const guard = shield();
    const big = greatsword();
    // Currently a greatsword in both hands; the set is sword and board.
    const items = [wearing(big), sword, guard];
    const set = { id: "s", name: "Sword and board", slots: { mainHand: sword.id, offHand: guard.id }, alsoWorn: [], names: {} };
    const plan = planApplySet(layoutOf(items), items, set);
    expect(plan.assignments).toMatchObject({ mainHand: sword.id, offHand: guard.id });
    expect(plan.unequip).toEqual([big.id]);
  });

  it("never puts something in an off hand its main hand's two-handed weapon needs", () => {
    const bow = longbow();
    const guard = shield();
    const set = { id: "s", name: "Odd", slots: { mainHand: bow.id, offHand: guard.id }, alsoWorn: [], names: {} };
    const plan = planApplySet(layoutOf([bow, guard]), [bow, guard], set);
    expect(plan.assignments.offHand).toBeNull();
    // Still worn: the loadout will place it wherever it fits, or list it under Also Worn.
    expect(plan.equip.sort()).toEqual([bow.id, guard.id].sort());
  });

  it("still wears an item whose saved slot the layout no longer has", () => {
    const r3 = ring("Ring C");
    const set = { id: "s", name: "Rings", slots: { "ring-3": r3.id }, alsoWorn: [], names: {} };
    const plan = planApplySet(layoutOf([r3]), [r3], set);
    expect(plan.equip).toEqual([r3.id]);
    expect(Object.values(plan.assignments)).not.toContain(r3.id);
  });

  it("keeps Also Worn items on", () => {
    const extra = ring("Ring C");
    const set = { id: "s", name: "Rings", slots: {}, alsoWorn: [extra.id], names: {} };
    expect(planApplySet(layoutOf([extra]), [extra], set).equip).toEqual([extra.id]);
  });

  it("packs camp clothes rather than wearing them", () => {
    const shoes = wearing(softShoes());
    const set = { id: "s", name: "Camp", slots: { campFootwear: shoes.id }, alsoWorn: [], names: {} };
    const layout = layoutOf([shoes], { layout: { camp: true } });
    const plan = planApplySet(layout, [shoes], set);
    expect(plan.assignments.campFootwear).toBe(shoes.id);
    expect(plan.unequip).toEqual([shoes.id]);
  });
});
