import { BoundedMap } from '../bounded-map.js';
import type { EveryShardReady } from '../discord/shard-readiness.js';
import type { Logger } from '../log.js';
import { PRIVATE_INSTANCE_TEXT } from '../render/server-admission.js';
import type { ServerStandings } from './server-standings.js';

/** What Pine does to a server it refuses (`DiscordServerExits`; a fake in tests). */
export interface ServerExits {
  /**
   * Posts plain text in the server's system channel, only where it has one and Pine may view it
   * and send there; whether it did. Never a DM to anyone.
   */
  tell(serverId: string, text: string): Promise<boolean>;
  /**
   * Pine leaves the server: `left`, or `gone` where Discord says Pine is not in it (Unknown Guild:
   * it was left already, or removed while nothing said so). Any other failure is thrown.
   */
  leave(serverId: string): Promise<'left' | 'gone'>;
}

export interface ServerAdmissionOptions {
  standings: Pick<ServerStandings, 'mayHave' | 'isLeft' | 'markLeft' | 'cameBack'>;
  /**
   * How a server is told and left; none in rehearsal mode, which posts nothing outside the
   * rehearsed posts and leaves no server (`operations.md`): a refusal is only logged there.
   */
  exits: ServerExits | undefined;
  /**
   * The servers Pine was in: those with a `Guild` row (`GuildRepository.snowflakes`, a whole read
   * of one row per server, bounded small by nature).
   */
  recorded: () => Promise<readonly string[]>;
  /** Whether Pine is in a server now (the client's servers, those it left not among them). */
  inServer: (serverId: string) => boolean;
  /**
   * A server a new install waits on (`ServerAdoption.undecided`: down at its first start, its
   * owner not known yet): neither refused nor marked until it is decided.
   */
  undecided?: (serverId: string) => boolean;
  /** The waits before each further try of a leave that failed (`LEAVE_RETRY_MS` unless given). */
  leaveRetryMs?: readonly number[];
  /** How a wait between tries is waited (an unref'd timer unless given: tests record them). */
  wait?: (ms: number) => Promise<void>;
  log: Logger;
}

/**
 * The waits before each further try of a leave that failed (J8): a minute, five, thirty; then
 * the next ready asks again.
 */
export const LEAVE_RETRY_MS: readonly number[] = [60_000, 5 * 60_000, 30 * 60_000];

/**
 * How many servers are remembered as told that this Pine is private (oldest out; one forgotten
 * is told again, which costs a line in its system channel).
 */
const TOLD_SERVERS = 10_000;

/** A wait that keeps no process alive (a shutdown does not wait for a leave's next try). */
function waitUnref(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

/**
 * Who is in (plan 19C-1; spec "Joining, the setup state, leaving"): a server that may not have
 * this Pine (`ServerStandings.mayHave`) is told once while the bot runs, in its system channel
 * where Pine may write there, that this Pine is private and how to run one's own, and Pine leaves
 * it (`refuse`); its
 * fill, its rows and its interactions are never begun (`admits`, `wireServerStart`). Asked on
 * joining (`GuildCreate`, before the fill) and once every shard is ready (`everyShardReady`, the
 * servers present by `ShardReadiness`, never the cache), since a server can add or remove Pine
 * while it is down and Discord says nothing of it afterwards: then also every server Pine was in
 * that no shard names (gone, not merely unavailable) is marked left, and a present one marked left
 * is so no more.
 */
export class ServerAdmission {
  /** The servers being refused now: each told and left once at a time. */
  private readonly refusing = new Map<string, Promise<void>>();
  /** The servers told that this Pine is private while the bot runs: each is told once. */
  private readonly told = new BoundedMap<string, true>(TOLD_SERVERS);

  constructor(private readonly options: ServerAdmissionOptions) {}

  /** Whether the server may have this Pine. */
  admits(serverId: string): boolean {
    return this.options.standings.mayHave(serverId);
  }

  /**
   * Tells the server that this Pine is private, where it may and once while the bot runs, and
   * leaves it, a leave that fails tried again (`LEAVE_RETRY_MS`, J8) while the server may still
   * not have this Pine (an operator may allow it meanwhile); then it is marked left (where Pine
   * had it: a `Guild` row). Logged with the server's id. Once at a time per server (a join and a
   * ready meet); returns at once, never throws.
   */
  refuse(serverId: string): void {
    if (this.refusing.has(serverId)) return;
    const { exits, log } = this.options;
    if (exits === undefined) {
      log.warn(
        { server: serverId },
        'a server may not have this Pine: rehearsal mode neither tells nor leaves it',
      );
      return;
    }
    this.track(serverId, async () => {
      // Once while the bot runs (a server whose staff add Pine again is not told again).
      let told = this.told.has(serverId);
      if (!told) {
        try {
          told = await exits.tell(serverId, PRIVATE_INSTANCE_TEXT);
          if (told) this.told.set(serverId, true);
        } catch (err) {
          log.warn({ err, server: serverId }, 'could not tell a server that this Pine is private');
        }
      }
      await this.leaveTrying(
        exits,
        serverId,
        0,
        // An operator may allow it meanwhile: then Pine stays.
        () => !this.admits(serverId),
        async () => {
          await this.options.standings.markLeft([serverId]);
          log.info({ server: serverId, told }, 'left a server that may not have this Pine');
        },
      );
    });
  }

  /** Runs a server's leave in the background, one at a time per server (`idle` waits for it). */
  private track(serverId: string, work: () => Promise<void>): void {
    const done = work().finally(() => {
      this.refusing.delete(serverId);
    });
    this.refusing.set(serverId, done);
  }

  /**
   * Leaves a server, a failed try made again after each of `leaveRetryMs` (J8: Discord away for a
   * while), from the try `from`, each try only while `wanted` holds (a refusal: while the server
   * may still not have this Pine; an operator's removal: always); then `left`, where the leave went
   * through or Discord says Pine is not in the server (`gone`, Unknown Guild: neither tried again
   * nor an error). After the last, given up until the next ready asks again. Never rejects: each
   * failure is logged.
   */
  private async leaveTrying(
    exits: ServerExits,
    serverId: string,
    from: number,
    wanted: () => boolean,
    left: () => Promise<void> | void,
  ): Promise<void> {
    const { log } = this.options;
    const waits = this.options.leaveRetryMs ?? LEAVE_RETRY_MS;
    const wait = this.options.wait ?? waitUnref;
    for (let attempt = from; attempt <= waits.length; attempt += 1) {
      if (attempt > 0) await wait(waits[attempt - 1] ?? 0);
      if (!wanted()) {
        log.info({ server: serverId }, 'stopped leaving a server that may have this Pine now');
        return;
      }
      try {
        const how = await exits.leave(serverId);
        if (how === 'gone') log.info({ server: serverId }, 'Pine was not in a server it left');
      } catch (err) {
        log.error({ err, server: serverId, attempt }, 'could not leave a server');
        continue;
      }
      try {
        await left();
      } catch (err) {
        log.error({ err, server: serverId }, 'could not record that the bot left a server');
      }
      return;
    }
    log.warn({ server: serverId }, 'gave up leaving a server until the next ready');
  }

  /**
   * Every shard is ready: the present servers that may not have this Pine are refused, those
   * marked left are so no more, and those Pine was in that are not present are marked left.
   * Which are present is asked live after each await (`isPresent`), never of the snapshot: a
   * server that joins or leaves meanwhile is taken as it is then (J2). A server a new install
   * waits on (`undecided`) is neither refused nor marked. Never rejects: what fails is logged, and
   * the next ready asks again.
   */
  async everyShardReady(every: EveryShardReady): Promise<void> {
    const { standings, log } = this.options;
    const isPresent = (serverId: string): boolean => every.isPresent(serverId);
    try {
      const allowed: string[] = [];
      for (const serverId of every.present) {
        if (this.undecided(serverId)) continue;
        if (this.admits(serverId)) allowed.push(serverId);
        else this.refuse(serverId);
      }
      await standings.cameBack(allowed.filter(isPresent));
      const recorded = await this.options.recorded();
      const gone = recorded.filter(
        (serverId) =>
          !isPresent(serverId) && !standings.isLeft(serverId) && !this.undecided(serverId),
      );
      if (gone.length === 0) return;
      await standings.markLeft(gone);
      log.info(
        { servers: gone.length, first: gone.slice(0, 20) },
        'marked servers left that removed the bot while it was away',
      );
    } catch (err) {
      log.error({ err }, 'could not check which servers the bot is in');
    }
  }

  /**
   * The client is ready: the cached servers no shard's ready covered (`ShardReadiness`'s
   * `onClientReady`, added between two shards' readies without an event) are checked as a join
   * is: refused where they may not have this Pine, no more left where they were. Never rejects.
   */
  async clientReady(uncovered: readonly string[]): Promise<void> {
    const allowed: string[] = [];
    for (const serverId of uncovered) {
      if (this.undecided(serverId)) continue;
      if (this.admits(serverId)) allowed.push(serverId);
      else this.refuse(serverId);
    }
    try {
      await this.options.standings.cameBack(allowed);
    } catch (err) {
      this.options.log.error({ err }, 'could not check which servers the bot is in');
    }
  }

  private undecided(serverId: string): boolean {
    return this.options.undecided?.(serverId) === true;
  }

  /**
   * An instance operator has Pine leave a server (`/operator servers remove`, `block`): it leaves
   * without a word and the server is marked left (its row and everything on it kept, as for a
   * server whose staff removed Pine). `not-in` where Pine is not in it; `rehearsal` in rehearsal
   * mode, which leaves no server; `trying` where the leave failed (or one is under way already):
   * it is tried again in the background as a refusal's is (J8), and the server marked left once
   * it went through. A write that fails after the leave is thrown.
   */
  async remove(serverId: string): Promise<'left' | 'not-in' | 'rehearsal' | 'trying'> {
    const { exits, standings, inServer, log } = this.options;
    if (!inServer(serverId)) return 'not-in';
    if (exits === undefined) return 'rehearsal';
    if (this.refusing.has(serverId)) return 'trying';
    const left = async (): Promise<void> => {
      await standings.markLeft([serverId]);
      log.info({ server: serverId }, 'left a server an operator removed');
    };
    try {
      await exits.leave(serverId);
    } catch (err) {
      log.warn({ err, server: serverId }, 'could not leave a server an operator removed');
      // The operator's word stands, whatever allows the server.
      this.track(serverId, () => this.leaveTrying(exits, serverId, 1, () => true, left));
      return 'trying';
    }
    await left();
    return 'left';
  }

  /** Once every refusal under way is done (shutdown, tests). */
  async idle(): Promise<void> {
    while (this.refusing.size > 0) await Promise.all(this.refusing.values());
  }
}
