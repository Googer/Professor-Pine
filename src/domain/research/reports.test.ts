import { describe, expect, it } from 'vitest';
import {
  decideResearch,
  holdsSubject,
  researchSubjectOf,
  type StandingResearch,
} from './reports.js';

const TASK = '0123456789abcdef';
const OTHER = 'fedcba9876543210';
const GIBLE = '0000000a';
const BULBASAUR = '0000000b';
const CANDY = '0000000c';
const NOW = 1_000_000;

const v = (hash: string, task = TASK): string => `${task}:${hash}`;

const standing = (
  subjectKey: string,
  hashes: string[],
  overrides: Partial<StandingResearch> = {},
): StandingResearch => ({
  id: 7,
  subjectKey,
  hashes,
  endsAt: NOW + 60_000,
  reporterId: 'misty',
  ...overrides,
});

describe('a research subject read (plan 8R-5, R11)', () => {
  it('reads a task, a version of it, a typed task and its version; nothing else', () => {
    expect(researchSubjectOf(TASK)).toEqual({ task: TASK, hash: undefined });
    expect(researchSubjectOf(v(GIBLE))).toEqual({ task: TASK, hash: GIBLE });
    expect(researchSubjectOf(`typed:${TASK}`)).toEqual({ task: `typed:${TASK}`, hash: undefined });
    expect(researchSubjectOf(`typed:${TASK}:${GIBLE}`)).toEqual({
      task: `typed:${TASK}`,
      hash: GIBLE,
    });
    for (const no of [
      '',
      'typed:',
      `${TASK}:`,
      `${TASK}:xyz`,
      'grunt:water',
      `${TASK}:${GIBLE}:1`,
    ]) {
      expect(researchSubjectOf(no)).toBeUndefined();
    }
  });
});

describe('what becomes of a research report at a stop (plan 8R-5)', () => {
  const oneOf = { subjectKey: TASK, hashes: [GIBLE, BULBASAUR] };
  const gible = { subjectKey: v(GIBLE), hashes: [GIBLE] };
  const bulbasaur = { subjectKey: v(BULBASAUR), hashes: [BULBASAUR] };
  const candy = { subjectKey: v(CANDY), hashes: [CANDY] };
  const typedCandy = { subjectKey: `typed:${OTHER}:${CANDY}`, hashes: [CANDY] };
  const typedBare = { subjectKey: `typed:${OTHER}`, hashes: [] };

  it.each([
    ['nothing stands', undefined, gible, 'new'],
    ['what stood has ended', standing(TASK, [GIBLE, BULBASAUR], { endsAt: NOW }), gible, 'new'],
    ['a reward over its "one of"', standing(TASK, [GIBLE, BULBASAUR]), gible, 'narrow'],
    [
      'a reward over a "one of" of before (items too)',
      standing(TASK, [GIBLE, CANDY]),
      candy,
      'narrow',
    ],
    ['"one of" over one of its rewards', standing(v(GIBLE), [GIBLE]), oneOf, 'less'],
    ['the same reward again', standing(v(GIBLE), [GIBLE]), gible, 'again'],
    ['the same "one of" again', standing(TASK, [GIBLE, BULBASAUR]), oneOf, 'again'],
    ['a reward over a bare key of that one reward (R10)', standing(TASK, [GIBLE]), gible, 'again'],
    ['another reward of the task', standing(v(GIBLE), [GIBLE]), bulbasaur, 'asks'],
    ['"one of" over an item of the task', standing(v(CANDY), [CANDY]), oneOf, 'asks'],
    ['a reward the "one of" does not hold', standing(TASK, [GIBLE, BULBASAUR]), candy, 'asks'],
    ['another task', standing(v(GIBLE, OTHER), [GIBLE]), gible, 'asks'],
    ['a bare key of one reward, another reward (R10)', standing(TASK, [GIBLE]), bulbasaur, 'asks'],
    ['a typed reward over its typed task', standing(`typed:${OTHER}`, []), typedCandy, 'narrow'],
    [
      'a typed task over its reward',
      standing(`typed:${OTHER}:${CANDY}`, [CANDY]),
      typedBare,
      'less',
    ],
    ['a typed task over a listed one', standing(v(CANDY), [CANDY]), typedCandy, 'asks'],
  ] as const)('%s: %s', (_what, there, report, expected) => {
    expect(decideResearch(there, report, NOW, 'ash')).toBe(expected);
  });

  it('corrects the reporter’s own report without asking, and one the member ticked', () => {
    const own = standing(v(GIBLE), [GIBLE], { reporterId: 'ash' });
    expect(decideResearch(own, bulbasaur, NOW, 'ash')).toBe('correct');
    const misty = standing(v(GIBLE), [GIBLE], { id: 9 });
    expect(decideResearch(misty, bulbasaur, NOW, 'ash', [9])).toBe('correct');
    expect(decideResearch(misty, bulbasaur, NOW, 'ash', [8])).toBe('asks');
    // Ticking says nothing of what is no contest.
    expect(decideResearch(standing(v(GIBLE), [GIBLE], { id: 9 }), gible, NOW, 'ash', [9])).toBe(
      'again',
    );
  });
});

describe('a stop that holds the task already (plan 8M-11A, S18)', () => {
  it('holds a version where the same version stands', () => {
    expect(holdsSubject(v(GIBLE), { subjectKey: v(GIBLE), oneOf: false })).toBe(true);
    expect(holdsSubject(v(CANDY), { subjectKey: v(GIBLE), oneOf: false })).toBe(false);
    expect(holdsSubject(TASK, { subjectKey: v(GIBLE), oneOf: false })).toBe(false);
  });

  it('holds a "one of" where any version of its task stands, by the task', () => {
    expect(holdsSubject(v(GIBLE), { subjectKey: TASK, oneOf: true })).toBe(true);
    expect(holdsSubject(TASK, { subjectKey: TASK, oneOf: true })).toBe(true);
    expect(holdsSubject(v(GIBLE, OTHER), { subjectKey: TASK, oneOf: true })).toBe(false);
  });
});
