# End-to-end harness

Drives a real Foundry install, with a Gamemaster and a player client, to test the Loadout on real
dnd5e character sheets. The rules of what fits where are unit-tested (`npm test` at the repo root).
This harness covers what those unit tests can't:

- dnd5e actually renders the tab, and the tab switches the way the system's own tabs do.
- A real `drop` event on a slot equips the item, and the sheet's own drop handler doesn't also sort
  the inventory.
- The picker, context menu and keyboard operate on the real DOM. A left-click follows the sheet's mode
  on dnd5e's sheet, the dock and Tidy's tab: play mode uses an item with something to do and opens one
  without, edit mode opens the slot's menu.
- The docked loadout works beside a bare character sheet this module has no code for (a plain
  ActorSheetV2 the harness registers), where a click opens the item.
- The dock follows a sheet as it moves, flips sides at the screen edge, hides when the sheet is
  minimised, and closes with it.
- An item equipped from the inventory tab appears on an open loadout and dock.
- A player's loadout is exactly as writable as their sheet: their own character is writable, and one
  they can only observe is read-only.
- Under Ember, the skin is applied, Ember's art actually loads, and a character still in Ember's
  builder never gets a dock.
- Turning camp clothes on moves no existing slot, measured on screen in the tab and the dock.
- Proficiency and Strength warnings, charges and the picker's numbers read dnd5e's real prepared data,
  and an unidentified item is placed by its real name while a player sees no rarity or attunement.
- Saved sets save, switch and delete through the real drawer inside the sheet's form, without
  submitting the sheet or moving a slot.
- The Loadout tab works on Tidy 5e's sheet (added through Tidy's API), and the docked loadout works beside it.

The harness source is tracked in git but never shipped. `config.mjs` and the run output (`*.log`,
`*.png`) are gitignored.

## Setup

```sh
npm install
cp config.example.mjs config.mjs    # point it at your Foundry install and data folder
npm run link-module                  # junction the repo into Data/modules (idempotent)
node provision.mjs                   # once: worlds, the player, the characters
```

**Close the Foundry desktop app first.** Foundry locks its data folder, and the harness starts its
own server against it on port 30097.

## Running

```sh
npm test                               # loadout: every suite
npm run test:ember                     # loadout-ember: every suite plus the Ember skin
node run.mjs --world=loadout-tidy    # every suite plus the Tidy tab and the dock beside Tidy
node run.mjs --world=loadout-ember-tidy  # both at once: the Ember skin inside Tidy's tab
node run.mjs --only=dockSuite,domSuite
node run.mjs --hold                    # leave the browsers open
HEADED=1 npm test                      # watch it
```

The exit code is 0 only when every assertion passes and no client logged an error. Each run also
writes `showcase-<world>.png` with the hero dressed, the tab open and the dock beside it. Nothing
asserts on that image; it's there for someone to look at.

## Worlds

| World | Modules | Status |
| --- | --- | --- |
| `loadout` | the module only | 206 assertions, green (2026-09-14) |
| `loadout-ember` | the module and Ember | 216 assertions, green (2026-09-14) |
| `loadout-tidy` | the module and Tidy 5e Sheet 14.1.0 | 224 assertions, green (2026-09-14) |
| `loadout-ember-tidy` | the module, Ember and Tidy 5e Sheet 14.1.0 | 235 assertions, green (2026-09-14) |

All the gear is hand-built by `in-world/provision.mjs`, so no content pack is needed. At the start of
every suite, each character is reset to "nothing equipped, no loadout flags". In the Ember world, the
fixture characters are marked as having finished Ember's builder, the same way Ember marks them, so
they use dnd5e's sheet.

## Layout

| File | Runs in | Does |
| --- | --- | --- |
| `run.mjs`, `provision.mjs`, `lib/` | Node | Starts Foundry, joins with Playwright, prints reports |
| `in-world/provision.mjs` | the page | Fixtures: the player, `[e2e] Loadout Hero`, `[e2e] Stranger`, and the gear |
| `in-world/harness.mjs` | GM page | Tab, equip, kit (ranged, light, instrument, tools), camp clothes, the trinket bar, DOM, gear notes, saved sets, dock, API, settings and config-window suites |
| `in-world/player.mjs` | player page | Permissions, and what an unidentified item hides from a player |
| `in-world/render.mjs` | GM page | The showcase screenshot, and the Ember and Tidy suites |
