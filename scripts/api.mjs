/**
 * The public API, published as `game.modules.get("sogrom-simple-dnd5e-loadout").api`.
 *
 * Installed at `init` so another module's `setup` or `ready` handler can rely on it existing.
 * Nothing in here reads world data until called. docs/API.md is the reference; keep the two in
 * step, and treat a change to any name here as breaking.
 */

import { HOOKS, MODULE_ID } from "./config.mjs";
import { SLOT_KINDS } from "./data/slots.mjs";
import { classify } from "./data/classify.mjs";
import { itemFacts } from "./data/item-facts.mjs";
import { suggestSlot } from "./data/layout.mjs";
import { readLayout, readSets } from "./loadout/context.mjs";
import { applySet, deleteSet, equipToSlot, saveSet, unequipItem, unequipSlot } from "./loadout/actions.mjs";
import { LoadoutDock, canDock } from "./sheet/dock.mjs";
import { showTab } from "./sheet/tab.mjs";

/** Build the API object. Exported for the tests; {@link registerApi} is what installs it. */
export function createApi() {
  return Object.freeze({
    /** Hook names this module fires. */
    HOOKS,

    /** Every slot kind, in draw order. */
    SLOT_KINDS: Object.freeze(Object.keys(SLOT_KINDS)),

    /**
     * Where an item naturally goes.
     * @param {Item} item
     * @returns {{kind: string, source: string}|null}
     */
    classify: item => classify(itemFacts(item)),

    /**
     * What an actor's loadout shows right now.
     * @param {Actor} actor
     * @returns {{slots: {key: string, kind: string, itemId: string|null, pinned: boolean, blocked: boolean}[], unslotted: string[]}}
     */
    layout(actor) {
      const { layout } = readLayout(actor);
      return {
        slots: layout.cells.map(cell => ({
          key: cell.key, kind: cell.kind, itemId: cell.item?.id ?? null, pinned: cell.pinned, blocked: cell.blocked
        })),
        unslotted: layout.unslotted.map(item => item.id)
      };
    },

    /**
     * Put an owned item in a slot, or in its best slot when none is named. Follows exactly the
     * rules a player dragging it would, including the `preEquip` veto.
     * @param {Actor} actor
     * @param {Item} item
     * @param {string} [slotKey]
     * @returns {Promise<boolean>}  Whether the loadout changed.
     */
    async equip(actor, item, slotKey) {
      let key = slotKey;
      if ( !key ) {
        const { layout } = readLayout(actor);
        key = suggestSlot(layout, itemFacts(item));
      }
      if ( !key ) return false;
      return equipToSlot(actor, item, key, { notify: false });
    },

    /**
     * Take an item off, by slot key or by the item itself. An item given directly may be in a slot or
     * under Also Worn.
     * @param {Actor} actor
     * @param {string|Item} slotOrItem
     * @returns {Promise<boolean>}
     */
    async unequip(actor, slotOrItem) {
      if ( typeof slotOrItem === "string" ) return unequipSlot(actor, slotOrItem, { notify: false });
      if ( !slotOrItem ) return false;
      return unequipItem(actor, slotOrItem, { notify: false });
    },

    /**
     * An actor's saved sets.
     * @param {Actor} actor
     * @returns {{id: string, name: string, slots: Record<string, string>, alsoWorn: string[]}[]}
     */
    sets: actor => readSets(actor).map(({ id, name, slots, alsoWorn }) => ({ id, name, slots: { ...slots }, alsoWorn: [...alsoWorn] })),

    /**
     * Save what an actor wears now as a named set, replacing any set with that name.
     * @param {Actor} actor
     * @param {string} name
     * @returns {Promise<string|null>}  The set's id, or null when it could not be saved.
     */
    async saveSet(actor, name) {
      return (await saveSet(actor, name, { notify: false }))?.id ?? null;
    },

    /**
     * Put a saved set on, following the `preApplySet` veto.
     * @param {Actor} actor
     * @param {string} idOrName
     * @returns {Promise<boolean>}  Whether the loadout changed.
     */
    applySet: (actor, idOrName) => applySet(actor, idOrName, { notify: false }),

    /**
     * Delete a saved set.
     * @param {Actor} actor
     * @param {string} idOrName
     * @returns {Promise<boolean>}
     */
    deleteSet: (actor, idOrName) => deleteSet(actor, idOrName, { notify: false }),

    /**
     * Open the docked loadout beside an actor's sheet, opening the sheet first if needed.
     * @param {Actor} actor
     * @returns {Promise<LoadoutDock|null>}
     */
    async openDock(actor) {
      const sheet = actor?.sheet;
      // Checked before rendering, so asking for a dock never opens a sheet it cannot attach to.
      if ( !canDock(sheet) ) return null;
      if ( !sheet.rendered ) await sheet.render({ force: true });
      return LoadoutDock.open(sheet);
    },

    /**
     * Show the Loadout tab on an actor's dnd5e sheet.
     * @param {Actor} actor
     * @returns {Promise<void>}
     */
    openTab: actor => showTab(actor)
  });
}

/** Publish the API on the module. */
export function registerApi() {
  const module = game.modules.get(MODULE_ID);
  if ( module ) module.api = createApi();
}
