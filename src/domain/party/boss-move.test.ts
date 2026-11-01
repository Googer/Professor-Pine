import { describe, expect, it } from 'vitest';
import {
  at,
  PARTY_NOW,
  testMax,
  testMeetup,
  testRaid,
  testRaidRules,
} from '../../../test/support/parties.js';
import type { RaidTier } from '../pogo/raid-tier.js';
import { bossTierMoved, type BossTierMove } from './boss-move.js';
import { endParty } from './party.js';
import { setBoss } from './raid.js';

const rules = testRaidRules();
const T1: RaidTier = { level: 'T1', shadow: false };
const T3: RaidTier = { level: 'T3', shadow: false };
const SNEASEL: BossTierMove = {
  boss: { key: 'sneasel', names: ['Sneasel'] },
  from: ['D1'],
  to: 'D2',
};

describe('bossTierMoved (plan 8X-J)', () => {
  it('moves a max battle of the boss at a tier it moved from, its end and boss kept', () => {
    const battle = testMax({ boss: { key: 'sneasel' }, tier: 'D1' });
    const moved = bossTierMoved(battle, SNEASEL, rules, PARTY_NOW);
    expect(moved).not.toBe(battle);
    expect(moved).toMatchObject({
      endTime: battle.endTime,
      max: { tier: 'D2', boss: { key: 'sneasel' }, bossSince: battle.max.bossSince },
    });
  });

  it('gives the very same party when nothing moves', () => {
    const other = testMax({ boss: { key: 'machamp' }, tier: 'D1' });
    expect(bossTierMoved(other, SNEASEL, rules, PARTY_NOW)).toBe(other);
    const already = testMax({ boss: { key: 'sneasel' }, tier: 'D2' });
    expect(bossTierMoved(already, SNEASEL, rules, PARTY_NOW)).toBe(already);
    const elsewhere = testMax({ boss: { key: 'sneasel' }, tier: 'D3' });
    expect(bossTierMoved(elsewhere, SNEASEL, rules, PARTY_NOW)).toBe(elsewhere);
    const meetup = testMeetup();
    expect(bossTierMoved(meetup, SNEASEL, rules, PARTY_NOW)).toBe(meetup);
  });

  it('leaves a battle whose end has come, or one that ended, as it is', () => {
    const battle = testMax({ boss: { key: 'sneasel' }, tier: 'D1' });
    const late = at('2026-10-13T21:00');
    expect(bossTierMoved(battle, SNEASEL, rules, late)).toBe(battle);
    const ended = endParty(battle);
    expect(bossTierMoved(ended, SNEASEL, rules, PARTY_NOW)).toBe(ended);
  });

  it('finds a boss the game data lacks by its name', () => {
    const battle = testMax({ boss: { name: 'Newmon' }, tier: 'D1' });
    const move: BossTierMove = {
      boss: { key: '~newmon', names: ['Newmon'] },
      from: ['D1'],
      to: 'D2',
    };
    expect(bossTierMoved(battle, move, rules, PARTY_NOW)).toMatchObject({ max: { tier: 'D2' } });
  });

  it('moves a raid of the boss, its moves kept, and never an egg', () => {
    const raid = testRaid({ tier: T3, boss: { key: 'starmie' } });
    const move: BossTierMove = { boss: { key: 'starmie', names: ['Starmie'] }, from: [T3], to: T1 };
    const moved = bossTierMoved(raid, move, rules, PARTY_NOW);
    expect(moved).toMatchObject({ raid: { tier: T1, boss: { key: 'starmie' } } });
    const egg = testRaid({ tier: T3 });
    expect(bossTierMoved(egg, move, rules, PARTY_NOW)).toBe(egg);
  });

  // Plan 8E, review E1: a raid runs while it blocks its gym (`blocksNewRaid`), not by its end
  // time alone: a timeless raid past its last possible time is over, though still active.
  it('leaves a raid that is over by the clock without an end time as it is', () => {
    const T5: RaidTier = { level: 'T5', shadow: false };
    const egg = setBoss(
      testRaid({ tier: T5 }),
      { tier: T5, boss: { key: 'mewtwo' } },
      rules,
      PARTY_NOW,
    ).party;
    const move: BossTierMove = {
      boss: { key: 'mewtwo', names: ['Mewtwo'] },
      from: [T5],
      to: { level: 'Elite', shadow: false },
    };
    expect(egg.endTime).toBeNull();
    expect(bossTierMoved(egg, move, rules, at('2026-10-13T15:44'))).not.toBe(egg);
    expect(bossTierMoved(egg, move, rules, at('2026-10-13T15:45'))).toBe(egg);
  });

  // Plan 8F-1 (8E-1): only a raid with a boss moves, so a move to Elite never makes an Elite egg,
  // which would need its hatch time.
  it('never makes an Elite egg, with or without a hatch time', () => {
    const T5: RaidTier = { level: 'T5', shadow: false };
    const toElite: BossTierMove = {
      boss: { key: 'mewtwo', names: ['Mewtwo'] },
      from: [T5],
      to: { level: 'Elite', shadow: false },
    };
    const egg = testRaid({ tier: T5 });
    expect(egg.raid.boss).toBeNull();
    expect(bossTierMoved(egg, toElite, rules, PARTY_NOW)).toBe(egg);
  });

  it('never moves a raid by a max move, nor a max battle by a raid move', () => {
    const raid = testRaid({ tier: T3, boss: { key: 'sneasel' } });
    expect(bossTierMoved(raid, SNEASEL, rules, PARTY_NOW)).toBe(raid);
    const battle = testMax({ boss: { key: 'sneasel' }, tier: 'D1' });
    const raidMove: BossTierMove = {
      boss: { key: 'sneasel', names: ['Sneasel'] },
      from: [T3],
      to: T1,
    };
    expect(bossTierMoved(battle, raidMove, rules, PARTY_NOW)).toBe(battle);
  });
});
