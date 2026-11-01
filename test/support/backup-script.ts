import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** The stack's backup script (`docker/backup.sh`). */
export const BACKUP_SCRIPT = path.resolve(import.meta.dirname, '../../docker/backup.sh');

export interface ScriptRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs shell lines with `docker/backup.sh` sourced as a library (`BACKUP_SH_LIBRARY`: its
 * functions defined, nothing run), in one `sh`: Linux, or Git Bash on Windows. `undefined` where
 * there is no `sh` (a test skips then). `env` adds to the test's environment; the lines get
 * `args` as `$1`, `$2` and so on.
 */
export function runBackupScript(
  lines: string,
  env: Record<string, string> = {},
  args: readonly string[] = [],
): ScriptRun | undefined {
  const run = spawnSync('sh', ['-c', `. "$0"\n${lines}`, BACKUP_SCRIPT, ...args], {
    env: { ...process.env, BACKUP_SH_LIBRARY: '1', ...env },
    encoding: 'utf8',
  });
  if (run.error && 'code' in run.error && run.error.code === 'ENOENT') return undefined;
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
