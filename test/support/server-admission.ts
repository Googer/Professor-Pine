import type { StoredServerRecord } from '../../src/db/repositories/server-record-repository.js';
import type { Logger } from '../../src/log.js';
import { ServerAdmission, type ServerExits } from '../../src/services/server-admission.js';
import { standingsWith } from './server-standings.js';
import { createTestLogger } from './test-logger.js';

/**
 * What Pine says to the servers it refuses and which it leaves (plan 19C-1), recorded: `said`
 * the messages in a system channel, `left` the servers left; `noChannel` servers have no system
 * channel Pine may write in; `failLeave` makes every leave reject; `gone` servers Discord answers
 * Unknown Guild for (`'gone'`: Pine is not in them).
 */
export class RecordingExits implements ServerExits {
  readonly said: { serverId: string; text: string }[] = [];
  readonly left: string[] = [];
  readonly noChannel = new Set<string>();
  readonly gone = new Set<string>();
  failLeave: Error | undefined;
  /** How many leaves to come fail (Discord away for a while), besides `failLeave`. */
  failLeaves = 0;
  /** Every leave asked, those that failed included. */
  readonly leavesAsked: string[] = [];

  tell(serverId: string, text: string): Promise<boolean> {
    if (this.noChannel.has(serverId)) return Promise.resolve(false);
    this.said.push({ serverId, text });
    return Promise.resolve(true);
  }

  leave(serverId: string): Promise<'left' | 'gone'> {
    this.leavesAsked.push(serverId);
    if (this.gone.has(serverId)) return Promise.resolve('gone');
    if (this.failLeave) return Promise.reject(this.failLeave);
    if (this.failLeaves > 0) {
      this.failLeaves -= 1;
      return Promise.reject(new Error('Discord is away'));
    }
    this.left.push(serverId);
    return Promise.resolve('left');
  }
}

/**
 * The waits between tries of a leave (plan 19C-1, J8), recorded and over at once: `waited` the
 * lengths asked, in order.
 */
export function recordedWaits(): { waited: number[]; wait: (ms: number) => Promise<void> } {
  const waited: number[] = [];
  return {
    waited,
    wait: (ms) => {
      waited.push(ms);
      return Promise.resolve();
    },
  };
}

/**
 * A real `ServerAdmission` over `standingsWith` (the servers of `recorded` recorded, by default
 * the test server and the second one) and `RecordingExits`; Pine is in the servers of `present`
 * (by default the recorded ones) unless it left them. Its waits between tries of a leave are over
 * at once, their lengths in `waited`.
 */
export function admissionWith(
  options: {
    recorded?: readonly string[];
    rows?: readonly StoredServerRecord[];
    present?: readonly string[];
    log?: Logger;
    now?: () => number;
  } = {},
) {
  const log = options.log ?? createTestLogger().log;
  const { standings, store } = standingsWith({
    ...(options.recorded === undefined ? {} : { recorded: options.recorded }),
    ...(options.rows === undefined ? {} : { rows: options.rows }),
    log,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const present = new Set(options.present ?? store.guilds);
  const exits = new RecordingExits();
  const waits = recordedWaits();
  const admission = new ServerAdmission({
    standings,
    exits,
    recorded: () => Promise.resolve([...store.guilds]),
    inServer: (serverId) => present.has(serverId) && !standings.isLeft(serverId),
    // Its shard names it present (plan 19C-2): one of `present`.
    isPresent: (serverId) => present.has(serverId),
    wait: waits.wait,
    log,
  });
  return { admission, standings, store, exits, present, waited: waits.waited };
}
