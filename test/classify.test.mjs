import { describe, expect, it } from "vitest";
import { accepts, classify, kindFromIcon, kindFromName } from "../scripts/data/classify.mjs";
import { NOT_SLOTTABLE, WEARABLES } from "./fixtures/dnd5e-600-wearables.mjs";
import {
  amulet, boots, chainMail, cloak, dagger, greatsword, handCrossbow, iounStone, javelin, leather, longbow, longsword,
  lute, make, potion, ring, shield, smithsTools, torch
} from "./helpers/items.mjs";

describe("classify: real dnd5e 6.0.0 content", () => {
  it.each(WEARABLES.map(w => [w.name, w]))("%s", (_name, w) => {
    const facts = make({ name: w.name, type: w.type ?? "equipment", subtype: w.subtype, img: w.img });
    expect(classify(facts)?.kind).toBe(w.kind);
  });

  it.each(NOT_SLOTTABLE.map(w => [w.name, w]))("%s is not slottable", (_name, w) => {
    const facts = make({ name: w.name, type: w.type, subtype: w.subtype, img: w.img });
    expect(classify(facts)).toBeNull();
  });
});

describe("classify: trust order", () => {
  it("a pinned flag beats everything", () => {
    expect(classify(boots({ slot: "trinket" }))).toEqual({ kind: "trinket", source: "flag" });
  });

  it("an unknown pinned kind is ignored", () => {
    expect(classify(boots({ slot: "tail" }))?.kind).toBe("feet");
  });

  it("dnd5e's own type beats the name: Ring Mail is armour, not a ring", () => {
    expect(classify(make({ name: "Ring Mail", subtype: "heavy" }))).toEqual({ kind: "body", source: "type" });
  });

  it("the name beats the icon", () => {
    const circlet = make({ name: "Circlet of Blasting", subtype: "wondrous", img: "icons/equipment/finger/ring-x.webp" });
    expect(classify(circlet)).toEqual({ kind: "head", source: "name" });
  });

  it("the icon decides when the name says nothing — e.g. non-English content", () => {
    const item = make({ name: "Stiefel der Schnelligkeit", subtype: "wondrous", img: "icons/equipment/feet/boots.webp" });
    expect(classify(item)).toEqual({ kind: "feet", source: "icon" });
  });

  it("falls back: rods and wands to the hand, clothing to the body, the rest to trinkets", () => {
    expect(classify(make({ name: "Stick", subtype: "wand" }))).toEqual({ kind: "mainHand", source: "fallback" });
    expect(classify(make({ name: "Travelling Garb?", subtype: "clothing", img: "x.webp" }))?.kind).toBe("body");
    expect(classify(make({ name: "Peasant Things", subtype: "clothing" }))).toEqual({ kind: "body", source: "fallback" });
    expect(classify(make({ name: "Figurine", subtype: "wondrous" }))).toEqual({ kind: "trinket", source: "fallback" });
  });

  it("weapons go to the main hand; siege weapons nowhere", () => {
    expect(classify(greatsword())?.kind).toBe("mainHand");
    expect(classify(make({ name: "Ballista", type: "weapon", subtype: "siege" }))).toBeNull();
  });

  it("ranged weapons go to the ranged slots by type", () => {
    expect(classify(longbow())).toEqual({ kind: "ranged", source: "type" });
    expect(classify(javelin())?.kind).toBe("mainHand");
  });

  it("tools are decided by type, before the name or icon can mislead", () => {
    expect(classify(make({ name: "Weaver's Tools", type: "tool", subtype: "art", img: "icons/equipment/back/cloak.webp" })))
      .toEqual({ kind: "tools", source: "type" });
    expect(classify(make({ name: "Ring of Bells", type: "tool", subtype: "music" }))).toEqual({ kind: "instrument", source: "type" });
  });

  it("a light-source icon names a light unless the item only starts fires", () => {
    expect(classify(make({ name: "Oil Light", subtype: "trinket", img: "icons/sundries/lights/lantern-steel.webp" })))
      .toEqual({ kind: "light", source: "icon" });
    expect(classify(make({ name: "Tinderbox", subtype: "trinket", img: "icons/sundries/lights/torch-black.webp" }))?.kind)
      .toBe("trinket");
  });

  it("potions and other pocket consumables are not slottable", () => {
    expect(classify(potion())).toBeNull();
  });
});

describe("kindFromName", () => {
  it("reads the head noun of an 'X of Y' name first", () => {
    expect(kindFromName("Gloves of the Ring")).toBe("hands");
    expect(kindFromName("Robe of Eyes")).toBe("body");
  });

  it("falls back to the whole name when the head noun says nothing", () => {
    expect(kindFromName("Dread Helm")).toBe("head");
    expect(kindFromName("Mask")).toBe("head");
  });

  it("takes the earliest match when a name mentions two slots", () => {
    expect(kindFromName("Cloak and Boots")).toBe("back");
    expect(kindFromName("Boots and Cloak")).toBe("feet");
  });

  it("matches whole words only", () => {
    expect(kindFromName("That Thing")).toBeNull();     // not "hat"
    expect(kindFromName("Beltane Token")).toBeNull();  // not "belt"
  });

  it("is case-insensitive and tolerates empty input", () => {
    expect(kindFromName("BOOTS OF SPEED")).toBe("feet");
    expect(kindFromName("")).toBeNull();
    expect(kindFromName(undefined)).toBeNull();
  });
});

describe("kindFromIcon", () => {
  it("maps core equipment folders", () => {
    expect(kindFromIcon("icons/equipment/shoulder/pauldron.webp")).toBe("back");
    expect(kindFromIcon("icons/equipment/leg/greaves.webp")).toBe("feet");
    expect(kindFromIcon("icons/equipment/finger/ring.webp")).toBe("ring");
  });

  it("maps the light-source folder outside icons/equipment", () => {
    expect(kindFromIcon("icons/sundries/lights/lantern-steel.webp")).toBe("light");
  });

  it("ignores other icons outside icons/equipment", () => {
    expect(kindFromIcon("icons/commodities/gems/gem.webp")).toBeNull();
    expect(kindFromIcon("modules/x/equipment/head/hat.webp")).toBeNull();
    expect(kindFromIcon("")).toBeNull();
  });
});

describe("accepts", () => {
  it("refuses what cannot be slotted at all", () => {
    expect(accepts("trinket", potion())).toEqual({ ok: false, reason: "notSlottable" });
  });

  it("refuses unknown slot kinds", () => {
    expect(accepts("tail", boots())).toEqual({ ok: false, reason: "wrongSlot" });
  });

  describe("hands", () => {
    it("the main hand takes any wieldable weapon", () => {
      for ( const weapon of [longsword(), dagger(), greatsword()] ) expect(accepts("mainHand", weapon).ok).toBe(true);
    });

    it("the off hand takes one-handed weapons and shields, never two-handed weapons", () => {
      expect(accepts("offHand", dagger()).ok).toBe(true);
      expect(accepts("offHand", shield()).ok).toBe(true);
      expect(accepts("offHand", greatsword())).toEqual({ ok: false, reason: "twoHandedOffHand" });
    });

    it("a shield does not go in the main hand", () => {
      expect(accepts("mainHand", shield()).ok).toBe(false);
    });

    it("held implements fit either hand in lenient mode, only via their own classification when strict", () => {
      const orb = make({ name: "Orb", subtype: "trinket" });
      expect(accepts("mainHand", orb).ok).toBe(true);
      expect(accepts("offHand", orb).ok).toBe(true);
      expect(accepts("mainHand", orb, { strict: true }).ok).toBe(false);
      const wand = make({ name: "Wand of Web", subtype: "wand" });
      expect(accepts("mainHand", wand, { strict: true }).ok).toBe(true);
    });

    it("armour is not held", () => {
      expect(accepts("mainHand", chainMail()).ok).toBe(false);
      expect(accepts("offHand", chainMail()).ok).toBe(false);
    });
  });

  describe("ranged", () => {
    it("takes ranged weapons, two-handed or not, in both modes", () => {
      for ( const strict of [false, true] ) {
        expect(accepts("ranged", longbow(), { strict }).ok).toBe(true);
        expect(accepts("ranged", handCrossbow(), { strict }).ok).toBe(true);
      }
    });

    it("takes thrown melee weapons only when lenient", () => {
      expect(accepts("ranged", javelin()).ok).toBe(true);
      expect(accepts("ranged", javelin(), { strict: true }).ok).toBe(false);
    });

    it("refuses melee weapons and everything else", () => {
      for ( const item of [longsword(), shield(), boots(), lute()] ) expect(accepts("ranged", item).ok).toBe(false);
    });

    it("ranged weapons may still be held: a hand crossbow in either hand, a longbow in the main hand", () => {
      expect(accepts("mainHand", longbow()).ok).toBe(true);
      expect(accepts("offHand", longbow())).toEqual({ ok: false, reason: "twoHandedOffHand" });
      expect(accepts("offHand", handCrossbow()).ok).toBe(true);
    });
  });

  describe("kit", () => {
    it("each kit slot takes only its own kind, in both modes", () => {
      expect(accepts("light", torch()).ok).toBe(true);
      expect(accepts("instrument", lute()).ok).toBe(true);
      expect(accepts("tools", smithsTools()).ok).toBe(true);
      expect(accepts("light", lute()).ok).toBe(false);
      expect(accepts("instrument", smithsTools()).ok).toBe(false);
      expect(accepts("tools", boots()).ok).toBe(false);
    });

    it("a light source can be held in the off hand, even when strict", () => {
      expect(accepts("offHand", torch()).ok).toBe(true);
      expect(accepts("offHand", torch(), { strict: true }).ok).toBe(true);
      expect(accepts("mainHand", torch(), { strict: true }).ok).toBe(false);
    });

    it("kit never fills a worn slot, even when lenient", () => {
      for ( const kind of ["head", "neck", "waist", "trinket"] ) {
        expect(accepts(kind, torch()).ok).toBe(false);
        expect(accepts(kind, lute()).ok).toBe(false);
      }
    });
  });

  describe("body", () => {
    it("takes armour and robes", () => {
      expect(accepts("body", chainMail()).ok).toBe(true);
      expect(accepts("body", leather()).ok).toBe(true);
      expect(accepts("body", make({ name: "Robe of Stars", subtype: "wondrous" })).ok).toBe(true);
    });

    it("takes plain clothing classified elsewhere only when lenient", () => {
      const cape = make({ name: "Cape of the Mountebank", subtype: "clothing" });
      expect(accepts("body", cape).ok).toBe(true);
      expect(accepts("body", cape, { strict: true }).ok).toBe(false);
    });

    it("refuses shields and weapons", () => {
      expect(accepts("body", shield()).ok).toBe(false);
      expect(accepts("body", longsword()).ok).toBe(false);
    });
  });

  describe("rings", () => {
    it("take rings, and nothing else, in both modes", () => {
      expect(accepts("ring", ring()).ok).toBe(true);
      expect(accepts("ring", amulet()).ok).toBe(false);
      expect(accepts("ring", ring("Ring of Warmth"), { strict: true }).ok).toBe(true);
    });
  });

  describe("accessory slots", () => {
    it("lenient: any worn accessory fits any accessory slot", () => {
      expect(accepts("head", boots()).ok).toBe(true);
      expect(accepts("waist", cloak()).ok).toBe(true);
    });

    it("strict: an accessory only fits its own slot", () => {
      expect(accepts("feet", boots(), { strict: true }).ok).toBe(true);
      expect(accepts("head", boots(), { strict: true })).toEqual({ ok: false, reason: "wrongSlot" });
    });

    it("never takes armour, shields, weapons, rings or wands", () => {
      for ( const item of [chainMail(), shield(), longsword(), ring(), make({ name: "Wand", subtype: "wand" })] ) {
        expect(accepts("neck", item).ok).toBe(false);
      }
    });

    it("trinket slots are the catch-all for worn things, in both modes", () => {
      expect(accepts("trinket", iounStone()).ok).toBe(true);
      expect(accepts("trinket", boots(), { strict: true }).ok).toBe(true);
      expect(accepts("trinket", chainMail()).ok).toBe(false);
      expect(accepts("trinket", longsword()).ok).toBe(false);
    });
  });

  it("a pinned kind is honoured in both modes and refuses every other slot", () => {
    const pinned = boots({ slot: "trinket" });
    expect(accepts("trinket", pinned).ok).toBe(true);
    expect(accepts("feet", pinned).ok).toBe(false);
    expect(accepts("feet", pinned, { strict: true }).ok).toBe(false);
  });
});
