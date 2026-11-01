/*
 * The map's pane of plan 8M-15, by Leaflet's z-index (its marker pane is 600, its tooltip pane
 * 650, its popup pane 700). No import and no DOM: the stylesheet tests read it too, whose type
 * check has no browser.
 */

/**
 * The pane of the selected train's numbers: above every marker and dot, so that nothing hides
 * them (Matt, 2026-10-30), and under the tooltips and popups. It takes no taps.
 */
export const BADGE_PANE = 'train-badges';
export const BADGE_PANE_Z = 640;

/**
 * The pane of a train's line (review SEL-1): under the overlay pane (400) of the gyms', Power
 * Spots' and PokéStops' dots, whose tap a line drawn anew would otherwise cover, with an SVG
 * renderer of its own as the rings have; over the regions' names (350).
 */
export const TRAIN_LINE_PANE = 'train-lines';
export const TRAIN_LINE_PANE_Z = 390;

/**
 * The pane of the invisible discs that take a tap inside a ring (Matt, 2026-10-30): over a train's
 * line, whose wide tap would take it otherwise, and under the overlay pane (400) of the dots and
 * the markers, whose taps win; with an SVG renderer of its own.
 */
export const RING_TAP_PANE = 'ring-taps';
export const RING_TAP_PANE_Z = 395;

/**
 * A region's outline on the live map. It takes no tap: over a train's line on its lower pane, its
 * fill would take the line's.
 */
export const REGION_OUTLINE = { weight: 2, fillOpacity: 0.05, interactive: false } as const;
