import { searchTokens } from '../../domain/search/text.js';
import { FIND_MAX_TEXT, FIND_MIN_LETTERS, type FoundPlace } from '../../domain/web/find-data.js';
import type { MapTrain, PartiesView } from '../../domain/web/party-data.js';
import type { SpawnsView } from '../../domain/web/spawn-data.js';
import {
  unconfirmedWords,
  type MapGrunt,
  type MapHideout,
  type MapResearch,
  type StopReportsView,
} from '../../domain/web/stop-report-data.js';
import { metersBetween } from './distance.js';
import { gymOfStop } from './parties.js';
import type { MapGym } from './popup.js';
import { spawnsShown } from './spawns.js';
import { reportsAtStops } from './stop-reports.js';
import type { LatLon } from './view.js';
import {
  listLines,
  spawnLines,
  stopReportLines,
  type ListKind,
  type ListLine,
} from './what-is-on.js';

/*
 * Find on the live map (plan 8M-12; design `docs/superpowers/specs/2026-10-28-find-design.md`):
 * one box, "Find a place or report", for a member with the map's role. From two letters, after a
 * pause, every word typed matching as typed or as the start of a word (case and accents ignored,
 * by Pine's search text rules, `searchTokens`): the reports at stops of today (by the words the
 * server gives each, `reportSearch`), the parties going on (matched here over what the page
 * holds) and the wild spawns (by the words the server gives each), and places by name (the
 * server's answer, `/api/find-places`). The results fill the list pane in three groups, each
 * sorted by distance; the map stays as it is. The pure part; the party layer draws it in the
 * list (`WhatIsOn`) and `FindSearch` times it.
 */

/** The pause after a keystroke before Find searches (the design: about 250 ms). */
export const FIND_PAUSE_MS = 250;

/** The box's words for a member who gets Find; visitors keep "Find a gym". */
export const FIND_PLACEHOLDER = 'Find a place or report';

/** The words of a text as Find reads them; undefined below two letters or digits. */
export function typedWords(text: string): string[] | undefined {
  const words = searchTokens(text);
  return words.join('').length >= FIND_MIN_LETTERS ? words : undefined;
}

/** Whether every word typed is a word of `words`, or the start of one. */
export function findsAll(typed: readonly string[], words: readonly string[]): boolean {
  return typed.every((word) => words.some((one) => one.startsWith(word)));
}

/** What the places' group has: the places found, an answer awaited, or none to be had. */
export type PlacesFound = readonly FoundPlace[] | 'waiting' | 'failed';

/** A search under way: the text in the box, its words, and the places the server gave for it. */
export interface FindState {
  text: string;
  words: string[];
  places: PlacesFound;
}

/** The three groups of Find, in their order. */
export type FindKind = 'reports' | 'going' | 'places';

export interface FindGroup {
  kind: FindKind;
  heading: string;
  lines: ListLine[];
  /** A line under its heading: the places still being asked for, or not to be had. */
  note?: string;
}

/** What the page holds that Find searches, and where distances are measured from. */
export interface FindData {
  parties: PartiesView | undefined;
  gyms: ReadonlyMap<number, MapGym>;
  reports: StopReportsView | undefined;
  /** The wild spawns (`/api/spawns`). */
  spawns: SpawnsView | undefined;
  now: number;
  /** Your location, else the map's middle; none: by name. */
  origin: LatLon | undefined;
}

/** The names of a train's stops, as the map knows them. */
function trainStops(train: MapTrain, gyms: ReadonlyMap<number, MapGym>): string[] {
  return train.route.map((key) => {
    const gym = gymOfStop(key);
    if (gym !== null) return gyms.get(gym)?.name ?? '';
    return train.spots.find((spot) => spot.key === key)?.name ?? '';
  });
}

/**
 * The words of each party going on, by its line's key (the design's "Going on"): raids by their
 * heading and boss, max battles by their title and boss, trains by their name, kind and stops,
 * meetups by their name and place.
 */
function partyWords(
  view: PartiesView,
  gyms: ReadonlyMap<number, MapGym>,
): Map<string, readonly string[]> {
  const words = (...texts: Array<string | null | undefined>): string[] => [
    ...new Set(texts.flatMap((text) => (text ? searchTokens(text) : []))),
  ];
  return new Map<string, readonly string[]>([
    ...view.raids.map((raid): [string, string[]] => [
      `raid:${raid.id}`,
      words(raid.heading, raid.boss),
    ]),
    ...view.maxes.map((max): [string, string[]] => [`max:${max.id}`, words(max.title, max.boss)]),
    ...view.trains.map((train): [string, string[]] => [
      `train:${train.id}`,
      words(train.name, train.trainKindWords, ...trainStops(train, gyms)),
    ]),
    ...view.meetups.map((meetup): [string, string[]] => [
      `meetup:${meetup.id}`,
      words(meetup.name, meetup.place?.words),
    ]),
  ]);
}

/**
 * A found report's line: the list's own line of it (`stopReportLines`: its picture, its stop, its
 * time, one wording of times with the list; branch review BR-7), the stop's name first, what
 * matched under it (task and reward, who and lineup), and why it is not confirmed.
 */
function reportLine(
  found:
    | { kind: 'research'; report: MapResearch }
    | { kind: 'grunt'; report: MapGrunt }
    | { kind: 'hideout'; report: MapHideout },
  listed: ReadonlyMap<string, ListLine>,
): ListLine | undefined {
  const line = listed.get(`${found.kind}:${String(found.report.id)}`);
  if (!line) return undefined;
  const matched =
    found.kind === 'research'
      ? [found.report.text, found.report.rewardText]
      : [found.report.name, found.kind === 'grunt' ? found.report.lineup : undefined];
  const unconfirmed = found.kind === 'hideout' ? undefined : found.report.unconfirmed;
  return {
    ...line,
    name: found.report.stop.name,
    place: matched.filter((part) => part !== undefined && part !== '').join(' · '),
    ...(unconfirmed === undefined ? {} : { mark: unconfirmedWords(unconfirmed) }),
  };
}

/** The layer a found place's kind is drawn on. */
const PLACE_KINDS: Readonly<Record<FoundPlace['kind'], { kind: ListKind; words: string }>> = {
  gym: { kind: 'gyms', words: 'Gym' },
  stop: { kind: 'stops', words: 'PokéStop' },
  powerspot: { kind: 'spots', words: 'Power Spot' },
};

/** A found place's line: its name and kind, opening its own popup. */
export function placeLine(place: FoundPlace): ListLine {
  const { kind, words } = PLACE_KINDS[place.kind];
  return {
    key: `place:${place.kind}:${place.id}`,
    kind,
    id: place.id,
    marker: null,
    name: place.name,
    place: words,
    point: { lat: place.lat, lon: place.lon },
    address: place.address,
    picture: null,
    going: 0,
    soonest: null,
    times: {},
  };
}

/** What Find says when no group holds anything. */
export function nothingFound(text: string): string {
  return `Nothing found for ‘${text.trim()}’.`;
}

/** Said under the places' heading while the server is asked, and when it could not answer. */
export const FINDING_PLACES = 'Finding places…';
export const PLACES_FAILED = 'Places could not be searched just now.';

/**
 * Find's groups for a search (the design's "The results"): the reports at stops of today that the
 * words find (confirmed first, then not confirmed, each by distance; research waiting under an
 * event's window is not in the view, so never found; the layers and filters ignored), the parties
 * going on that they find (by distance, each line the place's name over what matched) with the
 * wild spawns that have not gone away (the Pokémon over where it is), and the places the server
 * found (in its order, at most ten of each kind). A group with nothing is left out; the places'
 * group is kept while it is asked for or failed, with its note.
 */
export function foundGroups(state: FindState, data: FindData): FindGroup[] {
  const { words } = state;
  const distance = (line: ListLine): number =>
    line.point && data.origin ? metersBetween(data.origin, line.point) : Infinity;
  const byDistance = (a: ListLine, b: ListLine): number =>
    distance(a) - distance(b) || a.name.localeCompare(b.name);

  const reports = data.reports;
  // The list's own lines of every report standing, whatever the layers and filters (BR-7).
  const listed = new Map(
    stopReportLines(reportsAtStops(reports, { on: () => true, now: data.now })).map(
      (line): [string, ListLine] => [line.key, line],
    ),
  );
  const found = <T extends { words: readonly string[] }>(list: readonly T[]): T[] =>
    list.filter((report) => findsAll(words, report.words));
  const lineOf = (line: ListLine | undefined): ListLine[] => (line ? [line] : []);
  const reportLines = reports
    ? [
        ...found(reports.research).flatMap((report) =>
          lineOf(reportLine({ kind: 'research', report }, listed)),
        ),
        ...found(reports.grunts).flatMap((report) =>
          lineOf(reportLine({ kind: 'grunt', report }, listed)),
        ),
        ...found(reports.hideouts).flatMap((report) =>
          lineOf(reportLine({ kind: 'hideout', report }, listed)),
        ),
      ]
    : [];
  const confirmed = reportLines.filter((line) => line.mark === undefined).sort(byDistance);
  const unconfirmed = reportLines.filter((line) => line.mark !== undefined).sort(byDistance);

  const going: ListLine[] = [];
  if (data.parties) {
    const partyFound = partyWords(data.parties, data.gyms);
    for (const line of listLines(data.parties, data.gyms)) {
      if (!findsAll(words, partyFound.get(line.key) ?? [])) continue;
      // The place's name first, then what matched (the raid's heading, the meetup's name); a
      // train by its name, its stop under it; a party without a place by its name alone (F5).
      going.push(
        line.kind === 'trains' || line.place === null
          ? line
          : { ...line, name: line.place, place: line.name },
      );
    }
  }
  // The wild spawns that have not gone away (Matt, 2026-11-07), by the words the server gave each
  // (the Pokémon's name, its form, `costumed`), whatever their layer says: the list's own line,
  // the Pokémon first and where it is under it.
  const spawnsFound = spawnsShown(data.spawns, { now: data.now }).filter((spawn) =>
    findsAll(words, spawn.words),
  );
  going.push(...spawnLines(spawnsFound));
  going.sort(byDistance);

  const groups: FindGroup[] = [];
  const reportsFound = [...confirmed, ...unconfirmed];
  if (reportsFound.length > 0) {
    groups.push({
      kind: 'reports',
      heading: `Reports at stops · ${String(reportsFound.length)}`,
      lines: reportsFound,
    });
  }
  if (going.length > 0) {
    groups.push({ kind: 'going', heading: `Going on · ${String(going.length)}`, lines: going });
  }
  // Places found only by a misspelling (plan 8M-13, O1, Matt's A) only where Find found nothing
  // else for the text: no report, no party, no place by its words.
  const places =
    state.places === 'waiting' || state.places === 'failed'
      ? state.places
      : groups.length > 0 || state.places.some((place) => !place.guess)
        ? state.places.filter((place) => !place.guess)
        : state.places;
  if (places === 'waiting' || places === 'failed') {
    groups.push({
      kind: 'places',
      heading: 'Places',
      lines: [],
      note: places === 'waiting' ? FINDING_PLACES : PLACES_FAILED,
    });
  } else if (places.length > 0) {
    groups.push({
      kind: 'places',
      heading: `Places · ${String(places.length)}`,
      lines: places.map(placeLine),
    });
  }
  return groups;
}

/** The first line of the groups, which Enter picks. */
export function firstFound(groups: readonly FindGroup[]): ListLine | undefined {
  return groups.find((group) => group.lines.length > 0)?.lines[0];
}

/** Why Find's search changed (`FindSearchDeps.changed`). */
export type FindChange = 'began' | 'settled' | 'ended';

/** What `FindSearch` needs: the server's places for a text, and a word when what it holds changed. */
export interface FindSearchDeps {
  /** The places of `/api/find-places` for the text (the member's point added by the caller). */
  places(text: string): Promise<readonly FoundPlace[]>;
  /**
   * The search changed, and why: a search of a new text `began` (the list's sheet opens for it on
   * a phone), its places `settled` or were asked for again (review F1: nothing opens then), or it
   * `ended` (the list as it was).
   */
  changed(state: FindState | undefined, why: FindChange): void;
  /** The places came for a search Enter was pressed in, before any line was found. */
  pick?(state: FindState): void;
}

/**
 * Find's timing (plan 8M-12): a keystroke only sets the pause (`FIND_PAUSE_MS`); after it, the
 * search is shown (the page's own groups at once) and the server is asked for the places once; an
 * answer for a text no longer in the box is dropped. Under two letters there is no search: the
 * list is as it was. Enter searches at once (`now`), and asks for the places again where they
 * failed (review F4).
 */
export class FindSearch {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private current: FindState | undefined;
  /** The text in the box. */
  private text = '';
  /** Enter was pressed before the places came for this text. */
  private picking: string | undefined;
  /** The places' question asked last: an answer to an earlier one is dropped. */
  private asked = 0;

  constructor(private readonly deps: FindSearchDeps) {}

  /** The search shown; none while the box holds under two letters. */
  get state(): FindState | undefined {
    return this.current;
  }

  /** The box's text changed. */
  typed(text: string): void {
    // The route's longest text (branch review BR-4): the box's own `maxLength` holds it too.
    this.text = text.slice(0, FIND_MAX_TEXT);
    text = this.text;
    this.picking = undefined;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (typedWords(text) === undefined) {
      if (this.current !== undefined) {
        this.current = undefined;
        this.deps.changed(undefined, 'ended');
      }
      return;
    }
    if (this.current !== undefined && this.current.text === text) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.search();
    }, FIND_PAUSE_MS);
  }

  /**
   * Enter: the search at once where the pause still runs, the places asked for again where they
   * failed (review F4); true where there is a search.
   */
  now(): boolean {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.search();
    } else if (this.current?.places === 'failed') {
      this.current = { ...this.current, places: 'waiting' };
      this.deps.changed(this.current, 'settled');
      this.ask(this.current.text);
    }
    return this.current !== undefined;
  }

  /** Enter found no line yet: the first place, once the places come for this text. */
  pickWhenFound(): void {
    if (this.current?.places === 'waiting') this.picking = this.current.text;
  }

  private search(): void {
    const { text } = this;
    const words = typedWords(text);
    if (words === undefined) return;
    this.current = { text, words, places: 'waiting' };
    this.deps.changed(this.current, 'began');
    this.ask(text);
  }

  /** The places of a text asked for, its answer kept while it is the last question's. */
  private ask(text: string): void {
    this.asked += 1;
    const question = this.asked;
    const settle = (places: PlacesFound): void => {
      // An answer for a text no longer in the box, or to an earlier question, is dropped.
      if (this.current?.text !== text || question !== this.asked) return;
      this.current = { ...this.current, places };
      this.deps.changed(this.current, 'settled');
      if (this.picking === text) {
        this.picking = undefined;
        this.deps.pick?.(this.current);
      }
    };
    this.deps.places(text).then(settle, () => {
      settle('failed');
    });
  }
}
