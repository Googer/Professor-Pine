import type { ExpressionBuilder, Kysely } from 'kysely';
import { isMaxTier, MAX_TIERS, type MaxTier } from '../../domain/pogo/max-tier.js';
import type { FeedBoss } from '../../domain/pogo/raid-boss-feed.js';
import {
  isOverrideAction,
  type BossOverride,
  type NewBossOverride,
} from '../../domain/pogo/raid-bosses.js';
import { isRaidLevel, raidTier, type RaidTier } from '../../domain/pogo/raid-tier.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/**
 * A feed boss as stored, with when the feed first and last listed it (epoch ms). `firstSeen` is
 * when it is a boss from: the read that first listed it, or the start the feed gave for an
 * upcoming one (`FeedBoss.startsAt`), which may be later than that read.
 */
export interface StoredBoss<T = RaidTier> extends FeedBoss<T> {
  firstSeen: number;
  lastSeen: number;
}

/** What a boss service needs from storage: the rows of one family (`BossFamily`). */
export interface BossStore<T> {
  listActive(): Promise<StoredBoss<T>[]>;
  replaceFeed(bosses: readonly FeedBoss<T>[], now: number): Promise<void>;
  touchActive(now: number): Promise<void>;
  lastSyncedAt(): Promise<number | undefined>;
  listOverrides(): Promise<BossOverride<T>[]>;
  saveOverride(override: NewBossOverride<T>, now: number): Promise<BossOverride<T>>;
  removeOverride(id: number): Promise<boolean>;
  removeExpiredOverrides(now: number): Promise<number>;
}

/** What the raid boss service needs from storage. */
export type RaidBossStore = BossStore<RaidTier>;
/** What the max boss service needs from storage. */
export type MaxBossStore = BossStore<MaxTier>;

/**
 * The rows of the boss tables that are one family's, and how its tiers are kept in the `level`
 * and `shadow` columns (design `2026-10-20-max-battles-design.md`, section 10: the repository per
 * family). The max family has the levels of `MAX_TIERS`; the raid family everything else, so a
 * level no version knows (the retired EX tier, one of a later version) stays the raids' to
 * report, and an override without a tier (a shiny one for every tier) is a raid override.
 */
interface BossFamily<T> {
  readonly maxLevels: boolean;
  tierOf(level: string, shadow: boolean): T | undefined;
  columns(tier: T): { level: string; shadow: 0 | 1 };
}

const RAID_FAMILY: BossFamily<RaidTier> = {
  maxLevels: false,
  tierOf: (level, shadow) => (isRaidLevel(level) ? raidTier(level, shadow) : undefined),
  columns: (tier) => ({ level: tier.level, shadow: tier.shadow ? 1 : 0 }),
};

const MAX_FAMILY: BossFamily<MaxTier> = {
  maxLevels: true,
  // A max tier has no shadow battles: a row with the flag is none this version can show.
  tierOf: (level, shadow) => (isMaxTier(level) && !shadow ? level : undefined),
  columns: (tier) => ({ level: tier, shadow: 0 }),
};

/** The `form` column holds `''` for a Pokémon without a form. */
function formColumn(form: string | null): string {
  return form ?? '';
}

function identity(pokemonId: string, form: string, level: string, shadow: number): string {
  // The columns compare without regard to case, so the identity does too. It relies on ids being
  // ASCII (the feed parsers and `overrideProblem` guarantee it); the collation would also treat
  // accented letters as equal to plain ones, which this comparison does not.
  return `${pokemonId}|${form}|${level}|${String(shadow)}`.toUpperCase();
}

/** The `RaidBoss` and `RaidBossOverride` tables, as far as they are one family's. */
class BossRepository<T> implements BossStore<T> {
  private readonly reported = new Set<number>();

  /**
   * `unreadable` hears of an override of the family whose tier this version does not know (one
   * for the EX tier, which plan 4F removed, or one written by a newer version), once per row:
   * such an override is left out and left alone.
   */
  protected constructor(
    private readonly db: Kysely<DB>,
    private readonly family: BossFamily<T>,
    private readonly unreadable: (override: { id: number; level: string }) => void,
  ) {}

  /** The boss rows of the family: a level of `MAX_TIERS` or not. */
  private ours(eb: ExpressionBuilder<DB, 'RaidBoss'>) {
    return eb('level', this.family.maxLevels ? 'in' : 'not in', [...MAX_TIERS]);
  }

  /** The override rows of the family, as `ours`; one without a level is a raid override. */
  private oursOverride(eb: ExpressionBuilder<DB, 'RaidBossOverride'>) {
    return this.family.maxLevels
      ? eb('level', 'in', [...MAX_TIERS])
      : eb.or([eb('level', 'is', null), eb('level', 'not in', [...MAX_TIERS])]);
  }

  /** The bosses the feed listed at the last sync, in the order they were first stored. */
  async listActive(): Promise<StoredBoss<T>[]> {
    const rows = await this.db
      .selectFrom('RaidBoss')
      .selectAll()
      .where('active', '=', 1)
      .where((eb) => this.ours(eb))
      .orderBy('id')
      .execute();
    const bosses: StoredBoss<T>[] = [];
    for (const row of rows) {
      const tier = this.family.tierOf(row.level, row.shadow === 1);
      // A level this version does not know (written by a newer one, or the EX tier of an
      // older one): not a boss it can show. The next sync marks it as no longer listed.
      if (tier === undefined) continue;
      bosses.push({
        pokemonId: row.pokemonId,
        form: row.form === '' ? null : row.form,
        tier,
        shiny: row.shiny === 1,
        name: row.name,
        ...(row.image === null ? {} : { image: row.image }),
        firstSeen: Number(row.firstSeen),
        lastSeen: Number(row.lastSeen),
      });
    }
    return bosses;
  }

  /**
   * Makes `bosses` the stored feed list of the family, in one transaction: a boss already stored
   * keeps its `firstSeen` if it was still active and starts again if it had gone (an upcoming
   * boss, `FeedBoss.startsAt`, from its start, which follows the feed until it has come); every listed
   * boss gets `lastSeen = now`; a stored boss of the family that is not listed becomes inactive
   * (the other family's rows are not touched). Of a boss listed twice the last entry's `shiny`,
   * `name` and `image` are stored (the parsers remove duplicates before that).
   */
  async replaceFeed(bosses: readonly FeedBoss<T>[], now: number): Promise<void> {
    await inTransaction(this.db, async (trx) => {
      const stored = await trx
        .selectFrom('RaidBoss')
        .select(['id', 'pokemonId', 'form', 'level', 'shadow', 'active', 'firstSeen'])
        .where((eb) => this.ours(eb))
        .forUpdate()
        .execute();
      const byIdentity = new Map(
        stored.map((row) => [identity(row.pokemonId, row.form, row.level, row.shadow), row]),
      );
      const listed = new Set<number>();
      for (const boss of bosses) {
        const { level, shadow } = this.family.columns(boss.tier);
        const form = formColumn(boss.form);
        const row = byIdentity.get(identity(boss.pokemonId, form, level, shadow));
        // An upcoming boss is a boss from its start; one that has come keeps when it came.
        const from = String(Math.max(now, boss.startsAt ?? now));
        if (row) {
          listed.add(row.id);
          await trx
            .updateTable('RaidBoss')
            .set({
              shiny: boss.shiny ? 1 : 0,
              name: boss.name,
              image: boss.image ?? null,
              lastSeen: String(now),
              active: 1,
              ...(row.active === 1 && Number(row.firstSeen) <= now ? {} : { firstSeen: from }),
            })
            .where('id', '=', row.id)
            .execute();
        } else {
          const inserted = await trx
            .insertInto('RaidBoss')
            .values({
              pokemonId: boss.pokemonId,
              form,
              level,
              shadow,
              shiny: boss.shiny ? 1 : 0,
              name: boss.name,
              image: boss.image ?? null,
              firstSeen: from,
              lastSeen: String(now),
              active: 1,
            })
            .executeTakeFirstOrThrow();
          const id = Number(inserted.insertId);
          listed.add(id);
          // A boss listed twice must find its row the second time.
          byIdentity.set(identity(boss.pokemonId, form, level, shadow), {
            id,
            pokemonId: boss.pokemonId,
            form,
            level,
            shadow,
            active: 1,
            firstSeen: from,
          });
        }
      }
      const gone = stored.filter((row) => row.active === 1 && !listed.has(row.id));
      if (gone.length > 0) {
        await trx
          .updateTable('RaidBoss')
          .set({ active: 0 })
          .where(
            'id',
            'in',
            gone.map((row) => row.id),
          )
          .execute();
      }
    });
  }

  /** Records that the feed still lists the same bosses at `now`. */
  async touchActive(now: number): Promise<void> {
    await this.db
      .updateTable('RaidBoss')
      .set({ lastSeen: String(now) })
      .where('active', '=', 1)
      .where((eb) => this.ours(eb))
      .execute();
  }

  /**
   * When the family's feed was last read successfully (epoch ms); undefined before the first
   * sync. Each family by itself: a fresh read of one feed must not hide that the other is stale.
   */
  async lastSyncedAt(): Promise<number | undefined> {
    const row = await this.db
      .selectFrom('RaidBoss')
      .select((eb) => eb.fn.max('lastSeen').as('lastSeen'))
      .where('active', '=', 1)
      .where((eb) => this.ours(eb))
      .executeTakeFirst();
    return row?.lastSeen == null ? undefined : Number(row.lastSeen);
  }

  /** Every override of the family, expired ones included, oldest first. Rows it cannot read are left out. */
  async listOverrides(): Promise<BossOverride<T>[]> {
    const rows = await this.db
      .selectFrom('RaidBossOverride')
      .selectAll()
      .where((eb) => this.oursOverride(eb))
      .orderBy('id')
      .execute();
    const overrides: BossOverride<T>[] = [];
    for (const row of rows) {
      const tier = row.level === null ? null : this.family.tierOf(row.level, row.shadow === 1);
      if (!isOverrideAction(row.action)) continue;
      if (row.level !== null && tier === undefined) {
        if (!this.reported.has(row.id)) {
          this.reported.add(row.id);
          this.unreadable({ id: row.id, level: row.level });
        }
        continue;
      }
      overrides.push({
        id: row.id,
        pokemonId: row.pokemonId,
        form: row.form === '' ? null : row.form,
        tier: tier ?? null,
        action: row.action,
        shiny: row.shiny === null ? null : row.shiny === 1,
        expiresAt: row.expiresAt === null ? null : Number(row.expiresAt),
        createdBy: row.createdBy,
        createdAt: Number(row.createdAt),
      });
    }
    return overrides;
  }

  /**
   * Stores an override, replacing what it replaces (`replacesOverride`): any earlier one with the
   * same action for the same Pokémon and tier, so that saving twice does not leave two, and for
   * an `autoset` every earlier `autoset` of the tier, so that a tier has one.
   */
  async saveOverride(override: NewBossOverride<T>, now: number): Promise<BossOverride<T>> {
    const form = formColumn(override.form);
    const columns = override.tier === null ? null : this.family.columns(override.tier);
    const shadow = columns?.shadow ?? 0;
    const level = columns?.level ?? null;
    const anyPokemon = override.action === 'autoset';
    return inTransaction(this.db, async (trx) => {
      await trx
        .deleteFrom('RaidBossOverride')
        .$if(!anyPokemon, (query) =>
          query.where('pokemonId', '=', override.pokemonId).where('form', '=', form),
        )
        .where('action', '=', override.action)
        .where('shadow', '=', shadow)
        .where((eb) => (level === null ? eb('level', 'is', null) : eb('level', '=', level)))
        .execute();
      const inserted = await trx
        .insertInto('RaidBossOverride')
        .values({
          pokemonId: override.pokemonId,
          form,
          level,
          shadow,
          action: override.action,
          shiny: override.shiny === null ? null : override.shiny ? 1 : 0,
          expiresAt: override.expiresAt === null ? null : String(override.expiresAt),
          createdBy: override.createdBy,
          createdAt: String(now),
        })
        .executeTakeFirstOrThrow();
      return { ...override, id: Number(inserted.insertId), createdAt: now };
    });
  }

  /** Whether there was such an override of the family. */
  async removeOverride(id: number): Promise<boolean> {
    const result = await this.db
      .deleteFrom('RaidBossOverride')
      .where('id', '=', id)
      .where((eb) => this.oursOverride(eb))
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  /** Deletes the family's overrides that expired at or before `now`; returns how many. */
  async removeExpiredOverrides(now: number): Promise<number> {
    const result = await this.db
      .deleteFrom('RaidBossOverride')
      .where('expiresAt', 'is not', null)
      .where('expiresAt', '<=', String(now))
      .where((eb) => this.oursOverride(eb))
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}

/** The raid bosses of the boss tables: every level but the max tiers. */
export class RaidBossRepository extends BossRepository<RaidTier> {
  constructor(
    db: Kysely<DB>,
    unreadable: (override: { id: number; level: string }) => void = () => undefined,
  ) {
    super(db, RAID_FAMILY, unreadable);
  }
}

/** The max bosses of the boss tables (plan 8X-2): the levels of `MAX_TIERS`. */
export class MaxBossRepository extends BossRepository<MaxTier> {
  constructor(
    db: Kysely<DB>,
    unreadable: (override: { id: number; level: string }) => void = () => undefined,
  ) {
    super(db, MAX_FAMILY, unreadable);
  }
}
