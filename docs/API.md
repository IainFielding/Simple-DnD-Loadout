# Simple D&D Paper Doll: API reference

```js
const api = game.modules.get("sogrom-simple-dnd5e-paper-doll").api;
```

The API is available from `init` onwards. The hook names and API members below are the public
surface: renaming any of them is a breaking change and will be treated as one.

## Slots

A **slot kind** is a place on the body. A **slot key** is one concrete slot on a doll. Kinds with
several slots number them: `"ring-1"`, `"ring-2"`, `"trinket-3"`. Kinds with a single slot use the
bare kind as the key.

| Kind | Default count | Takes |
| --- | --- | --- |
| `head`, `neck`, `back`, `wrists`, `hands`, `waist`, `feet` | 1 each | Worn accessories |
| `body` | 1 | Armour, robes, clothing |
| `ring` | 2 (1–4) | Rings |
| `mainHand` | 1 | Weapons (ranged ones included), rods, wands, held focuses |
| `offHand` | 1 | Shields, one-handed weapons, held focuses, light sources. Blocked while the main hand holds a two-handed weapon. |
| `ranged` | 2 (0–2) | Ranged weapons, and thrown weapons unless Strict Slot Matching is on. A two-handed weapon here is slung and does not block the off hand. `ranged-1` and `ranged-2` are drawn to the right of the hands. |
| `light` | 1 | Light sources: torches, lamps, lanterns, candles |
| `instrument` | 1 | Musical instruments (`tool` items of the `music` type) |
| `tools` | 1 | Every other `tool` item: artisan's tools, gaming sets, and untyped kits such as thieves' tools |
| `trinket` | 4 (0–5) | Any worn accessory. Never kit. Shares a bar with `light`, `instrument` and `tools`. |
| `campOutfit`, `campUnderwear` | 1 each, only with camp clothes on | Clothing and non-armour body wear, **packed rather than worn** (see below) |
| `campFootwear` | 1, only with camp clothes on | Anything for the feet, packed rather than worn |

### Camp slots

Camp slots hold items that are **not** equipped. Putting an item into one unequips it; putting it
into any other slot equips it and takes it out of camp. `layout(actor)` reports camp slots like any
other slot. The `equipped` and `unequipped` hooks fire for camp slots as "placed in" and "taken out
of" that slot, even though no equipped state changes. `equip(actor, item)` without a slot never
chooses a camp slot.

`api.SLOT_KINDS` lists the kinds in definition order. The GM controls counts and which accessory slots are
shown, so read `api.layout(actor)` for the keys that actually exist.

### Pinning an item to a slot kind

```js
await item.setFlag("sogrom-simple-dnd5e-paper-doll", "slot", "neck");
```

A pinned kind overrides the classifier. The item lands in that kind by default and fits no other
slot, whether Strict Slot Matching is on or off.

## Members

### `classify(item) → {kind, source} | null`

Where an item naturally goes. `source` says which rule decided: `"flag"`, `"type"` (dnd5e's own
data: weapon, armour, shield, ring, instrument, other tools), `"name"`, `"icon"` or `"fallback"`.
Returns `null` for items that can't be slotted, such as potions, loot and siege weapons. It never
returns a camp kind: camp is somewhere a player chooses to pack an item, not where it belongs.

### `layout(actor) → {slots, unslotted}`

What the actor's doll shows right now.

```js
{
  slots: [{ key: "mainHand", kind: "mainHand", itemId: "…", pinned: true, blocked: false }, …],
  unslotted: ["…"]   // ids of equipped items with no free slot ("Also Worn")
}
```

`pinned` means the player put the item there. `false` means the doll placed an equipped item in its
natural slot automatically.

### `equip(actor, item, slotKey?) → Promise<boolean>`

Puts an item the actor owns into a slot, following exactly the rules a player's drag follows:

- An item already in that slot is unequipped.
- An item already worn in another slot moves.
- A two-handed weapon in the main hand clears the off hand.
- A blocked off hand refuses.
- The `preEquip` hook can veto.

Without `slotKey`, the item goes to its natural slot, preferring an empty one. Returns whether the
doll changed. Refusals are silent, with no notification.

### `unequip(actor, slotKeyOrItem) → Promise<boolean>`

Empties a slot, given its key or the item in it, and unequips the item.

### `openDock(actor) → Promise<PaperDollDock | null>`

Opens the docked doll beside the actor's sheet, opening the sheet first if needed. Returns `null`
without opening anything if the actor's sheet can't have a dock, such as Ember's fullscreen
creation sheet.

### `openTab(actor) → Promise<void>`

Shows the Paper Doll tab on the actor's D&D 5e sheet, switching an open sheet to it or opening the
sheet on it.

### `HOOKS`

The hook names below.

## Hooks

Each hook receives a single object.

| Hook | Payload | Cancellable | When |
| --- | --- | --- | --- |
| `simplePaperDoll.ready` | `{api, version}` | No | At `ready`, after the sheet integration is installed. |
| `simplePaperDoll.preEquip` | `{actor, item, slot}` | **Yes.** Return `false` to refuse. | Before a drag, pick or `equip()` writes anything. |
| `simplePaperDoll.equipped` | `{actor, item, slot}` | No | An item was put in a slot. It also fires for an item swapped into the slot another item came from. |
| `simplePaperDoll.unequipped` | `{actor, item, slot}` | No | An item was taken out of a slot. |

A listener that throws is logged and ignored. A throwing `preEquip` listener doesn't count as a veto.

## Stored data

| Where | Shape |
| --- | --- |
| `actor.flags["sogrom-simple-dnd5e-paper-doll"].slots` | `{[slotKey]: itemId \| null}`, the player's placements. |
| `actor.flags["sogrom-simple-dnd5e-paper-doll"].portrait` | `{src, fit: "cover" \| "contain", focus: 0–100}` |
| `item.flags["sogrom-simple-dnd5e-paper-doll"].slot` | An optional pinned slot kind. |

`system.equipped` is always the source of truth. The `slots` flag records *where* the player put
something, and the doll ignores an entry for an item that is no longer equipped. That's why an item
unequipped from the inventory tab and later equipped again returns to its slot. Don't write the flag
directly: use `equip` and `unequip`, which keep the two in step.
