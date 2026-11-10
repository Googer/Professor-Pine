import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { diffBosses } from '../domain/pogo/boss-diff.js';
import type { FeedBoss } from '../domain/pogo/raid-boss-feed.js';
import { effectiveBosses } from '../domain/pogo/raid-bosses.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import {
  bossChangeAnnouncement,
  staleWarning,
  tierChangeLine,
  tierChanges,
} from './boss-changes.js';

const catalogue = catalogueFixture();
const T1: RaidTier = { level: 'T1', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };
const SHADOW_T5: RaidTier = { level: 'T5', shadow: true };
const MEGA: RaidTier = { level: 'Mega', shadow: false };

function boss(pokemonId: string, tier: RaidTier, extra: Partial<FeedBoss> = {}): FeedBoss {
  const name = pokemonId.charAt(0) + pokemonId.slice(1).toLowerCase();
  return { pokemonId, form: null, tier, shiny: false, name, ...extra };
}

describe('tierChanges', () => {
  it('groups by tier in the order of the levels, shadow after plain, by catalogue names', () => {
    const changes = tierChanges(
      {
        added: [
          boss('BLASTOISE', MEGA, { form: 'BLASTOISE_MEGA', name: 'Mega Blastoise' }),
          boss('YVELTAL', T5),
          boss('LANDORUS', SHADOW_T5, { form: 'LANDORUS_INCARNATE', name: 'Landorus' }),
        ],
        removed: [boss('ZEKROM', T5), boss('MAGIKARP', T1)],
      },
      catalogue,
    );
    expect(changes).toEqual([
      { tier: T1, added: [], removed: ['Magikarp'] },
      { tier: T5, added: ['Yveltal'], removed: ['Zekrom'] },
      { tier: SHADOW_T5, added: ['Landorus (Incarnate Forme)'], removed: [] },
      { tier: MEGA, added: ['Mega Blastoise'], removed: [] },
    ]);
  });

  it('drops a boss that went and came back under other ids in the same tier', () => {
    const changes = tierChanges(
      {
        added: [boss('PIKACHU', T1, { form: 'PIKACHU_GLASS_HELMET_2027', name: 'Pikachu' })],
        removed: [boss('PIKACHU', T1, { form: 'PIKACHU_GLASS_HELMET_2026', name: 'Pikachu' })],
      },
      catalogue,
    );
    expect(changes).toEqual([]);
  });

  it('keeps a Pokémon that moved to another tier, and names an unknown one plainly', () => {
    const changes = tierChanges(
      {
        added: [boss('YVELTAL', SHADOW_T5), boss('NEWMON', T5, { name: 'New_mon*' })],
        removed: [boss('YVELTAL', T5)],
      },
      catalogue,
    );
    expect(changes.map(tierChangeLine)).toEqual([
      '**T5** · New: New\\_mon\\* · Gone: Yveltal',
      '**Shadow T5** · New: Yveltal',
    ]);
  });
});

/** The lists in effect of these feed rows, without overrides. */
const listOf = (...rows: FeedBoss[]) => effectiveBosses(rows, [], catalogue, 0);

describe('bossChangeAnnouncement', () => {
  it('is one message with a line per tier, of what members see', () => {
    const seen = diffBosses(listOf(boss('ZEKROM', T5)), listOf(boss('YVELTAL', T5)));
    expect(bossChangeAnnouncement(seen)).toBe(
      '**The raid bosses have changed**\n**T5** · New: Yveltal · Gone: Zekrom',
    );
  });

  it('is nothing when members see no change', () => {
    expect(bossChangeAnnouncement({ added: [], removed: [] })).toBeUndefined();
  });

  it('shows a name from the feed as text', () => {
    const seen = diffBosses(
      [],
      listOf(boss('NEWMON', T5, { name: '@everyone [x](https://e.test)' })),
    );
    const text = bossChangeAnnouncement(seen) ?? '';
    expect(text).toContain('everyone \\[x]\\(https://e.test)');
    expect(text).not.toContain('@everyone');
    expect(text).not.toContain('](');
  });

  it('is cut with a count when it would be too long', () => {
    const many = Array.from({ length: 400 }, (_, index) =>
      boss(
        `NEWMON${String(index)}`,
        { level: index % 2 ? 'T1' : 'T3', shadow: index % 4 > 1 },
        { name: `A rather long new Pokémon name ${String(index)}` },
      ),
    );
    const text = bossChangeAnnouncement(diffBosses([], listOf(...many))) ?? '';
    expect(text.length).toBeLessThanOrEqual(2000);
    // Every tier keeps a line, each with as many names as fit and a count of the rest.
    const lines = text.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines.slice(1).every((line) => /…and \d+ more$/.test(line))).toBe(true);
  });
});

describe('staleWarning', () => {
  it('says since when, and nothing of the error', () => {
    const at = Date.UTC(2026, 9, 12, 8);
    expect(staleWarning(at)).toContain(`since <t:${String(at / 1000)}:f>`);
    expect(staleWarning(undefined)).toContain('not been able to read the raid boss feed yet');
  });
});
