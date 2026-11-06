import type {
  BigDaysView,
  BossListView,
  BossTrendView,
  HistoryDaysView,
} from '../../domain/web/history-days-data.js';
import {
  bigDayLine,
  bigDaysAddress,
  bigLabels,
  bossAddress,
  bossesAddress,
  bossOfText,
  dayBars,
  daysAddress,
  daysTable,
  trendBars,
  trendTable,
} from './history-days.js';
import { yearOfAddress } from './history-boards.js';
import { showFailure } from './history-failure-ui.js';
import { byId, getJson } from './page-frame.js';

/*
 * Raids by day, the big days of every year and a boss's trend on the history page (plan 8H-8):
 * a year to choose (kept in the address, `?year=`), its days as an SVG bar chart drawn from the
 * server's numbers (sizes as attributes, colors by the theme's classes: nothing inline), the big
 * days colored and one day of each run labeled (on a phone only the year's top three, B1), and in
 * a table under it the months' totals and the big days for whoever cannot see it (G14). The bars
 * thin to the chart's box, drawn again as it changes width (B10). Logged out or no member, the
 * days say so once and the other two sections hide (B9). Only the latest question of each
 * section is drawn; everything is set as text. Its pure part is `history-days.ts`; this is tried
 * at staging.
 */

const SVG = 'http://www.w3.org/2000/svg';
/** The height of the days' bars, the room above them for the big days' labels and under for the months. */
const DAYS_HEIGHT = 140;
const LABEL_TOP = 30;
const MONTH_ROOM = 14;
/** A chart narrower than this is a phone's: the months go unnamed (G14). */
const NARROW = 480;
/** The width a chart takes where the page cannot say its box's. */
const FALLBACK_WIDTH = 688;
/** How long the chart's box keeps a new width before the chart is drawn again (B10). */
const RESIZE_SETTLE_MS = 150;
/** A boss's months: the bars' height, a month's width and the room for the years under them. */
const TREND_HEIGHT = 120;
const TREND_MONTH = 10;
const TREND_BAR = 7;
const YEAR_ROOM = 16;

const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const MONTH_SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function svg(tag: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

/** A table's rows: a header row, then a row per line, its first cell a row header. */
function fillTable(table: HTMLElement, laid: { head: string[]; rows: string[][] }): void {
  const row = (cells: readonly string[], header: boolean) => {
    const line = document.createElement('tr');
    cells.forEach((text, index) => {
      const cell = document.createElement(header || index === 0 ? 'th' : 'td');
      cell.setAttribute('scope', header ? 'col' : 'row');
      cell.textContent = text;
      line.append(cell);
    });
    return line;
  };
  table.replaceChildren(row(laid.head, true), ...laid.rows.map((cells) => row(cells, false)));
}

/** The three sections, each asked for once (the year's again as it is chosen). */
export function showDays(guild: string, login: 'discord' | 'links'): void {
  showYear(guild, login);
  showEvery(guild, login);
  showBoss(guild, login);
}

function showYear(guild: string, login: 'discord' | 'links'): void {
  const title = byId('days-title');
  const select = byId('days-year') as HTMLSelectElement;
  const status = byId('days-status');
  const legend = byId('days-legend');
  const chart = byId('days-chart');
  const box = chart.parentElement ?? chart;
  const table = byId('days-table');
  const bigTitle = byId('days-big-title');
  const bigNote = byId('days-big-note');
  const big = byId('days-big');
  let year = yearOfAddress(location.search);
  let asked = 0;
  let shown: HistoryDaysView | undefined;
  // The box's width the chart was last drawn at.
  let drawnWidth = 0;

  select.addEventListener('change', () => {
    year = Number(select.value);
    const query = new URLSearchParams(location.search);
    query.set('year', String(year));
    history.replaceState(null, '', `${location.pathname}?${query.toString()}`);
    void show();
  });

  function draw(view: HistoryDaysView): void {
    drawnWidth = box.clientWidth;
    const width = Math.max(200, drawnWidth || FALLBACK_WIDTH);
    const narrow = width < NARROW;
    const step = width / view.length;
    const bar = Math.max(0.6, step * 0.8);
    const bottom = LABEL_TOP + DAYS_HEIGHT;
    const height = bottom + (narrow ? 0 : MONTH_ROOM);
    chart.setAttribute('viewBox', `0 0 ${String(width)} ${String(height)}`);
    chart.setAttribute('width', String(width));
    chart.setAttribute('height', String(height));
    const bars = dayBars(view, DAYS_HEIGHT);
    chart.replaceChildren(
      svg('line', {
        class: 'axis',
        x1: '0',
        y1: String(bottom),
        x2: String(width),
        y2: String(bottom),
      }),
      ...(narrow
        ? []
        : MONTH_STARTS.map((start, month) => {
            const label = svg('text', {
              class: 'month',
              x: String(start * step + 1),
              y: String(height - 2),
            });
            label.textContent = MONTH_SHORT[month] ?? '';
            return label;
          })),
      ...bars.flatMap((one) => {
        const x = one.index * step;
        const parts: SVGElement[] = [
          svg('rect', {
            class: one.big ? 'raids big' : 'raids',
            x: String(x),
            y: String(bottom - one.raidsHeight),
            width: String(bar),
            height: String(one.raidsHeight),
          }),
        ];
        if (one.maxesHeight > 0) {
          parts.push(
            svg('rect', {
              class: 'maxes',
              x: String(x),
              y: String(bottom - one.raidsHeight - one.maxesHeight),
              width: String(bar),
              height: String(one.maxesHeight),
            }),
          );
        }
        return parts;
      }),
      // One label of each run, in two rows, none covering another; on a phone the top three (B1).
      ...bigLabels(view, width, narrow).map((one) => {
        const label = svg('text', {
          class: 'big-label',
          x: String(one.x),
          y: String(12 + one.row * 13),
        });
        label.textContent = one.text;
        return label;
      }),
    );
  }

  async function show(): Promise<void> {
    const mine = ++asked;
    status.textContent = 'Loading…';
    let view: HistoryDaysView;
    try {
      view = await getJson<HistoryDaysView>(daysAddress(guild, year));
    } catch (err) {
      if (mine !== asked) return;
      box.hidden = true;
      legend.hidden = true;
      big.hidden = true;
      bigTitle.hidden = true;
      bigNote.hidden = true;
      showFailure(status, err, login);
      return;
    }
    if (mine !== asked) return;
    shown = view;
    year = view.year;
    title.textContent = view.title;
    select.replaceChildren(
      ...view.years.map((one) => {
        const option = document.createElement('option');
        option.value = String(one);
        option.textContent = String(one);
        return option;
      }),
      // A year asked for that the server has no days of stays chosen.
      ...(view.years.includes(view.year)
        ? []
        : [
            Object.assign(document.createElement('option'), {
              value: String(view.year),
              textContent: String(view.year),
            }),
          ]),
    );
    select.value = String(view.year);
    legend.hidden = !view.maxes;
    box.hidden = false;
    draw(view);
    fillTable(table, daysTable(view));
    bigTitle.textContent = view.bigTitle;
    bigTitle.hidden = false;
    // What a big day is, both signals, in the server's words (B5).
    bigNote.textContent = view.bigNote;
    bigNote.hidden = false;
    big.hidden = false;
    big.replaceChildren(
      ...(view.big.length === 0
        ? [
            Object.assign(document.createElement('li'), {
              textContent: view.noBig,
              className: 'none',
            }),
          ]
        : // By date, as the server gives them (B6).
          view.big.map((one) => {
            const item = document.createElement('li');
            item.textContent = bigDayLine(one);
            return item;
          })),
    );
    status.textContent = '';
  }

  // The bars thin to the chart's box: drawn again when its width changes (B10: the box, not
  // the window, so that a scroll bar coming or going counts too), once it has settled.
  let resized = 0;
  new ResizeObserver(() => {
    if (box.clientWidth === drawnWidth) return;
    window.clearTimeout(resized);
    resized = window.setTimeout(() => {
      if (shown !== undefined) draw(shown);
    }, RESIZE_SETTLE_MS);
  }).observe(box);

  void show();
}

function showEvery(guild: string, login: 'discord' | 'links'): void {
  const status = byId('every-status');
  const list = byId('every-list');
  status.textContent = 'Loading…';
  void (async () => {
    let view: BigDaysView;
    try {
      view = await getJson<BigDaysView>(bigDaysAddress(guild));
    } catch (err) {
      showFailure(status, err, login, byId('every'));
      return;
    }
    if (view.years.length === 0) {
      status.textContent = view.none;
      return;
    }
    // One short line a day, the newest year first: the museum of the page.
    list.replaceChildren(
      ...view.years.map((one) => {
        const block = document.createElement('div');
        block.className = 'every-year';
        const head = document.createElement('h3');
        head.textContent = String(one.year);
        const days = document.createElement('ol');
        days.replaceChildren(
          ...one.days.map((day) => {
            const item = document.createElement('li');
            item.textContent = bigDayLine(day);
            return item;
          }),
        );
        block.append(head, days);
        return block;
      }),
    );
    status.textContent = '';
  })();
}

function showBoss(guild: string, login: 'discord' | 'links'): void {
  const input = byId('boss-input') as HTMLInputElement;
  const names = byId('boss-names');
  const status = byId('boss-status');
  const chart = byId('boss-chart');
  const box = chart.parentElement ?? chart;
  const table = byId('boss-table');
  const section = byId('boss');
  let list: BossListView | undefined;
  let asked = 0;
  let drawn: string | undefined;
  box.hidden = true;

  async function show(key: string): Promise<void> {
    const mine = ++asked;
    status.textContent = 'Loading…';
    let view: BossTrendView;
    try {
      view = await getJson<BossTrendView>(bossAddress(guild, key));
    } catch (err) {
      if (mine !== asked) return;
      box.hidden = true;
      drawn = undefined;
      showFailure(status, err, login, section);
      return;
    }
    if (mine !== asked) return;
    const bars = trendBars(view, TREND_HEIGHT);
    const width = Math.max(1, bars.length) * TREND_MONTH;
    const height = TREND_HEIGHT + YEAR_ROOM;
    chart.setAttribute('viewBox', `0 0 ${String(width)} ${String(height)}`);
    chart.setAttribute('width', String(width));
    chart.setAttribute('height', String(height));
    chart.replaceChildren(
      ...bars.flatMap((bar, index) => {
        const x = index * TREND_MONTH;
        const parts: SVGElement[] = [
          svg('rect', {
            class: 'raids',
            x: String(x),
            y: String(TREND_HEIGHT - bar.height),
            width: String(TREND_BAR),
            height: String(bar.height),
          }),
        ];
        if (bar.caption !== null) {
          const label = svg('text', { class: 'month', x: String(x), y: String(height - 3) });
          label.textContent = bar.caption;
          parts.push(label);
        }
        return parts;
      }),
    );
    fillTable(table, trendTable(view));
    box.hidden = false;
    status.textContent = view.summary;
  }

  /** The boss of the text in the box, drawn once it names one of the list exactly. */
  const asks = (settled: boolean): void => {
    if (list === undefined) return;
    const key = bossOfText(list.bosses, input.value);
    if (key === undefined) {
      // While the member types, nothing is said; once they leave the box, what is wrong.
      if (settled) status.textContent = input.value.trim() === '' ? '' : list.pick;
      return;
    }
    if (key === drawn) return;
    drawn = key;
    void show(key);
  };
  // A name picked from the list draws at once in every browser (B11); one typed, at its end.
  input.addEventListener('input', () => {
    asks(false);
  });
  input.addEventListener('change', () => {
    asks(true);
  });

  void (async () => {
    try {
      list = await getJson<BossListView>(bossesAddress(guild));
    } catch (err) {
      showFailure(status, err, login, section);
      return;
    }
    names.replaceChildren(
      ...list.bosses.map((one) =>
        Object.assign(document.createElement('option'), { value: one.name }),
      ),
    );
    status.textContent = list.bosses.length === 0 ? list.none : '';
  })();
}
