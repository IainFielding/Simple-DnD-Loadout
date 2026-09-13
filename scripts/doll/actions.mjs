/**
 * The only code that writes to the world.
 *
 * Every change the doll makes goes through {@link applyPlan}: a plan from `data/layout.mjs` is
 * checked against permissions and the `preEquip` hook, then committed in at most two writes.
 * Callers — the controller's drag/click handlers, the public API — never touch documents directly,
 * which keeps "who may do what" in one place.
 */

import {
  FLAGS, FOREIGN_DROP_MODES, HOOKS, MODULE_ID, SETTINGS, callCancellable, fireHook, log, setting, t
} from "../config.mjs";
import { itemFacts } from "../data/item-facts.mjs";
import { planPlace, planRemove } from "../data/layout.mjs";
import { readLayout, slotLabel } from "./context.mjs";

/** Show a refusal to the user. `data` fills the reason's placeholders. */
export function notifyRefusal(reason, data = {}) {
  ui.notifications?.warn(t(`reject.${reason}`, data));
}

/**
 * Put an item the actor owns into a slot.
 * @param {Actor} actor
 * @param {Item} item           An item embedded on `actor`.
 * @param {string} targetKey
 * @param {object} [options]
 * @param {string|null} [options.sourceKey]  The slot it was dragged from.
 * @param {boolean} [options.notify=true]    Show refusals as notifications.
 * @returns {Promise<boolean>}  Whether anything changed.
 */
export async function equipToSlot(actor, item, targetKey, { sourceKey = null, notify = true } = {}) {
  if ( !actor?.isOwner ) return refuse("notOwner", { actor: actor?.name ?? "" }, notify);
  if ( item?.parent !== actor ) return refuse("foreign", { actor: actor.name }, notify);

  const { layout, counts } = readLayout(actor);
  const facts = itemFacts(item);
  const plan = planPlace(layout, { targetKey, item: facts, sourceKey });
  if ( plan.error ) {
    const target = layout.cells.find(c => c.key === targetKey);
    const main = layout.cells.find(c => c.kind === "mainHand");
    return refuse(plan.error, {
      item: item.name,
      slot: target ? slotLabel(target, counts) : targetKey,
      weapon: main?.item?.name ?? ""
    }, notify);
  }

  if ( !callCancellable(HOOKS.preEquip, { actor, item, slot: targetKey }) ) {
    return refuse("vetoed", {}, notify);
  }
  await commit(actor, plan);
  return true;
}

/**
 * Empty a slot, unequipping what was in it.
 * @param {Actor} actor
 * @param {string} key
 * @param {object} [options]
 * @param {boolean} [options.notify=true]
 * @returns {Promise<boolean>}
 */
export async function unequipSlot(actor, key, { notify = true } = {}) {
  if ( !actor?.isOwner ) return refuse("notOwner", { actor: actor?.name ?? "" }, notify);
  const { layout } = readLayout(actor);
  const plan = planRemove(layout, key);
  if ( plan.error ) return refuse(plan.error, {}, notify);
  await commit(actor, plan);
  return true;
}

/**
 * Drop handling for an item that may not belong to the actor yet.
 *
 * An owned item is simply placed. A foreign one — dragged from a compendium, the Items sidebar or
 * another actor — is first copied into the inventory, if the `foreignDrops` setting lets this user
 * do that, and then placed. Copying rather than moving matches what dropping an item on a dnd5e
 * sheet does.
 * @param {Actor} actor
 * @param {Item} dropped
 * @param {string} targetKey
 * @param {object} [options]
 * @param {string|null} [options.sourceKey]
 * @returns {Promise<boolean>}
 */
export async function dropItemOnSlot(actor, dropped, targetKey, { sourceKey = null } = {}) {
  if ( !dropped ) return false;
  if ( dropped.parent === actor ) return equipToSlot(actor, dropped, targetKey, { sourceKey });
  if ( !mayDropForeign(game.user, actor) ) return refuse("foreign", { actor: actor.name }, true);

  // Check the slot would take it *before* creating anything, so a refused drop leaves no stray
  // copy in the inventory.
  const { layout, counts } = readLayout(actor);
  const probe = planPlace(layout, { targetKey, item: { ...itemFacts(dropped), id: "__probe__", equipped: false } });
  if ( probe.error ) {
    const target = layout.cells.find(c => c.key === targetKey);
    const main = layout.cells.find(c => c.kind === "mainHand");
    return refuse(probe.error, {
      item: dropped.name, slot: target ? slotLabel(target, counts) : targetKey, weapon: main?.item?.name ?? ""
    }, true);
  }

  const data = dropped.toObject();
  delete data._id;
  foundry.utils.setProperty(data, "system.equipped", false);
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  if ( !created ) return false;
  ui.notifications?.info(t("notify.created", { item: created.name, actor: actor.name }));
  return equipToSlot(actor, created, targetKey);
}

/**
 * Whether a user may drop items the actor does not own, per the `foreignDrops` setting.
 * @param {User} user
 * @param {Actor} actor
 * @returns {boolean}
 */
export function mayDropForeign(user, actor) {
  const mode = FOREIGN_DROP_MODES.includes(setting(SETTINGS.foreignDrops)) ? setting(SETTINGS.foreignDrops) : "gm";
  if ( mode === "none" ) return false;
  if ( mode === "gm" ) return !!user?.isGM;
  return !!actor?.isOwner;
}

/**
 * Toggle attunement on a worn item. Going over the limit is allowed — dnd5e allows it and flags
 * it on the sheet — but is called out, since it is almost always a mistake.
 * @param {Actor} actor
 * @param {Item} item
 * @returns {Promise<void>}
 */
export async function toggleAttunement(actor, item) {
  if ( !actor?.isOwner || (item?.parent !== actor) ) return;
  const attuned = !item.system.attuned;
  await item.update({ "system.attuned": attuned });
  const { value, max } = actor.system.attributes?.attunement ?? {};
  if ( attuned && Number.isFinite(max) && (value > max) ) {
    ui.notifications?.warn(t("notify.attuneOver", { actor: actor.name, used: value, max }));
  }
}

/* -------------------------------------------- */

/** Log and optionally show a refusal; always resolves `false` so callers can `return refuse(…)`. */
function refuse(reason, data, notify) {
  log(`refused: ${reason}`, data);
  if ( notify ) notifyRefusal(reason, data);
  return false;
}

/**
 * Write a plan. The flag goes first, without a render, so the sheet's single re-render after the
 * item update already shows items in their new slots — writing items first would flash them into
 * auto-placed positions for a frame. When no item changes (a pure move between slots) the flag
 * write is the only write, so it renders.
 * @param {Actor} actor
 * @param {import("../data/layout.mjs").Plan} plan
 */
async function commit(actor, plan) {
  const updates = [
    ...plan.equip.map(_id => ({ _id, "system.equipped": true })),
    ...plan.unequip.map(_id => ({ _id, "system.equipped": false }))
  ];
  log("commit", plan);
  await actor.update({ [`flags.${MODULE_ID}.${FLAGS.slots}`]: plan.assignments }, { render: !updates.length });
  if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates);

  for ( const { item, key } of plan.removed ) {
    fireHook(HOOKS.unequipped, { actor, item: actor.items.get(item.id) ?? null, slot: key });
  }
  for ( const { item, key } of plan.placed ) {
    fireHook(HOOKS.equipped, { actor, item: actor.items.get(item.id) ?? null, slot: key });
  }
}
