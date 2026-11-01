import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseRocketLineups, type RocketChoice } from '../../src/domain/rocket/lineups.js';
import type { RocketLineupProvider } from '../../src/services/rocket-lineup-service.js';
import { catalogueFixture } from './game-data.js';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * ScrapedDuck's `rocketLineups.min.json` as it was on 2026-10-22 at 04:11, unchanged: 26
 * lineups (Giovanni, Cliff, Arlo, Sierra, 18 typed grunts with water twice, the untyped male and
 * female grunts, the decoy female grunt).
 */
export function readRocketFeed(): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, 'rocket-lineups.json'), 'utf8'));
}

let parsed: readonly RocketChoice[] | undefined;

/** The choices of the feed of 2026-10-22, read once and shared (read-only). */
export function rocketChoicesOfFeed(): readonly RocketChoice[] {
  parsed ??= Object.freeze(parseRocketLineups(readRocketFeed(), catalogueFixture()).choices);
  return parsed;
}

/**
 * The lineups as handlers read them (`RocketLineupProvider`): the choices of the feed of
 * 2026-10-22 unless given, read at `readAt` (`null`: never read), out of date `staleAfterHours`
 * later (the settings' default, 24).
 */
export function rocketLineupsFixture(
  given?: readonly RocketChoice[],
  readAt: number | null = Date.UTC(2026, 9, 22, 8, 11),
  staleAfterHours = 24,
): RocketLineupProvider {
  const choices = (): readonly RocketChoice[] => given ?? rocketChoicesOfFeed();
  return {
    choices,
    byKey: (key) => choices().find((choice) => choice.key === key),
    readAt: () => readAt ?? undefined,
    stale: (now) => readAt === null || now - readAt >= staleAfterHours * 3_600_000,
  };
}

/** A choice of the feed of 2026-10-22 by its key; throws for one it does not have. */
export function feedChoice(key: string): RocketChoice {
  const found = rocketChoicesOfFeed().find((choice) => choice.key === key);
  if (!found) throw new Error(`the feed has no choice "${key}"`);
  return found;
}
