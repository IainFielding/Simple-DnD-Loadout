import { beforeEach, describe, expect, it } from "vitest";
import { injectTab } from "../scripts/sheet/tab-inject.mjs";
import { DEFAULTS, SETTINGS, callCancellable, clampInt, fireHook, setting, t } from "../scripts/config.mjs";
import { installFoundryShims } from "./helpers/foundry-shims.mjs";

/** A stand-in with dnd5e's CharacterActorSheet shape, trimmed. */
function makeSheetClass() {
  return class FakeSheet {
    static TABS = [
      { tab: "details", label: "Details" },
      { tab: "inventory", label: "Inventory" },
      { tab: "features", label: "Features" }
    ];

    static PARTS = {
      header: { template: "header.hbs" },
      details: { container: { id: "tabs" }, template: "details.hbs" },
      inventory: { container: { id: "tabs" }, template: "inventory.hbs" },
      features: { container: { id: "tabs" }, template: "features.hbs" },
      warnings: { template: "warnings.hbs" },
      tabs: { template: "tabs.hbs" }
    };
  };
}

const spec = {
  id: "loadout",
  after: "inventory",
  part: { container: { id: "tabs" }, template: "loadout.hbs" },
  tab: { label: "Loadout", icon: "fa-person" }
};

describe("injectTab", () => {
  it("inserts the tab and part right after the named sibling", () => {
    const Sheet = makeSheetClass();
    expect(injectTab(Sheet, spec)).toBe(true);
    expect(Sheet.TABS.map(t => t.tab)).toEqual(["details", "inventory", "loadout", "features"]);
    expect(Object.keys(Sheet.PARTS)).toEqual(["header", "details", "inventory", "loadout", "features", "warnings", "tabs"]);
    expect(Sheet.TABS[2]).toEqual({ tab: "loadout", label: "Loadout", icon: "fa-person" });
  });

  it("is idempotent", () => {
    const Sheet = makeSheetClass();
    injectTab(Sheet, spec);
    expect(injectTab(Sheet, spec)).toBe(false);
    expect(Sheet.TABS.filter(t => t.tab === "loadout")).toHaveLength(1);
  });

  it("without a sibling, appends the tab and puts the part after the last tab-container part", () => {
    const Sheet = makeSheetClass();
    injectTab(Sheet, { ...spec, after: "nope" });
    expect(Sheet.TABS.at(-1).tab).toBe("loadout");
    expect(Object.keys(Sheet.PARTS)).toEqual(["header", "details", "inventory", "features", "loadout", "warnings", "tabs"]);
  });

  it("only changes the class it is given, not a parent's shared statics", () => {
    const Base = makeSheetClass();
    const originalTabs = Base.TABS;
    class Child extends Base {}
    injectTab(Child, spec);
    expect(Base.TABS).toBe(originalTabs);
    expect(Base.TABS.some(t => t.tab === "loadout")).toBe(false);
    expect(Child.TABS.some(t => t.tab === "loadout")).toBe(true);
  });

  it("does nothing without a class", () => {
    expect(injectTab(undefined, spec)).toBe(false);
  });
});

describe("config helpers", () => {
  beforeEach(() => installFoundryShims());

  it("clampInt", () => {
    expect(clampInt("3", 0, 5)).toBe(3);
    expect(clampInt(9, 0, 5)).toBe(5);
    expect(clampInt(2.6, 0, 5)).toBe(3);
    expect(clampInt(undefined, 1, 5)).toBe(1);
    expect(clampInt("x", 1, 5)).toBe(1);
  });

  it("setting falls back to the default when a setting is not registered", () => {
    game.settings._values = {};
    expect(setting(SETTINGS.dockSide)).toBe(DEFAULTS[SETTINGS.dockSide]);
  });

  it("t prefixes the module namespace and formats with data", () => {
    expect(t("title")).toBe("sogrom-simple-dnd5e-loadout.title");
    expect(t("reject.wrongSlot", { item: "Boots" })).toBe("sogrom-simple-dnd5e-loadout.reject.wrongSlot:{\"item\":\"Boots\"}");
  });

  it("callCancellable: false vetoes, a throwing listener does not", () => {
    Hooks.on("veto", () => false);
    expect(callCancellable("veto", {})).toBe(false);
    Hooks.on("boom", () => { throw new Error("bad listener"); });
    expect(callCancellable("boom", {})).toBe(true);
    expect(callCancellable("nobody", {})).toBe(true);
  });

  it("fireHook swallows listener errors", () => {
    Hooks.on("loud", () => { throw new Error("bad listener"); });
    expect(() => fireHook("loud", {})).not.toThrow();
  });
});
