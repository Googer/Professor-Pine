import { commandRefusal, variedThrottleKey } from '../../discord/router.js';
import { waitText, type Throttle, type Throttles } from '../../discord/throttle.js';
import { CHANGE_THROTTLE } from '../raids/change.js';
import type { RaidChange } from '../../domain/web/raid-options-data.js';
import type { MeetupChange } from '../../domain/web/meetup-data.js';
import { START_THROTTLE, type TimeAsked, type TimesRead } from './timed.js';

/*
 * The windows of commands a change of a party counts in, wherever it is made: the live map's
 * routes and the Manage… dialogs of the posts (review M1 of 2026-11-07: Discord and the web count
 * alike). Each change counts in its command's window, as the command typed would.
 */

/** A command's window: its name, its limit, and whether the router counts that limit apart. */
export interface CommandWindow {
  command: string;
  throttle: Throttle;
  /** The command's limit depends on where it is used (`/meet`): `variedThrottleKey`. */
  varies?: true;
}

/** The router's key of a command's window. */
export function windowKey(window: CommandWindow): string {
  return window.varies ? variedThrottleKey(window.command, window.throttle) : window.command;
}

/** The window of `/meet` in a timed party: a start. */
export const MEET_WINDOW_OF: CommandWindow = {
  command: 'meet',
  throttle: START_THROTTLE,
  varies: true,
};

/** The window of `/end`: an end. */
export const END_WINDOW_OF: CommandWindow = { command: 'end', throttle: CHANGE_THROTTLE };

/** The window of each change of a raid: its command's (`/hatch`, `/end`, `/boss`, `/moveset`). */
export function raidChangeWindow(change: RaidChange): CommandWindow {
  return { command: change === 'moves' ? 'moveset' : change, throttle: CHANGE_THROTTLE };
}

/** The window of each change of a meetup: `/name`, `/info`, `/end`, and a start `/meet`'s. */
export function meetupChangeWindow(change: MeetupChange): CommandWindow {
  return change === 'start' ? MEET_WINDOW_OF : { command: change, throttle: CHANGE_THROTTLE };
}

/** A use counted in a window: what gives it back, to the window it was counted in. */
export interface CountedUse {
  giveBack(now: number): void;
}

/**
 * Counts a use of the member in `window` at `now`: what gives it back, or how long they wait and
 * what they are told then, in the command's words (`You can use /hatch again in 40 seconds.`).
 */
export function countUse(
  throttles: Throttles,
  window: CommandWindow,
  userId: string,
  now: number,
): CountedUse | { wait: number; refusal: string } {
  const key = windowKey(window);
  const wait = throttles.use(key, userId, window.throttle, now);
  if (wait !== undefined) {
    return { wait, refusal: commandRefusal(window.command, waitText(wait)) };
  }
  return {
    giveBack: (at) => {
      throttles.giveBack(key, userId, window.throttle, at, now);
    },
  };
}

/** The times asked, counted: what gives their uses back but those that went through. */
export interface TimesCounted {
  givenBack(now: number, went?: readonly TimeAsked[]): void;
}

/**
 * Counts times read by `readTimes` (a train's Manage…, a meetup's editor and Manage…), each in its
 * own command's window, the start in `/meet`'s and the end in `/end`'s: where a window is full,
 * nothing is spent and the full one is said, else what gives the uses back.
 */
export function countTimes(
  throttles: Throttles,
  userId: string,
  read: TimesRead,
  now: number,
): TimesCounted | { wait: number; refusal: string; window: CommandWindow } {
  const start =
    read.start === undefined ? undefined : countUse(throttles, MEET_WINDOW_OF, userId, now);
  if (start !== undefined && 'wait' in start) return { ...start, window: MEET_WINDOW_OF };
  const end = read.end === undefined ? undefined : countUse(throttles, END_WINDOW_OF, userId, now);
  if (end !== undefined && 'wait' in end) {
    start?.giveBack(now);
    return { ...end, window: END_WINDOW_OF };
  }
  return {
    givenBack: (at, went = []) => {
      if (!went.includes('start')) start?.giveBack(at);
      if (!went.includes('end')) end?.giveBack(at);
    },
  };
}
