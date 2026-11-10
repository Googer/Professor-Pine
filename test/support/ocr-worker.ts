/**
 * A made-up reading process for the tests of `OcrService`: it speaks the protocol of
 * `src/ocr/worker.ts` without models. What it does depends on the screenshot's bytes as text:
 * `hang` never answers, `crash` exits, `not` is not an image, `fail` fails, anything else is read
 * as a reading whose gym is that text (or its length, for more than a kilobyte), whose `width` is
 * this process's id and whose `height` its priority; `split` has two panes read (gyms `pane 1`
 * and `pane 2`), `two` shows two screens without panes (plan 7P), and `divider?` is read with
 * the gym `divider on` or `divider off` as the request asked, `budget?` with `panes within <n>`
 * (the request's time for the panes), and `late` as a split read without its panes. A start whose detector path is
 * `cannot-start` fails to start. The text `secret` is answered with the value of the environment
 * variable `PINE_TEST_SECRET` as the gym (`none` when the process does not have it).
 */
import { getPriority } from 'node:os';
import type { ReadRequest, WorkerMessage, WorkerStart } from '../../src/ocr/protocol.js';
import { applyPriority } from '../../src/ocr/protocol.js';

const send = (message: WorkerMessage) => process.send?.(message);
const start = JSON.parse(process.argv[2] ?? '{}') as WorkerStart;
applyPriority(start.priority);
if (start.paths.detector === 'cannot-start') {
  process.send?.(
    { kind: 'start-failed', reason: 'no such device' } satisfies WorkerMessage,
    undefined,
    undefined,
    () => process.exit(1),
  );
} else {
  send({ kind: 'ready', loadMs: 1 });
}

process.on('message', (request: ReadRequest) => {
  send({ kind: 'received', id: request.id });
  const text =
    request.bytes.byteLength > 1024
      ? String(request.bytes.byteLength)
      : new TextDecoder().decode(request.bytes);
  if (text === 'hang') return;
  if (text === 'crash') process.exit(3);
  if (text === 'not') return send({ kind: 'not-an-image', id: request.id });
  if (text === 'fail') return send({ kind: 'failed', id: request.id, reason: 'broken' });
  const gym =
    text === 'secret'
      ? (process.env.PINE_TEST_SECRET ?? 'none')
      : text === 'divider?'
        ? `divider ${request.divider === false ? 'off' : 'on'}`
        : text === 'budget?'
          ? `panes within ${String(request.panesWithinMs)}`
          : text;
  send({
    kind: 'read',
    id: request.id,
    reading: readingOf(gym),
    twoScreens: text === 'split' || text === 'two' || text === 'late',
    ...(text === 'late' ? { late: true } : {}),
    ...(text === 'split'
      ? {
          cut: 'divider' as const,
          panes: [1, 2].map((index) => ({
            index,
            of: 2,
            box: { x0: 0, y0: (index - 1) * 50, x1: 100, y1: index * 50 },
            shows: 'raid' as const,
            reading: readingOf(`pane ${index}`),
          })),
        }
      : {}),
  });
});

/** A reading whose gym is `gym`, its width this process's id and its height its priority. */
function readingOf(gym: string) {
  return {
    width: process.pid,
    height: getPriority(),
    text: {
      clock: null,
      countdown: null,
      gym,
      eliteBadge: false,
      cp: null,
      bossName: null,
      countdownBox: null,
      countdownPlace: null,
      cpBox: null,
    },
    band: null,
    heads: null,
    purple: 0,
    lines: [],
    status: [],
    ms: 1,
    peakMb: 1,
  };
}
process.on('disconnect', () => process.exit(0));
