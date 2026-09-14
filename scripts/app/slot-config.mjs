/**
 * GM window: how many ring, ranged and trinket slots every loadout has, which optional slots show, and
 * whether the camp clothes group is on.
 *
 * Opened from the module's settings menu. Writes the `slotLayout` world setting, whose `onChange`
 * (main.mjs) re-renders every open sheet and dock so the change is visible straight away.
 */

import { DEFAULTS, MODULE_ID, SETTINGS, setting, t, tpl } from "../config.mjs";
import { MAX_RANGED, MAX_RINGS, MAX_TRINKETS, TOGGLED_KINDS, layoutFromForm, normaliseLayout } from "../data/slots.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SlotConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-slot-config`,
    tag: "form",
    classes: ["sogrom-lo-form", "sogrom-lo-slot-config"],
    position: { width: 460 },
    window: { icon: "fa-solid fa-person", contentClasses: ["standard-form"] },
    form: {
      handler: SlotConfigApp.#onSubmit,
      closeOnSubmit: true
    },
    actions: {
      resetLayout: SlotConfigApp.#onReset
    }
  };

  /** @override */
  static PARTS = {
    form: { template: tpl("slot-config.hbs") },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /** @override */
  get title() {
    return t("slotConfig.title");
  }

  /** @override */
  async _prepareContext(_options) {
    const layout = normaliseLayout(setting(SETTINGS.slotLayout));
    return {
      rings: layout.rings,
      trinkets: layout.trinkets,
      ranged: layout.ranged,
      camp: layout.camp,
      maxRings: MAX_RINGS,
      maxTrinkets: MAX_TRINKETS,
      maxRanged: MAX_RANGED,
      optional: TOGGLED_KINDS.map(kind => ({
        kind,
        label: t(`slot.kind.${kind}`),
        enabled: !layout.disabled.includes(kind)
      })),
      buttons: [
        { type: "button", action: "resetLayout", icon: "fa-solid fa-rotate-left", label: `${MODULE_ID}.slotConfig.reset` },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: `${MODULE_ID}.slotConfig.save` }
      ]
    };
  }

  static async #onSubmit(_event, _form, formData) {
    // FormDataExtended keeps dotted names flat ("enabled.head"); the layout reader wants them nested.
    const data = foundry.utils.expandObject(formData.object);
    await game.settings.set(MODULE_ID, SETTINGS.slotLayout, layoutFromForm(data));
  }

  static async #onReset() {
    await game.settings.set(MODULE_ID, SETTINGS.slotLayout, foundry.utils.deepClone(DEFAULTS[SETTINGS.slotLayout]));
    this.render();
  }
}
