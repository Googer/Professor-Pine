import { CAMPFIRE_DISCOVER_URL } from '../../domain/campfire.js';
import { nothingFound, type FindGroup } from './find.js';
import { renderNode, type PageNode } from './popup.js';
import type { LayerRegistry } from './layer-registry.js';
import type { DistanceUnits } from './distance.js';
import type { LatLon, ViewStorage } from './view.js';
import {
  lineWords,
  listGroups,
  readSort,
  SORTS,
  writeSort,
  type ListKind,
  type ListLine,
  type ListSort,
} from './what-is-on.js';

/**
 * The list of what is on, drawn (plan 8M-7; the pure part is `what-is-on.ts`): on the desktop in
 * the side pane on the right, under the trains' box; on a phone behind the header's "List"
 * button, which swaps the map for it. A heading with the count, the sort (kept per browser), the
 * groups of the layers on, a line per thing (a button: picture, name, place, distance, time, how
 * many are going). Tapping a line flies the map there and opens its popup (`open`; a thing the
 * map does not draw opens its popup in the list instead, as the side panel showed it before);
 * hovering a line on the desktop highlights its marker (`highlight`).
 */
export interface WhatIsOnDeps {
  /** The section of the side pane the list is drawn in. */
  section: HTMLElement;
  registry: LayerRegistry;
  storage: ViewStorage | undefined;
  /** Where distances are measured from: your location, else the map's middle. */
  origin(): LatLon | undefined;
  zone(): string;
  /** The units distances are said in (`settings.distanceUnits`, task 7). */
  units: DistanceUnits;
  /** A line tapped: fly there and open it; false where the map does not draw it. */
  open(line: ListLine): boolean;
  highlight(line: ListLine, on: boolean): void;
  /** The popup of a thing the map does not draw, shown under its line. */
  detail(line: ListLine): HTMLElement | undefined;
  /** Drawn: a form of a line that went with it lets its claim go (fix round 1). */
  rendered?(): void;
  /**
   * Whether the parties' list has come (review round 2, R1); until it has, the list does not say
   * that nothing is on. Known without it.
   */
  partiesKnown?(): boolean;
  /** What a group adds beside its heading (plan 8M-9B: its filter in words, ×, "Filter…"). */
  groupHead?(kind: ListKind): HTMLElement[];
  /** What a group adds under its heading and note (plan 8M-9B: its filter's choices, open). */
  groupBody?(kind: ListKind): HTMLElement[];
  /**
   * Find's search while the box holds one (plan 8M-12): its text and groups, drawn instead of the
   * list; none for the list.
   */
  found?(): { text: string; groups: readonly FindGroup[] } | undefined;
  /** A line Find found tapped: its layer turned on, the map flown there, its popup opened. */
  pick?(line: ListLine): boolean;
  /**
   * "Back to the list" pressed in Find's heading (branch review BR-3): the box emptied, as its ×
   * empties it.
   */
  back?(): void;
  /** What scrolls the list: its place is kept while Find shows, and given back after. */
  scroller?: { scrollTop: number };
  /**
   * Whether the list ends with the line to Campfire's official meetups (plan 8V-1): while the
   * Meetups layer is offered. Without it, no line.
   */
  officialMeetups?(): boolean;
}

export class WhatIsOn {
  private lines: ListLine[] = [];
  private sort: ListSort;
  /** The lines whose popup is shown under them (things the map does not draw). */
  private readonly expanded = new Set<string>();

  /**
   * The lines shown with their popup under them, by key (fix round 1): drawn anew, only their own
   * line's words and place change; the popup under it (a group menu, a field, the focus) stays.
   */
  private readonly kept = new Map<string, HTMLLIElement>();
  /** Whether the drawing under way is of a new list (`show`). */
  private anew = false;
  /** Where the list was scrolled to when Find began to show (plan 8M-12); none while it does not. */
  private listScroll: number | undefined;
  /** Whether the lines drawn last were Find's. */
  private finding = false;
  /** The lines the list had opened under their rows when Find began to show, given back after. */
  private listExpanded: string[] = [];

  constructor(private readonly deps: WhatIsOnDeps) {
    this.sort = readSort(deps.storage);
  }

  /** The sort chosen. */
  get sorted(): ListSort {
    return this.sort;
  }

  /**
   * The list of parties changed: a line shown with its popup draws its popup anew from it (its
   * counts, "You:", its buttons), the group chosen in its menu kept while that group is still
   * offered, and the focus given back to its control of the same kind (fix round 2).
   */
  show(lines: ListLine[], notes: Partial<Record<ListKind, string>> = {}): void {
    this.lines = lines;
    this.notes = notes;
    this.render(true);
  }

  /** The groups' notes of the last list (plan 8M-9B: the day's research waiting, B5). */
  private notes: Partial<Record<ListKind, string>> = {};

  /** The line whose popup is drawn anew in the drawing under way (`redrawLine`). */
  private fresh: string | undefined;

  /**
   * A line's party has its post now (review 8A-9): a line shown with its popup draws the popup
   * anew, with the post, as for a new list; nothing for a line that is shut.
   */
  redrawLine(key: string): void {
    if (!this.expanded.has(key)) return;
    this.fresh = key;
    try {
      this.render();
    } finally {
      this.fresh = undefined;
    }
  }

  /**
   * Draws the list. `anew`: from a new list of parties (`show`); without it (a move of the map, a
   * fix of your location, a change of layers: `ListRefresh`), a line's popup stays as it is.
   */
  render(anew = false): void {
    this.anew = anew;
    const { deps } = this;
    const now = Date.now();
    const origin = deps.origin();
    const found = deps.found?.();
    if (found) {
      this.renderFound(found, origin, now);
      return;
    }
    if (this.finding) {
      // The box cleared: the list as it was, its lines opened and shut as they were before Find
      // (review F6: a line Find opened under its row stays Find's).
      this.finding = false;
      this.expanded.clear();
      for (const key of this.listExpanded) this.expanded.add(key);
      this.listExpanded = [];
    }
    const groups = listGroups(this.lines, {
      on: (kind) => deps.registry.isOn(kind),
      sort: this.sort,
      origin,
      notes: this.notes,
    });
    const header = document.createElement('header');
    const heading = document.createElement('h2');
    heading.textContent = `${LIST_HEADING} · ${groups.reduce((sum, group) => sum + group.lines.length, 0)}`;
    const sort = document.createElement('select');
    sort.setAttribute('aria-label', 'Sort');
    // Found again by it when the list is drawn anew (`sameControl`).
    sort.setAttribute('data-sort', '');
    for (const [value, name] of SORTS) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = name;
      option.selected = value === this.sort;
      sort.append(option);
    }
    sort.addEventListener('change', () => {
      this.sort = sort.value as ListSort;
      writeSort(deps.storage, this.sort);
      this.render();
    });
    header.append(heading, sort);
    const body: HTMLElement[] = [header];
    if (groups.length === 0 && (deps.partiesKnown?.() ?? true)) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Nothing is on just now.';
      body.push(empty);
    }
    for (const group of groups) {
      const title = document.createElement('h3');
      title.textContent = group.heading;
      const list = document.createElement('ul');
      list.className = 'list-lines';
      for (const line of group.lines) list.append(this.item(line, origin, now));
      title.append(...(deps.groupHead?.(group.kind) ?? []));
      body.push(title);
      if (group.note !== undefined) {
        const note = document.createElement('p');
        note.className = 'group-note';
        note.textContent = group.note;
        body.push(note);
      }
      body.push(...(deps.groupBody?.(group.kind) ?? []), list);
    }
    if (deps.officialMeetups?.() === true) body.push(renderNode(officialMeetupsLine(), document));
    // A field of a line's popup keeps the focus where it had it.
    const focused = document.activeElement;
    const inside = focused instanceof HTMLElement && deps.section.contains(focused);
    deps.section.replaceChildren(...body);
    if (inside && document.activeElement !== focused) {
      // A popup drawn anew: the control of the same kind in it (its tag and `data-` attributes);
      // where its line dropped out (its party ended), the sort (8M-7 follow-up N1), never the
      // page's body.
      const twin = focused.isConnected ? focused : sameControl(deps.section, focused);
      (twin ?? deps.section.querySelector<HTMLElement>('select[data-sort]'))?.focus();
    }
    for (const key of [...this.kept.keys()]) {
      if (!this.expanded.has(key)) this.kept.delete(key);
    }
    if (this.listScroll !== undefined && deps.scroller) {
      deps.scroller.scrollTop = this.listScroll;
    }
    this.listScroll = undefined;
    deps.rendered?.();
  }

  /**
   * Find's groups in place of the list (plan 8M-12): a heading with the count, each group with
   * its note (the places still asked for), its lines as the list's (a tap picks the line), and
   * "Nothing found for ‘…’." where no group holds anything; the list's scroll kept for later.
   */
  private renderFound(
    found: { text: string; groups: readonly FindGroup[] },
    origin: LatLon | undefined,
    now: number,
  ): void {
    const { deps } = this;
    if (!this.finding) {
      this.finding = true;
      this.listScroll = deps.scroller?.scrollTop;
      this.listExpanded = [...this.expanded];
      this.expanded.clear();
      if (deps.scroller) deps.scroller.scrollTop = 0;
    }
    const count = found.groups.reduce((sum, group) => sum + group.lines.length, 0);
    const header = document.createElement('header');
    const heading = document.createElement('h2');
    heading.textContent = `Found · ${String(count)}`;
    header.append(heading);
    if (deps.back) {
      // A way back to the list besides the box (BR-3: on a phone a pick hides the box).
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'find-back';
      back.textContent = '×';
      back.setAttribute('aria-label', FIND_BACK);
      back.setAttribute('title', FIND_BACK);
      // Found again by it when the results are drawn anew (`sameControl`).
      back.setAttribute('data-find-back', '');
      back.addEventListener('click', () => {
        deps.back?.();
      });
      header.append(back);
    }
    const body: HTMLElement[] = [header];
    if (found.groups.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = nothingFound(found.text);
      body.push(empty);
    }
    for (const group of found.groups) {
      const title = document.createElement('h3');
      title.textContent = group.heading;
      body.push(title);
      if (group.note !== undefined) {
        const note = document.createElement('p');
        note.className = 'group-note';
        note.textContent = group.note;
        body.push(note);
      }
      const list = document.createElement('ul');
      list.className = 'list-lines found-lines';
      for (const line of group.lines) list.append(this.item(line, origin, now));
      body.push(list);
    }
    const focused = document.activeElement;
    const inside = focused instanceof HTMLElement && deps.section.contains(focused);
    deps.section.replaceChildren(...body);
    if (inside && document.activeElement !== focused && !focused.isConnected) {
      sameControl(deps.section, focused)?.focus();
    }
    deps.rendered?.();
  }

  private item(line: ListLine, origin: LatLon | undefined, now: number): HTMLLIElement {
    const words = lineWords(line, origin, now, this.deps.zone(), this.deps.units);
    const item = document.createElement('li');
    item.className = words.dimmed ? 'line dim' : 'line';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'line-main';
    // Its line's key: a list drawn anew gives the focus back to the same line (review fix 2).
    button.setAttribute('data-key', line.key);
    const picture = line.picture === null ? document.createElement('span') : new Image();
    if (picture instanceof HTMLImageElement) {
      picture.src = line.picture ?? '';
      picture.alt = '';
    }
    picture.className = `picture ${line.kind}`;
    const middle = document.createElement('span');
    middle.className = 'words';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = words.name;
    const place = document.createElement('span');
    place.className = 'place';
    place.textContent = words.place ?? '';
    middle.append(name, place);
    if (words.mark !== undefined) {
      // Find's mark of a report not confirmed (plan 8M-12).
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = words.mark;
      middle.append(mark);
    }
    const side = document.createElement('span');
    side.className = 'side';
    const distance = document.createElement('strong');
    distance.textContent = words.distance ?? '';
    const when = document.createElement('span');
    when.textContent = [words.time, words.going].filter((part) => part !== '').join(' · ');
    side.append(distance, when);
    button.append(picture, middle, side);
    button.addEventListener('click', () => {
      // A line Find found is picked (plan 8M-12): its layer turned on first.
      const { deps } = this;
      const opened = this.finding && deps.pick ? deps.pick(line) : deps.open(line);
      if (opened) return;
      if (this.expanded.has(line.key)) this.expanded.delete(line.key);
      else this.expanded.add(line.key);
      this.render();
    });
    button.addEventListener('mouseenter', () => {
      this.deps.highlight(line, true);
    });
    button.addEventListener('mouseleave', () => {
      this.deps.highlight(line, false);
    });
    if (this.expanded.has(line.key)) {
      const kept = this.kept.get(line.key);
      if (kept?.firstElementChild && !this.anew && this.fresh !== line.key) {
        kept.className = item.className;
        kept.replaceChild(button, kept.firstElementChild);
        return kept;
      }
      item.append(button);
      const detail = this.deps.detail(line);
      if (detail) {
        // From the popup drawn before: the group chosen, while it is offered.
        const before = kept?.querySelector<HTMLSelectElement>('select[data-group-pick]');
        const pick = detail.querySelector<HTMLSelectElement>('select[data-group-pick]');
        if (before && pick && [...pick.options].some((one) => one.value === before.value)) {
          pick.value = before.value;
        }
        item.append(detail);
      }
      this.kept.set(line.key, item);
      return item;
    }
    item.append(button);
    return item;
  }
}

/**
 * The control in `root` of the same tag and `data-` attributes as `control`, if any; none for a
 * control without a `data-` attribute, which nothing tells from the others of its tag (review fix
 * 2: the focus went to the first line). The forms of a post's controls find their control again
 * by it after the post is drawn anew (plan 8M-8B, review N-1).
 */
export function sameControl(
  root: Pick<ParentNode, 'querySelector'>,
  control: HTMLElement,
): HTMLElement | null {
  const names = control.getAttributeNames().filter((name) => name.startsWith('data-'));
  if (names.length === 0) return null;
  const data = names
    .map((name) => `[${name}="${CSS.escape(control.getAttribute(name) ?? '')}"]`)
    .join('');
  return root.querySelector<HTMLElement>(`${control.tagName.toLowerCase()}${data}`);
}

/**
 * The control that opened a form as it is in the page now: itself while it is there, else the same
 * control in what was drawn anew (`sameControl`: letting a form go updates its popup, which draws
 * it anew; review B-1), else itself.
 */
export function liveControl(control: HTMLElement): HTMLElement {
  return control.isConnected ? control : (sameControl(document, control) ?? control);
}

/** The name of Find's way back to the list (branch review BR-3). */
export const FIND_BACK = 'Back to the list';

/** The list's heading (plan 8M-11A, S22), and the pane's `aria-label` (`page.ts`). */
export const LIST_HEADING = "What's going on";

/**
 * The list's foot line (plan 8V-1, the Campfire links design, 3): "Official meetups: Campfire",
 * a link to Campfire's map of meetups in a new tab that does not learn where it came from. Public,
 * and it says nothing about the server.
 */
export function officialMeetupsLine(): PageNode {
  return {
    tag: 'p',
    className: 'official-meetups',
    text: 'Official meetups: ',
    children: [
      {
        tag: 'a',
        text: 'Campfire',
        attributes: { href: CAMPFIRE_DISCOVER_URL, target: '_blank', rel: 'noopener noreferrer' },
      },
    ],
  };
}

/**
 * The side pane of somebody who is not a member: how to log in, or that it is for members; with
 * `officialMeetups` (the Meetups layer offered) the line to Campfire at its foot.
 */
export function loggedOutPane(
  section: HTMLElement,
  login: 'discord' | 'links' | 'member-only',
  officialMeetups = false,
): void {
  const heading = document.createElement('h2');
  heading.textContent = LIST_HEADING;
  const line = document.createElement('p');
  line.textContent =
    login === 'member-only'
      ? 'Only members of this server see what is going on.'
      : 'Log in to see what is going on.';
  const parts: HTMLElement[] = [heading, line];
  if (login === 'discord') {
    const link = document.createElement('a');
    link.className = 'press primary login';
    link.href = `/auth/login?next=${encodeURIComponent(location.pathname)}`;
    link.textContent = 'Log in with Discord';
    parts.push(link);
  } else if (login === 'links') {
    const how = document.createElement('p');
    how.textContent = 'Use /maps in Discord to log in.';
    parts.push(how);
  }
  if (officialMeetups) parts.push(renderNode(officialMeetupsLine(), document));
  section.replaceChildren(...parts);
}
