import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../../test/support/parties.js';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { loadSettings } from '../../config/settings.js';
import { setSaved, endParty } from './party.js';
import type { RaidParty } from './party.js';
import { setEndTime, setHatchTime } from './raid.js';
import { PartyStatus } from './status.js';
import { partyTick, tickAutoset, type TickInput } from './tick.js';

const rules = testRaidRules();
/** Start-clear 10, grace 5, warning 10, completion timeout 5 minutes. */
const settings = loadSettings(TEST_SETTINGS_PATH);
const { Present, Coming, CompletePending, Complete } = PartyStatus;

function tick(party: RaidParty, now: number, extra: Partial<TickInput> = {}) {
  return partyTick(party, {
    now,
    previous: now - MINUTE,
    settings,
    rules,
    autoset: () => undefined,
    ...extra,
  });
}

/** An egg reported at 14:00 that hatches at 14:30 and ends at 15:15. */
const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);

describe('tickAutoset', () => {
  const autoset = tickAutoset(raidBossesFixture());

  it('names the reference of the boss that is certain for a tier; no move where there is a choice', () => {
    expect(autoset({ level: 'T5', shadow: false })).toEqual({
      boss: { key: 'yveltal' },
      fastMove: null,
      chargedMove: null,
    });
  });

  it('presets the one fast move of a boss that has no other', () => {
    const kyogre = catalogueFixture().byKey('kyogre');
    const only = tickAutoset({
      autoset: () => ({
        key: 'kyogre',
        name: 'Kyogre',
        tier: { level: 'T5', shadow: false },
        shiny: false,
        entry: kyogre,
        source: 'feed',
        autoset: false,
        pokemonId: 'KYOGRE',
        form: null,
      }),
    });
    expect(only({ level: 'T5', shadow: false })).toEqual({
      boss: { key: 'kyogre' },
      fastMove: 'WATERFALL_FAST',
      chargedMove: null,
    });
  });

  it('gives undefined for a tier with several bosses and for one with none', () => {
    expect(autoset({ level: 'T3', shadow: false })).toBeUndefined();
    expect(autoset({ level: 'Elite', shadow: false })).toBeUndefined();
  });
});

describe('partyTick: stages', () => {
  it('does nothing while nothing is due', () => {
    const result = tick(egg, at('2026-10-13T14:29'));
    expect(result).toEqual({ party: egg, effects: [], render: false });
    expect(result.party).toBe(egg);
  });

  it('reports the hatch once, and has the post shown anew', () => {
    const first = tick(egg, at('2026-10-13T14:30'));
    expect(first.effects).toEqual([{ kind: 'stage', from: 'egg', to: 'hatched', bossSet: false }]);
    expect(first.render).toBe(true);
    expect(first.party.raid.stageSeen).toBe('hatched');
    const next = tick(first.party, at('2026-10-13T14:31'));
    expect(next).toEqual({ party: first.party, effects: [], render: false });
    expect(next.party).toBe(first.party);
  });

  it('gives a hatching egg the boss its tier is sure to have', () => {
    const result = tick(egg, at('2026-10-13T14:30'), {
      autoset: (tier) =>
        tier.level === 'T5' ? { boss: { key: 'yveltal' }, fastMove: 'SNARL_FAST' } : undefined,
    });
    expect(result.effects).toEqual([{ kind: 'stage', from: 'egg', to: 'hatched', bossSet: true }]);
    expect(result.party.raid).toMatchObject({
      boss: { key: 'yveltal' },
      fastMove: 'SNARL_FAST',
      stageSeen: 'hatched',
    });
    expect(result.party).toMatchObject({ hatchTime: egg.hatchTime, endTime: egg.endTime });
  });

  it('leaves a boss alone that a member already named', () => {
    const named = { ...egg, raid: { ...egg.raid, boss: { key: 'xerneas' } } };
    const result = tick(named, at('2026-10-13T14:30'), {
      autoset: () => ({ boss: { key: 'yveltal' } }),
    });
    expect(result.party.raid.boss).toEqual({ key: 'xerneas' });
    expect(result.effects).toEqual([{ kind: 'stage', from: 'egg', to: 'hatched', bossSet: false }]);
  });

  it('reports the end, and a raid that goes back to being an egg after a correction', () => {
    const hatched = tick(egg, at('2026-10-13T14:30')).party;
    expect(tick(hatched, at('2026-10-13T15:15')).effects).toEqual([
      { kind: 'stage', from: 'hatched', to: 'ended', bossSet: false },
    ]);
    const corrected = setHatchTime(hatched, at('2026-10-13T14:50'), rules, at('2026-10-13T14:31'));
    expect(tick(corrected, at('2026-10-13T14:32')).effects).toEqual([
      { kind: 'stage', from: 'hatched', to: 'egg', bossSet: false },
    ]);
  });

  it('catches up in one tick after the bot was down, and is quiet on the next', () => {
    // Down from 14:10 to 15:40: hatch and end were missed, and the grace time has passed.
    const late = at('2026-10-13T15:40');
    const first = tick(egg, late, { previous: null });
    expect(first.effects).toEqual([
      { kind: 'stage', from: 'egg', to: 'ended', bossSet: false },
      { kind: 'warn', deletionTime: late + 10 * MINUTE },
    ]);
    expect(tick(first.party, late + MINUTE).effects).toEqual([]);
  });

  it('names the boss of an egg whose hatch and end were both missed', () => {
    const late = at('2026-10-13T15:40');
    const result = tick(egg, late, {
      previous: null,
      autoset: () => ({ boss: { key: 'yveltal' }, fastMove: 'SNARL_FAST' }),
    });
    expect(result.effects).toEqual([
      { kind: 'stage', from: 'egg', to: 'ended', bossSet: true },
      { kind: 'warn', deletionTime: late + 10 * MINUTE },
    ]);
    expect(result.party.raid).toMatchObject({
      boss: { key: 'yveltal' },
      fastMove: 'SNARL_FAST',
      stageSeen: 'ended',
    });
  });
});

describe('partyTick: meeting times', () => {
  const meet = at('2026-10-13T14:40');
  const meeting: RaidParty = {
    ...withAttendees(egg, {
      [ALICE]: { status: Present },
      [BOB]: { status: Coming },
      [CAROL]: { status: Present, group: 'A', number: 2 },
    }),
    groups: [{ id: 'A', startTime: meet }],
    raid: { ...egg.raid, stageSeen: 'hatched' },
  };

  it('keeps a meeting time shown for ten minutes after it passed', () => {
    expect(tick(meeting, meet).effects).toEqual([]);
    const passed = tick(meeting, meet + MINUTE);
    expect(passed.effects).toEqual([]);
    expect(passed.render).toBe(true);
    expect(passed.party.groups).toEqual([
      { id: 'A', startTime: meet, startClearTime: meet + 10 * MINUTE },
    ]);
    expect(tick(passed.party, meet + 10 * MINUTE).effects).toEqual([]);
  });

  it('then removes it and asks the present members of the group', () => {
    const passed = tick(meeting, meet + MINUTE).party;
    const now = meet + 11 * MINUTE;
    const cleared = tick(passed, now);
    expect(cleared.effects).toEqual([
      { kind: 'ask-complete', group: 'A', members: [ALICE, CAROL] },
    ]);
    expect(cleared.render).toBe(true);
    expect(cleared.party.groups).toEqual([{ id: 'A' }]);
    expect(cleared.party.attendees[ALICE]).toMatchObject({
      status: CompletePending,
      pendingUntil: now + 5 * MINUTE,
    });
    expect(cleared.party.attendees[BOB]?.status).toBe(Coming);
  });

  it('does both at once when the bot was down over the whole time', () => {
    const result = tick(meeting, meet + 30 * MINUTE, { previous: null });
    expect(result.party.groups).toEqual([{ id: 'A' }]);
    expect(result.effects).toEqual([{ kind: 'ask-complete', group: 'A', members: [ALICE, CAROL] }]);
    expect(result.render).toBe(true);
  });

  it('asks nobody when nobody of the group is present', () => {
    const nobody = withAttendees(meeting, {
      [ALICE]: { status: Coming },
      [CAROL]: { status: Complete },
    });
    const result = tick(nobody, meet + 30 * MINUTE);
    expect(result.effects).toEqual([]);
    expect(result.render).toBe(true);
  });

  it('asks the members of every group whose clear time has passed, in group order', () => {
    const two: RaidParty = {
      ...withAttendees(meeting, {
        [ALICE]: { status: Present, group: 'A' },
        [BOB]: { status: Present, group: 'B' },
        [CAROL]: { status: Present, group: 'B' },
      }),
      groups: [
        { id: 'A', startTime: meet, startClearTime: meet + 10 * MINUTE },
        { id: 'B', startTime: meet + MINUTE },
      ],
    };
    const result = tick(two, meet + 30 * MINUTE);
    expect(result.effects).toEqual([
      { kind: 'ask-complete', group: 'A', members: [ALICE] },
      { kind: 'ask-complete', group: 'B', members: [BOB, CAROL] },
    ]);
    expect(result.party.groups).toEqual([{ id: 'A' }, { id: 'B' }]);
  });

  it('is quiet on the tick straight after a question was asked', () => {
    const now = meet + 11 * MINUTE;
    const asked = tick(tick(meeting, meet + MINUTE).party, now);
    expect(asked.effects).toHaveLength(1);
    const next = tick(asked.party, now + MINUTE);
    expect(next).toEqual({ party: asked.party, effects: [], render: false });
    expect(next.party).toBe(asked.party);
  });
});

describe('partyTick: several effects at once', () => {
  it('reports them in the order stage, ask-complete, completed, warn', () => {
    const meet = at('2026-10-13T14:40');
    const busy: RaidParty = {
      ...withAttendees(egg, {
        [ALICE]: { status: Present },
        [CAROL]: { status: CompletePending, pendingUntil: at('2026-10-13T15:00') },
      }),
      groups: [{ id: 'A', startTime: meet, startClearTime: meet + 10 * MINUTE }],
    };
    const late = at('2026-10-13T15:40');
    const result = tick(busy, late, { previous: null });
    expect(result.effects).toEqual([
      { kind: 'stage', from: 'egg', to: 'ended', bossSet: false },
      { kind: 'ask-complete', group: 'A', members: [ALICE] },
      { kind: 'completed', members: [CAROL] },
      { kind: 'warn', deletionTime: late + 10 * MINUTE },
    ]);
  });
});

describe('partyTick: unanswered questions', () => {
  it('completes those whose time to answer is up, also after a restart', () => {
    const asked = withAttendees(
      { ...egg, raid: { ...egg.raid, stageSeen: 'hatched' } },
      {
        [ALICE]: { status: CompletePending, pendingUntil: at('2026-10-13T14:45') },
        [BOB]: { status: CompletePending, pendingUntil: at('2026-10-13T14:50') },
      },
    );
    const result = tick(asked, at('2026-10-13T14:46'), { previous: null });
    expect(result.effects).toEqual([{ kind: 'completed', members: [ALICE] }]);
    expect(result.party.attendees[ALICE]?.status).toBe(Complete);
    expect(result.party.attendees[BOB]?.status).toBe(CompletePending);
  });
});

describe('partyTick: archiving', () => {
  const ended = (now: number): RaidParty => ({
    ...setEndTime(testRaid(), at('2026-10-13T15:15'), rules, PARTY_NOW),
    raid: { ...egg.raid, stageSeen: now >= at('2026-10-13T15:15') ? 'ended' : 'hatched' },
  });

  it('schedules it five minutes after the end, ten minutes ahead, with a warning', () => {
    const before = at('2026-10-13T15:20');
    expect(tick(ended(before), before).effects).toEqual([]);
    const after = before + 1;
    const result = tick(ended(after), after);
    expect(result.effects).toEqual([{ kind: 'warn', deletionTime: after + 10 * MINUTE }]);
    expect(result.party.deletionTime).toBe(after + 10 * MINUTE);
  });

  it('asks for the end at the archiving time, every tick until the party is ended', () => {
    const now = at('2026-10-13T15:21');
    const scheduled = tick(ended(now), now).party;
    expect(tick(scheduled, now + 10 * MINUTE - 1).effects).toEqual([]);
    expect(tick(scheduled, now + 10 * MINUTE).effects).toEqual([{ kind: 'end' }]);
    expect(tick(scheduled, now + 11 * MINUTE).effects).toEqual([{ kind: 'end' }]);
    const gone = endParty(scheduled);
    expect(gone.status).toBe('ended');
    expect(tick(gone, now + 12 * MINUTE)).toEqual({ party: gone, effects: [], render: false });
  });

  it('asks for the end and nothing else, whatever else is due', () => {
    const now = at('2026-10-13T15:21');
    const scheduled = tick(ended(now), now).party;
    const due = now + 10 * MINUTE;
    const busy: RaidParty = {
      ...withAttendees(scheduled, {
        [ALICE]: { status: Present },
        [BOB]: { status: CompletePending, pendingUntil: now },
      }),
      groups: [{ id: 'A', startTime: now - 30 * MINUTE, startClearTime: now - 20 * MINUTE }],
      raid: { ...scheduled.raid, stageSeen: 'hatched' },
    };
    const result = tick(busy, due, { previous: due - 24 * 60 * MINUTE });
    expect(result).toEqual({ party: busy, effects: [{ kind: 'end' }], render: false });
    expect(result.party).toBe(busy);
  });

  it('warns again with the full warning time when a saved party is let go', () => {
    const now = at('2026-10-13T16:00');
    const saved = setSaved(ended(now), true);
    expect(tick(saved, now).effects).toEqual([]);
    const released = setSaved(saved, false);
    const later = now + 30 * MINUTE;
    expect(tick(released, later).effects).toEqual([
      { kind: 'warn', deletionTime: later + 10 * MINUTE },
    ]);
  });

  it('goes by the last possible time for a raid nobody gave a time', () => {
    const raid = testRaid();
    const over = PARTY_NOW + 110 * MINUTE;
    expect(tick({ ...raid, raid: { ...raid.raid, stageSeen: 'ended' } }, over).effects).toEqual([]);
    expect(tick({ ...raid, raid: { ...raid.raid, stageSeen: 'ended' } }, over + 1).effects).toEqual(
      [{ kind: 'warn', deletionTime: over + 1 + 10 * MINUTE }],
    );
  });

  it('never schedules or ends a party a moderator saved', () => {
    const now = at('2026-10-13T16:00');
    const saved = setSaved(ended(now), true);
    expect(tick(saved, now).effects).toEqual([]);
    expect(tick({ ...saved, deletionTime: now - MINUTE }, now).effects).toEqual([]);
  });

  it('starts over when a corrected time called the archiving off', () => {
    const now = at('2026-10-13T15:21');
    const scheduled = tick(ended(now), now).party;
    const corrected = setEndTime(scheduled, at('2026-10-13T15:45'), rules, now);
    expect(corrected.deletionTime).toBeNull();
    expect(tick(corrected, now + 10 * MINUTE).effects).toEqual([
      { kind: 'stage', from: 'ended', to: 'hatched', bossSet: false },
    ]);
  });
});

describe('partyTick: the date', () => {
  it('shows the post anew when the day changed since the previous tick, or on the first tick', () => {
    // An elite egg is reported a day ahead: nothing is due at midnight but the date.
    const ex = testRaid({ tier: { level: 'Elite', shadow: false } });
    const midnight = at('2026-10-14T00:00');
    const changed = tick(ex, midnight + 1000, { previous: midnight - 1000 });
    expect(changed).toEqual({ party: ex, effects: [], render: true });
    const same = tick(ex, midnight + 61_000, { previous: midnight + 1000 });
    expect(same).toEqual({ party: ex, effects: [], render: false });
    expect(tick(ex, midnight + 1000, { previous: null })).toEqual({
      party: ex,
      effects: [],
      render: true,
    });
  });
});
