import { partyWord, type TimedParty } from '../domain/party/party.js';
import { startTimeOf, timedOver } from '../domain/party/timed.js';
import { sameDay, zoned } from '../domain/time/zoned.js';
import type { PostEmoji } from './party-post.js';
import { timestamp } from './text.js';

const MINUTE = 60_000;

/** The colour of the post of a timed party that is not over: none of the colours of a raid. */
export const TIMED_COLOUR = 0x3498db;

/** What the post of a timed party (a meetup, a train) is rendered from, whatever its kind. */
export interface TimedPostView<P extends TimedParty = TimedParty> {
  party: P;
  now: number;
  /** IANA zone in which "today" is judged (`settings.timezone`). */
  zone: string;
  /**
   * When the clean-up archives a timed party: `graceMinutes` after its last possible moment the
   * warning is said (`settings.deletionGraceTime`), and `warningMinutes` after the warning the
   * post is archived (`settings.trainOrMeetupDeletionWarningTime`).
   */
  archiving: { graceMinutes: number; warningMinutes: number };
  /**
   * Set for the last showing of a party that staff closed (`/delete`): the sentence that says
   * so. It stands in the place of the times, and the post is shown as ended whatever the clock
   * says.
   */
  closed?: string;
  emoji: PostEmoji;
  /** The size of the party's groups, where it has one, and when one splits up (`TrainersView`). */
  lobbySize?: number | undefined;
  splitLobby?: number | null | undefined;
}

/**
 * Whether the post shows the party as over: its end time has passed, or the party has ended
 * (this is then the last showing before the post is archived, also of a party without an end
 * time whose day ran out: an archived post must not look as if it were still going on).
 */
export function shownAsOver(party: TimedParty, now: number): boolean {
  return party.status === 'ended' || timedOver(party, now);
}

/**
 * When a timed party starts and ends. A clock time does not say which day it is, and such a
 * party is often planned days ahead, so a time that is not today (in `zone`) is shown with its
 * weekday and date. The scheduler shows every post anew at midnight.
 *
 * A party without any time says what follows from that: the clean-up gives it a day, and the
 * post says when it is archived: the time of the archiving itself once it is scheduled
 * (`deletionTime`), and before that the earliest it can be, the end of that day
 * (`lastPossibleTime`) with the grace and the warning time after it. The clock runs in steps,
 * so that moment can pass before the archiving is scheduled or done: a moment that has passed
 * is never shown, the post says "soon" then.
 */
export function describeTimes(view: TimedPostView): string {
  const { party, now, zone } = view;
  const start = startTimeOf(party);
  const end = party.endTime;
  const today = zoned(now, zone);
  const at = (time: number): string =>
    timestamp(time, sameDay(today, zoned(time, zone)) ? 't' : 'F');
  if (shownAsOver(party, now)) {
    return end === null ? `This ${partyWord(party)} is over.` : `Ended at ${timestamp(end, 'F')}.`;
  }
  if (start === null && end === null) {
    const { graceMinutes, warningMinutes } = view.archiving;
    const archived =
      party.deletionTime ??
      (party.lastPossibleTime === null
        ? null
        : party.lastPossibleTime + (graceMinutes + warningMinutes) * MINUTE);
    return (
      `No time has been set yet: ${party.type === 'train' ? 'Manage… or `/meet`' : '`/meet`'} sets the start.` +
      (party.saved || archived === null
        ? ''
        : ` Without one this post is archived ${archived > now ? timestamp(archived, 'R') : 'soon'}.`)
    );
  }
  const parts: string[] = [];
  const started = start !== null && now >= start;
  if (start !== null) {
    if (!started) parts.push(`Starts ${timestamp(start, 'R')}, at ${at(start)}.`);
    // What is counted down to is said first in its sentence: once it has started, the end.
    else if (end !== null) parts.push(`Started at ${at(start)}.`);
    else parts.push(`Started ${timestamp(start, 'R')}, at ${at(start)}.`);
  }
  if (end !== null) {
    parts.push(
      start !== null && !started
        ? `Ends at ${at(end)}.`
        : `Ends ${timestamp(end, 'R')}, at ${at(end)}.`,
    );
  }
  return parts.join(' ');
}
