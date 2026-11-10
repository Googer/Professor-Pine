import type { ReportedStop, ResearchDetail } from '../domain/stops/report.js';
import { rewardWords, taskText } from './research.js';
import { plain, truncate } from './text.js';

/**
 * The line of a new task of the day in a region's channel (plan 8R-9, B9; design "The text
 * channel"): its text and its reward as first reported (`one of …` for a "one of", nothing for a
 * task typed without one), and the link to the message of the board that holds it:
 * `Research: **Catch 25 Pokémon** (Rare Candy) → <link>`. Plain text, never edited.
 */
export function researchLine(
  research: Pick<ResearchDetail, 'text' | 'typed' | 'rewards'>,
  link: string,
): string {
  const rewards = rewardWords(research.rewards);
  return `Research: **${taskText(research)}**${rewards === '' ? '' : ` (${rewards})`} → ${link}`;
}

/**
 * The line of a leader or Giovanni reported in a region today (plan 8R-9, B9), the stop by its
 * name and the link to the message of the board that holds the hideout:
 * `Team GO Rocket: **Arlo** at **Yellow Mural** → <link>`.
 */
export function hideoutLine(name: string, stop: Pick<ReportedStop, 'name'>, link: string): string {
  return `Team GO Rocket: **${plain(name)}** at **${plain(truncate(stop.name, 80))}** → ${link}`;
}
