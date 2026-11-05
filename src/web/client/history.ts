import type { BoardPeriod } from '../../domain/history/board-periods.js';
import type { RegionBoardView } from '../../domain/web/region-board-data.js';
import {
  boardAddress,
  boardFailure,
  boardLoginHref,
  boardTable,
  PERIOD_CHOICES,
  periodOfAddress,
} from './history-board.js';
import { byId, getJson, showAccount } from './page-frame.js';
import { RequestError } from './request-error.js';

/*
 * The history page (plan 8H-5): the header (the login, or the member's menu with the theme), and
 * the region board of `/api/stats/regions` with its periods, the one shown kept in the address
 * (`?period=`). Only the latest question is drawn. Its pure part is `history-board.ts`; this is
 * tried at staging.
 */

const data = document.body.dataset;
const guild = data.guild ?? '';
const login = data.login === 'discord' ? 'discord' : 'links';
void showAccount(guild, login, 'history', () => [], true);

const title = byId('board-title');
const status = byId('board-status');
const table = byId('board-table');
const rows = byId('board-rows');
const foot = byId('board-foot');
const periods = byId('board-periods');

let period: BoardPeriod = periodOfAddress(location.search);
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
  let view: RegionBoardView;
  try {
    view = await getJson<RegionBoardView>(boardAddress(guild, period));
  } catch (err) {
    if (mine !== asked) return;
    const failure = boardFailure(err instanceof RequestError ? err.status : undefined, login);
    table.hidden = true;
    if (failure.login) {
      const link = document.createElement('a');
      link.href = boardLoginHref(location.pathname);
      link.textContent = failure.text;
      status.replaceChildren(link);
    } else {
      status.textContent = failure.text;
    }
    return;
  }
  if (mine !== asked) return;
  const laid = boardTable(view);
  title.textContent = view.title;
  rows.replaceChildren(...laid.rows.map(tableRow));
  foot.replaceChildren(...laid.foot.map(tableRow));
  status.textContent = '';
  table.hidden = false;
}

void show();
