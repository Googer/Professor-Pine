import { keptOut, type ForumStanding } from '../history/region-tally.js';

/*
 * Who may see and report a region's wild spawns (review S2 of the spawns on the map): one rule for
 * `POST /api/spawns` (reporting one on the map) and `GET /api/spawns` (seeing those that stand),
 * so that a member who may report a spawn sees it on the map. Pure.
 */

/**
 * The channels whose standing says it, in the order they are asked: the region's forum where it
 * has one (a raid there is the region's), then its text channel, where the spawn's message stands.
 */
export function spawnGates(region: { forumChannelId: string | null; channelId: string }): string[] {
  return region.forumChannelId === null
    ? [region.channelId]
    : [region.forumChannelId, region.channelId];
}

/**
 * Whether how a member stands to a region's gates (`spawnGates`) keeps its spawns from them:
 * barred from any one of them (`keptOut`: an overwrite of their own, or a role's, that denies the
 * view), never a server's administrator (Discord shows them every channel, the owner included). A
 * gate that only the member's roles hide, or one Discord no longer has, keeps nobody out: the
 * spawns of a region a member has not joined still show, as its raids do.
 */
export function spawnKeptOut(
  standings: Iterable<ForumStanding | undefined>,
  administrator: boolean,
): boolean {
  if (administrator) return false;
  for (const standing of standings) if (keptOut(standing)) return true;
  return false;
}

/**
 * Whether a report at a place is kept from a member (plan 8Z-2, the audit's W7: field research
 * and Team GO Rocket at a PokéStop, on Discord and on the map alike), by the spawns' rule region
 * by region. `regions` holds, for each region the place lies in, how the member stands to that
 * region's gates (`spawnGates`). The place counts when one of its regions lets them in: a stop
 * on the border of two regions is theirs to report at while either is. It is kept from them when
 * every region it lies in keeps them out (`spawnKeptOut`); a place in no region is kept from
 * nobody (nothing shows it).
 */
export function placeKeptOut(
  regions: readonly Iterable<ForumStanding | undefined>[],
  administrator: boolean,
): boolean {
  return regions.length > 0 && regions.every((gates) => spawnKeptOut(gates, administrator));
}
