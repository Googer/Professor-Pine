import type { Kysely } from 'kysely';
import {
  countWants,
  gymWantKey,
  NEW_TRAINS_KEY,
  pokemonWantKeys,
  targetWantKey,
} from '../../domain/notify/want-keys.js';
import type { StoredNotification } from '../../domain/pogo/notification-target.js';
import type { FormReader } from '../../domain/pogo/wants.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';
import { targetGymId } from './gym-notification-repository.js';

/** As many rows as one insert takes here (four placeholders a row). */
const ROWS_PER_INSERT = 2_000;

/**
 * The daily want counts (plan 8H-3, `WantCountDay`; migration 037): how many members wanted each
 * thing (a key of `src/domain/notify/want-keys.ts`) in a server at the end of a local day. No
 * member is kept. Lets tests keep them in memory (`MemoryWantCounts`).
 */
export interface WantCountStorage {
  /** The servers that have a row (`Guild`): those whose wants can be counted. */
  servers(): Promise<string[]>;
  /**
   * The wants of the servers given as they stand now, by the server's snowflake: how many
   * members want each key, of every kind of want (`PokemonNotification`, `TargetWant`,
   * `GymNotification`, `NewTrainNotification`); rows that cannot be read are no want, nor are
   * those of a member row without a snowflake, which the notifier cannot reach either. A server
   * without wants is not there, nor is one not given (the index audit of 2026-11-13, X12: a
   * zone's midnight reads its own servers' wants, not every server's).
   */
  countNow(serverIds: readonly string[]): Promise<Map<string, Map<string, number>>>;
  /** The servers that have counts of a day already. */
  serversCounted(day: string): Promise<Set<string>>;
  /**
   * Writes a server's counts of a day, in one transaction (all or none); a key of that day there
   * already keeps its count.
   */
  write(serverId: string, day: string, counts: ReadonlyMap<string, number>): Promise<void>;
  /** A server's counts of a day. For tests: nothing reads them yet. */
  countsOf(serverId: string, day: string): Promise<Map<string, number>>;
}

/** Pairs of a member and a key, by server. */
class ByServer {
  readonly pairs = new Map<string, [string, string][]>();

  add(serverId: string | null, member: string | null, key: string | undefined): void {
    if (serverId === null || member === null || key === undefined) return;
    const known = this.pairs.get(serverId);
    if (known) known.push([member, key]);
    else this.pairs.set(serverId, [[member, key]]);
  }
}

/** The table `WantCountDay`, counted from the four tables of wants. */
export class WantCountRepository implements WantCountStorage {
  /** `forms` reads a stored form as `/wants` reads it (`formReader` over the game data). */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly forms: FormReader,
  ) {}

  /** A whole read: one row per server, bounded small by nature. */
  async servers(): Promise<string[]> {
    const rows = await this.db.selectFrom('Guild').select('snowflake').execute();
    return rows.flatMap((row) => (row.snowflake === null ? [] : [row.snowflake]));
  }

  async countNow(serverIds: readonly string[]): Promise<Map<string, Map<string, number>>> {
    if (serverIds.length === 0) return new Map();
    // Only the wants the notifier could act on (review 8H3-1): a member is their `User` row's
    // snowflake, joined as the notifier's reads join it (`wanting` of the wants and the targets,
    // `targeting` of the gyms), and a row whose member has none is no one's want; new trains hold
    // the snowflake themselves. Only a species (`species:<dex>`) is counted over two tables,
    // `PokemonNotification` and `TargetWant`, which share the members' snowflakes. Each read
    // finds the servers by `guild_snowflake_unique` and their wants by the table's key that
    // begins with the server (`notification_guildid_foreign`, `targetwant_member_unique`,
    // `gymnotification_guildid_foreign`, the primary key of `NewTrainNotification`).
    const servers = [...serverIds];
    const found = new ByServer();
    const pokemon = await this.db
      .selectFrom('PokemonNotification as n')
      .innerJoin('Guild as g', 'g.id', 'n.guildId')
      .innerJoin('User as u', 'u.id', 'n.userId')
      .where('g.snowflake', 'in', servers)
      .select([
        'g.snowflake as serverId',
        'u.userSnowflake as memberId',
        'n.pokemon',
        'n.type',
        'n.form',
        'n.shadow',
        'n.costumed',
      ])
      .orderBy('n.id')
      .execute();
    // A member's rows together: duplicates of a target are one want (`readWants`).
    const rowsOf = new Map<
      string,
      { serverId: string; memberId: string; rows: StoredNotification[] }
    >();
    for (const row of pokemon) {
      if (row.serverId === null || row.memberId === null) continue;
      const key = `${row.serverId} ${row.memberId}`;
      const stored: StoredNotification = {
        // A row without a number means nothing: 0 is what the codec reads as unreadable.
        pokemon: row.pokemon ?? 0,
        type: row.type,
        form: row.form,
        shadow: row.shadow !== 0,
        costumed: row.costumed !== 0,
      };
      const known = rowsOf.get(key);
      if (known) known.rows.push(stored);
      else rowsOf.set(key, { serverId: row.serverId, memberId: row.memberId, rows: [stored] });
    }
    for (const { serverId, memberId, rows } of rowsOf.values()) {
      for (const key of pokemonWantKeys(rows, this.forms)) found.add(serverId, memberId, key);
    }
    const targets = await this.db
      .selectFrom('TargetWant as w')
      .innerJoin('Guild as g', 'g.id', 'w.guildId')
      .innerJoin('User as u', 'u.id', 'w.userId')
      .where('g.snowflake', 'in', servers)
      .select(['g.snowflake as serverId', 'u.userSnowflake as memberId', 'w.target'])
      .execute();
    for (const row of targets) found.add(row.serverId, row.memberId, targetWantKey(row.target));
    const gyms = await this.db
      .selectFrom('GymNotification as n')
      .innerJoin('Guild as g', 'g.id', 'n.guildId')
      .innerJoin('User as u', 'u.id', 'n.userId')
      .where('g.snowflake', 'in', servers)
      .select(['g.snowflake as serverId', 'u.userSnowflake as memberId', 'n.gym'])
      .execute();
    for (const row of gyms) {
      const gymId = targetGymId(row.gym);
      found.add(row.serverId, row.memberId, gymId === undefined ? undefined : gymWantKey(gymId));
    }
    const trains = await this.db
      .selectFrom('NewTrainNotification as n')
      .innerJoin('Guild as g', 'g.id', 'n.guildId')
      .where('g.snowflake', 'in', servers)
      .select(['g.snowflake as serverId', 'n.memberId'])
      .execute();
    for (const row of trains) found.add(row.serverId, row.memberId, NEW_TRAINS_KEY);
    return new Map([...found.pairs].map(([serverId, pairs]) => [serverId, countWants(pairs)]));
  }

  async serversCounted(day: string): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom('WantCountDay')
      .select('serverId')
      .distinct()
      .where('day', '=', day)
      .execute();
    return new Set(rows.map((row) => row.serverId));
  }

  async write(serverId: string, day: string, counts: ReadonlyMap<string, number>): Promise<void> {
    const rows = [...counts].map(([target, count]) => ({ serverId, day, target, count }));
    // All of it or none (review P2): a day written in part would count as counted.
    await inTransaction(this.db, async (trx) => {
      for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
        // An upsert that changes nothing (never `insert ignore`, which would also hide a key cut
        // to the column's length): a second write of the day leaves what the first wrote.
        await trx
          .insertInto('WantCountDay')
          .values(rows.slice(start, start + ROWS_PER_INSERT))
          .onDuplicateKeyUpdate((eb) => ({ count: eb.ref('WantCountDay.count') }))
          .execute();
      }
    });
  }

  async countsOf(serverId: string, day: string): Promise<Map<string, number>> {
    const rows = await this.db
      .selectFrom('WantCountDay')
      .select(['target', 'count'])
      .where('serverId', '=', serverId)
      .where('day', '=', day)
      .execute();
    return new Map(rows.map((row) => [row.target, row.count]));
  }
}
