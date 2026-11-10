import { setMeetingTime } from './attendance.js';
import {
  attendeeOf,
  groupOf,
  refused,
  stampedGroup,
  type Change,
  type GroupId,
  type Party,
} from './party.js';

/*
 * The meeting times Meet… offers (plan 8X-1B, decisions 5 and 8): the game's in-game RSVP times of
 * a raid and the round clock times between them, as a choice, so that nobody types.
 */

const MINUTE = 60_000;

/**
 * The game offers to RSVP for a raid every this many minutes from its hatch. Assumed the same for
 * every tier and length of raid: Matt checks on a Wednesday evening whether raids of other
 * lengths offer other times (design, decision 5). The one place to change it.
 */
export const RSVP_STEP_MINUTES = 15;

/** The round clock times Meet… offers between the RSVP times: every this many minutes. */
const GRID_MINUTES = 5;

/** How far ahead Meet… offers round clock times: the next hour (decision 8). */
const GRID_AHEAD_MINUTES = 60;

/**
 * At most this many times Meet… offers (decision 8): a menu holds 25 options, and "No meeting
 * time" is one.
 */
export const MAX_MEET_TIMES = 24;

/**
 * What Meet… is drawn from of a battle: its kind and its times. A max battle (plan 8X-3, design
 * Q10) has no in-game RSVP times: it is offered the round clock times of the next hour alone.
 */
export interface MeetRaid {
  type?: string;
  hatchTime: number | null;
  endTime: number | null;
}

/**
 * The in-game RSVP times of a raid: its hatch, then every `RSVP_STEP_MINUTES` while it lasts
 * (before its end). None for a raid without times.
 */
export function rsvpTimes(raid: MeetRaid): number[] {
  const { hatchTime, endTime } = raid;
  if (raid.type === 'max' || hatchTime === null || endTime === null) return [];
  const times: number[] = [];
  for (let time = hatchTime; time < endTime; time += RSVP_STEP_MINUTES * MINUTE) times.push(time);
  return times;
}

/** A time Meet… offers: an in-game RSVP time (`rsvp`), the hatch among them (`hatch`). */
export interface MeetTime {
  at: number;
  rsvp: boolean;
  hatch?: true;
}

/**
 * The times Meet… offers now (decision 8), in time order: every in-game RSVP time to come
 * (`rsvpTimes`), and the round clock times every `GRID_MINUTES` of the next hour, all after
 * `now`, not before the hatch (a meeting time lies between the hatch and the end, as `/meet`'s)
 * and before the end; with `set`, the group's meeting time where it is still to come, also off
 * that grid (one set through `/meet`). At most `MAX_MEET_TIMES`: the latest round clock times go
 * first, then, where even the RSVP times are too many (a long raid), the latest of them; never
 * the one set. Empty for a raid without times or with no time left. A max battle (`type` max) has
 * the round clock times alone, up to its end (design Q10).
 */
export function meetTimes(raid: MeetRaid, now: number, set?: number): MeetTime[] {
  const { endTime } = raid;
  // A max battle is on from when it is reported: there is no hatch to wait for.
  const hatchTime = raid.type === 'max' ? -Infinity : raid.hatchTime;
  if (hatchTime === null || endTime === null) return [];
  const fits = (time: number): boolean => time > now && time >= hatchTime && time < endTime;
  const rsvp = rsvpTimes(raid).filter(fits);
  const step = GRID_MINUTES * MINUTE;
  const grid: number[] = [];
  for (
    let time = Math.ceil((now + 1) / step) * step;
    time <= now + GRID_AHEAD_MINUTES * MINUTE;
    time += step
  ) {
    if (fits(time) && !rsvp.includes(time) && time !== set) grid.push(time);
  }
  const kept = set !== undefined && fits(set) && !rsvp.includes(set) ? [set] : [];
  // Even the RSVP times may be too many (a long raid): the earliest stay, and the one set.
  const first = rsvp.slice(0, MAX_MEET_TIMES - kept.length);
  const shown =
    set !== undefined && rsvp.includes(set) && !first.includes(set)
      ? [...first.slice(0, -1), set]
      : first;
  const room = Math.max(0, MAX_MEET_TIMES - shown.length - kept.length);
  const times: MeetTime[] = [
    ...shown.map((time) => ({
      at: time,
      rsvp: true,
      ...(time === hatchTime ? { hatch: true as const } : {}),
    })),
    ...grid.slice(0, room).map((time) => ({ at: time, rsvp: false })),
    ...kept.map((time) => ({ at: time, rsvp: false })),
  ];
  return times.sort((a, b) => a.at - b.at);
}

/** The group Meet…'s dialog was drawn for: its letter and stamp (`groupStamp`). */
export interface MeetDrawn {
  group: GroupId;
  stamp: string;
}

/**
 * The Submit of Meet…'s dialog, decided inside the store (plan 8X-1B): the meeting time of the
 * member's own group while it is still the group the dialog was drawn for (a move or a group
 * opened again meanwhile: `group-changed`), and a time Meet… still offers now (else
 * `meeting-time-gone`; null removes it), as `/meet` sets it (`setMeetingTime`).
 */
export function setMeetingTimeAsDrawn<P extends Party>(
  party: P,
  memberId: string,
  drawn: MeetDrawn,
  time: number | null,
  now: number,
): Change<P, { group: GroupId; others: string[] }> {
  const attendee = attendeeOf(party, memberId);
  if (!attendee) return refused('not-attending');
  if (attendee.group !== drawn.group || !stampedGroup(party, drawn.group, drawn.stamp)) {
    return refused('group-changed');
  }
  const set = groupOf(party, drawn.group)?.startTime;
  if (time !== null && !meetTimes(party, now, set).some((offered) => offered.at === time)) {
    return refused('meeting-time-gone');
  }
  return setMeetingTime(party, memberId, time);
}
