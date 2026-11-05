import type { MemberCardView, MemberStatsView } from '../../domain/web/board-data.js';
import { meAddress, meLines, monthBars, monthTable, yearOfAddress } from './history-boards.js';
import { tallyFailure, tallyLoginHref } from './history-tally.js';
import { byId, getJson } from './page-frame.js';
import { RequestError } from './request-error.js';

/*
 * "Your Pine" (plan 8H-6, design Part E): the member's own numbers of `/api/stats/me`, a year to
 * choose among theirs (kept in the address, `?year=`), and a bar chart of their months drawn as
 * SVG from the server's numbers (sizes as attributes: nothing inline). Only the latest question
 * is drawn; everything is set as text. Its pure part is `history-boards.ts`; this is tried at
 * staging.
 */

const SVG = 'http://www.w3.org/2000/svg';
/** The chart's height for the bars, its bars' width and the gap between months. */
const CHART_HEIGHT = 120;
const BAR = 6;
const MONTH_WIDTH = 16;
const LABEL_ROOM = 16;

export function showMe(guild: string, login: 'discord' | 'links'): void {
  const title = byId('me-title');
  const select = byId('me-year') as HTMLSelectElement;
  const status = byId('me-status');
  const list = byId('me-list');
  const months = byId('me-months');
  const chart = byId('me-chart');
  const table = byId('me-table');
  const yearLine = byId('me-year-line');
  let year = yearOfAddress(location.search);
  let asked = 0;

  select.addEventListener('change', () => {
    year = select.value === '' ? null : Number(select.value);
    const query = new URLSearchParams(location.search);
    if (year === null) query.delete('year');
    else query.set('year', String(year));
    const search = query.toString();
    history.replaceState(null, '', `${location.pathname}${search === '' ? '' : `?${search}`}`);
    void show();
  });

  const option = (value: string, words: string): HTMLOptionElement => {
    const one = document.createElement('option');
    one.value = value;
    one.textContent = words;
    return one;
  };

  const svg = (tag: string, attributes: Record<string, string>): SVGElement => {
    const element = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  };

  /** A row of the months' table: a header cell first, then its numbers. */
  const tableRow = (cells: readonly string[], header: boolean): HTMLTableRowElement => {
    const row = document.createElement('tr');
    cells.forEach((text, index) => {
      const cell = document.createElement(header || index === 0 ? 'th' : 'td');
      if (header) cell.setAttribute('scope', 'col');
      else if (index === 0) cell.setAttribute('scope', 'row');
      cell.textContent = text;
      row.append(cell);
    });
    return row;
  };

  function drawChart(view: MemberCardView): void {
    const bars = monthBars(view.months, CHART_HEIGHT);
    months.hidden = bars.length === 0;
    // The chart is for the eye (aria-hidden); its numbers are read from the table (B1).
    const laid = monthTable(bars);
    table.replaceChildren(
      tableRow(laid.head, true),
      ...laid.rows.map((cells) => tableRow(cells, false)),
    );
    const width = Math.max(1, bars.length) * MONTH_WIDTH;
    chart.setAttribute('viewBox', `0 0 ${String(width)} ${String(CHART_HEIGHT + LABEL_ROOM)}`);
    chart.setAttribute('width', String(width));
    chart.setAttribute('height', String(CHART_HEIGHT + LABEL_ROOM));
    chart.replaceChildren(
      ...bars.flatMap((bar, index) => {
        const x = index * MONTH_WIDTH + 1;
        const group = svg('g', {});
        const words = `${bar.label}: came to ${String(bar.came)}, ${String(bar.reports)} reports`;
        const tip = svg('title', {});
        tip.textContent = words;
        group.append(
          tip,
          svg('rect', {
            class: 'came',
            x: String(x),
            y: String(CHART_HEIGHT - bar.cameHeight),
            width: String(BAR),
            height: String(bar.cameHeight),
          }),
          svg('rect', {
            class: 'reports',
            x: String(x + BAR + 1),
            y: String(CHART_HEIGHT - bar.reportsHeight),
            width: String(BAR),
            height: String(bar.reportsHeight),
          }),
        );
        // A January names its year under the bars.
        if (bar.month.endsWith('-01') || index === 0) {
          const label = svg('text', {
            class: 'month',
            x: String(x),
            y: String(CHART_HEIGHT + LABEL_ROOM - 3),
          });
          label.textContent = bar.month.slice(0, 4);
          group.append(label);
        }
        return [group];
      }),
    );
  }

  async function show(): Promise<void> {
    const mine = ++asked;
    status.textContent = 'Loading…';
    let view: MemberStatsView;
    try {
      view = await getJson<MemberStatsView>(meAddress(guild, year));
    } catch (err) {
      if (mine !== asked) return;
      const failure = tallyFailure(err instanceof RequestError ? err.status : undefined, login);
      list.hidden = true;
      months.hidden = true;
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
    if (!view.optedIn) {
      status.textContent = view.text;
      list.hidden = true;
      months.hidden = true;
      // The label goes with the select (B9).
      yearLine.hidden = true;
      return;
    }
    yearLine.hidden = false;
    select.replaceChildren(
      option('', 'All time'),
      ...view.years.map((one) => option(String(one), String(one))),
      // A year chosen that has nothing stays chosen, saying so (B3).
      ...(view.year !== null && !view.years.includes(view.year)
        ? [option(String(view.year), String(view.year))]
        : []),
    );
    select.value = view.year === null ? '' : String(view.year);
    if (view.empty !== undefined) {
      // The heading follows the year chosen, as on a card (R-B1).
      title.textContent = view.title;
      status.textContent = view.empty;
      list.hidden = true;
      months.hidden = true;
      return;
    }
    title.textContent = view.title;
    list.replaceChildren(
      ...meLines(view).flatMap((line) => {
        const term = document.createElement('dt');
        term.textContent = line.label;
        const value = document.createElement('dd');
        value.textContent = line.value;
        return [term, value];
      }),
    );
    list.hidden = false;
    drawChart(view);
    status.textContent = '';
  }

  void show();
}
