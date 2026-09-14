/**
 * Build what the loadout template draws, for one actor.
 *
 * Both surfaces — the sheet tab and the docked window — call {@link buildLoadoutContext} and render
 * the same `loadout.hbs` partial from it, which is what keeps them identical. Everything that decides
 * *what goes where* is in `data/`; this file only reads the actor, calls that, and dresses the
 * result with labels, tooltips and CSS hooks.
 */

import { FLAGS, MODULE_ID, SETTINGS, emberActive, setting, t } from "../config.mjs";
import { SLOT_GROUPS, buildSlots, normaliseLayout } from "../data/slots.mjs";
import { canAttune, itemFacts, needsAttunement } from "../data/item-facts.mjs";
import { resolveLayout } from "../data/layout.mjs";
import { attunementPips, encumbranceBar, rarityClass } from "../data/stats.mjs";

/** dnd5e's rich item tooltip, as its own sheets emit it. See the system's `utils.mjs#loadingTooltip`. */
const ITEM_TOOLTIP_CLASS = "dnd5e2 dnd5e-tooltip item-tooltip document-tooltip";

/** What a character with no image of its own shows. */
const DEFAULT_PORTRAIT = "icons/svg/mystery-man.svg";

/**
 * Read an actor's layout.
 * @param {Actor} actor
 * @returns {{layout: import("../data/layout.mjs").Layout, items: import("../data/item-facts.mjs").ItemFacts[], counts: object}}
 */
export function readLayout(actor) {
  const layoutSetting = normaliseLayout(setting(SETTINGS.slotLayout));
  const items = [...(actor?.items ?? [])].map(itemFacts);
  const assignments = actor?.getFlag?.(MODULE_ID, FLAGS.slots) ?? {};
  const layout = resolveLayout({
    slots: buildSlots(layoutSetting),
    assignments,
    items,
    strict: !!setting(SETTINGS.strictSlots)
  });
  const counts = { ring: layoutSetting.rings, trinket: layoutSetting.trinkets, ranged: layoutSetting.ranged };
  return { layout, items, counts };
}

/**
 * The human label for a slot key: "Head", "Ring 2".
 * @param {{kind: string, index: number}} slot
 * @param {object} counts  Instances per kind.
 * @returns {string}
 */
export function slotLabel(slot, counts = {}) {
  const label = t(`slot.kind.${slot.kind}`);
  return (counts[slot.kind] ?? 1) > 1 ? t("slot.numbered", { label, index: slot.index }) : label;
}

/**
 * @param {Actor} actor
 * @param {object} [options]
 * @param {"tab"|"dock"} [options.surface]
 * @param {boolean} [options.editable]  Whether this user may change the loadout here.
 * @returns {object}
 */
export function buildLoadoutContext(actor, { surface = "tab", editable = actor?.isOwner ?? false } = {}) {
  const { layout, counts } = readLayout(actor);

  const cells = layout.cells.map(cell => dressCell(cell, counts, editable));
  const groups = Object.fromEntries(SLOT_GROUPS.map(g => [g, cells.filter(c => c.group === g)]));

  const attributes = actor?.system?.attributes ?? {};
  const attunement = attunementPips(attributes.attunement?.value, attributes.attunement?.max);
  const encumbrance = encumbranceBar(attributes.encumbrance);
  const portrait = portraitFor(actor);

  return {
    moduleId: MODULE_ID,
    surface,
    editable,
    ember: emberActive(),
    actorUuid: actor?.uuid ?? "",
    name: actor?.name ?? "",
    showName: surface === "dock",
    portrait,
    groups,
    // Kit and trinkets share one bar; it is drawn when either has a slot.
    showBar: (groups.kit.length + groups.trinkets.length) > 0,
    unslotted: layout.unslotted.map(item => ({ ...dressItem(item), draggable: editable })),
    stats: {
      ac: Number.isFinite(attributes.ac?.value) ? attributes.ac.value : null,
      attunement: {
        ...attunement,
        label: `${t("stats.attunement")}: ${t("stats.attunementValue", { used: attunement.used, max: attunement.max })}`,
        overLabel: t("stats.attunementOver")
      },
      encumbrance: encumbrance && {
        ...encumbrance,
        label: t("stats.encumbranceValue", {
          value: Math.round(encumbrance.value * 10) / 10,
          max: Math.round(encumbrance.max * 10) / 10
        })
      }
    }
  };
}

/** Portrait source and framing, from the actor's flag or its own image. */
export function portraitFor(actor) {
  const flag = actor?.getFlag?.(MODULE_ID, FLAGS.portrait) ?? {};
  const focus = Number.isFinite(Number(flag.focus)) ? Math.min(100, Math.max(0, Number(flag.focus))) : 20;
  const src = flag.src || actor?.img || DEFAULT_PORTRAIT;
  return {
    src,
    fit: flag.fit === "contain" ? "contain" : "cover",
    focus,
    // Foundry's stock silhouettes are white vector art: full-strength behind the slots they glare,
    // so the template dims them until a real picture is set.
    placeholder: /^icons\/svg\//.test(src)
  };
}

/** The template-facing shape of one item. */
function dressItem(item) {
  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img || "icons/svg/item-bag.svg",
    rarity: rarityClass(item.rarity),
    attuned: item.attuned,
    inert: needsAttunement(item),
    canAttune: canAttune(item),
    tooltip: item.uuid
      ? `<section class="loading" data-uuid="${item.uuid}"><i class="fas fa-spinner fa-spin-pulse" inert></i></section>`
      : item.name,
    tooltipClass: item.uuid ? ITEM_TOOLTIP_CLASS : ""
  };
}

/** The template-facing shape of one cell. */
function dressCell(cell, counts, editable) {
  const label = slotLabel(cell, counts);
  const item = cell.item ? dressItem(cell.item) : null;
  let ariaLabel;
  if ( cell.conflict ) ariaLabel = t("slot.conflict", { item: item.name, weapon: cell.blockedBy.name });
  else if ( item ) ariaLabel = t("slot.filled", { label, item: item.name });
  else if ( cell.blocked ) ariaLabel = t("slot.blocked", { label, weapon: cell.blockedBy.name });
  else if ( editable ) ariaLabel = t("slot.empty", { label });
  else ariaLabel = t("slot.emptyReadonly", { label });
  // The sun badge is decoration; say the same thing in words for anyone not seeing it.
  if ( item?.attuned ) ariaLabel = `${ariaLabel} (${t("slot.attuned")})`;
  else if ( item?.inert ) ariaLabel = `${ariaLabel} (${t("slot.inert")})`;

  return {
    key: cell.key,
    kind: cell.kind,
    group: cell.group,
    label,
    placeholder: cell.placeholder,
    item,
    pinned: cell.pinned,
    blocked: cell.blocked,
    ghost: cell.blocked && !cell.item ? cell.blockedBy.img : null,
    conflict: cell.conflict,
    // Carried per cell rather than read from `@root`: inside the sheet tab `@root` is the *sheet's*
    // context, whose `editable` means "edit mode", not "may change this loadout".
    draggable: editable && !!item,
    ariaLabel,
    // An item's rich dnd5e card on hover; an empty slot just names itself.
    tooltip: item ? item.tooltip : ariaLabel,
    tooltipClass: item ? item.tooltipClass : ""
  };
}
