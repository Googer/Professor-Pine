import { gymsInNoRegion, upgradeLinks, type UpgradeInput } from '../gyms/gym-server.js';

/** A server's copy of a Wayspot (`ServerWayspot`): the Wayfarer id and the server's `Guild` row. */
export interface WayspotCopy {
  id: string;
  guildId: number;
}

/** What the upgrade reads (migration 059). */
export interface CopyInput {
  /** Every Wayspot kept before the upgrade, those found gone too. */
  wayspots: readonly { id: string; lat: number; lon: number }[];
  regions: UpgradeInput['regions'];
  /**
   * The servers that used a Wayspot (its stop reports, the party history's max battles and train
   * stops, the meetup rulings), by Wayfarer id.
   */
  usedBy: ReadonlyMap<string, readonly number[]>;
  /** Every server recorded (`Guild` rows). */
  servers: readonly number[];
}

/**
 * The input of the gyms' rule (`upgradeLinks`), the Wayspots numbered by their place in the list:
 * one rule for where a gym and a Wayspot lie, and whose they are at the upgrade.
 */
function asGyms(input: Pick<CopyInput, 'wayspots' | 'regions'>) {
  return {
    gyms: input.wayspots.map((wayspot, index) => ({
      id: index,
      lat: wayspot.lat,
      lon: wayspot.lon,
    })),
    regions: input.regions,
  };
}

/**
 * The Wayspots in no region of any server, in the order given: the only ones whose copies their
 * use decides (`upgradeCopies`), so that the upgrade reads the use of those alone.
 */
export function wayspotsInNoRegion(input: Pick<CopyInput, 'wayspots' | 'regions'>): string[] {
  return gymsInNoRegion(asGyms(input)).map((index) => input.wayspots[index]!.id);
}

/**
 * The copies the upgrade to 2.1 makes of the Wayspots there are (plan 19B-3): each Wayspot to
 * every server whose regions hold it, by the rule the gyms' links were made by (`upgradeLinks`,
 * plan 19B-2: one path); one in no region of any server, to the servers that used it (of those
 * recorded); otherwise to every server recorded. In the order of the Wayspots, then of the servers.
 */
export function upgradeCopies(input: CopyInput): WayspotCopy[] {
  const historyServers = new Map<number, readonly number[]>();
  input.wayspots.forEach((wayspot, index) => {
    const used = input.usedBy.get(wayspot.id);
    if (used !== undefined) historyServers.set(index, used);
  });
  return upgradeLinks({ ...asGyms(input), historyServers, servers: input.servers }).map((link) => ({
    id: input.wayspots[link.gymId]!.id,
    guildId: link.guildId,
  }));
}
