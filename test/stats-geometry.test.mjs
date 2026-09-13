import { describe, expect, it } from "vitest";
import { attunementPips, encumbranceBar, rarityClass } from "../scripts/data/stats.mjs";
import { DOCK_MIN_HEIGHT, DOCK_WIDTH, dockPosition } from "../scripts/data/dock-geometry.mjs";

describe("attunementPips", () => {
  it("draws one pip per allowed attunement, filled for each in use", () => {
    const { pips, over } = attunementPips(2, 3);
    expect(pips.map(p => p.filled)).toEqual([true, true, false]);
    expect(over).toBe(false);
  });

  it("draws extra warning pips past the limit instead of hiding them", () => {
    const result = attunementPips(4, 3);
    expect(result.over).toBe(true);
    expect(result.pips).toHaveLength(4);
    expect(result.pips[3]).toEqual({ filled: true, over: true });
  });

  it("copes with missing numbers", () => {
    expect(attunementPips(undefined, undefined)).toEqual({ used: 0, max: 0, over: false, pips: [] });
  });
});

describe("encumbranceBar", () => {
  const enc = (value, extra = {}) => ({
    value, max: 300, pct: (value / 300) * 100,
    thresholds: { encumbered: 100, heavilyEncumbered: 200, maximum: 300 }, ...extra
  });

  it("bands at dnd5e's own thresholds", () => {
    expect(encumbranceBar(enc(50)).band).toBe("light");
    expect(encumbranceBar(enc(150)).band).toBe("encumbered");
    expect(encumbranceBar(enc(250)).band).toBe("heavy");
    expect(encumbranceBar(enc(301, { pct: 100 })).band).toBe("over");
  });

  it("is null when there is no finite maximum", () => {
    expect(encumbranceBar(undefined)).toBeNull();
    expect(encumbranceBar({ value: 3, max: Infinity })).toBeNull();
    expect(encumbranceBar({ value: 3, max: 0 })).toBeNull();
  });

  it("clamps the percentage and derives it when missing", () => {
    expect(encumbranceBar({ value: 150, max: 300 }).pct).toBe(50);
    expect(encumbranceBar({ value: 900, max: 300, pct: 300 }).pct).toBe(100);
  });
});

describe("rarityClass", () => {
  it("normalises dnd5e rarity keys", () => {
    expect(rarityClass("veryRare")).toBe("veryrare");
    expect(rarityClass("Legendary")).toBe("legendary");
    expect(rarityClass("mundane")).toBe("");
    expect(rarityClass(undefined)).toBe("");
  });
});

describe("dockPosition", () => {
  const viewport = { width: 1920, height: 1080 };
  const sheet = { left: 600, top: 100, width: 800, height: 900 };

  it("docks on the preferred side when there is room", () => {
    expect(dockPosition({ sheet, viewport, side: "left" })).toEqual({
      left: 600 - DOCK_WIDTH, top: 100, width: DOCK_WIDTH, height: 900, side: "left"
    });
    expect(dockPosition({ sheet, viewport, side: "right" })).toMatchObject({ left: 1400, side: "right" });
  });

  it("uses the other side when the preferred one has no room", () => {
    expect(dockPosition({ sheet: { ...sheet, left: 100 }, viewport, side: "left" })).toMatchObject({ side: "right", left: 900 });
    expect(dockPosition({ sheet: { ...sheet, left: 1100 }, viewport, side: "right" })).toMatchObject({ side: "left" });
  });

  it("floats on-screen when neither side has room", () => {
    const narrow = { width: 1000, height: 800 };
    const pos = dockPosition({ sheet: { left: 100, top: 0, width: 800, height: 700 }, viewport: narrow, side: "right" });
    expect(pos.side).toBeNull();
    expect(pos.left + pos.width).toBeLessThanOrEqual(narrow.width);
    expect(pos.left).toBeGreaterThanOrEqual(0);
  });

  it("never draws shorter than the minimum, and keeps the window on-screen vertically", () => {
    const pos = dockPosition({ sheet: { ...sheet, top: 900, height: 200 }, viewport, side: "left" });
    expect(pos.height).toBe(DOCK_MIN_HEIGHT);
    expect(pos.top + pos.height).toBeLessThanOrEqual(viewport.height);
  });
});
