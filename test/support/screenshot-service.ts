import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ScreenReading } from '../../src/ocr/screen-reader.js';
import type { OcrOutcome } from '../../src/services/ocr-service.js';
import {
  ScreenshotService,
  type FetchedScreenshot,
  type ScreenshotContext,
  type ScreenshotServiceOptions,
  type ScreenshotOutcome,
  type Screenshots,
  type ScreenshotSource,
  type ScreenshotWhere,
} from '../../src/services/screenshot-service.js';
import { ScreenshotStore } from '../../src/services/screenshot-store.js';
import { FakeAttachments } from './attachments.js';
import { FakeScreenshotReader } from './screenshots.js';
import { createTestContext } from './test-context.js';
import { createTestLogger } from './test-logger.js';

/**
 * A screenshot of one screen read (`readPanes`), as a test of one screen wants it: its one
 * pane's outcome, or why nothing was read (`two-screens` when it showed more than one).
 */
export async function readOne(
  screenshots: Pick<Screenshots, 'readPanes'>,
  source: ScreenshotSource | FetchedScreenshot,
  where: ScreenshotWhere,
): Promise<ScreenshotOutcome> {
  const outcome = await screenshots.readPanes(source, where);
  if (outcome.kind !== 'panes') return outcome;
  const [one, ...more] = outcome.panes;
  return one && more.length === 0 && outcome.held === 0 ? one : { kind: 'two-screens' };
}

/**
 * Screenshots for a test: the service over fake attachments, the fake reader and a store in a
 * folder of its own under the system's temporary folder. `screenshot(name, answer)` gives an
 * attachment whose download is a screenshot that reads as `answer`; `shown` is the set of
 * screenshot ids active raids show (for the store's sweep); `files(folder)` lists `held` or
 * `review`. The bosses, gyms, regions, Power Spots and the rest are the test context's, or those
 * of `context` (`maxReportingWith().ctx` for max battles' screens); `tierWatch` is told what
 * each screenshot says against the boss lists (plan 8X-J).
 */
export function screenshotsWith(
  context: ScreenshotContext = createTestContext().ctx,
  now?: () => number,
  tierWatch?: ScreenshotServiceOptions['tierWatch'],
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pine-screenshots-'));
  const attachments = new FakeAttachments();
  const reader = new FakeScreenshotReader();
  const shown = new Set<string>();
  const { log } = createTestLogger();
  const store = new ScreenshotStore({
    dir,
    reviewDays: 30,
    keepMegabytes: 2048,
    reviewPerDay: 200,
    shown: () => shown,
    gymName: (id) => context.gyms.get(id)?.name,
    log,
    ...(now ? { now } : {}),
  });
  const screenshots = new ScreenshotService({
    attachments,
    reader,
    store,
    context,
    ...(tierWatch ? { tierWatch } : {}),
  });
  const screenshot = (
    name: string,
    answer: ScreenReading | OcrOutcome,
    contentType: string | null = 'image/png',
  ): ScreenshotSource => {
    const bytes = reader.add(name, answer);
    return { url: attachments.add(name, bytes), name, contentType, size: bytes.byteLength };
  };
  const files = (folder: 'held' | 'review') => {
    try {
      return readdirSync(path.join(dir, folder)).sort();
    } catch {
      return [];
    }
  };
  return { screenshots, reader, attachments, store, shown, dir, screenshot, files };
}
