import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { BoardRepository } from '../db/repositories/board-repository.js';
import { HistoryRepository } from '../db/repositories/history-repository.js';
import {
  LegacyFillInRepository,
  type FillInJob,
} from '../db/repositories/legacy-fill-in-repository.js';
import type { DB } from '../db/types.js';
import { writeServerIndex } from '../ops/legacy-index.js';
import { LegacyFillInService } from './legacy-fill-in.js';
import { MemberStatsService } from './member-stats.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NOW = 1_800_000_000_000;
const MODES = { dir: 0o755, file: 0o644 };
const key = (n: number) => `3100000000${String(n).padStart(8, '0')}:1650000000000`;

describe('LegacyFillInService: filling in a member’s legacy history', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let history: HistoryRepository;
  let fillIns: LegacyFillInRepository;
  let root: string;
  let now: number;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    history = new HistoryRepository(db);
    fillIns = new LegacyFillInRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('PartyHistory').execute();
    await db.deleteFrom('HistoryOptIn').execute();
    await db.deleteFrom('LegacyFillIn').execute();
    root = mkdtempSync(path.join(tmpdir(), 'legacy-index-'));
    now = NOW;
  });

  /** A record of the history: its key, server, source, maker and attendees' places. */
  const record = async (
    legacyKey: string,
    options: {
      server?: string;
      source?: 'live' | 'legacy';
      maker?: string | null;
      places?: [furthest: string, extras: number, groupId: string | null, memberId?: string][];
      createdAt?: number;
    } = {},
  ) => {
    const source = options.source ?? 'legacy';
    await sql`insert into PartyHistory (source, partyId, legacyKey, kind, serverId, createdAt,
                                        ending, createdById)
              values (${source}, ${source === 'live' ? legacyKey : null},
                      ${source === 'legacy' ? legacyKey : null}, 'raid',
                      ${options.server ?? HOME}, ${options.createdAt ?? NOW}, 'unknown',
                      ${options.maker ?? null})`.execute(db);
    const id = Number(
      (await sql<{ id: number }>`select max(id) as id from PartyHistory`.execute(db)).rows[0]?.id,
    );
    for (const [seq, [furthest, extras, groupId, memberId]] of (options.places ?? []).entries()) {
      await sql`insert into PartyHistoryAttendee (historyId, seq, memberId, status, furthest,
                                                  extras, groupId)
                values (${id}, ${seq}, ${memberId ?? null}, ${furthest}, ${furthest}, ${extras},
                        ${groupId})`.execute(db);
    }
    return id;
  };
  const index = (server: string, members: Record<string, string[]>) => {
    writeServerIndex(root, server, new Map(Object.entries(members)), MODES);
  };
  const service = (more: Partial<ConstructorParameters<typeof LegacyFillInService>[0]> = {}) => {
    const { log, entries } = createTestLogger();
    const fill = new LegacyFillInService({
      storage: fillIns,
      indexDir: root,
      log,
      now: () => now,
      ...more,
    });
    return { fill, entries };
  };
  const asked = async (member = ALICE, server = HOME) => {
    await history.optIn(member, server, now);
    expect(await fillIns.request(member, server, now)).toBe('queued');
  };
  const named = async () => ({
    makers: (
      await db.selectFrom('PartyHistory').select(['id', 'createdById']).orderBy('id').execute()
    ).map((row) => [row.id, row.createdById]),
    places: (
      await db
        .selectFrom('PartyHistoryAttendee')
        .select(['historyId', 'seq', 'memberId'])
        .orderBy('historyId')
        .orderBy('seq')
        .execute()
    ).map((row) => [row.historyId, row.seq, row.memberId]),
  });

  it('names the member where the index says, only in empty places as the files tell them', async () => {
    const a = await record(key(1), {
      places: [
        ['done', 1, 'A'],
        ['joined', 0, 'B', BOB],
      ],
    });
    const b = await record(key(2), { maker: BOB, places: [['here', 0, null]] });
    // Another server's record of the same key, a live record, and a place stored otherwise.
    const away = await record(key(3), { server: AWAY, places: [['done', 0, 'A']] });
    const live = await record(key(4), { source: 'live', places: [['done', 0, 'A']] });
    const other = await record(key(5), { places: [['done', 2, 'A']] });
    index(HOME, {
      [ALICE]: [
        `${key(1)} r`,
        `${key(1)} a 0 done 1 A`,
        `${key(1)} a 1 joined 0 B`,
        `${key(2)} r`,
        `${key(2)} a 0 here 0`,
        `${key(3)} a 0 done 0 A`,
        `${key(4)} a 0 done 0 A`,
        `${key(5)} a 0 done 0 A`,
      ],
    });
    await asked();
    const { fill, entries } = service({ batchSize: 3 });
    fill.kick();
    await fill.idle();
    expect(await named()).toEqual({
      makers: [
        [a, ALICE],
        [b, BOB],
        [away, null],
        [live, null],
        [other, null],
      ],
      places: [
        [a, 0, ALICE],
        [a, 1, BOB],
        [b, 0, ALICE],
        [away, 0, null],
        [live, 0, null],
        [other, 0, null],
      ],
    });
    // Two parties: the first as its maker and attendee, counted once.
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({ state: 'done', filled: 2 });
    const warned = entries.filter((entry) => entry.level === 40);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatchObject({ server: HOME, skipped: 5 });
    expect(String(warned[0]?.msg)).toMatch(/left out/u);
    // `namedIn` and the opt-out see them as they see live ones.
    expect(await history.namedIn(ALICE, HOME)).toBe(2);
  });

  it('stops where the member opts out during a fill-in, and leaves no id behind', async () => {
    const ids: number[] = [];
    for (const n of [1, 2, 3, 4]) ids.push(await record(key(n), { places: [['done', 0, 'A']] }));
    index(HOME, { [ALICE]: [1, 2, 3, 4].map((n) => `${key(n)} a 0 done 0 A`) });
    await asked();
    let batches = 0;
    const storage: LegacyFillInRepository = Object.create(fillIns) as LegacyFillInRepository;
    storage.fillBatch = async (job: FillInJob, batch, at) => {
      const done = await fillIns.fillBatch(job, batch, at);
      if (++batches === 1) await history.optOut(ALICE, HOME);
      return done;
    };
    const { fill } = service({ storage, batchSize: 2 });
    fill.kick();
    await fill.idle();
    expect(batches).toBe(2);
    expect((await named()).places).toEqual(ids.map((id) => [id, 0, null]));
    expect(await fillIns.stateOf(ALICE, HOME)).toBeUndefined();
  });

  it('marks a fill-in failed whose member file is gone, and waits out a server index being swapped', async () => {
    mkdirSync(path.join(root, HOME));
    await asked();
    await asked(ALICE, AWAY);
    const { fill, entries } = service();
    fill.kick();
    await fill.idle();
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({
      state: 'failed',
      failure: 'The member index has no file of theirs (it was rebuilt without them).',
    });
    const warned = entries.filter((entry) => entry.level === 40);
    expect(warned).toHaveLength(2);
    expect(warned[0]).toMatchObject({ server: HOME });
    expect(warned[0]?.err).toMatchObject({
      message: 'The member index has no file of theirs (it was rebuilt without them).',
    });
    // No index of the other server (between the swap's two renames): asked again later, warned.
    expect(warned[1]).toMatchObject({ server: AWAY });
    expect(await fillIns.stateOf(ALICE, AWAY)).toEqual({ state: 'queued' });
    index(AWAY, { [ALICE]: [] });
    fill.kick();
    await fill.idle();
    expect(await fillIns.stateOf(ALICE, AWAY)).toEqual({ state: 'queued' });
    now += 11 * 60_000;
    fill.kick();
    await fill.idle();
    expect(await fillIns.stateOf(ALICE, AWAY)).toEqual({ state: 'done', filled: 0 });
  });

  it('fails a fill-in whose server has had no index for a day (B5)', async () => {
    await asked();
    now += 25 * 60 * 60_000;
    const { fill } = service();
    fill.kick();
    await fill.idle();
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({
      state: 'failed',
      failure: 'The member index has no folder of this server.',
    });
  });

  it('says why staff must look at a file it may not read, or one that is damaged (B8)', async () => {
    await asked();
    await asked(BOB);
    const reasons = new Map([
      [ALICE, 'cannot be read (EACCES)'],
      [BOB, 'not JSON'],
    ]);
    const { fill, entries } = service({
      readIndex: (_root, _server, member) =>
        Promise.resolve({ kind: 'unreadable', reason: reasons.get(member) ?? '' }),
    });
    fill.kick();
    await fill.idle();
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({
      state: 'failed',
      failure: 'The bot may not read their file in the member index: ask whoever runs the bot.',
    });
    expect(await fillIns.stateOf(BOB, HOME)).toEqual({
      state: 'failed',
      failure: 'Their file in the member index is damaged: run the history import again.',
    });
    // The file system's code in the log alone.
    expect(JSON.stringify(entries)).toContain('EACCES');
  });

  it('warns once at start where the bot may not read the member index (B2)', async () => {
    index(HOME, { [ALICE]: [] });
    const refused = service({
      access: (target) =>
        target.endsWith(HOME) ? Promise.reject(new Error('EACCES')) : Promise.resolve(),
    });
    await refused.fill.checkReadable();
    expect(refused.entries.filter((entry) => entry.level === 40)).toEqual([
      expect.objectContaining({
        msg: 'the member index cannot be read by the bot’s user; members are offered no old-bot history',
      }),
    ]);
    const fine = service();
    await fine.fill.checkReadable();
    expect(fine.entries.filter((entry) => entry.level === 40)).toEqual([]);
  });

  it('counts a party the member made and joined once, a batch apiece (A8)', async () => {
    await record(key(1), { places: [['done', 0, 'A']] });
    index(HOME, { [ALICE]: [`${key(1)} r`, `${key(1)} a 0 done 0 A`] });
    await asked();
    const { fill } = service({ batchSize: 1 });
    fill.kick();
    await fill.idle();
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({ state: 'done', filled: 1 });
  });

  it('lets another bot take over a lapsed claim between two batches, counting right (A8)', async () => {
    const ids: number[] = [];
    for (const n of [1, 2, 3]) {
      ids.push(
        await record(key(n), {
          places: [
            ['done', 0, 'A'],
            ['done', 0, 'A', BOB],
          ],
        }),
      );
    }
    index(HOME, { [ALICE]: [1, 2, 3].map((n) => `${key(n)} a 0 done 0 A`) });
    await asked();
    let batches = 0;
    const storage: LegacyFillInRepository = Object.create(fillIns) as LegacyFillInRepository;
    storage.fillBatch = async (job: FillInJob, batch, at) => {
      const done = await fillIns.fillBatch(job, batch, at);
      if (++batches === 1) {
        // The first bot stalls past its claim: a second takes the request over and ends it.
        now += 11 * 60_000;
        const other = service();
        other.fill.kick();
        await other.fill.idle();
      }
      return done;
    };
    const { fill } = service({ storage, batchSize: 1 });
    fill.kick();
    await fill.idle();
    expect(batches).toBe(2);
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({ state: 'done', filled: 3 });
    expect((await named()).places).toEqual(
      ids.flatMap((id) => [
        [id, 0, ALICE],
        [id, 1, BOB],
      ]),
    );
  });

  it('takes the oldest request first, one at a time, each claimed by one bot', async () => {
    await record(key(1), {
      places: [
        ['done', 0, 'A'],
        ['done', 0, 'A'],
      ],
    });
    index(HOME, { [ALICE]: [`${key(1)} a 0 done 0 A`], [BOB]: [`${key(1)} a 1 done 0 A`] });
    await asked(BOB);
    now += 1;
    await asked(ALICE);
    const job = await fillIns.nextWaiting(now, 600_000);
    expect(job).toEqual({ serverId: HOME, memberId: BOB, requestedAt: NOW });
    if (job === undefined) return;
    expect(await fillIns.claim(job, now, 600_000)).toBe(true);
    expect(await fillIns.claim(job, now, 600_000)).toBe(false);
    expect(await fillIns.nextWaiting(now, 600_000)).toEqual({
      serverId: HOME,
      memberId: ALICE,
      requestedAt: NOW + 1,
    });
    // Two bots on one database: each fill-in once.
    const first = service();
    const second = service();
    first.fill.kick();
    second.fill.kick();
    await Promise.all([first.fill.idle(), second.fill.idle()]);
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({ state: 'done', filled: 1 });
    // Bob's is claimed by a bot that went away: taken up again once its claim is stale.
    expect(await fillIns.stateOf(BOB, HOME)).toEqual({ state: 'queued' });
    now += 11 * 60_000;
    first.fill.kick();
    await first.fill.idle();
    expect(await fillIns.stateOf(BOB, HOME)).toEqual({ state: 'done', filled: 1 });
  });

  it('starts no batch after its stop, and gives its claim back for the next start (B9)', async () => {
    for (const n of [1, 2, 3]) await record(key(n), { places: [['done', 0, 'A']] });
    index(HOME, { [ALICE]: [1, 2, 3].map((n) => `${key(n)} a 0 done 0 A`) });
    await asked();
    let batches = 0;
    const storage: LegacyFillInRepository = Object.create(fillIns) as LegacyFillInRepository;
    const { fill } = service({ storage, batchSize: 1 });
    storage.fillBatch = async (job: FillInJob, batch, at) => {
      batches += 1;
      fill.stop();
      return fillIns.fillBatch(job, batch, at);
    };
    fill.kick();
    await fill.idle();
    expect(batches).toBe(1);
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({ state: 'queued' });
    fill.kick();
    await fill.idle();
    expect(batches).toBe(1);
    // At once: the stopped run gave its claim back.
    const next = service();
    next.fill.kick();
    await next.fill.idle();
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({ state: 'done', filled: 3 });
  });

  it('counts the parties filled in in the member’s own stats, back to the old bot’s years (H13)', async () => {
    // 2018 and 2020: a raid she completed, and one she made and completed.
    await record(key(1), { places: [['done', 0, 'A']], createdAt: Date.UTC(2018, 5, 15) });
    await record(key(2), { places: [['done', 0, 'A']], createdAt: Date.UTC(2020, 5, 15) });
    index(HOME, {
      [ALICE]: [`${key(1)} a 0 done 0 A`, `${key(2)} r`, `${key(2)} a 0 done 0 A`],
    });
    await asked();
    const stats = new MemberStatsService({
      reader: new BoardRepository(db),
      optIns: history,
      zone: 'America/New_York',
      now: () => now,
    });
    const before = await stats.stats(HOME, ALICE);
    expect(before.optedIn && before.stats.completed).toBe(0);
    expect(before.optedIn && before.years).toEqual([]);
    const { fill } = service();
    fill.kick();
    await fill.idle();
    const after = await stats.stats(HOME, ALICE);
    expect(after.optedIn && after.stats.completed).toBe(2);
    expect(after.optedIn && after.stats.months).toEqual([
      { month: '2018-06', came: 1, reports: 0 },
      { month: '2020-06', came: 1, reports: 0 },
    ]);
    expect(after.optedIn && after.years).toEqual([2020, 2018]);
    // The raids she reported count what others confirmed, of live records only (QB): none here.
    expect(after.optedIn && after.stats.raids.count).toBe(0);
  });

  it('fills in a member of thousands of parties in seconds', async () => {
    const parties = 5_000;
    // Legacy records as the import writes them: by thousands, each with three places.
    const records = Array.from({ length: parties }, (_, n) => n + 1);
    for (let start = 0; start < parties; start += 1_000) {
      const chunk = records.slice(start, start + 1_000);
      await sql`insert into PartyHistory (source, legacyKey, kind, serverId, createdAt, ending)
                values ${sql.join(
                  chunk.map((n) => sql`('legacy', ${key(n)}, 'raid', ${HOME}, ${NOW}, 'unknown')`),
                )}`.execute(db);
      await sql`insert into PartyHistoryAttendee (historyId, seq, status, furthest, extras, groupId)
                select h.id, s.seq, 'done', 'done', 0, 'A' from PartyHistory h
                cross join (select 0 as seq union all select 1 union all select 2) s
                where h.legacyKey in (${sql.join(chunk.map(key))})`.execute(db);
    }
    index(HOME, {
      [ALICE]: records.flatMap((n) =>
        n % 10 === 0 ? [`${key(n)} r`, `${key(n)} a 1 done 0 A`] : [`${key(n)} a 1 done 0 A`],
      ),
    });
    await asked();
    const { fill } = service();
    const started = performance.now();
    fill.kick();
    await fill.idle();
    const took = performance.now() - started;
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({ state: 'done', filled: parties });
    expect(await history.namedIn(ALICE, HOME)).toBe(parties);
    // The measure for the plan (aim: seconds), not a bound: the laptop's timings are inflated.
    process.stdout.write(`legacy fill-in of ${String(parties)} parties: ${took.toFixed(0)} ms\n`);
  });
});
