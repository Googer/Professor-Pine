import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { bossReport, OLD_OVERRIDE_MS } from './boss-report.js';
import type { FeedBoss } from './raid-boss-feed.js';
import type { BossOverride } from './raid-bosses.js';
import type { RaidTier } from './raid-tier.js';

const T3: RaidTier = { level: 'T3', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };
const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 24 * 60 * 60 * 1000;
const catalogue = catalogueFixture();

function row(pokemonId: string, tier: RaidTier, extra: Partial<FeedBoss> = {}): FeedBoss {
  const name = pokemonId.charAt(0) + pokemonId.slice(1).toLowerCase();
  return { pokemonId, form: null, tier, shiny: false, name, ...extra };
}

let nextId = 1;
function override(extra: Partial<BossOverride>): BossOverride {
  return {
    id: nextId++,
    pokemonId: 'ZEKROM',
    form: null,
    tier: T5,
    action: 'add',
    shiny: null,
    expiresAt: null,
    createdBy: '123456789012345678',
    createdAt: NOW - DAY,
    ...extra,
  };
}

const FEED = [row('YVELTAL', T5), row('STARMIE', T3), row('UMBREON', T3)];

describe('bossReport', () => {
  it('gives every boss with the feed rows it came from', () => {
    const report = bossReport(FEED, [], catalogue, NOW);
    expect(report.bosses.map(({ boss, rows }) => [boss.key, rows.length])).toEqual([
      ['starmie', 1],
      ['umbreon', 1],
      ['yveltal', 1],
    ]);
    expect(report.hidden).toEqual([]);
    expect(report.idle).toEqual([]);
  });

  it('puts the overrides with the bosses they act on, and hidden ones apart', () => {
    const add = override({ action: 'add', pokemonId: 'ZEKROM' });
    const autoset = override({ action: 'autoset', pokemonId: 'YVELTAL' });
    const shiny = override({ action: 'shiny', pokemonId: 'STARMIE', tier: null, shiny: true });
    const hide = override({ action: 'hide', pokemonId: 'UMBREON', tier: T3 });
    const report = bossReport(FEED, [add, autoset, shiny, hide], catalogue, NOW);
    const of = (key: string) =>
      report.bosses.find((one) => one.boss.key === key)?.overrides.map((o) => o.override.id);
    expect(of('zekrom')).toEqual([add.id]);
    expect(report.bosses.find((one) => one.boss.key === 'zekrom')?.rows).toEqual([]);
    expect(of('yveltal')).toEqual([autoset.id]);
    expect(of('starmie')).toEqual([shiny.id]);
    expect(report.bosses.some((one) => one.boss.key === 'umbreon')).toBe(false);
    expect(report.hidden.map((o) => [o.override.id, o.name, o.old])).toEqual([
      [hide.id, 'Umbreon', []],
    ]);
    expect(report.idle).toEqual([]);
  });

  it('lists overrides that act on no boss of the list as idle', () => {
    const hide = override({ action: 'hide', pokemonId: 'ZEKROM' });
    const add = override({ action: 'add', pokemonId: 'ZEKROM' });
    const shiny = override({ action: 'shiny', pokemonId: 'MEWTWO', tier: null, shiny: true });
    const report = bossReport(FEED, [hide, add, shiny], catalogue, NOW);
    expect(report.idle.map((o) => o.override.id)).toEqual([add.id, shiny.id]);
  });

  it('marks what may be time to remove', () => {
    const aged = override({ action: 'autoset', pokemonId: 'YVELTAL', createdAt: NOW - 31 * DAY });
    const redundant = override({ action: 'add', pokemonId: 'YVELTAL' });
    const moot = override({ action: 'hide', pokemonId: 'ZEKROM' });
    const lost = override({ action: 'shiny', pokemonId: 'MEWTWO', tier: null, shiny: true });
    const kept = override({ action: 'shiny', pokemonId: 'STARMIE', tier: T3, shiny: false });
    const recent = override({ action: 'add', pokemonId: 'ZEKROM', createdAt: NOW - 30 * DAY });
    const report = bossReport(FEED, [aged, redundant, moot, lost, kept, recent], catalogue, NOW);
    const all = [
      ...report.bosses.flatMap((one) => one.overrides),
      ...report.hidden,
      ...report.idle,
    ];
    const old = (id: number) => all.find((o) => o.override.id === id)?.old;
    expect(old(aged.id)).toEqual(['age']);
    expect(old(redundant.id)).toEqual(['feed-lists-it']);
    expect(old(moot.id)).toEqual(['feed-dropped-it']);
    expect(old(lost.id)).toEqual(['feed-dropped-it']);
    expect(old(kept.id)).toEqual([]);
    expect(old(recent.id)).toEqual([]);
    expect(OLD_OVERRIDE_MS).toBe(30 * DAY);
  });

  it('gives an add the tiers of its kind it moves its boss from (plan 8X-J)', () => {
    const T1: RaidTier = { level: 'T1', shadow: false };
    const add = override({ action: 'add', pokemonId: 'STARMIE', tier: T1 });
    const other = override({ action: 'add', pokemonId: 'ZEKROM', tier: T5 });
    const report = bossReport(FEED, [add, other], catalogue, NOW);
    const all = report.bosses.flatMap((one) => one.overrides);
    expect(all.find((o) => o.override.id === add.id)?.moved).toEqual([T3]);
    expect(all.find((o) => o.override.id === other.id)?.moved).toEqual([]);
    expect(report.bosses.some((one) => one.boss.key === 'starmie' && one.boss.tier === T3)).toBe(
      false,
    );
  });

  it('marks an add "the feed lists it now" only when the feed lists it at no other tier of its kind', () => {
    const add = override({ action: 'add', pokemonId: 'STARMIE', tier: T5 });
    const both = bossReport([...FEED, row('STARMIE', T5)], [add], catalogue, NOW);
    const reported = both.bosses
      .flatMap((one) => one.overrides)
      .find((o) => o.override.id === add.id);
    expect(reported?.old).toEqual([]);
    expect(reported?.moved).toEqual([T3]);
    const only = bossReport([row('STARMIE', T5)], [add], catalogue, NOW);
    expect(only.bosses.flatMap((one) => one.overrides)[0]?.old).toEqual(['feed-lists-it']);
  });

  // Review J7: a costume is a boss of its own, so its tier is no "other tier" of the boss.
  it('marks an add "the feed lists it now" beside a costume of its boss at another tier', () => {
    const T1: RaidTier = { level: 'T1', shadow: false };
    const add = override({ action: 'add', pokemonId: 'PIKACHU', tier: T5 });
    const feed = [
      row('PIKACHU', T5, { name: 'Pikachu' }),
      row('PIKACHU', T1, { form: 'PIKACHU_GLASS_HELMET_2026', name: 'Astronaut Pikachu' }),
    ];
    const report = bossReport(feed, [add], catalogue, NOW);
    const reported = report.bosses
      .flatMap((one) => one.overrides)
      .find((o) => o.override.id === add.id);
    expect(reported?.old).toEqual(['feed-lists-it']);
    expect(reported?.moved).toEqual([]);
  });

  it('names the feed rows an add moves its boss from, as the list named them (review J6)', () => {
    const T1: RaidTier = { level: 'T1', shadow: false };
    const add = override({ action: 'add', pokemonId: 'NEWMON', tier: T1 });
    const report = bossReport([row('NEWMON', T3, { name: 'New Mon' })], [add], catalogue, NOW);
    const reported = report.bosses
      .flatMap((one) => one.overrides)
      .find((o) => o.override.id === add.id);
    expect(reported).toMatchObject({ name: 'Newmon', moved: [T3], movedNames: ['New Mon'] });
  });

  it('gives a hidden add no moves', () => {
    const T1: RaidTier = { level: 'T1', shadow: false };
    const add = override({ action: 'add', pokemonId: 'STARMIE', tier: T1 });
    const hide = override({ action: 'hide', pokemonId: 'STARMIE', tier: T1 });
    const report = bossReport(FEED, [add, hide], catalogue, NOW);
    expect(report.idle.find((o) => o.override.id === add.id)?.moved).toEqual([]);
  });

  it('leaves expired overrides out', () => {
    const expired = override({ action: 'hide', pokemonId: 'YVELTAL', expiresAt: NOW });
    const report = bossReport(FEED, [expired], catalogue, NOW);
    expect(report.hidden).toEqual([]);
    expect(report.bosses.map(({ boss }) => boss.key)).toContain('yveltal');
  });

  it('keeps a boss the game master does not know with its rows, and finds it by its ids', () => {
    const unknown = row('NEWMON', T5, { name: 'Newmon' });
    const hide = override({ action: 'hide', pokemonId: 'NEWMON' });
    const shown = bossReport([...FEED, unknown], [], catalogue, NOW);
    const boss = shown.bosses.find((one) => one.boss.key === '~newmon');
    expect(boss?.boss.entry).toBeUndefined();
    expect(boss?.rows).toEqual([unknown]);
    const hidden = bossReport([...FEED, unknown], [hide], catalogue, NOW);
    expect(hidden.bosses.some((one) => one.boss.key === '~newmon')).toBe(false);
    expect(hidden.hidden.map((o) => [o.key, o.name, o.old])).toEqual([['~newmon', 'Newmon', []]]);
  });
});
