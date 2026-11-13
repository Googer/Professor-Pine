import type { Settings } from '../../config/settings.js';
import { parseClockInput, parseRelativeMinutes, type ClockInput } from './clock-input.js';
import { addDays, localTime, zoned } from './zoned.js';

export type TimeParameter = 'hatch' | 'meet' | 'end';
export type TimedPartyType = 'raid' | 'train' | 'meetup';
export type RaidKind = 'standard' | 'elite';

export type TimeSettings = Pick<
  Settings,
  | 'standardRaidIncubateDuration'
  | 'standardRaidHatchedDuration'
  | 'eliteRaidIncubateDuration'
  | 'eliteRaidHatchedDuration'
  | 'maxMeetupLeadupDuration'
  | 'maximumMeetupLeadtime'
>;

/** The times of an existing party, in epoch milliseconds. A null column is the same as omitted. */
export interface PartyTimes {
  creationTime: number;
  hatchTime?: number | null;
  endTime?: number | null;
  /** Meeting time of a train or meetup. */
  startTime?: number | null;
  /** Minutes a hatched raid lasts, when set by hand for this raid. Zero or null means not set. */
  hatchedDuration?: number | null;
}

export interface PartyTimeRequest {
  /** What the member typed. */
  text: string;
  /** Epoch milliseconds. */
  now: number;
  /** IANA zone that wall-clock times are read in (settings.timezone). */
  zone: string;
  parameter: TimeParameter;
  partyType: TimedPartyType;
  raidKind: RaidKind;
  /** Omitted while a raid is being created. */
  party?: PartyTimes;
  settings: TimeSettings;
  /**
   * The durations in effect for this raid when they differ from the configured ones (a Raid Hour
   * or Raid Day; see `longestRaidDurations`). A duration set by hand for the raid still wins.
   */
  durations?: { incubation: number; hatched: number };
}

export type PartyTimeResult =
  /**
   * `relative`: read as a span from now (`in 30`), a moment wherever it is used, never a
   * wall-clock time (fix round 1, M2).
   */
  | { kind: 'time'; at: number; relative?: true }
  /** The member asked to clear the time ("unset", "cancel", "none"). */
  | { kind: 'unset' }
  | { kind: 'unparseable' }
  /**
   * `read` is set for a clock time that was typed without a date for a train or meetup: the
   * moment it was first taken for (its day is the day the text was read on), so that a refusal
   * can say so.
   */
  | { kind: 'out-of-range'; first: number; last: number; read?: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/**
 * An end of a train or meetup that was typed without a date is read as the day after only when
 * that is no later than this many hours after the start (or after now).
 */
const NEXT_DAY_END_HOURS = 12;
const UNSET_WORDS = ['unset', 'cancel', 'none'];
const HATCH_WORDS = ['hatch', 'start'];

interface Window {
  first: number;
  last: number;
  /** A relative duration must be shorter than this many minutes. */
  maxMinutes: number;
}

function raidDurations(request: PartyTimeRequest): { incubation: number; hatched: number } {
  const { settings, raidKind, party } = request;
  const byKind =
    request.durations ??
    {
      standard: {
        incubation: settings.standardRaidIncubateDuration,
        hatched: settings.standardRaidHatchedDuration,
      },
      elite: {
        incubation: settings.eliteRaidIncubateDuration,
        hatched: settings.eliteRaidHatchedDuration,
      },
    }[raidKind];
  // Legacy tested `!!party.duration`, so a hand-set duration of zero means "not set".
  const byHand = party?.hatchedDuration;
  return { incubation: byKind.incubation, hatched: byHand ? byHand : byKind.hatched };
}

function plusDays(time: number, days: number, zone: string): number {
  return addDays(zoned(time, zone), days).epochMilliseconds;
}

/** The earliest and latest time valid for this parameter of this party. */
function timeWindow(request: PartyTimeRequest): Window {
  const { now, zone, parameter, partyType, party, settings } = request;
  const { incubation, hatched } = raidDurations(request);
  const creation = party?.creationTime ?? now;
  const timed = partyType !== 'raid';

  if (parameter === 'hatch') {
    return {
      first: now - hatched * MINUTE,
      last: creation + incubation * MINUTE,
      maxMinutes: incubation,
    };
  }

  if (parameter === 'end') {
    if (timed) {
      // A train or meetup cannot end before it starts, nor in the past.
      const days = settings.maximumMeetupLeadtime + 1;
      return {
        first: Math.max(now, party?.startTime ?? now),
        last: plusDays(creation, days, zone),
        maxMinutes: days * 1440,
      };
    }
    const total = incubation + hatched;
    return { first: now, last: creation + total * MINUTE, maxMinutes: total };
  }

  // Meeting time.
  if (timed) {
    // From now on, not from when the party was made (as the legacy bot had it): a start that is
    // typed is a start to come, and the first reading that fits must not be one in the past.
    const max = settings.maxMeetupLeadupDuration;
    return { first: now, last: creation + max * MINUTE, maxMinutes: max };
  }
  const total = incubation + hatched;
  return {
    first: Math.max(now, party?.hatchTime ?? now),
    last: party?.endTime ?? creation + total * MINUTE,
    maxMinutes: total,
  };
}

/**
 * Every moment a typed clock time could mean, most likely first. Standard raids, whose windows
 * are under two hours, also get tomorrow's guesses (so 12:10 at 23:50 means ten past midnight),
 * yesterday's (so 11:50pm at 00:10 means twenty minutes ago) and "12:xx" read as "00:xx". An
 * elite raid has a window of hours or days, where a time that has already passed
 * today must stay out of range rather than silently become tomorrow's, so those get exactly the
 * legacy bot's candidates: today, next year, and the afternoon variants.
 *
 * A train or meetup is planned ahead, and its times are typed on other days than they mean. A
 * time without a date is read on the day of the start while that day is today or still to come,
 * otherwise on the day of the end while that one is, otherwise today (`timedReference`); and it
 * also has the readings of the day after (a meetup that starts at 22:00
 * ends at "1am" the next day; a start typed after its hour has passed today means tomorrow).
 * The first reading inside the window wins, and the window never reaches into the past.
 *
 * Two things keep that from guessing too far. A start of 1 to 6 o'clock without "am" or "pm"
 * is the afternoon before it is the night: nobody plans a meetup for one in the morning by
 * typing "1". And an end is put on the day after only when that is within half a day of the
 * start (or of now): "1pm" for a party that starts at three is a mistake, not tomorrow.
 */
function candidates(clock: ClockInput, request: PartyTimeRequest, reference?: number): number[] {
  const { zone, parameter, partyType, raidKind } = request;
  const now = zoned(request.now, zone);
  const hasDate = clock.month !== undefined && clock.day !== undefined;
  const standardRaid = partyType === 'raid' && raidKind === 'standard';
  const timed = partyType !== 'raid';

  // A date-less meeting time, or end time of a train or meetup, falls on the reference day; for
  // a train or meetup only while that day has not passed. "Tomorrow" is the day after today.
  const tomorrow = clock.tomorrow === true;
  const useReference =
    !hasDate &&
    !tomorrow &&
    reference !== undefined &&
    (parameter === 'meet' || (parameter === 'end' && timed)) &&
    (!timed ||
      zoned(reference, zone).startOfDay().epochMilliseconds >= now.startOfDay().epochMilliseconds);
  const day = useReference ? zoned(reference, zone) : now;

  // The day is moved before the wall-clock time is built, so a time that exists tomorrow but not
  // today (the hour skipped by spring-forward) is not shifted first. Nothing for a date that does
  // not exist (February 30, or February 29 a year on). A time in the repeated hour of the fall
  // takes now's offset where it can: after the clocks fell back, "1:30am" is the second 01:30.
  // The word "midnight" is the end of the day it names (the next day's 00:00); "12am" its start.
  const endOfDay = clock.endOfDay === true ? 1 : 0;
  const build = (hour: number, years = 0, days = 0): number | undefined => {
    const midnight = localTime(
      {
        year: day.year + years,
        month: clock.month ?? day.month,
        day: clock.day ?? day.day,
      },
      zone,
    );
    if (!midnight) return undefined;
    const date = addDays(midnight, days + endOfDay);
    return localTime(
      { year: date.year, month: date.month, day: date.day, hour, minute: clock.minute },
      zone,
      now.offset,
    )?.epochMilliseconds;
  };

  const afternoon = !clock.hasMeridiem && clock.hour < 12 ? clock.hour + 12 : undefined;
  const midnight = standardRaid && !clock.hasMeridiem && clock.hour === 12 ? 0 : undefined;

  // "Tomorrow 6pm": that day alone, for every kind; whether the party can have it is the
  // window's to say (a raid's meeting only when the raid lasts past midnight).
  if (tomorrow) {
    const afternoonFirst = timed && parameter === 'meet' && clock.hour >= 1 && clock.hour <= 6;
    const hours =
      afternoon === undefined
        ? [clock.hour]
        : afternoonFirst
          ? [afternoon, clock.hour]
          : [clock.hour, afternoon];
    if (midnight !== undefined) hours.push(midnight);
    return hours.map((hour) => build(hour, 0, 1)).filter((time) => time !== undefined);
  }

  if (timed) {
    const afternoonFirst = parameter === 'meet' && clock.hour >= 1 && clock.hour <= 6;
    const hours =
      afternoon === undefined
        ? [clock.hour]
        : afternoonFirst
          ? [afternoon, clock.hour]
          : [clock.hour, afternoon];
    const millis = (times: (number | undefined)[]): number[] =>
      times.filter((time) => time !== undefined);
    // With a date: that day, this year or the next.
    if (hasDate) return millis(hours.flatMap((hour) => [build(hour), build(hour, 1)]));
    // Without: the day itself, then the day after; a year ahead is never within the window.
    const sameDay = millis(hours.map((hour) => build(hour)));
    const nextDay = millis(hours.map((hour) => build(hour, 0, 1)));
    if (parameter !== 'end') return [...sameDay, ...nextDay];
    const from = Math.max(request.now, request.party?.startTime ?? request.now);
    return [...sameDay, ...nextDay.filter((time) => time <= from + NEXT_DAY_END_HOURS * HOUR)];
  }

  const all = [build(clock.hour), build(clock.hour, 1)];
  if (afternoon !== undefined) all.push(build(afternoon), build(afternoon, 1));
  if (standardRaid && !hasDate) {
    all.push(build(clock.hour, 0, 1));
    if (afternoon !== undefined) all.push(build(afternoon, 0, 1));
  }
  if (midnight !== undefined) {
    all.push(build(midnight));
    if (!hasDate) all.push(build(midnight, 0, 1));
  }
  // Just after midnight, a hatch a few minutes ago can be on yesterday's evening (00:10, "11:50pm").
  if (standardRaid && !hasDate) {
    all.push(build(clock.hour, 0, -1));
    if (afternoon !== undefined) all.push(build(afternoon, 0, -1));
  }
  return all.filter((time) => time !== undefined);
}

/**
 * The time whose day a train or meetup reads a date-less time on: the first of its start and its
 * end whose day, in `zone`, is today or still to come; undefined (today) when neither is. With
 * the start alone, a meetup that has only an end on Saturday would have "10pm" typed on a
 * Tuesday read as that Tuesday, and be archived days before it takes place.
 */
function timedReference(request: PartyTimeRequest): number | undefined {
  const { zone, party } = request;
  const today = zoned(request.now, zone).startOfDay().epochMilliseconds;
  return [party?.startTime, party?.endTime].find(
    (time): time is number =>
      typeof time === 'number' && zoned(time, zone).startOfDay().epochMilliseconds >= today,
  );
}

/**
 * Turns what a member typed for a hatch, end or meeting time into a moment inside the window
 * valid for that party. Port of the legacy `time` argument type.
 */
export function resolvePartyTime(request: PartyTimeRequest): PartyTimeResult {
  const { now, zone, partyType, party } = request;
  const window = timeWindow(request);
  const timed = partyType !== 'raid';
  let text = request.text.trim();
  let mode: 'auto' | 'relative' | 'absolute' = 'auto';
  let clock: ClockInput | undefined;

  if (/^in/i.test(text)) {
    text = text.slice(2).trim();
    mode = 'relative';
  } else if (typeof party?.hatchTime === 'number' && HATCH_WORDS.includes(text.toLowerCase())) {
    const hatch = zoned(party.hatchTime, zone);
    clock = { hour: hatch.hour, minute: hatch.minute, hasMeridiem: true };
    mode = 'absolute';
  } else if (UNSET_WORDS.includes(text.toLowerCase())) {
    return { kind: 'unset' };
  } else if (timed) {
    // Legacy forced absolute mode here without stripping "at"; moment then skipped the word.
    text = text.replace(/^at\s*/i, '');
    mode = 'absolute';
  } else {
    const absolute = /^at(.*)|(.*[ap]m?)$/i.exec(text);
    if (absolute) {
      text = (absolute[1] ?? absolute[2] ?? '').trim();
      mode = 'absolute';
    }
  }

  const possible: number[] = [];
  let relativeAt: number | undefined;
  let tooLong = false;
  let read: number | undefined;
  if (mode !== 'absolute') {
    const minutes = parseRelativeMinutes(text);
    if (minutes !== undefined && minutes < window.maxMinutes) {
      // Times are kept by the whole minute, and "in 1" means at least a full minute from now
      // (Matt, 2026-10-12): rounded up, unless that would leave the window. The exact time is
      // kept to the whole millisecond below it (hours as "0.9999999h" give fractions), as
      // every time is: `zoned` takes no fraction.
      const exact = Math.floor(now + minutes * MINUTE);
      const rounded = Math.ceil(exact / MINUTE) * MINUTE;
      relativeAt = rounded <= window.last ? rounded : exact;
      possible.push(relativeAt);
    } else if (minutes !== undefined) {
      tooLong = true;
    }
  }
  if (mode !== 'relative') {
    clock ??= parseClockInput(text);
    if (clock) {
      const reference = timed ? timedReference(request) : (party?.hatchTime ?? undefined);
      const readings = candidates(clock, request, reference);
      // Not for "tomorrow": the refusal's "give the date first" would not fit it.
      if (timed && clock.month === undefined && clock.day === undefined && !clock.tomorrow) {
        read = readings[0];
      }
      possible.push(...readings);
    }
  }

  if (possible.length === 0) {
    // A well-formed duration that is too long is out of range, not gibberish.
    return tooLong
      ? { kind: 'out-of-range', first: window.first, last: window.last }
      : { kind: 'unparseable' };
  }
  const match = possible.find((time) => time >= window.first && time <= window.last);
  if (match !== undefined) {
    return match === relativeAt
      ? { kind: 'time', at: match, relative: true }
      : { kind: 'time', at: match };
  }
  return {
    kind: 'out-of-range',
    first: window.first,
    last: window.last,
    ...(read === undefined ? {} : { read }),
  };
}
