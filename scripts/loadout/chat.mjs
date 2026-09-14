/**
 * The chat card a loadout change posts, when the GM has switched them on.
 *
 * Called by `actions.mjs` after a change is written, by the client that made it. A card is a record
 * of what happened, never part of making it happen: when posting fails the change still stands, and
 * the failure is only logged.
 */

import { CHAT_CARD_MODES, SETTINGS, log, setting, t, tpl } from "../config.mjs";
import { describeChanges } from "../data/changes.mjs";
import { slotLabel } from "./context.mjs";

/** The `chatCards` setting, falling back to off for a value this version does not know. */
export function chatCardMode() {
  const mode = setting(SETTINGS.chatCards);
  return CHAT_CARD_MODES.includes(mode) ? mode : "none";
}

/**
 * The lines a card shows, one per change, as HTML with every name escaped.
 * @param {import("../data/changes.mjs").Change[]} changes
 * @param {object} counts  Slot counts, for numbered labels: "Ring 2".
 * @returns {{action: string, img: string, text: string}[]}
 */
export function changeLines(changes, counts) {
  const escape = foundry.utils.escapeHTML;
  const name = item => `<strong>${escape(item.name)}</strong>`;
  const slot = cell => escape(slotLabel(cell, counts));
  return changes.map(change => {
    const { action, item, other, from, to } = change;
    const data = { item: name(item) };
    if ( other ) data.other = name(other);
    if ( from ) data.from = slot(from);
    if ( to ) data.to = slot(to);
    // Also Worn has no slot to name.
    const key = (action === "unequip") && !from ? "unequipWorn" : action;
    return { action, img: item.img, text: t(`chat.change.${key}`, data) };
  });
}

/**
 * Post a card describing a written plan.
 * @param {Actor} actor
 * @param {object} before
 * @param {import("../data/layout.mjs").Layout} before.layout  The loadout before the plan was written.
 * @param {object} before.counts
 * @param {{placed: object[], removed: object[]}} plan
 * @param {object} [options]
 * @param {{name: string}|null} [options.set]  The saved set that was put on.
 * @returns {Promise<ChatMessage|null>}
 */
export async function postChangeCard(actor, { layout, counts }, plan, { set = null } = {}) {
  const mode = chatCardMode();
  if ( mode === "none" ) return null;
  try {
    const lines = changeLines(describeChanges(layout, plan), counts);
    if ( !lines.length ) return null;
    const content = await foundry.applications.handlebars.renderTemplate(tpl("chat-card.hbs"), { lines });
    const flavor = set
      ? t("chat.flavorSet", { set: foundry.utils.escapeHTML(set.name) })
      : t("chat.flavor");
    const data = { content, flavor, speaker: ChatMessage.getSpeaker({ actor }) };
    return await ChatMessage.create(ChatMessage.applyMode(data, mode));
  } catch ( err ) {
    log("could not post the change card", err);
    return null;
  }
}
