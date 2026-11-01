import type { FastifyReply } from 'fastify';
import { START_THROTTLE, type TimeAsked, type TimesRead } from '../commands/parties/timed.js';
import { CHANGE_THROTTLE } from '../commands/raids/change.js';
import { countedOnTheMap, givenBackOnTheMap, throttledOnTheMap } from './acting.js';
import type { WebDeps } from './server.js';

/** The window a start set with an end counts in: `/meet`'s in a timed party. */
const START_WINDOW = { command: 'meet', varies: true } as const;

/** The window an end set with a start counts in: `/end`'s. */
const END_WINDOW = { command: 'end' } as const;

/** The times asked, counted: the work to run in their windows, and what gives their uses back. */
export interface TimesCounted {
  /** Runs `work` so that an unexpected error gives each of the uses back. */
  run<T>(work: () => Promise<T>): Promise<T>;
  /** Gives back the uses of the times asked but those that went through (`went`). */
  givenBack(went?: readonly TimeAsked[]): void;
}

/**
 * Counts times read by `readTimes` for a train's Manage… and a meetup's editor on the map, each in
 * its own command's window: the answer sent where a window is full (nothing spent then), else what
 * runs them. A time that came to nothing costs nothing (`givenBack`).
 */
export function timesCountedOnTheMap(
  deps: WebDeps,
  reply: FastifyReply,
  userId: string,
  read: TimesRead,
): { full: FastifyReply } | TimesCounted {
  const countedAt = deps.now();
  const asksStart = read.start !== undefined;
  const asksEnd = read.end !== undefined;
  const giveBackStart = (): void => {
    givenBackOnTheMap(deps, START_WINDOW, userId, START_THROTTLE, countedAt);
  };
  if (asksStart) {
    const full = throttledOnTheMap(deps, reply, START_WINDOW, userId, START_THROTTLE);
    if (full) return { full };
  }
  if (asksEnd) {
    const full = throttledOnTheMap(deps, reply, END_WINDOW, userId, CHANGE_THROTTLE);
    if (full) {
      if (asksStart) giveBackStart();
      return { full };
    }
  }
  return {
    run: (work) => {
      const ended = asksEnd
        ? <T>(inner: () => Promise<T>) =>
            countedOnTheMap(deps, END_WINDOW, userId, CHANGE_THROTTLE, inner)
        : <T>(inner: () => Promise<T>) => inner();
      return asksStart
        ? countedOnTheMap(deps, START_WINDOW, userId, START_THROTTLE, () => ended(work))
        : ended(work);
    },
    givenBack: (went = []) => {
      if (asksStart && !went.includes('start')) giveBackStart();
      if (asksEnd && !went.includes('end')) {
        givenBackOnTheMap(deps, END_WINDOW, userId, CHANGE_THROTTLE, countedAt);
      }
    },
  };
}
