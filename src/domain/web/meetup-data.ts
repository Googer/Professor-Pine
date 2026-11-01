/**
 * What the live map's meetups read and send (plan 8M-5M, spec 3.7), as the page reads it. Types
 * and lists alone, with no import of the server's code: the page's bundle (`src/web/client/`)
 * takes them.
 */

import type { MapMeetup } from './party-data.js';

/**
 * Where a new meetup is (`POST /s/<guild>/api/meetups`, `place`): a gym or a PokéStop by its kind
 * and id (a gym's number as text, a stop's Wayfarer id), as a pick of `/meetup near:` names it,
 * or a pin dropped on the map. Never a power spot (Matt, 2026-10-17): the map offers none, and
 * the server refuses any other kind.
 */
export type MeetupPlaceBody = { kind: string; id: string } | { lat: number; lon: number };

/**
 * What making or changing a meetup answers: whether it was done, the command's words as plain
 * text, what came of a making (`posted`, or `held` for the moderators: nothing is posted yet),
 * and the meetup as the member now sees it on the map when there is one to show (also after a
 * refusal of a change, so that the page draws it as it is now).
 */
export interface MeetupAnswer {
  ok: boolean;
  text: string;
  outcome?: 'posted' | 'held';
  meetup?: MapMeetup;
  /** Of both times asked at once (`…/times`), refused: which went through before the refusal. */
  went?: readonly MeetupTime[];
}

/** The times of a meetup that can be changed in one request. */
export type MeetupTime = 'start' | 'end';

/**
 * Both times of a meetup in one request (`POST /s/<guild>/api/meetups/<id>/times`): the server reads
 * the end from the start asked, refuses times out of order with nothing changed, and chooses their
 * order (`setTimesAs`), which the page cannot.
 */
export interface MeetupTimesBody {
  start: { drawn: number | null; time: string };
  end: { drawn: number | null; time: string };
}

/**
 * The changes of a meetup the map makes (`POST /s/<guild>/api/meetups/<id>/<change>`), each as
 * its command does it: `name` (`/name`, body `{ drawn, name }`), `info` (`/info`, `{ drawn,
 * info }`), `start` (`/meet`, `{ drawn, time }`; `cancel` removes it as `/meet time:cancel`
 * does), `end` (`/end`, `{ drawn, time }`). Each carries the value it was drawn from (`drawn`, as the meetup's view gave it).
 */
export const MEETUP_CHANGES = ['name', 'info', 'start', 'end'] as const;
export type MeetupChange = (typeof MEETUP_CHANGES)[number];

/**
 * The PokéStops of a server in a box of the map (`GET /s/<guild>/api/stops`), for picking a
 * meetup's place: `[id, lat, lon, title, address]`, the nearest to the box's middle first, at most
 * `MAX_MAP_STOPS`; `more` when the box holds more (the page asks to zoom in).
 */
export interface StopsView {
  stops: Array<[string, number, number, string, (string | null)?]>;
  more: boolean;
}

/** As many stops as one answer of `/api/stops` gives. */
export const MAX_MAP_STOPS = 300;
