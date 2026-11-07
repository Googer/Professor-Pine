import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { MEETUP_START_EXAMPLES, NEW_MEETUP_START_EXAMPLES } from './meetup-start-examples.js';
import { clockTime } from '../../domain/web/clock.js';
import { zoneNote } from './post-time.js';
import type { GeoView } from '../../domain/web/geo-data.js';
import {
  MEETUP_CHANGES,
  type MeetupChange,
  type MeetupPlaceBody,
  type MeetupTime,
  type StopsView,
} from '../../domain/web/meetup-data.js';
import type { MapMeetup } from '../../domain/web/party-data.js';
import { sendButton } from './form-buttons.js';
import { pressParty, type PressSteps, type Pressed } from './parties.js';
import type { MapGym, PageNode } from './popup.js';
import type { PickedStop } from './research-forms.js';
import { zoneHintNodes, type FormZones } from './raid-forms.js';
import { regionsAt, spawnPoint, type PointRegion } from './spawn-forms.js';

/**
 * Meetups on the live map (plan 8M-5M, spec 3.7), the parts that need no Leaflet: "New meetup"
 * and "Hold meetup here", the place picked on the map (a gym, a PokéStop or a pin; never a power spot),
 * the form of a new meetup and the editor of one, the bodies they send, reading an answer, and
 * sending one with the page's CSRF token as a press is sent. Everything is a tree of nodes
 * (`renderNode` sets every text as text). What a member types is read by the server with the
 * commands' readers; the page only says what is missing.
 */

/** The longest name of a meetup (`/meetup`'s option). */
const NAME_LENGTH = 80;
/** The longest start `/meetup` takes, and the longest time `/meet` and `/end` take. */
const START_LENGTH = 100;
const TIME_LENGTH = 40;
/** The longest information (`/info`'s form). */
const INFO_LENGTH = 1_000;

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

const textInput = (
  name: string,
  length: number,
  placeholder: string,
  value?: string,
): PageNode => ({
  tag: 'input',
  attributes: {
    name,
    type: 'text',
    maxlength: String(length),
    placeholder,
    autocomplete: 'off',
    ...(value === undefined || value === '' ? {} : { value }),
  },
});

const infoArea = (value: string | undefined): PageNode => ({
  tag: 'textarea',
  attributes: {
    name: 'info',
    rows: '4',
    maxlength: String(INFO_LENGTH),
    placeholder: 'Where to meet, what to bring, how long it goes.',
  },
  ...(value === undefined ? {} : { text: value }),
});

/** The line under a form where its answer is said. */
const answerLine: PageNode = { tag: 'div', className: 'form-answer', attributes: { hidden: '' } };

/** A body to send, or what is missing. */
export type MeetupBody = { body: Record<string, unknown> } | { text: string };

/** "New meetup", beside "New train" in the side panel's box. */
export function newMeetupButton(): PageNode {
  return button('New meetup', { 'data-new-meetup': '' }, 'press new-meetup');
}

/** "Hold meetup here" in a gym's popup: the form of a new meetup with the gym as its place. */
export function meetupHereBox(gymId: number): PageNode {
  return {
    tag: 'div',
    className: 'meetup-box place-control',
    children: [button('Hold meetup here', { 'data-meetup-here': String(gymId) }, 'meetup-here')],
  };
}

/**
 * "Hold meetup here" in a PokéStop's popup: the form of a new meetup with the stop as its place, in
 * a box of its own beside the stop's other actions. Whether a meetup may be held there is asked
 * when it is sent, as at a gym (`MeetupSafety`): a Power Spot never offers it.
 */
export function meetupAtStopBox(stop: PickedStop): PageNode {
  return {
    tag: 'div',
    className: 'meetup-box place-control',
    children: [
      button(
        'Hold meetup here',
        {
          'data-meetup-at-stop': stop.key,
          'data-stop-name': stop.name,
          ...(stop.at
            ? { 'data-stop-lat': String(stop.at.lat), 'data-stop-lon': String(stop.at.lon) }
            : {}),
        },
        'press',
      ),
    ],
  };
}

/** The stop a "Hold meetup here" button names (`meetupAtStopBox`), or none. */
export function stopFromMeetupButton(
  data: Readonly<Record<string, string | undefined>>,
): MapStop | undefined {
  const { meetupAtStop: key, stopName: name, stopLat, stopLon } = data;
  if (key === undefined || name === undefined || stopLat === undefined || stopLon === undefined) {
    return undefined;
  }
  return [key, Number(stopLat), Number(stopLon), name];
}

/**
 * A place picked on the map for a new meetup: what the server is sent (`MeetupPlaceBody`), how
 * the form names it, and the regions it lies in (the form's region by default: the first).
 */
export interface PickedPlace {
  body: MeetupPlaceBody;
  label: string;
  regionIds: number[];
}

/** A gym picked (its dot, the marker of its raids, "Hold meetup here"). */
export function gymPick(gym: MapGym): PickedPlace {
  return {
    body: { kind: 'gym', id: String(gym.id) },
    label: `${gym.nickname !== null && gym.nickname !== '' ? gym.nickname : gym.name} (gym)`,
    regionIds: [...gym.regionIds],
  };
}

/** A PokéStop as `/api/stops` gives it: `[id, lat, lon, title]`. */
export type MapStop = [string, number, number, string, (string | null)?];

/** A PokéStop picked in "pick a place" mode. */
export function stopPick(stop: MapStop, regions: GeoView['regions']): PickedPlace {
  const [id, lat, lon, title] = stop;
  return {
    body: { kind: 'stop', id },
    label: `${title} (PokéStop)`,
    regionIds: regionsAt({ lat, lon }, regions).map((region) => region.id),
  };
}

/**
 * A pin dropped by a click on the map in "pick a place" mode, to six decimals; a pin always waits
 * for a moderator's approval (the form says so).
 */
export function pinPick(point: LatLon, regions: GeoView['regions']): PickedPlace {
  const at = spawnPoint(point.lat, point.lon);
  return {
    body: { lat: at.lat, lon: at.lon },
    label: `A pin at ${at.lat.toFixed(5)}, ${at.lon.toFixed(5)}`,
    regionIds: regionsAt(at, regions).map((region) => region.id),
  };
}

/** What the form of a new meetup holds, kept when it is drawn anew. */
export interface NewMeetupValues {
  name: string;
  region: string;
  start: string;
  info: string;
}

/**
 * The form of a new meetup, as `/meetup` takes it (spec 3.7): its name, the region it is made in
 * (any region of the server; the first the place lies in, following each place picked, until the
 * member chooses one: `regionChosen`), its place (picked on the map: "Pick on the map", or what
 * was picked with "Pick again"; while picking, what to click and "Stop picking"), when it starts
 * (required, as `/meetup start:` reads it), and its information (required, as `/meetup`'s form).
 * `filled` is what the form drawn before held.
 */
export function newMeetupForm(
  regions: readonly PointRegion[],
  place: PickedPlace | undefined,
  filled: Partial<NewMeetupValues> = {},
  picking = false,
  regionChosen = false,
  zones?: FormZones,
): PageNode {
  const chosen = regionChosen && filled.region !== undefined && filled.region !== '';
  const ofPlace = place?.regionIds[0];
  const region = chosen
    ? (filled.region ?? '')
    : ofPlace === undefined
      ? (filled.region ?? '')
      : String(ofPlace);
  const placeLine: PageNode = picking
    ? {
        tag: 'div',
        className: 'hint picking',
        text: 'Click a gym, a PokéStop or a point of the map.',
      }
    : { tag: 'div', className: 'picked', text: place?.label ?? 'No place yet.' };
  const pinNote: PageNode[] =
    place !== undefined && !('kind' in place.body) && !picking
      ? [
          {
            tag: 'p',
            className: 'hint',
            text: "A meetup at a pin needs a moderator's approval before it is posted.",
          },
        ]
      : [];
  return {
    tag: 'div',
    className: 'raid-form meetup-form',
    attributes: { 'data-form': 'meetup' },
    children: [
      { tag: 'strong', className: 'name', text: 'New meetup' },
      labelled('Name', textInput('name', NAME_LENGTH, 'Such as Community Day picnic', filled.name)),
      labelled('Region', {
        tag: 'select',
        attributes: { name: 'region' },
        children: [
          option('', 'Pick the region', region === ''),
          ...regions.map((each) => option(String(each.id), each.name, String(each.id) === region)),
        ],
      }),
      {
        tag: 'div',
        className: 'form-row meetup-place',
        children: [
          { tag: 'span', text: 'Place' },
          placeLine,
          picking
            ? button('Stop picking', { 'data-pick': 'stop' })
            : button(place === undefined ? 'Pick on the map' : 'Pick again', {
                'data-pick': 'start',
              }),
        ],
      },
      ...pinNote,
      labelled('Starts', textInput('start', START_LENGTH, NEW_MEETUP_START_EXAMPLES, filled.start)),
      ...(zones === undefined ? [] : zoneHintNodes(zones.zone, zones.reader)),
      labelled('Information', infoArea(filled.info)),
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          sendButton('Make the meetup', { 'data-submit': 'meetup' }),
          button('Cancel', { 'data-cancel': '' }),
        ],
      },
      answerLine,
    ],
  };
}

/** The body of a new meetup (`POST /s/<guild>/api/meetups`), or what is missing. */
export function newMeetupBody(values: NewMeetupValues, place: PickedPlace | undefined): MeetupBody {
  const name = values.name.trim();
  if (name === '') return { text: 'Give the meetup a name first.' };
  const region = Number(values.region);
  if (values.region === '' || !Number.isInteger(region)) return { text: 'Pick the region first.' };
  if (place === undefined) return { text: 'Pick its place on the map first.' };
  const start = values.start.trim();
  if (start === '') return { text: 'Say when it starts first.' };
  if (values.info.trim() === '') {
    return { text: 'Say what there is to know first: where to meet, what to bring.' };
  }
  return { body: { region, name, place: place.body, start, info: values.info } };
}

/** "Manage…" in a meetup's popup or item, for its maker and staff (`MapMeetup.panel`). */
export function meetupActions(meetup: MapMeetup): PageNode[] {
  return meetup.panel
    ? [
        {
          tag: 'div',
          className: 'meetup-actions',
          children: [button('Manage…', { 'data-edit-meetup': meetup.id })],
        },
      ]
    : [];
}

/**
 * A field of the editor the member typed in: its text, and the value of the meetup it was drawn
 * from when they began (`drawn`), sent with its change so that one made meanwhile is refused.
 */
export interface EditorField {
  text: string;
  drawn: string | number | null;
}

/**
 * The fields of the editor the member typed in, kept when it is drawn anew. A field not in it was
 * not typed in: it shows the meetup as the last answer gave it, and is not sent.
 */
export type MeetupEditorFilled = Partial<Record<MeetupChange, EditorField>>;

/** The editor while it is open: the meetup it is drawn from, and the fields typed in. */
export interface EditorState {
  meetup: MapMeetup;
  filled: MeetupEditorFilled;
}

/** The value of a meetup a change is drawn from: its name, information, start or end. */
function drawnOf(meetup: MapMeetup, change: MeetupChange): string | number | null {
  switch (change) {
    case 'name':
      return meetup.name;
    case 'info':
      return meetup.info;
    case 'start':
      return meetup.startTime;
    case 'end':
      return meetup.endTime;
  }
}

/** What a field not typed in shows: the name and the information; the times are said above. */
function shownOf(meetup: MapMeetup, change: MeetupChange): string {
  switch (change) {
    case 'name':
      return meetup.name;
    case 'info':
      return meetup.info ?? '';
    case 'start':
    case 'end':
      return '';
  }
}

/** The times, which go in one request when both changed. */
const MEETUP_TIMES: readonly MeetupTime[] = ['start', 'end'];

const isChange = (key: string): key is MeetupChange =>
  (MEETUP_CHANGES as readonly string[]).includes(key);

/**
 * A text with its line endings as a textarea gives them back (`\n`): information stored with
 * `\r\n` or `\r` reads the same untouched.
 */
const oneLineEnding = (text: string): string => text.replace(/\r\n?/gu, '\n');

/**
 * The fields typed in once the editor's fields read `typed` (by name): a field that shows what the
 * meetup has (line endings aside) is not typed in, whatever it held before (a refused start cleared
 * by the member asks nothing); any other is typed in, keeping the value it was drawn from if it was
 * typed in before, else drawn from the meetup the editor shows.
 */
export function editorTyped(
  state: EditorState,
  typed: Readonly<Record<string, string>>,
): MeetupEditorFilled {
  const filled: MeetupEditorFilled = { ...state.filled };
  for (const [key, text] of Object.entries(typed)) {
    if (!isChange(key)) continue;
    if (oneLineEnding(text) === oneLineEnding(shownOf(state.meetup, key))) {
      delete filled[key];
      continue;
    }
    const before = filled[key];
    filled[key] = { text, drawn: before === undefined ? drawnOf(state.meetup, key) : before.drawn };
  }
  return filled;
}

/**
 * The editor after the answer to both times in one request (`…/times`): a time that went through
 * shows the meetup's value again, a refused one keeps its text, as `editorAfter` has each.
 */
export function editorAfterTimes(
  state: EditorState,
  typed: Readonly<Record<string, string>>,
  answer: MeetupAnswered,
): EditorState {
  const filled = editorTyped(state, typed);
  const went = answer.ok ? MEETUP_TIMES : (answer.went ?? []);
  for (const change of MEETUP_TIMES) {
    const sent = filled[change];
    if (sent === undefined) continue;
    if (went.includes(change)) delete filled[change];
    else if (answer.meetup !== undefined) {
      filled[change] = { text: sent.text, drawn: drawnOf(answer.meetup, change) };
    }
  }
  return { meetup: answer.meetup ?? state.meetup, filled };
}

/**
 * The editor after the answer to a Submit's change `change`, its fields reading `typed`: drawn from the
 * meetup the answer gives (else the one it had), so a field not typed in shows what it has now. A
 * change made shows the meetup's value again; a refused one keeps the text, drawn from the meetup
 * the answer gives (the member has been shown it: a Submit again means it). Every other field typed
 * in keeps its text and the value it was drawn from, so a Submit of it after somebody else changed
 * that value is refused.
 */
export function editorAfter(
  state: EditorState,
  typed: Readonly<Record<string, string>>,
  change: MeetupChange,
  answer: MeetupAnswered,
): EditorState {
  const { [change]: sent, ...rest } = editorTyped(state, typed);
  const meetup = answer.meetup ?? state.meetup;
  if (answer.ok || sent === undefined) return { meetup, filled: rest };
  const drawn = answer.meetup === undefined ? sent.drawn : drawnOf(answer.meetup, change);
  return { meetup, filled: { ...rest, [change]: { text: sent.text, drawn } } };
}

/**
 * A time as the editor says it now: `Now: 6:00 PM`, or that there is none; in the server's zone,
 * which reads what is typed, named where the reader is in another (`zoneNote`, review 8A-11).
 */
export function nowLine(
  words: string,
  at: number | null,
  zone: string,
  now: number,
  reader: string,
): PageNode {
  return {
    tag: 'div',
    className: 'hint',
    text:
      at === null
        ? `${words}: none`
        : `${words}: ${clockTime(at, zone, now)}${zoneNote(zone, reader)}`,
  };
}

/**
 * The editor of a meetup on the map (spec 3.7), for its maker and staff: its name, its
 * information, when it starts (only for a member signed up, as `/meet`; else why not) and when it
 * ends (`none` removes it), Submit, which sends what was changed, and Cancel.
 * `filled` holds the fields typed in, which keep their text; a field not typed in shows what the
 * meetup has (the times empty: they are said above them).
 */
export function meetupEditor(
  meetup: MapMeetup,
  zone: string,
  now: number,
  filled: MeetupEditorFilled = {},
  reader: string = zone,
): PageNode {
  const shown = (change: MeetupChange): string => filled[change]?.text ?? shownOf(meetup, change);
  const start: PageNode[] = meetup.panel?.start
    ? [
        nowLine('Starts now', meetup.startTime, zone, now, reader),
        labelled('Starts', textInput('start', TIME_LENGTH, MEETUP_START_EXAMPLES, shown('start'))),
      ]
    : [
        nowLine('Starts', meetup.startTime, zone, now, reader),
        { tag: 'p', className: 'hint', text: 'Sign up for it to change when it starts.' },
      ];
  return {
    tag: 'div',
    className: 'raid-form meetup-editor',
    attributes: { 'data-form': 'meetup-edit', 'data-party': meetup.id },
    children: [
      { tag: 'strong', className: 'name', text: `Manage ${meetup.name}` },
      ...(meetup.place ? [{ tag: 'div', className: 'hint', text: meetup.place.words }] : []),
      labelled('Name', textInput('name', NAME_LENGTH, 'Its name', shown('name'))),
      labelled('Information', infoArea(shown('info'))),
      ...start,
      nowLine('Ends now', meetup.endTime, zone, now, reader),
      labelled('Ends', textInput('end', TIME_LENGTH, '8pm, in 90, or none', shown('end'))),
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          sendButton('Submit', { 'data-submit': 'meetup-edit' }),
          button('Cancel', { 'data-cancel': '' }),
        ],
      },
      answerLine,
    ],
  };
}

/**
 * The body of a change of a meetup (`POST /s/<guild>/api/meetups/<id>/<change>`), with the
 * value the field was drawn from (`drawn`), or what is missing: a field typed in sends its text
 * and the value it was drawn from (`editorTyped`), one not typed in what it shows, drawn from the
 * meetup the editor shows.
 */
export function meetupChangeBody(
  change: MeetupChange,
  meetup: MapMeetup,
  filled: MeetupEditorFilled,
): MeetupBody {
  const field = filled[change];
  const text = field?.text ?? shownOf(meetup, change);
  const drawn = field === undefined ? drawnOf(meetup, change) : field.drawn;
  switch (change) {
    case 'name': {
      const name = text.trim();
      return name === '' ? { text: 'Give the meetup a name first.' } : { body: { drawn, name } };
    }
    case 'info':
      // Empty removes it, as `/info` sent back empty does.
      return { body: { drawn, info: text } };
    case 'start':
    case 'end': {
      const time = text.trim();
      if (time === '')
        return { text: `Say when it ${change === 'start' ? 'starts' : 'ends'} first.` };
      return { body: { drawn, time } };
    }
  }
}

/**
 * The body of both times in one request (`MeetupTimesBody`), or what is missing: the server orders
 * them, which the page cannot, as it cannot read typed times.
 */
export function meetupTimesBody(meetup: MapMeetup, filled: MeetupEditorFilled): MeetupBody {
  const start = meetupChangeBody('start', meetup, filled);
  if ('text' in start) return start;
  const end = meetupChangeBody('end', meetup, filled);
  if ('text' in end) return end;
  return { body: { start: start.body, end: end.body } };
}

/**
 * What the page takes of a meetup's answer: whether it was done, what came of a making, the
 * status it came with (none when the connection broke), the meetup as it is now, and of both
 * times refused which went through.
 */
export interface MeetupAnswered {
  ok: boolean;
  outcome?: 'posted' | 'held';
  status?: number;
  meetup?: MapMeetup;
  went?: readonly MeetupTime[];
}

/**
 * Reads an answer of the meetups' addresses. The meetup is the server's own view (`MapMeetup`);
 * one that does not look like it (an id and a name) gives none.
 */
export function meetupAnswerOf(body: unknown): MeetupAnswered {
  if (typeof body !== 'object' || body === null) return { ok: false };
  const { ok, outcome, meetup, went } = body as {
    ok?: unknown;
    outcome?: unknown;
    meetup?: unknown;
    went?: unknown;
  };
  const answered: MeetupAnswered = { ok: ok === true };
  if (outcome === 'posted' || outcome === 'held') answered.outcome = outcome;
  if (Array.isArray(went)) {
    answered.went = MEETUP_TIMES.filter((time) => (went as unknown[]).includes(time));
  }
  if (typeof meetup === 'object' && meetup !== null) {
    const { id, name } = meetup as { id?: unknown; name?: unknown };
    if (typeof id === 'string' && typeof name === 'string') answered.meetup = meetup as MapMeetup;
  }
  return answered;
}

/**
 * Whether an answer closes the editor: the meetup is gone (409 without a meetup: it has ended,
 * or is no meetup of this server), or the meetup it gives is no longer the member's to change
 * (`panel` null: no longer staff, say). Any other answer leaves it open, drawn from the meetup the
 * answer gives.
 */
export function editorEnds(answer: MeetupAnswered): boolean {
  if (answer.meetup !== undefined) return answer.meetup.panel === null;
  return !answer.ok && answer.status === 409;
}

/**
 * What the page does with the answer to a Submit's change: `aside` when the editor it was sent from is no
 * longer the one open (`stillOpen` false: closed meanwhile; only the words are said), `close` when
 * the answer ends the editor (`editorEnds`), else `redraw` (`editorAfter`).
 */
export function editorStep(
  stillOpen: boolean,
  answer: MeetupAnswered,
): 'aside' | 'close' | 'redraw' {
  if (!stillOpen) return 'aside';
  return editorEnds(answer) ? 'close' : 'redraw';
}

/**
 * Whether the member chose the region of a new meetup, by the value now chosen in the form's
 * list: a region (then a place picked leaves it), or none again (it follows the place).
 */
export function regionChosenBy(value: string): boolean {
  return value !== '';
}

/**
 * Sends a meetup's form or change with the page's CSRF token as a press is sent (`pressParty`: a
 * 403 of a stale token is tried once more with a new one): the words to say, the token now, the
 * status of the last answer, and what it says of the meetup.
 */
export async function sendMeetupForm(
  csrf: string,
  steps: PressSteps,
): Promise<Pressed & MeetupAnswered> {
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
    ...meetupAnswerOf(last?.body),
    ...(last === undefined ? {} : { status: last.status }),
  };
}

/**
 * "Pick a place" mode (plan 8M-5M): started by the form's "Pick on the map", ended by a pick or
 * "Stop picking". While it is on, a gym clicked (its dot, the marker of its raids), a PokéStop
 * clicked or a point of the map clicked becomes the form's place, and the map opens no popup.
 */
export class PlacePicking {
  private on = false;

  constructor(private readonly picked: (place: PickedPlace) => void) {}

  get picking(): boolean {
    return this.on;
  }

  start(): void {
    this.on = true;
  }

  end(): void {
    this.on = false;
  }

  /** A gym clicked: picked while picking (true: no popup), else nothing (false). */
  gym(gym: MapGym): boolean {
    return this.take(() => gymPick(gym));
  }

  /** A PokéStop clicked. */
  stopClicked(stop: MapStop, regions: GeoView['regions']): boolean {
    return this.take(() => stopPick(stop, regions));
  }

  /** A point of the map clicked. */
  point(point: LatLon, regions: GeoView['regions']): boolean {
    return this.take(() => pinPick(point, regions));
  }

  private take(place: () => PickedPlace): boolean {
    if (!this.on) return false;
    this.on = false;
    this.picked(place());
    return true;
  }
}

/** A box of the map, as Leaflet's bounds give it. */
export interface MapBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value));

/**
 * The box the PokéStops are asked for (`/api/stops`): the map's view kept to the world, latitude
 * to [-90, 90] and longitude to [-180, 180] (a view zoomed far out, or panned past the
 * antimeridian, reaches beyond them, which the server refuses). A view wholly beyond them is kept
 * to an empty box on the edge, in which there is nothing; an inverted one is sent as it is, and
 * the server refuses it.
 */
export function stopsBox(view: MapBox): MapBox {
  return {
    south: clamp(view.south, 90),
    west: clamp(view.west, 180),
    north: clamp(view.north, 90),
    east: clamp(view.east, 180),
  };
}

/** What `StopLoads` works with. */
export interface StopLoadsDeps {
  /** Asks for the PokéStops of the map's view as it is now. */
  load(): Promise<StopsView>;
  /** Shows them, to be picked. */
  show(view: StopsView): void;
  /** Whether the view holds more stops than are shown: called only when that changes. */
  more(more: boolean): void;
  /** The stops could not be loaded. */
  failed(): void;
  /** How long the map rests before its stops are asked for again (about 300 ms). */
  delayMs: number;
  /** Starts a timer; gives what cancels it. */
  setTimer(run: () => void, ms: number): () => void;
}

/**
 * The PokéStops of "pick a place" mode (plan 8M-5M): asked for at once as the mode starts
 * (`now`), and once the map has rested `delayMs` after it moved (`moved`, however often it
 * moved); the questions are numbered and only the answer to the last one is shown, none once the
 * mode ended (`stop`); "zoom in" is said only when whether there are more changes.
 */
export class StopLoads {
  private asked = 0;
  private cancel: (() => void) | undefined;
  private saidMore = false;
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly deps: StopLoadsDeps) {}

  /** Asks at once. */
  now(): void {
    this.cancel?.();
    this.cancel = undefined;
    this.asked += 1;
    const mine = this.asked;
    const run = this.deps
      .load()
      .then((view) => {
        if (mine !== this.asked) return;
        this.deps.show(view);
        if (view.more !== this.saidMore) {
          this.saidMore = view.more;
          this.deps.more(view.more);
        }
      })
      .catch(() => {
        if (mine === this.asked) this.deps.failed();
      })
      .finally(() => {
        this.running.delete(run);
      });
    this.running.add(run);
  }

  /** The map moved: asks once it has rested. */
  moved(): void {
    this.cancel?.();
    this.cancel = this.deps.setTimer(() => {
      this.cancel = undefined;
      this.now();
    }, this.deps.delayMs);
  }

  /** The mode ended: nothing waits, and no answer on its way is shown. */
  stop(): void {
    this.cancel?.();
    this.cancel = undefined;
    this.asked += 1;
    this.saidMore = false;
  }

  /** Resolves once no question is on its way (for tests). */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running]);
  }
}
