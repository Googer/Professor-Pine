import { expect, it } from 'vitest';
import type { WantBoxStorage } from '../../src/db/repositories/want-box-repository.js';
import type { TargetWantStorage } from '../../src/db/repositories/target-want-repository.js';
import type { WantStorage } from '../../src/db/repositories/pokemon-notification-repository.js';
import { boxTarget } from '../../src/domain/notify/target-wants.js';
import { pokemonTarget } from '../../src/domain/pogo/notification-target.js';
import {
  boxesOf,
  type AnswerScope,
  type BoxAnswer,
  type HeldRow,
} from '../../src/domain/pogo/species-answer.js';
import type { WantBox } from '../../src/domain/pogo/want-boxes.js';
import { ASH, GARY, WANT_SERVER, WANTED_AT } from './target-want-cases.js';

const DRATINI: AnswerScope = { subject: { kind: 'pokemon', dex: 147 }, wide: true };
const CORSOLA: AnswerScope = { subject: { kind: 'pokemon', dex: 222 }, wide: true };
const CHARIZARD: AnswerScope = { subject: { kind: 'pokemon', dex: 6 }, wide: true };
const PIKACHU: AnswerScope = { subject: { kind: 'pokemon', dex: 25 }, wide: true };
const UNOWN: AnswerScope = { subject: { kind: 'pokemon', dex: 201 }, wide: false };
const UNOWN_A: AnswerScope = {
  subject: { kind: 'pokemon', dex: 201, form: 'unown_a' },
  wide: false,
};
const T5: AnswerScope = { subject: { kind: 'tier', level: 'T5' }, wide: false };
const EVERY = ['raids', 'dynamax', 'gigantamax', 'spawns', 'research', 'shadow'] as const;

/** An answer of the dialog: the rows that stand (the species row unless said), the boxes ticked. */
export function boxAnswer(
  scope: AnswerScope,
  ticked: readonly WantBox[],
  more: Partial<BoxAnswer> = {},
): BoxAnswer {
  return {
    scope,
    forms: [undefined],
    ticked: new Set(ticked),
    shown: scope.subject.kind === 'tier' ? ['raids', 'shadow-raids'] : EVERY,
    costumed: false,
    remove: false,
    ...more,
  };
}

/** Rows as a test writes them: a form (or none) with its boxes. */
const rows = (...made: [string | undefined, WantBox[], boolean?][]): HeldRow[] =>
  made.map(([form, boxes, costumed = false]) => ({
    ...(form === undefined ? {} : { form }),
    boxes: new Set(boxes),
    costumed,
  }));

/** A store of boxes over these tables, fresh and empty, as the cases need it. */
export interface BoxTables {
  boxes: WantBoxStorage;
  wants: WantStorage;
  targets: TargetWantStorage;
}

/**
 * What the boxes of `/want`'s dialog do to the rows of both tables (plan 8R-1; one answer per
 * species since plan 8R-4), run against the repository and its twin in memory alike.
 */
export function wantBoxCases(made: () => Promise<BoxTables>): void {
  it('writes the ticked boxes into both tables and reads them back', async () => {
    const { boxes, wants, targets } = await made();
    const change = await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(DRATINI, ['raids', 'research', 'shadow']),
      WANTED_AT,
    );
    expect(change).toEqual({
      before: [],
      after: rows([undefined, ['raids', 'research', 'shadow']]),
    });
    expect(await boxes.held(ASH, WANT_SERVER, DRATINI)).toEqual(
      rows([undefined, ['raids', 'research', 'shadow']]),
    );
    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
      { target: pokemonTarget(147), scope: 'raid' },
      { target: pokemonTarget(147, undefined, true), scope: 'raid' },
    ]);
    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
      boxTarget('research-pokemon', 147),
    ]);
    expect(await boxes.held(GARY, WANT_SERVER, DRATINI)).toEqual([]);
  });

  it('changes what a later Submit changes, and takes everything away with nothing ticked', async () => {
    const { boxes, wants, targets } = await made();
    await boxes.set(ASH, WANT_SERVER, boxAnswer(DRATINI, ['raids', 'dynamax']), WANTED_AT);
    await boxes.set(ASH, WANT_SERVER, boxAnswer(DRATINI, ['spawns', 'raids']), WANTED_AT);
    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
      { target: pokemonTarget(147), scope: 'both' },
    ]);
    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([]);
    const gone = await boxes.set(ASH, WANT_SERVER, boxAnswer(DRATINI, []), WANTED_AT);
    expect(boxesOf(gone.before)).toEqual(new Set(['raids', 'spawns']));
    expect(gone.after).toEqual([]);
    expect(await wants.count(ASH, WANT_SERVER)).toBe(0);
  });

  it('leaves the boxes it did not show as the row had them', async () => {
    const { boxes, wants } = await made();
    await wants.set(ASH, WANT_SERVER, pokemonTarget(147), 'spawn');
    await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(DRATINI, ['raids'], { shown: ['raids', 'shadow'] }),
      WANTED_AT,
    );
    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
      { target: pokemonTarget(147), scope: 'both' },
    ]);
  });

  it('answers once for the whole species: the forms ticked get the boxes, the others go', async () => {
    const { boxes, wants, targets } = await made();
    await wants.set(ASH, WANT_SERVER, pokemonTarget(222), 'raid');
    await wants.set(ASH, WANT_SERVER, pokemonTarget(222, 'corsola_galarian'), 'spawn');
    expect(await boxes.held(ASH, WANT_SERVER, CORSOLA)).toEqual(
      rows([undefined, ['raids']], ['corsola_galarian', ['spawns']]),
    );
    await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(CORSOLA, ['raids', 'research'], { forms: ['corsola_galarian'] }),
      WANTED_AT,
    );
    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
      { target: pokemonTarget(222, 'corsola_galarian'), scope: 'raid' },
    ]);
    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
      boxTarget('research-pokemon', 222, 'corsola_galarian'),
    ]);
    // Every form again: one species row, and the form's rows go.
    await boxes.set(ASH, WANT_SERVER, boxAnswer(CORSOLA, ['spawns']), WANTED_AT);
    expect(await boxes.held(ASH, WANT_SERVER, CORSOLA)).toEqual(rows([undefined, ['spawns']]));
    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([]);
  });

  it('gives a mega a raid row and nothing else, and nothing without Raids', async () => {
    const { boxes, wants, targets } = await made();
    await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(CHARIZARD, ['raids', 'research', 'shadow'], {
        forms: ['charizard', 'charizard_mega_y'],
      }),
      WANTED_AT,
    );
    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
      { target: pokemonTarget(6, 'charizard'), scope: 'raid' },
      { target: pokemonTarget(6, 'charizard', true), scope: 'raid' },
      { target: pokemonTarget(6, 'charizard_mega_y'), scope: 'raid' },
    ]);
    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
      boxTarget('research-pokemon', 6, 'charizard'),
    ]);
    const without = await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(CHARIZARD, ['spawns'], { forms: ['charizard_mega_y'] }),
      WANTED_AT,
    );
    expect(without.after).toEqual([]);
    expect(await wants.count(ASH, WANT_SERVER)).toBe(0);
  });

  it('keeps Unown’s letters apart from its species row, each an answer of its own', async () => {
    const { boxes, wants } = await made();
    await wants.set(ASH, WANT_SERVER, pokemonTarget(201, 'unown_a'), 'spawn');
    await boxes.set(ASH, WANT_SERVER, boxAnswer(UNOWN, ['raids']), WANTED_AT);
    expect(await boxes.held(ASH, WANT_SERVER, UNOWN)).toEqual(rows([undefined, ['raids']]));
    expect(await boxes.held(ASH, WANT_SERVER, UNOWN_A)).toEqual(rows([undefined, ['spawns']]));
    await boxes.set(ASH, WANT_SERVER, boxAnswer(UNOWN_A, [], { remove: true }), WANTED_AT);
    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
      { target: pokemonTarget(201), scope: 'raid' },
    ]);
  });

  it('writes costumed to every row in both tables, and plain again on a later Submit', async () => {
    const { boxes, wants, targets } = await made();
    await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(DRATINI, ['raids', 'research'], { costumed: true }),
      WANTED_AT,
    );
    expect(await boxes.held(ASH, WANT_SERVER, DRATINI)).toEqual(
      rows([undefined, ['raids', 'research'], true]),
    );
    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
      { target: pokemonTarget(147), scope: 'raid', costumed: true },
    ]);
    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
      boxTarget('research-pokemon', 147, undefined, true),
    ]);
    await boxes.set(ASH, WANT_SERVER, boxAnswer(DRATINI, ['raids', 'research']), WANTED_AT);
    expect(await boxes.held(ASH, WANT_SERVER, DRATINI)).toEqual(
      rows([undefined, ['raids', 'research']]),
    );
  });

  it('removes every row of the species with Remove, whatever is ticked, and no other species’', async () => {
    const { boxes, targets } = await made();
    // Celebi (251) beside Pikachu (25): the species' read takes `research:pokemon:25` and
    // `research:pokemon:25:<form>`, never Celebi's tokens that begin with 25.
    await targets.change(
      ASH,
      WANT_SERVER,
      {
        add: [
          boxTarget('research-pokemon', 251),
          boxTarget('dynamax', 251),
          boxTarget('research-pokemon', 25),
          boxTarget('gigantamax', 25, 'pikachu'),
        ],
        remove: [],
      },
      WANTED_AT,
    );
    expect(await boxes.held(ASH, WANT_SERVER, PIKACHU)).toEqual(
      rows([undefined, ['research']], ['pikachu', ['gigantamax']]),
    );
    await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(PIKACHU, ['raids', 'spawns'], { remove: true }),
      WANTED_AT,
    );
    expect((await targets.list(ASH, WANT_SERVER)).wants).toEqual([
      boxTarget('research-pokemon', 251),
      boxTarget('dynamax', 251),
    ]);
  });

  it('keeps the boxes it did not show per row across two forms; a new form takes the rows’ together', async () => {
    const { boxes, wants, targets } = await made();
    await wants.set(ASH, WANT_SERVER, pokemonTarget(222), 'spawn');
    await targets.change(
      ASH,
      WANT_SERVER,
      { add: [boxTarget('research-pokemon', 222, 'corsola_galarian')], remove: [] },
      WANTED_AT,
    );
    await wants.set(ASH, WANT_SERVER, pokemonTarget(222, 'corsola_galarian'), 'raid');
    // Shows Raids and Shadow only: Spawns and Research stay as each row had them.
    await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(CORSOLA, ['shadow'], {
        forms: [undefined, 'corsola_galarian'],
        shown: ['raids', 'shadow'],
      }),
      WANTED_AT,
    );
    expect(await boxes.held(ASH, WANT_SERVER, CORSOLA)).toEqual(
      rows([undefined, ['spawns', 'shadow']], ['corsola_galarian', ['research', 'shadow']]),
    );
    // A form without a row takes the hidden boxes of the rows together.
    await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(CORSOLA, ['raids'], { forms: ['corsola'], shown: ['raids', 'shadow'] }),
      WANTED_AT,
    );
    expect(await boxes.held(ASH, WANT_SERVER, CORSOLA)).toEqual(
      rows(['corsola', ['raids', 'spawns', 'research']]),
    );
  });

  it('takes every row off when no box shown is ticked, a box it did not show included (A2)', async () => {
    const { boxes, wants, targets } = await made();
    await wants.set(ASH, WANT_SERVER, pokemonTarget(147), 'raid');
    await targets.change(
      ASH,
      WANT_SERVER,
      { add: [boxTarget('research-pokemon', 147)], remove: [] },
      WANTED_AT,
    );
    const gone = await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(DRATINI, [], { shown: ['raids', 'shadow'] }),
      WANTED_AT,
    );
    expect(gone.after).toEqual([]);
    expect(await wants.count(ASH, WANT_SERVER)).toBe(0);
    expect(await targets.count(ASH, WANT_SERVER)).toBe(0);
  });

  it('writes a mega plain beside a costumed form (A-D3)', async () => {
    const { boxes, wants } = await made();
    await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(CHARIZARD, ['raids'], {
        forms: ['charizard', 'charizard_mega_x'],
        costumed: true,
      }),
      WANTED_AT,
    );
    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
      { target: pokemonTarget(6, 'charizard'), scope: 'raid', costumed: true },
      { target: pokemonTarget(6, 'charizard_mega_x'), scope: 'raid' },
    ]);
  });

  it('keeps each row’s costume where the dialog did not show Costumes (A1)', async () => {
    const { boxes } = await made();
    await boxes.set(ASH, WANT_SERVER, boxAnswer(PIKACHU, ['raids'], { costumed: true }), WANTED_AT);
    await boxes.set(
      ASH,
      WANT_SERVER,
      boxAnswer(PIKACHU, ['raids', 'spawns'], { costumed: undefined }),
      WANTED_AT,
    );
    expect(await boxes.held(ASH, WANT_SERVER, PIKACHU)).toEqual(
      rows([undefined, ['raids', 'spawns'], true]),
    );
  });

  it('writes a tier’s raids and its shadow raids', async () => {
    const { boxes, wants } = await made();
    await boxes.set(ASH, WANT_SERVER, boxAnswer(T5, ['shadow-raids']), WANTED_AT);
    expect((await wants.list(ASH, WANT_SERVER)).wants).toEqual([
      { target: { kind: 'tier', tier: { level: 'T5', shadow: true } }, scope: 'raid' },
    ]);
    expect(await boxes.held(ASH, WANT_SERVER, T5)).toEqual(rows([undefined, ['shadow-raids']]));
  });
}
