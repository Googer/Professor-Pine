import { describe, expect, it } from 'vitest';
import {
  LIST_TIER_SIGHTINGS,
  LIST_TIER_WINDOW_MS,
  listTierDoubt,
  momentTooOld,
  type ListTierObservation,
} from './list-tier-doubt.js';

const NOW = Date.UTC(2026, 9, 25, 18);
const HOUR = 60 * 60 * 1000;

const seen = (extra: Partial<ListTierObservation> = {}): ListTierObservation => ({
  family: 'max',
  bossKey: 'sneasel',
  listTier: 'D1',
  headsTier: 'D2',
  memberId: '100000000000000001',
  place: 'w1',
  at: NOW - HOUR,
  ...extra,
});

describe('listTierDoubt (plan 8X-J)', () => {
  it('tells of a boss seen three times in a day with the same other heads, from one member', () => {
    const observations = [
      seen({ place: 'w1' }),
      seen({ place: 'w2', at: NOW - 2 * HOUR }),
      seen({ place: 'w3', at: NOW - 20 * HOUR }),
    ];
    expect(listTierDoubt(observations, NOW)).toEqual([
      { family: 'max', bossKey: 'sneasel', listTier: 'D1', headsTier: 'D2', count: 3 },
    ]);
    expect(LIST_TIER_SIGHTINGS).toBe(3);
    expect(LIST_TIER_WINDOW_MS).toBe(24 * HOUR);
  });

  it('counts a member and place once, and nothing older than a day', () => {
    const twice = [seen(), seen({ at: NOW - 3 * HOUR }), seen({ place: 'w2' })];
    expect(listTierDoubt(twice, NOW)).toEqual([]);
    const old = [seen(), seen({ place: 'w2' }), seen({ place: 'w3', at: NOW - 25 * HOUR })];
    expect(listTierDoubt(old, NOW)).toEqual([]);
    const members = [
      seen(),
      seen({ memberId: '100000000000000002' }),
      seen({ memberId: '100000000000000003' }),
    ];
    expect(listTierDoubt(members, NOW)).toHaveLength(1);
  });

  it('keeps another heads’ tier, another boss and the raids apart', () => {
    const mixed = [
      seen(),
      seen({ place: 'w2', headsTier: 'D3' }),
      seen({ place: 'w3', bossKey: 'machop' }),
      seen({ place: 'w4', family: 'raid', listTier: { level: 'T3', shadow: false } }),
    ];
    expect(listTierDoubt(mixed, NOW)).toEqual([]);
    const raids = [1, 2, 3].map((n) =>
      seen({
        family: 'raid',
        bossKey: 'starmie',
        listTier: { level: 'T3', shadow: false },
        headsTier: { level: 'T1', shadow: false },
        place: `gym ${String(n)}`,
      }),
    );
    expect(listTierDoubt(raids, NOW)).toEqual([
      {
        family: 'raid',
        bossKey: 'starmie',
        listTier: { level: 'T3', shadow: false },
        headsTier: { level: 'T1', shadow: false },
        count: 3,
      },
    ]);
  });
});

describe('momentTooOld (review J10)', () => {
  it('leaves out a screenshot whose known moment is older than the window', () => {
    const uploadedAt = NOW;
    expect(momentTooOld({ takenAt: NOW - 25 * HOUR, timeFrom: 'file' }, uploadedAt)).toBe(true);
    expect(momentTooOld({ takenAt: NOW - 25 * HOUR, timeFrom: 'clock' }, uploadedAt)).toBe(true);
    expect(momentTooOld({ takenAt: NOW - 23 * HOUR, timeFrom: 'file' }, uploadedAt)).toBe(false);
    // A guessed moment says nothing of the screenshot's age.
    expect(momentTooOld({ takenAt: NOW - 25 * HOUR, timeFrom: 'upload' }, uploadedAt)).toBe(false);
  });
});
