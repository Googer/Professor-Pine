import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deviceProblem, type OcrAssetPaths, type OcrDevice } from '../domain/ocr/assets.js';
import type { Logger } from '../log.js';
import type { ReadRequest, WorkerMessage, WorkerStart } from '../ocr/protocol.js';
import type { PaneReading, ScreenReading } from '../ocr/screen-reader.js';

export type OcrOutcome =
  | {
      kind: 'read';
      /** The whole picture read as one screen. */
      reading: ScreenReading;
      /** The panes of a split screen, each read as a screenshot of its own (plan 7P). */
      panes?: readonly PaneReading[];
      /** How the panes were found. */
      cut?: 'divider' | 'text';
      /** The whole reading shows two screens (`twoScreens`); absent: it does not. */
      twoScreens?: boolean;
      /** A cut's panes were not read for lack of time (`PictureReading.late`). */
      late?: true;
    }
  /** More screenshots wait than `queue` allows: try again shortly. */
  | { kind: 'busy' }
  /** The reader cannot run: its files could not be had, or its process did not start. */
  | { kind: 'unavailable' }
  /** Not a picture the reader reads (PNG, JPEG or WebP of a phone's proportions, at most 32 MB). */
  | { kind: 'not-an-image' }
  /** The reading failed or took longer than allowed. */
  | { kind: 'failed' };

/**
 * The largest screenshot read: anything larger is answered as no image without being queued (a
 * phone's screenshot is a few MB). The download of an attachment uses the same limit.
 */
export const MAX_SCREENSHOT_BYTES = 32 * 1024 * 1024;

export interface ReadOptions {
  /** Called once when the screenshot has to wait, with how many are ahead of it. */
  onQueued?: (ahead: number) => void;
  /**
   * A screenshot whose turn comes after this time (epoch milliseconds) is not read but answered
   * `busy`: its interaction could no longer be answered when the reading was done.
   */
  startBy?: number;
  /** False: no divider is looked for (`ocr:check --no-divider`, the foldable's path). */
  divider?: boolean;
}

/** Reading raid screenshots (Phase 7): one at a time, in a process of its own. */
export interface ScreenshotReader {
  read(bytes: Uint8Array, options?: ReadOptions): Promise<OcrOutcome>;
  /**
   * As many screenshots wait already as the queue holds: the next would be answered `busy`.
   * Asked before a screenshot is downloaded, so that none is downloaded in vain.
   */
  full(): boolean;
  /** For shutdown: what waits is answered `unavailable`, the process is ended. */
  close(): Promise<void>;
}

/** What the service needs of `OcrAssets`. */
export interface ReaderFiles {
  /** The files' paths once each is there and right; asked before every start. */
  ensure(): Promise<OcrAssetPaths | undefined>;
}

export interface OcrServiceOptions {
  assets: ReaderFiles;
  device: OcrDevice;
  threads: number;
  priority: 'low' | 'normal';
  /** How many screenshots may wait while one is read. */
  queue: number;
  /** How long one screenshot may take. */
  timeoutMs: number;
  log: Logger;
  /** How long the process may take to load the models. Two minutes. */
  startTimeoutMs?: number;
  /** After a start that failed, no new one is tried for this long. Ten minutes. */
  startRetryMs?: number;
  /** The process ends after this long without work, and gives its memory back. Ten minutes. */
  idleMs?: number;
  /** The reading process's file; the bot's own `src/ocr/worker` by default (tests give a fake). */
  workerFile?: string;
  now?: () => number;
  /** Where the bot runs (`process.platform` and `process.arch`); for tests. */
  platform?: { os: string; arch: string };
}

const here = fileURLToPath(import.meta.url);
const WORKER = path.join(path.dirname(here), '..', 'ocr', `worker${path.extname(here)}`);
/**
 * The share of `timeoutMs` the reading process must foresee a split screenshot's panes to end
 * within, or it reads none (plan 7P, review R2): it foresees them by what the whole reading
 * took for its pixels, so a share near the timeout is safe; the rest is room for the handing
 * over and a misjudged pane.
 */
const PANES_WITHIN = 0.85;
/** A process asked to end is killed outright after this long. */
const KILL_AFTER_MS = 2_000;

/**
 * The environment of the reading process: only what starting Node and the device needs. It
 * parses images members send, so it gets none of the bot's secrets (token, database, keys).
 */
const PASSED_ENV = new Set(
  [
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'SYSTEMDRIVE',
    'WINDIR',
    'TEMP',
    'TMP',
    'TMPDIR',
    'HOME',
    'USERPROFILE',
    'LANG',
    'LD_LIBRARY_PATH',
    'CUDA_PATH',
    'CUDA_HOME',
    'CUDA_VISIBLE_DEVICES',
    'NVIDIA_VISIBLE_DEVICES',
    'NVIDIA_DRIVER_CAPABILITIES',
  ].map((name) => name.toUpperCase()),
);

export function workerEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Windows spells them as it likes (`Path`, `SystemRoot`): names are compared in capitals.
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => PASSED_ENV.has(name.toUpperCase())),
  );
}

interface Job {
  bytes: Uint8Array;
  startBy: number | undefined;
  divider: boolean;
  resolve: (outcome: OcrOutcome) => void;
}

interface Worker {
  child: ChildProcess;
  /** Resolved with true once the models are loaded, false when the process could not start. */
  ready: Promise<boolean>;
  /** Resolved once the process has exited. */
  exited: Promise<void>;
  /**
   * Answers the request in work, if any: `unsent` when the process ended before it said it had
   * the request (`received`), `exited` when it ended after.
   */
  answer?: (message: WorkerMessage | 'exited' | 'unsent') => void;
  /** The bot is ending it: its exit is no news. */
  stopping: boolean;
}

/**
 * The bot's side of the reader: a queue of screenshots, read one after the other by a child
 * process (`src/ocr/worker.ts`) that is started on first use with the device, threads and
 * priority of the settings, ended after `timeoutMs` on a screenshot that takes too long (and
 * started anew for the next), and ended after `idleMs` without work. `read` never throws, and
 * nothing the process does (dying, refusing a message) reaches the bot as an error. A process
 * that could not start is not tried again for `startRetryMs`; a device this platform does not
 * have is refused once and for all. A process run from TypeScript (development, tests) is
 * started through tsx.
 */
export class OcrService implements ScreenshotReader {
  private readonly waiting: Job[] = [];
  private busy = false;
  private closed = false;
  private worker: Worker | undefined;
  private idleTimer: NodeJS.Timeout | undefined;
  private nextId = 1;
  private startFailedAt: number | undefined;
  private readonly now: () => number;
  private readonly noDevice: string | undefined;

  constructor(private readonly options: OcrServiceOptions) {
    this.now = options.now ?? Date.now;
    const platform = options.platform ?? { os: process.platform, arch: process.arch };
    this.noDevice = deviceProblem(options.device, platform.os, platform.arch);
    if (this.noDevice) {
      options.log.error(
        { device: options.device, reason: this.noDevice },
        'the screenshot reader cannot use this device; screenshots are not read',
      );
    }
  }

  read(bytes: Uint8Array, options: ReadOptions = {}): Promise<OcrOutcome> {
    if (this.closed || this.noDevice) return Promise.resolve({ kind: 'unavailable' });
    if (bytes.byteLength > MAX_SCREENSHOT_BYTES) return Promise.resolve({ kind: 'not-an-image' });
    if (this.full()) return Promise.resolve({ kind: 'busy' });
    return new Promise((resolve) => {
      if (this.busy) {
        try {
          options.onQueued?.(this.waiting.length + 1);
        } catch (err) {
          this.options.log.error({ err }, 'a waiting screenshot could not be told so');
        }
      }
      this.waiting.push({
        bytes,
        startBy: options.startBy,
        divider: options.divider ?? true,
        resolve,
      });
      void this.pump();
    });
  }

  full(): boolean {
    return this.busy && this.waiting.length >= this.options.queue;
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.waiting.splice(0)) job.resolve({ kind: 'unavailable' });
    await this.stopWorker();
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    const job = this.waiting.shift();
    if (!job) return;
    if (job.startBy !== undefined && this.now() > job.startBy) {
      job.resolve({ kind: 'busy' });
      void this.pump();
      return;
    }
    this.busy = true;
    clearTimeout(this.idleTimer);
    let outcome: OcrOutcome;
    try {
      outcome = await this.readNow(job.bytes, job.divider);
    } catch (err) {
      this.options.log.error({ err }, 'the screenshot reader failed');
      outcome = { kind: 'failed' };
    }
    job.resolve(outcome);
    this.busy = false;
    if (this.waiting.length > 0) {
      void this.pump();
    } else if (this.worker && !this.closed) {
      this.idleTimer = setTimeout(() => void this.stopWorker(), this.options.idleMs ?? 10 * 60_000);
      this.idleTimer.unref();
    }
  }

  private async readNow(bytes: Uint8Array, divider: boolean, again = false): Promise<OcrOutcome> {
    // A process that died while idle may not have said so yet.
    if (this.worker && !this.worker.child.connected) await this.stopWorker();
    const worker = this.worker ?? (await this.startWorker());
    if (!worker || !(await worker.ready) || this.closed) return { kind: 'unavailable' };
    const id = this.nextId++;
    const started = this.now();
    const answer = await new Promise<WorkerMessage | 'exited' | 'unsent' | 'timeout'>((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), this.options.timeoutMs);
      let received = false;
      worker.answer = (message) => {
        // An answer to another request (one that timed out) is not this one's.
        if (typeof message !== 'string' && 'id' in message && message.id !== id) return;
        if (typeof message !== 'string' && message.kind === 'received') {
          received = true;
          return;
        }
        if (message === 'exited' && !received) message = 'unsent';
        clearTimeout(timer);
        resolve(message);
      };
      const request: ReadRequest = {
        kind: 'read',
        id,
        bytes,
        ...(divider ? {} : { divider }),
        // A time relative to the request's arrival: the reading process judges it by its own
        // clock (review R3).
        panesWithinMs: this.options.timeoutMs * PANES_WITHIN,
      };
      worker.child.send(request, (err) => {
        if (err) worker.answer?.('unsent');
      });
    });
    worker.answer = undefined;
    const ms = this.now() - started;
    if (answer === 'unsent' && !again && !this.closed) {
      // The process kept from earlier work died before it saw this screenshot (killed while
      // idle): one more try with a new one. A process that died with the screenshot in its
      // hands is not given it again.
      await this.stopWorker();
      return this.readNow(bytes, divider, true);
    }
    if (answer === 'timeout' || answer === 'exited' || answer === 'unsent') {
      if (!this.closed) {
        this.options.log.warn(
          { ms, reason: answer },
          'the screenshot reader stopped; it starts anew',
        );
      }
      await this.stopWorker();
      return { kind: 'failed' };
    }
    switch (answer.kind) {
      case 'read':
        this.options.log.info({ ms, readMs: answer.reading.ms }, 'read a screenshot');
        if (answer.late) {
          this.options.log.info(
            { ms, readMs: answer.reading.ms },
            'read a screenshot without its panes, for lack of time',
          );
        }
        return {
          kind: 'read',
          reading: answer.reading,
          ...(answer.panes ? { panes: answer.panes, cut: answer.cut ?? 'divider' } : {}),
          ...(answer.twoScreens ? { twoScreens: true } : {}),
          ...(answer.late ? { late: true } : {}),
        };
      case 'not-an-image':
        return { kind: 'not-an-image' };
      case 'failed':
        this.options.log.warn({ reason: answer.reason }, 'could not read a screenshot');
        return { kind: 'failed' };
      default:
        return { kind: 'failed' };
    }
  }

  /** Starts the process once the files are there; undefined when it cannot or may not. */
  private async startWorker(): Promise<Worker | undefined> {
    const retryMs = this.options.startRetryMs ?? 10 * 60_000;
    if (this.startFailedAt !== undefined && this.now() - this.startFailedAt < retryMs) {
      return undefined;
    }
    const paths = await this.options.assets.ensure();
    if (!paths || this.closed) return undefined;
    const start: WorkerStart = {
      paths,
      device: this.options.device,
      threads: this.options.threads,
      priority: this.options.priority,
    };
    const file = this.options.workerFile ?? WORKER;
    const child = fork(file, [JSON.stringify(start)], {
      serialization: 'advanced',
      env: workerEnvironment(process.env),
      execArgv:
        path.extname(file) === '.ts'
          ? ['--conditions=pine-source', '--import', import.meta.resolve('tsx')]
          : ['--enable-source-maps'],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let said = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      said = (said + chunk.toString('utf8')).slice(-2000);
    });
    let started = false;
    let markExited: () => void = () => undefined;
    const worker: Worker = {
      child,
      stopping: false,
      exited: new Promise((resolve) => {
        markExited = resolve;
      }),
      ready: new Promise((resolve) => {
        const timer = setTimeout(() => {
          this.options.log.error('the screenshot reader did not start in time');
          resolve(false);
        }, this.options.startTimeoutMs ?? 120_000);
        const gone = () => {
          clearTimeout(timer);
          if (this.worker === worker) this.worker = undefined;
          resolve(false);
          worker.answer?.('exited');
        };
        let failedToStart = false;
        child.on('message', (message: WorkerMessage) => {
          if (message.kind === 'ready') {
            clearTimeout(timer);
            started = true;
            this.options.log.info(
              { loadMs: message.loadMs, device: start.device },
              'the screenshot reader started',
            );
            resolve(true);
          } else if (message.kind === 'start-failed') {
            clearTimeout(timer);
            failedToStart = true;
            this.options.log.error(
              { reason: message.reason },
              'the screenshot reader could not start',
            );
            resolve(false);
          } else {
            worker.answer?.(message);
          }
        });
        child.on('error', (err) => {
          this.options.log.error({ err }, 'the screenshot reader process failed');
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          gone();
        });
        child.on('exit', (code, signal) => {
          markExited();
          const expected = this.closed || worker.stopping || failedToStart;
          if (!expected && (signal !== null || (code !== 0 && code !== null))) {
            this.options.log.warn(
              {
                code,
                signal,
                during: started ? 'work' : 'start',
                ...(said ? { stderr: said.slice(-500) } : {}),
              },
              'the screenshot reader exited',
            );
          }
          gone();
        });
      }),
    };
    this.worker = worker;
    if (!(await worker.ready)) {
      this.startFailedAt = this.now();
      await this.stopWorker();
      return undefined;
    }
    this.startFailedAt = undefined;
    return worker;
  }

  /** Ends the process, if any, and waits for it: killed outright when it does not go. */
  private async stopWorker(): Promise<void> {
    clearTimeout(this.idleTimer);
    const worker = this.worker;
    this.worker = undefined;
    if (!worker) return;
    worker.stopping = true;
    worker.child.removeAllListeners('message');
    const { child } = worker;
    // Never started (a spawn that failed), or already gone.
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    const killer = setTimeout(() => child.kill('SIGKILL'), KILL_AFTER_MS);
    const giveUp = new Promise<void>((resolve) => setTimeout(resolve, 2 * KILL_AFTER_MS).unref());
    await Promise.race([worker.exited, giveUp]);
    clearTimeout(killer);
  }
}
