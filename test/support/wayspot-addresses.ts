import type { GoogleBudget } from '../../src/domain/geo/google-line.js';
import { MemoryGoogleUse } from '../../src/services/google-use.js';
import { DEFAULT_GOOGLE_BUDGET } from '../../src/services/gym-upkeep.js';
import { GoogleAnswers, MemoryGoogleAnswerStorage } from '../../src/services/google-answers.js';
import { WayspotAddresses } from '../../src/services/wayspot-addresses.js';
import { FakeGeoGateway } from './geo.js';
import { createTestLogger } from './test-logger.js';

/**
 * The addresses of Power Spots asked for the map (design
 * `2026-11-04-power-spot-address-design.md`) over memory: Google faked (`geo`), this month's
 * counts (`use`), the kept answers (`storage`), the default budget unless `budget` is given, and
 * the clock `now` (the faked `Date` unless given). Loaded. Pass `addresses` to `wayspotsWith`
 * (its third argument) and as `wayspotAddresses` to `createTestContext`.
 */
export async function wayspotAddressesWith(
  options: { budget?: GoogleBudget; now?: () => number } = {},
) {
  const geo = new FakeGeoGateway();
  const use = new MemoryGoogleUse();
  const storage = new MemoryGoogleAnswerStorage();
  const { log, entries } = createTestLogger();
  const answers = new GoogleAnswers({ storage, log });
  await answers.load();
  const addresses = new WayspotAddresses({
    answers,
    geo,
    use,
    budget: options.budget ?? DEFAULT_GOOGLE_BUDGET,
    log,
    now: options.now ?? (() => Date.now()),
  });
  return { addresses, answers, geo, use, storage, entries };
}
