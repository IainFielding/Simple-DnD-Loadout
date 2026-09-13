import { describe, expect, it } from "vitest";
import {
  MAX_RINGS, MAX_TRINKETS, OPTIONAL_KINDS, SLOT_GROUPS, SLOT_KINDS,
  buildSlots, kindOfKey, layoutFromForm, normaliseLayout, slotKey
} from "../scripts/data/slots.mjs";

describe("SLOT_KINDS", () => {
  it("every kind is drawn in a known group", () => {
    for ( const def of Object.values(SLOT_KINDS) ) expect(SLOT_GROUPS).toContain(def.group);
  });

  it("the mechanically important kinds cannot be switched off", () => {
    for ( const kind of ["body", "mainHand", "offHand", "ring"] ) expect(OPTIONAL_KINDS).not.toContain(kind);
  });

  it("every placeholder is a core Foundry icon path", () => {
    for ( const def of Object.values(SLOT_KINDS) ) expect(def.placeholder).toMatch(/^icons\/.+\.webp$/);
  });
});

describe("slotKey / kindOfKey", () => {
  it("uses the bare kind for single instances and numbers repeated ones", () => {
    expect(slotKey("head", 1, 1)).toBe("head");
    expect(slotKey("ring", 2, 2)).toBe("ring-2");
  });

  it("never produces a dot, which Foundry would expand inside a flag", () => {
    for ( const slot of buildSlots({ rings: MAX_RINGS, trinkets: MAX_TRINKETS }) ) expect(slot.key).not.toContain(".");
  });

  it("round-trips", () => {
    expect(kindOfKey("ring-3")).toBe("ring");
    expect(kindOfKey("mainHand")).toBe("mainHand");
    expect(kindOfKey("tail-1")).toBeNull();
    expect(kindOfKey(undefined)).toBeNull();
  });
});

describe("normaliseLayout", () => {
  it("returns the defaults for nothing at all", () => {
    expect(normaliseLayout(undefined)).toEqual({ rings: 2, trinkets: 4, disabled: [] });
    expect(normaliseLayout("garbage")).toEqual({ rings: 2, trinkets: 4, disabled: [] });
  });

  it("clamps counts into range and coerces strings", () => {
    expect(normaliseLayout({ rings: 99, trinkets: -3 })).toMatchObject({ rings: MAX_RINGS, trinkets: 0 });
    expect(normaliseLayout({ rings: "3", trinkets: "2" })).toMatchObject({ rings: 3, trinkets: 2 });
    expect(normaliseLayout({ rings: 0 }).rings).toBe(1);
  });

  it("drops unknown and non-optional kinds from the disabled list, and de-duplicates", () => {
    expect(normaliseLayout({ disabled: ["head", "head", "body", "tail"] }).disabled).toEqual(["head"]);
  });

  it("treats zero trinkets as disabled trinkets", () => {
    expect(normaliseLayout({ trinkets: 0 }).disabled).toContain("trinket");
    expect(normaliseLayout({ trinkets: "0" }).disabled).toContain("trinket");
  });
});

describe("layoutFromForm", () => {
  it("disables every optional kind that was not ticked", () => {
    const layout = layoutFromForm({ rings: 3, trinkets: 2, enabled: { head: true, feet: true } });
    expect(layout.rings).toBe(3);
    expect(layout.disabled.sort()).toEqual(["back", "hands", "neck", "waist", "wrists"]);
  });

  it("governs trinkets by count, not a checkbox", () => {
    expect(layoutFromForm({ trinkets: 3, enabled: {} }).disabled).not.toContain("trinket");
    expect(layoutFromForm({ trinkets: 0, enabled: {} }).disabled).toContain("trinket");
  });
});

describe("buildSlots", () => {
  it("builds the default doll", () => {
    const keys = buildSlots().map(s => s.key);
    expect(keys).toEqual([
      "head", "neck", "back", "body", "wrists", "hands", "waist", "feet",
      "ring-1", "ring-2", "mainHand", "offHand", "trinket-1", "trinket-2", "trinket-3", "trinket-4"
    ]);
  });

  it("honours counts and disabled kinds", () => {
    const slots = buildSlots({ rings: 1, trinkets: 0, disabled: ["wrists", "waist"] });
    const keys = slots.map(s => s.key);
    expect(keys).toContain("ring");
    expect(keys).not.toContain("ring-1");
    expect(keys).not.toContain("wrists");
    expect(keys.some(k => k.startsWith("trinket"))).toBe(false);
  });

  it("gives every instance a group and placeholder from its kind", () => {
    for ( const slot of buildSlots() ) {
      expect(slot.group).toBe(SLOT_KINDS[slot.kind].group);
      expect(slot.placeholder).toBe(SLOT_KINDS[slot.kind].placeholder);
    }
  });
});
