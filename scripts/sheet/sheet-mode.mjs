/**
 * Which mode a character sheet is in — play or edit — for the sheets that have one.
 *
 * The loadout follows the sheet it is part of: in play mode, clicking a worn item uses it, the way
 * clicking an item on the sheet's own inventory does; in edit mode it opens the item. The mode is read
 * when the click happens rather than at render, because the dock takes it from a sheet it does not
 * render with, and a sheet may switch modes without redrawing the loadout.
 *
 * No Foundry globals here, so the unit tests can import it.
 */

/** Tidy 5e's module id, which its sheets carry as a class. */
export const TIDY_ID = "tidy5e-sheet";

/** Tidy 5e's `CONSTANTS.SHEET_MODE_EDIT` (14.1.0). Its play mode is 1. */
const TIDY_SHEET_MODE_EDIT = 2;

/**
 * Whether a sheet is one of Tidy 5e's, which switch tabs with `selectTab` and keep their mode in
 * `sheetMode`.
 * @param {object} sheet
 * @returns {boolean}
 */
export function isTidySheet(sheet) {
  return !!sheet?.options?.classes?.includes(TIDY_ID) && (typeof sheet.selectTab === "function");
}

/**
 * The sheet's mode.
 * @param {object} sheet
 * @returns {"play"|"edit"|null}  Null for a sheet with no such mode, which keeps the loadout's own
 *   behaviour: clicking an item opens it.
 */
export function sheetMode(sheet) {
  if ( !sheet ) return null;
  // Tidy first: its sheets are not dnd5e's, and only `sheetMode` says what Tidy shows.
  if ( isTidySheet(sheet) && Number.isFinite(sheet.sheetMode) ) {
    return sheet.sheetMode === TIDY_SHEET_MODE_EDIT ? "edit" : "play";
  }
  // dnd5e 6's sheets (PrimarySheetMixin).
  if ( typeof sheet.isEditMode === "boolean" ) return sheet.isEditMode ? "edit" : "play";
  return null;
}
