import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  OCR_ASSETS,
  type OcrAsset,
  type OcrAssetName,
  type OcrAssetPaths,
} from '../domain/ocr/assets.js';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';
import { discardBody, readLimitedBytes, type LimitedResponse } from './limited-json.js';

/** The part of `fetch` the downloads need. */
export type FetchAsset = (url: string, init: { signal: AbortSignal }) => Promise<LimitedResponse>;

export interface OcrAssetsOptions {
  /** Where the files are kept, e.g. `var/ocr`. */
  dir: string;
  /** The folder the models are downloaded from (`settings.ocr.modelsUrl`). */
  modelsUrl: string;
  /** The game's tier head (`settings.ocr.headIconUrl`). */
  headIconUrl: string;
  fetch: FetchAsset;
  log: Logger;
  /** How long one download may take. Default two minutes. */
  timeoutMs?: number;
  /** After a failure, the files are asked for again only this much later. Default ten minutes. */
  retryMs?: number;
  now?: () => number;
  /** The files; `OCR_ASSETS` by default (tests give small ones). */
  assets?: readonly OcrAsset[];
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * The files of the screenshot reader on disk (`OCR_ASSETS`): each is downloaded when it is
 * missing or differs from its hash, and checked before every start of the reading process (tens
 * of milliseconds against a second to load the models), so a file changed on disk while the bot
 * runs is downloaded again. `ensure` never throws: a file that cannot be had is logged and the
 * answer is undefined, and the reader is then unavailable until a later call, at most every
 * `retryMs`. Calls at the same time share one check.
 */
export class OcrAssets {
  private running: Promise<OcrAssetPaths | undefined> | undefined;
  private failedAt: number | undefined;
  private readonly assets: readonly OcrAsset[];
  private readonly now: () => number;

  constructor(private readonly options: OcrAssetsOptions) {
    this.assets = options.assets ?? OCR_ASSETS;
    this.now = options.now ?? Date.now;
  }

  ensure(): Promise<OcrAssetPaths | undefined> {
    if (this.running) return this.running;
    const retryMs = this.options.retryMs ?? 10 * 60_000;
    if (this.failedAt !== undefined && this.now() - this.failedAt < retryMs) {
      return Promise.resolve(undefined);
    }
    this.running = this.check().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async check(): Promise<OcrAssetPaths | undefined> {
    const paths: Partial<Record<OcrAssetName, string>> = {};
    try {
      await mkdir(this.options.dir, { recursive: true });
      for (const asset of this.assets) {
        paths[asset.name] = await this.file(asset);
      }
    } catch (err) {
      this.failedAt = this.now();
      this.options.log.error(
        { reason: failureReason(err) },
        'the files of the screenshot reader could not be had; screenshots are not read',
      );
      return undefined;
    }
    this.failedAt = undefined;
    return paths as OcrAssetPaths;
  }

  /** The asset's path once its file is there and right; downloaded when it is not. */
  private async file(asset: OcrAsset): Promise<string> {
    const target = path.join(this.options.dir, asset.file);
    const present = await readFile(target).catch(() => undefined);
    if (present && present.byteLength === asset.bytes && sha256(present) === asset.sha256) {
      return target;
    }
    const url =
      asset.source === 'models'
        ? new URL(asset.file, this.options.modelsUrl).href
        : this.options.headIconUrl;
    const response = await this.options.fetch(url, {
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 120_000),
    });
    if (response.status !== 200) {
      discardBody(response);
      throw new Error(`${asset.file}: status ${response.status}`);
    }
    // Never more than the file should have: a wrong address cannot fill the bot's memory.
    const read = await readLimitedBytes(response, asset.bytes);
    if (!read.ok) throw new Error(`${asset.file}: ${read.reason}`);
    const { bytes } = read;
    if (bytes.byteLength !== asset.bytes || sha256(bytes) !== asset.sha256) {
      throw new Error(`${asset.file}: not the file Pine was measured with (size or SHA-256)`);
    }
    const temporary = `${target}.${process.pid}.download`;
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    this.options.log.info(
      { file: asset.file, bytes: asset.bytes },
      'downloaded a file of the screenshot reader',
    );
    return target;
  }
}
