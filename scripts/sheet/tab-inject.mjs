/**
 * Add a tab to a dnd5e sheet class by extending its static `TABS` and `PARTS`.
 *
 * dnd5e 6's sheets are ApplicationV2 classes that build their tab strip from `static TABS` and
 * render each tab body from a matching entry in `static PARTS` (see the system's
 * `applications/api/primary-sheet-mixin.mjs`). Extending both at `init` is the supported shape —
 * no method wrapping, and the system's own tab switching, scroll memory and part re-rendering all
 * apply to our tab for free.
 *
 * Two details matter:
 *
 * - **Order.** `PARTS` is rendered in key order and the tab strip in array order, so the tab is
 *   inserted *after* a named sibling rather than appended — otherwise it would land after the
 *   `tabs` nav part itself, outside the tab container.
 * - **Own properties.** A subclass that declares no `PARTS` of its own reads its parent's through
 *   the prototype chain. The new objects are assigned on the class given, so only that class (and
 *   anything inheriting from it) gains the tab.
 *
 * Idempotent: a second call with the same id changes nothing, so a hot reload cannot add two tabs.
 */

/**
 * @param {Function} SheetClass
 * @param {object} spec
 * @param {string} spec.id              Tab and part id.
 * @param {object} spec.part            The PARTS entry.
 * @param {object} spec.tab             The TABS entry, minus `tab` (added from `id`).
 * @param {string} [spec.after]         Insert after this tab/part id; appended to the tab
 *                                      container when absent.
 * @returns {boolean}  Whether anything changed.
 */
export function injectTab(SheetClass, { id, part, tab, after }) {
  if ( !SheetClass ) return false;
  const tabs = Array.isArray(SheetClass.TABS) ? SheetClass.TABS : [];
  const parts = SheetClass.PARTS ?? {};
  if ( tabs.some(t => t.tab === id) || (id in parts) ) return false;

  // Tabs: after the named sibling, else at the end.
  const nextTabs = [...tabs];
  const tabIndex = nextTabs.findIndex(t => t.tab === after);
  nextTabs.splice(tabIndex >= 0 ? tabIndex + 1 : nextTabs.length, 0, { tab: id, ...tab });

  // Parts: after the named sibling, else after the last part that lives in a tab container, so
  // the new part still renders inside it and before trailing parts like the nav.
  const entries = Object.entries(parts);
  let partIndex = entries.findIndex(([key]) => key === after);
  if ( partIndex < 0 ) {
    partIndex = entries.reduce((last, [, value], i) => (value?.container ? i : last), entries.length - 1);
  }
  entries.splice(partIndex + 1, 0, [id, part]);

  SheetClass.TABS = nextTabs;
  SheetClass.PARTS = Object.fromEntries(entries);
  return true;
}
