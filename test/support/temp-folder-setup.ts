import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Global setup of every test project: the run's temporary files go into one folder of its own,
 * removed when the run ends. Tests make their folders with `mkdtemp(tmpdir())` and leave them;
 * before this, a few thousand were left in the system's temporary folder by every run.
 *
 * The workers (and the processes tests start) inherit the environment, and `os.tmpdir()` reads
 * `TMPDIR` on Linux and `TEMP` / `TMP` on Windows. Several projects run this; the first one
 * makes the folder and the others use it.
 */
const OWNED = 'PINE_TEST_TEMP';

export default function setup(): (() => void) | undefined {
  if (process.env[OWNED] !== undefined) return undefined;
  const before = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
  const folder = mkdtempSync(path.join(tmpdir(), 'pine-tests-'));
  process.env[OWNED] = folder;
  process.env.TMPDIR = folder;
  process.env.TEMP = folder;
  process.env.TMP = folder;
  return () => {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    delete process.env[OWNED];
    // A process a test started may still hold a file on Windows: what is left is left.
    rmSync(folder, { recursive: true, force: true, maxRetries: 3 });
  };
}
