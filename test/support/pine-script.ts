import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { ScriptRun } from './backup-script.js';

/** The operator's script (`./pine`). */
export const PINE_SCRIPT = path.resolve(import.meta.dirname, '../../pine');

/**
 * Runs shell lines with `./pine` sourced as a library (`PINE_SH_LIBRARY`: its functions defined,
 * no command run), in one `sh`: Linux, or Git Bash on Windows. `undefined` where there is no `sh`
 * (a test skips then). The script changes into the checkout, so a test names its files in full;
 * `env` adds to the test's environment, and the lines get `args` as `$1`, `$2` and so on. Nothing
 * here may reach Docker: a test calls only the functions that read files.
 */
export function runPineScript(
  lines: string,
  env: Record<string, string> = {},
  args: readonly string[] = [],
): ScriptRun | undefined {
  const run = spawnSync('sh', ['-c', `. "$0"\n${lines}`, PINE_SCRIPT, ...args], {
    env: { ...process.env, PINE_SH_LIBRARY: '1', ...env },
    encoding: 'utf8',
  });
  if (run.error && 'code' in run.error && run.error.code === 'ENOENT') return undefined;
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
