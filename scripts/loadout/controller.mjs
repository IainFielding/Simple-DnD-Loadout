/**
 * Make a rendered loadout interactive.
 *
 * {@link bindLoadout} is called on the *freshly rendered* `.sogrom-loadout` element after every render,
 * by both surfaces. Binding on that element, rather than delegating from the sheet's window, is
 * deliberate: dnd5e's sheet listens for `drop` on its own root, and a listener on the same element
 * cannot be pre-empted by `stopPropagation`. From a descendant it can, so a drop on a slot is ours
 * alone and never also lands in the inventory as a sort. A re-render replaces the element, and
 * with it every listener and the context menu, so nothing leaks between renders.
 *
 * All writes go through `actions.mjs`.
 */

import { MODULE_ID, t, tpl } from "../config.mjs";
import { itemFacts } from "../data/item-facts.mjs";
import { checkPlacement } from "../data/layout.mjs";
import { buildPickerContext, buildSetsContext, isConcealed, readLayout, readSets } from "./context.mjs";
import {
  applySet, deleteSet, dropItemOnSlot, equipToSlot, saveSet, toggleAttunement, unequipItem, unequipSlot
} from "./actions.mjs";

/**
 * Each bound root's context. Marks a root as bound, so a double call on the same element is harmless,
 * and lets a drawer find the loadout that replaced the one it was opened from (see {@link liveContext}).
 * @type {WeakMap<HTMLElement, object>}
 */
const CONTEXTS = new WeakMap();

/**
 * The drag in progress that started on a loadout. Held here because a `dragover` handler cannot read
 * the drag's data (browsers protect it until `drop`), yet the slots should light up as soon as the
 * drag starts.
 * @type {{uuid: string, actorUuid: string, slot: string|null}|null}
 */
let activeDrag = null;

/**
 * @param {HTMLElement} root   The `.sogrom-loadout` element.
 * @param {object} options
 * @param {Actor} options.actor
 * @param {boolean} options.editable
 * @param {Function} [options.onPortrait]  Opens the portrait settings.
 * @param {Function} [options.mode]  The mode of the sheet the loadout belongs to, read on each click:
 *   `"play"`, `"edit"` or null. See sheet/sheet-mode.mjs.
 */
export function bindLoadout(root, { actor, editable, onPortrait, mode }) {
  if ( !root || CONTEXTS.has(root) ) return;
  const ctx = { root, actor, editable, onPortrait, mode };
  CONTEXTS.set(root, ctx);
  refreshMode(root);

  root.addEventListener("click", event => onClick(event, ctx));
  root.addEventListener("keydown", event => onKeyDown(event, ctx));

  if ( editable ) {
    root.addEventListener("dragstart", event => onDragStart(event, ctx));
    root.addEventListener("dragend", () => endDrag(root));
    root.addEventListener("dragenter", event => onDragEnter(event, ctx));
    root.addEventListener("dragover", event => onDragOver(event, ctx));
    root.addEventListener("dragleave", event => onDragLeave(event, ctx));
    root.addEventListener("drop", event => onDrop(event, ctx));
  }

  createContextMenu(ctx);
}

/**
 * Mirror the sheet's mode onto a bound loadout as `data-lo-mode`, for what only shows in one mode (the
 * portrait button waits for edit mode). Called on every bind, which covers the sheet tabs: a mode
 * change redraws them. The dock is not redrawn with its sheet, so it calls this when the sheet's
 * classes change.
 * @param {HTMLElement|null} root  A `.sogrom-loadout` element.
 */
export function refreshMode(root) {
  const ctx = root && CONTEXTS.get(root);
  if ( !ctx ) return;
  const mode = ctx.mode?.() ?? null;
  if ( mode ) root.dataset.loMode = mode;
  else delete root.dataset.loMode;
}

/* -------------------------------------------- */
/*  Click & keyboard                            */
/* -------------------------------------------- */

function onClick(event, ctx) {
  const action = event.target.closest("[data-lo-action]")?.dataset.loAction;
  // The background picture is sheet set-up, so like the sheet's own editing it waits for edit mode.
  if ( action === "portrait" ) return (ctx.mode?.() === "play") ? undefined : ctx.onPortrait?.();
  if ( (action === "sets") && ctx.editable ) return openSets(ctx);

  const chip = event.target.closest("[data-lo-unslotted]");
  if ( chip ) return activateItem(ctx, ctx.actor.items.get(chip.dataset.loUnslotted), event, { target: chip });

  const slot = event.target.closest(".lo-slot");
  if ( !slot || slot.closest(".lo-picker") ) return;
  const item = ctx.actor.items.get(slot.dataset.loItem ?? "");
  // Packed camp clothes are not worn, so there is nothing to use: they always open.
  if ( item ) return activateItem(ctx, item, event, { packed: slot.dataset.loGroup === "camp", target: slot });
  if ( ctx.editable && !slot.classList.contains("is-blocked") ) openPicker(ctx, slot.dataset.loSlot);
}

/**
 * Left-click on a worn item, following the sheet's mode:
 *
 * - **edit**: the slot's menu opens — swap, unequip, attune — as a right-click would.
 * - **play**: an item with something to do (an attack, a wand's spell, lighting a torch) is used. An
 *   item with nothing to do opens instead, rather than posting a card to chat for a pair of boots.
 * - a sheet with no modes, someone who can only look, or a packed camp item: the item opens.
 *
 * The right-click menu is the same in every mode.
 * @param {object} ctx
 * @param {Item} item
 * @param {MouseEvent} event
 * @param {object} [options]
 * @param {boolean} [options.packed]     In a camp slot: packed, not worn.
 * @param {HTMLElement} [options.target]  The slot or chip clicked, for the menu.
 */
function activateItem(ctx, item, event, { packed = false, target = null } = {}) {
  if ( !item ) return;
  const mode = ctx.mode?.() ?? null;
  if ( (mode === "edit") && ctx.editable && target ) return openMenuAt(target, event);
  if ( (mode === "play") && !packed && ctx.actor.isOwner && hasSomethingToDo(item) ) return item.use({ event });
  return item.sheet?.render(true);
}

/**
 * Whether using an item does anything: it has an activity the user can use. dnd5e's `Item#use` on an
 * item without one only posts its description to chat.
 * @param {Item} item
 * @returns {boolean}
 */
export function hasSomethingToDo(item) {
  return Array.from(item?.system?.activities ?? []).some(activity => activity?.canUse !== false);
}

/**
 * Open the loadout's context menu on an element, where it was clicked — or, from the keyboard, over its
 * middle. Foundry's ContextMenu opens on a `contextmenu` event, so that is what is sent; the click is
 * stopped first so it cannot bubble on to the listener that closes menus on any click.
 * @param {HTMLElement} target
 * @param {MouseEvent} event
 */
function openMenuAt(target, event) {
  event?.preventDefault();
  event?.stopPropagation();
  const rect = target.getBoundingClientRect();
  const fromPointer = event && (event.detail > 0);
  target.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: fromPointer ? event.clientX : rect.left + (rect.width / 2),
    clientY: fromPointer ? event.clientY : rect.top + (rect.height / 2)
  }));
}

function onKeyDown(event, ctx) {
  const slot = event.target.closest?.(".lo-slot");
  if ( !slot || !ctx.editable ) return;
  if ( ["Delete", "Backspace"].includes(event.key) && slot.dataset.loItem ) {
    event.preventDefault();
    unequipSlot(ctx.actor, slot.dataset.loSlot);
  }
}

/* -------------------------------------------- */
/*  Context menu                                */
/* -------------------------------------------- */

function createContextMenu(ctx) {
  const ContextMenu = foundry.applications.ux.ContextMenu.implementation;
  const itemOf = target => ctx.actor.items.get(target.dataset.loItem ?? target.dataset.loUnslotted ?? "");
  const inCamp = target => target.dataset.loGroup === "camp";
  const canAttuneItem = target => {
    const item = itemOf(target);
    // A packed item is not worn, so attunement is not offered from its camp slot; and as on dnd5e's
    // own sheet, a player is not offered it for an item they have not identified.
    return ctx.editable && !!item && !inCamp(target) && ["required", "optional"].includes(item.system.attunement)
      && !isConcealed(itemFacts(item));
  };

  new ContextMenu(ctx.root, ".lo-slot.is-filled, .lo-chip", [
    {
      label: `${MODULE_ID}.menu.view`,
      icon: "<i class=\"fa-solid fa-eye\"></i>",
      onClick: (_event, target) => itemOf(target)?.sheet?.render(true)
    },
    {
      label: `${MODULE_ID}.menu.use`,
      icon: "<i class=\"fa-solid fa-dice-d20\"></i>",
      visible: target => ctx.actor.isOwner && hasSomethingToDo(itemOf(target)),
      onClick: (event, target) => itemOf(target)?.use({ event })
    },
    {
      label: `${MODULE_ID}.menu.attune`,
      icon: "<i class=\"fa-solid fa-sun\"></i>",
      visible: target => canAttuneItem(target) && !itemOf(target)?.system.attuned,
      onClick: (_event, target) => toggleAttunement(ctx.actor, itemOf(target))
    },
    {
      label: `${MODULE_ID}.menu.unattune`,
      icon: "<i class=\"fa-regular fa-sun\"></i>",
      visible: target => canAttuneItem(target) && !!itemOf(target)?.system.attuned,
      onClick: (_event, target) => toggleAttunement(ctx.actor, itemOf(target))
    },
    {
      label: `${MODULE_ID}.menu.swap`,
      icon: "<i class=\"fa-solid fa-arrow-right-arrow-left\"></i>",
      visible: target => ctx.editable && !!target.dataset.loSlot,
      onClick: (_event, target) => openPicker(ctx, target.dataset.loSlot)
    },
    {
      label: `${MODULE_ID}.menu.unpack`,
      icon: "<i class=\"fa-solid fa-box-open\"></i>",
      visible: target => ctx.editable && inCamp(target),
      onClick: (_event, target) => unequipSlot(ctx.actor, target.dataset.loSlot)
    },
    {
      label: `${MODULE_ID}.menu.unequip`,
      icon: "<i class=\"fa-solid fa-hand\"></i>",
      visible: target => ctx.editable && !inCamp(target),
      onClick: (_event, target) => {
        if ( target.dataset.loSlot ) return unequipSlot(ctx.actor, target.dataset.loSlot);
        return unequipItem(ctx.actor, itemOf(target));
      }
    }
  ], { jQuery: false, fixed: true });
}

/* -------------------------------------------- */
/*  Drag & drop                                 */
/* -------------------------------------------- */

function onDragStart(event, ctx) {
  const source = event.target.closest?.("[data-lo-uuid]");
  if ( !source ) return;
  const slot = source.dataset.loSlot ?? null;
  activeDrag = { uuid: source.dataset.loUuid, actorUuid: ctx.actor.uuid, slot };
  // A standard Item drag payload, so the slot can also be dropped on other sheets, the hotbar or
  // another actor exactly like an inventory row. Our extra key only matters to a loadout.
  event.dataTransfer.setData("text/plain", JSON.stringify({
    type: "Item",
    uuid: source.dataset.loUuid,
    [MODULE_ID]: { actor: ctx.actor.uuid, slot }
  }));
  event.dataTransfer.effectAllowed = "copyMove";
  event.stopPropagation();
  source.classList.add("is-dragging");
  highlightFor(ctx, activeDrag.uuid);
}

function onDragEnter(event, ctx) {
  // Drags from outside the loadout — the inventory tab of another sheet, the Items sidebar, a
  // compendium — do not pass through our dragstart. dnd5e keeps the payload of any drag its own
  // DragDrop started, which is how we can light slots up for those too. A drag it did not start
  // (a compendium index entry, another module's) simply gets no preview; the drop still works.
  if ( ctx.root.dataset.loHighlight ) return;
  const payload = activeDrag ?? CONFIG.ux?.DragDrop?.getPayload?.(event);
  if ( (payload?.type === "Item") || activeDrag ) highlightFor(ctx, payload?.uuid);
}

function onDragOver(event, ctx) {
  const slot = event.target.closest?.(".lo-slot");
  if ( !slot ) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = activeDrag?.actorUuid === ctx.actor.uuid ? "move" : "copy";
  for ( const el of ctx.root.querySelectorAll(".lo-slot.is-drop-hover") ) if ( el !== slot ) el.classList.remove("is-drop-hover");
  slot.classList.add("is-drop-hover");
}

function onDragLeave(event, ctx) {
  const slot = event.target.closest?.(".lo-slot");
  if ( slot && !slot.contains(event.relatedTarget) ) slot.classList.remove("is-drop-hover");
  // Left the loadout altogether.
  if ( !ctx.root.contains(event.relatedTarget) && !activeDrag ) clearHighlight(ctx.root);
}

async function onDrop(event, ctx) {
  const slot = event.target.closest?.(".lo-slot");
  // Not on a slot: leave the drop to the sheet (an inventory sort, say), but drop our preview.
  if ( !slot ) return clearHighlight(ctx.root);
  event.preventDefault();
  event.stopPropagation();
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  endDrag(ctx.root);
  if ( data?.type !== "Item" || !data.uuid ) return;

  const dropped = await fromUuid(data.uuid);
  const sameActor = data[MODULE_ID]?.actor === ctx.actor.uuid;
  const sourceKey = sameActor ? (data[MODULE_ID]?.slot ?? null) : null;
  if ( sourceKey === slot.dataset.loSlot ) return;
  await dropItemOnSlot(ctx.actor, dropped, slot.dataset.loSlot, { sourceKey });
}

/** Mark every slot as a valid or invalid target for the item being dragged. */
function highlightFor(ctx, uuid) {
  const item = uuid ? fromUuidSync(uuid, { strict: false }) : null;
  // A compendium drag resolves to an index entry with no system data; nothing to judge by.
  if ( !item?.system ) return;
  const facts = itemFacts(item);
  const { layout } = readLayout(ctx.actor);
  ctx.root.dataset.loHighlight = "1";
  for ( const el of ctx.root.querySelectorAll(".lo-slot") ) {
    const ok = checkPlacement(layout, el.dataset.loSlot, facts).ok;
    el.classList.toggle("is-drop-ok", ok);
    el.classList.toggle("is-drop-bad", !ok);
  }
}

function clearHighlight(root) {
  delete root.dataset.loHighlight;
  for ( const el of root.querySelectorAll(".is-drop-ok, .is-drop-bad, .is-drop-hover, .is-dragging") ) {
    el.classList.remove("is-drop-ok", "is-drop-bad", "is-drop-hover", "is-dragging");
  }
}

function endDrag(root) {
  activeDrag = null;
  // A drag that started on one loadout may have lit up another one (the tab and the dock at once).
  for ( const loadout of document.querySelectorAll(".sogrom-loadout[data-lo-highlight]") ) clearHighlight(loadout);
  clearHighlight(root);
}

/* -------------------------------------------- */
/*  Drawers: the picker and saved sets          */
/* -------------------------------------------- */

/**
 * The context to open a drawer in, once its template has rendered. Rendering a template is async, and
 * a sheet can redraw the loadout in that moment (Tidy 5e does when it switches to the tab); a drawer
 * put into the replaced element would open where nobody can see it. So an old root hands over to the
 * loadout for the same actor now drawn in the same window.
 * @param {object} ctx
 * @param {Element|null} scope  The window the loadout was in when the drawer was asked for.
 * @returns {object|null}
 */
function liveContext(ctx, scope) {
  if ( ctx.root.isConnected ) return ctx;
  const root = scope?.isConnected
    ? scope.querySelector(`.sogrom-loadout[data-lo-actor="${CSS.escape(ctx.actor.uuid)}"]`)
    : null;
  return (root && CONTEXTS.get(root)) ?? null;
}

/**
 * Show a drawer in the loadout's drawer host, replacing any drawer already open.
 * @param {object} ctx
 * @param {string} html
 * @param {HTMLElement|null} returnFocus  Focused again when the drawer closes.
 * @returns {{drawer: HTMLElement, close: Function}|null}
 */
function openDrawer(ctx, html, returnFocus) {
  const host = ctx.root.querySelector(".lo-picker-host");
  if ( !host ) return null;
  host.innerHTML = html;
  const drawer = host.firstElementChild;
  ctx.root.classList.add("is-picking");
  const close = () => {
    host.innerHTML = "";
    ctx.root.classList.remove("is-picking");
    returnFocus?.focus();
  };
  drawer.addEventListener("keydown", event => {
    // Enter in a text field inside the sheet's form would submit the whole sheet.
    if ( (event.key === "Enter") && event.target.matches?.("input") ) event.preventDefault();
    if ( event.key !== "Escape" ) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  });
  drawer.addEventListener("click", event => {
    event.stopPropagation();
    if ( event.target.closest("[data-lo-action='close-picker']") ) close();
  });
  // In the sheet tab the drawer is inside dnd5e's sheet form, which submits on every `change` that
  // reaches it. A drawer's fields are the loadout's own business, never the sheet's.
  drawer.addEventListener("change", event => event.stopPropagation());
  return { drawer, close };
}

/**
 * Open the choose-an-item drawer for a slot.
 * @param {object} ctx
 * @param {string} key
 */
export async function openPicker(ctx, key) {
  const context = buildPickerContext(ctx.actor, key);
  if ( !context ) return;
  const scope = ctx.root.closest(".application");
  const html = await foundry.applications.handlebars.renderTemplate(tpl("parts/picker.hbs"), context);
  ctx = liveContext(ctx, scope);
  if ( !ctx ) return;
  const opened = openDrawer(ctx, html, ctx.root.querySelector(`.lo-slot[data-lo-slot="${CSS.escape(key)}"]`));
  if ( !opened ) return;
  const { drawer: picker, close } = opened;

  picker.addEventListener("click", async event => {
    const choice = event.target.closest("[data-lo-choose]");
    if ( !choice ) return;
    const item = ctx.actor.items.get(choice.dataset.loChoose);
    const done = await equipToSlot(ctx.actor, item, key);
    // A successful equip re-renders the loadout and takes the picker with it; only a refusal leaves
    // it open, where closing it would lose the player's place.
    if ( done && picker.isConnected ) close();
  });

  const search = picker.querySelector(".lo-picker-search");
  search?.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase();
    let shown = 0;
    for ( const li of picker.querySelectorAll("[data-lo-name]") ) {
      const match = !query || li.dataset.loName.includes(query);
      li.hidden = !match;
      if ( match ) shown++;
    }
    const empty = picker.querySelector(".lo-picker-empty");
    if ( empty ) empty.hidden = shown > 0;
  });
  (search ?? picker.querySelector("button"))?.focus();
}

/**
 * Open the saved-sets drawer: put a set on, delete one, or save what is worn now.
 * @param {object} ctx
 */
export async function openSets(ctx) {
  const scope = ctx.root.closest(".application");
  const html = await foundry.applications.handlebars.renderTemplate(tpl("parts/sets.hbs"), buildSetsContext(ctx.actor));
  ctx = liveContext(ctx, scope);
  if ( !ctx ) return;
  const opened = openDrawer(ctx, html, ctx.root.querySelector("[data-lo-action='sets']"));
  if ( !opened ) return;
  const { drawer, close } = opened;
  // Every change re-renders the loadout, which takes the drawer with it; closing by hand covers the
  // cases that change nothing.
  const closeIfStill = () => drawer.isConnected && close();

  drawer.addEventListener("click", async event => {
    const apply = event.target.closest("[data-lo-apply-set]");
    if ( apply ) {
      await applySet(ctx.actor, apply.dataset.loApplySet);
      return closeIfStill();
    }
    const remove = event.target.closest("[data-lo-delete-set]");
    if ( remove ) {
      const set = readSets(ctx.actor).find(s => s.id === remove.dataset.loDeleteSet);
      if ( !set ) return;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("sets.deleteTitle") },
        content: `<p>${foundry.utils.escapeHTML(t("sets.deleteContent", { set: set.name }))}</p>`,
        rejectClose: false
      });
      if ( confirmed ) await deleteSet(ctx.actor, set.id);
    }
  });

  const input = drawer.querySelector(".lo-sets-name");
  const save = async () => {
    const saved = await saveSet(ctx.actor, input?.value ?? "");
    if ( saved ) closeIfStill();
    else input?.focus();
  };
  drawer.querySelector("[data-lo-action='save-set']")?.addEventListener("click", save);
  input?.addEventListener("keydown", event => {
    if ( event.key !== "Enter" ) return;
    // Enter in a field of the sheet's form would otherwise submit the whole sheet.
    event.preventDefault();
    event.stopPropagation();
    save();
  });

  (drawer.querySelector(".lo-sets-item.is-current") ?? drawer.querySelector("[data-lo-apply-set]") ?? input)?.focus();
}
