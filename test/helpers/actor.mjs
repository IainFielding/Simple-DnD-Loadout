/**
 * A fake dnd5e character: enough of Actor for `loadout/context.mjs` and `loadout/actions.mjs`, with every
 * write recorded in order so tests can assert exactly what would have been sent to the server.
 */

import { MODULE_ID } from "../../scripts/config.mjs";
import { source } from "./items.mjs";

/** A minimal embedded Item wrapping a source object. */
function embed(actor, data) {
  const item = {
    ...data,
    parent: actor,
    toObject: () => structuredClone({ ...data, parent: undefined, toObject: undefined, update: undefined }),
    async update(changes) {
      actor.writes.push({ op: "item.update", id: item.id, changes });
      applyItemChanges(item, changes);
      return item;
    }
  };
  return item;
}

function applyItemChanges(item, changes) {
  for ( const [path, value] of Object.entries(changes) ) {
    if ( path === "_id" ) continue;
    const keys = path.split(".");
    const last = keys.pop();
    let cur = item;
    for ( const k of keys ) cur = (cur[k] ??= {});
    cur[last] = value;
  }
}

/**
 * @param {object} [options]
 * @param {object[]} [options.items]  Specs for `source()`.
 * @param {object} [options.slots]    Stored assignments.
 * @param {boolean} [options.isOwner]
 * @param {object} [options.attributes]
 */
export function fakeActor({ items = [], slots = {}, isOwner = true, attributes = {}, portrait } = {}) {
  const flags = { [MODULE_ID]: { slots: structuredClone(slots), ...(portrait ? { portrait } : {}) } };
  const actor = {
    id: "hero",
    uuid: "Actor.hero",
    name: "Hero",
    img: "hero.webp",
    type: "character",
    isOwner,
    writes: [],
    flags,
    system: {
      attributes: {
        ac: { value: 16 },
        attunement: { value: 1, max: 3 },
        encumbrance: { value: 60, max: 300, pct: 20, thresholds: { encumbered: 100, heavilyEncumbered: 200 } },
        ...attributes
      }
    },
    getFlag(scope, key) { return flags[scope]?.[key]; },
    async update(changes, options = {}) {
      actor.writes.push({ op: "actor.update", changes, options });
      for ( const [path, value] of Object.entries(changes) ) {
        const [, scope, key] = path.split(".");
        flags[scope] ??= {};
        // Foundry merges object updates into existing flags; null values are kept.
        flags[scope][key] = { ...(flags[scope][key] ?? {}), ...value };
      }
    },
    async updateEmbeddedDocuments(type, updates) {
      actor.writes.push({ op: "items.update", type, updates });
      for ( const { _id, ...changes } of updates ) applyItemChanges(actor.items.get(_id), changes);
    },
    async createEmbeddedDocuments(type, data) {
      actor.writes.push({ op: "items.create", type, data });
      const created = data.map(d => {
        const s = source({ name: d.name, type: d.type, subtype: d.system?.type?.value ?? "" });
        return embed(actor, { ...s, system: { ...s.system, ...structuredClone(d.system ?? {}) } });
      });
      for ( const item of created ) actor.items.set(item.id, item);
      return created;
    }
  };
  const map = new Map();
  for ( const spec of items ) {
    const item = embed(actor, source(spec));
    map.set(item.id, item);
  }
  // Collection-ish: iterable over items, with get().
  actor.items = Object.assign(map, {
    [Symbol.iterator]: () => map.values(),
    find: fn => [...map.values()].find(fn)
  });
  return actor;
}

/** A world item (not owned by any actor), as dropped from the sidebar. */
export function worldItem(spec) {
  const data = source(spec);
  return { ...data, parent: null, toObject: () => structuredClone({ ...data }) };
}
