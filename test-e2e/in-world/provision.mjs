/**
 * World fixtures, built inside Foundry: the player, the two characters and their gear.
 *
 * Every item is hand-built rather than pulled from a compendium, so the suites need no content
 * pack and assert against items whose type, properties and rarity they chose. Idempotent, and
 * `resetGear` puts both characters back to "nothing equipped, no slot flags" at the start of every
 * run so no suite inherits another's state.
 */

const MODULE = "sogrom-simple-dnd5e-loadout";
export const PREFIX = "[e2e]";
export const HERO = `${PREFIX} Loadout Hero`;
export const STRANGER = `${PREFIX} Stranger`;

/**
 * The gear every character carries. `key` is how suites find an item; names are what a player sees.
 * Icons are core Foundry icons so the classifier's icon rule is exercised with real paths.
 */
export const GEAR = [
  { key: "longsword", name: "Longsword", type: "weapon", img: "icons/weapons/swords/sword-guard-steel-green.webp",
    system: { type: { value: "martialM" }, properties: ["ver"] } },
  { key: "dagger", name: "Dagger", type: "weapon", img: "icons/weapons/daggers/dagger-straight-blue.webp",
    system: { type: { value: "simpleM" }, properties: ["fin", "lgt", "thr"] } },
  { key: "greatsword", name: "Greatsword", type: "weapon", img: "icons/weapons/swords/greatsword-crossguard-steel.webp",
    system: { type: { value: "martialM" }, properties: ["hvy", "two"] } },
  { key: "shield", name: "Shield", type: "equipment", img: "icons/equipment/shield/heater-steel-worn.webp",
    system: { type: { value: "shield" }, armor: { value: 2 } } },
  { key: "chain", name: "Chain Mail", type: "equipment", img: "icons/equipment/chest/breastplate-banded-steel.webp",
    system: { type: { value: "heavy" }, armor: { value: 16 } } },
  { key: "leather", name: "Leather Armor", type: "equipment", img: "icons/equipment/chest/breastplate-layered-leather-brown.webp",
    system: { type: { value: "light" }, armor: { value: 11 } } },
  { key: "boots", name: "Boots of Speed", type: "equipment", img: "icons/equipment/feet/boots-leather-green.webp",
    system: { type: { value: "wondrous" }, rarity: "rare", properties: ["mgc"], attunement: "required" } },
  { key: "cloak", name: "Cloak of Protection", type: "equipment", img: "icons/equipment/back/cloak-heavy-fur-blue.webp",
    system: { type: { value: "wondrous" }, rarity: "uncommon", properties: ["mgc"], attunement: "required" } },
  { key: "ringProtection", name: "Ring of Protection", type: "equipment", img: "icons/equipment/finger/ring-band-gold.webp",
    system: { type: { value: "ring" }, rarity: "rare", properties: ["mgc"], attunement: "required" } },
  { key: "ringWarmth", name: "Ring of Warmth", type: "equipment", img: "icons/equipment/finger/ring-ball-gold.webp",
    system: { type: { value: "ring" }, rarity: "uncommon", properties: ["mgc"], attunement: "required" } },
  { key: "ringSwimming", name: "Ring of Swimming", type: "equipment", img: "icons/equipment/finger/ring-ball-leaves-green.webp",
    system: { type: { value: "ring" }, rarity: "uncommon", properties: ["mgc"] } },
  { key: "ioun", name: "Ioun Stone of Awareness", type: "equipment", img: "icons/commodities/gems/gem-rough-cushion-blue.webp",
    system: { type: { value: "wondrous" }, rarity: "rare", properties: ["mgc"], attunement: "required" } },
  { key: "potion", name: "Potion of Healing", type: "consumable", img: "icons/consumables/potions/bottle-round-corked-red.webp",
    system: { type: { value: "potion" } } },
  { key: "longbow", name: "Longbow", type: "weapon", img: "icons/weapons/bows/longbow-recurve-leather-brown.webp",
    system: { type: { value: "martialR" }, properties: ["amm", "hvy", "two"] } },
  { key: "handCrossbow", name: "Hand Crossbow", type: "weapon", img: "icons/weapons/crossbows/crossbow-slotted.webp",
    system: { type: { value: "martialR" }, properties: ["amm", "lgt", "lod"] } },
  // A torch in dnd5e 6.0 is a consumable with the "trinket" subtype; the tools below are real tool
  // items of the art and music types, so the tool-type rule is what files them.
  { key: "torch", name: "Torch", type: "consumable", img: "icons/sundries/lights/torch-brown-lit.webp",
    system: { type: { value: "trinket" } } },
  { key: "tinderbox", name: "Tinderbox", type: "equipment", img: "icons/sundries/lights/torch-black.webp",
    system: { type: { value: "trinket" } } },
  { key: "lute", name: "Lute", type: "tool", img: "icons/tools/instruments/lute-gold-brown.webp",
    system: { type: { value: "music" } } },
  { key: "smiths", name: "Smith's Tools", type: "tool", img: "icons/skills/trades/smithing-tongs-metal-red.webp",
    system: { type: { value: "art" } } },
  { key: "thieves", name: "Thieves' Tools", type: "tool", img: "icons/tools/hand/lockpicks-steel-grey.webp",
    system: { type: { value: "" } } },
  { key: "dice", name: "Dice", type: "tool", img: "icons/sundries/gaming/dice-runed-brown.webp",
    system: { type: { value: "game" } } },
  // Camp clothes.
  { key: "travelers", name: "Traveler's Clothes", type: "equipment", img: "icons/equipment/chest/robe-layered-white.webp",
    system: { type: { value: "clothing" } } },
  { key: "smallclothes", name: "Smallclothes", type: "equipment", img: "icons/equipment/leg/cuisses-cloth-black.webp",
    system: { type: { value: "clothing" } } },
  { key: "shoes", name: "Soft Shoes", type: "equipment", img: "icons/equipment/feet/shoes-leather-simple-brown.webp",
    system: { type: { value: "clothing" } } }
];

/**
 * Create or refresh the world's fixtures.
 * @param {{name: string, owns: string, observes: string}[]} players
 * @returns {Promise<string[]>}  Log lines.
 */
export async function ensureWorld(players) {
  const log = [];
  const hero = await ensureCharacter(HERO);
  const stranger = await ensureCharacter(STRANGER);
  log.push(`characters: ${hero.name}, ${stranger.name}`);

  for ( const spec of players ) {
    let user = game.users.find(u => u.name === spec.name);
    if ( !user ) user = await User.create({ name: spec.name, role: CONST.USER_ROLES.PLAYER });
    const owned = game.actors.getName(spec.owns);
    const observed = game.actors.getName(spec.observes);
    if ( user.character?.id !== owned.id ) await user.update({ character: owned.id });
    await owned.update({ [`ownership.${user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
    await observed.update({ [`ownership.${user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
    log.push(`user "${user.name}" owns ${owned.name}, observes ${observed.name}`);
  }
  return log;
}

async function ensureCharacter(name) {
  let actor = game.actors.getName(name);
  if ( !actor ) {
    actor = await Actor.create({
      name,
      type: "character",
      img: "icons/svg/mystery-man.svg",
      system: { abilities: { str: { value: 16 } } }
    });
  }
  await finishEmberCreation(actor);
  await resetGear(actor);
  return actor;
}

/**
 * In an Ember world, a character created by anyone gets Ember's creation sheet
 * (`flags.core.sheetClass`) until Ember's builder marks it finished (`flags.ember.characterCreation`)
 * and hands it back to dnd5e's sheet. The fixtures stand for characters players are already
 * playing, so they are marked finished exactly the way Ember does it.
 * @param {Actor} actor
 */
async function finishEmberCreation(actor) {
  if ( !game.modules.get("ember")?.active ) return;
  if ( actor.getFlag("ember", "characterCreation") === true ) return;
  await actor.update({ "flags.ember.characterCreation": true });
  await actor.unsetFlag("core", "sheetClass");
  actor._sheet = null;
}

/**
 * Put a character back to a known state: exactly the fixture gear, nothing equipped or attuned,
 * no slot, portrait or saved-set flags.
 * @param {Actor} actor
 */
export async function resetGear(actor) {
  const wanted = new Set(GEAR.map(g => g.name));
  const strays = actor.items.filter(i => !wanted.has(i.name)).map(i => i.id);
  if ( strays.length ) await actor.deleteEmbeddedDocuments("Item", strays);

  const toCreate = [];
  const toUpdate = [];
  for ( const spec of GEAR ) {
    const existing = actor.items.getName(spec.name);
    if ( !existing ) {
      toCreate.push({ name: spec.name, type: spec.type, img: spec.img, system: { ...spec.system, equipped: false } });
    } else if ( existing.system.equipped || existing.system.attuned ) {
      toUpdate.push({ _id: existing.id, "system.equipped": false, "system.attuned": false });
    }
  }
  if ( toCreate.length ) await actor.createEmbeddedDocuments("Item", toCreate);
  if ( toUpdate.length ) await actor.updateEmbeddedDocuments("Item", toUpdate);
  for ( const key of ["slots", "portrait", "sets"] ) {
    if ( actor.getFlag(MODULE, key) !== undefined ) await actor.unsetFlag(MODULE, key);
  }
}

/** Close every window the suites may have opened. */
export async function closeAll() {
  for ( const app of [...foundry.applications.instances.values()] ) {
    if ( app.id?.startsWith?.(`${MODULE}-dock`) || (app.document instanceof Actor) ) await app.close({ animate: false });
  }
}
