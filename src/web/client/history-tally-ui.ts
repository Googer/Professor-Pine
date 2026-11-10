import type { TallyPeriod } from '../../domain/history/tally-periods.js';
import type { RegionTallyView } from '../../domain/web/region-tally-data.js';
import {
  tallyAddress,
  tallyTable,
  PERIOD_CHOICES,
  periodOfAddress,
  quietLine,
} from './history-tally.js';
import { showFailure } from './history-failure-ui.js';
import { byId, getJson } from './page-frame.js';

/*
 * The region tally's section of the history page (plan 8H-5): the tally of `/api/stats/regions`
 * with its periods, the one shown kept in the address (`?period=`). Only the latest question is
 * drawn; logged out or no member it hides, raids by day saying so (B9). Its pure part is
 * `history-tally.ts`.
 */

/** The region tally's section, with its periods. */
export function showTally(guild: string, login: 'discord' | 'links'): void {
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
      table.hidden = true;
      quiet.hidden = true;
      showFailure(status, err, login, byId('tally'));
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
