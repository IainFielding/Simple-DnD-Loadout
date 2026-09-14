/**
 * Real items from the dnd5e 6.0.0 system packs (`packs/_source/items` and `equipment24`), with the
 * name, subtype and icon exactly as shipped, and the slot a player would expect — decided by
 * reading the item, never by running the classifier.
 *
 * This is the classifier's regression suite against real content. It exists because the obvious
 * heuristic is wrong: several of these carry icons from the wrong body part (Circlet of Blasting
 * and Headband of Intellect use ring art; Cloak of the Manta Ray a hood), which is why names are
 * read before icons. When a pack update renames an icon, a case here fails rather than a player's
 * boots quietly landing on their head.
 *
 * `kind: null` means the item cannot be slotted at all.
 */
export const WEARABLES = [
  // --- Head
  { name: "Circlet of Blasting", subtype: "wondrous", img: "icons/equipment/finger/ring-cabochon-notched-gold-green.webp", kind: "head" },
  { name: "Headband of Intellect", subtype: "wondrous", img: "icons/equipment/finger/ring-cabochon-silver-gold-red.webp", kind: "head" },
  { name: "Eyes of the Eagle", subtype: "wondrous", img: "icons/equipment/head/goggles-leather-blue.webp", kind: "head" },
  { name: "Eyes of Charming", subtype: "trinket", img: "icons/tools/scribal/spectacles-glasses.webp", kind: "head" },
  { name: "Goggles of Night", subtype: "wondrous", img: "icons/equipment/head/goggles-leather-blue.webp", kind: "head" },
  { name: "Hat of Disguise", subtype: "wondrous", img: "icons/equipment/head/hat-belted-simple.webp", kind: "head" },
  { name: "Hat of Many Spells", subtype: "wondrous", img: "icons/equipment/head/hat-pointed-leather-purple.webp", kind: "head" },
  { name: "Helm of Teleportation", subtype: "wondrous", img: "icons/equipment/head/helm-norman-horned-gold.webp", kind: "head" },
  { name: "Helm of Telepathy", subtype: "wondrous", img: "icons/equipment/head/helm-spangen.webp", kind: "head" },

  // --- Neck
  { name: "Amulet of Health", subtype: "wondrous", img: "icons/equipment/neck/pendant-faceted-red.webp", kind: "neck" },
  { name: "Amulet of the Planes", subtype: "trinket", img: "icons/equipment/neck/pendant-faceted-green.webp", kind: "neck" },
  { name: "Brooch of Shielding", subtype: "wondrous", img: "icons/equipment/neck/pendant-bronze-gem-blue.webp", kind: "neck" },
  { name: "Medallion of Thoughts", subtype: "wondrous", img: "icons/equipment/neck/pendant-bronze-gem-blue.webp", kind: "neck" },
  { name: "Necklace of Adaptation", subtype: "wondrous", img: "icons/equipment/neck/amulet-carved-stone-spiral-blue.webp", kind: "neck" },
  { name: "Necklace of Fireballs", subtype: "wondrous", img: "icons/equipment/neck/pendant-faceted-red.webp", kind: "neck" },
  { name: "Periapt of Wound Closure", subtype: "wondrous", img: "icons/equipment/neck/pendant-faceted-blue.webp", kind: "neck" },
  { name: "Scarab of Protection", subtype: "wondrous", img: "icons/environment/creatures/bug-larva-orange.webp", kind: "neck" },
  { name: "Talisman of Pure Good", subtype: "wondrous", img: "icons/equipment/neck/amulet-geometric-blue-yellow.webp", kind: "neck" },

  // --- Back
  { name: "Cloak of Protection", subtype: "clothing", img: "icons/equipment/back/cloak-heavy-fur-blue.webp", kind: "back" },
  { name: "Cloak of Displacement", subtype: "wondrous", img: "icons/equipment/back/cloak-brown-accent-brown-layered-collared-fur.webp", kind: "back" },
  { name: "Cloak of the Manta Ray", subtype: "wondrous", img: "icons/equipment/head/hood-cloth-teal-gold.webp", kind: "back" },
  { name: "Cape of the Mountebank", subtype: "wondrous", img: "icons/equipment/head/hood-cloth-trimmed-pink-gold.webp", kind: "back" },
  { name: "Mantle of Spell Resistance", subtype: "wondrous", img: "icons/equipment/back/cape-layered-violet-white-swirl.webp", kind: "back" },
  { name: "Wings of Flying", subtype: "wondrous", img: "icons/equipment/back/cloak-layered-white.webp", kind: "back" },

  // --- Body
  { name: "Robe of Stars", subtype: "wondrous", img: "icons/equipment/back/cloak-plain-blue.webp", kind: "body" },
  { name: "Robe of the Archmagi", subtype: "wondrous", img: "icons/equipment/back/cloak-plain-white.webp", kind: "body" },
  { name: "Robe of Eyes", subtype: "wondrous", img: "icons/equipment/head/hood-red.webp", kind: "body" },
  { name: "Robe of Scintillating Colors", subtype: "wondrous", img: "icons/equipment/chest/robe-layered-red.webp", kind: "body" },
  { name: "Fine Clothes", subtype: "clothing", img: "icons/equipment/chest/robe-layered-white.webp", kind: "body" },
  { name: "Costume Clothes", subtype: "clothing", img: "icons/equipment/head/crown-feather-brown.webp", kind: "body" },
  { name: "Plate Armor of Etherealness", subtype: "", img: "icons/equipment/chest/breastplate-collared-steel.webp", kind: "body" },
  { name: "Elven Chain", subtype: "", img: "icons/equipment/back/mantle-collared-green.webp", kind: "body" },
  { name: "Chain Mail", subtype: "heavy", img: "icons/equipment/chest/breastplate-banded-steel.webp", kind: "body" },
  { name: "Ring Mail", subtype: "heavy", img: "icons/equipment/chest/breastplate-scale-grey.webp", kind: "body" },
  { name: "Studded Leather Armor", subtype: "light", img: "icons/equipment/chest/breastplate-layered-leather-studded-brown.webp", kind: "body" },

  // --- Hands
  { name: "Gauntlets of Ogre Power", subtype: "wondrous", img: "icons/equipment/hand/gauntlet-armored-steel-grey.webp", kind: "hands" },
  { name: "Gloves of Missile Snaring", subtype: "wondrous", img: "icons/equipment/hand/glove-tooled-leather-blue.webp", kind: "hands" },
  { name: "Gloves of Thievery", subtype: "wondrous", img: "icons/equipment/hand/glove-tooled-leather-red-purple.webp", kind: "hands" },

  // --- Wrists
  { name: "Bracers of Archery", subtype: "clothing", img: "icons/equipment/wrist/bracer-banded-leather.webp", kind: "wrists" },
  { name: "Bracers of Defense", subtype: "clothing", img: "icons/equipment/wrist/bracer-yellow-fancy.webp", kind: "wrists" },

  // --- Waist
  { name: "Belt of Dwarvenkind", subtype: "wondrous", img: "icons/equipment/waist/belt-armored-steel.webp", kind: "waist" },
  { name: "Belt of Giant Strength (storm)", subtype: "wondrous", img: "icons/equipment/waist/belt-thick-gemmed-gold-blue.webp", kind: "waist" },

  // --- Feet
  { name: "Boots of Speed", subtype: "clothing", img: "icons/equipment/feet/boots-leather-green.webp", kind: "feet" },
  { name: "Boots of Elvenkind", subtype: "wondrous", img: "icons/equipment/feet/boots-pointed-cloth-green.webp", kind: "feet" },
  { name: "Boots of the Winterlands", subtype: "wondrous", img: "icons/equipment/feet/boots-leather-banded-furred.webp", kind: "feet" },
  { name: "Slippers of Spider Climbing", subtype: "wondrous", img: "icons/equipment/feet/boots-leather-black.webp", kind: "feet" },

  // --- Rings
  { name: "Ring of Protection", subtype: "ring", img: "icons/equipment/finger/ring-band-engraved-gold.webp", kind: "ring" },
  { name: "Ring of Spell Storing", subtype: "ring", img: "icons/equipment/finger/ring-cabochon-gold-blue.webp", kind: "ring" },

  // --- Hands (held)
  { name: "Shield", subtype: "shield", img: "icons/equipment/shield/heater-crystal-blue.webp", kind: "offHand" },
  { name: "Sentinel Shield", subtype: "shield", img: "icons/equipment/shield/heater-steel-segmented-purple.webp", kind: "offHand" },
  { name: "Wand of Magic Missiles", subtype: "wand", img: "icons/weapons/wands/wand-gem-violet.webp", kind: "mainHand" },
  { name: "Rod of Absorption", subtype: "rod", img: "icons/weapons/staves/staff-ornate-purple.webp", kind: "mainHand" },

  // --- Ranged weapons (equipment24/weapons)
  { name: "Longbow", type: "weapon", subtype: "martialR", img: "icons/weapons/bows/longbow-recurve-leather-brown.webp", kind: "ranged" },
  { name: "Hand Crossbow", type: "weapon", subtype: "martialR", img: "icons/weapons/crossbows/crossbow-slotted.webp", kind: "ranged" },
  { name: "Shortbow", type: "weapon", subtype: "simpleR", img: "icons/weapons/bows/shortbow-leather.webp", kind: "ranged" },
  { name: "Dart", type: "weapon", subtype: "simpleR", img: "icons/weapons/thrown/dart-feathered.webp", kind: "ranged" },

  // --- Light sources. The plain ones are "trinket" subtype, some consumable, some equipment.
  { name: "Torch", type: "consumable", subtype: "trinket", img: "icons/sundries/lights/torch-brown-lit.webp", kind: "light" },
  { name: "Candle", type: "consumable", subtype: "trinket", img: "icons/sundries/lights/candle-unlit-tan.webp", kind: "light" },
  { name: "Lamp", subtype: "trinket", img: "icons/sundries/lights/lantern-iron-yellow.webp", kind: "light" },
  { name: "Lantern, Hooded", subtype: "trinket", img: "icons/sundries/lights/lantern-steel.webp", kind: "light" },
  { name: "Lantern of Revealing", subtype: "wondrous", img: "icons/sundries/lights/lantern-iron-yellow.webp", kind: "light" },
  { name: "Candle of Invocation", type: "consumable", subtype: "trinket", img: "icons/sundries/lights/candle-unlit-yellow.webp", kind: "light" },
  // Ships with a lit-torch icon. It is not a light source.
  { name: "Tinderbox", subtype: "trinket", img: "icons/sundries/lights/torch-black.webp", kind: "trinket" },

  // --- Musical instruments: decided by tool type, whatever the icon says
  { name: "Lute", type: "tool", subtype: "music", img: "icons/tools/instruments/lute-gold-brown.webp", kind: "instrument" },
  { name: "Drum", type: "tool", subtype: "music", img: "icons/tools/instruments/drum-brown-red.webp", kind: "instrument" },
  { name: "Bagpipes", type: "tool", subtype: "music", img: "icons/sundries/survival/waterskin-leather-brown.webp", kind: "instrument" },

  // --- Artisan's tools: likewise
  { name: "Smith's Tools", type: "tool", subtype: "art", img: "icons/skills/trades/smithing-tongs-metal-red.webp", kind: "tools" },
  { name: "Alchemist's Supplies", type: "tool", subtype: "art", img: "icons/tools/cooking/mortar-herbs-yellow.webp", kind: "tools" },
  { name: "Weaver's Tools", type: "tool", subtype: "art", img: "icons/equipment/back/cloak-hooded-pink.webp", kind: "tools" },
  { name: "Jeweler's Tools", type: "tool", subtype: "art", img: "icons/commodities/gems/gem-rough-rose-teal.webp", kind: "tools" },
  // Gaming sets and the untyped kits share the tools slot. Disguise Kit ships with a cloak icon.
  { name: "Thieves' Tools", type: "tool", subtype: "", img: "icons/tools/hand/lockpicks-steel-grey.webp", kind: "tools" },
  { name: "Herbalism Kit", type: "tool", subtype: "", img: "icons/containers/bags/pouch-leather-green.webp", kind: "tools" },
  { name: "Disguise Kit", type: "tool", subtype: "", img: "icons/equipment/back/cloak-hooded-blue.webp", kind: "tools" },
  { name: "Dice", type: "tool", subtype: "game", img: "icons/sundries/gaming/dice-runed-brown.webp", kind: "tools" },
  { name: "Playing Cards", type: "tool", subtype: "game", img: "icons/sundries/gaming/playing-cards.webp", kind: "tools" },

  // --- Trinkets: worn magic with no body part of its own
  { name: "Ioun Stone of Protection", subtype: "wondrous", img: "icons/commodities/gems/gem-rough-ball-purple.webp", kind: "trinket" },
  { name: "Stone of Good Luck (Luckstone)", subtype: "wondrous", img: "icons/commodities/gems/gem-rough-rectangle-red.webp", kind: "trinket" },
  { name: "Pearl of Power", subtype: "wondrous", img: "icons/commodities/gems/pearl-blue-gold.webp", kind: "trinket" },
  { name: "Crystal", subtype: "trinket", img: "icons/commodities/gems/gem-faceted-large-green.webp", kind: "trinket" }
];

/** Items dnd5e can equip but no body slot should take. */
export const NOT_SLOTTABLE = [
  { name: "Potion of Healing", type: "consumable", subtype: "potion", img: "icons/consumables/potions/potion-bottle-corked-red.webp" },
  { name: "Backpack", type: "container", subtype: "", img: "icons/containers/bags/pack-leather-white-tan.webp" },
  { name: "Ballista", type: "weapon", subtype: "siege", img: "icons/weapons/crossbows/crossbow-heavy-black.webp" },
  { name: "Gold Ring", type: "loot", subtype: "", img: "icons/equipment/finger/ring-band-gold.webp" }
];
