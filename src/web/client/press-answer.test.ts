import { describe, expect, it } from 'vitest';
import { ANSWER_MS, answerLine, PressAnswers, refusalMoves } from './press-answer.js';

describe('the answers of presses, by party (plan 8M-11A, S9)', () => {
  it('keeps an answer for ten seconds, the newest in the place of the one before', () => {
    const clock = { now: 1_000 };
    const answers = new PressAnswers(() => clock.now);
    answers.set('r1', { text: 'You are coming.', ok: true });
    expect(answers.of('r1')).toEqual({ text: 'You are coming.', ok: true });
    expect(answers.of('r2')).toBeUndefined();
    clock.now += 4_000;
    answers.set('r1', { text: 'This raid has not hatched yet.', ok: false });
    clock.now += ANSWER_MS - 1;
    expect(answers.of('r1')).toEqual({ text: 'This raid has not hatched yet.', ok: false });
    clock.now += 1;
    expect(answers.of('r1')).toBeUndefined();
  });

  it('draws the line as a status, a refusal marked', () => {
    expect(answerLine(undefined)).toEqual({
      tag: 'div',
      className: 'press-answer',
      text: '',
      attributes: { role: 'status' },
    });
    expect(answerLine({ text: 'No.', ok: false }).className).toBe('press-answer refused');
  });
});

// Plan 8M-13 (A2): the card is drawn anew under a press; the popup is not.
describe('what a refusal moves (refusalMoves)', () => {
  /** A popup's box with its classes, and a control in it. */
  const popupControl = () => {
    const classes = new Set<string>();
    const box = {
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
      },
      offsetWidth: 0,
      addEventListener: () => undefined,
    };
    const control = {
      closest: (selector: string) => (selector.includes('.leaflet-popup') ? box : null),
    };
    return { control: control as unknown as Element, classes };
  };
  /** The phone card: whether it shows the party or holds the control, and its nudges. */
  const cardThat = (shows: string | undefined, holds: boolean) => {
    const nudges: number[] = [];
    return {
      nudges,
      card: {
        shows: (partyId: string) => partyId === shows,
        holds: () => holds,
        nudge: () => {
          nudges.push(1);
        },
      },
    };
  };

  it('nudges the card that shows the party, though the control pressed is gone from it', () => {
    const { control, classes } = popupControl();
    const { card, nudges } = cardThat('r1', false);
    refusalMoves(control, 'r1', card);
    expect(nudges).toEqual([1]);
    expect(classes.has('shake')).toBe(false);
  });

  it('nudges the card that holds the form refused', () => {
    const { control } = popupControl();
    const { card, nudges } = cardThat(undefined, true);
    refusalMoves(control, undefined, card);
    expect(nudges).toEqual([1]);
  });

  it('shakes the popup otherwise', () => {
    const { control, classes } = popupControl();
    const { card, nudges } = cardThat('r2', false);
    refusalMoves(control, 'r1', card);
    expect(nudges).toEqual([]);
    expect(classes.has('shake')).toBe(true);
  });
});
