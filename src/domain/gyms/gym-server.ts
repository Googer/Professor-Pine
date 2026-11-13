import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { gymsByRegion } from '@pine/wayspot-core/region-membership';

/** A gym belongs to a server (`GymServer`): the server named by its `Guild` row. */
export interface GymLink {
  gymId: number;
  guildId: number;
}

/** What the upgrade reads (migration 056). */
export interface UpgradeInput {
  /** Every gym; one without a place (invisible to the bot) lies in no region. */
  gyms: readonly { id: number; lat: number | null; lon: number | null }[];
  /** Every region, with the server it belongs to (null: none). */
  regions: readonly {
    guildId: number | null;
    channelId: string;
    bounds: readonly LatLon[] | null;
  }[];
  /** The servers whose party history used a gym (its raids and train stops), by gym. */
  historyServers: ReadonlyMap<number, readonly number[]>;
  /** Every server recorded (`Guild` rows). */
  servers: readonly number[];
}

/**
 * The servers whose regions hold each gym that lies in one (by the rule the gym search sorts gyms
 * into regions by, `gymsByRegion`: the region's own gyms, not its neighbours'); a region of no
 * server holds nothing.
 */
function regionServers(
  input: Pick<UpgradeInput, 'gyms' | 'regions'>,
): ReadonlyMap<number, ReadonlySet<number>> {
  // The server of each channel's first region, as `gymsByRegion` takes the first.
  const serverOf = new Map<string, number | null>();
  for (const region of input.regions) {
    if (!serverOf.has(region.channelId)) serverOf.set(region.channelId, region.guildId);
  }
  const placed = input.gyms.flatMap((gym) =>
    gym.lat === null || gym.lon === null ? [] : [{ id: gym.id, lat: gym.lat, lon: gym.lon }],
  );
  const byGym = new Map<number, Set<number>>();
  for (const [channelId, membership] of gymsByRegion(input.regions, placed)) {
    const server = serverOf.get(channelId);
    if (server === null || server === undefined) continue;
    for (const gymId of membership.local) {
      const servers = byGym.get(gymId) ?? new Set<number>();
      servers.add(server);
      byGym.set(gymId, servers);
    }
  }
  return byGym;
}

/**
 * The gyms in no region of any server (a gym without a place among them), in the order given:
 * the only gyms whose links the party history decides (`upgradeLinks`), so that the upgrade reads
 * the history of those gyms alone, by its gym index.
 */
export function gymsInNoRegion(input: Pick<UpgradeInput, 'gyms' | 'regions'>): number[] {
  const inRegions = regionServers(input);
  return input.gyms.filter((gym) => !inRegions.has(gym.id)).map((gym) => gym.id);
}

/**
 * The links the upgrade to 2.1 gives the gyms there are (plan 19B-2): each gym belongs to every
 * server whose regions hold it, by the rule the gym search sorts gyms into regions by
 * (`gymsByRegion`, the region's own gyms, not its neighbours'); a gym in no region of any
 * server, to the servers whose history used it (of those recorded); otherwise to every server
 * recorded. Nothing is copied: a gym of several servers stays one row they share. In the order
 * of the gyms, then of the servers.
 */
export function upgradeLinks(input: UpgradeInput): GymLink[] {
  const recorded = new Set(input.servers);
  const byGym = regionServers(input);
  return input.gyms.flatMap((gym) => {
    const inRegions = byGym.get(gym.id);
    const used = (input.historyServers.get(gym.id) ?? []).filter((server) => recorded.has(server));
    const servers =
      inRegions !== undefined
        ? [...inRegions]
        : used.length > 0
          ? [...new Set(used)]
          : [...recorded];
    return servers.sort((a, b) => a - b).map((guildId) => ({ gymId: gym.id, guildId }));
  });
}
