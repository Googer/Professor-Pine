import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import type { FeedBoss } from '../domain/pogo/raid-boss-feed.js';
import type { SeenChange } from '../domain/pogo/boss-diff.js';
import { feedBossKey, type BossListChange, type RaidBoss } from '../domain/pogo/raid-bosses.js';
import {
  RAID_LEVELS,
  raidTierLabel,
  sameRaidTier,
  type RaidTier,
} from '../domain/pogo/raid-tier.js';
import { maxStars, type MaxTier } from '../domain/pogo/max-tier.js';
import { fitItems, LIMITS, plain, timestamp } from './text.js';

/**
 * What a post is told of its boss moved by staff (plan 8X-J): "Staff moved **Dynamax Sneasel**
 * to 2★.", "Staff moved **Starmie** to T1." (a Gigantamax battle never moves).
 */
export function bossMovedLine(name: string, to: RaidTier | MaxTier): string {
  if (typeof to !== 'string') return `Staff moved **${plain(name)}** to ${raidTierLabel(to)}.`;
  return `Staff moved **Dynamax ${plain(name)}** to ${String(maxStars(to) ?? '')}★.`;
}

/** What changed in one tier: the names of the bosses that came and went, as members see them. */
export interface TierChange {
  tier: RaidTier;
  added: string[];
  removed: string[];
}

const tierRank = (tier: RaidTier): number =>
  RAID_LEVELS.indexOf(tier.level) * 2 + (tier.shadow ? 1 : 0);

/**
 * A change of the feed's list as members would see it, by tier in the order of the levels
 * (shadow after plain): each boss named by its catalogue entry, or by the feed's name (made
 * plain) when the game master does not know it. A boss that went and came back under other ids
 * in the same tier (the feed renamed a costume id) is no change and is left out.
 */
export function tierChanges(change: BossListChange, catalogue: PokemonCatalogue): TierChange[] {
  const placed = (boss: FeedBoss) => ({ boss, ...feedBossKey(boss, catalogue) });
  const added = change.added.map(placed);
  const removed = change.removed.map(placed);
  const same = (a: (typeof added)[number], b: (typeof added)[number]): boolean =>
    a.key === b.key && sameRaidTier(a.boss.tier, b.boss.tier);
  const keptAdded = [...added];
  const keptRemoved = removed.filter((gone) => {
    const index = keptAdded.findIndex((come) => same(come, gone));
    if (index === -1) return true;
    keptAdded.splice(index, 1);
    return false;
  });
  const name = (one: (typeof added)[number]): string => one.entry?.name ?? one.boss.name;
  return byTier(
    keptAdded.map((one) => ({ tier: one.boss.tier, name: name(one) })),
    keptRemoved.map((one) => ({ tier: one.boss.tier, name: name(one) })),
  );
}

/**
 * What members see change (`SeenChange`: the lists in effect before and after, with the
 * overrides), by tier as `tierChanges` gives it: each boss by the name the list shows.
 */
export function seenTierChanges(seen: SeenChange): TierChange[] {
  const named = (boss: RaidBoss) => ({ tier: boss.tier, name: boss.name });
  return byTier(seen.added.map(named), seen.removed.map(named));
}

/** Names that came and went, grouped by tier in the order of the levels, each made plain once. */
function byTier(
  added: readonly { tier: RaidTier; name: string }[],
  removed: readonly { tier: RaidTier; name: string }[],
): TierChange[] {
  const tiers: TierChange[] = [];
  const tierOf = (tier: RaidTier): TierChange => {
    let found = tiers.find((one) => sameRaidTier(one.tier, tier));
    if (!found) {
      found = { tier: { ...tier }, added: [], removed: [] };
      tiers.push(found);
    }
    return found;
  };
  for (const one of added) {
    const list = tierOf(one.tier).added;
    if (!list.includes(plain(one.name))) list.push(plain(one.name));
  }
  for (const one of removed) {
    const list = tierOf(one.tier).removed;
    if (!list.includes(plain(one.name))) list.push(plain(one.name));
  }
  return tiers.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
}

/** As many characters as the names of one side of a tier's line may take. */
const NAMES_LIMIT = 500;

/**
 * A tier's change on one line: `**T5** · New: Yveltal · Gone: Zekrom`; a long list of names is
 * cut with a count.
 */
export function tierChangeLine(change: TierChange): string {
  return [
    `**${raidTierLabel(change.tier)}**`,
    ...(change.added.length > 0 ? [`New: ${fitItems(change.added, NAMES_LIMIT)}`] : []),
    ...(change.removed.length > 0 ? [`Gone: ${fitItems(change.removed, NAMES_LIMIT)}`] : []),
  ].join(' · ');
}

/**
 * The announcement of a changed boss list as members see it (`SeenChange`: with the overrides
 * in force), one message (cut with a count of the tiers left out), or undefined when members see
 * no change. It pings nobody.
 */
export function bossChangeAnnouncement(seen: SeenChange): string | undefined {
  const lines = seenTierChanges(seen).map(tierChangeLine);
  if (lines.length === 0) return undefined;
  const head = '**The raid bosses have changed**';
  return `${head}\n${fitItems(lines, LIMITS.content - head.length - 1, '\n')}`;
}

/**
 * The warning that the boss list is out of date, for the moderators' channel. It says since when
 * and never what the error was: that is in the log, and may be a raw database message.
 */
export function staleWarning(lastSyncedAt: number | undefined): string {
  const since =
    lastSyncedAt === undefined
      ? 'I have not been able to read the raid boss feed yet, so I know no raid bosses.'
      : `I have not been able to read the raid boss feed since ${timestamp(lastSyncedAt, 'f')} ` +
        `(${timestamp(lastSyncedAt, 'R')}), so the raid boss list may be out of date.`;
  return (
    `**The raid boss list is not being updated.** ${since} I keep trying. Meanwhile ` +
    '`/admin boss add` and `/admin boss hide` change the list, and `/admin boss sync` tries ' +
    'again at once.'
  );
}
