import { wornBy } from '../pogo/raid-boss-feed.js';
import { isOneOf } from '../research/reports.js';
import type { TaskReward } from '../research/task.js';
import { parseRocketKey } from '../rocket/lineups.js';
import { searchTokens } from '../search/text.js';
import type { Unconfirmed } from './unconfirmed.js';
import {
  isResearchReport,
  type ResearchReport,
  type RocketReport,
  type StopReport,
} from './report.js';

/*
 * What a report at a stop is found by (plan 8M-12, Find on the map; design
 * `docs/superpowers/specs/2026-10-28-find-design.md`): its search words, and whether what it says
 * is not confirmed. One function over the stored report, so that the map and any later search on
 * Discord find the same; the page only compares the words typed with the words it is given.
 * Pure.
 */

/** Why a report is not confirmed (`unconfirmed.ts`, shared with the map's view). */
export type { Unconfirmed };

/** A report's search words (folded, as `searchTokens` reads them, each once) and its mark. */
export interface ReportSearch {
  words: string[];
  unconfirmed?: Unconfirmed;
}

/** What the search needs beyond the stored report: how many lineups a grunt type has today. */
export interface SearchFacts {
  /** The lineups of a grunt type's choice (`grunt:water`): two for a type reported apart. */
  lineupsOf(typeKey: string): number;
}

/** The words of a Pokémon: its name, its catalogue key's (`rattata_alola`: its form). */
function pokemonWords(name: string, key: string | null): string[] {
  return [name, ...(key === null ? [] : [key])];
}

/** The words of a reward: a Pokémon with its form and costume, an item, Mega Energy. */
function rewardWords(reward: TaskReward): string[] {
  if (reward.kind !== 'encounter') return [reward.name];
  const costumed = reward.costumed === true || wornBy(reward.name) !== undefined;
  return [...pokemonWords(reward.name, reward.key), ...(costumed ? ['costumed', 'costume'] : [])];
}

/** The words of research: its task's text and every reward it stands for. */
function researchWords(report: ResearchReport): string[] {
  return [report.research.text, ...report.research.rewards.flatMap(rewardWords)];
}

/**
 * The words of Team GO Rocket: who by name (`Water-type grunt`, `Arlo`, `Giovanni`, `Decoy
 * grunt`), a lineup's first slot, the Pokémon that can be caught, `rocket`, and a leader's
 * `leader`.
 */
function rocketWords(report: RocketReport): string[] {
  const who = parseRocketKey(report.subjectKey);
  return [
    report.rocket.name,
    report.rocket.lineup ?? '',
    ...report.rocket.catches.flatMap((caught) => pokemonWords(caught.name, caught.key)),
    'rocket',
    ...(who?.kind === 'leader' ? ['leader'] : []),
  ];
}

/** Why research is not confirmed: "one of" its rewards, or no reward said; else confirmed. */
function researchMark(report: ResearchReport): Unconfirmed | undefined {
  const { rewards } = report.research;
  if (rewards.length === 0) return { kind: 'no-reward' };
  if (!isOneOf(report)) return undefined;
  return {
    kind: 'one-of',
    count: rewards.length,
    encounters: rewards.every((reward) => reward.kind === 'encounter'),
  };
}

/**
 * A grunt of a type reported without its lineup ("not sure which", plan 8R-4L), where the type
 * has two lineups today: only such a type can be unconfirmed.
 */
function rocketMark(report: RocketReport, facts: SearchFacts): Unconfirmed | undefined {
  const who = parseRocketKey(report.subjectKey);
  if (who?.kind !== 'grunt' || who.lineup !== undefined) return undefined;
  const count = facts.lineupsOf(report.subjectKey);
  return count >= 2 ? { kind: 'not-sure-which', count } : undefined;
}

/**
 * A report's search words and whether it is not confirmed (plan 8M-12): research by its task's
 * words and every reward's name (a Pokémon with its form and costume, an item, Mega Energy), Team
 * GO Rocket by who, the lineup's Pokémon, `rocket` and a leader's `leader`; never its reporter or
 * its stop. Research "one of" or without its reward, and a grunt of two lineups "not sure which",
 * are not confirmed.
 */
export function reportSearch(report: StopReport, facts: SearchFacts): ReportSearch {
  const texts = isResearchReport(report) ? researchWords(report) : rocketWords(report);
  const words = [...new Set(texts.flatMap(searchTokens))];
  const unconfirmed = isResearchReport(report) ? researchMark(report) : rocketMark(report, facts);
  return unconfirmed === undefined ? { words } : { words, unconfirmed };
}
