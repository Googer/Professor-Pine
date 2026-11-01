import { describe, expect, it } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { ALICE } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { MemorySpawnReports } from '../../test/support/spawn-reports.js';
import { SPAWN_MINUTES } from '../render/spawn.js';
import { GIVE_UP_MS, SpawnService, type SpawnReport } from './spawn-service.js';

const HALF_HOUR = SPAWN_MINUTES * 60_000;

const report = (guildId: string): SpawnReport => ({
  guildId,
  regionChannelId: WEST_CHANNEL,
  pokemon: { dex: 147, key: 'dratini', name: 'Dratini' },
  details: 'by the fountain',
  reporter: { id: ALICE, name: 'Alice' },
});

const background = watchEachTest();

/** Lets the work in the background finish, then checks that `done` came of it. */
async function until(done: () => boolean): Promise<void> {
  await background.settle();
  if (!done()) throw new Error('it never happened');
}

/** A service over a store of reports; `again()` is the service of the next process. */
async function stored() {
  const made = await partyServiceWith();
  const store = new MemorySpawnReports();
  const service = () => {
    const timers: { run: () => void; ms: number }[] = [];
    const spawns = new SpawnService({
      gateway: made.gateway,
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      store,
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      setTimer: (run, ms) => {
        timers.push({ run, ms });
        return () => undefined;
      },
    });
    return { spawns, timers };
  };
  return { made, store, ...service(), again: service };
}

describe('SpawnService with stored reports', () => {
  it('records a report with the time it is due, and forgets it once it is deleted', async () => {
    const { made, store, spawns, timers } = await stored();
    const outcome = await spawns.report(report(made.gateway.guildId));
    if (outcome.kind !== 'posted') throw new Error('not posted');
    expect(store.rows).toEqual([
      {
        channelId: WEST_CHANNEL,
        messageId: outcome.messageId,
        deleteAt: made.clock.now + HALF_HOUR,
      },
    ]);
    timers[0]?.run();
    await until(() => store.rows.length === 0);
    expect(made.gateway.deleted).toEqual([
      { channelId: WEST_CHANNEL, messageId: outcome.messageId },
    ]);
  });

  it('posts a report all the same when it cannot be recorded', async () => {
    const { made, store, spawns } = await stored();
    store.failing = new Error('the database is away');
    expect(await spawns.report(report(made.gateway.guildId))).toMatchObject({ kind: 'posted' });
    expect(spawns.pending).toBe(1);
    expect(
      made.entries.filter((entry) => entry.msg === 'could not record a spawn report'),
    ).toMatchObject([
      { msg: 'could not record a spawn report', err: { message: 'the database is away' } },
    ]);
  });

  it('deletes after a restart what is overdue, and the rest when it is due', async () => {
    const { made, store, spawns, again } = await stored();
    const early = await spawns.report(report(made.gateway.guildId));
    made.clock.now += 20 * 60_000;
    const late = await spawns.report(report(made.gateway.guildId));
    if (early.kind !== 'posted' || late.kind !== 'posted') throw new Error('not posted');
    // The process is killed: nothing is deleted. The next one starts a quarter of an hour on.
    made.clock.now += 15 * 60_000;
    const next = again();
    expect(await next.spawns.sweep()).toBe(2);
    expect(next.timers.map((timer) => timer.ms)).toEqual([0, 15 * 60_000]);
    expect(next.spawns.pending).toBe(2);
    next.timers[0]?.run();
    await until(() => store.rows.length === 1);
    expect(made.gateway.deleted).toEqual([{ channelId: WEST_CHANNEL, messageId: early.messageId }]);
    expect(store.rows).toMatchObject([{ messageId: late.messageId }]);
  });

  it('leaves alone at a sweep what already waits for its time', async () => {
    const { made, spawns, timers } = await stored();
    await spawns.report(report(made.gateway.guildId));
    expect(await spawns.sweep()).toBe(0);
    expect(timers).toHaveLength(1);
  });

  it('tries a report again at every sweep while its deletion fails, and gives up after a day', async () => {
    const { made, store, spawns, timers } = await stored();
    await spawns.report(report(made.gateway.guildId));
    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    timers[0]?.run();
    await until(() => timers.length === 2);
    timers[1]?.run();
    await until(
      () => made.entries.filter((e) => e.msg === 'could not delete a spawn report').length === 1,
    );
    // Both tries of its own failed: it stays recorded, and the hourly sweep takes it up.
    expect(store.rows).toHaveLength(1);
    expect(spawns.pending).toBe(0);
    made.clock.now += HALF_HOUR + 60 * 60_000;
    expect(await spawns.sweep()).toBe(1);
    expect(timers[2]?.ms).toBe(0);
    timers[2]?.run();
    await until(
      () => made.entries.filter((e) => e.msg === 'could not delete a spawn report').length === 2,
    );
    expect(store.rows).toHaveLength(1);
    // A day after it was due nothing is tried any more.
    made.clock.now += GIVE_UP_MS;
    expect(await spawns.sweep()).toBe(0);
    expect(store.rows).toEqual([]);
    expect(timers).toHaveLength(3);
    expect(made.entries.at(-1)).toMatchObject({
      level: 40,
      msg: 'gave up deleting a spawn report',
      channel: WEST_CHANNEL,
    });
  });

  it('sweeps nothing once the bot shuts down, and without a store', async () => {
    const { made, spawns, again } = await stored();
    await spawns.report(report(made.gateway.guildId));
    const next = again();
    await next.spawns.flush();
    expect(await next.spawns.sweep()).toBe(0);
    expect(next.timers).toEqual([]);
    const bare = new SpawnService({
      gateway: made.gateway,
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      settings: made.settings,
      log: made.log,
    });
    expect(await bare.sweep()).toBe(0);
  });
});
