# Simple D&D Loadout: API reference

```js
const api = game.modules.get("sogrom-simple-dnd5e-loadout").api;
```

The API is available from `init` onwards. The hook names and API members below are the public
surface: renaming any of them is a breaking change and will be treated as one.

## Slots

A **slot kind** is a place on the body. A **slot key** is one concrete slot on a loadout. Kinds with
several slots number them: `"ring-1"`, `"ring-2"`, `"trinket-3"`. Kinds with a single slot use the
bare kind as the key.

| Kind | Default count | Takes |
| --- | --- | --- |
| `head`, `neck`, `back`, `wrists`, `hands`, `waist`, `feet` | 1 each | Worn accessories |
| `body` | 1 | Armour, robes, clothing |
| `ring` | 2 (1–4) | Rings |
| `mainHand` | 1 | Weapons (ranged ones included), rods, wands, held focuses |
| `offHand` | 1 | Shields, one-handed weapons, held focuses, light sources. Blocked while the main hand holds a two-handed weapon. |
| `ranged` | 2 (0–2) | Ranged weapons, and thrown weapons unless Strict Slot Matching is on. Drawn to the right of the hands. With two, they are a second hand pair: `ranged-1` is the ranged main hand and `ranged-2` its off hand. A two-handed weapon in `ranged-1` blocks `ranged-2`, can never go in `ranged-2`, and doesn't affect the melee off hand. |
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
await item.setFlag("sogrom-simple-dnd5e-loadout", "slot", "neck");
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

What the actor's loadout shows right now.

```js
{
  slots: [{ key: "mainHand", kind: "mainHand", itemId: "…", pinned: true, blocked: false }, …],
  unslotted: ["…"]   // ids of equipped items with no free slot ("Also Worn")
}
```

`pinned` means the player put the item there. `false` means the loadout placed an equipped item in its
natural slot automatically.

### `equip(actor, item, slotKey?) → Promise<boolean>`

Puts an item the actor owns into a slot, following exactly the rules a player's drag follows:

- An item already in that slot is unequipped.
- An item already worn in another slot moves.
- A two-handed weapon in the main hand clears the off hand.
- A blocked off hand refuses.
- The `preEquip` hook can veto.

Without `slotKey`, the item goes to its natural slot, preferring an empty one. Returns whether the
loadout changed. Refusals are silent, with no notification.

### `unequip(actor, slotKeyOrItem) → Promise<boolean>`

Takes an item off. Given a slot key, empties that slot. Given an item, takes it off wherever the
loadout shows it: in a slot, or under Also Worn.

### `sets(actor) → {id, name, slots, alsoWorn}[]`

The actor's saved sets. `slots` maps each filled slot key to an item id. `alsoWorn` lists the ids of
items that were worn with no slot when the set was saved.

### `saveSet(actor, name) → Promise<string | null>`

Saves what the actor wears now as a named set and returns its id. A set with the same name (ignoring
case) is replaced and keeps its id. Returns `null` without saving when the name is blank, the actor
already has 10 sets, or the user doesn't own the actor.

### `applySet(actor, idOrName) → Promise<boolean>`

Puts a saved set on. Its items go back in their saved slots, and every other item worn in a slot or
under Also Worn comes off. Saved items the actor no longer carries are skipped. An item whose saved
slot no longer exists, or no longer takes it, is still worn and placed wherever it fits. Returns
whether the loadout changed. The `preApplySet` hook can veto the whole set, and `preEquip` is asked
about each item the set puts into a slot: a veto from either refuses the set and nothing is written.
Refusals are silent.

### `deleteSet(actor, idOrName) → Promise<boolean>`

Deletes a saved set. Its items are not affected.

### `openDock(actor) → Promise<LoadoutDock | null>`

Opens the docked loadout beside the actor's sheet, opening the sheet first if needed. Returns `null`
without opening anything if the actor's sheet can't have a dock, such as Ember's fullscreen
creation sheet.

### `openTab(actor) → Promise<void>`

Shows the Loadout tab on the actor's sheet, switching an open sheet to it or opening the sheet on
it. Works on the D&D 5e sheet and on Tidy 5e's character sheet.

### `HOOKS`

The hook names below.

## Hooks

Each hook receives a single object.

| Hook | Payload | Cancellable | When |
| --- | --- | --- | --- |
| `simpleLoadout.ready` | `{api, version}` | No | At `ready`, after the sheet integration is installed. |
| `simpleLoadout.preEquip` | `{actor, item, slot}` | **Yes.** Return `false` to refuse. | Before a drag, pick, `equip()` or saved set writes anything. For a set, it's asked once for each item put into a slot. |
| `simpleLoadout.equipped` | `{actor, item, slot}` | No | An item was put in a slot. It also fires for an item swapped into the slot another item came from. |
| `simpleLoadout.unequipped` | `{actor, item, slot}` | No | An item was taken out of a slot. `slot` is `null` for an item taken off from Also Worn. |
| `simpleLoadout.preApplySet` | `{actor, set}` | **Yes.** Return `false` to refuse. | Before a saved set is put on. The `equipped` and `unequipped` hooks still fire for each slot that changes. |
| `simpleLoadout.setApplied` | `{actor, set, missing}` | No | A saved set was put on. `missing` names saved items the actor no longer carries. |

A listener that throws is logged and ignored. A throwing `preEquip` listener doesn't count as a veto.

## Stored data

| Where | Shape |
| --- | --- |
| `actor.flags["sogrom-simple-dnd5e-loadout"].slots` | `{[slotKey]: itemId \| null}`, the player's placements. |
| `actor.flags["sogrom-simple-dnd5e-loadout"].portrait` | `{src, fit: "cover" \| "contain", focus: 0–100}` |
| `actor.flags["sogrom-simple-dnd5e-loadout"].sets` | `[{id, name, slots: {[slotKey]: itemId}, alsoWorn: itemId[], names: {[itemId]: name}}]`, the saved sets. Use `saveSet` and `deleteSet` rather than writing it. |
| `item.flags["sogrom-simple-dnd5e-loadout"].slot` | An optional pinned slot kind. |

`system.equipped` is always the source of truth. The `slots` flag records *where* the player put
something, and the loadout ignores an entry for an item that is no longer equipped. That's why an item
unequipped from the inventory tab and later equipped again returns to its slot. Don't write the flag
directly: use `equip` and `unequip`, which keep the two in step.
