import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BOB,
  MINUTE,
  PARTY_NOW,
  REPORTER,
  testRaid,
  testRaidRules,
  testRaidRulesWithRaidDay,
  withAttendees,
} from '../../../test/support/parties.js';
import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
import type { RaidBoss } from '../pogo/raid-bosses.js';
import { setSaved } from './party.js';
import type { RaidBossRef } from './party.js';
import {
  blocksNewRaid,
  raidBossRef,
  raidMirrors,
  raidStage,
  raidStandingAt,
  setBoss,
  setEndTime,
  setGym,
  setHatchedDuration,
  setHatchTime,
  setMoveset,
  standsAtGym,
  timeConfirmed,
} from './raid.js';
import { PartyStatus } from './status.js';

const rules = testRaidRules();
const T5 = { level: 'T5', shadow: false } as const;
const ELITE = { level: 'Elite', shadow: false } as const;
const YVELTAL = { key: 'yveltal' };

describe('createRaid', () => {
  it('makes an egg with one group, the reporter signed up, and no times', () => {
    const raid = testRaid();
    expect(raid).toMatchObject({
      type: 'raid',
      status: 'active',
      hatchTime: null,
      endTime: null,
      deletionTime: null,
      saved: false,
      forumPostId: null,
      mirrorMessages: [],
      groups: [{ id: 'A' }],
      defaultGroupId: 'A',
      attendees: {
        [REPORTER]: { number: 1, status: PartyStatus.Interested, group: 'A', remote: false },
      },
      raid: {
        tier: T5,
        boss: null,
        reportedHatched: false,
        fastMove: null,
        chargedMove: null,
        hatchedDuration: null,
        stageSeen: 'egg',
      },
    });
    // An egg seen now hatches within 60 minutes and then lasts 45.
    expect(raid.lastPossibleTime).toBe(PARTY_NOW + 105 * MINUTE);
  });

  it('signs nobody up when the reporter wants no automatic status', () => {
    expect(testRaid({ autoStatus: PartyStatus.NotInterested }).attendees).toEqual({});
    expect(testRaid({ autoStatus: PartyStatus.Coming }).attendees[REPORTER]?.status).toBe(
      PartyStatus.Coming,
    );
  });

  it('keeps the moves only for a boss, and shows a raid with a boss as hatched', () => {
    const boss = testRaid({ boss: YVELTAL, fastMove: 'SNARL_FAST' });
    expect(boss.raid).toMatchObject({
      boss: YVELTAL,
      reportedHatched: true,
      fastMove: 'SNARL_FAST',
      chargedMove: null,
      stageSeen: 'hatched',
    });
    // Seen hatched at 14:00, it cannot last beyond the 45 minutes a boss stays.
    expect(boss.lastPossibleTime).toBe(PARTY_NOW + 45 * MINUTE);
    expect(testRaid({ boss: null, fastMove: 'SNARL_FAST' }).raid.fastMove).toBeNull();
  });

  it('does not stretch the last possible time on a Raid Day, whose bosses stay 30 minutes', () => {
    // Saturday 31 October 2026: Raid Day from 14:00 to 17:00. Seen at 13:30, the egg hatches by
    // 14:30 and a boss of the day leaves 30 minutes later, but one that hatched before the day
    // stays the usual 45, so the last possible time is the same as on any other day.
    const day = at('2026-10-31T13:30');
    expect(testRaid({ now: day }).lastPossibleTime).toBe(day + 105 * MINUTE);
  });

  it('allows for a Raid Day longer than the usual raid, when the rules say so', () => {
    const day = at('2026-10-31T13:30');
    const long = testRaid({ now: day }, testRaidRulesWithRaidDay(60));
    expect(long.lastPossibleTime).toBe(day + 120 * MINUTE);
  });

  it('allows for the day an elite egg takes', () => {
    expect(testRaid({ tier: ELITE }).lastPossibleTime).toBe(PARTY_NOW + (1440 + 30) * MINUTE);
  });
});

describe('raid times', () => {
  it('derives the end from the hatch time and drops the seconds', () => {
    const raid = setHatchTime(testRaid(), at('2026-10-13T14:30') + 42_000, rules, PARTY_NOW);
    expect(raid.hatchTime).toBe(at('2026-10-13T14:30'));
    expect(raid.endTime).toBe(at('2026-10-13T15:15'));
    expect(raid.lastPossibleTime).toBe(raid.endTime);
  });

  it('derives the hatch time from the end and drops the seconds', () => {
    const raid = setEndTime(testRaid(), at('2026-10-13T14:40') + 42_000, rules, PARTY_NOW);
    expect(raid.hatchTime).toBe(at('2026-10-13T13:55'));
    expect(raid.endTime).toBe(at('2026-10-13T14:40'));
  });

  it('uses the Raid Hour and Raid Day durations for a raid that hatches in one', () => {
    // Wednesday 14 October 2026, Raid Hour 18:00 to 19:00: bosses stay 25 minutes.
    const hour = at('2026-10-14T17:50');
    const egg = setHatchTime(testRaid({ now: hour }), at('2026-10-14T18:00'), rules, hour);
    expect(egg.endTime).toBe(at('2026-10-14T18:25'));
    const hatched = setEndTime(
      testRaid({ now: at('2026-10-14T18:40') }),
      at('2026-10-14T18:55'),
      rules,
      hour,
    );
    expect(hatched.hatchTime).toBe(at('2026-10-14T18:30'));

    const day = at('2026-10-31T14:10');
    // Saturday 31 October 2026, Raid Day 14:00 to 17:00: bosses stay 30 minutes.
    expect(setHatchTime(testRaid({ now: day }), at('2026-10-31T14:30'), rules, day).endTime).toBe(
      at('2026-10-31T15:00'),
    );
    const raidDayEnd = setEndTime(testRaid({ now: day }), at('2026-10-31T16:00'), rules, day);
    expect(raidDayEnd.hatchTime).toBe(at('2026-10-31T15:30'));
  });

  it('uses the durations of elite raids', () => {
    const elite = setHatchTime(testRaid({ tier: ELITE }), at('2026-10-14T18:00'), rules, PARTY_NOW);
    expect(elite.endTime).toBe(at('2026-10-14T18:30'));
  });

  it('lets a duration set for the raid win, moving the end and keeping the hatch time', () => {
    const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const long = setHatchedDuration(egg, 90, 180, rules, PARTY_NOW);
    expect(long).toMatchObject({
      ok: true,
      party: { hatchTime: egg.hatchTime, endTime: at('2026-10-13T16:00') },
    });
    if (!long.ok) return;
    expect(long.party.lastPossibleTime).toBe(at('2026-10-13T16:00'));
    // Later time changes use it too, in both directions.
    expect(setHatchTime(long.party, at('2026-10-13T14:00'), rules, PARTY_NOW).endTime).toBe(
      at('2026-10-13T15:30'),
    );
    expect(setEndTime(long.party, at('2026-10-13T16:30'), rules, PARTY_NOW).hatchTime).toBe(
      at('2026-10-13T15:00'),
    );
  });

  it('stores a duration for a raid without times and counts it into the last possible time', () => {
    const change = setHatchedDuration(testRaid(), 120, 180, rules, PARTY_NOW);
    expect(change).toMatchObject({
      ok: true,
      party: { hatchTime: null, endTime: null, lastPossibleTime: PARTY_NOW + 180 * MINUTE },
    });
  });

  it('calls a scheduled archiving off when a longer duration says the raid is still on', () => {
    const now = at('2026-10-13T15:30');
    const over = {
      ...setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW),
      deletionTime: now + MINUTE,
    };
    expect(setHatchedDuration(over, 90, 180, rules, now)).toMatchObject({
      ok: true,
      party: { endTime: at('2026-10-13T16:00'), deletionTime: null },
    });
    expect(setHatchedDuration(over, 50, 180, rules, now)).toMatchObject({
      ok: true,
      party: { endTime: at('2026-10-13T15:20'), deletionTime: now + MINUTE },
    });
  });

  it('refuses a duration outside 1 minute to the maximum', () => {
    for (const minutes of [0, -5, 181, 2.5, Number.NaN]) {
      expect(setHatchedDuration(testRaid(), minutes, 180, rules, PARTY_NOW)).toEqual({
        ok: false,
        reason: 'bad-duration',
      });
    }
  });

  it('calls a scheduled archiving off when the corrected time says the raid is still on', () => {
    const over = {
      ...setEndTime(testRaid(), PARTY_NOW - 10 * MINUTE, rules, PARTY_NOW),
      deletionTime: PARTY_NOW + 5 * MINUTE,
    };
    expect(setEndTime(over, PARTY_NOW + 20 * MINUTE, rules, PARTY_NOW).deletionTime).toBeNull();
    expect(setEndTime(over, PARTY_NOW - 5 * MINUTE, rules, PARTY_NOW).deletionTime).toBe(
      PARTY_NOW + 5 * MINUTE,
    );
    expect(setHatchTime(over, PARTY_NOW - 10 * MINUTE, rules, PARTY_NOW).deletionTime).toBeNull();
  });
});

describe('timeConfirmed', () => {
  it('makes a time guessed from a screenshot sure, and leaves any other raid as it is', () => {
    const plain = testRaid();
    expect(timeConfirmed(plain)).toBe(plain);
    const guessed = {
      ...plain,
      raid: { ...plain.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true } },
    };
    expect(timeConfirmed(guessed).raid.screenshot).toEqual({
      id: 'Ab3_-xY9zQ12',
      timeUncertain: false,
    });
    const sure = timeConfirmed(guessed);
    expect(timeConfirmed(sure)).toBe(sure);
  });

  it('is not what a change of the boss does, also when it moves the times for another tier', () => {
    const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const guessed = {
      ...egg,
      raid: { ...egg.raid, screenshot: { id: null, timeUncertain: true } },
    };
    for (const tier of [T5, ELITE]) {
      const changed = setBoss(guessed, { tier, boss: YVELTAL }, rules, PARTY_NOW).party;
      expect(changed.raid.screenshot).toEqual({ id: null, timeUncertain: true });
    }
  });
});

describe('raidStage and blocksNewRaid', () => {
  const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);

  it('goes by the clock: egg until the hatch time, hatched until the end, then ended', () => {
    expect(raidStage(egg, at('2026-10-13T14:29'))).toBe('egg');
    expect(raidStage(egg, at('2026-10-13T14:30'))).toBe('hatched');
    expect(raidStage(egg, at('2026-10-13T15:14'))).toBe('hatched');
    expect(raidStage(egg, at('2026-10-13T15:15'))).toBe('ended');
  });

  it('without times: what it was reported as, and ended after the last possible time', () => {
    expect(raidStage(testRaid(), PARTY_NOW)).toBe('egg');
    expect(raidStage(testRaid(), PARTY_NOW + 105 * MINUTE - 1)).toBe('egg');
    expect(raidStage(testRaid(), PARTY_NOW + 105 * MINUTE)).toBe('ended');
    const seenHatched = testRaid({ boss: YVELTAL });
    expect(raidStage(seenHatched, PARTY_NOW)).toBe('hatched');
    expect(raidStage(seenHatched, PARTY_NOW + 45 * MINUTE)).toBe('ended');
  });

  it('does not hatch a timeless egg when its boss is named, nor turn a raid seen hatched back', () => {
    const named = setBoss(testRaid(), { tier: T5, boss: YVELTAL }, rules, PARTY_NOW).party;
    expect(raidStage(named, PARTY_NOW)).toBe('egg');
    expect(named.lastPossibleTime).toBe(PARTY_NOW + 105 * MINUTE);
    const unnamed = setBoss(
      testRaid({ boss: YVELTAL }),
      { tier: T5, boss: null },
      rules,
      PARTY_NOW,
    );
    expect(raidStage(unnamed.party, PARTY_NOW)).toBe('hatched');
  });

  it('blocks a new raid at the gym only until the raid has ended', () => {
    expect(blocksNewRaid(egg, at('2026-10-13T15:14'))).toBe(true);
    expect(blocksNewRaid(egg, at('2026-10-13T15:15'))).toBe(false);
    expect(blocksNewRaid({ ...egg, status: 'ended' }, at('2026-10-13T14:00'))).toBe(false);
  });
});

// Plan 8E (Matt, 2026-10-26): an elite raid shows its egg on the gym, so one raid per gym.
describe('raidStandingAt and standsAtGym: one raid per gym, of any kind', () => {
  const ID = (n: number): string => `00000000-0000-4000-8000-00000000080${String(n)}`;
  const standard = setHatchTime(testRaid({ id: ID(1) }), at('2026-10-13T14:30'), rules, PARTY_NOW);
  const elite = testRaid({ id: ID(2), tier: ELITE, now: PARTY_NOW + MINUTE });

  it('finds the raid at a gym whatever its kind, and the first of two stored before', () => {
    expect(raidStandingAt([elite], 1, 1, PARTY_NOW + MINUTE)).toBe(elite);
    expect(raidStandingAt([standard], 1, 1, PARTY_NOW + MINUTE)).toBe(standard);
    expect(raidStandingAt([standard, elite], 1, 1, PARTY_NOW + MINUTE)).toBe(standard);
    expect(raidStandingAt([standard, elite], 1, 2, PARTY_NOW + MINUTE)).toBeUndefined();
  });

  it('leaves out the raid asked about, and every raid that has ended', () => {
    expect(raidStandingAt([standard, elite], 1, 1, PARTY_NOW + MINUTE, ID(1))).toBe(elite);
    expect(raidStandingAt([standard], 1, 1, at('2026-10-13T15:15'))).toBeUndefined();
    const ended = { ...elite, status: 'ended' as const };
    expect(raidStandingAt([ended], 1, 1, PARTY_NOW + MINUTE)).toBeUndefined();
  });

  it('says whether one raid stands at a gym: at it, and not ended by the clock', () => {
    expect(standsAtGym(elite, 1, 1, PARTY_NOW + MINUTE)).toBe(true);
    expect(standsAtGym(elite, 1, 2, PARTY_NOW + MINUTE)).toBe(false);
    expect(standsAtGym(standard, 1, 1, at('2026-10-13T15:14'))).toBe(true);
    expect(standsAtGym(standard, 1, 1, at('2026-10-13T15:15'))).toBe(false);
  });

  // Review E7 (the coordinator's ruling): a raid stands at a gym for its server only.
  it('finds a raid at a gym for its own server only', () => {
    const otherServer = { ...elite, guildId: 2 };
    expect(standsAtGym(otherServer, 1, 1, PARTY_NOW + MINUTE)).toBe(false);
    expect(standsAtGym(otherServer, 2, 1, PARTY_NOW + MINUTE)).toBe(true);
    expect(raidStandingAt([otherServer, standard], 1, 1, PARTY_NOW + MINUTE)).toBe(standard);
    expect(raidStandingAt([otherServer], 1, 1, PARTY_NOW + MINUTE)).toBeUndefined();
  });
});

describe('a boss is stored as a reference and nothing more', () => {
  const yveltal = raidBossesFixture()
    .bosses()
    .find((boss) => boss.key === 'yveltal');

  it('raidBossRef is the catalogue key of a boss the game master knows', () => {
    expect(yveltal?.entry).toBeDefined();
    expect(raidBossRef(yveltal as RaidBoss)).toEqual({ key: 'yveltal' });
  });

  it('raidBossRef is the name of a boss without a catalogue entry, not its key', () => {
    expect(raidBossRef({ entry: undefined, name: 'Newmon' })).toEqual({ name: 'Newmon' });
  });

  it('createRaid keeps only the reference of whatever object it is given', () => {
    const raid = testRaid({ boss: yveltal as unknown as RaidBossRef });
    expect(raid.raid.boss).toEqual({ key: 'yveltal' });
    const unknown = testRaid({
      boss: { name: 'Newmon', extra: 1 } as unknown as RaidBossRef,
    });
    expect(unknown.raid.boss).toEqual({ name: 'Newmon' });
  });

  it('a value with both a key and a name is read as the key', () => {
    const raid = testRaid({ boss: { key: 'yveltal', name: 'Yveltal' } as unknown as RaidBossRef });
    expect(raid.raid.boss).toEqual({ key: 'yveltal' });
  });

  it('setBoss keeps only the reference of whatever object it is given', () => {
    const change = setBoss(
      testRaid(),
      { tier: T5, boss: yveltal as unknown as RaidBossRef },
      rules,
      PARTY_NOW,
    );
    expect(change.party.raid.boss).toEqual({ key: 'yveltal' });
  });
});

describe('setBoss', () => {
  it('names the boss of an egg, keeps the times, and says the raid was an egg', () => {
    const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const change = setBoss(
      egg,
      { tier: T5, boss: YVELTAL, chargedMove: 'DARK_PULSE' },
      rules,
      PARTY_NOW,
    );
    expect(change).toMatchObject({ changed: true, wasEgg: true });
    expect(change.party).toMatchObject({ hatchTime: egg.hatchTime, endTime: egg.endTime });
    expect(change.party.raid).toMatchObject({
      boss: YVELTAL,
      fastMove: null,
      chargedMove: 'DARK_PULSE',
    });
  });

  it('changes nothing when boss and tier are what they were', () => {
    const raid = testRaid({ boss: YVELTAL, fastMove: 'SNARL_FAST' });
    const change = setBoss(raid, { tier: T5, boss: { key: 'yveltal' } }, rules, PARTY_NOW);
    expect(change).toEqual({ party: raid, changed: false, wasEgg: false });
  });

  it('forgets the moves of the boss before', () => {
    const raid = testRaid({ boss: YVELTAL, fastMove: 'SNARL_FAST', chargedMove: 'DARK_PULSE' });
    const change = setBoss(raid, { tier: T5, boss: { key: 'xerneas' } }, rules, PARTY_NOW);
    expect(change.party.raid).toMatchObject({
      boss: { key: 'xerneas' },
      fastMove: null,
      chargedMove: null,
    });
    const egg = setBoss(raid, { tier: T5, boss: null, fastMove: 'SNARL_FAST' }, rules, PARTY_NOW);
    expect(egg.party.raid).toMatchObject({ boss: null, fastMove: null });
  });

  it('tells a boss the game master knows from one known only by the name of the feed', () => {
    const raid = testRaid({ boss: { name: 'Newmon' } });
    expect(setBoss(raid, { tier: T5, boss: { name: 'Newmon' } }, rules, PARTY_NOW).changed).toBe(
      false,
    );
    expect(setBoss(raid, { tier: T5, boss: { key: 'newmon' } }, rules, PARTY_NOW).changed).toBe(
      true,
    );
  });

  it('keeps the hatch time of an egg and the end of a hatched raid when the kind changes', () => {
    // An egg hatching at 14:30: as an elite raid it lasts 30 minutes, not 45.
    const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const eliteEgg = setBoss(egg, { tier: ELITE, boss: null }, rules, PARTY_NOW).party;
    expect(eliteEgg).toMatchObject({
      hatchTime: at('2026-10-13T14:30'),
      endTime: at('2026-10-13T15:00'),
    });

    // A hatched raid ending 14:40: as an elite raid it hatched at 14:10, not 13:55.
    const hatched = setEndTime(testRaid(), at('2026-10-13T14:40'), rules, PARTY_NOW);
    const eliteBoss = setBoss(
      hatched,
      { tier: ELITE, boss: { key: 'mewtwo' } },
      rules,
      PARTY_NOW,
    ).party;
    expect(eliteBoss).toMatchObject({
      hatchTime: at('2026-10-13T14:10'),
      endTime: at('2026-10-13T14:40'),
    });
  });

  it('leaves both times alone when the kind of raid stays the same, also next to an event', () => {
    // Wednesday 14 October 2026, Raid Hour from 18:00. An egg hatching at 17:50 ends at 18:35;
    // read backwards from that end, the Raid Hour would make it a 25-minute raid from 18:10.
    const reported = at('2026-10-14T17:00');
    const now = at('2026-10-14T17:50');
    const egg = setHatchTime(testRaid({ now: reported }), now, rules, reported);
    expect(egg).toMatchObject({ hatchTime: now, endTime: at('2026-10-14T18:35') });
    const named = setBoss(egg, { tier: T5, boss: YVELTAL }, rules, now).party;
    expect(named).toMatchObject({ hatchTime: now, endTime: at('2026-10-14T18:35') });
    const mega = { tier: { level: 'Mega', shadow: false }, boss: null } as const;
    expect(setBoss(egg, mega, rules, now).party).toMatchObject({
      hatchTime: now,
      endTime: at('2026-10-14T18:35'),
    });
  });

  it('keeps a duration set for the raid when the kind changes', () => {
    const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const long = setHatchedDuration(egg, 90, 180, rules, PARTY_NOW);
    if (!long.ok) throw new Error('refused');
    const elite = setBoss(long.party, { tier: ELITE, boss: null }, rules, PARTY_NOW).party;
    expect(elite).toMatchObject({
      hatchTime: at('2026-10-13T14:30'),
      endTime: at('2026-10-13T16:00'),
    });
  });

  it('works out the last possible time again, also downwards', () => {
    const elite = testRaid({ tier: ELITE });
    expect(elite.lastPossibleTime).toBeGreaterThan(PARTY_NOW + 105 * MINUTE);
    const normal = setBoss(elite, { tier: T5, boss: YVELTAL }, rules, PARTY_NOW).party;
    expect(normal.lastPossibleTime).toBe(PARTY_NOW + 105 * MINUTE);
  });

  it('makes everybody in-person when the raid becomes elite', () => {
    const raid = withAttendees(testRaid(), {
      [ALICE]: { remote: true },
      [BOB]: { remote: false, number: 2 },
    });
    const elite = setBoss(raid, { tier: ELITE, boss: null }, rules, PARTY_NOW).party;
    expect(elite.attendees[ALICE]).toMatchObject({ remote: false });
    expect(elite.attendees[BOB]).toMatchObject({ remote: false, number: 2 });
    const mega = setBoss(
      raid,
      { tier: { level: 'Mega', shadow: false }, boss: null },
      rules,
      PARTY_NOW,
    ).party;
    expect(mega.attendees[ALICE]).toMatchObject({ remote: true });
  });
});

describe('setMoveset, setGym, setSaved', () => {
  it('sets the moves given and keeps the other; an egg has none', () => {
    const raid = testRaid({ boss: YVELTAL, fastMove: 'SNARL_FAST' });
    expect(setMoveset(raid, { chargedMove: 'DARK_PULSE' })).toMatchObject({
      ok: true,
      party: { raid: { fastMove: 'SNARL_FAST', chargedMove: 'DARK_PULSE' } },
    });
    expect(setMoveset(raid, { fastMove: 'GUST_FAST' })).toMatchObject({
      ok: true,
      party: { raid: { fastMove: 'GUST_FAST', chargedMove: null } },
    });
    expect(setMoveset(testRaid(), { fastMove: 'SNARL_FAST' })).toEqual({
      ok: false,
      reason: 'no-boss',
    });
  });

  it('moves the raid to a gym and says whether that is another region', () => {
    expect(setGym(testRaid(), 2, 1)).toMatchObject({
      party: { gymId: 2, regionId: 1 },
      regionChanged: false,
    });
    expect(setGym(testRaid(), 7, 2)).toMatchObject({
      party: { gymId: 7, regionId: 2 },
      regionChanged: true,
    });
  });

  it('keeps a party a moderator saved from being archived, and lets it go again', () => {
    const scheduled = { ...testRaid(), deletionTime: PARTY_NOW + MINUTE };
    expect(setSaved(scheduled, true)).toMatchObject({ saved: true, deletionTime: null });
    expect(setSaved(setSaved(scheduled, true), false)).toMatchObject({
      saved: false,
      deletionTime: null,
    });
    expect(setSaved(scheduled, false)).toMatchObject({
      saved: false,
      deletionTime: PARTY_NOW + MINUTE,
    });
  });
});

describe('a boss object handed in whole', () => {
  it('is stored as the feed name when the game master does not know it', () => {
    // What `ctx.raidBosses` gives for a Pokémon newer than the game master: its `key` is the
    // lower-cased id, not a catalogue key, and `entry` is undefined.
    const unknown = { key: 'newmon', name: 'Newmon', entry: undefined } as unknown as {
      key: string;
    };
    expect(testRaid({ boss: unknown }).raid.boss).toEqual({ name: 'Newmon' });
    const named = setBoss(testRaid(), { tier: T5, boss: unknown }, rules, PARTY_NOW).party;
    expect(named.raid.boss).toEqual({ name: 'Newmon' });
  });
});

describe('raidMirrors', () => {
  const plain = { taggedEx: false, confirmedEx: false };
  const tagged = { taggedEx: true, confirmedEx: false };
  const hosted = { taggedEx: false, confirmedEx: true };

  it('wants a raid in the remote channel, and in the channel for elite raid gyms when its gym is one', () => {
    const egg = testRaid();
    expect(raidMirrors(egg, plain, PARTY_NOW)).toEqual(['remote']);
    expect(raidMirrors(egg, tagged, PARTY_NOW)).toEqual(['ex', 'remote']);
    expect(raidMirrors(egg, hosted, PARTY_NOW)).toEqual(['ex', 'remote']);
    expect(raidMirrors(egg, undefined, PARTY_NOW)).toEqual(['remote']);
  });

  it('keeps an elite raid out of the remote channel', () => {
    expect(raidMirrors(testRaid({ tier: ELITE }), tagged, PARTY_NOW)).toEqual(['ex']);
    expect(raidMirrors(testRaid({ tier: ELITE }), plain, PARTY_NOW)).toEqual([]);
  });

  it('wants none for a raid that is over by the clock, or has ended', () => {
    const raid = setEndTime(testRaid({ boss: YVELTAL }), PARTY_NOW + 10 * MINUTE, rules, PARTY_NOW);
    expect(raidMirrors(raid, tagged, PARTY_NOW + 9 * MINUTE)).toEqual(['ex', 'remote']);
    expect(raidMirrors(raid, tagged, PARTY_NOW + 10 * MINUTE)).toEqual([]);
    expect(raidMirrors({ ...testRaid(), status: 'ended' }, tagged, PARTY_NOW)).toEqual([]);
  });
});
