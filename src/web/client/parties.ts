import { durationWords } from '../../render/duration-words.js';
import type {
  MapAttendance,
  MapMax,
  MapMeetup,
  MapParty,
  MapPress,
  MapRaid,
  MapStatus,
  MapTrain,
  PartiesView,
} from '../../domain/web/party-data.js';
import { stageAt } from '../../domain/party/raid-stage.js';
import { clockTime } from '../../domain/web/clock.js';
import type { Me } from './notice.js';
import { addressLine, directionsLink, type MapGym, type PageNode } from './popup.js';

/**
 * The parties on the live map (plan 8M-3, spec 3.2 to 3.4), the parts the page shows and does
 * that need no Leaflet: popups of raids and trains and the meetups' items as trees of nodes
 * (`renderNode` sets every text as text), countdowns, times in the reader's zone (plan 8M-8A),
 * a press of a button with its CSRF token, and the poller that asks for a list while the page is
 * visible: every 20 seconds, or every 2 minutes and at each signal while it is live (`live.ts`).
 */

/**
 * What a popup needs besides its party: the time, the zone times are shown in (the reader's,
 * plan 8M-8A), the gyms.
 */
export interface ShowContext {
  now: number;
  zone: string;
  /** A gym as `/api/geo` has it; undefined for a gym the map does not know. */
  gym(id: number | null): MapGym | undefined;
}

/**
 * How long until a moment: `in 13 min`, `in 1 h 05 min` (`durationWords`, plan 8M-11A), `now` once
 * it has come.
 */
export function countdown(until: number, now: number): string {
  return until <= now ? 'now' : `in ${durationWords(until - now)}`;
}

/**
 * `2:30 PM` in the zone given: the reader's on the map (plan 8M-8A), the posts' in the server's
 * words.
 */
export { clockTime };

const PRESS_LABELS: Readonly<Record<MapPress['action'], string>> = {
  interested: 'Interested',
  join: 'Join',
  here: 'Here',
  done: 'Done',
  leave: 'Leave',
};

/**
 * The label of a button on the map, in words: `Join B` for a group's (the post's own shows the
 * group's letter, "B", with an icon, plan 8D-G).
 */
export function pressLabel(press: MapPress): string {
  const label = PRESS_LABELS[press.action];
  return press.group === undefined ? label : `${label} ${press.group}`;
}

/**
 * The style of each button as the post's own (`party-controls.ts`, plan 8M-7): Join primary
 * (blurple), Here success (green), Leave danger (red), the others secondary (grey); a class of
 * `map.css`.
 */
const PRESS_STYLES: Readonly<Record<MapPress['action'], string>> = {
  interested: 'secondary',
  join: 'primary',
  here: 'success',
  done: 'secondary',
  leave: 'danger',
};

export const STATUS_WORDS: Readonly<Record<MapStatus, string>> = {
  interested: 'Interested',
  coming: 'Coming',
  present: 'Here',
  complete: 'Done',
};

const div = (className: string, text: string): PageNode => ({ tag: 'div', className, text });

/** A moment and the countdown to it, which the page keeps current (`data-until`). */
function timeLine(className: string, words: string, at: number, context: ShowContext): PageNode {
  return {
    tag: 'div',
    className,
    children: [
      { tag: 'span', text: `${words} ${clockTime(at, context.zone, context.now)}` },
      {
        tag: 'span',
        className: 'countdown',
        text: countdown(at, context.now),
        attributes: { 'data-until': String(at) },
      },
    ],
  };
}

/**
 * Who comes, as counts (by group when there are several), how the member stands, and the
 * buttons that apply, each naming its party and action in `data-` attributes.
 */
function attendanceNodes(partyId: string, attendance: MapAttendance): PageNode[] {
  const several = attendance.groups.length > 1;
  const counts = attendance.groups.flatMap((group) => {
    const shown = (['interested', 'coming', 'present'] as const)
      .filter((status) => group[status] > 0 || !several)
      .map((status) => `${STATUS_WORDS[status]} ${group[status]}`)
      .join(' · ');
    return several ? (shown === '' ? [] : [`Group ${group.id}: ${shown}`]) : [shown];
  });
  const { mine } = attendance;
  return [
    ...counts.map((line) => div('counts', line)),
    ...(mine
      ? [
          div(
            'mine',
            `You: ${STATUS_WORDS[mine.status]}${several && mine.status !== 'complete' ? `, group ${mine.group}` : ''}`,
          ),
        ]
      : []),
    ...(attendance.actions.length === 0
      ? []
      : [
          {
            tag: 'div',
            className: 'presses',
            children: [
              ...groupPick(partyId, attendance),
              ...attendance.actions.map((press): PageNode => ({
                tag: 'button',
                className: `press ${PRESS_STYLES[press.action]}`,
                text: pressLabel(press),
                attributes: {
                  type: 'button',
                  'data-party': partyId,
                  'data-action': press.action,
                  ...(press.group === undefined ? {} : { 'data-group': press.group }),
                },
              })),
            ],
          },
        ]),
  ];
}

/**
 * Which group, for a newcomer to a party of several (`MapAttendance.pick`, plan 8X-1B: as the
 * post's dialog asks it): a menu before the buttons, its first choice chosen to start with;
 * Interested, Join and Here send what it shows (`data-group-pick`, its party: the page reads it at
 * the press and carries it across draws, `GroupPicks`), none for "any group with room".
 */
export function groupPick(partyId: string, attendance: MapAttendance): PageNode[] {
  const { pick } = attendance;
  if (pick === undefined || pick.length === 0) return [];
  return [
    {
      tag: 'select',
      className: 'group-pick',
      attributes: { 'data-group-pick': partyId, 'aria-label': 'Which group?' },
      children: pick.map((choice, index): PageNode => ({
        tag: 'option',
        text: choice.label,
        attributes: { value: choice.group ?? '', ...(index === 0 ? { selected: '' } : {}) },
      })),
    },
  ];
}

/** A group menu as `GroupPicks` needs it of the page. */
interface PickMenu {
  dataset: DOMStringMap;
  value: string;
  options: ArrayLike<{ value: string }> & Iterable<{ value: string }>;
}

/**
 * The group a member chose in each party's menu (`groupPick`), kept across draws: a redraw clears
 * every layer and draws each popup anew, a menu back at its first choice, and Join sends what it
 * shows, so a member's group could change under them. A choice no longer offered is forgotten.
 */
export class GroupPicks {
  private readonly picked = new Map<string, string>();

  chose(partyId: string, group: string): void {
    this.picked.set(partyId, group);
  }

  /** What was just drawn: its menus back at the choices made. */
  carry(root: { querySelectorAll(selector: string): Iterable<PickMenu> }): void {
    for (const menu of root.querySelectorAll('select[data-group-pick]')) {
      const party = menu.dataset.groupPick;
      if (party === undefined) continue;
      const group = this.picked.get(party);
      if (group === undefined) continue;
      if ([...menu.options].some((option) => option.value === group)) menu.value = group;
      else this.picked.delete(party);
    }
  }

  /** The parties of the list: the others' choices go with them. */
  keepOnly(parties: ReadonlyArray<{ id: string }>): void {
    const listed = new Set(parties.map((party) => party.id));
    for (const party of [...this.picked.keys()]) {
      if (!listed.has(party)) this.picked.delete(party);
    }
  }
}

/** "Open the post": only an address of Discord, in a new tab that does not learn the map's. */
function postLink(link: string): PageNode[] {
  return link.startsWith('https://discord.com/channels/')
    ? [
        {
          tag: 'a',
          className: 'post-link',
          text: 'Open the post',
          attributes: { href: link, target: '_blank', rel: 'noopener noreferrer' },
        },
      ]
    : [];
}

/**
 * A raid without its gym: the raid in the posts' words (`Level 5 raid against Yveltal`, an egg
 * with what it hatches as), the hatch or end time with a countdown, who comes, the buttons,
 * "Manage…" for a member who may change it (plan 8M-4), and the post.
 */
function raidNodes(raid: MapRaid, context: ShowContext): PageNode[] {
  // Its stage by the clock, the domain's `stageAt` (the list may be older than its hatch); its
  // name in its post's own heading words (fix round 1).
  const egg =
    stageAt(
      { hatchTime: raid.hatchTime, endTime: null, reportedHatched: raid.stage !== 'egg' },
      context.now,
    ) === 'egg';
  const { heading } = raid;
  const time = egg ? raid.hatchTime : raid.endTime;
  return [
    div('tier', heading),
    ...(egg && raid.boss !== null ? [div('boss', `Hatches as ${raid.boss}`)] : []),
    time === null
      ? div('time', egg ? 'Hatch time not known' : 'End time not known')
      : timeLine('time', egg ? 'Hatches at' : 'Ends at', time, context),
    ...attendanceNodes(raid.id, raid.attendance),
    ...(raid.mayChange
      ? [
          {
            tag: 'button',
            className: 'press change-raid',
            text: 'Manage…',
            attributes: { type: 'button', 'data-change-raid': raid.id },
          },
        ]
      : []),
    ...postLink(raid.link),
  ];
}

const gymHeading = (gymId: number | null, context: ShowContext): PageNode => ({
  tag: 'strong',
  className: 'name',
  text: context.gym(gymId)?.name ?? 'Unknown gym',
});

/**
 * A raid's item in the side panel (a raid at a gym the map does not show): its gym, as the map
 * has it or else as the post names it (`MapRaid.place`, plan 8M-6), with the address line and
 * Directions as a gym's popup has them, then the raid (`raidNodes`).
 */
export function raidPopup(raid: MapRaid, context: ShowContext): PageNode {
  const gym = context.gym(raid.gymId) ?? raid.place ?? undefined;
  return {
    tag: 'div',
    className: 'party-popup raid',
    children: [
      { tag: 'strong', className: 'name', text: gym?.name ?? 'Unknown gym' },
      ...wayTo(gym),
      ...raidNodes(raid, context),
    ],
  };
}

/**
 * A max battle's popup until its post comes (plan 8M-9A, A2: the map's own summary, as a raid's):
 * its Power Spot (or "Unlisted power spot") with the way there, what it is in its post's title,
 * its end with a countdown (a max battle has no egg), who comes, the buttons, and the post.
 */
export function maxPopup(max: MapMax, context: ShowContext): PageNode {
  return {
    tag: 'div',
    className: 'party-popup max',
    children: [
      { tag: 'strong', className: 'name', text: max.place.name },
      ...wayTo(max.place),
      div('tier', max.title),
      timeLine('time', 'Ends at', max.endTime, context),
      ...attendanceNodes(max.id, max.attendance),
      ...postLink(max.link),
    ],
  };
}

/**
 * Whether the raids' layer is drawn (plan 8M-9A): its toggle on; or a raid's step 2 of the Report
 * button picking gyms (C1), so that the raids standing at them show; or a party a step 3 opened
 * (`opened`, its key) while a popup or the card shows it (`shown`: their keys), so that it opens
 * on its own marker (R2-1). The layer's toggle again once that popup or card closes.
 */
export function raidsDrawn(state: {
  layerOn: boolean;
  picking: boolean;
  opened: string | undefined;
  /** It is being opened (R3-1): the parties are drawn with it before its popup opens. */
  opening: boolean;
  shown: ReadonlyArray<string | undefined>;
}): boolean {
  return (
    state.layerOn ||
    state.picking ||
    (state.opened !== undefined && (state.opening || state.shown.includes(state.opened)))
  );
}

/**
 * The parties a popup's or card's key shows (`gym:<id>`, `train:<id>`, `route:<id>`,
 * `meetup:<id>`, `max:<id>`), in the list's order: whose posts are asked for ahead as the pointer
 * comes over it (review 8A-3).
 */
export function partiesAtKey(view: PartiesView | undefined, key: string): MapParty[] {
  if (view === undefined) return [];
  const [kind, id] = key.split(':');
  switch (kind) {
    case 'gym':
      return view.raids.filter((raid) => String(raid.gymId) === id);
    case 'max':
      return view.maxes.filter((one) => one.id === id);
    case 'train':
    case 'route':
      return view.trains.filter((one) => one.id === id);
    case 'meetup':
      return view.meetups.filter((one) => one.id === id);
    default:
      return [];
  }
}

/** How to get to a gym, as its own popup says it: its address line and "Directions". */
function wayTo(gym: Pick<MapGym, 'lat' | 'lon' | 'address'> | undefined): PageNode[] {
  return gym ? [...addressLine(gym), directionsLink(gym)] : [];
}

/**
 * The popup of a gym's one marker: the gym once, with its address line and Directions, then
 * every raid there in the list's order (one raid per gym of any kind since plan 8E; two, a
 * standard and an elite raid, only where both were stored before it), each in a section of its
 * own with its time, counts, buttons and post; then `extras`
 * ("Report raid" for a member, plan 8M-4).
 */
export function gymRaidsPopup(
  gymId: number,
  raids: readonly MapRaid[],
  context: ShowContext,
  extras: readonly PageNode[] = [],
): PageNode {
  return {
    tag: 'div',
    className: 'party-popup raids',
    children: [
      gymHeading(gymId, context),
      ...wayTo(context.gym(gymId)),
      ...raids.map((raid): PageNode => ({
        tag: 'div',
        className: 'raid',
        children: raidNodes(raid, context),
      })),
      ...extras,
    ],
  };
}

/**
 * The raids of the list by the gym they are at, for the gyms the map shows (`shown`), in the
 * order of the list (a gym's place by its first raid); the others (no gym, or one the map does
 * not show) apart, for the side panel.
 */
export function raidsAtGyms(
  raids: readonly MapRaid[],
  shown: (gymId: number) => boolean,
): { atGyms: Map<number, MapRaid[]>; elsewhere: MapRaid[] } {
  const atGyms = new Map<number, MapRaid[]>();
  const elsewhere: MapRaid[] = [];
  for (const raid of raids) {
    if (raid.gymId === null || !shown(raid.gymId)) {
      elsewhere.push(raid);
      continue;
    }
    const there = atGyms.get(raid.gymId);
    if (there) there.push(raid);
    else atGyms.set(raid.gymId, [raid]);
  }
  return { atGyms, elsewhere };
}

/** The picture of a gym's marker: that of its first raid that has one; null for a dot. */
export function gymPicture(raids: readonly MapRaid[]): string | null {
  return raids.find((raid) => raid.picture !== null)?.picture ?? null;
}

/** What the parties' own line says (`#read-only`); undefined hides it. */
export function readOnlyLine(readOnly: boolean): string | undefined {
  return readOnly ? 'Discord cannot be reached just now, so the map is read-only.' : undefined;
}

/**
 * The gym a stop of a route is (`MapTrain.route`, a stop's key: a gym's id), or null for a power
 * spot (plan 8X-4: `w` and its Wayfarer id) and for no stop.
 */
export function gymOfStop(key: string | undefined): number | null {
  return key !== undefined && /^\d+$/u.test(key) ? Number(key) : null;
}

/** A point on the map: a gym's, or a power spot's of a train's data. */
export interface StopPlace {
  lat: number;
  lon: number;
}

/**
 * Where a stop of a train's route is on the map: its gym's point as the map has it, a power
 * spot's as the train's data gives it (`MapTrain.spots`), undefined for one the map cannot place.
 */
export function stopPlace(
  train: Pick<MapTrain, 'spots'>,
  key: string | undefined,
  gyms: ReadonlyMap<number, StopPlace>,
): StopPlace | undefined {
  const gymId = gymOfStop(key);
  if (gymId !== null) return gyms.get(gymId);
  return train.spots.find((one) => one.key === key);
}

/**
 * How the map draws a train (plan 8S-4; plan 8X-4 for power spots): its line through the stops it
 * can place, in order, and its ring at the stop it is at (`here`), else at the first stop it can
 * place, pale; no ring for a train with no stop on the map.
 */
export function trainPlaces(
  train: Pick<MapTrain, 'route' | 'stop' | 'spots'>,
  gyms: ReadonlyMap<number, StopPlace>,
): { line: StopPlace[]; ring: { at: StopPlace; here: boolean } | undefined } {
  const line = train.route.flatMap((key) => {
    const place = stopPlace(train, key, gyms);
    return place ? [place] : [];
  });
  const at = train.stop === null ? undefined : stopPlace(train, train.route[train.stop], gyms);
  const first = line[0];
  return {
    line,
    ring: at ? { at, here: true } : first ? { at: first, here: false } : undefined,
  };
}

/** Where a train is on its route: `At stop 2 of 5: Library`, finished, or without a route. */
export function stopLine(
  train: Pick<MapTrain, 'route' | 'stop' | 'spots'>,
  context: Pick<ShowContext, 'gym'>,
): string {
  if (train.route.length === 0) return 'No route yet';
  if (train.stop === null) return 'Route finished';
  const key = train.route[train.stop];
  const spot = train.spots.find((one) => one.key === key);
  const name = key?.startsWith('w')
    ? spot
      ? `${spot.name} (Power Spot)`
      : 'a Power Spot'
    : (context.gym(gymOfStop(key))?.name ?? 'a gym not on the map');
  return `At stop ${train.stop + 1} of ${train.route.length}: ${name}`;
}

/**
 * A train's popup: its name, start, where it is (with the address line and Directions of the
 * stop it is at), who comes, the buttons, then `extras` (what the member may do of its route,
 * its moves and its conductor on the map, plan 8M-5: `trainActions`), the post.
 */
export function trainPopup(
  train: MapTrain,
  context: ShowContext,
  extras: readonly PageNode[] = [],
): PageNode {
  const key = train.stop === null ? undefined : train.route[train.stop];
  const at = key === undefined ? undefined : context.gym(gymOfStop(key));
  // At a power spot of its route (plan 8X-4): Directions to its point.
  const spot = train.spots.find((one) => one.key === key);
  return {
    tag: 'div',
    className: 'party-popup train',
    children: [
      { tag: 'strong', className: 'name', text: train.name },
      train.startTime === null
        ? div('time', 'No start time yet')
        : timeLine('time', 'Starts at', train.startTime, context),
      div('stop', stopLine(train, context)),
      ...(spot ? [directionsLink({ lat: spot.lat, lon: spot.lon })] : wayTo(at)),
      ...attendanceNodes(train.id, train.attendance),
      ...extras,
      ...postLink(train.link),
    ],
  };
}

/** Where a meetup is and how to get there: its place and "Directions" to its point. */
function meetupWhere(meetup: MapMeetup): PageNode[] {
  const { place } = meetup;
  if (!place) return [];
  return [div('place', place.words), directionsLink({ lat: place.lat, lon: place.lon })];
}

/**
 * A meetup's popup at its place on the map (plan 8M-5M), and its item in the side panel: its
 * name, where it is with Directions, its start and end, its information as written (set as text),
 * who comes, the buttons, then `extras` (`meetupActions`: "Manage…" for its maker and staff), the
 * post.
 */
export function meetupPopup(
  meetup: MapMeetup,
  context: ShowContext,
  extras: readonly PageNode[] = [],
): PageNode {
  const when = (words: string, at: number | null) =>
    at === null ? [] : [div('time', `${words} ${clockTime(at, context.zone, context.now)}`)];
  return {
    tag: 'div',
    className: 'party-popup meetup',
    children: [
      { tag: 'strong', className: 'name', text: meetup.name },
      ...meetupWhere(meetup),
      ...when('Starts', meetup.startTime),
      ...when('Ends', meetup.endTime),
      ...(meetup.info === null || meetup.info.trim() === '' ? [] : [div('info', meetup.info)]),
      ...attendanceNodes(meetup.id, meetup.attendance),
      ...extras,
      ...postLink(meetup.link),
    ],
  };
}

/** A meetup in the side panel: as its popup (`meetupPopup`), as an item of the list. */
export function meetupItem(
  meetup: MapMeetup,
  context: ShowContext,
  extras: readonly PageNode[] = [],
): PageNode {
  return { ...meetupPopup(meetup, context, extras), tag: 'li' };
}

/** What the page says when a press did not get through. */
export const PRESS_FAILED = 'That did not get through; try again.';

/** What a press needs of the page: the POST with a CSRF token, and `/api/me` again. */
export interface PressSteps {
  /** POSTs the press with this token: the status and the JSON of the answer. */
  post(csrf: string): Promise<{ status: number; body: unknown }>;
  /** Asks `/s/<guild>/api/me` again. */
  me(): Promise<Me>;
}

/**
 * What came of a press: what to tell the member and the current token (the page asks for the
 * list again to show the party as it is now).
 */
export interface Pressed {
  text: string;
  /** Whether it was done (`{ ok: true }`); a refusal or a failure is not (plan 8M-11A). */
  ok: boolean;
  csrf: string;
}

/** The words of an answer: the press's outcome, or the few words of a failure. */
function answered(body: unknown): { text: string; ok: boolean } | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { text, error, ok } = body as { text?: unknown; error?: unknown; ok?: unknown };
  if (typeof text === 'string') return { text, ok: ok === true };
  return typeof error === 'string' ? { text: error, ok: false } : undefined;
}

/**
 * Presses a party's button with the page's CSRF token. A 403 may mean the token is stale (the
 * bot restarted and made a new key since the page loaded): the token is asked for again and
 * the press tried once more when it changed; a 403 with a current token is the refusal it says.
 * A broken connection, or an answer that cannot be read, is `PRESS_FAILED`.
 */
export async function pressParty(csrf: string, steps: PressSteps): Promise<Pressed> {
  try {
    let token = csrf;
    let answer = await steps.post(token);
    if (answer.status === 403) {
      const me = await steps.me();
      if (me.loggedIn && me.csrf !== token) {
        token = me.csrf;
        answer = await steps.post(token);
      }
    }
    return { ...(answered(answer.body) ?? { text: PRESS_FAILED, ok: false }), csrf: token };
  } catch {
    return { text: PRESS_FAILED, ok: false, csrf };
  }
}

/**
 * Whether the live map is in use (plan 8M-10, C9): the page visible and the region editor off.
 * Its listeners (the pollers of the parties and of the reports at stops) are told at each change:
 * the page hidden or shown (`changed`), the editor turned on or off (`setEditing`).
 */
export class MapActivity {
  private editing = false;
  private readonly listeners: Array<() => void> = [];

  constructor(private readonly visible: () => boolean) {}

  active(): boolean {
    return !this.editing && this.visible();
  }

  /** Whether the region editor is on: the live map is hidden, and drawn anew only once it is off. */
  editingRegions(): boolean {
    return this.editing;
  }

  /** The region editor turned on or off: told only when it changed. */
  setEditing(on: boolean): void {
    if (on === this.editing) return;
    this.editing = on;
    this.changed();
  }

  /** Something it depends on changed (the page hidden or shown): every listener told. */
  changed(): void {
    for (const listener of this.listeners) listener();
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  /**
   * `work` of the live map's own events (its moves, its resizes) as a function to call: run at
   * once while the region editor is off; while it is on, the hidden map is nobody's to ask or
   * store for, so a call is only noted, and `work` runs once when the editor turns off
   * (re-review V1).
   */
  whenLive(work: () => void): () => void {
    let missed = false;
    this.onChange(() => {
      if (!missed || this.editing) return;
      missed = false;
      work();
    });
    return () => {
      if (this.editing) {
        missed = true;
        return;
      }
      work();
    };
  }
}

/**
 * The next hatch or end of a party of the list after `now`, undefined when none is to come: what a
 * live page asks again at (a signal of the store's write would come up to 60 seconds later).
 */
export function nextPartyMoment(
  view:
    | {
        raids: ReadonlyArray<{ hatchTime: number | null; endTime: number | null }>;
        maxes: ReadonlyArray<{ endTime: number | null }>;
        trains: ReadonlyArray<{ endTime: number | null }>;
        meetups: ReadonlyArray<{ endTime: number | null }>;
      }
    | undefined,
  now: number,
): number | undefined {
  if (!view) return undefined;
  const moments = [
    ...view.raids.flatMap((raid) => [raid.hatchTime, raid.endTime]),
    ...[...view.maxes, ...view.trains, ...view.meetups].map((party) => party.endTime),
  ].flatMap((moment) => (moment !== null && moment > now ? [moment] : []));
  return moments.length === 0 ? undefined : Math.min(...moments);
}

/** What the poller needs of the page. */
export interface PollerDeps {
  /**
   * Asks for the list and shows it; `stop` when there is no point in asking again. `spreadMs`: the
   * crowd's spread where a live signal or going live caused this question, undefined otherwise.
   */
  load(spreadMs: number | undefined): Promise<'go' | 'stop'>;
  everyMs: number;
  /** The clock. */
  now(): number;
  /**
   * Whether to ask: the page visible and the region editor off (`MapActivity`, plan 8M-10, C9).
   */
  active(): boolean;
  /** Starts a timer; gives what cancels it. */
  setTimer(run: () => void, ms: number): () => void;
  /** From 0 up to 1, as `Math.random`, for a signal's wait; `Math.random` unless given. */
  random?(): number;
  /** A question found there is no point in asking again (a 401, a 403): told once. */
  stopped?(): void;
}

/**
 * Asks for a list (spec 3.4): at once, then every `everyMs` (or what `setEvery` set) while the page
 * is visible (and the region editor off: `active`); nothing while it is hidden, and when it is shown
 * again at once if the interval has passed, else when it has (a page hidden and shown every 2
 * seconds once asked 30 times a minute, its limit); at once after a press, the next one an interval
 * after that; a random time after a live signal (`signalled`). One question at a time: one asked for
 * meanwhile follows it. A `stop` ends it for good.
 */
export class Poller {
  private cancel: (() => void) | undefined;
  private running: Promise<void> | undefined;
  private again = false;
  private stopped = false;
  private askedAt = -Infinity;
  private every: number;
  /** The one wait of a signal or of going live. */
  private cancelWait: (() => void) | undefined;
  private waitIsSignal = false;
  /** The spread that wait was given, and that of the question it leads to; a press's has none. */
  private waitSpread: number | undefined;
  private askSpread: number | undefined;
  /** That wait ended while a question ran: one follows it, if the map is in use by then. */
  private afterRun = false;

  constructor(private readonly deps: PollerDeps) {
    this.every = deps.everyMs;
  }

  start(): Promise<void> {
    return this.now();
  }

  /**
   * Another interval. If a question is running or the page is not in use, only stored; otherwise
   * from the last question, at once if that is past: which also makes going not live ask where the
   * last question is older than 20 seconds.
   */
  setEvery(ms: number): void {
    if (ms === this.every) return;
    this.every = ms;
    if (this.running || this.stopped || !this.deps.active()) return;
    this.cancel?.();
    this.cancel = undefined;
    const left = this.askedAt + ms - this.deps.now();
    if (left <= 0) void this.now();
    else this.schedule(left);
  }

  /**
   * Another interval, when the map went not live: every stream of a restart drops together, so the
   * next question waits a random time up to `scatterMs` whatever the last one's age, which gives
   * back polling's scatter. If a question is running or the page is not in use, only stored.
   */
  setEveryScattered(ms: number, scatterMs: number): void {
    if (ms === this.every) return;
    this.every = ms;
    if (this.running || this.stopped || !this.deps.active()) return;
    this.cancel?.();
    this.cancel = undefined;
    this.schedule(this.random() * scatterMs);
  }

  /**
   * A live signal said the list changed: asks after a random time up to `spreadMs`, so that a crowd
   * of maps does not ask in one moment. Another signal's wait keeps its time, which asks late enough
   * for both; going live's gives way, or a change would wait out the floor, and this ask serves for
   * it. It checks that the map is in use, as `now` (a press's) does not.
   */
  signalled(spreadMs: number): void {
    if (!this.waitIsSignal) {
      this.cancelWait?.();
      this.cancelWait = undefined;
    }
    if (!this.cancelWait) this.waitIsSignal = true;
    this.waitThenAsk(this.random() * spreadMs, spreadMs);
  }

  /**
   * The map went live: asks once, no sooner than `floorMs` after the last question, plus a random
   * time up to `spreadMs` on top, so that pages that asked in one instant do not come back in one.
   */
  askOnce(floorMs: number, spreadMs: number): void {
    if (!this.cancelWait) this.waitIsSignal = false;
    const floor = Math.max(0, this.askedAt + floorMs - this.deps.now());
    this.waitThenAsk(floor + this.random() * spreadMs, spreadMs);
  }

  private random(): number {
    return this.deps.random?.() ?? Math.random();
  }

  private waitThenAsk(ms: number, spreadMs: number): void {
    if (this.stopped || this.cancelWait) return;
    this.waitSpread = spreadMs;
    this.cancelWait = this.deps.setTimer(() => {
      this.cancelWait = undefined;
      if (!this.deps.active()) return;
      if (this.running) this.afterRun = true;
      else void this.ask(this.waitSpread);
    }, ms);
  }

  /** Asks at once (after a press), and waits its interval from then. */
  now(): Promise<void> {
    return this.ask(undefined);
  }

  private ask(spreadMs: number | undefined): Promise<void> {
    this.askSpread = spreadMs;
    this.cancel?.();
    this.cancel = undefined;
    this.cancelWait?.();
    this.cancelWait = undefined;
    this.afterRun = false;
    if (this.stopped) return this.idle();
    if (this.running) {
      this.again = true;
      return this.idle();
    }
    this.running = this.run();
    return this.idle();
  }

  /** The page was hidden or shown, or the region editor turned on or off. */
  activeChanged(): void {
    if (!this.deps.active()) {
      this.cancel?.();
      this.cancel = undefined;
      return;
    }
    if (this.cancel || this.running) return;
    const left = this.askedAt + this.every - this.deps.now();
    if (left <= 0) void this.now();
    else this.schedule(left);
  }

  /** Resolves once no question is under way. */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  private async run(): Promise<void> {
    try {
      do {
        this.again = false;
        this.askedAt = this.deps.now();
        if ((await this.deps.load(this.askSpread)) === 'stop') {
          this.stopped = true;
          this.cancelWait?.();
          this.cancelWait = undefined;
          this.deps.stopped?.();
          return;
        }
      } while (this.again);
    } finally {
      this.running = undefined;
      if (this.afterRun && !this.stopped && this.deps.active()) void this.ask(this.waitSpread);
      else this.schedule();
      this.afterRun = false;
    }
  }

  private schedule(ms = this.every): void {
    if (this.stopped || !this.deps.active() || this.cancel) return;
    this.cancel = this.deps.setTimer(() => {
      this.cancel = undefined;
      void this.now();
    }, ms);
  }
}
