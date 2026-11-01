import { bossAtTier } from '../pogo/boss-at-tier.js';
import type { PokemonCatalogue } from '../pogo/catalogue.js';
import { listedMaxBoss } from '../pogo/max-boss-list.js';
import { MAX_OPS, type MaxBoss } from '../pogo/max-bosses.js';
import type { MaxTier } from '../pogo/max-tier.js';
import { RAID_OPS } from '../pogo/raid-bosses.js';
import type { RaidTier } from '../pogo/raid-tier.js';
import type { MaxScreenshotReport } from './max-report.js';
import {
  pokemonByCpAndName,
  type ReportContext,
  type ScreenshotReport,
} from './screenshot-report.js';

/**
 * Screenshots that keep disagreeing with the boss list (plan 8X-J, design section 2): what a
 * screenshot's own reading says against the list, and when enough of them tell the moderators.
 * Pure; the observations are kept by the caller (`ListTierWatch`).
 */

/** How many screenshots of one boss with one other heads' tier tell the moderators (Matt's answer 1). */
export const LIST_TIER_SIGHTINGS = 3;
/** Within how long before now they count. */
export const LIST_TIER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Which boss list: the raid bosses' or the max bosses'. */
export type ListTierFamily = 'raid' | 'max';

/** What a screenshot says against the list: its boss, the list's tier of it and the heads'. */
export interface ListTierSighting {
  family: ListTierFamily;
  /** The boss's key in the list (`Boss.key`). */
  bossKey: string;
  listTier: RaidTier | MaxTier;
  headsTier: RaidTier | MaxTier;
}

/** A sighting with who posted it, where (a gym or a Power Spot) and when it was uploaded. */
export interface ListTierObservation extends ListTierSighting {
  /** Only counted, never written anywhere. */
  memberId: string;
  /** The gym or Power Spot it showed (its id, else its name as read; empty for none). */
  place: string;
  at: number;
}

/** A sighting that `LIST_TIER_SIGHTINGS` screenshots or more show, with how many. */
export interface ListTierDoubt extends ListTierSighting {
  count: number;
}

/** A tier as text that tells it from every other tier of either list. */
export function listTierKey(tier: RaidTier | MaxTier): string {
  return typeof tier === 'string' ? MAX_OPS.slot(tier) : RAID_OPS.slot(tier);
}

/** The key of what a sighting says, the same for every screenshot that says it. */
export function sightingKey(sighting: ListTierSighting): string {
  return [
    sighting.family,
    sighting.bossKey,
    listTierKey(sighting.listTier),
    listTierKey(sighting.headsTier),
  ].join('\n');
}

/**
 * Whether a screenshot is too old to be a sighting (review J10): its moment, when known (by the
 * file's name or a clock, not guessed from the upload), lies more than `LIST_TIER_WINDOW_MS`
 * before the upload: a screenshot posted again days later says nothing of the list now.
 */
export function momentTooOld(
  moment: { takenAt: number; timeFrom: 'file' | 'clock' | 'upload' },
  uploadedAt: number,
): boolean {
  return moment.timeFrom !== 'upload' && uploadedAt - moment.takenAt > LIST_TIER_WINDOW_MS;
}

/**
 * What the observations of the last `LIST_TIER_WINDOW_MS` before `now` show at least
 * `LIST_TIER_SIGHTINGS` times (any members): the boss, the list's tier and the heads' tier, a
 * member and place counted once (the same file posted twice is one screenshot). In the order
 * first seen.
 */
export function listTierDoubt(
  observations: readonly ListTierObservation[],
  now: number,
): ListTierDoubt[] {
  const seen = new Map<string, { sighting: ListTierSighting; who: Set<string> }>();
  for (const one of observations) {
    if (one.at <= now - LIST_TIER_WINDOW_MS || one.at > now) continue;
    const key = sightingKey(one);
    const entry = seen.get(key) ?? {
      sighting: {
        family: one.family,
        bossKey: one.bossKey,
        listTier: one.listTier,
        headsTier: one.headsTier,
      },
      who: new Set<string>(),
    };
    entry.who.add(`${one.memberId}\n${one.place}`);
    seen.set(key, entry);
  }
  return [...seen.values()]
    .filter(({ who }) => who.size >= LIST_TIER_SIGHTINGS)
    .map(({ sighting, who }) => ({ ...sighting, count: who.size }));
}

/**
 * What a max battle's screenshot says against the list (design section 2): its reader found a
 * listed Dynamax boss and read heads that say another tier (`heads-boss-conflict`). Gigantamax
 * has no heads to disagree; a boss on no list says nothing of the list.
 */
export function maxTierObservation(
  report: MaxScreenshotReport,
  bosses: readonly MaxBoss[],
  catalogue: PokemonCatalogue,
): ListTierSighting | undefined {
  const { boss, tier, heads } = report;
  if (report.form !== 'dynamax' || !boss?.listed || tier === null || tier === 'G') return undefined;
  if (!report.doubts.includes('heads-boss-conflict') || heads === null) return undefined;
  if (heads < 1 || heads > 5) return undefined;
  const headsTier = `D${String(heads)}` as MaxTier;
  const { listed } = listedMaxBoss(boss.ref, tier, catalogue, bosses);
  if (!listed) return undefined;
  return { family: 'max', bossKey: listed.key, listTier: tier, headsTier };
}

/**
 * What a raid's screenshot says against the list (review B1, Matt's answer 3): a hatched raid
 * whose CP and name at the heads' tier fit a Pokémon (`pokemonByCpAndName`, as the reader looks
 * for a boss off the list) that the list has at another tier of the same kind (`bossAtTier`'s
 * `listed-elsewhere`; plain and shadow raids apart, megas never), so the reader found no boss.
 * Never an Elite raid (on either side) nor a count of heads no sample has shown
 * (`heads-unverified`, 6 and 7).
 */
export function raidTierObservation(
  report: ScreenshotReport,
  context: Pick<ReportContext, 'bosses' | 'pokemon'>,
): ListTierSighting | undefined {
  const { tier } = report;
  if (report.stage !== 'hatched' || report.boss !== null || report.tierFrom !== 'heads') {
    return undefined;
  }
  if (tier === null || tier.level === 'Elite' || report.doubts.includes('heads-unverified')) {
    return undefined;
  }
  const group = RAID_OPS.oneTierAmong?.(tier);
  if (group === undefined) return undefined;
  const entry = pokemonByCpAndName(report.cp, report.bossName, tier, context);
  if (!entry) return undefined;
  const found = bossAtTier(entry, tier, context.bosses);
  if (found.kind !== 'listed-elsewhere') return undefined;
  const listTier = found.boss.tier;
  if (listTier.level === 'Elite' || RAID_OPS.oneTierAmong?.(listTier) !== group) return undefined;
  return { family: 'raid', bossKey: found.boss.key, listTier, headsTier: tier };
}
