import type { KmlArea } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { distance } from 'fastest-levenshtein';
import { containment } from '@pine/wayspot-core/region-membership';

/** How long Discord lets the name of a channel or a category be. */
export const MAX_CHANNEL_NAME = 100;

/**
 * The channel name the name of an area stands for, by the legacy bot's rule, so that old files
 * keep working: lower case, white space to hyphens, everything but letters, digits, `_` and `-`
 * removed (a leading `#` goes with that). Letters and digits of any script stay: Discord's
 * channel names may have them. Beyond the legacy rule, runs of hyphens become one and hyphens
 * at the ends go ("Mt. Lebanon / Dormont" is `mt-lebanon-dormont`), so that the name is one a
 * channel can be created with. Empty when nothing of the name is left.
 */
export function channelNameFor(areaName: string): string {
  const name = areaName
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s/gu, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-{2,}/gu, '-')
    .replace(/^-|-$/gu, '');
  return [...name].slice(0, MAX_CHANNEL_NAME).join('').replace(/-$/u, '');
}

/**
 * By what the name of an area and the name of a channel are compared: `channelNameFor` of
 * either. So a channel whose name has more than the rule keeps (an emoji in front) is still
 * found by the name without it, and the name of a channel always stands for that channel.
 */
export function channelKey(name: string): string {
  return channelNameFor(name);
}

/**
 * The category a new channel for an area goes into: the area's description, or else its name
 * without a leading `#` (the legacy rule), cut to what Discord takes. Null when neither says
 * anything.
 */
export function categoryNameFor(area: Pick<KmlArea, 'name' | 'description'>): string | null {
  const wanted = (area.description ?? area.name.trim().replace(/^#/u, '')).trim();
  const name = [...wanted].slice(0, MAX_CHANNEL_NAME).join('').trim();
  return name === '' ? null : name;
}

/**
 * How many channels one import creates at most. Every channel is a few requests to Discord
 * (its category, the channel, then its forum), and the answer to the press of Import must come
 * within the quarter of an hour Discord keeps an interaction open: the areas after these wait
 * for the next import of the same file, in which what was done comes out unchanged.
 */
export const MAX_NEW_CHANNELS = 25;

/** How many channels (forums included) Discord lets a category hold. */
export const MAX_CATEGORY_CHANNELS = 50;
/** How many channels (forums and categories included, threads not) Discord lets a server hold. */
export const MAX_SERVER_CHANNELS = 500;
/** How far the name of a new channel may be from another name to be asked about. */
const NEAR_MISS = 2;

/** By what two category names are the same: without case. */
export const categoryKey = (name: string): string => name.normalize('NFC').toLowerCase();

/** A channel of the server as the plan needs it. `other`: voice, announcements, a stage. */
export interface ServerChannel {
  id: string;
  name: string;
  kind: 'text' | 'category' | 'forum' | 'other';
  /** The category it is in. */
  categoryId: string | null;
}

/** A region as the plan needs it. */
export interface PlannedRegion {
  id: number;
  guildId: number | null;
  channelId: string;
  forumChannelId: string | null;
  bounds: readonly LatLon[] | null;
}

export interface ImportInput {
  areas: readonly KmlArea[];
  /** Every channel of the server, in the order the oldest of a name should win. */
  channels: readonly ServerChannel[];
  /** Every region, of any server: one of another server on a channel here is not touched. */
  regions: readonly PlannedRegion[];
  /** The row of the server (`Guild.id`). */
  guildId: number;
  gyms: readonly { id: number; lat: number; lon: number }[];
  /** The active raids: the region each is in and its gym. */
  raids: readonly { regionId: number | null; gymId: number | null }[];
  /** Whether the bot may create channels in the server. */
  mayCreate: boolean;
  /**
   * Whether the staff member may (Manage Channels): the bot creates for them only what they
   * could create by hand. True unless said otherwise.
   */
  staffMayCreate?: boolean;
  /** `/region import` with a channel: the one channel that gets an outline. Nothing is created. */
  target?: { id: string; name: string };
  /**
   * The forums of the server that parties name and no region has (`PartyService.orphanForums`):
   * those of regions that were removed, kept as history. A region that would get a forum takes
   * such a forum back instead, when it is the one forum of that kind in its channel's category
   * named as its forum would be (`forumSuffix`).
   */
  orphanForums?: readonly string[];
  /** What the name of a region's forum adds to the name of its channel (`regionForumSuffix`). */
  forumSuffix?: string;
  /**
   * Regions of this server removed together with the import (the region editor's save): they
   * keep no gym afterwards, so their gyms count among those left in no region.
   */
  removing?: readonly number[];
}

/**
 * The category of a channel that is to be created: one that exists, or one to create. An
 * overflow category (`<name> 2` …), new or one that exists, names the category it continues
 * (`like`, by id): a new one is made with that category's permissions, right after it, and so is
 * one that exists if it is deleted before the import (plan 8S-4).
 */
export type PlannedCategory =
  { id: string; name: string; like?: string } | { create: string; like?: string } | null;

/** Where an area goes: a channel that exists, or one to create. */
export type PlannedChannel = { id: string } | { create: { category: PlannedCategory } };

/** An area that would be imported. */
export interface PlannedImport {
  /** The name of the area in the file. */
  name: string;
  /** The channel name it stands for (for a given channel: that channel's name). */
  channelName: string;
  channel: PlannedChannel;
  outline: LatLon[];
  /** The region of the channel whose outline is replaced; null for a new region. */
  regionId: number | null;
  /** Whether that region has a forum that is still there (a forum deleted by hand is none). */
  hasForum: boolean;
  /**
   * For a region without a forum: the forum it takes back instead of getting a new one, the
   * forum of a removed region of that channel (`ImportInput.orphanForums`).
   */
  adoptForum?: { id: string; name: string };
  /** How many gyms lie in the outline. */
  gyms: number;
  /** How many lie in the outline it replaces; null for a new region or one without an outline. */
  gymsBefore: number | null;
  /** How many gyms of the replaced outline would lie in no region of this server any more. */
  stranded: number;
  /** Whether the area had holes, which are ignored. */
  holes: boolean;
  /** Whether the outline is exactly the one the region has now. */
  unchanged: boolean;
  /**
   * For a channel that would be created: the name of a text channel of the server, or of the
   * channel of another area of the file, that is within two letters of its name. A typo in the
   * file would make a second channel; this is what it may have meant.
   */
  nearMiss?: string;
  /**
   * For a region that is one already and has no forum: why it keeps none for now (plan 8S-4),
   * its channel's category full (`category`, its name) or the server (`server`). Its outline
   * is written all the same; the forum is tried again (`/admin setup-forums`) once there is room.
   */
  forumBlocked?: { category: string } | { server: true };
}

/**
 * Why an area is left out. `no-name`: its name gives no channel name; `several-channels`:
 * several text channels have that name; `several-areas`: several areas of the file stand for
 * one channel; `not-text`: the name is that of a channel that is no ordinary text channel;
 * `foreign`: the channel is the region of another server; `cannot-create`: no channel has the
 * name and the bot may not create one; `other-channel`: the import is for one channel, and this
 * area stands for another; `waits`: its channel would be created, but this import creates
 * `MAX_NEW_CHANNELS` already; `not-allowed`: no channel has the name, and the staff member may
 * not create channels (`staffMayCreate`); `category-full`: its channel exists, is no region yet
 * and would get a forum, which goes where the channel is, and the channel's category
 * (`LeftOut.category`) has no room for it; `server-full`: what it needs created (its channel, its
 * forum, its category) would take the server beyond `MAX_SERVER_CHANNELS`.
 */
export type LeftOutReason =
  | 'no-name'
  | 'several-channels'
  | 'several-areas'
  | 'not-text'
  | 'foreign'
  | 'cannot-create'
  | 'other-channel'
  | 'waits'
  | 'not-allowed'
  | 'category-full'
  | 'server-full';

export interface LeftOut {
  name: string;
  channelName: string;
  reason: LeftOutReason;
  /** With `category-full`: the name of the full category. */
  category?: string;
}

/**
 * A category that had no room for all the new channels the file names it for, so that some of
 * them go into its overflow categories (`<name> 2`, `<name> 3` …): its name, how many places
 * (channels and forums) it had left for them, how many new channels go elsewhere, and where.
 */
export interface Overflow {
  category: string;
  /** The places it had before this import, `forums` of them taken by its regions' new forums. */
  room: number;
  forums: number;
  channels: number;
  into: string[];
}

export interface ImportPlan {
  imports: PlannedImport[];
  leftOut: LeftOut[];
  /** The names of the channels that would be created, in the order of the file. */
  newChannels: string[];
  /** The names of the categories that would be created, each once. */
  newCategories: string[];
  /** How many gyms lie in a region of this server now and would lie in none afterwards. */
  stranded: number;
  /** How many active raids of a changed region are at a gym that would lie outside it. */
  raidsOutside: number;
  /**
   * How many forums would be made: one for every region written that has none and takes none
   * back.
   */
  newForums: number;
  /**
   * The categories some new channels do not go into for lack of room (`MAX_CATEGORY_CHANNELS`,
   * forums included), and where they go instead.
   */
  overflow: Overflow[];
  /**
   * With a `target`: none of several areas stands for the channel, or several do. Nothing
   * is imported then.
   */
  problem?: 'none-for-channel' | 'several-for-channel';
}

/** Whether two outlines are the very same ring. */
function sameRing(a: readonly LatLon[] | null, b: readonly LatLon[]): boolean {
  return (
    a !== null &&
    a.length === b.length &&
    a.every((point, i) => point.lat === b[i]?.lat && point.lon === b[i]?.lon)
  );
}

/**
 * An area with the channel it goes to, before the counts. A channel to create has its category
 * decided once the room of the categories is known (`wanted`: the name its area gives).
 */
interface Placed {
  area: KmlArea;
  channelName: string;
  channel: PlannedChannel;
  wanted?: string | null;
}

/**
 * The name of the `n`th category of a name (`n` from 2): `<name> n`, the name cut to keep it
 * within what Discord takes.
 */
function overflowName(name: string, n: number): string {
  const suffix = ` ${n}`;
  return `${[...name]
    .slice(0, MAX_CHANNEL_NAME - suffix.length)
    .join('')
    .trimEnd()}${suffix}`;
}

/**
 * What an import of these areas into this server would do, without doing any of it: which
 * area becomes the outline of which channel, which channels and categories would be created
 * for the names no channel has, what is left out and why, and what the new outlines mean for
 * the gyms. Pure: the caller gives the server's channels, the regions, the gyms and the raids
 * as they are now, and shows or carries out what comes back.
 *
 * An area goes to the text channel whose name its name stands for (`channelKey` of both). Two
 * such channels, two areas for one channel, a namesake that is no text channel: left out.
 * No channel of the name: one is planned, in the category `categoryNameFor` names (one that
 * exists, without case, or a new one, which areas of one category share), unless the bot may
 * not create channels; of more than `MAX_NEW_CHANNELS` the later ones wait. With `target` the
 * file is for that one channel: its only area, or the
 * one area whose name stands for the channel; nothing is created.
 *
 * Every region written that has no forum gets one, where its channel is, and Discord allows
 * `MAX_CATEGORY_CHANNELS` channels and forums in a category and `MAX_SERVER_CHANNELS` in a
 * server. The forums of channels that exist take their room first: one whose category is full
 * would make a new region without a forum, so it leaves its area out (`category-full`; a forum in
 * another category would not have the channel's permissions); a region that is one already gets
 * its outline, its forum `forumBlocked` until there is room. A new channel whose category has no
 * room for it and its forum goes into the overflow category `<name> 2` (then `<name> 3` …): one
 * of that name that exists and has room, or a new one (`like` the category it continues), which
 * the areas after it share (`ImportPlan.overflow`). What would take the server beyond its
 * channels is left out (`server-full`), or, for a region already, blocks its forum.
 */
export function planImport(input: ImportInput): ImportPlan {
  const { areas, channels, regions, guildId, gyms, raids, target } = input;
  const leftOut: LeftOut[] = [];
  const placed: Placed[] = [];
  let problem: ImportPlan['problem'];

  if (target) {
    const named = areas.filter((area) => channelKey(area.name) === channelKey(target.name));
    const [only] = areas.length === 1 ? areas : named;
    if (areas.length !== 1 && named.length !== 1) {
      problem = named.length === 0 ? 'none-for-channel' : 'several-for-channel';
    } else if (only) {
      placed.push({ area: only, channelName: target.name, channel: { id: target.id } });
      for (const area of areas) {
        if (area === only) continue;
        leftOut.push({
          name: area.name,
          channelName: channelNameFor(area.name),
          reason: 'other-channel',
        });
      }
    }
  } else {
    const byKey = new Map<string, ServerChannel[]>();
    for (const channel of channels) {
      if (channel.kind === 'category') continue;
      const key = channelKey(channel.name);
      byKey.set(key, [...(byKey.get(key) ?? []), channel]);
    }
    const areasOf = new Map<string, number>();
    for (const area of areas) {
      const key = channelNameFor(area.name);
      areasOf.set(key, (areasOf.get(key) ?? 0) + 1);
    }
    let creating = 0;
    for (const area of areas) {
      const channelName = channelNameFor(area.name);
      const leave = (reason: LeftOutReason): void => {
        leftOut.push({ name: area.name, channelName, reason });
      };
      if (channelName === '') {
        leave('no-name');
        continue;
      }
      if ((areasOf.get(channelName) ?? 0) > 1) {
        leave('several-areas');
        continue;
      }
      const namesakes = byKey.get(channelName) ?? [];
      const texts = namesakes.filter((channel) => channel.kind === 'text');
      const [channel] = texts;
      if (texts.length > 1) {
        leave('several-channels');
      } else if (channel) {
        placed.push({ area, channelName: channel.name, channel: { id: channel.id } });
      } else if (namesakes.length > 0) {
        leave('not-text');
      } else if (!input.mayCreate) {
        leave('cannot-create');
      } else if (input.staffMayCreate === false) {
        leave('not-allowed');
      } else if (creating >= MAX_NEW_CHANNELS) {
        leave('waits');
      } else {
        creating++;
        placed.push({
          area,
          channelName,
          channel: { create: { category: null } },
          wanted: categoryNameFor(area),
        });
      }
    }
  }

  // The regions of this server as they are, and which of them get another outline.
  const own = regions.filter((region) => region.guildId === guildId);
  const imports: PlannedImport[] = [];
  let accepted: { placed: Placed; region: PlannedRegion | undefined }[] = [];
  for (const one of placed) {
    const channelId = 'id' in one.channel ? one.channel.id : undefined;
    const region =
      channelId === undefined ? undefined : regions.find((row) => row.channelId === channelId);
    if (region && region.guildId !== guildId) {
      leftOut.push({ name: one.area.name, channelName: one.channelName, reason: 'foreign' });
      continue;
    }
    accepted.push({ placed: one, region });
  }

  // The forums that are there, by id: a region whose forum was deleted by hand has none.
  const forums = new Map(
    channels.filter((channel) => channel.kind === 'forum').map((forum) => [forum.id, forum]),
  );
  const orphans = (input.orphanForums ?? []).flatMap((id) => {
    const forum = forums.get(id);
    return forum ? [forum] : [];
  });
  /** The one forum of a removed region in this category that a channel would take back. */
  const adoptIn = (
    categoryId: string | null,
    channelName: string,
  ): { id: string; name: string } | undefined => {
    const wanted = channelKey(`${channelName}${input.forumSuffix ?? ''}`);
    const fitting = orphans.filter(
      (forum) => forum.categoryId === categoryId && channelKey(forum.name) === wanted,
    );
    const [only] = fitting;
    return fitting.length === 1 && only ? { id: only.id, name: only.name } : undefined;
  };
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  /** The one forum of a removed region that the channel of `one` would take back. */
  const forumToAdopt = (one: Placed): { id: string; name: string } | undefined => {
    if ('id' in one.channel) {
      return adoptIn(byId.get(one.channel.id)?.categoryId ?? null, one.channelName);
    }
    const { category } = one.channel.create;
    // A category this import creates holds no forum yet.
    if (category !== null && 'create' in category) return undefined;
    return adoptIn(category?.id ?? null, one.channelName);
  };
  const hasForumNow = (region: PlannedRegion | undefined): boolean =>
    region?.forumChannelId != null && forums.has(region.forumChannelId);

  // The room of every category and of the server, as the channels created and the forums made
  // take it.
  const inCategory = new Map<string, number>();
  for (const channel of channels) {
    if (channel.kind !== 'category' && channel.categoryId !== null) {
      inCategory.set(channel.categoryId, (inCategory.get(channel.categoryId) ?? 0) + 1);
    }
  }
  const roomIn = (categoryId: string): number =>
    MAX_CATEGORY_CHANNELS - (inCategory.get(categoryId) ?? 0);
  const take = (categoryId: string, places: number): void => {
    inCategory.set(categoryId, (inCategory.get(categoryId) ?? 0) + places);
  };
  let inServer = channels.length;
  const dropped = new Set<Placed>();
  const drop = (one: Placed, reason: LeftOutReason, category?: string): void => {
    dropped.add(one);
    leftOut.push({
      name: one.area.name,
      channelName: one.channelName,
      reason,
      ...(category === undefined ? {} : { category }),
    });
  };

  // First the forums of channels that exist: they cannot go anywhere else. A region that is one
  // already is written without it (its forum blocked); a new one is left out.
  const blocked = new Map<Placed, NonNullable<PlannedImport['forumBlocked']>>();
  /** How many places the forums of channels that exist take in each category. */
  const forumsIn = new Map<string, number>();
  const roomAtStart = new Map([...inCategory.keys()].map((id) => [id, roomIn(id)]));
  for (const { placed: one, region } of accepted) {
    if (!('id' in one.channel) || hasForumNow(region) || forumToAdopt(one)) continue;
    const categoryId = byId.get(one.channel.id)?.categoryId ?? null;
    if (categoryId !== null && roomIn(categoryId) < 1) {
      const category = byId.get(categoryId)?.name ?? '';
      if (region) blocked.set(one, { category });
      else drop(one, 'category-full', category);
    } else if (inServer + 1 > MAX_SERVER_CHANNELS) {
      if (region) blocked.set(one, { server: true });
      else drop(one, 'server-full');
    } else {
      if (categoryId !== null) {
        take(categoryId, 1);
        forumsIn.set(categoryId, (forumsIn.get(categoryId) ?? 0) + 1);
      }
      inServer += 1;
    }
  }

  // Then the channels to create, in the order of the file, each with its forum.
  const categories = channels.filter((channel) => channel.kind === 'category');
  /** The categories that would be created, by key: areas of one category share it. */
  const newCategory = new Map<string, { name: string; holds: number; like?: string }>();
  const overflows = new Map<string, Overflow>();
  /**
   * How much room the categories of a name had before this import, and how much of it the
   * forums of their regions take: what overflow says.
   */
  const roomBefore = new Map<string, { room: number; forums: number }>();
  for (const { placed: one } of accepted) {
    const { wanted } = one;
    if (wanted === undefined) continue;
    if (wanted === null) {
      const places = forumToAdopt(one) ? 1 : 2;
      if (inServer + places > MAX_SERVER_CHANNELS) drop(one, 'server-full');
      else inServer += places;
      continue;
    }
    const baseKey = categoryKey(wanted);
    const base =
      categories.find((candidate) => categoryKey(candidate.name) === baseKey)?.name ??
      newCategory.get(baseKey)?.name ??
      wanted;
    const baseCategories = categories.filter(
      (candidate) => categoryKey(candidate.name) === baseKey,
    );
    if (!roomBefore.has(baseKey)) {
      roomBefore.set(
        baseKey,
        baseCategories.length > 0
          ? {
              room: baseCategories.reduce(
                (sum, candidate) => sum + (roomAtStart.get(candidate.id) ?? MAX_CATEGORY_CHANNELS),
                0,
              ),
              forums: baseCategories.reduce(
                (sum, candidate) => sum + (forumsIn.get(candidate.id) ?? 0),
                0,
              ),
            }
          : { room: MAX_CATEGORY_CHANNELS - (newCategory.get(baseKey)?.holds ?? 0), forums: 0 },
      );
    }
    let chosen: { category: PlannedCategory; name: string } | 'server-full' | undefined;
    for (let n = 1; chosen === undefined; n++) {
      const name = n === 1 ? base : overflowName(base, n);
      const key = categoryKey(name);
      const named = categories.filter((candidate) => categoryKey(candidate.name) === key);
      for (const candidate of named) {
        const places = adoptIn(candidate.id, one.channelName) ? 1 : 2;
        if (roomIn(candidate.id) < places) continue;
        if (inServer + places > MAX_SERVER_CHANNELS) {
          chosen = 'server-full';
        } else {
          take(candidate.id, places);
          inServer += places;
          // An overflow category that exists names the one it continues too: deleted before
          // the import, it is made again as that one's continuation (plan 8S-4).
          const like = n > 1 ? baseCategories[0]?.id : undefined;
          chosen = {
            category: {
              id: candidate.id,
              name: candidate.name,
              ...(like === undefined ? {} : { like }),
            },
            name: candidate.name,
          };
        }
        break;
      }
      if (chosen !== undefined || named.length > 0) continue;
      const planned = newCategory.get(key);
      if (planned && MAX_CATEGORY_CHANNELS - planned.holds < 2) continue;
      // A new category holds no forum to take back: the channel and its forum, and the
      // category itself when it is the first channel in it.
      const places = planned ? 2 : 3;
      if (inServer + places > MAX_SERVER_CHANNELS) {
        chosen = 'server-full';
      } else {
        inServer += places;
        // An overflow of a category that exists continues it: its permissions, its place.
        const like = n > 1 ? baseCategories[0]?.id : undefined;
        const made = planned ?? { name, holds: 0, ...(like === undefined ? {} : { like }) };
        made.holds += 2;
        newCategory.set(key, made);
        chosen = {
          category: {
            create: made.name,
            ...(made.like === undefined ? {} : { like: made.like }),
          },
          name: made.name,
        };
      }
    }
    if (chosen === 'server-full') {
      drop(one, 'server-full');
      continue;
    }
    one.channel = { create: { category: chosen.category } };
    if (categoryKey(chosen.name) !== baseKey) {
      const noted = overflows.get(baseKey) ?? {
        category: base,
        room: roomBefore.get(baseKey)?.room ?? 0,
        forums: roomBefore.get(baseKey)?.forums ?? 0,
        channels: 0,
        into: [],
      };
      noted.channels += 1;
      if (!noted.into.includes(chosen.name)) noted.into.push(chosen.name);
      overflows.set(baseKey, noted);
    }
  }
  accepted = accepted.filter(({ placed: one }) => !dropped.has(one));
  // Every outline is tested through its box first: outlines may have thousands of corners.
  const tests = new Map<readonly LatLon[], (point: LatLon) => boolean>();
  const contains = (outline: readonly LatLon[], point: LatLon): boolean => {
    let test = tests.get(outline);
    if (!test) {
      test = containment(outline);
      tests.set(outline, test);
    }
    return test(point);
  };
  const replaced = new Map<number, readonly LatLon[]>();
  for (const { placed: one, region } of accepted) {
    if (region) replaced.set(region.id, one.area.outline);
  }
  const removing = new Set(input.removing ?? []);
  const outlinesAfter: (readonly LatLon[])[] = [
    ...own.flatMap((region) => {
      if (removing.has(region.id)) return [];
      const bounds = replaced.get(region.id) ?? region.bounds;
      return bounds ? [bounds] : [];
    }),
    ...accepted.filter(({ region }) => !region).map(({ placed: one }) => one.area.outline),
  ];
  const keptAfter = (gym: LatLon): boolean =>
    outlinesAfter.some((outline) => contains(outline, gym));
  const within = (outline: readonly LatLon[]) => gyms.filter((gym) => contains(outline, gym));

  // The names a new channel may have been meant as: the server's text channels, and the
  // channels of the other areas.
  const known = [
    ...channels.filter((channel) => channel.kind === 'text').map((channel) => channel.name),
    ...accepted.map(({ placed: one }) => one.channelName),
  ];
  const nearMissOf = (name: string): string | undefined => {
    let best: { name: string; away: number } | undefined;
    for (const other of known) {
      if (channelKey(other) === channelKey(name)) continue;
      const away = distance(channelKey(other), channelKey(name));
      if (away <= NEAR_MISS && (!best || away < best.away)) best = { name: other, away };
    }
    return best?.name;
  };

  for (const { placed: one, region } of accepted) {
    const before = region?.bounds ? within(region.bounds) : undefined;
    const nearMiss = 'create' in one.channel ? nearMissOf(one.channelName) : undefined;
    const hasForum = hasForumNow(region);
    const adoptForum = hasForum ? undefined : forumToAdopt(one);
    const forumBlocked = blocked.get(one);
    imports.push({
      name: one.area.name,
      channelName: one.channelName,
      channel: one.channel,
      outline: one.area.outline,
      regionId: region?.id ?? null,
      hasForum,
      ...(adoptForum === undefined ? {} : { adoptForum }),
      gyms: within(one.area.outline).length,
      gymsBefore: before ? before.length : null,
      stranded: before ? before.filter((gym) => !keptAfter(gym)).length : 0,
      holes: one.area.holes,
      unchanged: sameRing(region?.bounds ?? null, one.area.outline),
      ...(nearMiss === undefined ? {} : { nearMiss }),
      ...(forumBlocked === undefined ? {} : { forumBlocked }),
    });
  }

  const inServerNow = (gym: LatLon): boolean =>
    own.some((region) => region.bounds !== null && contains(region.bounds, gym));
  const gymById = new Map(gyms.map((gym) => [gym.id, gym]));
  const raidsOutside = raids.filter((raid) => {
    const outline = raid.regionId === null ? undefined : replaced.get(raid.regionId);
    const gym = raid.gymId === null ? undefined : gymById.get(raid.gymId);
    return outline !== undefined && gym !== undefined && !contains(outline, gym);
  }).length;

  const creating = imports.flatMap((planned) =>
    'create' in planned.channel ? [{ name: planned.channelName, ...planned.channel.create }] : [],
  );
  const newCategories = [
    ...new Set(
      creating.flatMap(({ category }) =>
        category && 'create' in category ? [category.create] : [],
      ),
    ),
  ];

  return {
    imports,
    leftOut,
    newChannels: creating.map(({ name }) => name),
    newCategories,
    stranded: gyms.filter((gym) => inServerNow(gym) && !keptAfter(gym)).length,
    raidsOutside,
    newForums: imports.filter(
      (planned) => !planned.hasForum && !planned.adoptForum && !planned.forumBlocked,
    ).length,
    overflow: [...overflows.values()],
    ...(problem === undefined ? {} : { problem }),
  };
}
