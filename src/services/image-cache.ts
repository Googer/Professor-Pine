import { createHash } from 'node:crypto';
import { mkdir, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';

/** The part of a `fetch` response the cache needs. */
export interface ImageResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchImage = (url: string, init: { signal: AbortSignal }) => Promise<ImageResponse>;

export interface ImageCacheOptions {
  /** Where the pictures are kept, e.g. `var/images`. */
  dir: string;
  fetch: FetchImage;
  log: Logger;
  /** How long one download may take. Default 10 seconds. */
  timeoutMs?: number;
  /** A larger download is refused. Default 5 MB. */
  maxBytes?: number;
  /** Puts the finished download in its place. Default `rename` of `node:fs/promises`; for tests. */
  rename?: (from: string, to: string) => Promise<void>;
  /** The pause before a refused rename is tried again. Default 50 ms. */
  renamePauseMs?: number;
}

export interface ImageRequest {
  /** Sub-folder: lower-case letters, digits and hyphens (`gyms`, `regions`). */
  folder: string;
  /** What the picture is of: letters, digits, hyphens and underscores (a gym or region id). */
  id: string;
  /**
   * Anything that changes when the picture should: a new variant is downloaded again and
   * replaces the old file. Must not hold secrets; it is hashed into the file name.
   */
  variant: string;
  /** Where to download it. May hold a secret (an API key): it is never logged. */
  url: string;
  /** A reason to refuse an otherwise good response, or undefined to accept it. */
  refuse?: (response: ImageResponse) => string | undefined;
  /**
   * A picture served from disk is written the time anew, so that `removeOlder` counts from when
   * it was last asked for (the pictures of places), not from when it was downloaded.
   */
  touch?: boolean | undefined;
}

const FOLDER = /^[a-z0-9-]+$/;
const ID = /^[A-Za-z0-9_-]+$/;

/**
 * What Windows answers a rename while another program has the file open: a virus scanner or the
 * search index reads a file the moment it was written, and lets go of it a moment later.
 */
const HELD_BY_ANOTHER = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** How often a rename is tried in all. */
const RENAME_ATTEMPTS = 5;

let temporaryCounter = 0;

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The rename that makes a written file the one in its place (the pictures of `ImageCache` and
 * `StopPictures`). Tried again a few times, after a short pause, when it is refused the way
 * Windows refuses it while another program holds the file.
 */
export async function moveIntoPlace(
  temporary: string,
  file: string,
  move: (from: string, to: string) => Promise<void> = rename,
  pauseMs = 50,
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await move(temporary, file);
      return;
    } catch (err) {
      if (attempt >= RENAME_ATTEMPTS || !HELD_BY_ANOTHER.has(errorCode(err) ?? '')) throw err;
      await pause(pauseMs);
    }
  }
}

function errorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  return typeof err.code === 'string' ? err.code : undefined;
}

/**
 * Downloads pictures once and keeps them on disk, so they can be attached to messages as files.
 * A picture that cannot be had is never an error for the caller: `get` answers undefined and the
 * message goes out without it.
 */
export class ImageCache {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly inFlight = new Map<string, Promise<string | undefined>>();

  constructor(private readonly options: ImageCacheOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  }

  /**
   * The path of the picture, downloading it first when this variant is not on disk yet. Requests
   * for the same picture made at the same time share one download. Throws RangeError for a
   * folder or id that is not a plain name.
   */
  get(request: ImageRequest): Promise<string | undefined> {
    if (!FOLDER.test(request.folder)) throw new RangeError(`Bad image folder: ${request.folder}`);
    if (!ID.test(request.id)) throw new RangeError(`Bad image id: ${request.id}`);
    const hash = createHash('sha256').update(request.variant).digest('hex').slice(0, 12);
    const file = path.resolve(this.options.dir, request.folder, `${request.id}.${hash}.png`);
    let pending = this.inFlight.get(file);
    if (!pending) {
      pending = this.provide(file, request).finally(() => this.inFlight.delete(file));
      this.inFlight.set(file, pending);
    }
    return pending;
  }

  /** Deletes the pictures of one folder, or all of them. Returns how many were deleted. */
  async clear(folder?: string): Promise<number> {
    if (folder !== undefined && !FOLDER.test(folder)) {
      throw new RangeError(`Bad image folder: ${folder}`);
    }
    const folders = folder === undefined ? await this.list(this.options.dir) : [folder];
    let deleted = 0;
    for (const name of folders) {
      if (!FOLDER.test(name)) continue;
      const dir = path.resolve(this.options.dir, name);
      for (const file of await this.list(dir)) {
        if (!file.endsWith('.png')) continue;
        await rm(path.join(dir, file), { force: true });
        deleted += 1;
      }
    }
    return deleted;
  }

  /**
   * Deletes the pictures of one folder that were last written before `before` (epoch ms), and
   * gives how many. A picture that is downloaded again is written anew.
   */
  async removeOlder(folder: string, before: number): Promise<number> {
    if (!FOLDER.test(folder)) throw new RangeError(`Bad image folder: ${folder}`);
    const dir = path.resolve(this.options.dir, folder);
    let deleted = 0;
    for (const file of await this.list(dir)) {
      if (!file.endsWith('.png')) continue;
      const at = path.join(dir, file);
      try {
        if ((await stat(at)).mtimeMs >= before) continue;
        await rm(at, { force: true });
        deleted += 1;
      } catch {
        // Gone meanwhile, or held by another program: left for the next time.
      }
    }
    return deleted;
  }

  private async list(dir: string): Promise<string[]> {
    try {
      return await readdir(dir);
    } catch {
      return [];
    }
  }

  private async provide(file: string, request: ImageRequest): Promise<string | undefined> {
    const what = { folder: request.folder, id: request.id };
    try {
      if ((await stat(file)).size > 0) {
        if (request.touch) {
          const now = new Date();
          // A time that cannot be written costs only an early download again.
          await utimes(file, now, now).catch(() => undefined);
        }
        return file;
      }
    } catch {
      // Not on disk yet.
    }
    const signal = AbortSignal.timeout(this.timeoutMs);
    let bytes: Buffer;
    try {
      bytes = await this.download(request, signal);
    } catch (err) {
      // Only the reason is logged, and never the address, which may hold a key: the whole
      // address is replaced, and any `key=` left over (a quoted query part) is cut.
      const reason = signal.aborted
        ? `timed out after ${this.timeoutMs} ms`
        : failureReason(err)
            .replaceAll(request.url, '(address)')
            .replace(/key=[^&\s]+/g, 'key=…');
      this.options.log.warn({ ...what, reason }, 'could not download a picture');
      return undefined;
    }
    const temporary = `${file}.${process.pid}.${++temporaryCounter}.tmp`;
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(temporary, bytes);
      await this.moveIntoPlace(temporary, file);
    } catch (err) {
      await rm(temporary, { force: true }).catch(() => undefined);
      this.options.log.warn({ ...what, reason: failureReason(err) }, 'could not save a picture');
      return undefined;
    }
    await this.removeOlderVariants(file, request.id);
    return file;
  }

  /**
   * The rename that makes a download the picture. Tried again a few times, after a short pause,
   * when it is refused the way Windows refuses it while another program holds the file.
   */
  private moveIntoPlace(temporary: string, file: string): Promise<void> {
    return moveIntoPlace(temporary, file, this.options.rename, this.options.renamePauseMs);
  }

  private async download(request: ImageRequest, signal: AbortSignal): Promise<Buffer> {
    const response = await this.options.fetch(request.url, { signal });
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('image/')) {
      throw new Error(`the server sent ${type === '' ? 'no content type' : type}, not a picture`);
    }
    const refused = request.refuse?.(response);
    if (refused !== undefined) throw new Error(refused);
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > this.maxBytes) throw new Error(`the picture is too large (${length} bytes)`);
    const body = await response.arrayBuffer();
    if (body.byteLength === 0) throw new Error('the picture is empty');
    if (body.byteLength > this.maxBytes) {
      throw new Error(`the picture is too large (${body.byteLength} bytes)`);
    }
    return Buffer.from(body);
  }

  /** Other variants of the same picture are out of date once a new one is saved. */
  private async removeOlderVariants(file: string, id: string): Promise<void> {
    const dir = path.dirname(file);
    const keep = path.basename(file);
    for (const name of await this.list(dir)) {
      if (name !== keep && name.startsWith(`${id}.`) && name.endsWith('.png')) {
        await rm(path.join(dir, name), { force: true }).catch(() => undefined);
      }
    }
  }
}
