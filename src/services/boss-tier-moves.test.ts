import { describe, expect, it, vi } from 'vitest';
import {
  asMax,
  asRaid,
  at,
  PARTY_NOW,
  testMax,
  testRaid,
  testRaidRules,
} from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { setBoss, setHatchTime } from '../domain/party/raid.js';
import type { Party } from '../domain/party/party.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';

const ID = (n: number): string => `00000000-0000-4000-8000-00000000030${String(n)}`;
const POST = (n: number): string => `30000000000000030${String(n)}`;
const T1: RaidTier = { level: 'T1', shadow: false };
const T3: RaidTier = { level: 'T3', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };
const ELITE: RaidTier = { level: 'Elite', shadow: false };

describe('BossTierMoves (plan 8X-J)', () => {
  it('moves the running battles of the boss in every server, says so in their posts, and counts them', async () => {
    const made = await partyServiceWith([
      { ...testMax({ id: ID(1), boss: { key: 'sneasel' }, tier: 'D1' }), forumPostId: POST(1) },
      { ...testMax({ id: ID(2), boss: { key: 'sneasel' }, tier: 'D1' }), forumPostId: POST(2) },
      { ...testMax({ id: ID(3), boss: { key: 'machamp' }, tier: 'D1' }), forumPostId: POST(3) },
      // Review J5: the boss list is the installation's, so another server's battle moves too.
      testMax({ id: ID(4), boss: { key: 'sneasel' }, tier: 'D1', guildId: 2 }),
    ]);
    // As written: the fake gateway has no posts, so a post shown anew may end its party after.
    const written = new Map<string, Party>();
    made.store.onChange((_before, after) => written.set(after.id, after));
    const moved = await made.bossMoves.move({
      boss: { key: 'sneasel', names: ['Sneasel'] },
      from: ['D1'],
      to: 'D2',
    });
    expect(moved).toEqual({ moved: 3, inTheWay: 0 });
    expect([1, 2, 4].map((n) => asMax(written.get(ID(n))).max.tier)).toEqual(['D2', 'D2', 'D2']);
    expect(written.has(ID(3))).toBe(false);
    await made.attendance.flush();
    for (const n of [1, 2]) {
      expect(made.gateway.messagesIn(POST(n)).map((m) => m.message.content)).toEqual([
        'Staff moved **Dynamax Sneasel** to 2★.',
      ]);
    }
    expect(made.gateway.messagesIn(POST(3))).toEqual([]);
  });

  it('moves a raid through the raid changes, said with its tier', async () => {
    const made = await partyServiceWith([
      { ...testRaid({ id: ID(1), tier: T3, boss: { key: 'starmie' } }), forumPostId: POST(1) },
    ]);
    const moved = await made.bossMoves.move({
      boss: { key: 'starmie', names: ['Starmie'] },
      from: [T3],
      to: T1,
    });
    expect(moved).toEqual({ moved: 1, inTheWay: 0 });
    expect(asRaid(made.store.get(ID(1))).raid.tier).toEqual(T1);
    await made.attendance.flush();
    expect(made.gateway.messagesIn(POST(1)).map((m) => m.message.content)).toEqual([
      'Staff moved **Starmie** to T1.',
    ]);
  });

  // Review J1: a move to Elite is another kind of raid, its times worked out again.
  it('works a raid’s times out again when it moves to Elite, and tells no notifier', async () => {
    const rules = testRaidRules();
    const egg = setHatchTime(
      testRaid({ id: ID(1), tier: T5, boss: { key: 'mewtwo' } }),
      at('2026-10-13T14:30'),
      rules,
      PARTY_NOW,
    );
    const made = await partyServiceWith([{ ...egg, forumPostId: POST(1) }]);
    const told = vi.spyOn(made.notify, 'raidChanged');
    const moved = await made.bossMoves.move({
      boss: { key: 'mewtwo', names: ['Mewtwo'] },
      from: [T5],
      to: ELITE,
    });
    expect(moved).toEqual({ moved: 1, inTheWay: 0 });
    const raid = asRaid(made.store.get(ID(1)));
    expect(raid.raid.tier).toEqual(ELITE);
    expect(raid.hatchTime).toBe(egg.hatchTime);
    expect(raid.endTime).not.toBe(egg.endTime);
    expect(told).not.toHaveBeenCalled();
  });

  // Plan 8E: one raid per gym of any kind; a raid that stands at its gym is never in its own
  // way, also when another raid was stored there before the rule.
  it('moves a raid to Elite at its gym though another raid was stored there before', async () => {
    const made = await partyServiceWith([
      { ...testRaid({ id: ID(1), tier: T5, boss: { key: 'mewtwo' } }), forumPostId: POST(1) },
      testRaid({ id: ID(2), tier: ELITE, boss: { key: 'zekrom' } }),
    ]);
    const moved = await made.bossMoves.move({
      boss: { key: 'mewtwo', names: ['Mewtwo'] },
      from: [T5],
      to: ELITE,
    });
    expect(moved).toEqual({ moved: 1, inTheWay: 0 });
    expect(asRaid(made.store.get(ID(1))).raid.tier).toEqual(ELITE);
  });

  // Review E1 of plan 8E: a raid over by the clock is no running battle, though still active,
  // so a move never brings it back (beside the raid reported at its gym since); nothing counts it.
  it('leaves a raid over by the clock as it is, and counts it nowhere', async () => {
    // A timeless T5 egg with its boss named, over by the clock at 15:45 but not yet archived;
    // as an elite egg it would last until the next day.
    const rules = testRaidRules();
    const egg = setBoss(
      testRaid({ id: ID(1), tier: T5 }),
      { tier: T5, boss: { key: 'mewtwo' } },
      rules,
      PARTY_NOW,
    ).party;
    const made = await partyServiceWith([
      { ...egg, forumPostId: POST(1) },
      testRaid({ id: ID(2), tier: T5, now: at('2026-10-13T15:50') }),
    ]);
    made.clock.now = at('2026-10-13T15:55');
    const moved = await made.bossMoves.move({
      boss: { key: 'mewtwo', names: ['Mewtwo'] },
      from: [T5],
      to: ELITE,
    });
    expect(moved).toEqual({ moved: 0, inTheWay: 0 });
    expect(asRaid(made.store.get(ID(1))).raid.tier).toEqual(T5);
  });

  // Review J6: a boss the game data lacks is found by the name the list had for it.
  it('finds a battle of a boss the game data lacks by the name of the moved feed row', async () => {
    const made = await partyServiceWith([
      testMax({ id: ID(1), boss: { name: 'Newmon' }, tier: 'D1' }),
    ]);
    const moved = await made.bossMoves.move({
      boss: { key: '~newmon', names: ['Newmon'] },
      from: ['D1'],
      to: 'D2',
    });
    expect(moved).toEqual({ moved: 1, inTheWay: 0 });
  });
});
