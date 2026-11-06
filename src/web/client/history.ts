import type { TallyPeriod } from '../../domain/history/tally-periods.js';
import type { RegionTallyView } from '../../domain/web/region-tally-data.js';
import { showBoards } from './history-boards-ui.js';
import { showDays } from './history-days-ui.js';
import {
  tallyAddress,
  tallyFailure,
  tallyLoginHref,
  tallyTable,
  PERIOD_CHOICES,
  periodOfAddress,
  quietLine,
} from './history-tally.js';
import { showMe } from './me-ui.js';
import { byId, getJson, showAccount } from './page-frame.js';
import { RequestError } from './request-error.js';

/*
 * The history page (plan 8H-5) and "Your history" (plan 8H-6, `data-page="me"`), one bundle: the
 * header (the login, or the member's menu with the theme); on the history page the region tally
 * of `/api/stats/regions` with its periods, the one shown kept in the address (`?period=`), and
 * the boards (`history-boards-ui.ts`), above them raids by day, the big days and a boss's trend
 * (plan 8H-8, `history-days-ui.ts`); on "Your history" the member's own numbers (`me-ui.ts`).
 * Only the latest question is drawn. Its pure parts are `history-tally.ts` and
 * `history-boards.ts`; this is tried at staging.
 */

const data = document.body.dataset;
const guild = data.guild ?? '';
const login = data.login === 'discord' ? 'discord' : 'links';
void showAccount(guild, login, 'history', () => [], true);

if (data.page === 'me') {
  showMe(guild, login);
} else {
  showDays(guild, login);
  showTally();
  showBoards(guild, login);
}

/** The region tally's section, with its periods. */
function showTally(): void {
  const title = byId('tally-title');
  const status = byId('tally-status');
  const table = byId('tally-table');
  const rows = byId('tally-rows');
  const foot = byId('tally-foot');
  const quiet = byId('tally-quiet');
  const periods = byId('tally-periods');

  let period: TallyPeriod = periodOfAddress(location.search);
  let asked = 0;

  /** A row of the table: its cells as text, the counts aligned as numbers. */
  const tableRow = (cells: readonly string[]): HTMLTableRowElement => {
    const row = document.createElement('tr');
    cells.forEach((text, index) => {
      const cell = document.createElement('td');
      cell.textContent = text;
      if (index >= 2) cell.className = 'count';
      row.append(cell);
    });
    return row;
  };

  const buttons = PERIOD_CHOICES.map((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = choice.label;
    button.addEventListener('click', () => {
      if (choice.period === period) return;
      period = choice.period;
      const query = new URLSearchParams(location.search);
      query.set('period', period);
      history.replaceState(null, '', `${location.pathname}?${query.toString()}`);
      void show();
    });
    periods.append(button);
    return { period: choice.period, button };
  });

  async function show(): Promise<void> {
    const mine = ++asked;
    for (const { period: one, button } of buttons) {
      button.setAttribute('aria-pressed', String(one === period));
    }
    status.textContent = 'Loading…';
    let view: RegionTallyView;
    try {
      view = await getJson<RegionTallyView>(tallyAddress(guild, period));
    } catch (err) {
      if (mine !== asked) return;
      const failure = tallyFailure(err instanceof RequestError ? err.status : undefined, login);
      table.hidden = true;
      quiet.hidden = true;
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
    const laid = tallyTable(view);
    title.textContent = view.title;
    rows.replaceChildren(...laid.rows.map(tableRow));
    foot.replaceChildren(...laid.foot.map(tableRow));
    const line = quietLine(view);
    quiet.textContent = line ?? '';
    quiet.hidden = line === null;
    status.textContent = '';
    table.hidden = false;
  }

  void show();
}
