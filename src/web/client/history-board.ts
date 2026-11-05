import {
  BOARD_PERIODS,
  isBoardPeriod,
  PERIOD_LABELS,
  type BoardPeriod,
} from '../../domain/history/board-periods.js';
import type { RegionBoardView } from '../../domain/web/region-board-data.js';

/*
 * The region board on the history page (plan 8H-5), its pure part: the periods offered, where
 * the board is asked for, the table it is laid out as, and what the page says when it cannot be
 * shown. The board itself is the server's (`/api/stats/regions`, `/stats regions`' own path).
 */

/** The periods as the page's buttons name them, this month first. */
export const PERIOD_CHOICES: ReadonlyArray<{ period: BoardPeriod; label: string }> =
  BOARD_PERIODS.map((period) => ({ period, label: PERIOD_LABELS[period] }));

/** The route of a server's board for a period. */
export function boardAddress(guild: string, period: BoardPeriod): string {
  return `/s/${guild}/api/stats/regions?period=${period}`;
}

/**
 * The period the page's address names (`?period=`, kept as the member switches), else this
 * month.
 */
export function periodOfAddress(search: string): BoardPeriod {
  const asked = new URLSearchParams(search).get('period') ?? undefined;
  return isBoardPeriod(asked) ? asked : 'month';
}

/**
 * Where "Log in with Discord" goes from the page (P3): back to the page by its path alone, as the
 * login takes only a local path (`localPath`); the period is this month again after it.
 */
export function boardLoginHref(pathname: string): string {
  return `/auth/login?next=${encodeURIComponent(pathname)}`;
}

const number = (n: number): string => n.toLocaleString('en-US');

/**
 * The board as the cells of the table: a row per region, numbered, the busiest first; under
 * them "No longer a region" (where there are any) and the total.
 */
export function boardTable(view: RegionBoardView): { rows: string[][]; foot: string[][] } {
  return {
    rows: view.rows.map((row, index) => [
      String(index + 1),
      row.name,
      number(row.raids),
      number(row.maxes),
    ]),
    foot: [
      ...(view.gone === null
        ? []
        : [['', 'No longer a region', number(view.gone.raids), number(view.gone.maxes)]]),
      ['', 'Total', number(view.total.raids), number(view.total.maxes)],
    ],
  };
}

/**
 * What the page says when the board cannot be shown, by the route's status (undefined: no
 * answer at all), and whether a "Log in with Discord" link goes with it (somebody logged out,
 * where Discord's login is offered).
 */
export function boardFailure(
  status: number | undefined,
  login: 'discord' | 'links',
): { text: string; login: boolean } {
  switch (status) {
    case 401:
      return login === 'discord'
        ? { text: "Log in with Discord to see this server's history.", login: true }
        : { text: "Use /maps in Discord to log in and see this server's history.", login: false };
    case 403:
      return { text: 'Members only: this page is for the members of this server.', login: false };
    case 503:
      return { text: 'Discord cannot be reached just now. Try again in a moment.', login: false };
    case 429:
      return { text: 'That was a lot of asking. Try again in a minute.', login: false };
    default:
      return { text: 'The board could not be loaded. Try again in a moment.', login: false };
  }
}
