import type { FastifyReply } from 'fastify';
import { countTimes } from '../commands/parties/windows.js';
import type { TimeAsked, TimesRead } from '../commands/parties/timed.js';
import { UserError } from '../discord/errors.js';
import { waitText } from '../discord/throttle.js';
import type { WebDeps } from './server.js';

/** The times asked, counted: the work to run in their windows, and what gives their uses back. */
export interface TimesCounted {
  /** Runs `work` so that an unexpected error gives each of the uses back. */
  run<T>(work: () => Promise<T>): Promise<T>;
  /** Gives back the uses of the times asked but those that went through (`went`). */
  givenBack(went?: readonly TimeAsked[]): void;
}

/**
 * Counts times read by `readTimes` for a train's Manage… and a meetup's editor on the map, each in
 * its own command's window (`countTimes`, which the post's Manage… counts with too): the answer
 * sent where a window is full (nothing spent then), else what runs them. A time that came to
 * nothing costs nothing (`givenBack`).
 */
export function timesCountedOnTheMap(
  deps: WebDeps,
  reply: FastifyReply,
  userId: string,
  read: TimesRead,
): { full: FastifyReply } | TimesCounted {
  const counted = countTimes(deps.parties.throttles, userId, read, deps.now());
  if ('wait' in counted) {
    // No command named, as the member typed none (Matt, 2026-10-30).
    const error = `You can do that again in ${waitText(counted.wait)}.`;
    return { full: reply.code(429).header('retry-after', String(counted.wait)).send({ error }) };
  }
  return {
    run: async (work) => {
      try {
        return await work();
      } catch (err) {
        if (!(err instanceof UserError) || err.givesBack) counted.givenBack(deps.now());
        throw err;
      }
    },
    givenBack: (went) => {
      counted.givenBack(deps.now(), went);
    },
  };
}
