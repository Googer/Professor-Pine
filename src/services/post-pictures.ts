import { readFile } from 'node:fs/promises';
import { wayspotPicture } from '../domain/wayspots/picture.js';
import { BoundedMap } from '../bounded-map.js';
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

  async file(key: string, request: ImageRequest): Promise<string | undefined> {
    const at = this.failed.get(key);
    if (at !== undefined && this.now() - at < FAILED_PICTURE_MS) return undefined;
    const file = await this.cache.get(request);
    if (file === undefined) this.failed.set(key, this.now());
    else this.failed.delete(key);
    return file;
  }
}

/** Where the web server serves the application's emoji (plan 8M-8A): `/emoji/<id>.png`. */
export const EMOJI_PATH = '/emoji/';

/**
 * The pictures of the application's emoji for the live map (plan 8M-8A): the posts name their
 * icons by Discord's CDN, which the page's CSP does not let in (and which would learn of every
 * member's browser), so Pine serves them: only the application's own (`hasId`), each fetched once
 * from the CDN into the image cache and served from there. Any other emoji the page shows by its
 * name.
 */
export class EmojiPictures {
  private readonly downloads: Downloads;

  constructor(
    private readonly options: {
      emoji: { hasId(id: string): boolean };
      cache: PictureCache;
      read?: (file: string) => Promise<Buffer>;
      now?: () => number;
    },
  ) {
    this.downloads = new Downloads(options.cache, options.now ?? Date.now);
  }

  /** Pine's address of an emoji's picture, undefined for one that is not the application's. */
  address(id: string): string | undefined {
    return this.options.emoji.hasId(id) ? `${EMOJI_PATH}${id}.png` : undefined;
  }

  /** An emoji's picture, undefined for one that is not the application's or cannot be had. */
  async read(id: string): Promise<PictureBytes | undefined> {
    if (!/^\d{17,20}$/u.test(id) || !this.options.emoji.hasId(id)) return undefined;
    const file = await this.downloads.file(id, {
      folder: 'emoji',
      id,
      // An emoji's picture never changes under its id.
      variant: '96',
      url: `https://cdn.discordapp.com/emojis/${id}.png?size=96`,
    });
    return pictureOf(file, this.options.read ?? readFile);
  }
}

/** What kind of place a place's picture is of: a gym by its number, a Wayspot by Wayfarer's id. */
export type PlaceKind = 'gym' | 'wayspot';

/** How many addresses of places' pictures `PlacePictures` keeps the keys of (review W-2). */
export const KNOWN_ADDRESSES = 2_000;

/** The gyms and the kept Wayspots, by what their pictures are. */
export interface PlaceSources {
  gyms: {
    readonly generation: number;
    all(): readonly { id: number; imageUrl?: string | null | undefined }[];
    get(id: number): { imageUrl?: string | null | undefined } | undefined;
  };
  wayspots?: {
    readonly contentGeneration: number;
    all(): readonly { id: string; image: string | null }[];
    byId(id: string): { image: string | null } | undefined;
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
    if (known !== undefined && 'kind' in known && this.urlOf(known.kind, known.id) === url) {
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
    const wayspot = this.options.wayspots?.all().find((one) => wayspotPicture(one.image) === url);
    return wayspot === undefined ? undefined : { kind: 'wayspot', id: wayspot.id };
  }

  /** The address a post shows of a place's picture (`wayspotPicture`), undefined for none. */
  urlOf(kind: PlaceKind, id: string): string | undefined {
    if (kind === 'gym') {
      return /^\d{1,10}$/u.test(id)
        ? wayspotPicture(this.options.gyms.get(Number(id))?.imageUrl)
        : undefined;
    }
    return wayspotPicture(this.options.wayspots?.byId(id)?.image);
  }

  /** A place's picture, undefined where it has none or it cannot be had. */
  async read(kind: PlaceKind, id: string): Promise<PictureBytes | undefined> {
    const url = this.urlOf(kind, id);
    if (url === undefined) return undefined;
    const file = await this.downloads.file(`${kind}/${id}`, {
      // A folder of its own: `places` is StaticMaps', pruned daily (`prunePlaces`); a place's
      // picture is kept until its address changes (the variant).
      folder: 'place-pictures',
      // The image cache takes letters, digits, hyphens and underscores: a Wayfarer id has a dot.
      id: `${kind}-${id.replace(/[^A-Za-z0-9_-]/gu, '_')}`,
      variant: url,
      url,
    });
    return pictureOf(file, this.options.read ?? readFile);
  }
}
