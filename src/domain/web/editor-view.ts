import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { boxOf, grownBox, inBox, type Box } from '@pine/wayspot-core/region-membership';
import type { ServerChannel } from '../regions/region-import.js';
import { regionVersion } from '../regions/version.js';
import type { EditorData, EditorWayspotKind, Point } from './editor-data.js';

/**
 * What the region editor loads (`GET /s/<guild>/api/regions/edit`, plan 8M-2), but for who is
 * asking: the server's regions with their versions, other servers' regions near them, its gyms
 * and Wayspots around them, and the text channels a new region may take. Pure: the caller gives
 * every region, the server's channels as the bot sees them, the server's gyms with where they
 * lie, and the kept Wayspots.
 */

/** How far around the server's regions the editor shows what lies outside them. */
export const REACH_METRES = 2_000;

export interface EditorInput {
  /** The row of the server (`Guild.id`); undefined while it has none. */
  guildRow: number | undefined;
  /** Every region, of any server. */
  regions: readonly {
    id: number;
    guildId: number | null;
    channelId: string;
    description: string | null;
    bounds: readonly LatLon[] | null;
  }[];
  /** The server's channels; undefined when the bot does not know the server. */
  channels: readonly ServerChannel[] | undefined;
  /** The server's gyms (plan 19B-2: its view, `GymDirectory.of`); another server's are none. */
  gyms: readonly { id: number; name: string; lat: number; lon: number }[];
  /** The channels of the server's regions a gym lies in (its view's `regionsOf`). */
  regionsOf(gymId: number): readonly string[];
  /** Every kept Wayspot. */
  wayspots: readonly { kind: EditorWayspotKind; lat: number; lon: number; title: string }[];
  /**
   * Whether another server's regions are shown, by its row (plan 19C-4): only those of a server
   * the web serves and lists (`webServers`' `listed`: not one Pine left, nor one being deleted,
   * nor one in setup). A region of no server is never shown.
   */
  othersShown(guildRow: number): boolean;
}

/** What the editor loads but for who is asking. */
export type EditorView = Omit<EditorData, 'guild' | 'userId' | 'readOnly' | 'mayManageChannels'>;

const six = (value: number): number => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
};
const points = (outline: readonly LatLon[]): Point[] =>
  outline.map(({ lat, lon }) => [six(lat), six(lon)]);

/** The smallest box that holds these boxes. */
function joined(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;
  return {
    south: Math.min(...boxes.map((box) => box.south)),
    north: Math.max(...boxes.map((box) => box.north)),
    west: Math.min(...boxes.map((box) => box.west)),
    east: Math.max(...boxes.map((box) => box.east)),
  };
}

const meet = (a: Box, b: Box): boolean =>
  a.south <= b.north && b.south <= a.north && a.west <= b.east && b.west <= a.east;

/**
 * The editor's view of a server. Its regions by id, named by their channels as the bot sees
 * them (`Region <id>` when the channel is gone), with the category their channel is in and
 * their version. Around them, the box of their outlines grown by `REACH_METRES` (nothing around
 * a server without outlines): other servers' regions whose boxes meet it, by their outlines
 * alone (no name, no channel, no server), of the servers shown (`othersShown`); the server's gyms in none of its regions and the kept Wayspots inside it. The gyms in
 * its regions wherever they are. The text channels of the server that are no region of any
 * server.
 * Places at six decimals.
 */
export function editorView(input: EditorInput): EditorView {
  const { guildRow } = input;
  const channels = input.channels ?? [];
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const own = input.regions
    .filter((region) => guildRow !== undefined && region.guildId === guildRow)
    .sort((a, b) => a.id - b.id);
  const regions = own.map((region) => {
    const channel = byId.get(region.channelId);
    const category = channel?.categoryId == null ? undefined : byId.get(channel.categoryId);
    return {
      id: region.id,
      channelId: region.channelId,
      name: channel?.name ?? `Region ${region.id}`,
      category: category?.name ?? null,
      description: region.description,
      outline: region.bounds === null ? null : points(region.bounds),
      version: regionVersion(region.bounds, region.description),
    };
  });
  const box = joined(own.flatMap((region) => (region.bounds ? [boxOf(region.bounds)] : [])));
  const reach = box && grownBox(box, REACH_METRES);
  const ownChannels = new Set(own.map((region) => region.channelId));
  const others = reach
    ? input.regions
        .filter(
          (region): region is typeof region & { bounds: readonly LatLon[] } =>
            !ownChannels.has(region.channelId) &&
            region.guildId !== null &&
            region.guildId !== guildRow &&
            input.othersShown(region.guildId) &&
            region.bounds !== null &&
            meet(reach, boxOf(region.bounds)),
        )
        .sort((a, b) => a.id - b.id)
        .map((region) => ({ id: region.id, outline: points(region.bounds) }))
    : [];
  const gyms = input.gyms
    .filter((gym) => {
      const inside = input.regionsOf(gym.id);
      if (inside.some((channelId) => ownChannels.has(channelId))) return true;
      return inside.length === 0 && reach !== undefined && inBox(reach, gym);
    })
    .sort((a, b) => a.id - b.id)
    .map((gym): [number, number, number, string] => [gym.id, six(gym.lat), six(gym.lon), gym.name]);
  const wayspots = reach
    ? input.wayspots
        .filter((wayspot) => inBox(reach, wayspot))
        .map((wayspot): [EditorWayspotKind, number, number, string] => [
          wayspot.kind,
          six(wayspot.lat),
          six(wayspot.lon),
          wayspot.title,
        ])
    : [];
  const regionChannels = new Set(input.regions.map((region) => region.channelId));
  return {
    regions,
    others,
    gyms,
    wayspots,
    channels: channels
      .filter((channel) => channel.kind === 'text' && !regionChannels.has(channel.id))
      .map((channel) => ({ id: channel.id, name: channel.name })),
  };
}
