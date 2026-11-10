import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { diffBosses } from './boss-diff.js';
import type { FeedBoss } from './raid-boss-feed.js';
import { effectiveBosses } from './raid-bosses.js';
import type { RaidTier } from './raid-tier.js';

const T1: RaidTier = { level: 'T1', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };
const catalogue = catalogueFixture();

function row(pokemonId: string, tier: RaidTier, form: string | null = null): FeedBoss {
  const name = pokemonId.charAt(0) + pokemonId.slice(1).toLowerCase();
  return { pokemonId, form, tier, shiny: false, name };
}
const list = (...rows: FeedBoss[]) => effectiveBosses(rows, [], catalogue, 0);

describe('diffBosses', () => {
  it('gives the bosses that came and went, by key and tier', () => {
    const change = diffBosses(
      list(row('YVELTAL', T5), row('MAGIKARP', T1)),
      list(row('ZEKROM', T5), row('MAGIKARP', T1), row('YVELTAL', T1)),
    );
    expect(change.added.map((boss) => `${boss.key} ${boss.tier.level}`)).toEqual([
      'yveltal T1',
      'zekrom T5',
    ]);
    expect(change.removed.map((boss) => `${boss.key} ${boss.tier.level}`)).toEqual(['yveltal T5']);
  });

  it('sees no change in a costume id the feed renamed', () => {
    const change = diffBosses(
      list(row('PIKACHU', T1, 'PIKACHU_GLASS_HELMET_2026')),
      list(row('PIKACHU', T1, 'PIKACHU_GLASS_HELMET_2027')),
    );
    expect(change).toEqual({ added: [], removed: [] });
  });
});
