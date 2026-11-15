import { readdirSync, readFileSync } from 'node:fs';
import { constants } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { OcrAssetPaths } from '../domain/ocr/assets.js';
import {
  OcrService,
  MAX_SCREENSHOT_BYTES,
  workerEnvironment,
  type OcrOutcome,
  type OcrServiceOptions,
} from './ocr-service.js';

const FAKE_WORKER = path.resolve(import.meta.dirname, '../../test/support/ocr-worker.ts');
const PATHS: OcrAssetPaths = {
  detector: 'det.onnx',
  recogniser: 'rec.onnx',
  dictionary: 'keys.txt',
  headIcon: 'head.png',
};

const made: OcrService[] = [];
afterEach(async () => {
  await Promise.all(made.splice(0).map((service) => service.close()));
});

function service(options: Partial<OcrServiceOptions> & { paths?: OcrAssetPaths | undefined } = {}) {
  const { log, entries } = createTestLogger();
  const { paths: given, ...rest } = options;
  const paths = 'paths' in options ? given : PATHS;
  let ensured = 0;
  const ocr = new OcrService({
    assets: {
      ensure: () => {
        ensured++;
        return Promise.resolve(paths);
      },
    },
    device: 'cpu',
    threads: 0,
    priority: 'normal',
    queue: 2,
    timeoutMs: 8_000,
    log,
    workerFile: FAKE_WORKER,
    ...rest,
  });
  made.push(ocr);
  return { ocr, entries, ensured: () => ensured };
}

const bytes = (text: string) => new TextEncoder().encode(text);
const gymOf = (outcome: OcrOutcome) =>
  outcome.kind === 'read' ? outcome.reading.text.gym : outcome.kind;
/** The id of the process that read it; fails the test when it was not read. */
function pidOf(outcome: OcrOutcome): number {
  expect(outcome.kind).toBe('read');
  return outcome.kind === 'read' ? outcome.reading.width : -1;
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('OcrService', () => {
  it('answers busy for a screenshot whose turn comes too late to be answered', async () => {
    const clock = { now: 1_000 };
    const { ocr } = service({ now: () => clock.now });
    expect(await ocr.read(bytes('late'), { startBy: 999 })).toEqual({ kind: 'busy' });
    const first = ocr.read(bytes('one'));
    const second = ocr.read(bytes('two'), { startBy: 1_500 });
    clock.now = 2_000;
    expect(gymOf(await first)).toBe('one');
    expect(await second).toEqual({ kind: 'busy' });
    expect(gymOf(await ocr.read(bytes('three'), { startBy: 3_000 }))).toBe('three');
  });

  it('reads screenshots one after the other in one process, telling who waits how many are ahead', async () => {
    const { ocr } = service();
    const ahead: number[] = [];
    const outcomes = await Promise.all(
      ['one', 'two', 'three'].map((text) =>
        ocr.read(bytes(text), { onQueued: (n) => ahead.push(n) }),
      ),
    );
    expect(outcomes.map(gymOf)).toEqual(['one', 'two', 'three']);
    expect(ahead).toEqual([1, 2]);
    expect(new Set(outcomes.map(pidOf)).size).toBe(1);
  });

  it('hands a screenshot of several megabytes over whole', async () => {
    const { ocr } = service();
    expect(gymOf(await ocr.read(new Uint8Array(6_000_000).fill(7)))).toBe('6000000');
  });

  it('answers busy beyond the queue', async () => {
    const { ocr } = service({ queue: 1 });
    const first = ocr.read(bytes('one'));
    const second = ocr.read(bytes('two'));
    expect(await ocr.read(bytes('three'))).toEqual({ kind: 'busy' });
    expect((await Promise.all([first, second])).map(gymOf)).toEqual(['one', 'two']);
  });

  it('says it is full once as many screenshots wait as the queue holds', async () => {
    const { ocr } = service({ queue: 1 });
    expect(ocr.full()).toBe(false);
    const first = ocr.read(bytes('one'));
    expect(ocr.full()).toBe(false);
    const second = ocr.read(bytes('two'));
    expect(ocr.full()).toBe(true);
    await Promise.all([first, second]);
    expect(ocr.full()).toBe(false);
  });

  it('takes turns between servers, and lets each have so many waiting at most (plan 19B-5)', async () => {
    const HOME = '412345678901234567';
    const AWAY = '412345678901234568';
    const { ocr } = service({ queue: 10, queuePerServer: 2 });
    const order: string[] = [];
    const read = (text: string, server: string) =>
      ocr.read(bytes(text), { server }).then((outcome) => {
        order.push(String(gymOf(outcome)));
        return outcome;
      });
    // The first is read at once; two more of Home wait, and that is all Home may have waiting.
    const home = [read('h0', HOME), read('h1', HOME), read('h2', HOME)];
    expect(ocr.full(HOME)).toBe(true);
    expect(ocr.full(AWAY)).toBe(false);
    expect(await ocr.read(bytes('h3'), { server: HOME })).toEqual({ kind: 'busy' });
    // Away's screenshot comes last and is read before Home's second waiting one.
    const away = read('a1', AWAY);
    await Promise.all([...home, away]);
    expect(order).toEqual(['h0', 'h1', 'a1', 'h2']);
  });

  it('lets one server have the whole queue waiting when no share of a server is set', async () => {
    const HOME = '412345678901234567';
    const { ocr } = service({ queue: 3 });
    const reads = ['h0', 'h1', 'h2', 'h3'].map((text) => ocr.read(bytes(text), { server: HOME }));
    expect(ocr.full(HOME)).toBe(true);
    expect(await ocr.read(bytes('h4'), { server: HOME })).toEqual({ kind: 'busy' });
    expect((await Promise.all(reads)).map(gymOf)).toEqual(['h0', 'h1', 'h2', 'h3']);
  });

  it('tells a waiting screenshot at most how many are ahead of it, by the turns', async () => {
    const HOME = '412345678901234567';
    const AWAY = '412345678901234568';
    const { ocr } = service({ queue: 10, queuePerServer: 5 });
    const ahead: number[] = [];
    const reads = [
      ocr.read(bytes('h0'), { server: HOME }),
      ...['h1', 'h2', 'h3'].map((text) => ocr.read(bytes(text), { server: HOME })),
      ocr.read(bytes('a1'), { server: AWAY, onQueued: (n) => ahead.push(n) }),
    ];
    await Promise.all(reads);
    // The one in hand and Home's next: Away's first turn comes after them.
    expect(ahead).toEqual([2]);
  });

  it('is not upset by a waiting reader whose callback throws', async () => {
    const { ocr } = service();
    const first = ocr.read(bytes('one'));
    const second = ocr.read(bytes('two'), {
      onQueued: () => {
        throw new Error('gone');
      },
    });
    expect((await Promise.all([first, second])).map(gymOf)).toEqual(['one', 'two']);
  });

  it('answers what is not an image, and a failed reading, and goes on', async () => {
    const { ocr } = service();
    expect(await ocr.read(bytes('not'))).toEqual({ kind: 'not-an-image' });
    expect(await ocr.read(bytes('fail'))).toEqual({ kind: 'failed' });
    expect(gymOf(await ocr.read(bytes('fine')))).toBe('fine');
  });

  it('hands over the panes of a split screen, and whether the whole shows two screens', async () => {
    const { ocr } = service();
    const split = await ocr.read(bytes('split'));
    expect(split.kind === 'read' && split.panes?.map((pane) => pane.reading.text.gym)).toEqual([
      'pane 1',
      'pane 2',
    ]);
    expect(split).toMatchObject({ cut: 'divider', twoScreens: true });
    expect(await ocr.read(bytes('two'))).toMatchObject({ kind: 'read', twoScreens: true });
    const one = await ocr.read(bytes('one'));
    expect(one.kind === 'read' && [one.panes, one.twoScreens]).toEqual([undefined, undefined]);
  });

  it('gives the reading process a budget for the panes, 85% of its time from the request', async () => {
    const { ocr } = service({ timeoutMs: 8_000 });
    expect(gymOf(await ocr.read(bytes('budget?')))).toBe('panes within 6800');
  });

  it('says so in the log when a picture was read without its panes for lack of time', async () => {
    const { ocr, entries } = service();
    expect(await ocr.read(bytes('late'))).toMatchObject({
      kind: 'read',
      late: true,
      twoScreens: true,
    });
    expect(
      entries.some(
        (entry) => entry.msg === 'read a screenshot without its panes, for lack of time',
      ),
    ).toBe(true);
  });

  it('asks the reading process to look for no divider when told so', async () => {
    const { ocr } = service();
    expect(gymOf(await ocr.read(bytes('divider?')))).toBe('divider on');
    expect(gymOf(await ocr.read(bytes('divider?'), { divider: false }))).toBe('divider off');
  });

  it('ends a process that takes too long or dies, and starts a new one for the next screenshot', async () => {
    const { ocr, entries } = service({ timeoutMs: 1_500 });
    const before = pidOf(await ocr.read(bytes('before')));
    expect(await ocr.read(bytes('hang'))).toEqual({ kind: 'failed' });
    expect(alive(before)).toBe(false);
    const after = pidOf(await ocr.read(bytes('after')));
    expect(after).not.toBe(before);
    expect(await ocr.read(bytes('crash'))).toEqual({ kind: 'failed' });
    expect(pidOf(await ocr.read(bytes('again')))).not.toBe(after);
    expect(entries.some((e) => e.msg === 'the screenshot reader stopped; it starts anew')).toBe(
      true,
    );
    // The process that died with the screenshot is not given it again: one exit, not two.
    expect(entries.filter((e) => e.msg === 'the screenshot reader exited')).toEqual([
      expect.objectContaining({ code: 3, during: 'work' }),
    ]);
  });

  it('starts a new process when the idle one was killed from outside', async () => {
    const { ocr } = service();
    const first = pidOf(await ocr.read(bytes('one')));
    process.kill(first);
    expect(pidOf(await ocr.read(bytes('two')))).not.toBe(first);
  });

  it('ends the process after a while without work', async () => {
    const { ocr, entries } = service({ idleMs: 200 });
    const first = pidOf(await ocr.read(bytes('one')));
    // eslint-disable-next-line no-restricted-syntax -- a real child process: its end after the idle time is seen by no fake
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(alive(first)).toBe(false);
    expect(pidOf(await ocr.read(bytes('two')))).not.toBe(first);
    // Ending an idle process is no news.
    expect(entries.some((e) => e.level === 40)).toBe(false);
  });

  it('lowers the priority of the process when asked to', async () => {
    const { ocr } = service({ priority: 'low' });
    const outcome = await ocr.read(bytes('low'));
    expect(outcome.kind === 'read' && outcome.reading.height).toBe(
      constants.priority.PRIORITY_BELOW_NORMAL,
    );
  });

  it.runIf(process.platform === 'linux')(
    'lowers every thread of the process on Linux',
    async () => {
      const { ocr } = service({ priority: 'low' });
      const pid = pidOf(await ocr.read(bytes('low')));
      for (const task of readdirSync(`/proc/${pid}/task`)) {
        const stat = readFileSync(`/proc/${pid}/task/${task}/stat`, 'utf8');
        // Field 19 is the nice value; the name in brackets may hold spaces.
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        expect(Number(fields[16])).toBe(10);
      }
    },
  );

  it('gives the process none of the bot’s secrets', async () => {
    process.env.PINE_TEST_SECRET = 'token';
    try {
      const { ocr } = service();
      expect(gymOf(await ocr.read(bytes('secret')))).toBe('none');
    } finally {
      delete process.env.PINE_TEST_SECRET;
    }
    expect(
      workerEnvironment({
        PATH: '/bin',
        SystemRoot: 'C:\\Windows',
        CUDA_VISIBLE_DEVICES: '0',
        DISCORD_TOKEN: 'x',
        DB_PASSWORD: 'y',
        NVIDIA_API_KEY: 'z',
      }),
    ).toEqual({ PATH: '/bin', SystemRoot: 'C:\\Windows', CUDA_VISIBLE_DEVICES: '0' });
  });

  it('answers a screenshot larger than 32 MB as no image, without starting the reader', async () => {
    const { ocr, ensured } = service();
    expect(MAX_SCREENSHOT_BYTES).toBe(32 * 1024 * 1024);
    expect(await ocr.read(new Uint8Array(MAX_SCREENSHOT_BYTES + 1))).toEqual({
      kind: 'not-an-image',
    });
    expect(ensured()).toBe(0);
  });

  it('is unavailable without its files', async () => {
    expect(await service({ paths: undefined }).ocr.read(bytes('x'))).toEqual({
      kind: 'unavailable',
    });
  });

  it('logs a start that failed, and does not start again (nor check the files) for a while', async () => {
    let time = 0;
    const { ocr, entries, ensured } = service({
      paths: { ...PATHS, detector: 'cannot-start' },
      now: () => time,
    });
    expect(await ocr.read(bytes('x'))).toEqual({ kind: 'unavailable' });
    expect(entries.find((e) => e.msg === 'the screenshot reader could not start')?.reason).toBe(
      'no such device',
    );
    expect(ensured()).toBe(1);
    time = 60_000;
    expect(await ocr.read(bytes('x'))).toEqual({ kind: 'unavailable' });
    expect(entries.filter((e) => e.msg === 'the screenshot reader could not start')).toHaveLength(
      1,
    );
    expect(ensured()).toBe(1);
    // Its exit after saying so is no second warning.
    expect(entries.some((e) => e.msg === 'the screenshot reader exited')).toBe(false);
    // The next try checks the files again first.
    time = 10 * 60_000;
    expect(await ocr.read(bytes('x'))).toEqual({ kind: 'unavailable' });
    expect(ensured()).toBe(2);
  });

  it('refuses a device this platform does not have, once and for all', async () => {
    const { ocr, entries } = service({
      device: 'directml',
      platform: { os: 'linux', arch: 'x64' },
    });
    expect(await ocr.read(bytes('x'))).toEqual({ kind: 'unavailable' });
    expect(entries.find((e) => String(e.msg).includes('cannot use this device'))?.reason).toBe(
      'DirectML runs on Windows only',
    );
  });

  it('answers start-failed from the real reading process when the model files are not there', async () => {
    const { log, entries } = createTestLogger();
    const ocr = new OcrService({
      assets: {
        ensure: () =>
          Promise.resolve({
            detector: path.join(import.meta.dirname, 'no-such-detector.onnx'),
            recogniser: 'none',
            dictionary: 'none',
            headIcon: 'none',
          }),
      },
      device: 'cpu',
      threads: 0,
      priority: 'normal',
      queue: 2,
      timeoutMs: 8_000,
      log,
    });
    made.push(ocr);
    expect(await ocr.read(bytes('x'))).toEqual({ kind: 'unavailable' });
    expect(entries.some((e) => e.msg === 'the screenshot reader could not start')).toBe(true);
  });

  it('answers what waits as unavailable once closed, and leaves no process behind', async () => {
    const { ocr } = service();
    // A first read starts the process, so the next is in its hands when the service closes.
    const pid = pidOf(await ocr.read(bytes('warm')));
    const first = ocr.read(bytes('hang'));
    const waiting = ocr.read(bytes('two'));
    // eslint-disable-next-line no-restricted-syntax -- the read must reach the real process; nothing tells when it has
    await new Promise((resolve) => setTimeout(resolve, 200));
    await ocr.close();
    expect(await waiting).toEqual({ kind: 'unavailable' });
    expect(await first).toEqual({ kind: 'failed' });
    expect(alive(pid)).toBe(false);
    expect(await ocr.read(bytes('three'))).toEqual({ kind: 'unavailable' });
  });
});
