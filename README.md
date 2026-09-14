![](https://img.shields.io/badge/Foundry-v14.367-informational)
![](https://img.shields.io/badge/D&D-v6.0.1-informational)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-sogrom?logo=ko-fi&logoColor=white)](https://ko-fi.com/sogrom)<br>

# Simple D&D Paper Doll

Dress your character the way an RPG should let you, in Foundry VTT and the D&D 5e system.

Your character's portrait fills the frame, with a slot for every place gear goes: head, neck, back,
body, wrists, hands, waist, feet, rings, both hands, two slung ranged weapons, and a bar holding a
light source, a musical instrument, a set of tools and your trinkets. Drag armour, weapons, tools and wondrous
items onto it, straight from the inventory. It sits in its own **Paper Doll** tab on the
character sheet, or in a window docked beside the sheet that follows it around.

## Requirements

| | |
| --- | --- |
| Foundry VTT | v14 (verified 14.367) |
| Game system | D&D 5e **6.0.0** or later in the 6.x line |

## What it does

- **It knows boots from cloaks.** D&D 5e files every wondrous item under one type, so the doll reads
  each item the way a player would: *Boots of Speed* go on the feet, a *Cloak of Protection* on the
  back, a *Circlet of Blasting* on the head, even though the system gives that circlet a ring icon.
  Armour, shields, rings, weapons and tools use the system's own data.
- **It's the same equipment as the sheet.** Putting something on the doll equips it; taking it off
  unequips it. AC, attunement and everything else that reads "equipped" updates as normal. Equip
  something from the inventory tab and it shows up on the doll.
- **Both hands work the way they should.** A greatsword takes both hands. Equipping one clears the
  off hand, which shows the weapon's outline until you let go. One-handed weapons and shields fit
  either hand they belong in.
- **Blades in hand, bows slung.** Main hand and off hand sit on the left, two ranged slots on the
  right. A longbow equipped
  from the inventory goes there, and a bow that's slung doesn't tie up your off hand. Drag it into
  your main hand when you draw it, and then it does.
- **The tools of the trade.** A light source, a musical instrument and a set of tools each have a
  slot at the start of the trinket bar. The tools slot takes artisan's tools, gaming sets and kits
  such as thieves' tools. A torch or lantern can also go in your off hand. A tinderbox isn't
  mistaken for a light, even though the system gives it a torch icon.
- **Camp clothes, if your GM wants them.** Like Baldur's Gate 3, a separate **Camp** group holds an
  outfit, underwear and footwear. Camp clothes are packed rather than worn, so putting something
  there unequips it and its armour and magic don't apply. Drag it back onto a normal slot to wear
  it.
- **Drag, click or right-click.**
  - Drag an item from the inventory onto a slot. While you drag, the slots that would take it light
    up and the rest fade.
  - Drag between slots to move or swap.
  - Click an empty slot to pick from what you're carrying, with search.
  - Right-click a slot to view, use, attune or unequip the item.
  - Everything works from the keyboard too. Press **Delete** on a slot to take its item off.
- **Attunement at a glance.** A sun badge marks attuned items. A hollow badge and a dimmed picture
  mark items that need attunement to work. Pips under the doll count your attunements against your
  limit.
- **Armour class and load.** Your AC and how much you're carrying sit under the doll, and the load
  bar changes colour at the system's encumbrance thresholds.
- **Nothing gets lost.** If you wear more than fits, say a third ring, the extra is listed under
  **Also Worn** rather than hidden. It stays equipped.
- **Your portrait, framed your way.** Use a different picture for the doll than the sheet's (a
  full-body shot works best), and choose how it fills the frame.
- **Rarity colours.** Each item's frame is coloured by its rarity.

## Running alongside Ember

[Ember](https://foundryvtt.com/packages/ember) works with no setting to change.

- **The doll wears Ember's look.** Ember's dark codex ground, parchment text and fonts, the same
  skin the Simple D&D Character Creator and Magic Shop wear there, so all three look alike.
- **It stays out of Ember's character builder.** Ember gives a new character its own fullscreen
  creation sheet. The doll doesn't dock beside that, and the hotkey won't open it. Once Ember hands
  the finished character to the normal D&D 5e sheet, the Paper Doll tab and dock work as usual.

## The GM's Guide

These are under **Configure Settings → Module Settings**.

| Setting | Default | What it does |
| --- | --- | --- |
| Paper Doll Tab | On | Adds the tab to the D&D 5e character sheet. Changing it reloads the world. |
| Docked Paper Doll Button | On | Adds a **Paper Doll** button to character sheet headers that opens the docked window. |
| Dock Side | Left | *Per player.* Which side of the sheet the dock prefers. If there isn't room, it uses the other side. |
| Open Docked Doll With Sheets | Off | *Per player.* Opens the dock whenever a character sheet opens. |
| Strict Slot Matching | Off | When off, any worn accessory fits any accessory slot, so a player can put homebrew gear wherever it makes sense. When on, boots only go on feet, cloaks only on the back, and so on. Armour, shields, weapons and rings follow the rules either way. |
| Dropping New Items | Gamemaster only | Who may drop an item the character doesn't already carry, from a compendium or the Items sidebar, onto the doll. It's added to the inventory and equipped. |
| Configure Slots | 2 rings, 2 ranged, 4 trinkets, camp clothes off | How many ring slots (1–4), ranged weapon slots (0–2) and trinket slots (0–5) every doll has, which optional slots (head, neck, back, wrists, hands, waist, feet, light source, instrument, tools) are shown, and whether the three camp clothes slots are on. |

**Hotkey:** **Shift + P** opens or closes the docked doll for your selected token's character, or
your own character if no token is selected. You can change it under **Configure Controls**.

## Compatibility

| Module | Works together? | What happens |
| --- | --- | --- |
| [Ember](https://foundryvtt.com/packages/ember) | Yes, automatic | Ember skin, and stays out of Ember's character builder. See [Running alongside Ember](#running-alongside-ember). |
| [Tidy 5e Sheet](https://foundryvtt.com/packages/tidy5e-sheet) | Yes, docked | Tested with Tidy 5e 14.1.0. The Paper Doll button appears in Tidy's sheet header, and the docked doll sits beside Tidy's sheet and follows it. The tab is added only to the D&D 5e system's own sheet. |
| Other character sheets | Docked doll | The docked doll is built to work beside any character sheet made the standard Foundry way. Only Tidy 5e has been tested. |
| Content modules (Player's Handbook, DMG, homebrew) | Yes | Anything using the standard D&D 5e item types can be worn or carried. Unusually named homebrew goes to a sensible slot, and in the default lenient mode can be moved wherever you like. |
| [Simple D&D Character Creator](https://foundryvtt.com/packages/sogrom-dnd5e-character-creator), [Simple D&D Magic Shop](https://foundryvtt.com/packages/sogrom-simple-dnd5e-magic-shop) | Yes | Same look, same Ember skin. |

## For module developers

The module has a small API and four hooks.

```js
const api = game.modules.get("sogrom-simple-dnd5e-paper-doll").api;

api.classify(item);                     // { kind: "feet", source: "name" }
await api.equip(actor, item);           // into its natural slot
await api.equip(actor, item, "ring-2"); // or a named one
await api.unequip(actor, item);
api.layout(actor);                      // what the doll shows right now

// Refuse an equip
Hooks.on(api.HOOKS.preEquip, ({ actor, item, slot }) => slot !== "offHand" || !item.getFlag("my-module", "cursed"));
```

To send a homebrew item to a particular slot, set `flags["sogrom-simple-dnd5e-paper-doll"].slot` on
it to a slot kind such as `"neck"`.

📖 **[Full API reference](docs/API.md)**

## Support

Found a bug or have an idea? [Open an issue](https://github.com/IainFielding/Simple-DnD-Paper-Doll/issues).
