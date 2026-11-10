import type { PageNode } from './popup.js';

/**
 * Answers where the member is looking (plan 8M-11A, S9, S20): a press's answer goes into a line
 * of the post's own controls (`.press-answer`, `role="status"`), under the buttons pressed, in the
 * popup and in the phone card (also its summary), kept by party for `ANSWER_MS` across the redraws
 * that follow (as the page keeps open panels); a refusal shakes the popup or the card once
 * (`map.css`, never where the device asks for reduced motion). The notice band then carries only
 * what has no party.
 */

/** How long an answer stays in its post's line, across redraws. */
export const ANSWER_MS = 10_000;

/** What a press answered: its words and whether it was done. */
export interface PressAnswer {
  text: string;
  ok: boolean;
}

/** The answers of the member's presses, by party, each for `ANSWER_MS` from when it came. */
export class PressAnswers {
  private readonly kept = new Map<string, PressAnswer & { at: number }>();

  constructor(private readonly now: () => number) {}

  /** The answer of a press on this party, in the place of the one before. */
  set(partyId: string, answer: PressAnswer): void {
    this.kept.set(partyId, { ...answer, at: this.now() });
  }

  /** The answer the party's post shows now; none once `ANSWER_MS` passed. */
  of(partyId: string): PressAnswer | undefined {
    const kept = this.kept.get(partyId);
    if (kept === undefined) return undefined;
    if (this.now() - kept.at >= ANSWER_MS) {
      this.kept.delete(partyId);
      return undefined;
    }
    return { text: kept.text, ok: kept.ok };
  }
}

/** The answer line of a post: empty (hidden by `map.css`) until a press answered. */
export function answerLine(answer: PressAnswer | undefined): PageNode {
  return {
    tag: 'div',
    className: answer?.ok === false ? 'press-answer refused' : 'press-answer',
    text: answer?.text ?? '',
    attributes: { role: 'status' },
  };
}

/**
 * Writes an answer (or none: empty) into every answer line of a party's post in `scope` (a popup,
 * the phone card, a line of the list): whether it found one.
 */
export function writeAnswer(
  scope: ParentNode,
  partyId: string,
  answer: PressAnswer | undefined,
): boolean {
  const lines = scope.querySelectorAll<HTMLElement>(
    `.post[data-post="${CSS.escape(partyId)}"] .press-answer`,
  );
  for (const line of lines) {
    line.textContent = answer?.text ?? '';
    line.classList.toggle('refused', answer?.ok === false);
  }
  return lines.length > 0;
}

/** What `refusalMoves` asks of the phone card (`PhoneCard`). */
export interface NudgingCard {
  shows(partyId: string): boolean;
  holds(element: Element): boolean;
  nudge(): void;
}

/**
 * What a refusal moves (plan 8M-13, A2): the phone card bounces where it shows the party's post
 * (its content drawn anew since the press, so `from` is out of it) or holds `from` (a form in
 * it); else the popup of `from` shakes, as Leaflet keeps its element.
 */
export function refusalMoves(from: Element, partyId: string | undefined, card: NudgingCard): void {
  if (card.holds(from) || (partyId !== undefined && card.shows(partyId))) card.nudge();
  else shake(from);
}

/**
 * Shakes the popup or card of `from` once (a refusal): the class taken off and put back, so that a
 * second refusal shakes again; `map.css` runs it only where the device allows motion.
 */
export function shake(from: Element): void {
  const box = from.closest<HTMLElement>('.leaflet-popup, .party-card');
  if (!box) return;
  box.classList.remove('shake');
  // Read a size so that the browser sees the class gone before it comes back.
  void box.offsetWidth;
  box.classList.add('shake');
  box.addEventListener(
    'animationend',
    () => {
      box.classList.remove('shake');
    },
    { once: true },
  );
}
