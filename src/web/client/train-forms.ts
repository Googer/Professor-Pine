import type { MapAtEnd, MapTrain, MapTrainKind } from '../../domain/web/party-data.js';
import { ALREADY_ON_ROUTE } from '../../render/route-words.js';
import {
  MAP_AT_ENDS,
  type ConductorSeen,
  type RouteEdit,
  type SavedRouteView,
} from '../../domain/web/train-data.js';
import { newMeetupButton } from './meetup-forms.js';
import {
  gymOfStop,
  pressParty,
  stopPlace,
  type PressSteps,
  type Pressed,
  type StopPlace,
} from './parties.js';
import type { MapGym, PageNode } from './popup.js';
import { zoneHintNodes, type FormZones } from './raid-forms.js';

/**
 * Trains on the live map (plan 8M-5, spec 3.7), the parts that need no Leaflet: the start form,
 * a train's actions in its popup, the route editor of route mode and its numbered stops, the
 * bodies they send, and sending one with the page's CSRF token as a press
 * is sent. Everything is a tree of nodes (`renderNode` sets every text as text). What a member
 * types is read by the server with the commands' readers; the page only says what is missing.
 */

/** The longest name of a train or a saved route (`/train`'s option). */
const NAME_LENGTH = 80;
/** The longest time a command takes (its option's length). */
const TIME_LENGTH = 40;

/** What a train does at the end of its route, in full, as the panel's menu says it. */
export const AT_END_WORDS: Readonly<Record<MapAtEnd, string>> = {
  finish: 'Finish at the last stop',
  loop: 'Loop: back to the first stop',
  'turn-back': 'Turn back at the end',
};

const button = (
  text: string,
  attributes: Record<string, string>,
  className = 'press',
): PageNode => ({
  tag: 'button',
  className,
  text,
  attributes: { type: 'button', ...attributes },
});

const option = (value: string, text: string, selected: boolean): PageNode => ({
  tag: 'option',
  text,
  attributes: { value, ...(selected ? { selected: '' } : {}) },
});

const labelled = (text: string, ...children: PageNode[]): PageNode => ({
  tag: 'label',
  className: 'form-row',
  children: [{ tag: 'span', text }, ...children],
});

/** A body to send (a route's edits carry the route they were drawn from), or what is missing. */
export type TrainBody = { body: Record<string, unknown> } | { text: string };

/** The line under a form where its answer is said. */
const answerLine: PageNode = { tag: 'div', className: 'form-answer', attributes: { hidden: '' } };

/** A gym as a stop is named: its nickname, else its name (as the posts do). */
export function stopName(
  gym: MapGym | undefined,
  key: string,
  spots: MapTrain['spots'] = [],
): string {
  // A power spot of the route (plan 8X-4), by the name the train's data gives it.
  if (key.startsWith('w')) {
    const spot = spots.find((one) => one.key === key);
    return spot ? `${spot.name} (Power Spot)` : 'A Power Spot';
  }
  if (!gym) return `Gym ${key}`;
  return gym.nickname !== null && gym.nickname !== '' ? gym.nickname : gym.name;
}

/**
 * "New train" in the side panel, for a member while the map is not read-only, and "New meetup"
 * beside it (plan 8M-5M): the box the start form, route mode and the meetups' forms take.
 */
export function newTrainButton(): PageNode {
  return {
    tag: 'div',
    className: 'train-box',
    children: [button('New train', { 'data-new-train': '' }, 'press new-train'), newMeetupButton()],
  };
}

/**
 * "Start train here" in a gym's or a Power Spot's popup: the form of a new train with the place as its
 * first stop. The place's id is how an open form turns the button off (`formControls`), and how
 * a gym that shows its raid, whose popup is drawn as a tree, finds its gym; a popup of a place
 * listens to its own button.
 */
export function trainHereBox(placeId: string): PageNode {
  return {
    tag: 'div',
    className: 'train-here-box place-control',
    children: [button('Start train here', { 'data-train-here': placeId }, 'train-here')],
  };
}

/** The place a new train starts at (Matt, 2026-10-30; the map's alone, not `/train`'s). */
export interface FirstStop {
  /** As the form names it. */
  name: string;
  /** What route mode adds, as a tap on the place does. */
  stop: Pick<RouteEditValues, 'gym' | 'spot'>;
  /** The kind the train is made with; left out: a raid train, the server's default. */
  kind?: MapTrainKind;
}

/** A gym as a first stop, named as a stop is. */
export function firstStopAtGym(gym: MapGym): FirstStop {
  return { name: stopName(gym, String(gym.id)), stop: { gym: gym.id } };
}

/** A Power Spot as a first stop, by its stop key: a Dynamax train, which Manage… can change. */
export function firstStopAtSpot(spot: { id: string; title: string }): FirstStop {
  return {
    name: `${spot.title} (Power Spot)`,
    stop: { spot: `w${spot.id}` },
    kind: 'dynamax',
  };
}

/** What the start form holds, kept when it is drawn anew. */
export interface StartValues {
  name: string;
  region: string;
  time: string;
  atEnd: string;
}

/**
 * The form of a new train, as `/train` takes it and `/meet` its start: its name, the region it
 * is made in (any region of the server, `/api/geo`'s), when it starts (a clock time, a date and
 * a time, or `in 30`; empty for none yet) and what it does at the end of its route; `firstStop`
 * names the place it starts at ("Start train here").
 */
export function startForm(
  regions: ReadonlyArray<{ id: number; name: string }>,
  filled: Partial<StartValues> = {},
  zones?: FormZones,
  firstStop?: string,
): PageNode {
  return {
    tag: 'div',
    className: 'raid-form train-form',
    attributes: { 'data-form': 'train' },
    children: [
      { tag: 'strong', className: 'name', text: 'New train' },
      ...(firstStop === undefined
        ? []
        : [{ tag: 'p', className: 'first-stop', text: `First stop: ${firstStop}` }]),
      labelled('Name', {
        tag: 'input',
        attributes: {
          name: 'name',
          type: 'text',
          maxlength: String(NAME_LENGTH),
          placeholder: 'Such as Saturday legendaries',
          autocomplete: 'off',
          ...(filled.name === undefined ? {} : { value: filled.name }),
        },
      }),
      labelled('Region', {
        tag: 'select',
        attributes: { name: 'region' },
        children: [
          option('', 'Pick the region', (filled.region ?? '') === ''),
          ...regions.map((region) =>
            option(String(region.id), region.name, String(region.id) === filled.region),
          ),
        ],
      }),
      labelled('Starts', {
        tag: 'input',
        attributes: {
          name: 'time',
          type: 'text',
          maxlength: String(TIME_LENGTH),
          placeholder: '6:15pm, 10-17 6:15pm or in 30',
          autocomplete: 'off',
          ...(filled.time === undefined ? {} : { value: filled.time }),
        },
      }),
      ...(zones === undefined ? [] : zoneHintNodes(zones.zone, zones.reader)),
      labelled('At the end', atEndSelect((filled.atEnd as MapAtEnd | undefined) ?? 'finish')),
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          button('Start', { 'data-submit': 'train' }),
          button('Cancel', { 'data-cancel': '' }),
        ],
      },
      answerLine,
    ],
  };
}

/** The menu of what a train does at the end of its route, `picked` chosen. */
function atEndSelect(picked: MapAtEnd): PageNode {
  return {
    tag: 'select',
    attributes: { name: 'atEnd' },
    children: MAP_AT_ENDS.map((atEnd) => option(atEnd, AT_END_WORDS[atEnd], atEnd === picked)),
  };
}

/** The body of a new train (`POST /s/<guild>/api/trains`), or what is missing. */
export function startBody(values: StartValues, kind?: MapTrainKind): TrainBody {
  const name = values.name.trim();
  if (name === '') return { text: 'Give the train a name first.' };
  const region = Number(values.region);
  if (values.region === '' || !Number.isInteger(region)) return { text: 'Pick the region first.' };
  const time = values.time.trim();
  const atEnd = MAP_AT_ENDS.find((mode) => mode === values.atEnd);
  return {
    body: {
      name,
      region,
      ...(time === '' ? {} : { time }),
      ...(atEnd === undefined || atEnd === 'finish' ? {} : { atEnd }),
      ...(kind === undefined ? {} : { kind }),
    },
  };
}

/**
 * What a train's own summary offers a member (shown until its post comes), as they may
 * (`MapTrain.may`, `moves`, `mayManage`, `conductor`): "Edit route", "Move…", "Manage…" (where the
 * server says it opens: for who may move the train, also without a route, its kind), and taking or
 * giving up the conductor role; and whose the role is, without naming anybody.
 */
export function trainActions(train: MapTrain): PageNode[] {
  const { conductor } = train;
  const line =
    conductor.who === 'you'
      ? 'You are its conductor.'
      : conductor.who === 'other'
        ? 'It has a conductor.'
        : undefined;
  const buttons = [
    ...(train.may.arrange ? [button('Edit route', { 'data-route-train': train.id })] : []),
    ...(train.moves ? [button('Move…', { 'data-move-train': train.id })] : []),
    ...(train.mayManage ? [button('Manage…', { 'data-manage-train': train.id })] : []),
    ...(conductor.mayTake
      ? [button('Be the conductor', { 'data-conductor': 'take', 'data-train': train.id })]
      : []),
    ...(conductor.mayDrop
      ? [
          button(conductor.who === 'you' ? 'Stop being the conductor' : 'Take the conductor off', {
            'data-conductor': 'give-up',
            'data-train': train.id,
          }),
        ]
      : []),
  ];
  return [
    ...(line === undefined ? [] : [{ tag: 'div', className: 'conductor', text: line }]),
    ...(buttons.length === 0
      ? []
      : [{ tag: 'div', className: 'train-actions', children: buttons }]),
  ];
}

/**
 * The body of a conductor's button (`POST …/conductor/<change>`): whose the role was as the
 * train was drawn, so that a press against a role that changed meanwhile is refused.
 */
export function conductorBody(train: Pick<MapTrain, 'conductor'>): { who: ConductorSeen } {
  return { who: train.conductor.who ?? 'none' };
}

/**
 * The trains whose line the list draws on the map: all but the one being routed, whose route
 * mode draws its stops (`routeMarkers`) as they are edited. `clickable`: whether their lines and
 * markers take clicks; not while a train is routed, so that a click on a gym under another
 * train's line reaches the gym and adds it as a stop.
 */
export function drawnTrains(
  trains: readonly MapTrain[],
  routed: string | undefined,
): { trains: MapTrain[]; clickable: boolean } {
  return { trains: trains.filter((train) => train.id !== routed), clickable: routed === undefined };
}

/** What `keepTools` needs of the side panel: the DOM's, or a test's. */
export interface ToolsPanel<N> {
  readonly childNodes: ArrayLike<N>;
  removeChild(child: N): unknown;
  insertBefore(child: N, before: N | null): unknown;
}

/**
 * The side pane with its parts in order (`wanted`: the trains' box where offered, the phone's
 * Report line, the list of what is on), and nothing else. A part already in its place is never
 * moved or taken out of the page: a field of the start form or the route editor keeps the focus
 * and what is typed in it while the list is drawn anew, and the list keeps the focus of its line
 * until it gives it to the sort where the line's party ended (plan 8M-11A, S11); what is new is put
 * before the parts that follow it.
 */
export function keepTools<N>(panel: ToolsPanel<N>, wanted: readonly N[]): void {
  for (const child of Array.from(panel.childNodes)) {
    if (!wanted.includes(child)) panel.removeChild(child);
  }
  wanted.forEach((part, index) => {
    const there = panel.childNodes[index] ?? null;
    if (there !== part) panel.insertBefore(part, there);
  });
}

/**
 * The stops of a train in route mode: its key (`MapTrain.route`), the gym it is (null for a power
 * spot), its number, whether the train is there.
 */
export function routeMarkers(
  train: Pick<MapTrain, 'route' | 'stop'>,
): Array<{ key: string; gymId: number | null; number: number; here: boolean }> {
  return train.route.map((key, index) => ({
    key,
    gymId: gymOfStop(key),
    number: index + 1,
    here: train.stop === index,
  }));
}

/**
 * The stops route mode numbers on the map (`routeMarkers`), each where it is (`stopPlace`): a
 * gym's point, a power spot's of the train's data; a stop the map cannot place is left out, its
 * number kept by the others.
 */
export function placedStops(
  train: Pick<MapTrain, 'route' | 'stop' | 'spots'>,
  gyms: ReadonlyMap<number, StopPlace>,
): Array<{ key: string; number: number; here: boolean; place: StopPlace }> {
  return routeMarkers(train).flatMap(({ key, number, here }) => {
    const place = stopPlace(train, key, gyms);
    return place ? [{ key, number, here, place }] : [];
  });
}

/** A saved route as the list names it: `Name (3 stops, loops)`. */
function savedLabel(route: SavedRouteView): string {
  const mode =
    route.atEnd === 'loop' ? ', loops' : route.atEnd === 'turn-back' ? ', turns back' : '';
  const stops = `${route.stops} ${route.stops === 1 ? 'stop' : 'stops'}`;
  return `${route.name === '' ? 'Without a name' : route.name} (${stops}${mode})`;
}

/**
 * What a stop of the route editor offers who may arrange the route: up, down, a move to any
 * position (one `/route move` by the numbers shown, so that a stop goes far in one edit) and
 * remove (`/route remove`).
 */
function stopControls(number: number, count: number): PageNode[] {
  const positions = Array.from({ length: count }, (_, index) => index + 1);
  return [
    button('↑', {
      'data-edit': 'move',
      'data-from': String(number),
      'data-to': String(number - 1),
      'aria-label': `Move stop ${number} up`,
      ...(number === 1 ? { disabled: '' } : {}),
    }),
    button('↓', {
      'data-edit': 'move',
      'data-from': String(number),
      'data-to': String(number + 1),
      'aria-label': `Move stop ${number} down`,
      ...(number === count ? { disabled: '' } : {}),
    }),
    {
      tag: 'select',
      className: 'move-to',
      attributes: { 'data-move-from': String(number), 'aria-label': `Move stop ${number} to` },
      children: positions.map((to) => option(String(to), `#${to}`, to === number)),
    },
    button('✕', {
      'data-edit': 'remove',
      'data-stop': String(number),
      'aria-label': `Remove stop ${number}`,
    }),
  ];
}

/**
 * The route editor's hint (plan 8M-8C, R5): what a tap on the map adds, and while the map shows
 * no Power Spot (their layer off, or zoomed out past where it draws them), how to have them.
 */
export function spotsHint(spotsShown: boolean): string {
  return spotsShown
    ? 'Tap a gym or a Power Spot on the map to add it as the next stop.'
    : 'Tap a gym on the map to add it as the next stop. Turn on Power Spots and zoom in to add ' +
        'a Power Spot.';
}

/**
 * What the route editor holds that the member typed or picked: the name to save the route under
 * and the saved route picked (its id), kept when the editor is drawn anew.
 */
export interface RouteEditorFilled {
  name?: string;
  route?: string;
}

/**
 * The route editor of route mode, in the side panel (spec 3.7): the train's stops in order, the
 * one it is at marked, each for who may arrange the route with a handle to drag it by (plan 8M-8C,
 * R6: a pointer's way, `StopDrag`) and up, down, a move to any position and remove (the
 * keyboard's way, `stopControls`); "Clear the route" for who may (`/route clear`); the member's
 * saved routes of its region to load (who may) or forget, and a name to save the route under;
 * what lies ahead under the stops (`MapTrain.ahead`, as Route says it); Done. A gym
 * clicked on the map, or a Power Spot of its layer tapped (plan 8M-8C, R5), is added as the next
 * stop (`/route add`); while the map shows no Power Spot (`spotsShown` false: their layer off or
 * the map zoomed out too far), the hint says how to have them. `saved` is undefined while the
 * list is on its way. `filled` is what the editor drawn before held (`RouteEditorFilled`), kept
 * when an answer draws it anew.
 */
export function routeEditor(
  train: MapTrain,
  gym: (id: number) => MapGym | undefined,
  saved: readonly SavedRouteView[] | undefined,
  filled: RouteEditorFilled = {},
  spotsShown = true,
): PageNode {
  const picked = saved?.some((route) => String(route.id) === filled.route) ? filled.route : '';
  const count = train.route.length;
  const stops: PageNode =
    count === 0
      ? { tag: 'p', className: 'hint', text: 'No stops yet.' }
      : {
          tag: 'ol',
          className: 'route-stops',
          children: routeMarkers(train).map(({ key, gymId, number, here }) => ({
            tag: 'li',
            className: here ? 'route-stop here' : 'route-stop',
            children: [
              // A handle to drag the stop by (plan 8M-8C, R6), for a pointer: the keyboard's way
              // is up, down and the position menu.
              ...(train.may.arrange && count > 1
                ? [
                    {
                      tag: 'span',
                      className: 'drag-handle',
                      text: '⠿',
                      attributes: {
                        'data-drag': String(number),
                        title: 'Drag to move this stop',
                        'aria-hidden': 'true',
                      },
                    },
                  ]
                : []),
              {
                tag: 'span',
                className: 'stop-name',
                text: `${number}. ${stopName(gymId === null ? undefined : gym(gymId), key, train.spots)}${here ? ' (the train is here)' : ''}`,
              },
              ...(train.may.arrange ? stopControls(number, count) : []),
            ],
          })),
        };
  const savedPart: PageNode[] =
    saved === undefined
      ? [{ tag: 'p', className: 'hint', text: 'Loading your saved routes…' }]
      : saved.length === 0
        ? [{ tag: 'p', className: 'hint', text: 'You have no saved routes for this region.' }]
        : [
            labelled(
              'Saved',
              {
                tag: 'select',
                attributes: { name: 'route' },
                children: [
                  option('', 'Pick a saved route', picked === ''),
                  ...saved.map((route) =>
                    option(String(route.id), savedLabel(route), String(route.id) === picked),
                  ),
                ],
              },
              ...(train.may.load ? [button('Load', { 'data-edit': 'load' })] : []),
              button('Forget', { 'data-edit': 'forget' }),
            ),
          ];
  return {
    tag: 'div',
    className: 'raid-form route-editor',
    attributes: { 'data-form': 'route', 'data-party': train.id },
    children: [
      { tag: 'strong', className: 'name', text: `Route of ${train.name}` },
      { tag: 'p', className: 'hint spots-hint', text: spotsHint(spotsShown) },
      stops,
      // What lies ahead as the server words it (the post's small print), as Route says it under
      // its list (plan 8M-8C, R3; branch review B3).
      ...(train.ahead === null
        ? []
        : [{ tag: 'div', className: 'route-ahead', text: train.ahead }]),
      ...(train.may.clear && count > 0
        ? [
            {
              tag: 'div',
              className: 'form-buttons',
              children: [button('Clear the route', { 'data-edit': 'clear' })],
            },
          ]
        : []),
      ...savedPart,
      ...(count === 0
        ? []
        : [
            labelled(
              'Save as',
              {
                tag: 'input',
                attributes: {
                  name: 'name',
                  type: 'text',
                  maxlength: String(NAME_LENGTH),
                  placeholder: 'A name for this route',
                  autocomplete: 'off',
                  ...(filled.name === undefined || filled.name === ''
                    ? {}
                    : { value: filled.name }),
                },
              },
              button('Save', { 'data-edit': 'save' }),
            ),
          ]),
      {
        tag: 'div',
        className: 'form-buttons',
        children: [button('Done', { 'data-cancel': '' })],
      },
      answerLine,
    ],
  };
}

/** What a route edit reads of the editor and the button pressed. */
export interface RouteEditValues {
  gym?: number;
  /** A Power Spot tapped on the map (plan 8M-8C, R5): its stop key (`w<Wayfarer id>`). */
  spot?: string;
  stop?: string;
  from?: string;
  to?: string;
  route?: string;
  name?: string;
  /**
   * The route a move was drawn from where it is not the train's when the edit is sent: a drop
   * of a drag sends the route as it was when the drag began (plan 8M-8C, R6).
   */
  drawn?: readonly string[];
}

/**
 * The body of an edit of the route (`POST /s/<guild>/api/trains/<id>/route/<edit>`), with the
 * route it was drawn from (`drawn`), or what is missing.
 */
export function routeEditBody(
  edit: RouteEdit,
  train: MapTrain,
  values: RouteEditValues,
): TrainBody {
  const drawn = [...(values.drawn ?? train.route)];
  const whole = (text: string | undefined): number | undefined => {
    const value = Number(text);
    return text !== undefined && text !== '' && Number.isInteger(value) && value > 0
      ? value
      : undefined;
  };
  switch (edit) {
    case 'add':
      // A stop on the route already (a gym clicked twice, a stop clicked, a Power Spot tapped
      // twice) costs no request: said in the words `/route add` refuses it with (review C7).
      if (values.spot !== undefined) {
        return drawn.includes(values.spot)
          ? { text: ALREADY_ON_ROUTE }
          : { body: { drawn, stop: values.spot } };
      }
      if (values.gym === undefined) return { text: 'Click a gym first.' };
      return drawn.includes(String(values.gym))
        ? { text: ALREADY_ON_ROUTE }
        : { body: { drawn, stop: String(values.gym) } };
    case 'remove': {
      const stop = whole(values.stop);
      return stop === undefined ? { text: 'Pick a stop first.' } : { body: { drawn, stop } };
    }
    case 'move': {
      const [from, to] = [whole(values.from), whole(values.to)];
      return from === undefined || to === undefined
        ? { text: 'Pick a stop first.' }
        : { body: { drawn, from, to } };
    }
    case 'clear':
      return { body: { drawn } };
    case 'save': {
      const name = (values.name ?? '').trim();
      return name === '' ? { text: 'Give the route a name first.' } : { body: { drawn, name } };
    }
    case 'load':
    case 'forget': {
      const route = whole(values.route);
      if (route === undefined) return { text: 'Pick one of your saved routes first.' };
      return { body: edit === 'load' ? { drawn, route } : { route } };
    }
  }
}

/**
 * What the page takes of a train's answer: whether it was done, the status it came with (none
 * when the connection broke), and the train as it is now.
 */
export interface TrainAnswered {
  ok: boolean;
  status?: number;
  train?: MapTrain;
}

/**
 * Whether an edit's answer ends route mode: the train is gone (409 without a train: it has
 * ended, or is no train of this server). A refusal that gives the train is drawn from it; one
 * without it for another reason (too many clicks, Discord away, a broken connection) leaves route
 * mode as it is.
 */
export function routeModeEnds(answer: TrainAnswered): boolean {
  return !answer.ok && answer.train === undefined && answer.status === 409;
}

/** A row of the stop list as the page draws it: its top and bottom on the screen. */
export interface DragRow {
  top: number;
  bottom: number;
}

/**
 * Where a stop dragged in the stop list lands (plan 8M-8C, R6): the position (from 1, as `/route
 * move` takes it) of the row the pointer is over; above the first row the first, below the last
 * the last, between two rows the one below.
 */
export function dropPosition(y: number, rows: readonly DragRow[]): number {
  const over = rows.findIndex((row) => y < row.bottom);
  return over === -1 ? Math.max(1, rows.length) : over + 1;
}

/**
 * The stops a stop dragged from position `from` would land between at position `to` (plan
 * 8M-11B, S24; positions from 1, as `/route move` takes them and `StopDrag`'s drop gives them):
 * the stop it would follow and the one it would precede, by their keys, none at either end; at
 * its own position its own neighbors. Undefined for a position the route does not have.
 */
export function dropNeighbors(
  route: readonly string[],
  from: number,
  to: number,
): { moved: string; before: string | undefined; after: string | undefined } | undefined {
  const moved = route[from - 1];
  if (moved === undefined || to < 1 || to > route.length) return undefined;
  const rest = route.filter((_, index) => index !== from - 1);
  return { moved, before: rest[to - 2], after: rest[to - 1] };
}

/**
 * The dragged stop's new legs as the map draws them while it is dragged (S24): from the stop it
 * would follow to it, and from it to the stop it would precede, each where the map can place both
 * ends (`stopPlace`); one at either end of the route, none for a stop off the map.
 */
export function dropLegs(
  train: Pick<MapTrain, 'route' | 'spots'>,
  from: number,
  to: number,
  gyms: ReadonlyMap<number, StopPlace>,
): Array<{ from: StopPlace; to: StopPlace }> {
  const near = dropNeighbors(train.route, from, to);
  if (!near) return [];
  const place = (key: string | undefined) =>
    key === undefined ? undefined : stopPlace(train, key, gyms);
  const moved = place(near.moved);
  if (!moved) return [];
  const before = place(near.before);
  const after = place(near.after);
  return [
    ...(before ? [{ from: before, to: moved }] : []),
    ...(after ? [{ from: moved, to: after }] : []),
  ];
}

/** A gesture of the map that can be switched off and on (Leaflet's `touchZoom`, `dragging`). */
export interface MapGesture {
  enabled(): boolean;
  enable(): unknown;
  disable(): unknown;
}

/**
 * Holds the map while a stop's handle is held (plan 8M-11B, S25: Leaflet counts every finger on
 * the screen, so a finger on the map beside the one on the handle pinch-zoomed it): the gestures
 * that are on are switched off; the function it gives back switches those, and only those, on
 * again, once.
 */
export function holdMap(gestures: readonly MapGesture[]): () => void {
  const were = gestures.filter((gesture) => gesture.enabled());
  for (const gesture of were) gesture.disable();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const gesture of were) gesture.enable();
  };
}

/** How near an edge of the stop list's pane a dragged stop scrolls it, in pixels (`edgeScroll`). */
const SCROLL_EDGE = 40;

/** The most a frame scrolls the pane while a stop is dragged, in pixels. */
const SCROLL_STEP = 12;

/**
 * How far to scroll the stop list's pane in a frame while a stop is dragged with the pointer at
 * `y` (review C9: the docked pane on a phone shows a few rows): up (negative) within
 * `SCROLL_EDGE` of its top, down within it of its bottom, the faster the nearer, at most
 * `SCROLL_STEP` (also beyond the pane); nothing in its middle, nor in a pane too low to have
 * edges.
 */
export function edgeScroll(y: number, pane: { top: number; bottom: number }): number {
  if (pane.bottom - pane.top < 3 * SCROLL_EDGE) return 0;
  const step = (inside: number): number =>
    Math.ceil((SCROLL_STEP * (SCROLL_EDGE - Math.max(0, inside))) / SCROLL_EDGE);
  if (y < pane.top + SCROLL_EDGE) return -step(y - pane.top);
  if (y > pane.bottom - SCROLL_EDGE) return step(pane.bottom - y);
  return 0;
}

/**
 * A stop dragged by its handle in the route editor (plan 8M-8C, R6): it begins at a stop with the
 * route as drawn then (not while edits wait or are on their way: `busy`), follows the pointer
 * from row to row (`over`, the position it would land at), and a drop is one move (`drop`: from,
 * to and the route drawn, none where it lands where it was). A cancel (the pointer lost, Escape,
 * the editor drawn anew: review C2) drops nothing. It follows the pointer that began it only
 * (`follows`: a second finger is not the drag).
 */
export class StopDrag {
  private dragged:
    { from: number; drawn: readonly string[]; to: number; pointer: number | undefined } | undefined;

  /** Whether a drag is on. */
  get active(): boolean {
    return this.dragged !== undefined;
  }

  /**
   * Begins a drag of the stop `from` by the pointer `pointer` (its `pointerId`); false while edits
   * are busy (nothing begins).
   */
  begin(from: number, drawn: readonly string[], busy: boolean, pointer?: number): boolean {
    this.dragged = busy ? undefined : { from, drawn: [...drawn], to: from, pointer };
    return this.dragged !== undefined;
  }

  /** Whether a drag is on, begun by this pointer. */
  follows(pointer: number): boolean {
    return this.dragged !== undefined && this.dragged.pointer === pointer;
  }

  /** The pointer at `y` over the rows: where the stop would land, none without a drag. */
  over(y: number, rows: readonly DragRow[]): number | undefined {
    if (!this.dragged) return undefined;
    this.dragged.to = dropPosition(y, rows);
    return this.dragged.to;
  }

  /** The drop: the move to make, or none (no drag, or back where it was); the drag ends. */
  drop(): { from: number; to: number; drawn: readonly string[] } | undefined {
    const dropped = this.dragged;
    this.dragged = undefined;
    return dropped === undefined || dropped.to === dropped.from ? undefined : dropped;
  }

  /** The drag ends without a move. */
  cancel(): void {
    this.dragged = undefined;
  }
}

/** What `RouteEdits` works with. */
export interface RouteEditsDeps {
  /** The train being arranged as the last answer gave it; undefined once route mode ended. */
  train(): MapTrain | undefined;
  /** Sends an edit's body (or says what is missing) and takes its answer in. */
  send(edit: RouteEdit, body: TrainBody): Promise<void>;
  /** Edits are waiting or on their way (the editor's buttons off), or none any more. */
  busy(on: boolean): void;
}

/**
 * The edits of route mode, one at a time: a gym clicked while an edit is on its way waits for
 * its turn rather than being refused against the route the edit before changes, and its body is
 * made only then, from the train the answer before gave (`routeEditBody`); once route mode ended,
 * what waits is dropped. `add` resolves when the edit is through (or dropped).
 */
export class RouteEdits {
  private waiting = 0;
  private last: Promise<void> = Promise.resolve();

  constructor(private readonly deps: RouteEditsDeps) {}

  /** Whether an edit is waiting or on its way. */
  get busy(): boolean {
    return this.waiting > 0;
  }

  add(edit: RouteEdit, values: RouteEditValues): Promise<void> {
    if (this.waiting === 0) this.deps.busy(true);
    this.waiting += 1;
    const turn = this.last
      .then(async () => {
        const train = this.deps.train();
        if (train) await this.deps.send(edit, routeEditBody(edit, train, values));
      })
      .catch(() => undefined)
      .finally(() => {
        this.waiting -= 1;
        if (this.waiting === 0) this.deps.busy(false);
      });
    this.last = turn;
    return turn;
  }
}

/**
 * Reads an answer of the trains' addresses. The train is the server's own view (`MapTrain`);
 * an answer without one that looks like it (an id and a route) gives none.
 */
export function trainAnswerOf(body: unknown): TrainAnswered {
  if (typeof body !== 'object' || body === null) return { ok: false };
  const { ok, train } = body as { ok?: unknown; train?: unknown };
  const answered: TrainAnswered = { ok: ok === true };
  if (typeof train === 'object' && train !== null) {
    const { id, route } = train as { id?: unknown; route?: unknown };
    // The server's own view of the train, as `/api/parties` gives it.
    if (typeof id === 'string' && Array.isArray(route)) answered.train = train as MapTrain;
  }
  return answered;
}

/**
 * Sends a train's form or press with the page's CSRF token as a press is sent (`pressParty`: a
 * 403 of a stale token is tried once more with a new one): the words to say, the token now, the
 * status of the last answer, and the train as it gives it.
 */
export async function sendTrainForm(
  csrf: string,
  steps: PressSteps,
): Promise<Pressed & TrainAnswered> {
  let last: { status: number; body: unknown } | undefined;
  const pressed = await pressParty(csrf, {
    post: async (token) => {
      const answer = await steps.post(token);
      last = answer;
      return answer;
    },
    me: () => steps.me(),
  });
  return {
    ...pressed,
    ...trainAnswerOf(last?.body),
    ...(last === undefined ? {} : { status: last.status }),
  };
}
