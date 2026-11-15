import { Events } from 'discord.js';
import type { ServerAdmission } from '../services/server-admission.js';
import type { ServerAdoption } from '../services/server-adoption.js';
import type { ShardReadiness } from './shard-readiness.js';

/** What the check of who is in needs of the client (`Client`; an `EventEmitter` in tests). */
export interface AdmissionClient<G> {
  on(event: Events.GuildAvailable | Events.GuildCreate, listener: (guild: G) => void): unknown;
}

/**
 * Who is in (plan 19C-1; `servers.md`, "Who may have this Pine"), wired to the client's events
 * and the shards' readies. Called after `ShardReadiness.attach` and **before** `wireServerStart`,
 * whose listeners ask `admits` in the same events: a new install's adoption (`ServerAdoption`)
 * must have kept its servers as recorded by then, so that they are admitted, filled and given
 * their `Guild` row at that very start.
 *
 * - each shard's ready: the adoption of a new install's servers, at its first;
 * - every shard ready: the adopted written (and told), then the check of who is in
 *   (`ServerAdmission.everyShardReady`: the present refused or back, the gone marked left);
 * - the client's ready: the servers no shard covered, adopted or checked as a join;
 * - a join (`GuildCreate`): adopted while the window is open (the refusal itself is
 *   `wireServerStart`'s, in the same event);
 * - a server that comes (`GuildAvailable`): one a new install waits on is decided.
 */
export function wireServerAdmission<G extends { id: string }>(
  client: AdmissionClient<G>,
  deps: {
    shards: Pick<ShardReadiness, 'onShardReady' | 'onEveryShardReady' | 'onClientReady'>;
    adoption: Pick<ServerAdoption, 'shardReady' | 'everyShardReady' | 'joined' | 'available'>;
    admission: Pick<ServerAdmission, 'everyShardReady' | 'clientReady'>;
  },
): void {
  const { shards, adoption, admission } = deps;
  shards
    .onShardReady((start) => {
      adoption.shardReady(start);
    })
    // Neither rejects.
    .onEveryShardReady((every) => {
      void adoption.everyShardReady();
      void admission.everyShardReady(every);
    })
    .onClientReady(({ uncovered }) => {
      for (const serverId of uncovered) void adoption.joined(serverId);
      void admission.clientReady(uncovered);
    });
  client.on(Events.GuildCreate, (guild) => {
    void adoption.joined(guild.id);
  });
  client.on(Events.GuildAvailable, (guild) => {
    void adoption.available(guild.id);
  });
}
