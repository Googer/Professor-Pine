import { readdirSync } from 'node:fs';
import { constants, setPriority } from 'node:os';
import type { OcrAssetPaths, OcrDevice } from '../domain/ocr/assets.js';
import type { PictureReading } from './screen-reader.js';

/**
 * What the bot and its reading process say to each other (`child_process.fork` with the
 * `advanced` serialization, so that a screenshot's bytes cross as they are).
 */

/** How the reading process is started: the one argument after its file, as JSON. */
export interface WorkerStart {
  paths: OcrAssetPaths;
  device: OcrDevice;
  threads: number;
  priority: 'low' | 'normal';
}

/** The bot asks for one screenshot at a time. */
export interface ReadRequest {
  kind: 'read';
  id: number;
  bytes: Uint8Array;
  /** False: no divider is looked for (`PictureOptions.divider`; `ocr:check --no-divider`). */
  divider?: boolean;
  /**
   * The time (milliseconds) from the request's arrival the panes must be read within
   * (`PictureOptions.panesWithinMs`), judged by the reading process's own clock.
   */
  panesWithinMs?: number;
}

export type WorkerMessage =
  /** The models are loaded: the process takes requests. */
  | { kind: 'ready'; loadMs: number }
  /** The request reached the process: if it dies now, it died with the screenshot. */
  | { kind: 'received'; id: number }
  /** The models could not be loaded (a missing device, a broken file); the process exits. */
  | { kind: 'start-failed'; reason: string }
  /** The picture read: the whole of it, and its panes when it was cut (plan 7P). */
  | ({ kind: 'read'; id: number } & PictureReading)
  /** Not a picture the reader can read. */
  | { kind: 'not-an-image'; id: number }
  /** Anything else that went wrong with this screenshot; the process goes on. */
  | { kind: 'failed'; id: number; reason: string };

/**
 * Lowers the priority of the calling process for `low` (below normal: nice 10 on Linux, the
 * class below normal on Windows). On Linux a priority belongs to a thread, and a thread inherits
 * it from the thread that makes it: so the reading process calls this before it loads anything,
 * and again once the models are loaded, when it also lowers every thread it has by then
 * (`/proc/self/task`: Node's own, sharp's and onnxruntime's). Where lowering is not allowed (some
 * containers) the reading goes on as it is.
 */
export function applyPriority(
  priority: WorkerStart['priority'],
  tasks: () => readonly number[] = linuxTasks,
): void {
  if (priority !== 'low') return;
  for (const id of [0, ...tasks()]) {
    try {
      setPriority(id, constants.priority.PRIORITY_BELOW_NORMAL);
    } catch {
      // Not allowed, or the thread has ended: it goes on as it is.
    }
  }
}

/** The ids of this process's threads on Linux; none elsewhere. */
function linuxTasks(): number[] {
  if (process.platform !== 'linux') return [];
  try {
    return readdirSync('/proc/self/task').map(Number).filter(Number.isInteger);
  } catch {
    return [];
  }
}
