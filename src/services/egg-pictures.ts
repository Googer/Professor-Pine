import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocalAddress, type Settings } from '../config/settings.js';

/**
 * The square raid egg pictures the bot carries (`scripts/eggs/make-eggs.ts`, plan 8D-F): the
 * folder `pictures/eggs/` of the checkout, beside `src/` and `dist/` alike (and in the image).
 */
export const EGG_FOLDER = fileURLToPath(new URL('../../pictures/eggs/', import.meta.url));

/** The path under which the web server serves them (`GET /eggs/<name>.png`). */
export const EGG_PATH = '/eggs/';

/**
 * The picture of an egg as a post shows it: its address, and the file the message must carry
 * when that address names one of the message (`attachment://<name>.png`).
 */
export interface EggPicture {
  url: string;
  file?: string;
}

/**
 * Where the post of an egg takes the picture of `name` (`raidEggName`) from: the bot's own web
 * server once it listens (`serving`, after `startWebServer` answered true) at a public address
 * that is not this machine's, so that Discord can fetch it; the message itself otherwise, which
 * carries the file. The address has the first eight hex digits of the file's SHA-256 (`?v=`), so
 * that the thirty days a picture may be kept never hide an egg made again.
 */
export class EggPictures {
  private served = false;
  private readonly versions = new Map<string, string>();

  constructor(private readonly settings: Pick<Settings, 'web'>) {}

  /** The web server listens: from now on posts name its pictures. */
  serving(): void {
    this.served = true;
  }

  /** Whether a post may name the web server's pictures yet, which `picture`'s answer follows. */
  get isServed(): boolean {
    return this.served;
  }

  picture(name: string): EggPicture {
    const { web } = this.settings;
    const file = path.join(EGG_FOLDER, `${name}.png`);
    if (!this.served || web === undefined || isLocalAddress(web.publicUrl)) {
      return { url: `attachment://${name}.png`, file };
    }
    return { url: `${web.publicUrl}${EGG_PATH}${name}.png?v=${this.version(name, file)}` };
  }

  private version(name: string, file: string): string {
    let version = this.versions.get(name);
    if (version === undefined) {
      version = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8);
      this.versions.set(name, version);
    }
    return version;
  }
}
