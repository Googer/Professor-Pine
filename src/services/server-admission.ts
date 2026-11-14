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
  /** Pine leaves the server. */
  leave(serverId: string): Promise<void>;
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
  /**
   * A server a new install waits on (`ServerAdoption.undecided`: down at its first start, its
   * owner not known yet): neither refused nor marked until it is decided.
   */
  undecided?: (serverId: string) => boolean;
  log: Logger;
}

/**
 * How many servers are remembered as told that this Pine is private (oldest out; one forgotten
 * is told again, which costs a line in its system channel).
 */
const TOLD_SERVERS = 10_000;

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
   * Tells the server that this Pine is private, where it may, and leaves it; logged with the
   * server's id. Once at a time per server (a join and a ready meet); returns at once, never
   * throws.
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
    const work = (async () => {
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
      try {
        await exits.leave(serverId);
        log.info({ server: serverId, told }, 'left a server that may not have this Pine');
      } catch (err) {
        log.error({ err, server: serverId }, 'could not leave a server');
      }
    })().finally(() => {
      this.refusing.delete(serverId);
    });
    this.refusing.set(serverId, work);
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

  /** Once every refusal under way is done (shutdown, tests). */
  async idle(): Promise<void> {
    while (this.refusing.size > 0) await Promise.all(this.refusing.values());
  }
}
