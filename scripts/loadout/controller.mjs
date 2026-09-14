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
import { SLOT_KINDS } from "../data/slots.mjs";
import { itemFacts } from "../data/item-facts.mjs";
import { candidatesFor, checkPlacement } from "../data/layout.mjs";
import { rarityClass } from "../data/stats.mjs";
import { readLayout, slotLabel } from "./context.mjs";
import { dropItemOnSlot, equipToSlot, toggleAttunement, unequipSlot } from "./actions.mjs";

/** Marks a root as bound, so a double call on the same element is harmless. */
const BOUND = new WeakSet();

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
 */
export function bindLoadout(root, { actor, editable, onPortrait }) {
  if ( !root || BOUND.has(root) ) return;
  BOUND.add(root);
  const ctx = { root, actor, editable, onPortrait };

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

/* -------------------------------------------- */
/*  Click & keyboard                            */
/* -------------------------------------------- */

function onClick(event, ctx) {
  const action = event.target.closest("[data-lo-action]")?.dataset.loAction;
  if ( action === "portrait" ) return ctx.onPortrait?.();

  const chip = event.target.closest("[data-lo-unslotted]");
  if ( chip ) return ctx.actor.items.get(chip.dataset.loUnslotted)?.sheet?.render(true);

  const slot = event.target.closest(".lo-slot");
  if ( !slot || slot.closest(".lo-picker") ) return;
  const item = ctx.actor.items.get(slot.dataset.loItem ?? "");
  if ( item ) return item.sheet?.render(true);
  if ( ctx.editable && !slot.classList.contains("is-blocked") ) openPicker(ctx, slot.dataset.loSlot);
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
    // A packed item is not worn, so attunement is not offered from its camp slot.
    return ctx.editable && !!item && !inCamp(target) && ["required", "optional"].includes(item.system.attunement);
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
      visible: target => ctx.actor.isOwner && !!itemOf(target)?.system.activities?.size,
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
        return itemOf(target)?.update({ "system.equipped": false });
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
/*  Picker                                      */
/* -------------------------------------------- */

/**
 * Open the choose-an-item drawer for a slot.
 * @param {object} ctx
 * @param {string} key
 */
export async function openPicker(ctx, key) {
  const host = ctx.root.querySelector(".lo-picker-host");
  if ( !host ) return;
  const { layout, items, counts } = readLayout(ctx.actor);
  const cell = layout.cells.find(c => c.key === key);
  if ( !cell ) return;

  const candidates = candidatesFor(layout, key, items).map(({ item, wornIn }) => {
    const where = wornIn ? layout.cells.find(c => c.key === wornIn) : null;
    return {
      id: item.id,
      name: item.name,
      searchName: item.name.toLocaleLowerCase(),
      img: item.img || "icons/svg/item-bag.svg",
      rarity: rarityClass(item.rarity),
      wornIn: where ? t("picker.wornIn", { slot: slotLabel(where, counts) }) : "",
      canAttune: ["required", "optional"].includes(item.attunement),
      attuned: item.attuned,
      tooltip: `<section class="loading" data-uuid="${item.uuid}"><i class="fas fa-spinner fa-spin-pulse" inert></i></section>`,
      tooltipClass: "dnd5e2 dnd5e-tooltip item-tooltip document-tooltip"
    };
  });

  const html = await foundry.applications.handlebars.renderTemplate(tpl("parts/picker.hbs"), {
    key,
    label: slotLabel(cell, counts),
    placeholder: SLOT_KINDS[cell.kind].placeholder,
    candidates,
    searchLabel: t("picker.search", { actor: ctx.actor.name }),
    noneLabel: t("picker.none", { actor: ctx.actor.name })
  });
  host.innerHTML = html;
  const picker = host.querySelector(".lo-picker");
  ctx.root.classList.add("is-picking");

  const close = () => {
    host.innerHTML = "";
    ctx.root.classList.remove("is-picking");
    ctx.root.querySelector(`.lo-slot[data-lo-slot="${CSS.escape(key)}"]`)?.focus();
  };

  picker.addEventListener("click", async event => {
    event.stopPropagation();
    if ( event.target.closest("[data-lo-action='close-picker']") ) return close();
    const choice = event.target.closest("[data-lo-choose]");
    if ( !choice ) return;
    const item = ctx.actor.items.get(choice.dataset.loChoose);
    const done = await equipToSlot(ctx.actor, item, key);
    // A successful equip re-renders the loadout and takes the picker with it; only a refusal leaves
    // it open, where closing it would lose the player's place.
    if ( done && picker.isConnected ) close();
  });
  picker.addEventListener("keydown", event => {
    if ( event.key === "Escape" ) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
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
