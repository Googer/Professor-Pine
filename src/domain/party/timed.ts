import {
  mayArrange,
  MAX_PARTY_NAME,
  membersWhere,
  NO_PROMPTS,
  refused,
  withLastPossibleTime,
  type Change,
  type PartyCore,
  type Refusal,
  type TimedDetails,
  type TimedParty,
} from './party.js';
import { PartyStatus } from './status.js';

const MINUTE = 60_000;
const HOUR = 3_600_000;

/**
 * A timed party without an end time is taken to be over this long after its start. One that has
 * no start either has this long from when it was made, or from when its last time was taken
 * away. (The legacy bot had no such rule: a meetup without an end time stayed for good.)
 */
export const OPEN_PARTY_HOURS = 24;

/** What it takes to make a timed party: a name and who makes it where. */
export interface NewTimedParty {
  /** A fresh UUID. */
  id: string;
  guildId: number;
  /** The region it is made in: its post goes into that region's forum. */
  regionId: number;
  /** Snowflake of the member who makes it. */
  createdById: string;
  /** As the member typed it; it is tidied (`tidyName`). */
  name: string;
  /**
   * When it starts, as the caller read it (a train started on the map); floored to the minute,
   * as `setStartTime` floors it. Left out: no start yet.
   */
  startTime?: number;
  now: number;
}

/**
 * What every new timed party starts as, before the part of its own kind is added: a name and
 * nothing else yet, with the member who made it signed up as interested in group A (as the
 * legacy bot did), and named. That is a meetup as it stays; a train changes both by what its
 * maker has set (`createTrain`). It has no times but the start it was given, if any: `settled`
 * gives it its day.
 */
export function newTimedParty(
  input: NewTimedParty,
  name: string,
): PartyCore & { gymId: null; hatchTime: null; timed: TimedDetails } {
  const { now } = input;
  return {
    id: input.id,
    guildId: input.guildId,
    status: 'active',
    regionId: input.regionId,
    gymId: null,
    forumChannelId: null,
    forumPostId: null,
    regionLinkMessageId: null,
    mirrorMessages: [],
    createdById: input.createdById,
    anonymous: false,
    hatchTime: null,
    endTime: null,
    lastPossibleTime: null,
    deletionTime: null,
    saved: false,
    createdAt: now,
    updatedAt: now,
    attendees: {
      [input.createdById]: {
        number: 1,
        status: PartyStatus.Interested,
        group: 'A',
        remote: false,
      },
    },
    groups: [{ id: 'A' }],
    defaultGroupId: 'A',
    prompts: NO_PROMPTS,
    timed: {
      name,
      startTime:
        input.startTime === undefined ? null : Math.floor(input.startTime / MINUTE) * MINUTE,
    },
  };
}

/** The name of a timed party. */
export function nameOf(party: TimedParty): string {
  return party.timed.name;
}

/**
 * Whether a change drawn from `drawn` (a name, information or time as the live map's editor
 * showed it) still fits the party, whose value is `now`: the refusal `changed-meanwhile` when it
 * is another by now, else undefined. Nothing drawn (`undefined`: the commands) always fits.
 */
export function asDrawn<T>(now: T, drawn: T | undefined): Refusal | undefined {
  return drawn === undefined || drawn === now ? undefined : refused('changed-meanwhile');
}

/** When a timed party starts, for everybody; null while nobody has said. */
export function startTimeOf(party: TimedParty): number | null {
  return party.timed.startTime;
}

/**
 * A name as it is kept: on one line, runs of white space as one space, the ends trimmed, and
 * without characters that cannot be seen (control and format characters: a zero-width space is
 * no name, and a direction override would turn the title of the post around). The zero-width
 * joiner stays: emoji are built with it. Undefined for a text that is no name: nothing left, or
 * longer than a name may be.
 */
export function tidyName(text: string): string | undefined {
  const name = text
    .replace(/\s+/g, ' ')
    .replace(/(?!\u200d)[\p{Cc}\p{Cf}]/gu, '')
    .replace(/ +/g, ' ')
    .trim();
  return name === '' || name.length > MAX_PARTY_NAME ? undefined : name;
}

/**
 * The latest moment a timed party can still be going on, as it is worked out at `now`, when one
 * of its times has just been set or taken away: its end time when it has one; otherwise
 * `OPEN_PARTY_HOURS` after its start. A party with neither has that long from now, and never
 * less than from when it was made: taking the last time away from an old meetup gives it a day,
 * not the archive warning.
 */
export function latestTime(party: TimedParty, now: number): number {
  if (party.endTime !== null) return party.endTime;
  const from = startTimeOf(party) ?? Math.max(party.createdAt, now);
  return from + OPEN_PARTY_HOURS * HOUR;
}

/**
 * Brings what follows from the times up to date, as `raid.ts` does for a raid: the last possible
 * time, and with it a scheduled archiving, which is called off when the party turns out to be
 * still going on (`withLastPossibleTime`): a time that somebody sets after the warning takes
 * the warning away.
 */
export function settled<P extends TimedParty>(party: P, now: number): P {
  return withLastPossibleTime(party, latestTime(party, now), now);
}

/**
 * Whether a timed party is over by the clock: its end time has passed. One without an end time
 * never is: `latestTime` only tells the clean-up when to stop waiting for one.
 */
export function timedOver(party: TimedParty, now: number): boolean {
  return party.endTime !== null && now >= party.endTime;
}

/** The party with this in the part that every timed party has. */
export function withTimed<P extends TimedParty>(party: P, change: Partial<TimedDetails>): P {
  return { ...party, timed: { ...party.timed, ...change } };
}

/**
 * Gives the party another name. Refused with `bad-name` for a text that is no name; the very
 * same party comes back when it has that name already.
 */
export function setName<P extends TimedParty>(party: P, text: string): Change<P> {
  const name = tidyName(text);
  if (name === undefined) return refused('bad-name');
  return { ok: true, party: name === nameOf(party) ? party : withTimed(party, { name }) };
}

/**
 * Whether a start and an end lie in order as a party keeps them: to the minute, the start before
 * the end; either may be none. The one rule of `setStartTime` and `setTimedEnd`, and of a pair of
 * times read before either is set (Manage… of a train on the map).
 */
export function timesInOrder(start: number | null, end: number | null): boolean {
  if (start === null || end === null) return true;
  return Math.floor(start / MINUTE) < Math.floor(end / MINUTE);
}

/**
 * Sets when the party starts, for everybody, or removes the start with null. Only for an
 * attendee (as with the legacy bot), and for the maker of a train (`mayArrange`). A start that
 * does not lie before the end is refused. The time is floored to the minute; the caller has
 * checked it (`resolvePartyTime`). `others` are the other attendees, to be told; none when the
 * start did not change.
 */
export function setStartTime<P extends TimedParty>(
  party: P,
  memberId: string,
  time: number | null,
  now: number,
): Change<P, { others: string[] }> {
  if (!mayArrange(party, memberId)) return refused('not-attending');
  const startTime = time === null ? null : Math.floor(time / MINUTE) * MINUTE;
  if (!timesInOrder(startTime, party.endTime)) return refused('start-after-end');
  if (startTime === startTimeOf(party)) return { ok: true, party, others: [] };
  const others = membersWhere(
    party,
    (attendee, other) => other !== memberId && attendee.status !== PartyStatus.Complete,
  );
  return { ok: true, party: settled(withTimed(party, { startTime }), now), others };
}

/**
 * Sets when the party ends, or removes the end with null (the legacy bot stored a time of -1
 * for that by mistake). Anybody may, as with the legacy bot. An end that does not lie after the
 * start is refused. The time is floored to the minute; the caller has checked it. The very same
 * party comes back when the end is what it was.
 */
export function setTimedEnd<P extends TimedParty>(
  party: P,
  time: number | null,
  now: number,
): Change<P> {
  const endTime = time === null ? null : Math.floor(time / MINUTE) * MINUTE;
  if (!timesInOrder(startTimeOf(party), endTime)) return refused('end-before-start');
  if (endTime === party.endTime) return { ok: true, party };
  return { ok: true, party: settled({ ...party, endTime }, now) };
}
