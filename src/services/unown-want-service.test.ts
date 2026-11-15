import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { MemoryUnownGifts } from '../../test/support/unown-gifts.js';
import { MemoryWants } from '../../test/support/wants.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import { MET_MEMBERS, UnownWantService } from './unown-want-service.js';
import {
  TEST_UNOWN_ROLE,
  TestServers,
  testServerValues,
} from '../../test/support/server-values.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const ALICE = '200000000000000002';
const BOB = '200000000000000003';
const UNOWN = pokemonTarget(201);
const NOW = 1_800_000_000_000;
const UNOWN_ROLE = TEST_UNOWN_ROLE;
const OTHER_UNOWN_ROLE = '300000000000000022';
const VALOR = '300000000000000023';

function setup(more: { maxMet?: number; servers?: TestServers } = {}) {
  const wants = new MemoryWants();
  const gifts = new MemoryUnownGifts(new Set([HOME, AWAY]));
  const { log, entries } = createTestLogger();
  const options = {
    wants,
    gifts,
    gameData: { catalogue: catalogueFixture() },
    servers: new TestServers(),
    log,
    now: () => NOW,
    ...more,
  };
  const service = new UnownWantService(options);
  /** A service as after a restart: it remembers nobody, over the same database. */
  const restarted = () => new UnownWantService(options);
  /** A member uses the bot; gives how often their roles were read. */
  const reads = { count: 0 };
  const meet = (on: UnownWantService, memberId: string, roles: string[], guildId = HOME): void => {
    on.noticed(guildId, memberId, () => {
      reads.count += 1;
      return roles;
    });
  };
  const wantsOf = async (memberId: string, guildId = HOME) =>
    (await wants.list(memberId, guildId)).wants;
  return { service, restarted, wants, gifts, entries, meet, reads, wantsOf };
}

describe('UnownWantService', () => {
  it('gives a holder of the role a want for the spawns of Unown, and records it', async () => {
    const made = setup();
    made.meet(made.service, ALICE, [VALOR, UNOWN_ROLE]);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toEqual([{ target: UNOWN, scope: 'spawn' }]);
    expect(made.gifts.rows).toEqual([{ memberId: ALICE, guildId: HOME, createdAt: NOW }]);
  });

  it("reads the role by the id the server's staff set, whatever its name", async () => {
    const made = setup();
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    // Another role named unown is not it.
    made.meet(made.service, BOB, [OTHER_UNOWN_ROLE, VALOR]);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toHaveLength(1);
    expect(await made.wantsOf(BOB)).toEqual([]);
    expect(made.gifts.rows.map((row) => row.memberId)).toEqual([ALICE]);
  });

  it('gives nobody one in a server whose staff set no Unown role', async () => {
    const made = setup({
      servers: new TestServers(testServerValues({ roles: {} })),
    });
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toEqual([]);
  });

  it('gives it once: a member who removed the want keeps it removed, also after a restart', async () => {
    const made = setup();
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    await made.service.flush();
    await made.wants.remove(ALICE, HOME, UNOWN);
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    await made.service.flush();
    const again = made.restarted();
    made.meet(again, ALICE, [UNOWN_ROLE]);
    await again.flush();
    expect(await made.wantsOf(ALICE)).toEqual([]);
    expect(made.gifts.rows).toHaveLength(1);
  });

  it('leaves a member who has a want for Unown as they are, and records that it is settled', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, pokemonTarget(201, 'unown_f'), 'both');
    await made.wants.set(BOB, HOME, UNOWN, 'raid');
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    made.meet(made.service, BOB, [UNOWN_ROLE]);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toEqual([
      { target: pokemonTarget(201, 'unown_f'), scope: 'both' },
    ]);
    expect(await made.wantsOf(BOB)).toEqual([{ target: UNOWN, scope: 'raid' }]);
    expect(made.gifts.rows.map((row) => row.memberId).sort()).toEqual([ALICE, BOB].sort());
  });

  it('is per server', async () => {
    const made = setup();
    made.meet(made.service, ALICE, [UNOWN_ROLE], HOME);
    made.meet(made.service, ALICE, [], AWAY);
    await made.service.flush();
    expect(await made.wantsOf(ALICE, HOME)).toHaveLength(1);
    expect(await made.wantsOf(ALICE, AWAY)).toEqual([]);
  });

  it('costs one look into a set after the first interaction of a member, role or not', async () => {
    const made = setup();
    for (let n = 0; n < 5; n++) {
      made.meet(made.service, ALICE, [UNOWN_ROLE]);
      made.meet(made.service, BOB, ['Valor']);
    }
    expect(made.reads.count).toBe(2);
    expect(made.service.seen).toBe(2);
    await made.service.flush();
    expect(made.gifts.rows).toHaveLength(1);
  });

  it('returns at once: nothing is read or written before the interaction goes on', async () => {
    const made = setup();
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    expect(made.wants.rows).toEqual([]);
    expect(made.gifts.rows).toEqual([]);
    await made.service.flush();
    expect(made.wants.rows).toHaveLength(1);
  });

  it('does nothing where notifications are off', async () => {
    const made = setup({
      servers: new TestServers(
        testServerValues({
          features: { ...testServerValues().features, notifications: false },
        }),
      ),
    });
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    await made.service.flush();
    expect(made.reads.count).toBe(0);
    expect(made.wants.rows).toEqual([]);
    expect(made.gifts.rows).toEqual([]);
  });

  it('never throws, logs what fails, and tries again with the member’s next interaction', async () => {
    const made = setup();
    made.wants.failing = new Error('the database is away');
    expect(() => {
      made.meet(made.service, ALICE, [UNOWN_ROLE]);
    }).not.toThrow();
    await made.service.flush();
    expect(made.gifts.rows).toEqual([]);
    expect(made.entries.some((entry) => entry.msg === 'could not give an Unown want')).toBe(true);
    made.wants.failing = undefined;
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toHaveLength(1);
    expect(made.gifts.rows).toHaveLength(1);
    // Roles that cannot be read are no reason to fail either.
    expect(() => {
      made.service.noticed(HOME, BOB, () => {
        throw new Error('no roles');
      });
    }).not.toThrow();
  });

  it('gives nothing twice when the record could not be written after the want', async () => {
    const made = setup();
    made.gifts.failing = new Error('the database is away');
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    await made.service.flush();
    // The first read of the record failed: nothing was given.
    expect(made.wants.rows).toEqual([]);
    made.gifts.failing = undefined;
    const real = made.gifts.record.bind(made.gifts);
    made.gifts.record = () => Promise.reject(new Error('lost'));
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toHaveLength(1);
    expect(made.gifts.rows).toEqual([]);
    // The next try finds the want and only records.
    made.gifts.record = real;
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    await made.service.flush();
    expect(made.wants.rows).toHaveLength(1);
    expect(made.gifts.rows).toHaveLength(1);
  });

  it('retries only the record when that failed: a want the member removed meanwhile stays removed', async () => {
    const made = setup();
    const real = made.gifts.record.bind(made.gifts);
    made.gifts.record = () => Promise.reject(new Error('lost'));
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toHaveLength(1);
    expect(made.gifts.rows).toEqual([]);
    // She does not want it: with the record still owed, her next interaction must not give
    // it back.
    await made.wants.remove(ALICE, HOME, UNOWN);
    made.gifts.record = real;
    made.meet(made.service, ALICE, [UNOWN_ROLE]);
    await made.service.flush();
    expect(await made.wantsOf(ALICE)).toEqual([]);
    expect(made.gifts.rows).toEqual([{ memberId: ALICE, guildId: HOME, createdAt: NOW }]);
    // And a record that fails again is owed again.
    const other = setup();
    other.gifts.record = () => Promise.reject(new Error('lost'));
    other.meet(other.service, ALICE, [UNOWN_ROLE]);
    await other.service.flush();
    await other.wants.remove(ALICE, HOME, UNOWN);
    other.meet(other.service, ALICE, [UNOWN_ROLE]);
    await other.service.flush();
    other.meet(other.service, ALICE, [UNOWN_ROLE]);
    await other.service.flush();
    expect(await other.wantsOf(ALICE)).toEqual([]);
    expect(
      other.entries.filter((entry) => entry.msg === 'could not give an Unown want'),
    ).toHaveLength(3);
  });

  it('remembers a limited number of members: the one met longest ago is looked at again', () => {
    const made = setup({ maxMet: 3 });
    const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));
    for (let n = 0; n < 4; n++) made.meet(made.service, idOf(n), []);
    expect(made.service.seen).toBe(3);
    expect(made.reads.count).toBe(4);
    // The three newest are known; the first is met anew.
    for (let n = 1; n < 4; n++) made.meet(made.service, idOf(n), []);
    expect(made.reads.count).toBe(4);
    made.meet(made.service, idOf(0), []);
    expect(made.reads.count).toBe(5);
    expect(made.service.seen).toBe(3);
    expect(MET_MEMBERS).toBeGreaterThanOrEqual(10_000);
  });
});
