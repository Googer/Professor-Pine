import { describe, expect, it } from 'vitest';
import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
import {
  memberLabel,
  memberLabelOfUnit,
  storedReport,
  type StoredReport,
} from './screenshot-record.js';

const NAMES: Record<number, string> = { 7: 'Heinz Plant' };
const gymName = (id: number) => NAMES[id];

function report(overrides: Partial<StoredReport> = {}): StoredReport {
  return {
    gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
    stage: 'hatched',
    heads: 5,
    tier: { level: 'T5', shadow: true },
    tierFrom: 'boss',
    cp: 47444,
    bossName: 'Landorus',
    boss: { key: 'landorus_incarnate', name: 'Landorus', tier: { level: 'T5', shadow: true } },
    bossFrom: 'cp',
    eliteBadge: false,
    purple: 0.08,
    clock: { hour: 1, minute: 38 },
    countdown: 1800,
    takenAt: 0,
    timeFrom: 'clock',
    time: { end: 1 },
    doubts: [],
    ...overrides,
  };
}

describe('memberLabel', () => {
  it('makes what the reader decided of a hatched raid the answer key', () => {
    expect(memberLabel(report(), null, gymName)).toEqual({
      source: 'member',
      gym: 'Heinz Plant',
      egg: false,
      tier: 5,
      shadow: true,
      boss: 'Landorus',
    });
  });

  it('keys a mega egg by its four heads, with no boss', () => {
    const mega = report({
      stage: 'egg',
      heads: 4,
      tier: { level: 'Mega', shadow: false },
      boss: null,
      cp: null,
    });
    expect(memberLabel(mega, null, gymName)).toEqual({
      source: 'member',
      gym: 'Heinz Plant',
      egg: true,
      tier: 4,
      shadow: false,
    });
  });

  it('leaves out what the member typed, and is nothing when nothing is left', () => {
    const typed = {
      gymId: 7,
      boss: {
        tier: { level: 'T5' as const, shadow: true },
        key: 'landorus_incarnate',
        hatched: true,
      },
    };
    expect(memberLabel(report(), typed, gymName)).toBeUndefined();
    expect(memberLabel(report(), { gymId: 7 }, gymName)).not.toHaveProperty('gym');
  });

  it('keys the gym the member picked, else a gym read clearly, else none', () => {
    const names: Record<number, string> = { 7: 'Heinz Plant', 9: 'Old Plant Church' };
    const own = (id: number) => names[id];
    const unclear = report({
      gym: { read: 'Plant', searched: 'Plant', gymId: 7, place: 'local', clear: false },
    });
    expect(memberLabel(unclear, null, own)).not.toHaveProperty('gym');
    expect(memberLabel(unclear, null, own, 9)?.gym).toBe('Old Plant Church');
    expect(memberLabel(report(), null, own, 9)?.gym).toBe('Old Plant Church');
  });

  it('keys the boss the member chose of those the CP fits, and none before they chose', () => {
    const t5 = { level: 'T5' as const, shadow: false };
    const open = report({
      tier: t5,
      boss: null,
      bossFrom: null,
      bossChoices: [
        { key: 'kyurem_black', name: 'Black Kyurem', tier: t5 },
        { key: 'kyurem_white', name: 'White Kyurem', tier: t5 },
      ],
      doubts: ['boss-choice'],
    });
    expect(memberLabel(open, null, gymName)?.boss).toBeNull();
    expect(memberLabel(open, null, gymName, null, 'kyurem_white')?.boss).toBe('White Kyurem');
    // A key that is none of the choices is no answer.
    expect(memberLabel(open, null, gymName, null, 'yveltal')?.boss).toBeNull();
  });
});

describe('storedReport', () => {
  it('keeps the bosses the CP fits by their key, name and tier', () => {
    const t5 = { level: 'T5' as const, shadow: false };
    const choice = { key: 'kyurem_black', name: 'Black Kyurem', tier: t5 };
    const listed = raidBossesFixture().bosses()[0];
    if (!listed) throw new Error('no boss');
    const read = { ...report(), boss: null, bossChoices: [{ ...listed, ...choice }] };
    expect(storedReport(read).bossChoices).toEqual([choice]);
  });
});

// Review S2 of plan 7P: a pane record's label is that of its pane, never the whole picture's.
describe('memberLabelOfUnit', () => {
  const label = { source: 'member' as const, gym: 'Heinz Plant', egg: true, tier: 5 };

  it('scores a pane record’s label against the pane of its index only', () => {
    const record = { label, pane: { index: 2 } };
    expect(memberLabelOfUnit(record, { pane: 2 })).toBe(label);
    expect(memberLabelOfUnit(record, { pane: 1 })).toBeUndefined();
  });

  it('skips a pane record’s label when the picture was not cut into its pane', () => {
    expect(memberLabelOfUnit({ label, pane: { index: 2 } }, { pane: null })).toBeUndefined();
  });

  it('scores a record of one screen against the whole picture', () => {
    expect(memberLabelOfUnit({ label }, { pane: null })).toBe(label);
    expect(memberLabelOfUnit({}, { pane: null })).toBeUndefined();
    expect(memberLabelOfUnit(undefined, { pane: null })).toBeUndefined();
  });

  // Review F1 of plan 7P: a record kept whole (before 7P, or read late) whose picture is cut now.
  it('scores a record of one screen against the first pane that shows a screen when cut', () => {
    expect(memberLabelOfUnit({ label }, { pane: 2, firstScreen: true })).toBe(label);
    expect(memberLabelOfUnit({ label }, { pane: 1, firstScreen: false })).toBeUndefined();
    expect(memberLabelOfUnit({ label }, { pane: 1 })).toBeUndefined();
  });

  it('never scores a pane record’s label against another pane that shows the first screen', () => {
    expect(
      memberLabelOfUnit({ label, pane: { index: 2 } }, { pane: 1, firstScreen: true }),
    ).toBeUndefined();
  });
});
