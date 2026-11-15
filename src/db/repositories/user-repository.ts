import type { Kysely, Selectable, Updateable } from 'kysely';
import {
  PartyStatus,
  RaidPrivacy,
  toPartyStatus,
  toRaidPrivacy,
} from '../../domain/party/status.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';
import { RowIds } from './row-ids.js';

/**
 * One member's personal settings, as the rest of the bot sees them. Whether a member is told
 * of new trains is not among them: that is per server (`NewTrainStorage`), and the legacy
 * column `newTrain` is neither read nor written here.
 */
export interface UserSettings {
  snowflake: string;
  /** May be @mentioned in party posts at all. */
  mentions: boolean;
  /** Mentioned when a new group is created (column `groups`). */
  mentionsGroups: boolean;
  /** Mentioned by /shout (column `shouts`). */
  mentionsShouts: boolean;
  /** Mentioned when a train moves (column `trainMovement`). */
  mentionsTrainStops: boolean;
  /** DM when an egg they are attending gets a boss (column `raidBoss`). */
  bossSetNotification: boolean;
  /** Status applied to the reporter of a new raid (column `status`). */
  autoStatus: PartyStatus;
  raidPrivacy: RaidPrivacy;
  /** In-game name (column `nickname`). */
  nickname: string | null;
  friendCode: string | null;
  pokebattlerId: number | null;
}

export type UserSettingsPatch = Partial<Omit<UserSettings, 'snowflake'>>;

/** What a member with no row has. These equal the column defaults. */
export const DEFAULT_USER_SETTINGS: Omit<UserSettings, 'snowflake'> = {
  mentions: true,
  mentionsGroups: true,
  mentionsShouts: true,
  mentionsTrainStops: true,
  bossSetNotification: false,
  autoStatus: PartyStatus.Interested,
  raidPrivacy: RaidPrivacy.Visible,
  nickname: null,
  friendCode: null,
  pokebattlerId: null,
};

function toColumns(patch: UserSettingsPatch): Updateable<DB['User']> {
  const columns: Updateable<DB['User']> = {};
  if (patch.mentions !== undefined) columns.mentions = Number(patch.mentions);
  if (patch.mentionsGroups !== undefined) columns.groups = Number(patch.mentionsGroups);
  if (patch.mentionsShouts !== undefined) columns.shouts = Number(patch.mentionsShouts);
  if (patch.mentionsTrainStops !== undefined) {
    columns.trainMovement = Number(patch.mentionsTrainStops);
  }
  if (patch.bossSetNotification !== undefined) columns.raidBoss = Number(patch.bossSetNotification);
  if (patch.autoStatus !== undefined) columns.status = patch.autoStatus;
  if (patch.raidPrivacy !== undefined) columns.raidPrivacy = patch.raidPrivacy;
  if (patch.nickname !== undefined) columns.nickname = patch.nickname;
  if (patch.friendCode !== undefined) columns.friendcode = patch.friendCode;
  if (patch.pokebattlerId !== undefined) columns.pokebattlerId = patch.pokebattlerId;
  return columns;
}

/** Reading members' settings: what the party services need to know whom they may ping. */
export interface UserSettingsReader {
  /** The member's settings; the defaults when they never changed one. */
  get(snowflake: string): Promise<UserSettings>;
  /**
   * The settings of several members in one read, by snowflake: every member asked for is in
   * the answer, with the defaults when they never changed a setting. An empty list asks nothing.
   */
  getMany(snowflakes: readonly string[]): Promise<Map<string, UserSettings>>;
}

/** A member who registered an in-game name, with the name as they registered it. */
export interface NicknameHolder {
  snowflake: string;
  nickname: string;
}

/** Members' settings as handlers use them (`ctx.users`). */
export interface UserSettingsStore extends UserSettingsReader {
  /** Changes the given fields of a member's settings. */
  update(snowflake: string, patch: UserSettingsPatch): Promise<void>;
  /**
   * Everybody who registered this in-game name, compared without regard to letter case and
   * accents, each with the name as they registered it; whether they are in a given server is
   * not known here.
   */
  withNickname(nickname: string): Promise<NicknameHolder[]>;
}

/**
 * What a member's row holds and what hangs on it, over every server (plan 8G, `/operator forget`):
 * which of the three things they told Pine about themselves are set, and how many rows of each
 * table name the row.
 */
export interface UserHoldings {
  friendCode: boolean;
  inGameName: boolean;
  pokebattlerId: boolean;
  /** Rows of `PokemonNotification`: Pokémon, raid tiers and the like. */
  wants: number;
  /** Rows of `TargetWant`: research rewards, Team GO Rocket, the boxes. */
  targetWants: number;
  /** Rows of `GymNotification`. */
  gymTargets: number;
  savedRoutes: number;
}

/** As many members as one query of `getMany` names. */
const READ_CHUNK = 500;

/** How many rows of the tables that hang on `User` name this row. */
async function hangingOn(
  db: Kysely<DB>,
  userId: number,
): Promise<Pick<UserHoldings, 'wants' | 'targetWants' | 'gymTargets' | 'savedRoutes'>> {
  const rows = async (
    table: 'PokemonNotification' | 'TargetWant' | 'GymNotification' | 'SavedRoutes',
  ) => {
    const counted = await db
      .selectFrom(table)
      .select((eb) => eb.fn.countAll<number | string>().as('rows'))
      .where('userId', '=', userId)
      .executeTakeFirst();
    return Number(counted?.rows ?? 0);
  };
  return {
    wants: await rows('PokemonNotification'),
    targetWants: await rows('TargetWant'),
    gymTargets: await rows('GymNotification'),
    savedRoutes: await rows('SavedRoutes'),
  };
}

function holdingsOfRow(
  row: Pick<Selectable<DB['User']>, 'friendcode' | 'nickname' | 'pokebattlerId'>,
): Pick<UserHoldings, 'friendCode' | 'inGameName' | 'pokebattlerId'> {
  return {
    friendCode: row.friendcode !== null,
    inGameName: row.nickname !== null,
    pokebattlerId: row.pokebattlerId !== null,
  };
}

function toSettings(snowflake: string, row: Selectable<DB['User']>): UserSettings {
  return {
    snowflake,
    mentions: row.mentions === 1,
    mentionsGroups: row.groups === 1,
    mentionsShouts: row.shouts === 1,
    mentionsTrainStops: row.trainMovement === 1,
    bossSetNotification: row.raidBoss === 1,
    autoStatus: toPartyStatus(row.status),
    raidPrivacy: toRaidPrivacy(row.raidPrivacy),
    nickname: row.nickname,
    friendCode: row.friendcode,
    pokebattlerId: row.pokebattlerId,
  };
}

/**
 * The User table: one row per member who has changed a setting. With `ids` (the process's
 * memory of rows it has seen) a row that was read here need not be looked for again by the
 * repositories of a member's wants and gyms.
 */
export class UserRepository implements UserSettingsStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly ids: RowIds = RowIds.none,
  ) {}

  /** The member's settings; the defaults when they have no row. Never creates a row. */
  async get(snowflake: string): Promise<UserSettings> {
    const row = await this.db
      .selectFrom('User')
      .selectAll()
      .where('userSnowflake', '=', snowflake)
      .executeTakeFirst();
    if (row && !this.db.isTransaction) this.ids.sawUser(snowflake, row.id);
    return row ? toSettings(snowflake, row) : { snowflake, ...DEFAULT_USER_SETTINGS };
  }

  /**
   * The settings of several members, by snowflake; the defaults for a member without a row.
   * One query for up to `READ_CHUNK` members, none for an empty list. Never creates a row.
   */
  async getMany(snowflakes: readonly string[]): Promise<Map<string, UserSettings>> {
    const asked = [...new Set(snowflakes)];
    const found = new Map<string, UserSettings>(
      asked.map((snowflake) => [snowflake, { snowflake, ...DEFAULT_USER_SETTINGS }]),
    );
    for (let start = 0; start < asked.length; start += READ_CHUNK) {
      const rows = await this.db
        .selectFrom('User')
        .selectAll()
        .where('userSnowflake', 'in', asked.slice(start, start + READ_CHUNK))
        .execute();
      for (const row of rows) {
        // Only what was asked for is answered, under the snowflake as it was asked.
        if (row.userSnowflake !== null && found.has(row.userSnowflake)) {
          found.set(row.userSnowflake, toSettings(row.userSnowflake, row));
        }
      }
    }
    return found;
  }

  /** The row id other tables reference (PokemonNotification.userId and so on). */
  async idFor(snowflake: string): Promise<number | undefined> {
    const seen = this.ids.user(snowflake);
    if (seen !== undefined) return seen;
    const row = await this.db
      .selectFrom('User')
      .select('id')
      .where('userSnowflake', '=', snowflake)
      .executeTakeFirst();
    if (row && !this.db.isTransaction) this.ids.sawUser(snowflake, row.id);
    return row?.id;
  }

  /** Creates the member's row if it is missing and returns its id. */
  async ensure(snowflake: string): Promise<number> {
    const existing = await this.idFor(snowflake);
    if (existing !== undefined) return existing;
    await this.db
      .insertInto('User')
      .values({ userSnowflake: snowflake })
      .onDuplicateKeyUpdate({ userSnowflake: snowflake })
      .execute();
    const id = await this.idFor(snowflake);
    if (id === undefined) throw new Error(`User row for ${snowflake} vanished after insert`);
    return id;
  }

  /** Changes the given fields, creating the row when needed. */
  async update(snowflake: string, patch: UserSettingsPatch): Promise<void> {
    const columns = toColumns(patch);
    if (Object.keys(columns).length === 0) {
      await this.ensure(snowflake);
      return;
    }
    await this.db
      .insertInto('User')
      .values({ userSnowflake: snowflake, ...columns })
      .onDuplicateKeyUpdate(columns)
      .execute();
  }

  /**
   * Everybody who registered this in-game name, oldest row first, each with the name as they
   * registered it: the name is not unique, and the column's collation makes the match exact
   * but for letter case and accents.
   */
  async withNickname(nickname: string): Promise<NicknameHolder[]> {
    const rows = await this.db
      .selectFrom('User')
      .select(['userSnowflake', 'nickname'])
      .where('nickname', '=', nickname)
      .orderBy('id')
      .execute();
    return rows.flatMap((row) =>
      row.userSnowflake === null || row.nickname === null
        ? []
        : [{ snowflake: row.userSnowflake, nickname: row.nickname }],
    );
  }

  /**
   * What the member's row holds and what hangs on it in every server (plan 8G: the look of
   * `/operator forget`); undefined for a member without a row. Never creates a row, and asks the
   * table itself: a row id this process remembers may be of a row that is gone.
   */
  async holdingsOf(snowflake: string): Promise<UserHoldings | undefined> {
    const row = await this.db
      .selectFrom('User')
      .select(['id', 'friendcode', 'nickname', 'pokebattlerId'])
      .where('userSnowflake', '=', snowflake)
      .executeTakeFirst();
    if (!row) return undefined;
    return { ...holdingsOfRow(row), ...(await hangingOn(this.db, row.id)) };
  }

  /**
   * Deletes the member's row with everything that hangs on it in every server (plan 8G, `/admin
   * forget`): their wants of both tables, their gym notices and their saved routes, then the row
   * itself with their settings, friend code, in-game name and Pokebattler id. What went, counted
   * as `holdingsOf` counts it; undefined for a member without a row, of whom nothing changes.
   *
   * One transaction (the caller's when `db` is one), with the row locked first, by its snowflake,
   * as `withMemberLocked` locks it: a change of the member's wants or gyms at the same moment
   * waits and then finds no row (it makes a new one, or has nothing to change). The rows that
   * hang on it are deleted by statements of their own, by the row's id, rather than left to the
   * foreign keys' cascade: a database whose keys differ leaves nothing behind either way.
   *
   * The row id this process remembers is forgotten once the transaction has committed; inside a
   * caller's transaction that is the caller's to do (`RowIds.forgetUser`), after its commit.
   */
  async forget(snowflake: string): Promise<UserHoldings | undefined> {
    const gone = await inTransaction(this.db, async (trx) => {
      const row = await trx
        .selectFrom('User')
        .select(['id', 'friendcode', 'nickname', 'pokebattlerId'])
        .where('userSnowflake', '=', snowflake)
        .forUpdate()
        .executeTakeFirst();
      if (!row) return undefined;
      const deleted = async (
        table: 'PokemonNotification' | 'TargetWant' | 'GymNotification' | 'SavedRoutes',
      ) => {
        const result = await trx.deleteFrom(table).where('userId', '=', row.id).executeTakeFirst();
        return Number(result.numDeletedRows);
      };
      const hanging = {
        wants: await deleted('PokemonNotification'),
        targetWants: await deleted('TargetWant'),
        gymTargets: await deleted('GymNotification'),
        savedRoutes: await deleted('SavedRoutes'),
      };
      await trx.deleteFrom('User').where('id', '=', row.id).execute();
      return { ...holdingsOfRow(row), ...hanging };
    });
    if (!this.db.isTransaction) this.ids.forgetUser(snowflake);
    return gone;
  }
}
