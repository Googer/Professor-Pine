import type { APIComponentInContainer } from 'discord.js';
import { tallyTitle, type TallyPeriod } from '../domain/history/tally-periods.js';
import type { TallyCounts } from '../domain/history/region-tally.js';
import type { V2Message } from '../discord/party-gateway.js';
import { container, LIST_COLOUR, textDisplay } from './v2.js';

/** A tally as Discord shows it: each row with the region's name as the answer gives it. */
export interface TallyView {
  period: TallyPeriod;
  rows: ReadonlyArray<TallyCounts & { name: string }>;
  gone: TallyCounts | null;
  total: TallyCounts;
}

/**
 * At most this many characters of rows: a server of very many regions lists its busiest, and
 * says how many more there are, within Discord's 4,000 of a message.
 */
export const TALLY_ROWS_BUDGET = 3_000;

const number = (n: number): string => n.toLocaleString('en-US');

/** A line's counts: "12 raids, 3 max battles", "1 raid", "2 max battles", or "none". */
export function countWords(counts: TallyCounts): string {
  const raids = `${number(counts.raids)} ${counts.raids === 1 ? 'raid' : 'raids'}`;
  const maxes = `${number(counts.maxes)} ${counts.maxes === 1 ? 'max battle' : 'max battles'}`;
  if (counts.maxes === 0) return counts.raids === 0 ? 'none' : raids;
  return counts.raids === 0 ? maxes : `${raids}, ${maxes}`;
}

/**
 * The tally as text: the title and a line per region, numbered, the busiest first (as many as
 * `TALLY_ROWS_BUDGET` holds, then how many more), then "No longer a region" and the total.
 */
export function tallyTexts(view: TallyView): string[] {
  const lines: string[] = [];
  let used = 0;
  for (const [index, row] of view.rows.entries()) {
    const line = `${String(index + 1)}. ${row.name}: ${countWords(row)}`;
    if (used + line.length > TALLY_ROWS_BUDGET) {
      const more = view.rows.length - index;
      lines.push(`…and ${number(more)} more ${more === 1 ? 'region' : 'regions'}, quieter`);
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  const head = [`### ${tallyTitle(view.period)}`, ...lines].join('\n');
  const foot = [
    ...(view.gone === null ? [] : [`No longer a region: ${countWords(view.gone)}`]),
    `**Total:** ${countWords(view.total)}`,
  ].join('\n');
  return [head, foot];
}

/**
 * The tally as a components-v2 message of one container: its texts, then `more` (the controls
 * of the private answer, or the small print of a shared one).
 */
export function tallyMessage(
  view: TallyView,
  more: readonly APIComponentInContainer[] = [],
): V2Message {
  return {
    v2: true,
    components: [
      container(LIST_COLOUR, [...tallyTexts(view).map((text) => textDisplay(text)), ...more]),
    ],
  };
}
