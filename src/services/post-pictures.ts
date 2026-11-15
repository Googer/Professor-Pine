import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { wayspotPicture } from '../domain/wayspots/picture.js';
import { BoundedBytes } from '../bounded-bytes.js';
import { BoundedMap } from '../bounded-map.js';
import { REFUSED, type MayCost, type Refused } from './costly.js';
import type { ImageRequest } from './image-cache.js';

/** A picture as the web server answers it: its bytes and their type. */
export interface PictureBytes {
  bytes: Buffer;
  type: string;
}

/** Where the pictures come from and are kept (`ImageCache`, `var/images`). */
export interface PictureCache {
  get(request: ImageRequest): Promise<string | undefined>;
}

/**
 * The type of a picture by its first bytes: PNG, JPEG, GIF or WebP, undefined for anything else,
 * which is never served as a picture (an answer that is no picture, whatever its header said).
 */
export function pictureType(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const head = bytes.subarray(0, 12).toString('latin1');
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}

/** A file of the cache as a picture, undefined when it cannot be read or is none. */
async function pictureOf(
  file: string | undefined,
  read: (file: string) => Promise<Buffer>,
): Promise<PictureBytes | undefined> {
  if (file === undefined) return undefined;
  let bytes: Buffer;
  try {
    bytes = await read(file);
  } catch {
    return undefined;
  }
  const type = pictureType(bytes);
  return type === undefined ? undefined : { bytes, type };
}

/** How long a picture that could not be had is not asked for again (review 8A-6). */
export const FAILED_PICTURE_MS = 60_000;

/**
 * The cache's file of a picture, a download that failed remembered for `FAILED_PICTURE_MS` by its
 * key (in a `BoundedMap`), so that a page asking again and again does not download again and again.
 */
class Downloads {
  private readonly failed = new BoundedMap<string, number>(1_000);

  constructor(
    private readonly cache: PictureCache,
    private readonly now: () => number,
  ) {}

  /** Whether a download of this key failed within `FAILED_PICTURE_MS`: `file` asks nothing then. */
  failedLately(key: string): boolean {
    const at = this.failed.get(key);
    return at !== undefined && this.now() - at < FAILED_PICTURE_MS;
  }

  async file(key: string, request: ImageRequest): Promise<string | undefined> {
    if (this.failedLately(key)) return undefined;
    const file = await this.cache.get(request);
    if (file === undefined) this.failed.set(key, this.now());
    else this.failed.delete(key);
    return file;
  }
}

/** Where the web server serves the application's emoji (plan 8M-8A): `/emoji/<id>.png`. */
export const EMOJI_PATH = '/emoji/';

/**
 * How many bytes of the emoji's pictures are kept in memory (plan 8Z-2): an application has at
 * most 2,000 emoji, and one of 96 pixels is a few kilobytes.
 */
export const EMOJI_MEMORY_BYTES = 16 * 1024 * 1024;

/**
 * The pictures of the application's emoji for the live map (plan 8M-8A): the posts name their
 * icons by Discord's CDN, which the page's CSP does not let in (and which would learn of every
 * member's browser), so Pine serves them: only the application's own (`hasId`), each fetched once
 * from the CDN into the image cache and served from there. Any other emoji the page shows by its
 * name. A picture read once is kept in memory (plan 8Z-2; `EMOJI_MEMORY_BYTES`, the oldest read
 * first out: an emoji's picture never changes under its id), so that only the first read of each
 * costs a look at the image cache, a file or a fetch.
 */
export class EmojiPictures {
  private readonly downloads: Downloads;
  private readonly memory: BoundedBytes<string, PictureBytes>;
  /** The reads of a picture on their way, by the emoji's id. */
  private readonly reading = new Map<string, Promise<PictureBytes | undefined | Refused>>();

  constructor(
    private readonly options: {
      emoji: { hasId(id: string): boolean };
      cache: PictureCache;
      read?: (file: string) => Promise<Buffer>;
      now?: () => number;
      /** How many bytes of pictures are kept in memory (`EMOJI_MEMORY_BYTES`). */
      memoryBytes?: number;
    },
  ) {
    this.downloads = new Downloads(options.cache, options.now ?? Date.now);
    this.memory = new BoundedBytes(
      options.memoryBytes ?? EMOJI_MEMORY_BYTES,
      (picture) => picture.bytes.length,
    );
  }

  /** Pine's address of an emoji's picture, undefined for one that is not the application's. */
  address(id: string): string | undefined {
    return this.options.emoji.hasId(id) ? `${EMOJI_PATH}${id}.png` : undefined;
  }

  /**
   * An emoji's picture, undefined for one that is not the application's or cannot be had. From
   * memory where it was read before; else from the image cache, which costs (a file, or a fetch
   * from the CDN): `mayCost` is asked first (never for an emoji that is not the application's,
   * a picture in memory or one whose download failed lately), and `REFUSED` is the answer where
   * it says no.
   */
  async read(id: string, mayCost?: MayCost): Promise<PictureBytes | undefined | Refused> {
    if (!/^\d{17,20}$/u.test(id) || !this.options.emoji.hasId(id)) return undefined;
    const held = this.memory.get(id);
    if (held !== undefined) return held;
    if (this.downloads.failedLately(id)) return undefined;
    // Asked again while it is read (F-B3): the same read, counted once, its answer (a refusal
    // too) shared; forgotten once it settled, also where it failed.
    const running = this.reading.get(id);
    if (running) return running;
    const reading = (async (): Promise<PictureBytes | undefined | Refused> => {
      if (mayCost !== undefined && !(await mayCost())) return REFUSED;
      const file = await this.downloads.file(id, {
        folder: 'emoji',
        id,
        // An emoji's picture never changes under its id.
        variant: '96',
        url: `https://cdn.discordapp.com/emojis/${id}.png?size=96`,
      });
      const picture = await pictureOf(file, this.options.read ?? readFile);
      if (picture !== undefined) this.memory.set(id, picture);
      return picture;
    })().finally(() => this.reading.delete(id));
    this.reading.set(id, reading);
    return reading;
  }
}

/** What kind of place a place's picture is of: a gym by its number, a Wayspot by Wayfarer's id. */
export type PlaceKind = 'gym' | 'wayspot';

/** How many addresses of places' pictures `PlacePictures` keeps the keys of (review W-2). */
export const KNOWN_ADDRESSES = 2_000;

/** The image cache's folder of the places' pictures. */
const PLACE_PICTURES_FOLDER = 'place-pictures';

/** How long a place's picture that nobody asked for is kept: thirty days. */
export const PLACE_PICTURE_KEEP_MS = 30 * 86_400_000;

/** The gyms and the kept Wayspots, by what their pictures are. */
export interface PlaceSources {
  gyms: {
    readonly generation: number;
    all(): readonly { id: number; imageUrl?: string | null | undefined }[];
    stored(id: number): { imageUrl?: string | null | undefined } | undefined;
  };
  /** The kept Wayspots of every server (plan 19B-3: each server's own rows). */
  wayspots?: {
    readonly contentGeneration: number;
    servers(): number[];
    eachOf(guildId: number): Iterable<{ id: string; image: string | null }>;
    stored(guildId: number, id: string): { image: string | null } | undefined;
  };
}

/**
 * The pictures of places beside a post's Where (plan 8M-8A: a gym's or Wayspot's from Wayfarer),
 * for the live map: Google's host stays out of the page's CSP, and Pine is no open proxy, so a
 * picture is named by its gym or Wayspot (`keyOf`: `gym/12`, `wayspot/<Wayfarer id>`), never by
 * its address, and fetched once through the image cache. The address a post shows is the gym's
 * or Wayspot's as `wayspotPicture` makes it. The key of an address is looked up on a miss and
 * kept (`KNOWN_ADDRESSES`), checked against its place's address at each use, so that a gym that
 * changes (the Google line refreshes one after each answer) costs no new look over every place
 * (review W-2); an address of no place is known as such until the gyms or Wayspots change.
 */
export class PlacePictures {
  private readonly known = new BoundedMap<
    string,
    { kind: PlaceKind; id: string } | { stamp: string }
  >(KNOWN_ADDRESSES);
  private readonly downloads: Downloads;

  constructor(
    private readonly options: PlaceSources & {
      cache: PictureCache;
      read?: (file: string) => Promise<Buffer>;
      now?: () => number;
    },
  ) {
    this.downloads = new Downloads(options.cache, options.now ?? Date.now);
  }

  /** The key of a picture a post shows, undefined for one of no gym or Wayspot Pine keeps. */
  keyOf(url: string): string | undefined {
    const { gyms, wayspots } = this.options;
    const stamp = `${String(gyms.generation)}:${String(wayspots?.contentGeneration ?? 0)}`;
    const known = this.known.get(url);
    if (known !== undefined && 'stamp' in known && known.stamp === stamp) return undefined;
    if (known !== undefined && 'kind' in known && this.shows(known.kind, known.id, url)) {
      return `${known.kind}/${known.id}`;
    }
    const place = this.lookUp(url);
    this.known.set(url, place ?? { stamp });
    return place === undefined ? undefined : `${place.kind}/${place.id}`;
  }

  /** The first gym, else Wayspot, that shows this address (a miss of `keyOf`). */
  private lookUp(url: string): { kind: PlaceKind; id: string } | undefined {
    const gym = this.options.gyms.all().find((one) => wayspotPicture(one.imageUrl) === url);
    if (gym !== undefined) return { kind: 'gym', id: String(gym.id) };
    // Every server's Wayspots: a picture is Wayfarer's of the place, keyed by its Wayfarer id; it
    // is served only as the asking server's copy shows it (`urlOf`, `read`).
    // Each server's rows as the directory holds them, never copied (a miss of an instance's
    // thousands of Wayspots).
    const { wayspots } = this.options;
    for (const guildId of wayspots?.servers() ?? []) {
      for (const one of wayspots?.eachOf(guildId) ?? []) {
        if (wayspotPicture(one.image) === url) return { kind: 'wayspot', id: one.id };
      }
    }
    return undefined;
  }

  /** The address a post shows of a place's picture (`wayspotPicture`), undefined for none. */
  urlOf(kind: PlaceKind, id: string, guildRow: number | undefined): string | undefined {
    if (kind === 'gym') {
      return /^\d{1,10}$/u.test(id)
        ? wayspotPicture(this.options.gyms.stored(Number(id))?.imageUrl)
        : undefined;
    }
    // The server's own copy of the Wayspot (plan 19B-3), the one its posts show.
    return guildRow === undefined
      ? undefined
      : wayspotPicture(this.options.wayspots?.stored(guildRow, id)?.image);
  }

  /** Whether a place of some server shows this address of a picture (`keyOf`'s check). */
  private shows(kind: PlaceKind, id: string, url: string): boolean {
    if (kind === 'gym') return this.urlOf(kind, id, undefined) === url;
    const { wayspots } = this.options;
    return (
      wayspots
        ?.servers()
        .some((guildId) => wayspotPicture(wayspots.stored(guildId, id)?.image) === url) ?? false
    );
  }

  /**
   * A place's picture as the server (its `Guild` row) shows it, undefined where it has none or it
   * cannot be had.
   */
  async read(
    kind: PlaceKind,
    id: string,
    guildRow: number | undefined,
  ): Promise<PictureBytes | undefined> {
    const url = this.urlOf(kind, id, guildRow);
    if (url === undefined) return undefined;
    // A Wayspot's file is its picture's own (plan 19B-3): two servers' copies of one Wayfarer id
    // may show different pictures (scanned at different times), and neither replaces the other.
    const picture = kind === 'wayspot' ? `-${urlHash(url)}` : '';
    const file = await this.downloads.file(`${kind}/${id}${picture}`, {
      // A folder of its own: `places` is StaticMaps', pruned daily (`prunePlaces`); a place's
      // picture is kept until its address changes (the variant), or nobody asked for it in a
      // month (`prunePlacePictures`, which counts from its last use: `touch`).
      folder: PLACE_PICTURES_FOLDER,
      // The image cache takes letters, digits, hyphens and underscores: a Wayfarer id has a dot.
      id: `${kind}-${id.replace(/[^A-Za-z0-9_-]/gu, '_')}${picture}`,
      variant: url,
      url,
      touch: true,
    });
    return pictureOf(file, this.options.read ?? readFile);
  }
}

/** A picture's address as a short name a file may carry: the first 16 hex digits of its SHA-256. */
function urlHash(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/**
 * Deletes the places' pictures nobody asked for in thirty days (with the hourly upkeep, as the
 * maps of places go with `StaticMaps.prunePlaces`), and gives how many (plan 8Z-2). Before, a
 * picture went only when its place got another: that of a gym or Wayspot that was removed, or
 * was shown once, stayed for good, and nothing bounded the folder. One that is shown again is
 * fetched again.
 */
export function prunePlacePictures(
  cache: { removeOlder(folder: string, before: number): Promise<number> },
  now: number = Date.now(),
): Promise<number> {
  return cache.removeOlder(PLACE_PICTURES_FOLDER, now - PLACE_PICTURE_KEEP_MS);
}
