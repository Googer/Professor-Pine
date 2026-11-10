import fs from 'node:fs';
import path from 'node:path';

/**
 * One test suite at a time on this machine: two suites side by side starve each other's
 * workers and time out (CLAUDE.md, "never two suites at once"). The lock is a folder in the
 * system's temporary folder, shared by every checkout and worktree; making a folder is atomic,
 * so two suites starting at the same moment cannot both win. The folder holds the owner's pid
 * and checkout, so a lock whose process is gone is taken over.
 */
export interface LockOwner {
  pid: number;
  cwd: string;
  command: string;
  since: number;
}

const ORPHAN_MS = 30_000;

export type TakeResult = { taken: true } | { taken: false; owner: LockOwner | undefined };

export function lockDir(tmp: string): string {
  return path.join(tmp, 'professor-pine-suite.lock');
}

function ownerFile(dir: string): string {
  return path.join(dir, 'owner.json');
}

function readOwner(dir: string): LockOwner | undefined {
  try {
    return JSON.parse(fs.readFileSync(ownerFile(dir), 'utf8')) as LockOwner;
  } catch {
    return undefined;
  }
}

/** Tries once to take the lock; a lock whose owner is not alive is removed and taken. */
export function tryTake(dir: string, me: LockOwner, isAlive: (pid: number) => boolean): TakeResult {
  try {
    fs.mkdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const owner = readOwner(dir);
    // A folder without an owner yet is being made by another suite this very moment, unless
    // it has been so for a while: that suite died between the two steps.
    if (owner === undefined && Date.now() - fs.statSync(dir).mtimeMs < ORPHAN_MS) {
      return { taken: false, owner };
    }
    if (owner !== undefined && isAlive(owner.pid)) return { taken: false, owner };
    fs.rmSync(dir, { recursive: true, force: true });
    return tryTake(dir, me, isAlive);
  }
  fs.writeFileSync(ownerFile(dir), JSON.stringify(me));
  return { taken: true };
}

/** Gives the lock back, only when it is still this process's. */
export function release(dir: string, pid: number): void {
  if (readOwner(dir)?.pid === pid) fs.rmSync(dir, { recursive: true, force: true });
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
