import type { RegionMineView, RegionsMineView } from '../../domain/web/region-data.js';
import type { PageNode } from './popup.js';

/*
 * "Your regions" on the map's page (plan 8M-20), its pure part: how a region's outline looks by
 * how the member stands to it on Discord (R14), whether "Your regions…" is offered (R11), and the
 * box's rows: each region by name with its state, its Join and Leave buttons and what they take
 * along (R12, R13). What the server computed is shown; nothing is decided here.
 */

/** The line of the box that says what the outlines mean, where some region is not seen (R10). */
export const REGIONS_LEGEND =
  'Solid: a region you see on Discord. Dashed and grayed: one only the map shows you. Grayed more: one whose raids the map does not show you either.';

/** Said in the box while the Region outlines layer is off (B8): a row's mark cannot show. */
export const OUTLINES_OFF = 'The Region outlines layer is off, so the map shows no outlines.';

/** How the member stands to a region, as the view says it: on Discord and in the map's lists. */
type RegionStanding = Pick<RegionMineView, 'access' | 'listed'>;

/** The state of a row (W3). */
type RegionState = 'visible' | 'mapOnly' | 'unlisted' | 'barred';

/**
 * A region's state: seen on Discord; hidden there and its raids listed on the map ("Map only");
 * hidden there and not listed either (a self-assignable role keeps them out, which a join may
 * give back); kept out by somebody (W3).
 */
function stateOf(region: RegionStanding): RegionState {
  if (region.access === 'visible') return 'visible';
  if (region.access === 'barred') return 'barred';
  return region.listed ? 'mapOnly' : 'unlisted';
}

/** How each state is said in the box. */
const STATE_WORDS: Readonly<Record<RegionState, string>> = {
  visible: 'On Discord',
  mapOnly: 'Map only',
  unlisted: 'Not on Discord',
  barred: 'Kept out: ask staff',
};

/** The dashes of a region the member does not see on Discord. */
const DASHES = '6 6';

/** What changes of a region's outline (Leaflet's path options); its color is the theme's. */
export interface OutlineStyle {
  /** Undefined: solid (Leaflet takes the dashes away). */
  dashArray: string | undefined;
  opacity: number;
  fillOpacity: number;
  /** Filled with the theme's gray (`--region-veil`) rather than the outline's color. */
  veiled: boolean;
}

/**
 * A region's outline by how the member stands to it (R14, W3): solid where they see it on Discord
 * (as the map always drew it), dashed and fainter where the map alone shows it, dashed and fainter
 * still where the map does not list its raids either (kept out, or hidden by a self-assignable
 * role that denies it); as before where nothing is said (logged out, read-only). A region the
 * member does not see is grayed too (staging F1): a solid neighbor draws the border they share
 * solid, so the dashes alone may not show.
 */
export function outlineStyle(region: RegionStanding | undefined): OutlineStyle {
  // Nothing said of it: as the map always drew it, barely filled.
  if (region === undefined) {
    return { dashArray: undefined, opacity: 1, fillOpacity: 0.05, veiled: false };
  }
  // Matt, 2026-11-07: the member's own tinted in the region color and the others plainly gray,
  // so the two read apart at a glance (0.05 and 0.15 to 0.25 were too close).
  switch (stateOf(region)) {
    case 'mapOnly':
      return { dashArray: DASHES, opacity: 0.7, fillOpacity: 0.3, veiled: true };
    case 'unlisted':
    case 'barred':
      return { dashArray: DASHES, opacity: 0.4, fillOpacity: 0.45, veiled: true };
    default:
      return { dashArray: undefined, opacity: 1, fillOpacity: 0.18, veiled: false };
  }
}

/**
 * Whether "Your regions…" is offered (R11, R15): the server offers a role that opens or closes a
 * region of the map for this member; never while read-only.
 */
export function regionsOffered(view: RegionsMineView | undefined): boolean {
  return (
    view !== undefined &&
    !view.readOnly &&
    view.roles &&
    view.regions.some((region) => region.join.length + region.leave.length > 0)
  );
}

/** A Join or Leave button of a row. */
export interface RegionButton {
  action: 'join' | 'leave';
  regionId: number;
  roleId: string;
  label: string;
  /** What a screen reader says (B7): the region always, the role where it is not the region's. */
  ariaLabel: string;
  /** A stuck join (R12): shown, not pressed. */
  disabled: boolean;
  /** Said under the button: what it takes along, a stuck join's why, what keeps it open. */
  notes: string[];
}

/** A region of the box. */
export interface RegionRow {
  id: number;
  name: string;
  state: string;
  buttons: RegionButton[];
}

/** "a", "a and b", "a, b and c". */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/** Whether a role is called as its region is (`west` and West): then the button need not name it. */
const sameName = (role: string, region: string): boolean =>
  role.localeCompare(region, 'en', { sensitivity: 'base' }) === 0;

/**
 * The rows of the box: the regions of the view the map has (`names`, from `/api/geo`), by name,
 * each with its state and buttons (Join where the map alone shows it, Leave wherever a role they
 * hold alone opens it), the role named where it is not the region's own name.
 */
export function regionRows(view: RegionsMineView, names: ReadonlyMap<number, string>): RegionRow[] {
  const named = (ids: readonly number[]): string =>
    listed(ids.flatMap((id) => (names.has(id) ? [names.get(id) ?? ''] : [])));
  const rowOf = (region: RegionMineView, name: string): RegionRow => {
    const label = (verb: string, role: string): string =>
      sameName(role, name) ? verb : `${verb} (${role})`;
    const ariaLabel = (verb: string, role: string): string =>
      sameName(role, name) ? `${verb} ${name}` : `${verb} ${name} (${role})`;
    const joins = region.join.map((join): RegionButton => ({
      action: 'join',
      regionId: region.id,
      roleId: join.roleId,
      label: label('Join', join.name),
      ariaLabel: ariaLabel('Join', join.name),
      disabled: join.stuck !== null,
      notes: [
        ...(join.stuck === null ? [] : [join.stuck]),
        ...(join.alsoOpens.some((id) => names.has(id))
          ? [`Also opens ${named(join.alsoOpens)}.`]
          : []),
        ...(join.alsoLeaves.regions.some((id) => names.has(id))
          ? [`Also leaves ${named(join.alsoLeaves.regions)}.`]
          : join.alsoLeaves.roles.length > 0
            ? [`Also takes away ${listed(join.alsoLeaves.roles)}.`]
            : []),
      ],
    }));
    const leaves = region.leave.map((leave): RegionButton => ({
      action: 'leave',
      regionId: region.id,
      roleId: leave.roleId,
      label: label('Leave', leave.name),
      ariaLabel: ariaLabel('Leave', leave.name),
      disabled: false,
      // Under a Leave that keeps its region open, what keeps it and what it closes elsewhere (W1).
      notes: [
        ...(leave.closes
          ? []
          : [
              leave.stillOpenBy.length > 0
                ? `You would still see it through ${listed(leave.stillOpenBy)}.`
                : 'You would still see it.',
            ]),
        ...(leave.alsoCloses.some((id) => names.has(id))
          ? [`Also closes ${named(leave.alsoCloses)}.`]
          : []),
      ],
    }));
    return {
      id: region.id,
      name,
      state: STATE_WORDS[stateOf(region)],
      buttons: [...joins, ...leaves],
    };
  };
  return view.regions
    .flatMap((region) => {
      const name = names.get(region.id);
      return name === undefined ? [] : [rowOf(region, name)];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}

/** A row of the box: the region's name and state, its buttons with their notes, its answer line. */
function rowNode(row: RegionRow): PageNode {
  return {
    tag: 'li',
    className: 'region-row',
    attributes: { 'data-region-row': String(row.id) },
    children: [
      {
        tag: 'div',
        className: 'region-line',
        children: [
          { tag: 'span', className: 'region-row-name', text: row.name },
          { tag: 'span', className: 'region-state', text: row.state },
        ],
      },
      ...row.buttons.map((button): PageNode => ({
        tag: 'div',
        className: 'region-choice',
        children: [
          {
            tag: 'button',
            className: 'press',
            text: button.label,
            attributes: {
              type: 'button',
              'data-region-action': button.action,
              'data-region': String(button.regionId),
              'data-role': button.roleId,
              'aria-label': button.ariaLabel,
              ...(button.disabled ? { disabled: '' } : {}),
            },
          },
          ...button.notes.map((note): PageNode => ({ tag: 'p', className: 'hint', text: note })),
        ],
      })),
      {
        tag: 'p',
        className: 'region-answer',
        // Focused where a press leaves no control of its own (B2); the box's live line reads it.
        attributes: { 'data-region-answer': String(row.id), tabindex: '-1' },
      },
    ],
  };
}

/** The list of the rows, which a press draws anew in place (B2). */
export function regionsList(rows: readonly RegionRow[]): PageNode {
  return { tag: 'ul', className: 'regions-list', children: rows.map(rowNode) };
}

/** Whether the legend is wanted: some region is not seen on Discord (R10). */
export function legendWanted(rows: readonly RegionRow[]): boolean {
  return rows.some((row) => row.state !== STATE_WORDS.visible);
}

/** A line of the box shown or hidden in place. */
const line = (attribute: string, text: string, shown: boolean): PageNode => ({
  tag: 'p',
  className: 'hint',
  text,
  attributes: { [attribute]: '', ...(shown ? {} : { hidden: '' }) },
});

/**
 * The box of "Your regions" in the side pane (docked under the map on a phone, as Report's step
 * 2): its heading and ×, the legend where some region is not seen on Discord (R10), a line while
 * the outlines layer is off (B8), the rows, the line that says a press's answer (B2: in the page
 * from the start, `aria-live`, so that what is written into it is read), and ← Back, which closes
 * it as × and Escape do.
 */
export function regionsBox(
  rows: readonly RegionRow[],
  options: { outlinesShown: boolean },
): PageNode {
  return {
    tag: 'div',
    className: 'regions-box',
    attributes: { 'data-form': 'regions', role: 'group', 'aria-label': 'Your regions' },
    children: [
      {
        tag: 'div',
        className: 'regions-head',
        children: [
          {
            tag: 'span',
            text: 'Your regions',
            attributes: { tabindex: '-1', 'data-regions-heading': '' },
          },
          {
            tag: 'button',
            className: 'close',
            text: '×',
            attributes: { type: 'button', 'aria-label': 'Close', 'data-regions-close': '' },
          },
        ],
      },
      line('data-regions-legend', REGIONS_LEGEND, legendWanted(rows)),
      line('data-regions-outlines-off', OUTLINES_OFF, !options.outlinesShown),
      // Where a press draws the rows anew (B2).
      { tag: 'div', attributes: { 'data-regions-rows': '' }, children: [regionsList(rows)] },
      {
        tag: 'p',
        className: 'regions-live',
        attributes: { 'data-regions-live': '', 'aria-live': 'polite' },
      },
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          {
            tag: 'button',
            className: 'press',
            text: '← Back',
            attributes: { type: 'button', 'data-regions-close': '' },
          },
        ],
      },
    ],
  };
}
