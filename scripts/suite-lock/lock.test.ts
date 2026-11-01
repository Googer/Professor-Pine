import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lockDir, release, tryTake } from './lock.js';

const folders: string[] = [];
function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-lock-'));
  folders.push(dir);
  return lockDir(dir);
}
afterEach(() => {
  for (const dir of folders.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const owner = (pid: number) => ({ pid, cwd: '/work', command: 'check', since: 0 });

describe('the suite lock', () => {
  it('lets one suite in and keeps a second out while the first is alive', () => {
    const dir = tmp();
    expect(tryTake(dir, owner(1), () => true)).toEqual({ taken: true });
    expect(tryTake(dir, owner(2), () => true)).toEqual({ taken: false, owner: owner(1) });
  });

  it('takes over a lock whose suite is gone', () => {
    const dir = tmp();
    tryTake(dir, owner(1), () => true);
    expect(tryTake(dir, owner(2), (pid) => pid !== 1)).toEqual({ taken: true });
    expect(tryTake(dir, owner(3), () => true)).toEqual({ taken: false, owner: owner(2) });
  });

  it('is given back only by its owner', () => {
    const dir = tmp();
    tryTake(dir, owner(1), () => true);
    release(dir, 2);
    expect(fs.existsSync(dir)).toBe(true);
    release(dir, 1);
    expect(fs.existsSync(dir)).toBe(false);
    expect(tryTake(dir, owner(2), () => true)).toEqual({ taken: true });
  });

  it('waits on a lock folder whose owner is still being written', () => {
    const dir = tmp();
    fs.mkdirSync(dir);
    expect(tryTake(dir, owner(2), () => false)).toEqual({ taken: false, owner: undefined });
  });

  it('takes over a lock folder left without an owner for half a minute', () => {
    const dir = tmp();
    fs.mkdirSync(dir);
    const old = new Date(Date.now() - 31_000);
    fs.utimesSync(dir, old, old);
    expect(tryTake(dir, owner(2), () => false)).toEqual({ taken: true });
  });
});
