import { describe, expect, it } from 'vitest';
import { boxTarget, type TargetWant } from '../notify/target-wants.js';
import { pokemonTarget, type Want } from './notification-target.js';
import {
  answerScopeOf,
  boxesOf,
  heldRows,
  planAnswer,
  type AnswerScope,
  type BoxAnswer,
  type HeldRow,
} from './species-answer.js';
import { whichHash } from '../short-hash.js';
import type { WantBox } from './want-boxes.js';

const CORSOLA: AnswerScope = { subject: { kind: 'pokemon', dex: 222 }, wide: true };
const EVERY = ['raids', 'dynamax', 'gigantamax', 'spawns', 'research', 'shadow'] as const;
const want = (form: string | undefined, scope: Want['scope'], costumed = false): Want => ({
  target: pokemonTarget(222, form),
  scope,
  ...(costumed ? { costumed: true as const } : {}),
});
const row = (form: string | undefined, boxes: WantBox[], costumed = false): HeldRow => ({
  ...(form === undefined ? {} : { form }),
  boxes: new Set(boxes),
  costumed,
});
const answer = (forms: (string | undefined)[], ticked: WantBox[], more: Partial<BoxAnswer> = {}) =>
  ({
    scope: CORSOLA,
    forms,
    ticked: new Set(ticked),
    shown: EVERY,
    costumed: false,
    remove: false,
    ...more,
  }) satisfies BoxAnswer;
const NO_MEGA = (): boolean => false;

describe('heldRows', () => {
  it('reads every row of a species, by form, with its boxes and whether it is costumed', () => {
    const wants = [
      want(undefined, 'raid'),
      want('corsola_galarian', 'spawn', true),
      { target: pokemonTarget(222, 'corsola_galarian', true), scope: 'raid', costumed: true },
      { target: pokemonTarget(25), scope: 'both' },
    ] satisfies Want[];
    const targets: TargetWant[] = [
      boxTarget('research-pokemon', 222, 'corsola_galarian', true),
      boxTarget('research-pokemon', 25),
    ];
    expect(heldRows(CORSOLA, wants, targets)).toEqual([
      row(undefined, ['raids']),
      row('corsola_galarian', ['spawns', 'research', 'shadow'], true),
    ]);
  });

  it('reads one subject alone where the scope is not wide (an Unown letter, a tier)', () => {
    const unown = { subject: { kind: 'pokemon', dex: 201 }, wide: false } as const;
    const wants: Want[] = [
      { target: pokemonTarget(201), scope: 'spawn' },
      { target: pokemonTarget(201, 'unown_a'), scope: 'spawn' },
    ];
    expect(heldRows(unown, wants, [])).toEqual([row(undefined, ['spawns'])]);
    const letter = {
      subject: { kind: 'pokemon', dex: 201, form: 'unown_a' },
      wide: false,
    } as const;
    expect(heldRows(letter, wants, [])).toEqual([row(undefined, ['spawns'])]);
    const t5 = { subject: { kind: 'tier', level: 'T5' }, wide: false } as const;
    expect(
      heldRows(
        t5,
        [{ target: { kind: 'tier', tier: { level: 'T5', shadow: true } }, scope: 'raid' }],
        [],
      ),
    ).toEqual([row(undefined, ['shadow-raids'])]);
    expect(heldRows(t5, [], [])).toEqual([]);
  });
});

describe('planAnswer: one answer per species', () => {
  const held = [row(undefined, ['raids']), row('corsola_galarian', ['spawns', 'research'])];

  it('writes the boxes and costume to every ticked form and takes the others away', () => {
    const plan = planAnswer(
      CORSOLA,
      held,
      answer(['corsola_galarian'], ['raids', 'spawns'], { costumed: true }),
      NO_MEGA,
    );
    expect(plan.after).toEqual([row('corsola_galarian', ['raids', 'spawns'], true)]);
    expect(plan.rows.map((one) => [one.subject, one.base, one.shadow, one.costumed])).toEqual([
      [{ kind: 'pokemon', dex: 222 }, null, false, false],
      [{ kind: 'pokemon', dex: 222, form: 'corsola_galarian' }, 'both', false, true],
    ]);
    expect(plan.rows[1]?.targets).toEqual({
      add: [],
      remove: [boxTarget('research-pokemon', 222, 'corsola_galarian')],
    });
  });

  it('keeps the boxes a dialog did not show as each row had them; a new row takes the species’', () => {
    const shown = ['raids', 'research'] as const;
    const plan = planAnswer(
      CORSOLA,
      held,
      answer(['corsola_galarian', 'corsola'], ['raids'], { shown }),
      NO_MEGA,
    );
    expect(plan.after).toEqual([
      row('corsola_galarian', ['raids', 'spawns']),
      row('corsola', ['raids', 'spawns']),
    ]);
  });

  it('gives a mega a raid row and nothing else, and nothing without Raids', () => {
    const megaX = (form: string): boolean => form === 'charizard_mega_x';
    const charizard = { subject: { kind: 'pokemon', dex: 6 }, wide: true } as const;
    const plan = planAnswer(
      charizard,
      [],
      {
        ...answer(['charizard', 'charizard_mega_x'], ['raids', 'shadow', 'research']),
        scope: charizard,
      },
      megaX,
    );
    expect(plan.after).toEqual([
      row('charizard', ['raids', 'research', 'shadow']),
      row('charizard_mega_x', ['raids']),
    ]);
    const without = planAnswer(
      charizard,
      [],
      { ...answer(['charizard_mega_x'], ['spawns']), scope: charizard },
      megaX,
    );
    expect(without.after).toEqual([]);
  });

  it('takes the species off with nothing ticked, no form ticked, or Remove, whatever else is', () => {
    for (const taken of [
      answer([undefined], []),
      answer([], ['raids']),
      answer([undefined], ['raids', 'spawns'], { remove: true }),
    ]) {
      const plan = planAnswer(CORSOLA, held, taken, NO_MEGA);
      expect(plan.after).toEqual([]);
      expect(plan.rows.map((one) => one.base)).toEqual([null, null]);
    }
  });

  it('takes every row off when no box shown is ticked, the boxes it did not show included (A2)', () => {
    const plan = planAnswer(
      CORSOLA,
      [row(undefined, ['raids', 'research'])],
      answer([undefined], [], { shown: ['raids', 'spawns'] }),
      NO_MEGA,
    );
    expect(plan.after).toEqual([]);
    expect(plan.rows).toEqual([
      expect.objectContaining({
        base: null,
        shadow: false,
        targets: { add: [], remove: [boxTarget('research-pokemon', 222)] },
      }),
    ]);
  });

  it('keeps each row’s own costume where the dialog did not show Costumes (A1)', () => {
    const plan = planAnswer(
      CORSOLA,
      [row(undefined, ['raids'], true), row('corsola_galarian', ['spawns'])],
      answer([undefined, 'corsola_galarian'], ['raids'], { costumed: undefined }),
      NO_MEGA,
    );
    expect(plan.after).toEqual([
      row(undefined, ['raids'], true),
      row('corsola_galarian', ['raids']),
    ]);
    // A form without a row of its own: costumed only where every row held is.
    const added = planAnswer(
      CORSOLA,
      [row(undefined, ['raids'], true)],
      answer(['corsola_galarian'], ['raids'], { costumed: undefined }),
      NO_MEGA,
    );
    expect(added.after).toEqual([row('corsola_galarian', ['raids'], true)]);
  });

  it('writes a mega plain, whatever the costume ticked (A-D3)', () => {
    const megaX = (form: string): boolean => form === 'charizard_mega_x';
    const charizard = { subject: { kind: 'pokemon', dex: 6 }, wide: true } as const;
    const plan = planAnswer(
      charizard,
      [],
      {
        ...answer(['charizard', 'charizard_mega_x'], ['raids'], { costumed: true }),
        scope: charizard,
      },
      megaX,
    );
    expect(plan.after).toEqual([
      row('charizard', ['raids'], true),
      row('charizard_mega_x', ['raids']),
    ]);
  });

  it('writes the costume to the targets of every box that stands, as an upsert', () => {
    const plan = planAnswer(
      CORSOLA,
      [row(undefined, ['research'])],
      answer([undefined], ['research'], { costumed: true }),
      NO_MEGA,
    );
    expect(plan.rows[0]?.targets.add).toEqual([
      boxTarget('research-pokemon', 222, undefined, true),
    ]);
  });
});

describe('boxesOf, answerScopeOf, whichHash', () => {
  it('unites the boxes of rows', () => {
    expect(boxesOf([row(undefined, ['raids']), row('x', ['spawns', 'raids'])])).toEqual(
      new Set(['raids', 'spawns']),
    );
  });

  it('makes every species wide but one with more forms than the Which field holds', () => {
    expect(answerScopeOf({ kind: 'pokemon', dex: 222 }, 2)).toEqual({
      subject: { kind: 'pokemon', dex: 222 },
      wide: true,
    });
    expect(answerScopeOf({ kind: 'pokemon', dex: 201 }, 29).wide).toBe(false);
    expect(answerScopeOf({ kind: 'pokemon', dex: 201, form: 'unown_a' }, 29).wide).toBe(false);
    expect(answerScopeOf({ kind: 'tier', level: 'T5' }, 0).wide).toBe(false);
  });

  it('hashes the keys of a Which field, short, and differently for other keys or order', () => {
    const hash = whichHash(['corsola', 'corsola_galarian']);
    expect(hash).toMatch(/^[0-9a-z]{1,7}$/);
    expect(whichHash(['corsola', 'corsola_galarian'])).toBe(hash);
    expect(whichHash(['corsola_galarian', 'corsola'])).not.toBe(hash);
    expect(whichHash(['corsola'])).not.toBe(hash);
  });
});
