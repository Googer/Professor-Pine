/**
 * The reading process: started by `OcrService` with `fork`, it lowers its own priority (before
 * onnxruntime starts its threads, which inherit it), loads the models once and reads one
 * screenshot per request until the bot disconnects. It writes no log of its own: what goes wrong
 * is answered to the bot, which logs it.
 */
import sharp from 'sharp';
import { failureReason } from '../services/failure-reason.js';
import { loadTextModels } from './onnx-models.js';
import {
  applyPriority,
  type ReadRequest,
  type WorkerMessage,
  type WorkerStart,
} from './protocol.js';
import { loadHeadTemplate, NotAnImageError, readPicture } from './screen-reader.js';
import { textReader, type ReadText } from './text-reader.js';
import type { HeadTemplate } from '../domain/ocr/tier-heads.js';

function send(message: WorkerMessage, then?: () => void): void {
  process.send?.(message, undefined, undefined, () => then?.());
}

async function main(): Promise<void> {
  const start = JSON.parse(process.argv[2] ?? '{}') as WorkerStart;
  applyPriority(start.priority);
  // sharp works on as many threads as the models may, and keeps nothing: every file is new.
  sharp.concurrency(start.threads);
  sharp.cache(false);
  const started = performance.now();
  let readText: ReadText;
  let template: HeadTemplate;
  try {
    readText = textReader(await loadTextModels(start.paths, start));
    template = await loadHeadTemplate(start.paths.headIcon);
  } catch (err) {
    // Exit only once the bot has the message: an exit right after a send can lose it.
    send({ kind: 'start-failed', reason: failureReason(err) }, () => process.exit(1));
    return;
  }
  applyPriority(start.priority);
  send({ kind: 'ready', loadMs: Math.round(performance.now() - started) });

  process.on('message', (message: ReadRequest) => {
    send({ kind: 'received', id: message.id });
    void (async () => {
      try {
        const picture = await readPicture(message.bytes, readText, template, {
          ...(message.divider === false ? { divider: false } : {}),
          ...(message.panesWithinMs === undefined ? {} : { panesWithinMs: message.panesWithinMs }),
        });
        send({ kind: 'read', id: message.id, ...picture });
      } catch (err) {
        send(
          err instanceof NotAnImageError
            ? { kind: 'not-an-image', id: message.id }
            : { kind: 'failed', id: message.id, reason: failureReason(err) },
        );
      }
    })();
  });
  process.on('disconnect', () => process.exit(0));
}

void main();
