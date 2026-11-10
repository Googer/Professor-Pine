import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { fixtureForms, MemoryWants } from '../../../test/support/wants.js';
import { pokemonTarget, type NotificationTarget } from '../../domain/pogo/notification-target.js';
import type { RaidLevel } from '../../domain/pogo/raid-tier.js';
import type { DB } from '../types.js';
import {
  PokemonNotificationRepository,
  type WantStorage,
} from './pokemon-notification-repository.js';
import { UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

const species = (dex: number): NotificationTarget => ({ kind: 'pokemon', dex });
const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
  kind: 'tier',
  tier: { level, shadow },
});
const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };
const ORIGIN = pokemonTarget(487, 'giratina_origin');
const SHADOW_GIRATINA = pokemonTarget(487, undefined, true);

describe('PokemonNotificationRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let wants: PokemonNotificationRepository;
  let users: UserRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    wants = new PokemonNotificationRepository(db, fixtureForms());
    users = new UserRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('PokemonNotification').execute();
    await db.deleteFrom('User').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  /** A row as the legacy bot may have left it. */
  const legacyRow = async (member: string, guildId: number, pokemon: number | null, type: string) =>
    db
      .insertInto('PokemonNotification')
      .values({ userId: await users.ensure(member), guildId, pokemon, type })
      .execute();
  const stored = () =>
    db
      .selectFrom('PokemonNotification')
      .select(['pokemon', 'type', 'userId', 'guildId'])
      .orderBy('id')
      .execute();
  /** A row with the two newer columns as somebody may have left them. */
  const formRow = async (
    member: string,
    guildId: number,
    values: { pokemon: number; type: string; form?: string | null; shadow?: number },
  ) =>
    db
      .insertInto('PokemonNotification')
      .values({ userId: await users.ensure(member), guildId, ...values })
      .execute();
  /** Every row as `[pokemon, type, form, shadow]`. */
  const storedForms = async () =>
    (
      await db
        .selectFrom('PokemonNotification')
        .select(['pokemon', 'type', 'form', 'shadow'])
        .orderBy('id')
        .execute()
    ).map((row) => [row.pokemon, row.type, row.form, row.shadow]);

  it('has nothing for a member without a row, and creates none by reading', async () => {
    expect(await wants.list(ALICE, HOME)).toEqual({ wants: [], unreadable: 0 });
    expect(await wants.count(ALICE, HOME)).toBe(0);
    expect(await wants.remove(ALICE, HOME, species(150))).toBe(false);
    expect(await wants.removeAll(ALICE, HOME)).toBe(0);
    expect(await users.idFor(ALICE)).toBeUndefined();
    // Nor for a server the bot has no row for.
    expect(await wants.list(ALICE, '499999999999999999')).toEqual({ wants: [], unreadable: 0 });
  });

  it('sets a want as the codec writes it, and gives the member their row', async () => {
    expect(await wants.set(ALICE, HOME, species(150), 'both')).toEqual({
      kind: 'added',
      want: { target: species(150), scope: 'both' },
    });
    expect(await wants.set(ALICE, HOME, tier('T5', true), 'both')).toEqual({
      kind: 'added',
      want: { target: tier('T5', true), scope: 'raid' },
    });
    expect(await wants.set(ALICE, HOME, PERFECT, 'raid')).toEqual({
      kind: 'added',
      want: { target: PERFECT, scope: 'spawn' },
    });
    const userId = await users.idFor(ALICE);
    expect(userId).toBeDefined();
    expect(await stored()).toEqual([
      { pokemon: 150, type: 'both', userId, guildId: 1 },
      { pokemon: -35, type: 'raid', userId, guildId: 1 },
      { pokemon: -6, type: 'spawn', userId, guildId: 1 },
    ]);
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [
        { target: species(150), scope: 'both' },
        { target: tier('T5', true), scope: 'raid' },
        { target: PERFECT, scope: 'spawn' },
      ],
      unreadable: 0,
    });
    expect(await wants.count(ALICE, HOME)).toBe(3);
  });

  it('keeps the settings of a member who has a row already', async () => {
    await users.update(ALICE, { mentions: false });
    const id = await users.idFor(ALICE);
    await wants.set(ALICE, HOME, species(150), 'raid');
    expect(await users.idFor(ALICE)).toBe(id);
    expect((await users.get(ALICE)).mentions).toBe(false);
  });

  it('changes the scope of a want that exists, in one row', async () => {
    await wants.set(ALICE, HOME, species(150), 'raid');
    expect(await wants.set(ALICE, HOME, species(150), 'spawn')).toEqual({
      kind: 'changed',
      want: { target: species(150), scope: 'spawn' },
      before: 'raid',
    });
    expect(await wants.set(ALICE, HOME, species(150), 'spawn')).toEqual({
      kind: 'unchanged',
      want: { target: species(150), scope: 'spawn' },
    });
    expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([[150, 'spawn']]);
  });

  it('keeps wants apart by member and by server', async () => {
    await wants.set(ALICE, HOME, species(150), 'raid');
    await wants.set(ALICE, AWAY, species(150), 'spawn');
    await wants.set(BOB, HOME, species(151), 'both');
    expect((await wants.list(ALICE, HOME)).wants).toEqual([
      { target: species(150), scope: 'raid' },
    ]);
    expect((await wants.list(ALICE, AWAY)).wants).toEqual([
      { target: species(150), scope: 'spawn' },
    ]);
    expect((await wants.list(BOB, HOME)).wants).toEqual([{ target: species(151), scope: 'both' }]);
    expect(await wants.remove(BOB, HOME, species(150))).toBe(false);
    expect(await wants.remove(ALICE, AWAY, species(150))).toBe(true);
    expect((await wants.list(ALICE, HOME)).wants).toHaveLength(1);
    expect(await stored()).toHaveLength(2);
  });

  it('reads legacy rows: any letter case, the wants of 2019, and what it cannot read', async () => {
    await legacyRow(ALICE, 1, 150, 'Both');
    await legacyRow(ALICE, 1, -5, 'Raid');
    await legacyRow(ALICE, 1, -6, 'both');
    await legacyRow(ALICE, 1, -8, 'both');
    await legacyRow(ALICE, 1, -7, 'spawn');
    await legacyRow(ALICE, 1, null, 'both');
    await legacyRow(ALICE, 1, 25, 'sometimes');
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [
        { target: species(150), scope: 'both' },
        { target: tier('T5'), scope: 'raid' },
        { target: PERFECT, scope: 'spawn' },
        { target: { kind: 'iv', iv: 'zero' }, scope: 'spawn' },
      ],
      unreadable: 3,
    });
    expect(await wants.count(ALICE, HOME)).toBe(7);
    // Setting what a legacy row already says writes nothing.
    expect(await wants.set(ALICE, HOME, species(150), 'both')).toMatchObject({ kind: 'unchanged' });
    expect(await wants.set(ALICE, HOME, PERFECT, 'spawn')).toMatchObject({ kind: 'unchanged' });
    expect((await stored()).map((row) => row.type)).toEqual([
      'Both',
      'Raid',
      'both',
      'both',
      'spawn',
      'both',
      'sometimes',
    ]);
  });

  it('makes one row of several legacy rows for one target when that target is set', async () => {
    await legacyRow(ALICE, 1, 150, 'raid');
    await legacyRow(ALICE, 1, 151, 'raid');
    await legacyRow(ALICE, 1, 150, 'spawn');
    expect((await wants.list(ALICE, HOME)).wants).toEqual([
      { target: species(150), scope: 'both' },
      { target: species(151), scope: 'raid' },
    ]);
    expect(await wants.set(ALICE, HOME, species(150), 'spawn')).toEqual({
      kind: 'changed',
      want: { target: species(150), scope: 'spawn' },
      before: 'both',
    });
    expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([
      [150, 'spawn'],
      [151, 'raid'],
    ]);
  });

  it('removes every row of a target and leaves the rest', async () => {
    await legacyRow(ALICE, 1, 150, 'raid');
    await legacyRow(ALICE, 1, 150, 'Spawn');
    await legacyRow(ALICE, 1, 150, 'sometimes');
    await legacyRow(ALICE, 1, -6, 'both');
    await legacyRow(ALICE, 1, -6, 'raid');
    expect(await wants.remove(ALICE, HOME, species(150))).toBe(true);
    expect(await wants.remove(ALICE, HOME, species(150))).toBe(false);
    // The mega legendary tier and the perfect-IV want share a number and are two wants.
    expect(await wants.remove(ALICE, HOME, tier('MegaLegendary'))).toBe(true);
    expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([
      [150, 'sometimes'],
      [-6, 'both'],
    ]);
  });

  it('removes all rows of a member in one server, also those it cannot read', async () => {
    await legacyRow(ALICE, 1, 150, 'raid');
    await legacyRow(ALICE, 1, -7, 'spawn');
    await legacyRow(ALICE, 1, null, 'both');
    await legacyRow(ALICE, 2, 151, 'raid');
    await legacyRow(BOB, 1, 150, 'raid');
    // Rows that hang on no member or no server belong to nobody: they stay.
    const alice = await users.ensure(ALICE);
    await db
      .insertInto('PokemonNotification')
      .values([
        { userId: null, guildId: 1, pokemon: 150, type: 'both' },
        { userId: alice, guildId: null, pokemon: 150, type: 'both' },
      ])
      .execute();
    expect(await wants.count(ALICE, HOME)).toBe(3);
    expect(await wants.removeAll(ALICE, HOME)).toBe(3);
    expect(await wants.removeAll(ALICE, HOME)).toBe(0);
    expect((await stored()).map((row) => [row.pokemon, row.guildId])).toEqual([
      [151, 2],
      [150, 1],
      [150, 1],
      [150, null],
    ]);
  });

  it('has no limit on the wants of a member', async () => {
    for (let dex = 1; dex <= 130; dex++) await wants.set(ALICE, HOME, species(dex), 'both');
    expect(await wants.count(ALICE, HOME)).toBe(130);
  });

  it('gives a server its row when it has none', async () => {
    const other = '499999999999999999';
    await wants.set(ALICE, other, species(150), 'raid');
    expect((await wants.list(ALICE, other)).wants).toHaveLength(1);
    const guild = await db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', other)
      .executeTakeFirst();
    expect(guild).toBeDefined();
  });

  it('makes one row when the same want is set many times at once', async () => {
    await Promise.all(
      Array.from({ length: 8 }, () => wants.set(ALICE, HOME, species(150), 'both')),
    );
    expect(await stored()).toHaveLength(1);
    // Also for a member who had no row before: the first changes wait for each other.
    await Promise.all(Array.from({ length: 8 }, () => wants.set(BOB, HOME, species(150), 'raid')));
    expect(await wants.count(BOB, HOME)).toBe(1);
    expect(await stored()).toHaveLength(2);
  });

  it('lets different members set wants at the same time', async () => {
    const members = Array.from({ length: 12 }, (_unused, index) =>
      String(312345678901234600n + BigInt(index)),
    );
    const outcomes = await Promise.all(
      members.map((member) => wants.set(member, HOME, species(150), 'both')),
    );
    expect(outcomes.every((outcome) => outcome.kind === 'added')).toBe(true);
    expect(await stored()).toHaveLength(12);
  });

  it('lets different members set their first wants at once in a server that has no row yet', async () => {
    const other = '499999999999999998';
    const members = Array.from({ length: 12 }, (_unused, index) =>
      String(312345678901234700n + BigInt(index)),
    );
    const outcomes = await Promise.all(
      members.map((member) => wants.set(member, other, species(150), 'both')),
    );
    expect(outcomes.every((outcome) => outcome.kind === 'added')).toBe(true);
    const guilds = await db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', other)
      .execute();
    expect(guilds).toHaveLength(1);
    expect((await stored()).every((row) => row.guildId === guilds[0]?.id)).toBe(true);
    expect(await stored()).toHaveLength(12);
  });

  it('adds the mega legendary tier beside a perfect-IV row of 2019 with the same number', async () => {
    await legacyRow(ALICE, 1, -6, 'both');
    expect(await wants.set(ALICE, HOME, tier('MegaLegendary'), 'raid')).toEqual({
      kind: 'added',
      want: { target: tier('MegaLegendary'), scope: 'raid' },
    });
    expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([
      [-6, 'both'],
      [-6, 'raid'],
    ]);
    expect((await wants.list(ALICE, HOME)).wants).toEqual([
      { target: PERFECT, scope: 'spawn' },
      { target: tier('MegaLegendary'), scope: 'raid' },
    ]);
    // Each is set again without touching the other.
    expect(await wants.set(ALICE, HOME, PERFECT, 'spawn')).toMatchObject({ kind: 'unchanged' });
    expect(await wants.remove(ALICE, HOME, PERFECT)).toBe(true);
    expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([[-6, 'raid']]);
  });

  it('leaves a row from before the two columns as it was, and reads it as the species', async () => {
    await legacyRow(ALICE, 1, 487, 'raid');
    expect(await storedForms()).toEqual([[487, 'raid', null, 0]]);
    expect((await wants.list(ALICE, HOME)).wants).toEqual([
      { target: species(487), scope: 'raid' },
    ]);
  });

  it('keeps a want for a species, for one form of it and for its shadow raids side by side', async () => {
    expect(await wants.set(ALICE, HOME, species(487), 'both')).toMatchObject({ kind: 'added' });
    expect(await wants.set(ALICE, HOME, ORIGIN, 'raid')).toEqual({
      kind: 'added',
      want: { target: ORIGIN, scope: 'raid' },
    });
    // Shadow raids are raids, whatever was asked for.
    expect(await wants.set(ALICE, HOME, SHADOW_GIRATINA, 'both')).toEqual({
      kind: 'added',
      want: { target: SHADOW_GIRATINA, scope: 'raid' },
    });
    expect(
      await wants.set(ALICE, HOME, pokemonTarget(487, 'giratina_origin', true), 'spawn'),
    ).toMatchObject({ kind: 'added' });
    expect(await storedForms()).toEqual([
      [487, 'both', null, 0],
      [487, 'raid', 'giratina_origin', 0],
      [487, 'raid', null, 1],
      [487, 'raid', 'giratina_origin', 1],
    ]);
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [
        { target: species(487), scope: 'both' },
        { target: ORIGIN, scope: 'raid' },
        { target: SHADOW_GIRATINA, scope: 'raid' },
        { target: pokemonTarget(487, 'giratina_origin', true), scope: 'raid' },
      ],
      unreadable: 0,
    });
    expect(await wants.count(ALICE, HOME)).toBe(4);
    // Each is changed and removed by itself.
    expect(await wants.set(ALICE, HOME, ORIGIN, 'spawn')).toEqual({
      kind: 'changed',
      want: { target: ORIGIN, scope: 'spawn' },
      before: 'raid',
    });
    expect(await wants.set(ALICE, HOME, SHADOW_GIRATINA, 'spawn')).toMatchObject({
      kind: 'unchanged',
    });
    expect(await wants.remove(ALICE, HOME, species(487))).toBe(true);
    expect(await wants.remove(ALICE, HOME, species(487))).toBe(false);
    expect(await storedForms()).toEqual([
      [487, 'spawn', 'giratina_origin', 0],
      [487, 'raid', null, 1],
      [487, 'raid', 'giratina_origin', 1],
    ]);
    expect(await wants.remove(ALICE, HOME, SHADOW_GIRATINA)).toBe(true);
    expect(await wants.remove(ALICE, HOME, ORIGIN)).toBe(true);
    expect(await storedForms()).toEqual([[487, 'raid', 'giratina_origin', 1]]);
  });

  it('writes no form and no flag for a tier or an IV target, and reads such a row by its number alone', async () => {
    await wants.set(ALICE, HOME, tier('T5', true), 'raid');
    await wants.set(ALICE, HOME, PERFECT, 'spawn');
    expect(await storedForms()).toEqual([
      [-35, 'raid', null, 0],
      [-6, 'spawn', null, 0],
    ]);
    // Stray values in the two columns of a tier or IV row mean nothing.
    await formRow(BOB, 1, { pokemon: -5, type: 'raid', form: 'giratina_origin', shadow: 1 });
    await formRow(BOB, 1, { pokemon: -8, type: 'spawn', form: 'not a key', shadow: 1 });
    expect(await wants.list(BOB, HOME)).toEqual({
      wants: [
        { target: tier('T5'), scope: 'raid' },
        { target: { kind: 'iv', iv: 'zero' }, scope: 'spawn' },
      ],
      unreadable: 0,
    });
    expect(await wants.set(BOB, HOME, tier('T5'), 'raid')).toMatchObject({ kind: 'unchanged' });
    expect(await wants.remove(BOB, HOME, tier('T5'))).toBe(true);
    expect((await wants.list(BOB, HOME)).wants).toHaveLength(1);
  });

  it('makes one row of several rows for one form, and leaves the other wants of the species', async () => {
    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina_origin' });
    await formRow(ALICE, 1, { pokemon: 487, type: 'spawn' });
    await formRow(ALICE, 1, { pokemon: 487, type: 'Spawn', form: 'Giratina_Origin' });
    await formRow(ALICE, 1, { pokemon: 487, type: 'both', form: 'giratina_origin', shadow: 1 });
    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: 1 });
    expect((await wants.list(ALICE, HOME)).wants).toEqual([
      { target: ORIGIN, scope: 'both' },
      { target: species(487), scope: 'spawn' },
      { target: pokemonTarget(487, 'giratina_origin', true), scope: 'raid' },
    ]);
    expect(await wants.count(ALICE, HOME)).toBe(3);
    expect(await wants.set(ALICE, HOME, ORIGIN, 'raid')).toEqual({
      kind: 'changed',
      want: { target: ORIGIN, scope: 'raid' },
      before: 'both',
    });
    expect(await storedForms()).toEqual([
      [487, 'raid', 'giratina_origin', 0],
      [487, 'spawn', null, 0],
      [487, 'both', 'giratina_origin', 1],
      [487, 'raid', 'giratina_origin', 1],
    ]);
    // The shadow want says raid in both its rows already: the oldest stays, as it is.
    expect(
      await wants.set(ALICE, HOME, pokemonTarget(487, 'giratina_origin', true), 'raid'),
    ).toMatchObject({ kind: 'unchanged' });
    expect(await storedForms()).toEqual([
      [487, 'raid', 'giratina_origin', 0],
      [487, 'spawn', null, 0],
      [487, 'both', 'giratina_origin', 1],
    ]);
  });

  it('reads a form the game data may not know, removes it when asked, and counts what is no key', async () => {
    await formRow(ALICE, 1, { pokemon: 487, type: 'both', form: 'giratina_sky' });
    await formRow(ALICE, 1, { pokemon: 487, type: 'both', form: 'Origin Forme' });
    await formRow(ALICE, 1, { pokemon: 487, type: 'both', form: '' });
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [
        { target: pokemonTarget(487, 'giratina_sky'), scope: 'both' },
        // An empty form is none.
        { target: species(487), scope: 'both' },
      ],
      unreadable: 1,
    });
    expect(await wants.remove(ALICE, HOME, pokemonTarget(487, 'giratina_sky'))).toBe(true);
    // The row that cannot be read stays until the member removes everything.
    expect(await storedForms()).toEqual([
      [487, 'both', 'Origin Forme', 0],
      [487, 'both', '', 0],
    ]);
    expect(await wants.removeAll(ALICE, HOME)).toBe(2);
  });

  it('makes one row when the same form is wanted many times at once', async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () => wants.set(ALICE, HOME, ORIGIN, 'raid')),
    );
    expect(outcomes.filter((outcome) => outcome.kind === 'added')).toHaveLength(1);
    expect(await storedForms()).toEqual([[487, 'raid', 'giratina_origin', 0]]);
  });

  it('reads two keys of one entry as one want, and writes the key of today when it is set', async () => {
    const altered = pokemonTarget(487, 'giratina_altered');
    // `giratina` is an alias of the entry `giratina_altered` in the game data of the tests.
    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina' });
    await formRow(ALICE, 1, { pokemon: 487, type: 'spawn', form: 'giratina_altered' });
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [{ target: altered, scope: 'both' }],
      unreadable: 0,
    });
    expect(await wants.count(ALICE, HOME)).toBe(1);
    expect(await wants.set(ALICE, HOME, altered, 'both')).toMatchObject({ kind: 'unchanged' });
    expect(await storedForms()).toEqual([[487, 'both', 'giratina_altered', 0]]);
    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina' });
    expect(await wants.remove(ALICE, HOME, altered)).toBe(true);
    expect(await storedForms()).toEqual([]);
    // Named by the older key, it is the same want: one row, found and removed.
    const older = pokemonTarget(487, 'giratina');
    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina' });
    expect(await wants.set(ALICE, HOME, older, 'spawn')).toMatchObject({
      kind: 'changed',
      want: { target: altered, scope: 'spawn' },
    });
    expect(await storedForms()).toEqual([[487, 'spawn', 'giratina_altered', 0]]);
    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina' });
    expect(await wants.remove(ALICE, HOME, older)).toBe(true);
    expect(await storedForms()).toEqual([]);
  });

  it('keeps a mega for raids only: stored so, and read so whatever a row says', async () => {
    const megaY = pokemonTarget(6, 'charizard_mega_y');
    expect(await wants.set(ALICE, HOME, megaY, 'both')).toEqual({
      kind: 'added',
      want: { target: megaY, scope: 'raid' },
    });
    expect(await storedForms()).toEqual([[6, 'raid', 'charizard_mega_y', 0]]);
    await formRow(BOB, 1, { pokemon: 6, type: 'both', form: 'charizard_mega_y' });
    expect((await wants.list(BOB, HOME)).wants).toEqual([{ target: megaY, scope: 'raid' }]);
    // It says raids already: the row is not rewritten.
    expect(await wants.set(BOB, HOME, megaY, 'spawn')).toMatchObject({ kind: 'unchanged' });
    expect(await storedForms()).toEqual([
      [6, 'raid', 'charizard_mega_y', 0],
      [6, 'both', 'charizard_mega_y', 0],
    ]);
  });

  it('finds by event the members with a row of these numbers in this server, with what the rows mean', async () => {
    await wants.set(ALICE, HOME, species(487), 'both');
    await wants.set(ALICE, HOME, tier('T5'), 'raid');
    await wants.set(ALICE, HOME, species(1), 'both');
    await wants.set(BOB, HOME, ORIGIN, 'raid');
    await wants.set(BOB, HOME, SHADOW_GIRATINA, 'raid');
    await wants.set(BOB, AWAY, tier('T5'), 'raid');
    expect(await wants.wanting(HOME, [487, -5])).toEqual([
      {
        memberId: ALICE,
        wants: [
          { target: species(487), scope: 'both' },
          { target: tier('T5'), scope: 'raid' },
        ],
      },
      {
        memberId: BOB,
        wants: [
          { target: ORIGIN, scope: 'raid' },
          { target: SHADOW_GIRATINA, scope: 'raid' },
        ],
      },
    ]);
    expect(await wants.wanting(AWAY, [487, -5])).toEqual([
      { memberId: BOB, wants: [{ target: tier('T5'), scope: 'raid' }] },
    ]);
    expect(await wants.wanting(HOME, [])).toEqual([]);
    expect(await wants.wanting(HOME, [25])).toEqual([]);
    expect(await wants.wanting('499999999999999999', [487])).toEqual([]);
  });

  it('reads the rows an event finds through the codec: -6 is a tier or the perfect IVs of 2019', async () => {
    await legacyRow(ALICE, 1, -6, 'both');
    await legacyRow(ALICE, 1, -8, 'both');
    await legacyRow(BOB, 1, -6, 'Raid');
    // Rows nobody can read, and a row without a member.
    await legacyRow(BOB, 1, -7, 'spawn');
    await db
      .insertInto('PokemonNotification')
      .values({ guildId: 1, pokemon: -6, type: 'raid' })
      .execute();
    expect(await wants.wanting(HOME, [-6, -7])).toEqual([
      { memberId: ALICE, wants: [{ target: PERFECT, scope: 'spawn' }] },
      { memberId: BOB, wants: [{ target: tier('MegaLegendary'), scope: 'raid' }] },
    ]);
  });

  it('behaves as its twin in memory does', async () => {
    const memory = new MemoryWants();
    // What the legacy bot may have left: a duplicate, and a row that cannot be read.
    await legacyRow(ALICE, 1, 150, 'Raid');
    await legacyRow(ALICE, 1, 150, 'spawn');
    await legacyRow(ALICE, 1, -7, 'spawn');
    memory.add(ALICE, HOME, 150, 'Raid');
    memory.add(ALICE, HOME, 150, 'spawn');
    memory.add(ALICE, HOME, -7, 'spawn');
    // And rows with a form or for shadow raids: a duplicate, a key no game data has, no key.
    for (const [type, form, shadow] of [
      ['raid', 'giratina_origin', false],
      ['Spawn', 'Giratina_Origin', false],
      ['both', 'giratina_sky', false],
      ['both', 'Origin Forme', false],
      ['both', null, true],
      // An older key of an entry (an alias), beside the key of today.
      ['raid', 'giratina', false],
      ['spawn', 'giratina_altered', false],
    ] as const) {
      await formRow(ALICE, 1, { pokemon: 487, type, form, shadow: shadow ? 1 : 0 });
      memory.add(ALICE, HOME, 487, type, { form, shadow });
    }
    const script = async (storage: WantStorage) => [
      await storage.list(ALICE, HOME),
      await storage.count(ALICE, HOME),
      await storage.set(ALICE, HOME, species(150), 'both'),
      await storage.set(ALICE, HOME, species(150), 'raid'),
      await storage.set(ALICE, HOME, tier('T5'), 'both'),
      await storage.set(ALICE, HOME, PERFECT, 'raid'),
      await storage.set(ALICE, AWAY, species(1), 'spawn'),
      await storage.set(BOB, HOME, species(2), 'both'),
      await storage.set(ALICE, HOME, ORIGIN, 'raid'),
      await storage.set(ALICE, HOME, species(487), 'spawn'),
      await storage.set(ALICE, HOME, SHADOW_GIRATINA, 'both'),
      await storage.set(ALICE, HOME, pokemonTarget(487, 'giratina_origin', true), 'spawn'),
      await storage.set(BOB, HOME, ORIGIN, 'both'),
      await storage.set(BOB, HOME, pokemonTarget(6, 'charizard_mega_y'), 'both'),
      await storage.set(ALICE, HOME, pokemonTarget(487, 'giratina_altered'), 'both'),
      await storage.list(ALICE, HOME),
      await storage.wanting(HOME, [487, 150, -5, -6, 2, -7]),
      await storage.wanting(AWAY, [1, 487]),
      await storage.wanting(HOME, []),
      await storage.remove(ALICE, HOME, species(2)),
      await storage.remove(ALICE, HOME, tier('T5')),
      await storage.remove(ALICE, HOME, pokemonTarget(487, 'giratina_sky')),
      await storage.remove(ALICE, HOME, SHADOW_GIRATINA),
      await storage.remove(ALICE, HOME, SHADOW_GIRATINA),
      await storage.list(ALICE, HOME),
      await storage.count(ALICE, HOME),
      await storage.removeAll(ALICE, HOME),
      await storage.list(ALICE, HOME),
      await storage.count(ALICE, AWAY),
      await storage.list(BOB, HOME),
      await storage.removeAll(BOB, HOME),
    ];
    expect(await script(wants)).toEqual(await script(memory));
  });
});
