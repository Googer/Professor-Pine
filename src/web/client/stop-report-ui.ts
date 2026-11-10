import { getJson, say } from './common.js';
import type { Me } from './notice.js';
import { renderNode } from './popup.js';
import { formPlace, type FormHold } from './raid-forms.js';
import { timeLeft } from './raid-marker.js';
import { sendStop, takeBackBody, takeBackPath } from './stop-forms.js';
import { ENDED, takeBackQuestion } from './stop-popup.js';
import type { StopReport } from './stop-reports.js';

/*
 * The reports at stops' controls in the page (plan 8M-9B): Take back in a stop's popup or card, a
 * question first in the place of the report's actions ("Take back <task> at <stop>?"), held as the
 * other forms are (`FormHold`: the popup's content kept while it is asked); then
 * `POST …/stop-reports/<id>/remove` with `{ madeAt }`, whatever it answers said as a notice (the
 * server's words: taken back, not yours, nothing left, changed meanwhile, too many), and the reports
 * asked for at once. Between two lists the popup keeps a grunt's minutes current and says "Ended"
 * for a report whose end passed, its Take back gone (B14: `tick`).
 */
export interface StopUiDeps {
  guild: string;
  /** The page's CSRF token, which a stale one's renewal changes. */
  csrf: { get(): string; set(token: string): void };
  hold: Pick<FormHold<unknown>, 'take' | 'release' | 'holds' | 'fit'>;
  /** The reports asked for at once (after a take-back or a report). */
  refresh(): Promise<void>;
}

export function stopUi(deps: StopUiDeps) {
  const { guild, hold } = deps;

  /** A report's Take back pressed: the question in the place of its actions, then the request. */
  const takeBackClicked = (button: HTMLButtonElement, report: StopReport): void => {
    const actions = button.closest<HTMLElement>('.report-actions');
    if (!actions) return;
    const claim = hold.take(formPlace(actions));
    if (!claim) return;
    const before = [...actions.childNodes];
    const question = renderNode(
      {
        tag: 'div',
        className: 'take-back-question',
        attributes: { role: 'group', 'aria-label': 'Take back' },
        children: [
          { tag: 'p', className: 'form-text', text: takeBackQuestion(report) },
          {
            tag: 'div',
            className: 'form-buttons',
            children: [
              {
                tag: 'button',
                className: 'press danger',
                text: 'Take back',
                attributes: { type: 'button', 'data-confirm-take-back': '' },
              },
              {
                tag: 'button',
                className: 'press',
                text: 'Cancel',
                attributes: { type: 'button', 'data-cancel': '' },
              },
            ],
          },
        ],
      },
      document,
    );
    const close = (): void => {
      actions.replaceChildren(...before);
      hold.release(claim);
    };
    question.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) {
        close();
        button.focus();
        return;
      }
      if (target.dataset.confirmTakeBack === undefined) return;
      for (const each of question.querySelectorAll('button')) each.disabled = true;
      void sendStop(deps.csrf.get(), {
        post: async (token) => {
          const reply = await fetch(takeBackPath(guild, report), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
            // The version the pressed Take back showed (review F4).
            body: JSON.stringify(takeBackBody(button.dataset)),
          });
          return {
            status: reply.status,
            body: (await reply.json().catch(() => undefined)) as unknown,
          };
        },
        me: () => getJson<Me>(`/s/${guild}/api/me`),
      }).then(async (sent) => {
        deps.csrf.set(sent.csrf);
        // Whatever it answered: its words, and the reports as they are now.
        if (hold.holds(claim)) close();
        say(sent.text);
        await deps.refresh();
      });
    });
    actions.replaceChildren(question);
    hold.fit();
    question.querySelector<HTMLElement>('button[data-confirm-take-back]')?.focus();
  };

  return {
    takeBackClicked,

    /**
     * Between two lists (B14): a grunt's minutes left kept current, and a report whose end passed
     * says "Ended" and loses its Take back and its other actions, its popup staying.
     */
    tick(root: ParentNode, now: number): void {
      for (const left of root.querySelectorAll<HTMLElement>('[data-left]')) {
        left.textContent = timeLeft(Number(left.dataset.left), now) ?? ENDED;
      }
      for (const section of root.querySelectorAll<HTMLElement>('.stop-report[data-ends]')) {
        if (Number(section.dataset.ends) > now || section.classList.contains('ended')) continue;
        section.classList.add('ended');
        for (const action of section.querySelectorAll(
          'button[data-take-back], button[data-same-task]',
        )) {
          action.remove();
        }
        // The separators left without a part on both sides go with them.
        for (const actions of section.querySelectorAll('.report-actions')) {
          const parts = [...actions.children];
          parts.forEach((part, index) => {
            const next = parts[index + 1];
            const sep = part.classList.contains('sep');
            if (sep && (index === 0 || next === undefined || next.classList.contains('sep'))) {
              part.remove();
            }
          });
        }
        const when = section.querySelector('.small > span');
        if (when) when.textContent = ENDED;
      }
    },
  };
}

export type StopUi = ReturnType<typeof stopUi>;
