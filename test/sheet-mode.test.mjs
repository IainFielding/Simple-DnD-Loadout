import { describe, expect, it } from "vitest";
import { isTidySheet, sheetMode } from "../scripts/sheet/sheet-mode.mjs";

const tidy = sheetModeValue => ({ options: { classes: ["tidy5e-sheet", "sheet"] }, selectTab() {}, sheetMode: sheetModeValue });

describe("sheetMode", () => {
  it("reads dnd5e's sheets", () => {
    expect(sheetMode({ isEditMode: false })).toBe("play");
    expect(sheetMode({ isEditMode: true })).toBe("edit");
  });

  it("reads Tidy 5e's sheets", () => {
    expect(sheetMode(tidy(1))).toBe("play");
    expect(sheetMode(tidy(2))).toBe("edit");
  });

  it("has nothing to say about a sheet without modes", () => {
    expect(sheetMode({ options: { classes: ["some-other-sheet"] } })).toBeNull();
    expect(sheetMode(null)).toBeNull();
  });
});

describe("isTidySheet", () => {
  it("needs Tidy's class and its tab switching", () => {
    expect(isTidySheet(tidy(1))).toBe(true);
    expect(isTidySheet({ options: { classes: ["tidy5e-sheet"] } })).toBe(false);
    expect(isTidySheet({ isEditMode: false })).toBe(false);
  });
});
