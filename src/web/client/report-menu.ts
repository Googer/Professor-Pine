import type { PageNode } from './popup.js';
import { REPORT_ICONS, type ReportIcon, type ReportKindId } from './report-icons.js';

/**
 * The Report button's step 1 (plan 8M-9A; design "Reporting"): what is being reported, as a list
 * of data (A11: plan 8M-9B adds Field research and Team GO Rocket as two more entries), each with
 * its label, its icon and how its place is picked in step 2:
 *
 * - `gyms`: a gym tapped (a raid);
 * - `spots`: a Power Spot tapped, or a point for an unlisted power spot (a max battle);
 * - `stops`: a PokéStop tapped (8M-9B's research and Rocket);
 * - `point`: any point of the map (a wild spawn);
 * - `form`: no step 2: the kind's own form, which asks its place itself (a train's region, a
 *   meetup's place picked by the form's own picking).
 *
 * Drawn as a tree of nodes (`renderNode`): a sheet on a phone, a small panel under the button on a
 * wide screen (`map.css`); Escape and Cancel close it.
 */

export type ReportPick = 'gyms' | 'spots' | 'stops' | 'point' | 'form';

export interface ReportKind {
  id: ReportKindId;
  label: string;
  /** Its heading in step 2, written out (R1-8): "Report a raid". */
  heading: string;
  icon: ReportIcon;
  pick: ReportPick;
}

/** The kinds in the menu's order (design "Reporting", step 1). */
export const REPORT_KINDS: readonly ReportKind[] = [
  { id: 'raid', label: 'Raid', heading: 'Report a raid', icon: REPORT_ICONS.raid, pick: 'gyms' },
  {
    id: 'max',
    label: 'Max battle',
    heading: 'Report a max battle',
    icon: REPORT_ICONS.max,
    pick: 'spots',
  },
  // Reports at stops (plan 8M-9B): a PokéStop tapped.
  {
    id: 'research',
    label: 'Field research',
    heading: 'Report field research',
    icon: REPORT_ICONS.research,
    pick: 'stops',
  },
  {
    id: 'rocket',
    label: 'Team GO Rocket',
    heading: 'Report Team GO Rocket',
    icon: REPORT_ICONS.rocket,
    pick: 'stops',
  },
  {
    id: 'spawn',
    label: 'Wild spawn',
    heading: 'Report a wild spawn',
    icon: REPORT_ICONS.spawn,
    pick: 'point',
  },
  { id: 'train', label: 'Train', heading: 'Start a train', icon: REPORT_ICONS.train, pick: 'form' },
  {
    id: 'meetup',
    label: 'Meetup',
    heading: 'Make a meetup',
    icon: REPORT_ICONS.meetup,
    pick: 'form',
  },
];

/**
 * An icon as nodes: the game's picture, or a place for Pine's own drawing (`data-shape`), which
 * the page draws as SVG (`renderNode` makes HTML elements only).
 */
export function iconNode(icon: ReportIcon): PageNode {
  switch (icon.kind) {
    case 'picture':
      return {
        tag: 'img',
        // A white picture (the raid head) has no outline in dark (plan 8M-11A, S14: `map.css`).
        className: icon.light === true ? 'report-icon light' : 'report-icon',
        attributes: { src: icon.src, alt: '', draggable: 'false' },
      };
    case 'mask':
      // The picture's shape in the color of what it stands for (plan 8M-9B, B17): its mask set by
      // the stylesheet (`.mask-<name>` in `map.css`: no inline style, no script).
      return {
        tag: 'span',
        className: `report-icon mask mask-${icon.name}`,
        attributes: { 'data-mask': icon.name, 'aria-hidden': 'true' },
      };
    case 'shape':
      return {
        tag: 'span',
        className: `report-icon shape-${icon.name}`,
        attributes: { 'data-shape': icon.name, 'aria-hidden': 'true' },
      };
  }
}

/** The menu of step 1: a button per kind with its icon and label, then Cancel. */
export function reportMenuNode(kinds: readonly ReportKind[]): PageNode {
  return {
    tag: 'div',
    className: 'report-menu',
    attributes: { role: 'dialog', 'aria-label': 'Report', 'aria-modal': 'true' },
    children: [
      { tag: 'h2', text: 'What are you reporting?' },
      {
        tag: 'div',
        className: 'report-kinds',
        children: kinds.map((kind): PageNode => ({
          tag: 'button',
          className: 'report-kind',
          attributes: { type: 'button', 'data-report-kind': kind.id },
          children: [iconNode(kind.icon), { tag: 'span', className: 'label', text: kind.label }],
        })),
      },
      {
        tag: 'button',
        className: 'press secondary report-cancel',
        text: 'Cancel',
        attributes: { type: 'button', 'data-cancel': '' },
      },
    ],
  };
}
