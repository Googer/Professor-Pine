import type { TallyPeriod } from '../../domain/history/tally-periods.js';
import type { BoardsView } from '../../domain/web/board-data.js';
import { boardLines, boardsAddress } from './history-boards.js';
import { PERIOD_CHOICES, tallyFailure, tallyLoginHref } from './history-tally.js';
import { byId, getJson } from './page-frame.js';
import { RequestError } from './request-error.js';

/*
 * The boards' section of the history page (plan 8H-6): the periods as buttons (this month first,
 * not kept in the address, which the tally's period holds), every board of the period as a card
 * of its title, its numbered lines and its small print, and under a board of people where the
 * member stands. Only the latest question is drawn; everything is set as text. Its pure part is
 * `history-boards.ts`; this is tried at staging.
 */

export function showBoards(guild: string, login: 'discord' | 'links'): void {
  const status = byId('boards-status');
  const list = byId('boards-list');
  const periods = byId('boards-periods');
  let period: TallyPeriod = 'month';
  let asked = 0;

  const buttons = PERIOD_CHOICES.map((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = choice.label;
    button.addEventListener('click', () => {
      if (choice.period === period) return;
      period = choice.period;
      void show();
    });
    periods.append(button);
    return { period: choice.period, button };
  });

  const text = (tag: string, className: string, words: string): HTMLElement => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = words;
    return element;
  };

  async function show(): Promise<void> {
    const mine = ++asked;
    for (const { period: one, button } of buttons) {
      button.setAttribute('aria-pressed', String(one === period));
    }
    status.textContent = 'Loading…';
    let view: BoardsView;
    try {
      view = await getJson<BoardsView>(boardsAddress(guild, period));
    } catch (err) {
      if (mine !== asked) return;
      const failure = tallyFailure(err instanceof RequestError ? err.status : undefined, login);
      list.replaceChildren();
      if (failure.login) {
        const link = document.createElement('a');
        link.href = tallyLoginHref(location.pathname);
        link.textContent = failure.text;
        status.replaceChildren(link);
      } else {
        status.textContent = failure.text;
      }
      return;
    }
    if (mine !== asked) return;
    list.replaceChildren(
      ...view.boards.map((board) => {
        const card = document.createElement('article');
        card.className = 'board';
        card.append(text('h3', 'board-title', board.title));
        const lines = document.createElement(board.rows.length > 0 ? 'ol' : 'p');
        lines.className = 'board-lines';
        if (board.rows.length > 0) {
          for (const row of board.rows) {
            // Numbered by the server's rank, as /stats boards numbers it.
            const item = document.createElement('li');
            item.textContent = `${row.name}: ${row.count}`;
            item.value = row.rank;
            lines.append(item);
          }
        } else {
          lines.textContent = boardLines(board).join(' ');
        }
        card.append(lines);
        if (board.note !== null) card.append(text('p', 'board-note', board.note));
        if (board.viewer !== null) card.append(text('p', 'board-viewer', board.viewer));
        return card;
      }),
    );
    status.textContent = '';
  }

  void show();
}
