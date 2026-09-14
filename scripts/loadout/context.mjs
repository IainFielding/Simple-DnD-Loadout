/**
 * Build what the loadout template draws, for one actor.
 *
 * Both surfaces — the sheet tab and the docked window — call {@link buildLoadoutContext} and render
 * the same `loadout.hbs` partial from it, which is what keeps them identical. Everything that decides
 * *what goes where* is in `data/`; this file only reads the actor, calls that, and dresses the
 * result with labels, tooltips and CSS hooks.
 */

import { FLAGS, MODULE_ID, SETTINGS, emberActive, setting, t } from "../config.mjs";
import { SLOT_GROUPS, SLOT_KINDS, buildSlots, isCampSlot, normaliseLayout } from "../data/slots.mjs";
import { canAttune, itemFacts, needsAttunement } from "../data/item-facts.mjs";
import { candidatesFor, resolveLayout } from "../data/layout.mjs";
import { gearCounter, gearDelta, gearStat, gearWarnings } from "../data/gear.mjs";
import { matchingSet, normaliseSets } from "../data/sets.mjs";
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
 * An actor's saved sets.
 * @param {Actor} actor
 * @returns {import("../data/sets.mjs").SavedSet[]}
 */
export function readSets(actor) {
  return normaliseSets(actor?.getFlag?.(MODULE_ID, FLAGS.sets));
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
  const traits = actorTraits(actor);

  const cells = layout.cells.map(cell => dressCell(cell, counts, editable, traits));
  const groups = Object.fromEntries(SLOT_GROUPS.map(g => [g, cells.filter(c => c.group === g)]));

  const attributes = actor?.system?.attributes ?? {};
  const attunement = attunementPips(attributes.attunement?.value, attributes.attunement?.max);
  const encumbrance = encumbranceBar(attributes.encumbrance);
  const portrait = portraitFor(actor);
  const current = editable ? matchingSet(readSets(actor), layout) : null;

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
    unslotted: layout.unslotted.map(item => ({ ...dressItem(item, { traits, worn: true }), draggable: editable })),
    // Saved sets are for changing the loadout, so only someone who may change it sees the button.
    sets: editable ? {
      current: current?.name ?? "",
      label: current ? t("sets.wearing", { set: current.name }) : t("sets.title")
    } : null,
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

/**
 * What the click-to-choose drawer draws for one slot: every item that fits, with the numbers that
 * matter for choosing and how each compares with what is in the slot now.
 * @param {Actor} actor
 * @param {string} key
 * @returns {object|null}  Null for a slot the loadout does not have.
 */
export function buildPickerContext(actor, key) {
  const { layout, items, counts } = readLayout(actor);
  const cell = layout.cells.find(c => c.key === key);
  if ( !cell ) return null;
  const traits = actorTraits(actor);
  const worn = !isCampSlot(cell);
  const occupantStat = cell.item ? statFor(cell.item, traits) : null;

  const candidates = candidatesFor(layout, key, items).map(({ item, wornIn }) => {
    const dressed = dressItem(item, { traits, worn });
    const where = wornIn ? layout.cells.find(c => c.key === wornIn) : null;
    const stat = statFor(item, traits);
    const delta = gearDelta(stat, occupantStat);
    return {
      ...dressed,
      stat: statText(stat),
      searchName: item.name.toLocaleLowerCase(),
      wornIn: where ? t("picker.wornIn", { slot: slotLabel(where, counts) }) : "",
      delta: (delta === null) || (delta === 0) ? null : {
        text: delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`,
        up: delta > 0,
        label: t(delta > 0 ? "gear.better" : "gear.worse", { delta: Math.abs(delta), item: cell.item.name })
      }
    };
  });

  return {
    key,
    label: slotLabel(cell, counts),
    placeholder: SLOT_KINDS[cell.kind].placeholder,
    candidates,
    searchLabel: t("picker.search", { actor: actor.name }),
    noneLabel: t("picker.none", { actor: actor.name })
  };
}

/**
 * What the saved-sets drawer draws.
 * @param {Actor} actor
 * @returns {object}
 */
export function buildSetsContext(actor) {
  const { layout } = readLayout(actor);
  const sets = readSets(actor);
  const current = matchingSet(sets, layout);
  return {
    sets: sets.map(set => {
      const count = new Set([...Object.values(set.slots), ...set.alsoWorn]).size;
      return {
        id: set.id,
        name: set.name,
        current: set === current,
        meta: set === current ? t("sets.wearingNow") : t("sets.itemCount", { count }),
        applyLabel: t("sets.apply", { set: set.name }),
        deleteLabel: t("sets.delete", { set: set.name })
      };
    }),
    none: t("sets.none", { actor: actor.name })
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

/**
 * Whether this user should be kept from what an unidentified item really is. dnd5e shows a player
 * neither the attunement nor the magic of an unidentified item (`concealDetails` on its sheets), and
 * the loadout must not give away through a rarity frame what the sheet hides.
 * @param {import("../data/item-facts.mjs").ItemFacts} item
 * @returns {boolean}
 */
export function isConcealed(item) {
  return !item.identified && !game.user?.isGM;
}

/** The actor numbers the gear notes need. */
function actorTraits(actor) {
  const abilities = actor?.system?.abilities ?? {};
  return {
    strength: Number(abilities.str?.value),
    dexMod: Number(abilities.dex?.mod) || 0
  };
}

function statFor(item, traits) {
  return gearStat(item, { dexMod: traits.dexMod, concealed: isConcealed(item) });
}

/** A stat as one line of text: "AC 14 + Dex (max 2)", "1d8 Slashing, 1d10 two-handed". */
function statText(stat) {
  if ( !stat ) return "";
  if ( stat.category !== "weapon" ) return t(`gear.${stat.key}`, stat.data);
  // Built up rather than one string, so a weapon with no damage type leaves no stray space or comma.
  const damage = t("gear.damage", stat.data).trim();
  return stat.data.versatile ? t("gear.damageVersatile", { damage, versatile: stat.data.versatile }) : damage;
}

/**
 * The template-facing shape of one item.
 * @param {import("../data/item-facts.mjs").ItemFacts} item
 * @param {object} options
 * @param {object} options.traits  From {@link actorTraits}.
 * @param {boolean} options.worn   Worn rather than packed: only worn gear warns.
 */
function dressItem(item, { traits, worn }) {
  const concealed = isConcealed(item);
  const warnings = worn ? gearWarnings(item, traits).map(w => t(`gear.${w.key}`, w.data)) : [];
  const counter = gearCounter(item);
  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img || "icons/svg/item-bag.svg",
    concealed,
    rarity: concealed ? "" : rarityClass(item.rarity),
    attuned: !concealed && item.attuned,
    inert: !concealed && needsAttunement(item),
    canAttune: !concealed && canAttune(item),
    warnings,
    counter: counter && {
      text: counter.kind === "uses" ? `${counter.value}/${counter.max}` : `×${counter.value}`,
      label: t(`gear.${counter.kind}`, counter),
      empty: (counter.kind === "uses") && (counter.value === 0)
    },
    tooltip: item.uuid
      ? `<section class="loading" data-uuid="${item.uuid}"><i class="fas fa-spinner fa-spin-pulse" inert></i></section>`
      : item.name,
    tooltipClass: item.uuid ? ITEM_TOOLTIP_CLASS : "",
    // dnd5e prints `data-tooltip-extras` in the item's own card, which is where a warning belongs.
    tooltipExtras: warnings.join(" · ")
  };
}

/** The template-facing shape of one cell. */
function dressCell(cell, counts, editable, traits) {
  const label = slotLabel(cell, counts);
  const item = cell.item ? dressItem(cell.item, { traits, worn: !isCampSlot(cell) }) : null;
  let ariaLabel;
  if ( cell.conflict ) ariaLabel = t("slot.conflict", { item: item.name, weapon: cell.blockedBy.name });
  else if ( item ) ariaLabel = t("slot.filled", { label, item: item.name });
  else if ( cell.blocked ) ariaLabel = t("slot.blocked", { label, weapon: cell.blockedBy.name });
  else if ( editable ) ariaLabel = t("slot.empty", { label });
  else ariaLabel = t("slot.emptyReadonly", { label });
  // The badges are decoration; say the same things in words for anyone not seeing them.
  const notes = [];
  if ( item?.attuned ) notes.push(t("slot.attuned"));
  else if ( item?.inert ) notes.push(t("slot.inert"));
  if ( item?.counter ) notes.push(item.counter.label);
  if ( item?.warnings.length ) notes.push(...item.warnings);
  if ( notes.length ) ariaLabel = `${ariaLabel} (${notes.join("; ")})`;

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
    tooltipClass: item ? item.tooltipClass : "",
    tooltipExtras: item ? item.tooltipExtras : ""
  };
}
