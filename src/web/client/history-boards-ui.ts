import type { TallyPeriod } from '../../domain/history/tally-periods.js';
import type { BoardsView } from '../../domain/web/board-data.js';
import { boardLinesNode, boardsAddress } from './history-boards.js';
import { showFailure } from './history-failure-ui.js';
import { PERIOD_CHOICES } from './history-tally.js';
import { byId, getJson } from './page-frame.js';
import { renderNode } from './popup.js';

/*
 * The boards' section of the history page (plan 8H-6): the periods as buttons (this month first,
 * not kept in the address, which the tally's period holds), every board of the period as a card
 * of its title, its numbered lines and its small print, and under a board of people where the
 * member stands. Only the latest question is drawn; logged out or no member the section hides, raids
 * by day saying so (B9); everything is set as text. Its pure part is
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
      list.replaceChildren();
      showFailure(status, err, login, byId('boards'));
      return;
    }
    if (mine !== asked) return;
    list.replaceChildren(
      ...view.boards.map((board) => {
        const card = document.createElement('article');
        card.className = 'board';
        card.append(text('h3', 'board-title', board.title));
        // Each name in an element of its own (`boardLinesNode`), set as text.
        card.append(renderNode(boardLinesNode(board), document));
        if (board.note !== null) card.append(text('p', 'board-note', board.note));
        if (board.viewer !== null) card.append(text('p', 'board-viewer', board.viewer));
        return card;
      }),
    );
    status.textContent = '';
  }

  void show();
}
