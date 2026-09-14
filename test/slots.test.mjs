import { describe, expect, it } from "vitest";
import {
  COUNTED_KINDS, MAX_RANGED, MAX_RINGS, MAX_TRINKETS, OPTIONAL_KINDS, SLOT_GROUPS, SLOT_KINDS, TOGGLED_KINDS,
  buildSlots, kindOfKey, layoutFromForm, normaliseLayout, slotKey
} from "../scripts/data/slots.mjs";

describe("SLOT_KINDS", () => {
  it("every kind is drawn in a known group", () => {
    for ( const def of Object.values(SLOT_KINDS) ) expect(SLOT_GROUPS).toContain(def.group);
  });

  it("the mechanically important kinds cannot be switched off", () => {
    for ( const kind of ["body", "mainHand", "offHand", "ring"] ) expect(OPTIONAL_KINDS).not.toContain(kind);
  });

  it("the new kit and ranged kinds are optional; counted kinds have no checkbox", () => {
    for ( const kind of ["light", "instrument", "tools", "ranged"] ) expect(OPTIONAL_KINDS).toContain(kind);
    expect([...TOGGLED_KINDS].sort()).toEqual(["back", "feet", "hands", "head", "instrument", "light", "neck", "tools", "waist", "wrists"]);
    for ( const kind of COUNTED_KINDS ) expect(TOGGLED_KINDS).not.toContain(kind);
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
    for ( const slot of buildSlots({ rings: MAX_RINGS, trinkets: MAX_TRINKETS, ranged: MAX_RANGED }) ) expect(slot.key).not.toContain(".");
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
    expect(normaliseLayout(undefined)).toEqual({ rings: 2, trinkets: 4, ranged: 2, disabled: [] });
    expect(normaliseLayout("garbage")).toEqual({ rings: 2, trinkets: 4, ranged: 2, disabled: [] });
  });

  it("gives a layout saved before ranged slots existed the default two", () => {
    expect(normaliseLayout({ rings: 3, trinkets: 2, disabled: ["head"] })).toEqual({ rings: 3, trinkets: 2, ranged: 2, disabled: ["head"] });
  });

  it("clamps ranged slots to 0–2 and treats zero as disabled", () => {
    expect(normaliseLayout({ ranged: 9 }).ranged).toBe(MAX_RANGED);
    expect(normaliseLayout({ ranged: 0 })).toMatchObject({ ranged: 0, disabled: ["ranged"] });
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
    const layout = layoutFromForm({ rings: 3, trinkets: 2, ranged: 1, enabled: { head: true, feet: true, light: true } });
    expect(layout.rings).toBe(3);
    expect(layout.ranged).toBe(1);
    expect(layout.disabled.sort()).toEqual(["back", "hands", "instrument", "neck", "tools", "waist", "wrists"]);
  });

  it("governs trinkets and ranged slots by count, not a checkbox", () => {
    expect(layoutFromForm({ trinkets: 3, ranged: 2, enabled: {} }).disabled).not.toContain("trinket");
    expect(layoutFromForm({ trinkets: 3, ranged: 2, enabled: {} }).disabled).not.toContain("ranged");
    expect(layoutFromForm({ trinkets: 0, enabled: {} }).disabled).toContain("trinket");
    expect(layoutFromForm({ ranged: 0, enabled: {} }).disabled).toContain("ranged");
  });
});

describe("buildSlots", () => {
  it("builds the default doll", () => {
    const keys = buildSlots().map(s => s.key);
    expect(keys).toEqual([
      "head", "neck", "back", "body", "wrists", "hands", "waist", "feet", "ring-1", "ring-2",
      "ranged-1", "mainHand", "offHand", "ranged-2",
      "light", "instrument", "tools",
      "trinket-1", "trinket-2", "trinket-3", "trinket-4"
    ]);
  });

  it("draws ranged slots either side of the hands, in keyboard order", () => {
    const hands = keys => buildSlots(keys).filter(s => s.group === "hands").map(s => s.key);
    expect(hands({ ranged: 2 })).toEqual(["ranged-1", "mainHand", "offHand", "ranged-2"]);
    expect(hands({ ranged: 1 })).toEqual(["ranged", "mainHand", "offHand"]);
    expect(hands({ ranged: 0 })).toEqual(["mainHand", "offHand"]);
  });

  it("drops kit slots the GM switched off", () => {
    const keys = buildSlots({ disabled: ["instrument", "tools"] }).map(s => s.key);
    expect(keys).toContain("light");
    expect(keys).not.toContain("instrument");
    expect(keys).not.toContain("tools");
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
