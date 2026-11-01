import * as he from 'he';
import { sql, type Kysely, type Updateable } from 'kysely';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { snowflakeParam } from '../snowflake.js';
import { polygonWkt } from '../spatial.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** A gym with its metadata, text decoded and flags as booleans. */
export interface Gym {
  id: number;
  /** Niantic's ID for the gym, when known. */
  pogoId: string | null;
  name: string;
  lat: number;
  lon: number;
  nickname: string | null;
  description: string | null;
  /** Extra search terms, lower case. */
  keywords: string[];
  /** Warning shown with the gym (access, hours). */
  notice: string | null;
  /** Tagged as an EX raid location in the game. */
  taggedEx: boolean;
  /** Has hosted an EX raid before. */
  confirmedEx: boolean;
  imageUrl: string | null;
  sponsor: number | null;
  /** Cached geocoding result, a JSON string. */
  geodata: string | null;
  /** Cached nearby place names. */
  places: string | null;
  nearestGym: number | null;
}

export interface NewGym {
  name: string;
  lat: number;
  lon: number;
  pogoId?: string | null;
  nickname?: string | null;
  description?: string | null;
  notice?: string | null;
  keywords?: string[];
  /** The address of the gym's picture (`GymMeta.imageUrl`; a Wayfarer import writes it). */
  imageUrl?: string | null;
  /** Its address parts (`GymMeta.geodata`): a Wayfarer import writes the Wayspot's address. */
  geodata?: string | null;
}

export interface GymPatch {
  name?: string;
  lat?: number;
  lon?: number;
  pogoId?: string | null;
  nickname?: string | null;
  description?: string | null;
  notice?: string | null;
  keywords?: string[];
  taggedEx?: boolean;
  confirmedEx?: boolean;
  imageUrl?: string | null;
  sponsor?: number | null;
  geodata?: string | null;
  places?: string | null;
  nearestGym?: number | null;
}

interface GymRow {
  id: number;
  pogoId: string | null;
  name: string;
  lat: number | null;
  lon: number | null;
  nickname: string | null;
  description: string | null;
  keywords: string | null;
  notice: string | null;
  taggedEx: number | null;
  confirmedEx: number | null;
  imageUrl: string | null;
  sponsor: number | null;
  geodata: string | null;
  places: string | null;
  nearestGym: number | null;
}

/** The legacy bot stores gym text HTML-entity-encoded; both bots must read the same rows. */
function encode(text: string | null): string | null {
  return text === null ? null : he.encode(text);
}

/**
 * How long a text is as the database holds it: `Gym.name` and `GymMeta.nickname` are
 * `varchar(255)` of the encoded text, which is longer than what was typed (an apostrophe is
 * six characters, a letter outside Latin-1 up to nine).
 */
export function storedTextLength(text: string): number {
  return he.encode(text).length;
}

function decode(text: string | null): string | null {
  return text === null ? null : he.decode(text);
}

function parseKeywords(stored: string | null): string[] {
  if (!stored) return [];
  return stored
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword !== '');
}

function formatKeywords(keywords: readonly string[]): string | null {
  const clean = keywords.map((keyword) => keyword.trim().toLowerCase()).filter((k) => k !== '');
  return clean.length > 0 ? clean.join(', ') : null;
}

/** The legacy bot writes EX flags as 1 or NULL, never 0. */
function exFlag(value: boolean): number | null {
  return value ? 1 : null;
}

function toGym(row: GymRow): Gym | undefined {
  if (row.lat === null || row.lon === null) return undefined;
  return {
    id: row.id,
    pogoId: row.pogoId,
    name: he.decode(row.name),
    lat: row.lat,
    lon: row.lon,
    nickname: decode(row.nickname),
    description: decode(row.description),
    keywords: parseKeywords(row.keywords),
    notice: decode(row.notice),
    taggedEx: row.taggedEx === 1,
    confirmedEx: row.confirmedEx === 1,
    imageUrl: row.imageUrl,
    sponsor: row.sponsor,
    geodata: row.geodata,
    places: row.places,
    nearestGym: row.nearestGym,
  };
}

function toGyms(rows: GymRow[]): Gym[] {
  return rows.map(toGym).filter((gym): gym is Gym => gym !== undefined);
}

function gymColumns(patch: GymPatch): Updateable<DB['Gym']> {
  const columns: Updateable<DB['Gym']> = {};
  if (patch.name !== undefined) columns.name = he.encode(patch.name);
  if (patch.lat !== undefined) columns.lat = patch.lat;
  if (patch.lon !== undefined) columns.lon = patch.lon;
  if (patch.pogoId !== undefined) columns.pogoId = patch.pogoId;
  return columns;
}

function metaColumns(patch: GymPatch): Updateable<DB['GymMeta']> {
  const columns: Updateable<DB['GymMeta']> = {};
  if (patch.nickname !== undefined) columns.nickname = encode(patch.nickname);
  if (patch.description !== undefined) columns.description = encode(patch.description);
  if (patch.notice !== undefined) columns.notice = encode(patch.notice);
  if (patch.keywords !== undefined) columns.keywords = formatKeywords(patch.keywords);
  if (patch.taggedEx !== undefined) columns.taggedEx = exFlag(patch.taggedEx);
  if (patch.confirmedEx !== undefined) columns.confirmedEx = exFlag(patch.confirmedEx);
  if (patch.imageUrl !== undefined) columns.imageUrl = patch.imageUrl;
  if (patch.sponsor !== undefined) columns.sponsor = patch.sponsor;
  if (patch.geodata !== undefined) columns.geodata = patch.geodata;
  if (patch.places !== undefined) columns.places = patch.places;
  if (patch.nearestGym !== undefined) columns.nearestGym = patch.nearestGym;
  return columns;
}

/** A gym's nearest gym to write (`nearestBlockChanges`). */
export interface NearestWrite {
  id: number;
  nearestGym: number | null;
}

/** Inserts a gym and its metadata (inside the caller's transaction); gives its id. */
async function insertGym(trx: Kysely<DB>, gym: NewGym): Promise<number> {
  const inserted = await trx
    .insertInto('Gym')
    .values({
      name: he.encode(gym.name),
      lat: gym.lat,
      lon: gym.lon,
      pogoId: gym.pogoId ?? null,
    })
    .executeTakeFirstOrThrow();
  const gymId = Number(inserted.insertId);
  await trx
    .insertInto('GymMeta')
    .values({
      gymId,
      nickname: encode(gym.nickname ?? null),
      description: encode(gym.description ?? null),
      notice: encode(gym.notice ?? null),
      keywords: formatKeywords(gym.keywords ?? []),
      imageUrl: gym.imageUrl ?? null,
      geodata: gym.geodata ?? null,
    })
    .execute();
  return gymId;
}

/** What gym administration needs of the tables; lets tests keep the gyms in memory. */
export interface GymStorage {
  get(id: number): Promise<Gym | undefined>;
  listAll(): Promise<Gym[]>;
  create(gym: NewGym): Promise<Gym>;
  /**
   * Creates gyms as one (plan 8W-6: a block of a Wayfarer import), with the nearest gyms that
   * `nearest` works out from the created gyms (theirs and those of other gyms), in one
   * transaction: all of it, or nothing when anything fails (also `nearest`). Gives the gyms as
   * created, in order, with their nearest gym.
   */
  createBlock(
    gyms: readonly NewGym[],
    nearest: (created: readonly Gym[]) => readonly NearestWrite[],
  ): Promise<Gym[]>;
  /** Undefined, having written nothing, when there is no such gym. */
  update(id: number, patch: GymPatch): Promise<Gym | undefined>;
  /** False when there was no such gym. */
  delete(id: number): Promise<boolean>;
}

/** The Gym and GymMeta tables. Gyms without coordinates are invisible to the bot. */
export class GymRepository implements GymStorage {
  constructor(private readonly db: Kysely<DB>) {}

  private select() {
    return this.db
      .selectFrom('Gym')
      .leftJoin('GymMeta', 'GymMeta.gymId', 'Gym.id')
      .select([
        'Gym.id',
        'Gym.pogoId',
        'Gym.name',
        'Gym.lat',
        'Gym.lon',
        'GymMeta.nickname',
        'GymMeta.description',
        'GymMeta.keywords',
        'GymMeta.notice',
        'GymMeta.taggedEx',
        'GymMeta.confirmedEx',
        'GymMeta.imageUrl',
        'GymMeta.sponsor',
        'GymMeta.geodata',
        'GymMeta.places',
        'GymMeta.nearestGym',
      ]);
  }

  async get(id: number): Promise<Gym | undefined> {
    const row = await this.select().where('Gym.id', '=', id).executeTakeFirst();
    return row ? toGym(row) : undefined;
  }

  async listAll(): Promise<Gym[]> {
    return toGyms(await this.select().orderBy('Gym.id').execute());
  }

  /** Gyms inside the region of the given channel. Empty when the channel is not a region. */
  async listInRegion(channelId: string): Promise<Gym[]> {
    const rows = await this.select()
      .where(
        sql<boolean>`exists (
          select 1 from Region r
          where r.channelId = ${snowflakeParam(channelId)}
            and r.bounds is not null
            and ST_Contains(r.bounds, POINT(Gym.lat, Gym.lon)))`,
      )
      .orderBy('Gym.id')
      .execute();
    return toGyms(rows);
  }

  /** Gyms inside an arbitrary closed outline (used for a region enlarged to reach its neighbours). */
  async listInPolygon(ring: readonly LatLon[]): Promise<Gym[]> {
    const rows = await this.select()
      .where(
        sql<boolean>`ST_Contains(ST_PolygonFromText(${polygonWkt(ring)}), POINT(Gym.lat, Gym.lon))`,
      )
      .orderBy('Gym.id')
      .execute();
    return toGyms(rows);
  }

  async create(gym: NewGym): Promise<Gym> {
    const id = await inTransaction(this.db, (trx) => insertGym(trx, gym));
    const created = await this.get(id);
    if (!created) throw new Error(`Gym ${id} vanished after insert`);
    return created;
  }

  async createBlock(
    gyms: readonly NewGym[],
    nearest: (created: readonly Gym[]) => readonly NearestWrite[],
  ): Promise<Gym[]> {
    return inTransaction(this.db, async (trx) => {
      const ids: number[] = [];
      for (const gym of gyms) ids.push(await insertGym(trx, gym));
      const inBlock = new GymRepository(trx);
      const created = toGyms(
        await inBlock.select().where('Gym.id', 'in', ids).orderBy('Gym.id').execute(),
      );
      const writes = nearest(created);
      for (const { id, nearestGym } of writes) {
        await trx
          .insertInto('GymMeta')
          .values({ gymId: id, nearestGym })
          .onDuplicateKeyUpdate({ nearestGym })
          .execute();
      }
      const written = new Map(writes.map((write) => [write.id, write.nearestGym]));
      return created.map((gym) =>
        written.has(gym.id) ? { ...gym, nearestGym: written.get(gym.id) ?? null } : gym,
      );
    });
  }

  /**
   * Changes the given fields. Returns the gym afterwards. Returns undefined, having written
   * nothing, when the gym does not exist or has no coordinates (such a gym is invisible to the
   * bot) and the patch does not supply each coordinate it lacks.
   *
   * The `Gym` row is locked first: a deletion that is under way is waited for, and then there
   * is no such gym (without the lock, the metadata of a gym that just went would be written,
   * which the foreign key of `GymMeta` refuses).
   */
  async update(id: number, patch: GymPatch): Promise<Gym | undefined> {
    const gym = gymColumns(patch);
    const meta = metaColumns(patch);
    return inTransaction(this.db, async (trx) => {
      const existing = await trx
        .selectFrom('Gym')
        .select(['id', 'lat', 'lon'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!existing) return undefined;
      const lacksLat = existing.lat === null && patch.lat === undefined;
      const lacksLon = existing.lon === null && patch.lon === undefined;
      if (lacksLat || lacksLon) return undefined;
      if (Object.keys(gym).length > 0) {
        await trx.updateTable('Gym').set(gym).where('id', '=', id).execute();
      }
      if (Object.keys(meta).length > 0) {
        await trx
          .insertInto('GymMeta')
          .values({ gymId: id, ...meta })
          .onDuplicateKeyUpdate(meta)
          .execute();
      }
      return new GymRepository(trx).get(id);
    });
  }

  /** Deleting a gym cascades to its metadata. Returns false when it did not exist. */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.deleteFrom('Gym').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
