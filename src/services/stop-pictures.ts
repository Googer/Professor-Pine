import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BoundedBytes } from '../bounded-bytes.js';
import { BoundedMap } from '../bounded-map.js';
import { isLocalAddress, type Settings } from '../config/settings.js';
import { isPictureSource } from '../domain/stops/pictures.js';
import type { Logger } from '../log.js';
import { REFUSED, type MayCost, type Refused } from './costly.js';
import { failureReason } from './failure-reason.js';
import { moveIntoPlace } from './image-cache.js';
import { readLimitedBytes, type LimitedResponse } from './limited-json.js';
import { PINE_USER_AGENT } from './research-task-service.js';

/** Where the square pictures are kept (git-ignored; the stack's writable volume is `/app/var`). */
export const PICTURE_FOLDER = 'var/pictures';

/** The path under which the web server serves them (`GET /pictures/<key>.png`). */
export const PICTURE_PATH = '/pictures/';

/** The largest picture fetched: Leek Duck's icons are some 10 to 40 KB. */
export const MAX_PICTURE_BYTES = 512 * 1024;

/** The most pixels a picture fetched may have (sharp's `limitInputPixels`): 1024 by 1024. */
export const MAX_PICTURE_PIXELS = 1024 * 1024;

/** The longest side a picture fetched may have: no long strip passes the pixel limit. */
export const MAX_PICTURE_SIDE = 1024;

/** The formats a picture fetched may have (sharp's names): no SVG, nothing else. */
const PICTURE_FORMATS: ReadonlySet<string> = new Set(['png', 'jpeg', 'webp', 'gif']);

/** How many pictures are kept, on disk and in the index: the oldest made goes first. */
export const MAX_PICTURES = 2_000;

/**
 * The size a kept picture has on average (8Z-2 final fix F3): 262 of them kept on the
 * development laptop on 2026-11-10 averaged 18 KB (the median about 12 KB, 95 in 100 under
 * 52 KB, the largest 236 KB). Leek Duck's icons, padded to a square without scaling.
 */
export const TYPICAL_PICTURE_BYTES = 18 * 1024;

/**
 * How many bytes of pictures read for the web server are kept in memory (plan 8Z-2), the oldest
 * read first out: the whole index at its usual size, so that a kept picture is read from the
 * folder once a run, and a stranger cycling real keys causes no read after (8Z-2 final fix F3).
 * The largest a kept picture can be is a 1024 by 1024 PNG, some 4 MB, which makes 8 GB for the
 * index: more than memory should hold. So `MAX_PICTURES` at 32 KB each, the usual size
 * (`TYPICAL_PICTURE_BYTES`) with a margin of 1.8 (an index of 2,000 of today's pictures needs
 * about 36 MB).
 */
export const PICTURE_MEMORY_BYTES = MAX_PICTURES * 32 * 1024;

/** A picture is fetched again after this long, so one Leek Duck changes at its address is renewed. */
export const RENEW_MS = 7 * 24 * 60 * 60_000;

/** How long a failed fetch is remembered: an outage is not tried again on every redraw. */
export const FAILED_AGAIN_MS = 30 * 60_000;

/**
 * How long `prepare` waits for the pictures it lacks: a post, a DM or a grunt's message is held
 * up no longer by a slow Leek Duck. What lands later is named at the next redraw.
 */
export const PREPARE_DEADLINE_MS = 2_500;

/** How long one fetch may take. */
const TIMEOUT_MS = 10_000;

/** How many fetches run at once, whoever asked for them. */
const AT_ONCE = 4;

/**
 * How many of those places a list's pictures made in the background take at most (`prepare` with
 * `background`): the rest stay free for a post or a DM that waits (branch review W5 of 8M-9B).
 */
const BACKGROUND_AT_ONCE = 1;

/** How many failed fetches are remembered. */
const FAILURES_KEPT = 1_000;

/** A picture's file: its key (`keyOf`) and `.png`. */
const FILE = /^([0-9a-f]{32})\.png$/;

/** A picture's key: the start of the SHA-256 of its source address, never the address itself. */
function keyOf(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 32);
}

/** A picture's version, the start of the SHA-256 of what is served (`?v=`). */
function versionOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}

/** A download of a picture: never followed to another address. */
export type FetchPicture = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string>; redirect: 'error' },
) => Promise<LimitedResponse & { ok: boolean }>;

export interface StopPicturesOptions {
  /** `settings.web`: the public address the pictures are named at. */
  settings: Pick<Settings, 'web'>;
  /** The folder they are kept in (`PICTURE_FOLDER`; a test gives a folder of its own). */
  folder: string;
  fetch: FetchPicture;
  log: Logger;
  now?: () => number;
  /** How many pictures are kept (`MAX_PICTURES`). */
  maxPictures?: number;
  /** How many bytes of them are kept in memory (`PICTURE_MEMORY_BYTES`). */
  memoryBytes?: number;
}

/**
 * What the post, the DMs and the grunts' messages need of `StopPictures`: the pictures made
 * before they are drawn, then their addresses.
 */
export type PictureMaker = Pick<StopPictures, 'prepare' | 'url'>;

/** A picture kept: its version and when it was made (its file's time). */
interface Kept {
  version: string;
  madeAt: number;
}

/** A failed fetch: when, and whether its source is gone (it answered 404 or 410). */
interface Failure {
  at: number;
  gone: boolean;
}

/** A source that answered 404 or 410: it has no picture (rule 6). */
class PictureGone extends Error {}

/** A fetch's place among the `AT_ONCE`: whether it is a background one's, and when it may go. */
interface Place {
  key: string;
  background: boolean;
  go?: () => void;
}

/**
 * The square pictures of the reports at stops (plan 8R-6; design
 * `2026-10-23-stop-pictures-design.md`, "How the pictures are served"): Leek Duck's icons are not
 * square, and Discord shows a thumbnail as a square and crops the rest. `prepare(sources)` fetches
 * what is missing or older than `RENEW_MS` (from the hosts the feeds' checks allow alone,
 * `isPictureSource`; a byte limit, sharp's `limitInputPixels`, `MAX_PICTURE_SIDE` and the formats
 * of `PICTURE_FORMATS`), pads it to a square with transparent edges, centred and unscaled, as
 * `scripts/eggs/make-eggs.ts` made the eggs, and keeps it in its folder under a hash of the
 * source. It waits only for the missing ones, and for `PREPARE_DEADLINE_MS` at most: an old one is
 * served while it is fetched again, and fetches still running go on in the background (`idle`;
 * `close` aborts them). `url(source)` gives renderers the address the bot's web server serves it
 * at (`<publicUrl>/pictures/<key>.png?v=<version>`), the source itself while it is not ready or
 * its fetch failed, none once the source answered 404 or 410 (the picture is gone), and the
 * source as it is before the web server listens (`serving`) and without a public address, where
 * nothing is fetched. No attachments. A failed fetch is not tried again for `FAILED_AGAIN_MS`;
 * the old picture is kept where a renewal fails for another reason. At most `maxPictures` are
 * kept, never making room by one that is being fetched again; `start` reads the index back from
 * the folder, so a restart fetches nothing again. `read(key, mayCost)` is the web server's: a
 * picture's bytes are read from the folder once and kept in memory (plan 8Z-2;
 * `PICTURE_MEMORY_BYTES`, forgotten when the picture is made anew or leaves the index), and
 * `mayCost` is asked only before the folder is read.
 */
export class StopPictures {
  private readonly now: () => number;
  private readonly max: number;
  private readonly kept: BoundedMap<string, Kept>;
  /** The bytes of pictures the web server read, by key: only of pictures in `kept`. */
  private readonly memory: BoundedBytes<string, Buffer>;
  private readonly failed = new BoundedMap<string, Failure>(FAILURES_KEPT);
  private readonly fetching = new Map<string, Promise<void>>();
  /** The web server's reads of a picture from its folder on their way, by key. */
  private readonly reading = new Map<string, Promise<Buffer | undefined | Refused>>();
  /** Files of pictures that made room, being deleted. */
  private readonly removing = new Set<Promise<void>>();
  private readonly stopping = new AbortController();
  /**
   * Fetches running (of them in the background, `BACKGROUND_AT_ONCE` at most), and those waiting
   * for one of the `AT_ONCE` places, in the order asked: one waited for before any background one.
   */
  private running = 0;
  private runningBackground = 0;
  private readonly queued: Place[] = [];
  private loading: Promise<void> | undefined;
  private served = false;

  constructor(private readonly options: StopPicturesOptions) {
    this.now = options.now ?? (() => Date.now());
    this.max = options.maxPictures ?? MAX_PICTURES;
    this.kept = new BoundedMap(this.max);
    this.memory = new BoundedBytes(
      options.memoryBytes ?? PICTURE_MEMORY_BYTES,
      (bytes) => bytes.length,
    );
  }

  /** The web server listens: from now on the pictures are named at its address. */
  serving(): void {
    this.served = true;
  }

  /**
   * Reads the pictures kept in the folder (the index of the route and of `url`), oldest first,
   * and deletes what passes the bound and what an earlier process left half written. Never
   * rejects: a folder that cannot be read is logged, and pictures are made anew.
   */
  start(): Promise<void> {
    this.loading ??= this.load().catch((err: unknown) => {
      this.options.log.warn({ err }, 'could not read the pictures of the stops');
    });
    return this.loading;
  }

  private async load(): Promise<void> {
    const { folder } = this.options;
    const found: { key: string; madeAt: number; version: string }[] = [];
    for (const name of await this.list()) {
      if (name.endsWith('.tmp')) {
        await rm(path.join(folder, name), { force: true }).catch(() => undefined);
        continue;
      }
      const key = FILE.exec(name)?.[1];
      if (key === undefined || this.kept.has(key)) continue;
      try {
        const file = path.join(folder, name);
        const [{ mtimeMs }, bytes] = await Promise.all([stat(file), readFile(file)]);
        found.push({ key, madeAt: mtimeMs, version: versionOf(bytes) });
      } catch {
        // Gone meanwhile: made again when asked for.
      }
    }
    found.sort((a, b) => a.madeAt - b.madeAt);
    for (const extra of found.splice(0, Math.max(0, found.length - this.max))) {
      await rm(this.fileOf(extra.key), { force: true }).catch(() => undefined);
    }
    for (const { key, madeAt, version } of found) {
      if (!this.kept.has(key)) this.kept.set(key, { madeAt, version });
    }
  }

  private async list(): Promise<string[]> {
    try {
      return await readdir(this.options.folder);
    } catch {
      return [];
    }
  }

  /** Whether pictures are named at the bot's own address: only at a public one. */
  private publicUrl(): string | undefined {
    const { web } = this.options.settings;
    return web === undefined || isLocalAddress(web.publicUrl) ? undefined : web.publicUrl;
  }

  /**
   * The address a message names for a source (`PictureLookup`): the square picture where it is
   * made and the web server listens at a public address, none where the source is gone (404 or
   * 410), else the source itself.
   */
  url(source: string): string | undefined {
    const base = this.publicUrl();
    if (!this.served || base === undefined) return source;
    const key = keyOf(source);
    if (this.failed.get(key)?.gone === true) return undefined;
    const kept = this.kept.get(key);
    return kept === undefined ? source : `${base}${PICTURE_PATH}${key}.png?v=${kept.version}`;
  }

  /**
   * A picture this service made, for the route; undefined for any other key. From memory where
   * it was read before; else from the folder, which costs: `mayCost` is asked first (never for
   * a key that is none of the service's, nor for a picture in memory), and `REFUSED` is the
   * answer where it says no.
   */
  async read(key: string, mayCost?: MayCost): Promise<Buffer | undefined | Refused> {
    const kept = this.kept.get(key);
    if (kept === undefined) return undefined;
    const held = this.memory.get(key);
    if (held !== undefined) return held;
    // Asked again while it is read (F-B3): the same read, counted once, its answer (a refusal
    // too) shared; forgotten once it settled.
    const running = this.reading.get(key);
    if (running) return running;
    const reading = (async (): Promise<Buffer | undefined | Refused> => {
      if (mayCost !== undefined && !(await mayCost())) return REFUSED;
      try {
        const bytes = await readFile(this.fileOf(key));
        // Made anew or gone from the index meanwhile: not what the key stands for any more.
        if (this.kept.get(key) === kept) this.memory.set(key, bytes);
        return bytes;
      } catch {
        return undefined;
      }
    })().finally(() => this.reading.delete(key));
    this.reading.set(key, reading);
    return reading;
  }

  /**
   * Fetches and pads what of `sources` is missing or older than `RENEW_MS`, `AT_ONCE` at a time;
   * a source of another host, one that failed within `FAILED_AGAIN_MS`, and every source without
   * a public address are passed over. Waits for the missing ones only, `PREPARE_DEADLINE_MS` at
   * most, and not at all once closed; the rest go on in the background. `background`: a whole
   * list's pictures that nothing waits for (a task list or the lineups read), fetched
   * `BACKGROUND_AT_ONCE` at a time behind any a post or a DM waits for, a source of theirs that
   * one waits for moved ahead (branch review W5). Never rejects.
   */
  async prepare(sources: Iterable<string>, how: { background?: boolean } = {}): Promise<void> {
    if (this.publicUrl() === undefined || this.stopping.signal.aborted) return;
    // The deadline ends at its time or at `close`. Its listener is removed when `prepare` returns:
    // a race against a promise that lives as long as the service would keep a reaction per call.
    const { signal } = this.stopping;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: (() => void) | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, PREPARE_DEADLINE_MS);
      stop = () => resolve();
      signal.addEventListener('abort', stop, { once: true });
    });
    try {
      await Promise.race([this.begin(sources, how.background === true), deadline]);
    } finally {
      clearTimeout(timer);
      if (stop) signal.removeEventListener('abort', stop);
    }
  }

  /** Begins the fetches `prepare` asks for; resolves when the missing pictures have landed. */
  private async begin(sources: Iterable<string>, background: boolean): Promise<void> {
    if (this.loading) await this.loading;
    if (this.stopping.signal.aborted) return;
    const now = this.now();
    const missing: Promise<void>[] = [];
    for (const source of new Set(sources)) {
      if (!isPictureSource(source)) continue;
      const key = keyOf(source);
      const kept = this.kept.get(key);
      if (kept !== undefined && now - kept.madeAt < RENEW_MS) continue;
      const failure = this.failed.get(key);
      if (failure !== undefined && now - failure.at < FAILED_AGAIN_MS) continue;
      const fetched = this.fetchOnce(source, key, background);
      if (kept === undefined) missing.push(fetched);
    }
    await Promise.all(missing);
  }

  /** Resolves once no fetch runs and no file is being deleted (tests, `close`). */
  async idle(): Promise<void> {
    while (this.fetching.size > 0 || this.removing.size > 0) {
      await Promise.all([...this.fetching.values(), ...this.removing]);
    }
  }

  /** Aborts the fetches on their way and makes no more (shutdown); resolves once they ended. */
  close(): Promise<void> {
    this.stopping.abort();
    return this.idle();
  }

  /**
   * One fetch of a source at a time, whoever asks; one a post or a DM waits for (not
   * `background`) that waits behind a list's pictures is moved ahead.
   */
  private fetchOnce(source: string, key: string, background: boolean): Promise<void> {
    let pending = this.fetching.get(key);
    if (!pending) {
      pending = this.make(source, key, background).finally(() => this.fetching.delete(key));
      this.fetching.set(key, pending);
    } else if (!background) {
      this.waitedFor(key);
    }
    return pending;
  }

  /** Whether a fetch may take a place now: one is free, and a background one's too. */
  private free(background: boolean): boolean {
    return this.running < AT_ONCE && (!background || this.runningBackground < BACKGROUND_AT_ONCE);
  }

  private take(place: Place): void {
    this.running += 1;
    if (place.background) this.runningBackground += 1;
  }

  /** One of the `AT_ONCE` places of a fetch; `release` hands it on to the next that may go. */
  private async place(place: Place): Promise<void> {
    if (this.free(place.background)) {
      this.take(place);
      return;
    }
    await new Promise<void>((resolve) => {
      place.go = resolve;
      this.queued.push(place);
    });
  }

  private release(place: Place): void {
    this.running -= 1;
    if (place.background) this.runningBackground -= 1;
    this.next();
  }

  /** Starts what waits and may go now: one waited for first, then the lists' in their order. */
  private next(): void {
    for (;;) {
      const waited = this.queued.findIndex((one) => !one.background);
      const index =
        waited >= 0 && this.free(false)
          ? waited
          : this.free(true)
            ? this.queued.findIndex((one) => one.background)
            : -1;
      const [place] = index >= 0 ? this.queued.splice(index, 1) : [];
      if (!place) return;
      this.take(place);
      place.go?.();
    }
  }

  /** A source a post or a DM waits for is no background fetch any longer, if it still waits. */
  private waitedFor(key: string): void {
    const place = this.queued.find((one) => one.key === key);
    if (!place?.background) return;
    place.background = false;
    this.next();
  }

  private async make(source: string, key: string, background: boolean): Promise<void> {
    const { log } = this.options;
    const place: Place = { key, background };
    await this.place(place);
    try {
      if (this.stopping.signal.aborted) return;
      const square = await this.squareOf(source);
      if (this.stopping.signal.aborted) return;
      const madeAt = this.now();
      await this.save(key, square, madeAt);
      this.failed.delete(key);
      this.keep(key, { version: versionOf(square), madeAt });
    } catch (err) {
      if (this.stopping.signal.aborted) return;
      this.failed.set(key, { at: this.now(), gone: err instanceof PictureGone });
      log.warn({ source, reason: failureReason(err) }, 'could not make a picture square');
    } finally {
      this.release(place);
    }
  }

  /**
   * Puts a picture in the index, at once: with the index full the oldest that is not being
   * fetched again makes room (the oldest of all where every one is), its file deleted after.
   */
  private keep(key: string, kept: Kept): void {
    this.kept.delete(key);
    const keys = this.kept.keys();
    const room = this.kept.size + 1 - this.max;
    const victims =
      room > 0
        ? [
            ...keys.filter((one) => !this.fetching.has(one)),
            ...keys.filter((one) => this.fetching.has(one)),
          ].slice(0, room)
        : [];
    for (const victim of victims) this.kept.delete(victim);
    this.kept.set(key, kept);
    // What memory holds of them is the old picture's, or of a picture that is no more.
    for (const stale of [key, ...victims]) this.memory.delete(stale);
    for (const victim of victims) {
      const removed = rm(this.fileOf(victim), { force: true })
        .catch(() => undefined)
        .finally(() => this.removing.delete(removed));
      this.removing.add(removed);
    }
  }

  /** The source fetched and padded to a square with transparent edges, centred and unscaled. */
  private async squareOf(source: string): Promise<Buffer> {
    const response = await this.options.fetch(source, {
      signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), this.stopping.signal]),
      headers: { Accept: 'image/*', 'User-Agent': PINE_USER_AGENT },
      redirect: 'error',
    });
    if (response.status === 404 || response.status === 410) {
      throw new PictureGone(`the server answered ${String(response.status)}`);
    }
    if (!response.ok) throw new Error(`the server answered ${String(response.status)}`);
    const type = response.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('image/')) {
      throw new Error(`the server sent ${type === '' ? 'no content type' : type}, not a picture`);
    }
    const read = await readLimitedBytes(response, MAX_PICTURE_BYTES);
    if (!read.ok) throw new Error(`the picture is ${read.reason}`);
    const options = { limitInputPixels: MAX_PICTURE_PIXELS };
    const { width, height, format } = await sharp(read.bytes, options).metadata();
    if (!PICTURE_FORMATS.has(format)) throw new Error(`the picture is ${format}`);
    const side = Math.max(width, height);
    if (side > MAX_PICTURE_SIDE) {
      throw new Error(`the picture is ${String(width)} by ${String(height)}`);
    }
    const left = Math.floor((side - width) / 2);
    const top = Math.floor((side - height) / 2);
    return sharp(read.bytes, options)
      .ensureAlpha()
      .extend({
        left,
        right: side - width - left,
        top,
        bottom: side - height - top,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  /** Writes a picture in its place, its file's time when it was made (read back at `start`). */
  private async save(key: string, bytes: Buffer, madeAt: number): Promise<void> {
    const file = this.fileOf(key);
    const temporary = `${file}.${String(process.pid)}.${String(madeAt)}.tmp`;
    try {
      await mkdir(this.options.folder, { recursive: true });
      await writeFile(temporary, bytes);
      const at = new Date(madeAt);
      await utimes(temporary, at, at);
      await moveIntoPlace(temporary, file);
    } catch (err) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  private fileOf(key: string): string {
    return path.join(this.options.folder, `${key}.png`);
  }
}
