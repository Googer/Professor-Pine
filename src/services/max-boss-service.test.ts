import { describe, expect, it } from 'vitest';
import {
  at,
  MAX_FEED_READ_AT,
  MAX_ZONE,
  pokebattlerFeed,
  readPokebattlerFeed,
} from '../../test/support/max-bosses.js';
import { feedReply } from '../../test/support/raid-bosses.js';
import { maxBossServiceWith } from '../../test/support/max-boss-service.js';
import { readMaxEventFeed } from '../../test/support/max-events.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { pokemonFixture } from '../../test/support/providers.js';
import { parseBigEventFeed, parseMaxEventFeed } from '../domain/time/max-events.js';
import { NO_MAX_BOSSES } from '../../test/support/test-context.js';
import { currentMaxBossChoices } from './max-boss-service.js';

describe('MaxBossService', () => {
  it('stores the feed and offers the bosses of the day, an upcoming one from its day', async () => {
    const { service, state } = await maxBossServiceWith();
    expect(await service.sync()).toMatchObject({ status: 'updated' });
    expect(service.feedBosses()).toHaveLength(60);
    const names = () => service.bosses().map((boss) => boss.name);
    expect(names()).toHaveLength(57);
    expect(names()).not.toContain('Uxie');
    state.now = at('2026-10-24T00:00');
    expect(names()).toHaveLength(60);
    expect(
      service
        .bosses()
        .filter((boss) => boss.tier === 'D5')
        .map((boss) => boss.name),
    ).toEqual(['Azelf', 'Mesprit', 'Uxie']);
  });

  it('keeps an upcoming boss back after a restart too: its start is stored', async () => {
    const { service, store, restarted } = await maxBossServiceWith();
    await service.sync();
    const again = await restarted();
    expect(again.feedBosses()).toEqual(service.feedBosses());
    expect(again.bosses().some((boss) => boss.name === 'Uxie')).toBe(false);
    expect(await store.lastSyncedAt()).toBe(MAX_FEED_READ_AT);
  });

  it('tells of a Pokémon the game data does not know once, and lists it by its id', async () => {
    const { service, state, logged } = await maxBossServiceWith();
    const feed = JSON.stringify(
      pokebattlerFeed({ RAID_LEVEL_6_MAX: [{ pokemonId: 'NEWMON_GIGANTAMAX' }] }),
    );
    state.respond = () => Promise.resolve(feedReply(200, feed));
    await service.sync();
    state.now += 60_000;
    await service.sync();
    const told = logged.filter(
      (entry) => entry['msg'] === 'the max boss feed names a Pokémon the game data does not know',
    );
    expect(told.map((entry) => entry['id'])).toEqual(['NEWMON_GIGANTAMAX']);
    expect(service.bosses().map((boss) => [boss.name, boss.tier, boss.entry])).toEqual([
      ['Newmon', 'G', undefined],
    ]);
  });

  it('says its failures as max bosses, and keeps the list it had', async () => {
    const { service, state, logged } = await maxBossServiceWith();
    await service.sync();
    state.respond = () => Promise.resolve(feedReply(200, JSON.stringify({ tiers: [] })));
    state.now += 60_000;
    expect(await service.sync()).toMatchObject({ status: 'failed', kind: 'unreadable' });
    expect(logged.some((entry) => entry['msg'] === 'could not sync the max bosses')).toBe(true);
    expect(service.feedBosses()).toHaveLength(60);
  });

  it('takes its own overrides, and refuses an autoset or a shiny one for every tier', async () => {
    const { service } = await maxBossServiceWith();
    await service.sync();
    const ids = { pokemonId: 'MACHAMP', form: null, createdBy: '123456789012345678' };
    await service.addOverride({ ...ids, action: 'add', tier: 'G', shiny: true, expiresAt: null });
    expect(
      service
        .bosses()
        .filter((boss) => boss.tier === 'G')
        .map((boss) => boss.key),
    ).toEqual(['machamp']);
    await expect(
      service.addOverride({ ...ids, action: 'autoset', tier: 'D2', shiny: null, expiresAt: null }),
    ).rejects.toThrow(RangeError);
    await expect(
      service.addOverride({ ...ids, action: 'shiny', tier: null, shiny: true, expiresAt: null }),
    ).rejects.toThrow(/max battle tier/);
  });

  it('gives the choices of the moment: the featured boss of the week first', async () => {
    const { service, state } = await maxBossServiceWith();
    await service.sync();
    const events = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
    const deps = {
      maxBosses: service,
      maxEvents: { maxEvents: () => events, bigEvents: () => [] },
      pokemon: pokemonFixture(),
      gameData: { catalogue: catalogueFixture() },
      zone: MAX_ZONE,
    };
    state.now = at('2026-10-24T15:00');
    const choices = currentMaxBossChoices(deps, state.now);
    expect(choices.slice(0, 4).map((one) => one.name)).toEqual([
      'Uxie · Dynamax 5★',
      'Mesprit · Dynamax 5★',
      'Azelf · Dynamax 5★',
      'Sneasel · Dynamax 1★',
    ]);
    expect(currentMaxBossChoices({ ...deps, maxBosses: NO_MAX_BOSSES }, state.now)).toEqual([]);
  });

  // Matt, 2026-10-21 (Q-A): in a big event, Gigantamax battles are what is up all day.
  it('lists the Gigantamax bosses first during a big event, and last outside one', async () => {
    const { service } = await maxBossServiceWith();
    await service.sync();
    const feed = readMaxEventFeed();
    const deps = {
      maxBosses: service,
      maxEvents: {
        maxEvents: () => parseMaxEventFeed(feed, MAX_ZONE).events,
        bigEvents: () => parseBigEventFeed(feed, MAX_ZONE),
      },
      pokemon: pokemonFixture(),
      gameData: { catalogue: catalogueFixture() },
      zone: MAX_ZONE,
    };
    const ids = { pokemonId: 'MACHAMP', form: null, createdBy: '123456789012345678' };
    await service.addOverride({ ...ids, action: 'add', tier: 'G', shiny: null, expiresAt: null });
    const kinds = (time: number) =>
      currentMaxBossChoices(deps, time).map((one) => (one.boss.tier === 'G' ? 'G' : 'D'));
    // Pokémon GO Wild Area 2026: Global, 2026-11-14 10:00 to 11-15 18:00.
    const inside = kinds(at('2026-11-14T12:00'));
    expect(inside[0]).toBe('G');
    expect(inside.indexOf('D')).toBeGreaterThan(inside.lastIndexOf('G'));
    const outside = kinds(at('2026-11-13T12:00'));
    expect(outside.at(-1)).toBe('G');
    expect(outside[0]).toBe('D');
  });

  it('offers an upcoming boss no more once its event is over (plan 8X-3)', async () => {
    const { service, state } = await maxBossServiceWith();
    await service.sync();
    const events = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
    const deps = {
      maxBosses: service,
      maxEvents: { maxEvents: () => events, bigEvents: () => [] },
      pokemon: pokemonFixture(),
      gameData: { catalogue: catalogueFixture() },
      zone: MAX_ZONE,
    };
    state.now = at('2026-10-25T12:00');
    const names = currentMaxBossChoices(deps, state.now).map((one) => one.name);
    expect(names).not.toContain('Uxie · Dynamax 5★');
    expect(names).toContain('Sneasel · Dynamax 1★');
  });

  it('keeps a Gigantamax boss staff hid off the list during the event that names it', async () => {
    const { service, state } = await maxBossServiceWith();
    await service.sync();
    const events = parseMaxEventFeed(
      [
        {
          eventType: 'max-battles',
          name: 'Gigantamax Kingler Max Battle Day',
          start: '2026-10-21T14:00:00.000',
          end: '2026-10-21T17:00:00.000',
        },
      ],
      MAX_ZONE,
    ).events;
    const deps = {
      maxBosses: service,
      maxEvents: { maxEvents: () => events, bigEvents: () => [] },
      pokemon: pokemonFixture(),
      gameData: { catalogue: catalogueFixture() },
      zone: MAX_ZONE,
    };
    state.now = at('2026-10-21T15:00');
    const first = () => currentMaxBossChoices(deps, state.now)[0]?.name;
    expect(first()).toBe('Gigantamax Kingler');
    expect(service.hidden()).toEqual([]);
    await service.addOverride({
      action: 'hide',
      pokemonId: 'KINGLER',
      form: null,
      tier: 'G',
      shiny: null,
      expiresAt: null,
      createdBy: '123456789012345678',
    });
    expect(service.hidden()).toEqual([{ key: 'kingler', tier: 'G' }]);
    expect(first()).not.toBe('Gigantamax Kingler');
  });

  it('reads a document of the recorded size', async () => {
    const { service, state } = await maxBossServiceWith();
    const body = JSON.stringify(readPokebattlerFeed());
    state.respond = () => Promise.resolve(feedReply(200, body.padEnd(700_000, ' ')));
    expect(await service.sync()).toMatchObject({ status: 'updated' });
  });
});
