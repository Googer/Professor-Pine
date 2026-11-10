import type { AppContext } from '../../app-context.js';
import { UserError } from '../../discord/errors.js';
import type { MeetupParty } from '../../domain/party/party.js';
import { asDrawn } from '../../domain/party/timed.js';
import type { MeetupChange } from '../../domain/web/meetup-data.js';
import type { Member } from '../../services/attendance-service.js';
import {
  endAs,
  readTimes,
  renameAs,
  startAs,
  typedTimedTime,
  type TimedAnswer,
  type TimedChanging,
  type TimesRead,
} from '../parties/timed.js';
import { describeAs } from './info.js';
import { meetupChangeRefusal } from './meetup-changes.js';

/*
 * What may change of a meetup, and how, for the map's editor (`POST /api/meetups/<id>/<change>`
 * and `…/times`) and Manage… of its post (plan 8M-21) alike: the checks in the route's order,
 * before anything counts, then the commands' paths (`renameAs`, `describeAs`, `startAs`, `endAs`,
 * `setTimesAs`). Each caller words a refusal its own way (the map with its meetup, Discord with
 * Appeal… for a blocked maker).
 */

/** Why a change of a meetup was refused before anything counted. */
export type MeetupChangeRefused =
  | { reason: 'not-yours' | 'blocked' | 'changed-meanwhile' }
  /** A time the commands' reader could not take, in its words. */
  | { reason: 'unread'; text: string };

/** One change of a meetup with what it sets, and the value it was drawn from. */
export type MeetupChangeInput =
  | { change: 'name'; drawn: string; name: string }
  | { change: 'info'; drawn: string | null; info: string }
  | { change: 'start' | 'end'; drawn: number | null; time: string };

/** The value of a meetup a change is drawn from: its name, information, start or end. */
export function meetupDrawnOf(party: MeetupParty, change: MeetupChange): string | number | null {
  switch (change) {
    case 'name':
      return party.timed.name;
    case 'info':
      return party.meetup.description;
    case 'start':
      return party.timed.startTime;
    case 'end':
      return party.endTime;
  }
}

/**
 * The checks of one change, in the map's order: who may, by the one rule of every change of a
 * meetup, its text and its times alike (`meetupChangeRefusal`: its maker and staff, a blocked
 * maker refused; plan 8Z-2), whether it was drawn from what the meetup is now, and of a start a
 * time `/meet`'s guard cannot read. The start as read where it passes.
 */
export async function meetupChangeCheck(
  ctx: Pick<AppContext, 'meetupSafety' | 'config'>,
  serverId: string,
  party: MeetupParty,
  userId: string,
  staff: boolean,
  input: MeetupChangeInput,
  now: number,
): Promise<{ refused: MeetupChangeRefused } | { start: number | null }> {
  const refusal = await meetupChangeRefusal(ctx, serverId, party, userId, staff);
  if (refusal !== undefined) return { refused: { reason: refusal } };
  if (asDrawn(meetupDrawnOf(party, input.change), input.drawn) !== undefined) {
    return { refused: { reason: 'changed-meanwhile' } };
  }
  if (input.change !== 'start') return { start: null };
  try {
    const typed = typedTimedTime(ctx, party, 'meet', input.time, now);
    return { start: typed === 'unset' ? null : typed.at };
  } catch (err) {
    if (!(err instanceof UserError)) throw err;
    return { refused: { reason: 'unread', text: err.message } };
  }
}

/**
 * The checks of both times at once, in the map's order: who may (`meetupChangeRefusal`, as every
 * change of a meetup), both drawn values, and both read together (`readTimes`: unreadable or out
 * of order refused, nothing changed).
 */
export async function meetupTimesCheck(
  ctx: Pick<AppContext, 'meetupSafety' | 'config' | 'attendance'>,
  serverId: string,
  party: MeetupParty,
  userId: string,
  staff: boolean,
  times: {
    start: { drawn: number | null; time: string };
    end: { drawn: number | null; time: string };
  },
  now: number,
): Promise<{ refused: MeetupChangeRefused } | { read: TimesRead }> {
  const refusal = await meetupChangeRefusal(ctx, serverId, party, userId, staff);
  if (refusal !== undefined) return { refused: { reason: refusal } };
  if (
    asDrawn(party.timed.startTime, times.start.drawn) !== undefined ||
    asDrawn(party.endTime, times.end.drawn) !== undefined
  ) {
    return { refused: { reason: 'changed-meanwhile' } };
  }
  try {
    return {
      read: readTimes(ctx, party, { start: times.start.time, end: times.end.time }, now),
    };
  } catch (err) {
    if (!(err instanceof UserError)) throw err;
    return { refused: { reason: 'unread', text: err.message } };
  }
}

/**
 * One change as its command makes it, with the value drawn (`start` as `meetupChangeCheck` read
 * it), by the member, staff or not as the caller knows it (the times ask it again inside the
 * store). `/end`'s reader throws a `UserError` for a time it cannot read.
 */
export function meetupChangeAs(
  ctx: TimedChanging,
  serverId: string,
  party: MeetupParty,
  member: Member,
  staff: boolean,
  input: MeetupChangeInput,
  start: number | null,
  now: number,
): Promise<TimedAnswer> {
  switch (input.change) {
    case 'name':
      return renameAs(ctx, serverId, party, member, input.name, input.drawn);
    case 'info':
      return describeAs(ctx, serverId, party, member, input.info, input.drawn);
    case 'start':
      return startAs(ctx, serverId, party, { member, staff }, start, now, input.drawn);
    case 'end':
      return endAs(ctx, serverId, party, { member, staff }, input.time, now, input.drawn);
  }
}
