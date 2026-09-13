/**
 * Per-character portrait for the doll: which picture, how it fills the frame, and which part of a
 * tall picture stays in view.
 *
 * A DocumentSheetV2, so Foundry handles the permission check (owners only), the form submission
 * and the re-render of everything showing the actor. The values live in one actor flag,
 * `flags[MODULE_ID].portrait`, read by `doll/context.mjs#portraitFor`.
 */

import { FLAGS, MODULE_ID, t, tpl } from "../config.mjs";
import { portraitFor } from "../doll/context.mjs";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PortraitConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sogrom-pd-form", "sogrom-pd-portrait-config"],
    sheetConfig: false,
    position: { width: 420 },
    window: { icon: "fa-solid fa-image-portrait", contentClasses: ["standard-form"] },
    form: { submitOnChange: false, closeOnSubmit: true },
    actions: {
      resetPortrait: PortraitConfig.#onReset
    }
  };

  /** @override */
  static PARTS = {
    form: { template: tpl("portrait-config.hbs") },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /** @override */
  get title() {
    return t("portrait.title", { actor: this.document.name });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const stored = this.document.getFlag(MODULE_ID, FLAGS.portrait) ?? {};
    const effective = portraitFor(this.document);
    const base = `flags.${MODULE_ID}.${FLAGS.portrait}`;
    return {
      ...context,
      names: { src: `${base}.src`, fit: `${base}.fit`, focus: `${base}.focus` },
      src: stored.src ?? "",
      actorImg: this.document.img,
      preview: effective,
      fitOptions: [
        { value: "cover", label: t("portrait.fitCover"), selected: effective.fit === "cover" },
        { value: "contain", label: t("portrait.fitContain"), selected: effective.fit === "contain" }
      ],
      focus: effective.focus,
      buttons: [
        { type: "button", action: "resetPortrait", icon: "fa-solid fa-rotate-left", label: `${MODULE_ID}.portrait.reset` },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: `${MODULE_ID}.portrait.save` }
      ]
    };
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Live preview: the frame below the fields follows every change before anything is saved.
    const img = this.element.querySelector(".pd-portrait-preview img");
    const read = () => {
      const data = new foundry.applications.ux.FormDataExtended(this.form).object;
      const flag = foundry.utils.getProperty(foundry.utils.expandObject(data), `flags.${MODULE_ID}.${FLAGS.portrait}`) ?? {};
      if ( !img ) return;
      img.src = flag.src || this.document.img || "icons/svg/mystery-man.svg";
      img.style.objectFit = flag.fit === "contain" ? "contain" : "cover";
      img.style.objectPosition = `50% ${Number(flag.focus ?? 20)}%`;
    };
    this.form.addEventListener("change", read);
    this.form.addEventListener("input", read);
  }

  /** Clear the override and fall back to the character's own portrait. */
  static async #onReset() {
    await this.document.unsetFlag(MODULE_ID, FLAGS.portrait);
    this.close();
  }
}
