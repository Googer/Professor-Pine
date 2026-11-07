import { shortDateWords, shortDayWords, shortHourWords, zoned } from '../time/zoned.js';
import { isTimed, isTrain, type Party, type TimedParty } from './party.js';
import { startTimeOf, timedOver } from './timed.js';

/*
 * The trains and meetups planned during an event of the events forum (follow-ups, 8V-1: "an
 * event's trains and meetups in its line or post"; Matt, 2026-11-07): the one rule of which
 * parties count for an event, for the event's post and its line in the listing alike.
 */

/** An event's hours, as the listing has them: from `start` up to `end`. */
export interface EventHours {
  start: number;
  end: number;
}

/**
 * The trains and meetups of a server (`guildId`, its row) planned during an event: active, with
 * a post, not over by the clock (`timedOver`), whose start falls within the event's hours (its
 * start included, its end not), in every region of the server; by start, then as they were made.
 * A party without a start or a post yet counts once it has them.
 */
export function plannedDuring(
  parties: readonly Party[],
  guildId: number,
  hours: EventHours,
  now: number,
): TimedParty[] {
  return parties
    .filter(isTimed)
    .filter((party) => {
      const start = startTimeOf(party);
      return (
        party.guildId === guildId &&
        party.status === 'active' &&
        party.forumPostId !== null &&
        !timedOver(party, now) &&
        start !== null &&
        start >= hours.start &&
        start < hours.end
      );
    })
    .sort(
      (a, b) =>
        (startTimeOf(a) ?? 0) - (startTimeOf(b) ?? 0) ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    );
}

/**
 * Whether a stored change can change what `plannedDuring` makes of a party, so that the events
 * forum draws again: a train or meetup made, or one whose life, server, region, post, start or end
 * changed (a move to another region is an end and a making). A raid's or a max battle's changes,
 * and a timed party's of anything else (who comes, its name: its post's link shows the title),
 * are none.
 */
export function changesPlanned(before: Party | undefined, after: Party): boolean {
  if (!isTimed(after)) return false;
  if (before === undefined || !isTimed(before)) return true;
  return (
    before.status !== after.status ||
    before.guildId !== after.guildId ||
    before.regionId !== after.regionId ||
    before.forumChannelId !== after.forumChannelId ||
    before.forumPostId !== after.forumPostId ||
    before.endTime !== after.endTime ||
    startTimeOf(before) !== startTimeOf(after)
  );
}

/** How many trains and meetups an event has planned. */
export interface PlannedCounts {
  trains: number;
  meetups: number;
}

/** The trains and the meetups among `parties`, counted. */
export function plannedCounts(parties: readonly TimedParty[]): PlannedCounts {
  const trains = parties.filter(isTrain).length;
  return { trains, meetups: parties.length - trains };
}

/**
 * A party's start as the events forum says times (plain local text, never Discord's stamps,
 * ruling A of plan 8V-1): "Sat, Nov 21, 2 PM".
 */
export function partyStartWords(start: number, zone: string): string {
  const time = zoned(start, zone);
  const { hour, half } = shortHourWords(time);
  return `${shortDayWords(time)}, ${shortDateWords(time)}, ${hour} ${half}`;
}
