import type { V2Message } from '../discord/party-gateway.js';
import type { ShardStart } from '../discord/shard-readiness.js';
import type { Logger } from '../log.js';
import {
  adoptedServersDm,
  waitingServersDm,
  type NamedServer,
} from '../render/shared-change-dm.js';
import { DM_PRIORITY, type DmSender } from './dm-sender.js';
import type { ServerStandings } from './server-standings.js';

/** How long the owner's DMs about a new install's servers are worth sending: a week. */
const ADOPTED_DM_MS = 7 * 24 * 3_600_000;

/** How a server came before the adoption: present at a shard's first ready, or added since. */
type Arrival = 'start' | 'joined';

export interface ServerAdoptionOptions {
  standings: Pick<ServerStandings, 'adopting' | 'adopt' | 'writeAdopted'>;
  /**
   * Whether the application is public (Public Bot, read before the login: `botIsPublic`);
   * undefined where it could not be read: a server present at the first start that neither the
   * owner nor an operator owns then waits for the owner's word.
   */
  publicBot: boolean | undefined;
  /** A server's Discord owner, from the client's cache; undefined while Discord says it is down. */
  ownerOf: (serverId: string) => string | undefined;
  /** A server's name, from the client's cache, for the owner's DM. */
  nameOf: (serverId: string) => string | undefined;
  /** Whether somebody is the bot's owner or an instance operator (`isInstanceOperator`). */
  mayOwn: (userId: string) => boolean;
  /** The bot's owner (`OWNER_ID`), told of the servers adopted; none where blank. */
  ownerId: string;
  dms: DmSender;
  /** Tells and leaves a server that may not have this Pine (`ServerAdmission.refuse`). */
  refuse: (serverId: string) => void;
  log: Logger;
  now?: () => number;
}

/**
 * A new install keeps its owner's server (plan 19C-1; `servers.md`, "Who may have this Pine"). An
 * instance whose file lists no servers is closed to new servers, open only to those recorded at
 * the upgrade to 2.1 and those an operator allowed; a new install has recorded none, and its
 * operators could allow none before it runs. So while nothing was ever recorded
 * (`ServerStandings.adopting`), the servers present at each shard's first ready (those Discord
 * says are down included) are adopted: kept as recorded in memory in that very moment
 * (`shardReady`, a listener of `ShardReadiness.onShardReady` added before the start's own, so that
 * they are admitted, filled and given their `Guild` row at that start), and written once every
 * shard is ready (`everyShardReady`), which closes the window for good. A server that adds the bot
 * while nothing was recorded yet (`joined`: a start that found none) is adopted the same way.
 *
 * Who is adopted: at the first start (the servers of a shard's first ready), with Public Bot off
 * every server (only the application's owner, or the members of the Team that owns it, could add
 * the bot); with it on, only a server whose Discord owner is the bot's owner or an instance
 * operator; where it could not be read, such a server too, and any other waits for the owner's
 * word (`waiting`: neither adopted nor refused, `undecided`; the owner told by DM, who allows or
 * removes it with `/operator servers`). A server that joins afterwards (`joined`: `GuildCreate`,
 * or one the client's ready found that no shard covered) is adopted only where the bot's owner or
 * an operator owns it, whatever Public Bot said at the start (it is read once, before the login).
 * A server whose owner is not known yet (Discord says it is down) is neither adopted nor refused
 * until it comes (`available`). What is adopted is logged at warn and told to the owner by DM
 * (each server's name and id).
 */
export class ServerAdoption {
  /**
   * Servers whose owner is not known yet (down), by how they came (`start`: present at a shard's
   * first ready; `joined`): decided once they come.
   */
  private readonly ownerUnknown = new Map<string, Arrival>();
  /** Servers of a first start where Public Bot could not be read: they wait for the owner's word. */
  private readonly waiting = new Set<string>();
  /** Servers adopted and not told yet. */
  private readonly untold = new Set<string>();
  /** Servers waiting for the owner's word and not told yet. */
  private readonly waitingUntold = new Set<string>();

  constructor(private readonly options: ServerAdoptionOptions) {}

  /** A shard's ready: at its first, while the window is open, its servers are adopted. */
  shardReady(start: ShardStart): void {
    if (!start.first || !this.options.standings.adopting) return;
    this.decide([...start.servers, ...start.unavailable], 'start');
  }

  /**
   * Every shard is ready: the servers adopted are written, logged and told to the owner, and so
   * are those that wait for the owner's word. Never rejects: a write that fails is logged, and the
   * next ready writes them.
   */
  async everyShardReady(): Promise<void> {
    await this.write();
    this.tellWaiting();
  }

  /**
   * A server added the bot (`GuildCreate`, or none between two shards' readies): adopted while the
   * window is open and the bot's owner or an operator owns it, at once; resolves once written.
   */
  async joined(serverId: string): Promise<void> {
    if (!this.options.standings.adopting) return;
    if (this.decide([serverId], 'joined').length > 0) await this.write();
  }

  /**
   * A server Discord had said was down came (`GuildAvailable`): one whose owner was not known is
   * decided as it would have been: adopted, waiting for the owner's word, or refused. Resolves once
   * written.
   */
  async available(serverId: string): Promise<void> {
    const arrival = this.ownerUnknown.get(serverId);
    if (arrival === undefined) return;
    this.ownerUnknown.delete(serverId);
    if (this.decide([serverId], arrival).length > 0) await this.write();
    else if (this.waiting.has(serverId)) this.tellWaiting();
    else this.options.refuse(serverId);
  }

  /** Whether a server is neither admitted nor refused yet: its owner not known, or it waits. */
  undecided(serverId: string): boolean {
    return this.ownerUnknown.has(serverId) || this.waiting.has(serverId);
  }

  /** Adopts those of these servers that may be; those adopted. */
  private decide(serverIds: readonly string[], arrival: Arrival): string[] {
    const { publicBot, ownerOf, mayOwn, standings } = this.options;
    const adopted: string[] = [];
    for (const serverId of serverIds) {
      if (arrival === 'start' && publicBot === false) {
        adopted.push(serverId);
        continue;
      }
      const owner = ownerOf(serverId);
      if (owner === undefined) this.ownerUnknown.set(serverId, arrival);
      else if (mayOwn(owner)) adopted.push(serverId);
      else if (arrival === 'start' && publicBot === undefined) {
        this.waiting.add(serverId);
        this.waitingUntold.add(serverId);
      }
    }
    standings.adopt(adopted);
    for (const serverId of adopted) this.untold.add(serverId);
    return adopted;
  }

  /** Writes what was adopted, then logs it and tells the owner; never rejects. */
  private async write(): Promise<void> {
    const { standings, log } = this.options;
    try {
      await standings.writeAdopted();
    } catch (err) {
      log.error({ err }, 'could not record the adopted servers');
      return;
    }
    const told = [...this.untold].sort();
    if (told.length === 0) return;
    this.untold.clear();
    log.warn(
      { servers: told.length, first: told.slice(0, 20) },
      'adopted the servers of a new install',
    );
    this.tellOwner(told, adoptedServersDm);
  }

  /** Logs the servers that wait for the owner's word and are not told yet, and tells the owner. */
  private tellWaiting(): void {
    const told = [...this.waitingUntold].sort();
    if (told.length === 0) return;
    this.waitingUntold.clear();
    this.options.log.warn(
      { servers: told.length, first: told.slice(0, 20) },
      'servers of a new install wait for the owner: Public Bot could not be read',
    );
    this.tellOwner(told, waitingServersDm);
  }

  private tellOwner(
    serverIds: readonly string[],
    dm: (servers: readonly NamedServer[]) => V2Message,
  ): void {
    const { ownerId, dms, nameOf } = this.options;
    const owner = ownerId.trim();
    if (owner === '') return;
    const now = (this.options.now ?? Date.now)();
    dms.send({
      userId: owner,
      // The instance's, not a server's (plan 19B-5): no server's turn or first-contact cap.
      serverId: null,
      message: dm(serverIds.map((id) => ({ id, name: nameOf(id) }))),
      priority: DM_PRIORITY.normal,
      eventAt: now,
      expiresAt: now + ADOPTED_DM_MS,
    });
  }
}
