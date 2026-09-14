# End-to-end harness

Drives a real Foundry install, with a Gamemaster and a player client, to test the Paper Doll on real
dnd5e character sheets. The rules of what fits where are unit-tested (`npm test` at the repo root).
This harness covers what those unit tests can't:

- dnd5e actually renders the tab, and the tab switches the way the system's own tabs do.
- A real `drop` event on a slot equips the item, and the sheet's own drop handler doesn't also sort
  the inventory.
- The picker, context menu and keyboard operate on the real DOM.
- The dock follows a sheet as it moves, flips sides at the screen edge, hides when the sheet is
  minimised, and closes with it.
- An item equipped from the inventory tab appears on an open doll and dock.
- A player's doll is exactly as writable as their sheet: their own character is writable, and one
  they can only observe is read-only.
- Under Ember, the skin is applied, Ember's art actually loads, and a character still in Ember's
  builder never gets a dock.
- Turning camp clothes on moves no existing slot, measured on screen in the tab and the dock.
- The docked doll works beside Tidy 5e's sheet.

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
npm test                               # paperdoll: every suite
npm run test:ember                     # paperdoll-ember: every suite plus the Ember skin
node run.mjs --world=paperdoll-tidy    # every suite plus the dock beside Tidy 5e's sheet
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
| `paperdoll` | the module only | 149 assertions, green (2026-09-14) |
| `paperdoll-ember` | the module and Ember | 159 assertions, green (2026-09-14) |
| `paperdoll-tidy` | the module and Tidy 5e Sheet 14.1.0 | 156 assertions, green (2026-09-14) |

All the gear is hand-built by `in-world/provision.mjs`, so no content pack is needed. At the start of
every suite, each character is reset to "nothing equipped, no doll flags". In the Ember world, the
fixture characters are marked as having finished Ember's builder, the same way Ember marks them, so
they use dnd5e's sheet.

## Layout

| File | Runs in | Does |
| --- | --- | --- |
| `run.mjs`, `provision.mjs`, `lib/` | Node | Starts Foundry, joins with Playwright, prints reports |
| `in-world/provision.mjs` | the page | Fixtures: the player, `[e2e] Doll Hero`, `[e2e] Stranger`, and the gear |
| `in-world/harness.mjs` | GM page | Tab, equip, kit (ranged, light, instrument, tools), camp clothes, the trinket bar, DOM, dock, API, settings and config-window suites |
| `in-world/player.mjs` | player page | Permissions |
| `in-world/render.mjs` | GM page | The showcase screenshot, and the Ember and Tidy suites |
