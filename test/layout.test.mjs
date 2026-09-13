import { describe, expect, it } from "vitest";
import { buildSlots } from "../scripts/data/slots.mjs";
import {
  candidateKinds, candidatesFor, planPlace, planRemove, resolveLayout, snapshot, suggestSlot
} from "../scripts/data/layout.mjs";
import {
  amulet, boots, chainMail, cloak, dagger, greatsword, iounStone, leather, longsword, make, potion, ring, shield
} from "./helpers/items.mjs";

/** Resolve a layout from items and assignments on the default doll. */
function layoutOf(items, assignments = {}, { strict = false, slots = buildSlots() } = {}) {
  return resolveLayout({ slots, assignments, items, strict });
}

const cell = (layout, key) => layout.cells.find(c => c.key === key);
const itemIn = (layout, key) => cell(layout, key)?.item?.id ?? null;

/** Apply a plan to a set of facts, as the controller would: flags and equipped state. */
function apply(items, plan) {
  const next = items.map(item => ({
    ...item,
    equipped: plan.equip.includes(item.id) ? true : plan.unequip.includes(item.id) ? false : item.equipped
  }));
  return { items: next, assignments: plan.assignments };
}

describe("resolveLayout", () => {
  it("draws an empty doll for a character with nothing equipped", () => {
    const layout = layoutOf([longsword(), chainMail()]);
    expect(layout.cells.every(c => !c.item)).toBe(true);
    expect(layout.unslotted).toEqual([]);
  });

  it("honours an assignment to a worn item", () => {
    const b = boots({ equipped: true });
    const layout = layoutOf([b], { "trinket-2": b.id });
    expect(itemIn(layout, "trinket-2")).toBe(b.id);
    expect(cell(layout, "trinket-2").pinned).toBe(true);
    expect(itemIn(layout, "feet")).toBeNull();
  });

  it("ignores an assignment to an item that is no longer equipped — system.equipped wins", () => {
    const c = cloak({ equipped: false });
    const layout = layoutOf([c], { back: c.id });
    expect(itemIn(layout, "back")).toBeNull();
  });

  it("ignores assignments to deleted items", () => {
    expect(itemIn(layoutOf([], { back: "gone" }), "back")).toBeNull();
  });

  it("ignores an assignment the slot would refuse, and auto-places the item instead", () => {
    const armour = chainMail({ equipped: true });
    const layout = layoutOf([armour], { head: armour.id });
    expect(itemIn(layout, "head")).toBeNull();
    expect(itemIn(layout, "body")).toBe(armour.id);
    expect(cell(layout, "body").pinned).toBe(false);
  });

  it("uses an item at most once even if two slots claim it", () => {
    const r = ring("Ring of Warmth", { equipped: true });
    const layout = layoutOf([r], { "ring-1": r.id, "ring-2": r.id });
    expect(itemIn(layout, "ring-1")).toBe(r.id);
    expect(itemIn(layout, "ring-2")).toBeNull();
  });

  it("auto-places worn items where they naturally belong", () => {
    const items = [
      chainMail({ equipped: true }), longsword({ equipped: true }), shield({ equipped: true }),
      boots({ equipped: true }), cloak({ equipped: true }), amulet({ equipped: true }), iounStone({ equipped: true })
    ];
    const layout = layoutOf(items);
    expect(itemIn(layout, "body")).toBe(items[0].id);
    expect(itemIn(layout, "mainHand")).toBe(items[1].id);
    expect(itemIn(layout, "offHand")).toBe(items[2].id);
    expect(itemIn(layout, "feet")).toBe(items[3].id);
    expect(itemIn(layout, "back")).toBe(items[4].id);
    expect(itemIn(layout, "neck")).toBe(items[5].id);
    expect(itemIn(layout, "trinket-1")).toBe(items[6].id);
  });

  it("fills repeated slots in order and overflows accessories to trinkets", () => {
    const amulets = [amulet({ equipped: true, sort: 1 }), amulet({ equipped: true, sort: 2 })];
    const layout = layoutOf(amulets);
    expect(itemIn(layout, "neck")).toBe(amulets[0].id);
    expect(itemIn(layout, "trinket-1")).toBe(amulets[1].id);
  });

  it("a second weapon goes to the off hand", () => {
    const a = longsword({ equipped: true, sort: 1 });
    const b = dagger({ equipped: true, sort: 2 });
    const layout = layoutOf([a, b]);
    expect(itemIn(layout, "mainHand")).toBe(a.id);
    expect(itemIn(layout, "offHand")).toBe(b.id);
  });

  it("lists worn items with no room as unslotted, rather than dropping them", () => {
    const rings = [1, 2, 3].map(n => ring(`Ring ${n}`, { equipped: true, sort: n }));
    const layout = layoutOf(rings);
    expect(itemIn(layout, "ring-1")).toBe(rings[0].id);
    expect(itemIn(layout, "ring-2")).toBe(rings[1].id);
    expect(layout.unslotted.map(i => i.id)).toEqual([rings[2].id]);
  });

  it("puts a worn item in a disabled slot's kind among the unslotted when nothing else fits", () => {
    const b = boots({ equipped: true });
    const layout = layoutOf([b], {}, { slots: buildSlots({ trinkets: 0, disabled: ["feet"] }) });
    expect(layout.unslotted.map(i => i.id)).toEqual([b.id]);
  });

  it("never shows unslottable items, even when equipped", () => {
    expect(layoutOf([potion({ equipped: true })]).unslotted).toEqual([]);
  });

  it("is deterministic: input order does not change the result", () => {
    const items = [1, 2, 3].map(n => ring(`Ring ${n}`, { equipped: true, sort: 0 }));
    const a = snapshot(layoutOf(items));
    const b = snapshot(layoutOf([...items].reverse()));
    expect(a).toEqual(b);
  });

  describe("two-handed weapons", () => {
    it("block the off hand and show the weapon as a ghost there", () => {
      const g = greatsword({ equipped: true });
      const layout = layoutOf([g]);
      const off = cell(layout, "offHand");
      expect(itemIn(layout, "mainHand")).toBe(g.id);
      expect(off).toMatchObject({ blocked: true, conflict: false });
      expect(off.blockedBy.id).toBe(g.id);
    });

    it("auto-placement never creates a conflict", () => {
      const s = shield({ equipped: true, sort: 1 });
      const g = greatsword({ equipped: true, sort: 2 });
      const layout = layoutOf([s, g]);
      expect(itemIn(layout, "offHand")).toBe(s.id);
      expect(itemIn(layout, "mainHand")).toBeNull();
      expect(layout.unslotted.map(i => i.id)).toEqual([g.id]);
    });

    it("an off-hand item auto-placed after a two-hander goes unslotted", () => {
      const g = greatsword({ equipped: true, sort: 1 });
      const s = shield({ equipped: true, sort: 2 });
      const layout = layoutOf([g, s]);
      expect(itemIn(layout, "offHand")).toBeNull();
      expect(layout.unslotted.map(i => i.id)).toEqual([s.id]);
    });

    it("pinned assignments that disagree are shown as a conflict, not silently rearranged", () => {
      const g = greatsword({ equipped: true });
      const s = shield({ equipped: true });
      const layout = layoutOf([g, s], { mainHand: g.id, offHand: s.id });
      expect(cell(layout, "offHand")).toMatchObject({ blocked: true, conflict: true });
      expect(itemIn(layout, "offHand")).toBe(s.id);
    });
  });

  it("strict mode keeps an assignment to the wrong accessory slot from sticking", () => {
    const b = boots({ equipped: true });
    const lenient = layoutOf([b], { head: b.id });
    const strict = layoutOf([b], { head: b.id }, { strict: true });
    expect(itemIn(lenient, "head")).toBe(b.id);
    expect(itemIn(strict, "head")).toBeNull();
    expect(itemIn(strict, "feet")).toBe(b.id);
  });
});

describe("candidateKinds", () => {
  it("one-handed weapons may go in either hand; two-handed only the main", () => {
    expect(candidateKinds(longsword())).toEqual(["mainHand", "offHand"]);
    expect(candidateKinds(greatsword())).toEqual(["mainHand"]);
  });

  it("accessories fall back to trinket slots", () => {
    expect(candidateKinds(boots())).toEqual(["feet", "trinket"]);
    expect(candidateKinds(ring())).toEqual(["ring"]);
    expect(candidateKinds(potion())).toEqual([]);
  });
});

describe("planPlace", () => {
  it("equips an unworn item into an empty slot", () => {
    const b = boots();
    const layout = layoutOf([b]);
    const plan = planPlace(layout, { targetKey: "feet", item: b });
    expect(plan.equip).toEqual([b.id]);
    expect(plan.unequip).toEqual([]);
    expect(plan.assignments.feet).toBe(b.id);
    expect(plan.placed).toEqual([{ item: b, key: "feet" }]);
  });

  it("pins every auto-placed item so a later render cannot shuffle them", () => {
    const worn = [boots({ equipped: true }), cloak({ equipped: true })];
    const a = amulet();
    const plan = planPlace(layoutOf([...worn, a]), { targetKey: "neck", item: a });
    expect(plan.assignments.feet).toBe(worn[0].id);
    expect(plan.assignments.back).toBe(worn[1].id);
  });

  it("replaces an occupant, unequipping it", () => {
    const old = chainMail({ equipped: true });
    const neu = leather();
    const plan = planPlace(layoutOf([old, neu]), { targetKey: "body", item: neu });
    expect(plan.assignments.body).toBe(neu.id);
    expect(plan.unequip).toEqual([old.id]);
    expect(plan.removed).toEqual([{ item: old, key: "body" }]);
  });

  it("moves an item already worn elsewhere instead of duplicating it — and does not re-equip it", () => {
    const b = boots({ equipped: true });
    const layout = layoutOf([b]);
    const plan = planPlace(layout, { targetKey: "trinket-3", item: b, sourceKey: "feet" });
    expect(plan.assignments.feet).toBeNull();
    expect(plan.assignments["trinket-3"]).toBe(b.id);
    expect(plan.equip).toEqual([]);
    expect(plan.unequip).toEqual([]);
  });

  it("swaps two slotted items when dragged between slots that accept both", () => {
    const r1 = ring("Ring A", { equipped: true, sort: 1 });
    const r2 = ring("Ring B", { equipped: true, sort: 2 });
    const layout = layoutOf([r1, r2]);
    const plan = planPlace(layout, { targetKey: "ring-2", item: r1, sourceKey: "ring-1" });
    expect(plan.assignments["ring-1"]).toBe(r2.id);
    expect(plan.assignments["ring-2"]).toBe(r1.id);
    expect(plan.unequip).toEqual([]);
    expect(plan.placed.map(p => p.key)).toEqual(["ring-2", "ring-1"]);
  });

  it("does not swap into a slot the occupant would not fit; the occupant comes off instead", () => {
    const d = dagger({ equipped: true, sort: 1 });
    const s = shield({ equipped: true, sort: 2 });
    const layout = layoutOf([d, s]);
    expect(itemIn(layout, "mainHand")).toBe(d.id);
    expect(itemIn(layout, "offHand")).toBe(s.id);
    // Dagger dragged from the main hand onto the shield: a shield cannot go in the main hand.
    const plan = planPlace(layout, { targetKey: "offHand", item: d, sourceKey: "mainHand" });
    expect(plan.assignments.offHand).toBe(d.id);
    expect(plan.assignments.mainHand).toBeNull();
    expect(plan.unequip).toEqual([s.id]);
  });

  it("a two-handed weapon into the main hand clears the off hand", () => {
    const d = longsword({ equipped: true, sort: 1 });
    const s = shield({ equipped: true, sort: 2 });
    const g = greatsword();
    const plan = planPlace(layoutOf([d, s, g]), { targetKey: "mainHand", item: g });
    expect(plan.assignments.mainHand).toBe(g.id);
    expect(plan.assignments.offHand).toBeNull();
    expect(plan.unequip.sort()).toEqual([d.id, s.id].sort());
    expect(plan.equip).toEqual([g.id]);
  });

  it("refuses anything into an off hand blocked by a two-handed weapon", () => {
    const g = greatsword({ equipped: true });
    const s = shield();
    expect(planPlace(layoutOf([g, s]), { targetKey: "offHand", item: s })).toEqual({ error: "offHandBlocked" });
  });

  it("refuses a two-handed weapon in the off hand with the specific reason", () => {
    const g = greatsword();
    expect(planPlace(layoutOf([g]), { targetKey: "offHand", item: g })).toEqual({ error: "twoHandedOffHand" });
  });

  it("refuses the wrong slot, unknown slots and unslottable items", () => {
    const armour = chainMail();
    const layout = layoutOf([armour, potion()]);
    expect(planPlace(layout, { targetKey: "head", item: armour })).toEqual({ error: "wrongSlot" });
    expect(planPlace(layout, { targetKey: "tail", item: armour })).toEqual({ error: "unknownSlot" });
    expect(planPlace(layout, { targetKey: "trinket-1", item: potion() })).toEqual({ error: "notSlottable" });
    expect(planPlace(layout, { targetKey: "body", item: null })).toEqual({ error: "notSlottable" });
  });

  it("dropping an item on its own slot changes nothing but pinning", () => {
    const b = boots({ equipped: true });
    const plan = planPlace(layoutOf([b]), { targetKey: "feet", item: b, sourceKey: "feet" });
    expect(plan.assignments.feet).toBe(b.id);
    expect(plan.equip).toEqual([]);
    expect(plan.unequip).toEqual([]);
  });

  it("round-trips: resolving the applied plan shows exactly what was planned", () => {
    let items = [chainMail({ equipped: true }), longsword({ equipped: true }), boots(), ring("Ring A"), ring("Ring B")];
    let assignments = {};
    const steps = [
      ["feet", items[2]],
      ["ring-2", items[3]],
      ["ring-1", items[4]],
      ["trinket-1", items[2]]
    ];
    for ( const [key, item] of steps ) {
      const layout = layoutOf(items, assignments);
      const current = items.find(i => i.id === item.id);
      const plan = planPlace(layout, { targetKey: key, item: current });
      expect(plan.error).toBeUndefined();
      ({ items, assignments } = apply(items, plan));
      expect(itemIn(layoutOf(items, assignments), key)).toBe(item.id);
    }
    const final = layoutOf(items, assignments);
    expect(itemIn(final, "feet")).toBeNull();
    expect(itemIn(final, "trinket-1")).toBe(items[2].id);
    expect(itemIn(final, "ring-1")).toBe(items[4].id);
    expect(itemIn(final, "ring-2")).toBe(items[3].id);
    expect(itemIn(final, "body")).toBe(items[0].id);
  });
});

describe("planRemove", () => {
  it("empties the slot and unequips the item", () => {
    const c = cloak({ equipped: true });
    const plan = planRemove(layoutOf([c]), "back");
    expect(plan.assignments.back).toBeNull();
    expect(plan.unequip).toEqual([c.id]);
    expect(plan.removed).toEqual([{ item: c, key: "back" }]);
  });

  it("refuses an empty or unknown slot", () => {
    expect(planRemove(layoutOf([]), "back")).toEqual({ error: "emptySlot" });
    expect(planRemove(layoutOf([]), "tail")).toEqual({ error: "unknownSlot" });
  });

  it("removing a two-hander unblocks the off hand", () => {
    const g = greatsword({ equipped: true });
    const plan = planRemove(layoutOf([g]), "mainHand");
    const { items, assignments } = apply([g], plan);
    expect(cell(layoutOf(items, assignments), "offHand").blocked).toBe(false);
  });
});

describe("candidatesFor", () => {
  it("lists what the slot accepts, unworn first, excluding the occupant", () => {
    const wornRing = ring("Worn Ring", { equipped: true, sort: 1 });
    const spare = ring("Spare Ring", { sort: 2 });
    const layout = layoutOf([wornRing, spare, boots()]);
    const list = candidatesFor(layout, "ring-2", [wornRing, spare, boots()]);
    expect(list.map(c => c.item.name)).toEqual(["Spare Ring", "Worn Ring"]);
    expect(list[1].wornIn).toBe("ring-1");
    expect(candidatesFor(layout, "ring-1", [wornRing, spare]).map(c => c.item.name)).toEqual(["Spare Ring"]);
  });

  it("returns nothing for an unknown slot", () => {
    expect(candidatesFor(layoutOf([]), "tail", [ring()])).toEqual([]);
  });
});

describe("suggestSlot", () => {
  it("prefers an empty natural slot", () => {
    const worn = ring("A", { equipped: true });
    const spare = ring("B");
    expect(suggestSlot(layoutOf([worn, spare]), spare)).toBe("ring-2");
  });

  it("falls back to replacing the first natural slot when all are full", () => {
    const worn = [ring("A", { equipped: true, sort: 1 }), ring("B", { equipped: true, sort: 2 })];
    const spare = ring("C");
    expect(suggestSlot(layoutOf([...worn, spare]), spare)).toBe("ring-1");
  });

  it("overflows accessories to a trinket slot before replacing anything", () => {
    const worn = boots({ equipped: true });
    const second = boots();
    expect(suggestSlot(layoutOf([worn, second]), second)).toBe("trinket-1");
  });

  it("returns the item's current slot when it is already worn", () => {
    const c = cloak({ equipped: true });
    expect(suggestSlot(layoutOf([c]), c)).toBe("back");
  });

  it("never suggests a blocked off hand", () => {
    const g = greatsword({ equipped: true });
    const d = dagger();
    expect(suggestSlot(layoutOf([g, d]), d)).toBe("mainHand");
  });

  it("returns null when nothing could take it", () => {
    expect(suggestSlot(layoutOf([potion()]), potion())).toBeNull();
  });
});

describe("make helper sanity", () => {
  it("gives distinct ids", () => {
    expect(make({ name: "a" }).id).not.toBe(make({ name: "a" }).id);
  });
});
