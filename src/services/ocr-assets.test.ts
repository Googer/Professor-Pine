import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { OcrAsset } from '../domain/ocr/assets.js';
import type { LimitedResponse } from './limited-json.js';
import { OcrAssets, type FetchAsset } from './ocr-assets.js';

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

function asset(name: OcrAsset['name'], file: string, content: string): OcrAsset {
  const bytes = bytesOf(content);
  return {
    name,
    file,
    source: name === 'headIcon' ? 'headIcon' : 'models',
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

const CONTENT: Record<string, string> = {
  'https://models.example.test/m/det.onnx': 'detector',
  'https://models.example.test/m/rec.onnx': 'recogniser',
  'https://models.example.test/m/keys.txt': 'a\nb\n',
  'https://icons.example.test/head.png': 'head',
};

const ASSETS: OcrAsset[] = [
  asset('detector', 'det.onnx', 'detector'),
  asset('recogniser', 'rec.onnx', 'recogniser'),
  asset('dictionary', 'keys.txt', 'a\nb\n'),
  asset('headIcon', 'head.png', 'head'),
];

function response(body: string | undefined, declared?: number): LimitedResponse {
  const bytes = bytesOf(body ?? '');
  let sent = false;
  return {
    status: body === undefined ? 404 : 200,
    headers: { get: (name) => (name === 'content-length' && declared ? String(declared) : null) },
    body: {
      getReader: () => ({
        read: () => {
          if (sent) return Promise.resolve({ done: true });
          sent = true;
          return Promise.resolve({ done: false, value: bytes });
        },
        cancel: () => Promise.resolve(),
      }),
    },
  };
}

function assets(
  options: { content?: Record<string, string>; now?: () => number; declared?: number } = {},
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pine-ocr-assets-'));
  const asked: string[] = [];
  const content = options.content ?? CONTENT;
  const fetch: FetchAsset = (url) => {
    asked.push(url);
    return Promise.resolve(response(content[url], options.declared));
  };
  const { log, entries } = createTestLogger();
  const made = new OcrAssets({
    dir,
    modelsUrl: 'https://models.example.test/m/',
    headIconUrl: 'https://icons.example.test/head.png',
    fetch,
    log,
    assets: ASSETS,
    ...(options.now ? { now: options.now } : {}),
  });
  return { made, dir, asked, entries };
}

describe('OcrAssets', () => {
  it('downloads the missing files once and answers their paths', async () => {
    const { made, dir, asked } = assets();
    const paths = await made.ensure();
    expect(paths).toEqual({
      detector: path.join(dir, 'det.onnx'),
      recogniser: path.join(dir, 'rec.onnx'),
      dictionary: path.join(dir, 'keys.txt'),
      headIcon: path.join(dir, 'head.png'),
    });
    expect(readFileSync(path.join(dir, 'keys.txt'), 'utf8')).toBe('a\nb\n');
    expect(asked).toHaveLength(4);
    await made.ensure();
    expect(asked).toHaveLength(4);
  });

  it('keeps a file that is already right and replaces one that is not', async () => {
    const { made, dir, asked } = assets();
    writeFileSync(path.join(dir, 'det.onnx'), 'detector');
    writeFileSync(path.join(dir, 'rec.onnx'), 'recogniseR');
    await made.ensure();
    expect(asked).not.toContain('https://models.example.test/m/det.onnx');
    expect(asked).toContain('https://models.example.test/m/rec.onnx');
    expect(readFileSync(path.join(dir, 'rec.onnx'), 'utf8')).toBe('recogniser');
  });

  it('refuses a download that is not the file it should be, and logs which', async () => {
    const { made, dir, entries } = assets({
      content: { ...CONTENT, 'https://icons.example.test/head.png': 'a new head' },
    });
    expect(await made.ensure()).toBeUndefined();
    expect(() => readFileSync(path.join(dir, 'head.png'))).toThrow();
    const logged = entries.find((entry) => entry.level === 50);
    expect(logged?.reason).toMatch(/head\.png/);
  });

  it('stops reading a download that is longer than the file it should be', async () => {
    const long = { ...CONTENT, 'https://models.example.test/m/det.onnx': 'detector and more' };
    const { made, entries } = assets({ content: long });
    expect(await made.ensure()).toBeUndefined();
    expect(entries.find((entry) => entry.level === 50)?.reason).toBe('det.onnx: too-large');
    const declared = assets({ declared: 1_000_000 });
    expect(await declared.made.ensure()).toBeUndefined();
  });

  it('checks the files again every time, and downloads one that changed on disk', async () => {
    const { made, dir, asked } = assets();
    await made.ensure();
    writeFileSync(path.join(dir, 'keys.txt'), 'broken');
    await made.ensure();
    expect(asked).toHaveLength(5);
    expect(readFileSync(path.join(dir, 'keys.txt'), 'utf8')).toBe('a\nb\n');
    await made.ensure();
    expect(asked).toHaveLength(5);
  });

  it('asks again only after the pause that follows a failure', async () => {
    let time = 0;
    const content: Record<string, string> = { ...CONTENT };
    delete content['https://models.example.test/m/rec.onnx'];
    const { made, asked } = assets({ content, now: () => time });
    expect(await made.ensure()).toBeUndefined();
    const first = asked.length;
    time = 60_000;
    expect(await made.ensure()).toBeUndefined();
    expect(asked).toHaveLength(first);
    content['https://models.example.test/m/rec.onnx'] = 'recogniser';
    time = 10 * 60_000;
    expect(await made.ensure()).toBeDefined();
  });

  it('shares one check between calls at the same time', async () => {
    const { made, asked } = assets();
    const [one, two] = await Promise.all([made.ensure(), made.ensure()]);
    expect(one).toEqual(two);
    expect(asked).toHaveLength(4);
  });
});
