/**
 * The loadout in its own window, docked beside a character sheet.
 *
 * ## Following the sheet without wrapping it
 *
 * theripper93's Paper Doll UI module, which this one replaces, kept its window attached by replacing the sheet's
 * `setPosition`, `minimize`, `maximize` and `close` methods — which breaks the moment another
 * module wraps the same methods, or the sheet class changes. ApplicationV2 makes that unnecessary:
 * every application is an event target that emits `position` after it moves or resizes and `close`
 * when it closes. The dock subscribes to those two events and watches the sheet's class list for
 * minimisation, and never touches the sheet object itself.
 *
 * ## Staying current
 *
 * The dock registers itself in `actor.apps`, the same registry a document's own sheets live in, so
 * Foundry re-renders it on every change to the actor or its items — an item equipped from the
 * inventory tab moves on the loadout without the dock listening for anything.
 */

import { MODULE_ID, SETTINGS, log, setting, t, tpl } from "../config.mjs";
import { DOCK_WIDTH, dockPosition } from "../data/dock-geometry.mjs";
import { buildLoadoutContext } from "../loadout/context.mjs";
import { bindLoadout, refreshMode } from "../loadout/controller.mjs";
import { PortraitConfig } from "../app/portrait-config.mjs";
import { sheetMode } from "./sheet-mode.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Whether a sheet can have a loadout docked to it: a character's framed, positioned sheet. This
 * excludes Ember's fullscreen character-creation sheet, which is an `ActorSheetV2` for characters
 * but has neither a frame nor a position to follow.
 * @param {ApplicationV2} sheet
 * @returns {boolean}
 */
export function canDock(sheet) {
  const actor = sheet?.document;
  if ( !(actor instanceof Actor) || (actor.type !== "character") ) return false;
  if ( !actor.testUserPermission(game.user, "OBSERVER") ) return false;
  return (sheet.options?.window?.frame !== false) && (sheet.options?.window?.positioned !== false);
}

export class LoadoutDock extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sogrom-lo-dock"],
    window: {
      frame: true,
      positioned: true,
      minimizable: false,
      resizable: false,
      icon: "fa-solid fa-person"
    },
    position: { width: DOCK_WIDTH, height: 760 }
  };

  /** @override */
  static PARTS = {
    loadout: { template: tpl("dock.hbs") }
  };

  /** Open docks, keyed by the sheet's application id. */
  static #open = new Map();

  /**
   * The dock attached to a sheet, if one is open.
   * @param {ApplicationV2} sheet
   * @returns {LoadoutDock|undefined}
   */
  static for(sheet) {
    return LoadoutDock.#open.get(sheet?.id);
  }

  /**
   * Open or close the dock for a sheet.
   * @param {ApplicationV2} sheet
   * @returns {Promise<LoadoutDock|null>}  The dock, when one is now open.
   */
  static async toggle(sheet) {
    const existing = LoadoutDock.for(sheet);
    if ( existing ) {
      await existing.close();
      return null;
    }
    return LoadoutDock.open(sheet);
  }

  /**
   * Open the dock for a sheet, or bring an open one forward.
   * @param {ApplicationV2} sheet
   * @returns {Promise<LoadoutDock|null>}
   */
  static async open(sheet) {
    if ( !canDock(sheet) || !sheet.rendered ) return null;
    const dock = LoadoutDock.for(sheet) ?? new LoadoutDock(sheet);
    await dock.render({ force: true });
    return dock;
  }

  /* -------------------------------------------- */

  /** @param {ApplicationV2} sheet */
  constructor(sheet, options = {}) {
    super({ ...options, id: `${MODULE_ID}-dock-${sheet.id}` });
    this.sheet = sheet;
    this.actor = sheet.document;
    LoadoutDock.#open.set(sheet.id, this);
  }

  /** @type {ApplicationV2} */
  sheet;

  /** @type {Actor} */
  actor;

  #onPosition = () => this.follow();

  #onSheetClose = () => this.close();

  #onSheetPointer = () => this.#matchZ();

  /** @type {MutationObserver|null} */
  #observer = null;

  /** @override */
  get title() {
    return t("dock.title", { actor: this.actor.name });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    return buildLoadoutContext(this.actor, { surface: "dock", editable: this.actor.isOwner });
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.actor.apps[this.id] = this;
    this.sheet.addEventListener("position", this.#onPosition);
    this.sheet.addEventListener("close", this.#onSheetClose);
    this.sheet.element?.addEventListener("pointerdown", this.#onSheetPointer, { capture: true });
    // Minimising and switching between play and edit mode are not emitted events; the sheet's class
    // list is the reliable signal for both (dnd5e toggles "editable", Tidy "sheet-mode-edit").
    this.#observer = new MutationObserver(() => {
      this.#syncMinimized();
      refreshMode(this.element?.querySelector(".sogrom-loadout"));
    });
    if ( this.sheet.element ) this.#observer.observe(this.sheet.element, { attributes: true, attributeFilter: ["class"] });
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element.querySelector(".sogrom-loadout");
    bindLoadout(root, {
      actor: this.actor,
      editable: this.actor.isOwner,
      // The dock is part of the sheet it follows, so it uses items when that sheet is in play mode.
      mode: () => sheetMode(this.sheet),
      onPortrait: () => new PortraitConfig({ document: this.actor }).render({ force: true })
    });
    this.follow();
    this.#syncMinimized();
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    LoadoutDock.#open.delete(this.sheet.id);
    delete this.actor.apps[this.id];
    this.sheet.removeEventListener("position", this.#onPosition);
    this.sheet.removeEventListener("close", this.#onSheetClose);
    this.sheet.element?.removeEventListener("pointerdown", this.#onSheetPointer, { capture: true });
    this.#observer?.disconnect();
    this.#observer = null;
  }

  /* -------------------------------------------- */
  /*  Docking                                     */
  /* -------------------------------------------- */

  /** Move alongside the sheet. */
  follow() {
    if ( !this.rendered ) return;
    if ( !this.sheet.rendered || !this.sheet.element ) {
      this.close();
      return;
    }
    const rect = this.sheet.element.getBoundingClientRect();
    const pos = dockPosition({
      sheet: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      side: setting(SETTINGS.dockSide)
    });
    this.element.classList.toggle("is-docked", pos.side !== null);
    this.element.dataset.dockSide = pos.side ?? "float";
    this.setPosition({ left: pos.left, top: pos.top, width: pos.width, height: pos.height });
    this.#matchZ();
    log("dock follow", pos);
  }

  /** Sit at the sheet's stacking level, so bringing the sheet forward brings the loadout with it. */
  #matchZ() {
    const z = this.sheet.element?.style.zIndex;
    if ( z && this.element ) this.element.style.zIndex = z;
  }

  #syncMinimized() {
    if ( !this.element || !this.sheet.element ) return;
    const classes = this.sheet.element.classList;
    this.element.hidden = classes.contains("minimized") || classes.contains("minimizing");
    if ( !this.element.hidden ) requestAnimationFrame(() => this.follow());
  }
}
