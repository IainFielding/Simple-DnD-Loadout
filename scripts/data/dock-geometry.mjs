/**
 * Where the docked window goes, given the sheet it is docked to.
 *
 * Pure geometry, split out of the window class so the edge cases — a sheet dragged hard against
 * the screen edge, a viewport too narrow for both — are unit-testable.
 */

/** The docked window's width. Tall and narrow, like the sheet's own sidebar. */
export const DOCK_WIDTH = 400;

/** Smallest height worth drawing the loadout at; below this it floats rather than squashing. */
export const DOCK_MIN_HEIGHT = 520;

/**
 * @param {object} params
 * @param {{left: number, top: number, width: number, height: number}} params.sheet
 * @param {{width: number, height: number}} params.viewport
 * @param {"left"|"right"} [params.side]  The side this user prefers.
 * @param {number} [params.width]
 * @returns {{left: number, top: number, width: number, height: number, side: "left"|"right"|null}}
 *   `side: null` means neither side had room and the window floats, framed, over the screen.
 */
export function dockPosition({ sheet, viewport, side = "left", width = DOCK_WIDTH }) {
  const height = Math.max(DOCK_MIN_HEIGHT, Math.min(sheet.height, viewport.height));
  const top = Math.max(0, Math.min(sheet.top, viewport.height - height));
  const fits = {
    left: sheet.left - width >= 0,
    right: sheet.left + sheet.width + width <= viewport.width
  };
  const order = side === "right" ? ["right", "left"] : ["left", "right"];
  const chosen = order.find(s => fits[s]) ?? null;

  if ( chosen === "left" ) return { left: sheet.left - width, top, width, height, side: "left" };
  if ( chosen === "right" ) return { left: sheet.left + sheet.width, top, width, height, side: "right" };

  // No room either side: float against the preferred edge of the screen, fully on-screen.
  const left = side === "right" ? Math.max(0, viewport.width - width) : 0;
  return { left, top, width, height, side: null };
}
