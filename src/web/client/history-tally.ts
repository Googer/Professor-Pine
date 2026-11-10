import {
  TALLY_PERIODS,
  allQuietText,
  isTallyPeriod,
  PERIOD_LABELS,
  QUIET_LEAD,
  type TallyPeriod,
} from '../../domain/history/tally-periods.js';
import type { RegionTallyView } from '../../domain/web/region-tally-data.js';

/*
 * The region tally on the history page (plan 8H-5), its pure part: the periods offered, where
 * the tally is asked for, the table it is laid out as, and what the page says when it cannot be
 * shown. The tally itself is the server's (`/api/stats/regions`, `/stats regions`' own path).
 */

/** The periods as the page's buttons name them, this month first. */
export const PERIOD_CHOICES: ReadonlyArray<{ period: TallyPeriod; label: string }> =
  TALLY_PERIODS.map((period) => ({ period, label: PERIOD_LABELS[period] }));

/** The route of a server's tally for a period. */
export function tallyAddress(guild: string, period: TallyPeriod): string {
  return `/s/${guild}/api/stats/regions?period=${period}`;
}

/**
 * The period the page's address names (`?period=`, kept as the member switches), else this
 * month.
 */
export function periodOfAddress(search: string): TallyPeriod {
  const asked = new URLSearchParams(search).get('period') ?? undefined;
  return isTallyPeriod(asked) ? asked : 'month';
}

/**
 * Where "Log in with Discord" goes from the page (P3): back to the page by its path alone, as the
 * login takes only a local path (`localPath`); the period is this month again after it.
 */
export function tallyLoginHref(pathname: string): string {
  return `/auth/login?next=${encodeURIComponent(pathname)}`;
}

const number = (n: number): string => n.toLocaleString('en-US');

/**
 * The tally as the cells of the table: a row per region, numbered, the busiest first; under
 * them "No longer a region" (where there are any) and the total.
 */
export function tallyTable(view: RegionTallyView): { rows: string[][]; foot: string[][] } {
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
 * The line under the table of the regions without a raid or max battle ("No raids or max
 * battles: #a, #b"), or the sentence that none had one where every region shown was quiet; null
 * where no region was quiet.
 */
export function quietLine(view: RegionTallyView): string | null {
  if (view.quiet.length === 0) return null;
  return view.rows.length === 0
    ? allQuietText(view.period)
    : `${QUIET_LEAD}: ${view.quiet.join(', ')}`;
}

/**
 * What the page says when the tally (or the boards, or raids by day) cannot be shown, by the
 * route's status (undefined: no answer at all; the words fit every section, plan 8H-8 B12), and
 * whether a "Log in with Discord" link goes with it (somebody logged out, where Discord's login
 * is offered).
 */
export function tallyFailure(
  status: number | undefined,
  login: 'discord' | 'links',
): { text: string; login: boolean } {
  switch (status) {
    case 401:
      return login === 'discord'
        ? { text: "Log in with Discord to see this server's history.", login: true }
        : { text: "Use /maps in Discord to log in and see this server's history.", login: false };
    case 403:
      return { text: 'This page is for members of this server only.', login: false };
    case 503:
      return { text: 'Discord cannot be reached just now. Try again in a moment.', login: false };
    case 429:
      return { text: 'Too many requests. Try again in a minute.', login: false };
    default:
      return { text: 'This could not be loaded. Try again in a moment.', login: false };
  }
}
