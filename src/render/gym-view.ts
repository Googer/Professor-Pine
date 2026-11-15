import type { APIButtonComponent } from 'discord.js';
import { distanceWords, type DistanceUnits } from './distance-words.js';
import type { V2Message } from '../discord/party-gateway.js';
import { addressLine } from '../domain/geo/google.js';
import { tidyLine } from '../domain/gyms/gym-text.js';
import { isEliteGym } from '../domain/party/raid.js';
import { gymMapsUrl } from './raid-post.js';
import { count, cutMarkdown, fitItems, plain, plainLines, truncate } from './text.js';
import {
  actionRow,
  container,
  linkButton,
  mapPicture,
  separator,
  textDisplay,
  type MapPicture,
} from './v2.js';

/** What the sentences about a gym need of it (`Gym` of the repository has all of it). */
interface NamedGym {
  id: number;
  name: string;
  nickname: string | null;
  lat: number;
  lon: number;
}

/** The colour of what is said about the gym list. */
export const GYM_COLOUR = 0x3498db;

/**
 * How much of a name and of a nickname a sentence shows (`gymWithId`): a row of the legacy bot
 * may hold 255 characters of either, and a question names several gyms in one message.
 */
const NAMED = { name: 80, nickname: 40 } as const;
/** How much room the channels of the regions get in a sentence (`regionsSentence`). */
const REGIONS_SHOWN = 300;

/**
 * A text of a gym as a line shows it: without control characters and without invisible
 * formatting characters (a legacy name may hold a direction override, which would turn the
 * number beside it around), cut to `limit` before it is escaped, so that no escape is cut in
 * two and what closes the bold stays.
 */
function shown(text: string, limit?: number): string {
  const tidy = tidyLine(text);
  return plain(limit === undefined ? tidy : truncate(tidy, limit));
}

/**
 * A gym's name as a sentence shows it: plain, without its nickname. A legacy name of nothing
 * but characters that are not shown would be an empty text (`****`, an embed without a title):
 * such a gym is named by its number.
 */
export function gymLabel(gym: { name: string; id?: number }, limit?: number): string {
  const name = shown(gym.name, limit);
  if (name !== '') return name;
  return gym.id === undefined ? 'Gym' : `Gym #${gym.id}`;
}

/**
 * A gym as staff tell it from its namesakes: `**Name** (Nickname, #12)`. Name and nickname are
 * cut (`NAMED`); the number, which is what tells two gyms apart, always stays.
 */
export function gymWithId(gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>): string {
  // `||`: a nickname that was cleared to an empty text names nothing.
  const nick = gym.nickname ? shown(gym.nickname, NAMED.nickname) : '';
  return `**${gymLabel({ name: gym.name }, NAMED.name)}** (${nick === '' ? '' : `${nick}, `}#${gym.id})`;
}

/**
 * The regions a gym lies in, as a sentence about one server: its channels, or that there is
 * none. A server with more regions than fit is told how many more there are.
 */
export function regionsSentence(regions: readonly { channelId: string }[]): string {
  if (regions.length === 0) return 'It lies in no region of this server.';
  const channels = regions.map((region) => `<#${region.channelId}>`);
  const all = channels.join(', ');
  if (all.length > REGIONS_SHOWN) return `It lies in ${fitItems(channels, REGIONS_SHOWN)}.`;
  const last = channels.pop() ?? '';
  return `It lies in ${channels.length === 0 ? last : `${channels.join(', ')} and ${last}`}.`;
}

/**
 * What the channel for bot updates is told of one new gym, as a components-v2 message (Matt,
 * 2026-10-15): that it was added, its name as a link to the place with its nickname, the
 * regions of that server it lies in, its map (`map`; without one, none), its number in small
 * print and a Map button. It pings nobody. `map.files` go with the message.
 */
export function gymAnnouncement(
  gym: NamedGym,
  regions: readonly { channelId: string }[],
  map: MapPicture = mapPicture(undefined),
): V2Message {
  return {
    v2: true,
    components: [
      container(GYM_COLOUR, [
        textDisplay('A gym was added to the gym list.'),
        textDisplay(`${gymHeading(gym)}\n${regionsSentence(regions)}`),
        ...map.gallery,
        textDisplay(`-# Gym #${gym.id}`),
        actionRow([mapButton(gym)]),
      ]),
    ],
    ...withFiles(map),
  };
}

/** The files of a map for a message: none without one (the key is then left out). */
function withFiles(map: MapPicture): { files?: string[] } {
  return map.files.length === 0 ? {} : { files: map.files };
}

/**
 * The heading of a view: `### [Name (Nickname)](<place>)`, plain, the name and the nickname cut
 * before they are escaped (`HEADING`), and brackets escaped so that the link holds.
 */
function gymHeading(gym: Pick<NamedGym, 'id' | 'name' | 'nickname' | 'lat' | 'lon'>): string {
  const nickname = gym.nickname ? shown(gym.nickname, HEADING.nickname) : '';
  const name = gymLabel(gym, HEADING.name);
  const title = nickname === '' ? name : `${name} (${nickname})`;
  return `### [${escapeBrackets(title)}](<${gymMapsUrl(gym)}>)`;
}

/** How much of a name and a nickname a heading shows, cut before escaping. */
const HEADING = { name: 100, nickname: 50 } as const;

/** Brackets of a plain text escaped (unless a backslash escapes them already), for a link. */
function escapeBrackets(text: string): string {
  return text.replace(/(\\*)([[\]])/g, (whole, slashes: string, bracket: string) =>
    slashes.length % 2 === 1 ? whole : `${slashes}\\${bracket}`,
  );
}

/** The link button to the gym's place in Google Maps. */
function mapButton(gym: { lat: number; lon: number }): APIButtonComponent {
  return linkButton('Map', undefined, gymMapsUrl(gym));
}

/** What the channel for bot updates is told of a gym that was deleted: one line. */
export function gymRemovedLine(gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>): string {
  return `${gymWithId(gym)} was removed from the gym list.`;
}

/** What the full view shows of a gym (`Gym` of the repository has all of it). */
export interface ViewedGym extends NamedGym {
  description: string | null;
  notice: string | null;
  keywords: readonly string[];
  taggedEx: boolean;
  confirmedEx: boolean;
  geodata: string | null;
  places: string | null;
}

export interface GymView {
  gym: ViewedGym;
  /** The regions of the server the view is shown in that the gym lies in. */
  regions: readonly { channelId: string }[];
  /** The gym nearest to it, with the distance; undefined when there is none. */
  nearest?: { gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>; metres: number } | undefined;
  /** How many members have it as a gym target; undefined when that could not be read. */
  targets?: number | undefined;
  /** The units distances are said in (the server's `distanceUnits`, plan 19A-1). */
  units: DistanceUnits;
  /** The map (`mapPicture`); without it, none. */
  map?: MapPicture | undefined;
  /** What an answer says above the view (what a change did); nothing for `/gym show`. */
  above?: readonly (string | undefined)[] | undefined;
  /** Buttons beside the Map button (those of `/gym show`). */
  controls?: readonly APIButtonComponent[] | undefined;
}

/**
 * How much of each text a view shows at most, so that the whole stays within `TEXT_BUDGET`
 * whatever the gym's texts (the worst case is tested). What staff or Google wrote (the address,
 * the description, the notices, the nearby places) is cut to these lengths before it is
 * escaped, so that no escape is cut in two, and an escape may double it; the lines above the
 * view (what a change did, made of escaped parts) are kept whole while they fit `above`, and
 * the keywords and the raids are whole items within theirs. The heading is cut by `HEADING`,
 * the regions by `regionsSentence`, the nearest gym by `gymWithId`.
 */
const SHOWN = {
  above: 1_000,
  address: 120,
  description: 300,
  notice: 200,
  keywords: 250,
  places: 120,
  memberNotice: 300,
  raids: 1_500,
} as const;

/** A text of several lines, cut to `limit` and then shown plain; empty for none. */
function shownLines(text: string | null, limit: number): string {
  return text ? plainLines(truncate(text, limit)) : '';
}

/**
 * The lines above a view, kept whole in their order while they fit `room`, then how many more
 * there were; the first always stays (a sentence of what a change did is short).
 */
function fitLines(lines: readonly string[], room: number): string {
  const tail = (more: number): string => `…and ${count(more, 'more line')}`;
  const kept: string[] = [];
  // What the kept lines and a tail for the rest take, counting the newlines between them.
  let used = 0;
  for (const [index, line] of lines.entries()) {
    const more = lines.length - index - 1;
    const after = more > 0 ? tail(more).length + 1 : 0;
    const added = (kept.length > 0 ? 1 : 0) + line.length;
    // The tail for the lines after this one must fit too.
    if (kept.length > 0 && used + added + after > room) break;
    // The first stays, cut (as source, before anything else is added) only where it alone, with
    // the tail for the rest, is longer than the room.
    kept.push(kept.length === 0 ? cutMarkdown(line, room - after) : line);
    used += kept.length === 1 ? (kept[0]?.length ?? 0) : added;
  }
  const more = lines.length - kept.length;
  return [...kept, ...(more > 0 ? [tail(more)] : [])].join('\n');
}

/**
 * Everything Pine knows of a gym, as staff need it (`/gym show`, and the answer of every change
 * with what the change did above it), as a components-v2 message: the name and nickname as a
 * link to the place, the address Google gave and the regions of this server it lies in, the
 * map, the description, then the notice, the keywords, how many members target it, whether it
 * is an elite raid gym, the nearest gym and in small print the nearby places Google gave; the
 * number and the coordinates in small print; a Map button with `controls` beside it. Every
 * text is plain and cut to its room (`SHOWN`), so that the message is within Discord's limits
 * whatever the gym's texts. `map.files` go with the message.
 */
export function renderGymView(view: GymView): V2Message {
  const { gym } = view;
  const above = (view.above ?? []).filter((line): line is string => line !== undefined);
  const address = plain(truncate(addressLine(gym.geodata), SHOWN.address));
  const description = shownLines(gym.description, SHOWN.description);
  const notice = shownLines(gym.notice, SHOWN.notice);
  const facts = [
    ...(notice === '' ? [] : [`**Notice**\n${notice}`]),
    `**Keywords:** ${
      gym.keywords.length === 0 ? 'none' : fitItems(gym.keywords.map(plain), SHOWN.keywords)
    }`,
    `**Gym targets:** ${view.targets === undefined ? 'unknown' : count(view.targets, 'member')}`,
    `**Elite raid gym:** ${isEliteGym(gym) ? 'yes' : 'no'}`,
    // Cut inside `gymWithId`, before escaping: never here, where a cut could lose the `**`.
    `**Nearest gym:** ${
      view.nearest
        ? `${gymWithId(view.nearest.gym)}, ${distanceWords(view.nearest.metres, view.units)} away`
        : 'none'
    }`,
    ...(gym.places
      ? [`-# Nearby places (from Google): ${plain(truncate(gym.places, SHOWN.places))}`]
      : []),
  ];
  const map = view.map ?? mapPicture(undefined);
  const where = [
    gymHeading(gym),
    ...(address === '' ? [] : [address]),
    regionsSentence(view.regions),
  ];
  return {
    v2: true,
    components: [
      container(GYM_COLOUR, [
        ...(above.length === 0 ? [] : [textDisplay(fitLines(above, SHOWN.above)), separator()]),
        textDisplay(where.join('\n')),
        ...map.gallery,
        ...(description === '' ? [] : [textDisplay(description)]),
        textDisplay(facts.join('\n')),
        textDisplay(`-# Gym #${gym.id} · ${gym.lat}, ${gym.lon}`),
        actionRow([mapButton(gym), ...(view.controls ?? [])]),
      ]),
    ],
    ...withFiles(map),
  };
}

/** What a member's view of a gym shows (`/find-gym`). */
export interface MemberGymView {
  gym: Omit<ViewedGym, 'keywords' | 'geodata' | 'places'>;
  /** The regions of the server the view is shown in that the gym lies in. */
  regions: readonly { channelId: string }[];
  /** The active raids at the gym in this server, as lines (`raidLine`, each linking its post). */
  raids: readonly string[];
  /** The map (`mapPicture`); without it, none. */
  map?: MapPicture | undefined;
}

/**
 * A gym as a member looks it up (`/find-gym`), as a components-v2 message: the name and
 * nickname as a link to the place, the regions of this server it lies in (not whether it is an
 * elite raid gym: members are not told any more, Matt, 2026-10-17; staff's view says it), the
 * map, the description, the notice, the raids there now, its number in small print and a Map
 * button. Nothing of what only staff need (keywords, what Google gave,
 * the nearest gym, gym targets, the coordinates). Every text is plain and cut as in
 * `renderGymView`.
 */
export function renderMemberGymView(view: MemberGymView): V2Message {
  const { gym } = view;
  const description = shownLines(gym.description, SHOWN.description);
  const notice = shownLines(gym.notice, SHOWN.memberNotice);
  const map = view.map ?? mapPicture(undefined);
  const where = [gymHeading(gym), regionsSentence(view.regions)];
  return {
    v2: true,
    components: [
      container(GYM_COLOUR, [
        textDisplay(where.join('\n')),
        ...map.gallery,
        ...(description === '' ? [] : [textDisplay(description)]),
        ...(notice === '' ? [] : [textDisplay(`**Notice**\n${notice}`)]),
        ...(view.raids.length === 0
          ? []
          : [textDisplay(`**Raids now**\n${fitItems(view.raids, SHOWN.raids, '\n')}`)]),
        textDisplay(`-# Gym #${gym.id}`),
        actionRow([mapButton(gym)]),
      ]),
    ],
    ...withFiles(map),
  };
}
