import { chmodSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_FILE } from '../domain/script-access/tool-file.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { toolFolder, toolText } from '../../test/support/wayspot-tool.js';
import { WayspotToolFiles } from './wayspot-tool.js';

const T0 = Date.UTC(2026, 9, 19, 12);

describe('WayspotToolFiles', () => {
  it('reads the tool, its version and the changelog’s three newest entries', async () => {
    const { dir } = toolFolder();
    const { log } = createTestLogger();
    const tool = await new WayspotToolFiles({ dir, log }).read();
    expect(tool?.version).toBe('1.2.0');
    expect(tool?.changelog.map((entry) => entry.version)).toEqual(['1.2.0', '1.1.0', '1.0.1']);
    expect(tool?.changelog[0]?.text).toBe('- Fixes <b>one</b> thing.');
  });

  it('has no tool without the file, and none for a file that does not read, said once', async () => {
    const { dir, write } = toolFolder({ script: null });
    const { log, entries } = createTestLogger();
    const files = new WayspotToolFiles({ dir, log });
    expect(await files.read()).toBeUndefined();
    expect(entries).toEqual([]);
    write('script', 'console.log("no header");\n', T0);
    expect(await files.read()).toBeUndefined();
    expect(await files.read()).toBeUndefined();
    expect(entries).toEqual([
      expect.objectContaining({
        level: 40,
        reason: 'it does not open with // ==UserScript==',
        msg: 'the Wayspot export tool file does not read: it is not served',
      }),
    ]);
  });

  it('says a file it cannot read once, and reads it again once it or its permissions change', async () => {
    const { dir, write } = toolFolder();
    write('script', toolText('1.2.0'), T0);
    const { log, entries } = createTestLogger();
    let readable = false;
    const files = new WayspotToolFiles({
      dir,
      log,
      readText: (file) =>
        readable || !file.endsWith(TOOL_FILE)
          ? readFile(file, 'utf8')
          : Promise.reject(new Error('EACCES: permission denied')),
    });
    expect(await files.read()).toBeUndefined();
    expect(await files.read()).toBeUndefined();
    expect(entries).toEqual([
      expect.objectContaining({
        level: 40,
        msg: 'the Wayspot export tool file could not be read',
      }),
    ]);
    readable = true;
    expect(await files.read()).toBeUndefined();
    // chmod a+r: the file's change time moves, its modification time and size do not.
    chmodSync(path.join(dir, TOOL_FILE), 0o400);
    chmodSync(path.join(dir, TOOL_FILE), 0o644);
    expect((await files.read())?.version).toBe('1.2.0');
    expect(entries).toHaveLength(1);
  });

  it('keeps the file until it changes, also when its time and size stay', async () => {
    const { dir, write } = toolFolder({ script: toolText('1.2.0') });
    write('script', toolText('1.2.0'), T0);
    const { log } = createTestLogger();
    let reads = 0;
    const files = new WayspotToolFiles({
      dir,
      log,
      readText: (file) => {
        if (file.endsWith(TOOL_FILE)) reads += 1;
        return readFile(file, 'utf8');
      },
    });
    expect((await files.read())?.version).toBe('1.2.0');
    expect((await files.read())?.version).toBe('1.2.0');
    expect(reads).toBe(1);
    // Written anew with the same time and size: its change time tells.
    write('script', toolText('1.2.1'), T0);
    expect((await files.read())?.version).toBe('1.2.1');
    write('script', toolText('1.2.2'), T0 + 1_000);
    expect((await files.read())?.version).toBe('1.2.2');
    rmSync(path.join(dir, TOOL_FILE));
    expect(await files.read()).toBeUndefined();
  });

  it('serves the tool without a changelog, and reads a new changelog', async () => {
    const { dir, write } = toolFolder({ changelog: null });
    const { log } = createTestLogger();
    const files = new WayspotToolFiles({ dir, log });
    expect((await files.read())?.changelog).toEqual([]);
    write('changelog', '## 2.0.0\n- Everything new.\n', T0);
    expect((await files.read())?.changelog).toEqual([
      { version: '2.0.0', text: '- Everything new.' },
    ]);
  });
});
