import { plainDescription, type KmlArea } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { tidyOutline, type OutlineProblem } from '@pine/wayspot-core/outline';
import type { SaveRequest } from '../web/editor-data.js';
import type { Outlined } from './coverage.js';
import {
  channelKey,
  channelNameFor,
  MAX_CHANNEL_NAME,
  type ServerChannel,
} from './region-import.js';
import { normalisedOutline, regionVersion } from './version.js';

/**
 * What a save of the region editor asks for, made into what `/region import` and `/region
 * remove` do (plan 8M-2): the areas of an import, named so that `planImport` finds their
 * channels, and the removals; and what keeps it from being done. Pure: the caller gives the
 * regions and the server's channels as they are now, and never trusts the page.
 */

/** A region as the plan needs it. */
export interface SaveRegion {
  id: number;
  guildId: number | null;
  channelId: string;
  description: string | null;
  bounds: readonly LatLon[] | null;
}

/** What a save asks for that cannot be: none of it is done then. */
export type SaveProblem =
  /** A region is changed or removed twice in one save. */
  | { kind: 'twice'; regionId: number }
  /**
   * A changed region's channel is gone: its outline goes to a channel by name, and the name it
   * had would make a new channel.
   */
  | { kind: 'channel-gone'; regionId: number }
  /** An outline that cannot be a region's (`tidyOutline`). */
  | {
      kind: 'outline';
      target: { regionId: number } | { addition: number };
      problem: OutlineProblem;
    }
  /** A new region on a channel that is a region already. */
  | { kind: 'already-region'; addition: number; name: string }
  /** A new region on what is no ordinary text channel of the server. */
  | { kind: 'not-a-channel'; addition: number }
  /** A new channel whose name gives no channel name. */
  | { kind: 'no-name'; addition: number }
  /**
   * A new channel named as a channel the server has (by `channelKey`; categories aside), which
   * the import would take instead of making one. `listed`: it is a text channel that is no
   * region, which the page offers to pick.
   */
  | { kind: 'channel-exists'; addition: number; name: string; listed: boolean }
  /** A new channel's name longer than `MAX_NEW_CHANNEL_NAME` (`length` characters). */
  | { kind: 'name-too-long'; addition: number; length: number }
  /** A new channel's category longer than `MAX_NEW_CATEGORY` (`length` characters). */
  | { kind: 'category-too-long'; addition: number; length: number };

/** The longest name of a new channel the editor takes: Discord's longest channel name. */
export const MAX_NEW_CHANNEL_NAME = MAX_CHANNEL_NAME;
/** The longest category (a description, as a KML file has it) of a new channel it takes. */
export const MAX_NEW_CATEGORY = 200;

export interface SavePlan {
  /** The areas to import: changed outlines first (by their channels' names), then new ones. */
  areas: KmlArea[];
  /** The key of each area in `after` (`r<id>` or `a<i>`), by its place in `areas`. */
  areaKeys: string[];
  removals: { regionId: number; forum: 'keep' | 'delete' }[];
  /**
   * The regions changed (`gone: false`) or removed (`gone: true`; or never this server's) since
   * the page loaded them: their versions differ from what the page sent.
   */
  conflicts: { regionId: number; gone: boolean }[];
  problems: SaveProblem[];
  /** The server's outlines now (`r<id>`), for the check of new overlaps and gaps. */
  before: Outlined[];
  /** Its outlines after the save: `r<id>` for its regions, `a<i>` for the i-th addition. */
  after: Outlined[];
}

/** Points as places, as the editor keeps outlines (`normalisedOutline`). */
const toLatLons = (points: readonly [number, number][]): LatLon[] =>
  normalisedOutline(points.map(([lat, lon]) => ({ lat, lon })));

/**
 * The category a new channel is created in, as the page sent it: read as a file's description
 * is (`plainDescription`); none when nothing is left, and the import names it after the channel.
 */
function categoryOf(description: string | null): string | null {
  const text = description === null ? '' : plainDescription(description);
  return text === '' ? null : text;
}

/**
 * The plan of a save. A region changed or removed must be the server's, with the version the
 * page loaded (else a conflict); a changed region's channel must still be there. A new region
 * goes to a text channel of the server that is no region (by id: named so that `planImport`
 * finds it), or to a new channel of the name given, which no channel of the server may have
 * (whose category its description names, `categoryOf`), neither longer than the page takes
 * (`MAX_NEW_CHANNEL_NAME`, `MAX_NEW_CATEGORY`). Every outline is taken at six decimals
 * (`normalisedOutline`) and tidied as an import tidies it.
 */
export function planSave(
  request: SaveRequest,
  server: { guildId: number; regions: readonly SaveRegion[]; channels: readonly ServerChannel[] },
): SavePlan {
  const { guildId, regions, channels } = server;
  const own = regions.filter((region) => region.guildId === guildId);
  const ownById = new Map(own.map((region) => [region.id, region]));
  const text = new Map(
    channels.filter((channel) => channel.kind === 'text').map((channel) => [channel.id, channel]),
  );
  const areas: KmlArea[] = [];
  const areaKeys: string[] = [];
  const problems: SaveProblem[] = [];
  const conflicts: SavePlan['conflicts'] = [];
  const seen = new Set<number>();
  const replaced = new Map<number, LatLon[]>();

  const check = (regionId: number, version: string): SaveRegion | undefined => {
    if (seen.has(regionId)) {
      problems.push({ kind: 'twice', regionId });
      return undefined;
    }
    seen.add(regionId);
    const region = ownById.get(regionId);
    if (!region) {
      conflicts.push({ regionId, gone: true });
      return undefined;
    }
    if (regionVersion(region.bounds, region.description) !== version) {
      conflicts.push({ regionId, gone: false });
    }
    return region;
  };

  for (const change of request.changes) {
    const region = check(change.regionId, change.version);
    if (!region) continue;
    const channel = text.get(region.channelId);
    if (!channel) {
      problems.push({ kind: 'channel-gone', regionId: region.id });
      continue;
    }
    const outline = tidyOutline(toLatLons(change.outline));
    if (!outline.ok) {
      problems.push({ kind: 'outline', target: { regionId: region.id }, problem: outline.problem });
      continue;
    }
    replaced.set(region.id, outline.ring);
    areas.push({ name: channel.name, description: null, outline: outline.ring, holes: false });
    areaKeys.push(`r${region.id}`);
  }
  const removals: SavePlan['removals'] = [];
  for (const removal of request.removals) {
    const region = check(removal.regionId, removal.version);
    if (region) removals.push({ regionId: region.id, forum: removal.forum });
  }
  const added: Outlined[] = [];
  request.additions.forEach((addition, index) => {
    let name: string;
    if ('id' in addition.channel) {
      const channel = text.get(addition.channel.id);
      if (!channel) {
        problems.push({ kind: 'not-a-channel', addition: index });
        return;
      }
      if (regions.some((region) => region.channelId === channel.id)) {
        problems.push({ kind: 'already-region', addition: index, name: channel.name });
        return;
      }
      name = channel.name;
    } else {
      const { length } = addition.channel.name.trim();
      if (length > MAX_NEW_CHANNEL_NAME) {
        problems.push({ kind: 'name-too-long', addition: index, length });
        return;
      }
      const category = addition.description?.length ?? 0;
      if (category > MAX_NEW_CATEGORY) {
        problems.push({ kind: 'category-too-long', addition: index, length: category });
        return;
      }
      const key = channelNameFor(addition.channel.name);
      if (key === '') {
        problems.push({ kind: 'no-name', addition: index });
        return;
      }
      const namesake = channels.find(
        (channel) => channel.kind !== 'category' && channelKey(channel.name) === key,
      );
      if (namesake) {
        problems.push({
          kind: 'channel-exists',
          addition: index,
          name: namesake.name,
          listed:
            namesake.kind === 'text' && !regions.some((region) => region.channelId === namesake.id),
        });
        return;
      }
      name = addition.channel.name;
    }
    const outline = tidyOutline(toLatLons(addition.outline));
    if (!outline.ok) {
      problems.push({ kind: 'outline', target: { addition: index }, problem: outline.problem });
      return;
    }
    areas.push({
      name,
      description: 'id' in addition.channel ? null : categoryOf(addition.description),
      outline: outline.ring,
      holes: false,
    });
    areaKeys.push(`a${index}`);
    added.push({ key: `a${index}`, outline: outline.ring });
  });

  const removed = new Set(removals.map((removal) => removal.regionId));
  const before = own.flatMap((region) =>
    region.bounds === null ? [] : [{ key: `r${region.id}`, outline: region.bounds }],
  );
  const after = [
    ...own.flatMap((region) => {
      if (removed.has(region.id)) return [];
      const outline = replaced.get(region.id) ?? region.bounds;
      return outline === null ? [] : [{ key: `r${region.id}`, outline }];
    }),
    ...added,
  ];
  return { areas, areaKeys, removals, conflicts, problems, before, after };
}

/**
 * The server's outlines after a save as the import will write them: the areas the import
 * leaves out (`leftOut`, by name, as `planImport` names them) are not written, so a changed
 * region keeps the outline it has and a new one is none; the removals stay. `plan.after` itself
 * when nothing is left out.
 */
export function outlinesWritten(plan: SavePlan, leftOut: ReadonlySet<string>): Outlined[] {
  const dropped = new Set(
    plan.areas.flatMap((area, index) => (leftOut.has(area.name) ? [plan.areaKeys[index]] : [])),
  );
  if (dropped.size === 0) return plan.after;
  const before = new Map(plan.before.map((one) => [one.key, one]));
  return plan.after.flatMap((one) => {
    if (!dropped.has(one.key)) return [one];
    const kept = before.get(one.key);
    return kept ? [kept] : [];
  });
}
