import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ScriptRun } from './backup-script.js';

/** The scripts a host runs beside the stack (`scripts/host/`). */
export const HOST_SCRIPTS = path.resolve(import.meta.dirname, '../../scripts/host');

/** A path as sh takes it on every machine (Git Bash reads `C:/…`, not every `C:\…`). */
export const shPath = (file: string): string => file.replace(/\\/g, '/');

/**
 * Fakes of what the host scripts call, as scripts on the PATH: `rclone` (`lsf` lists the folder
 * `bucket`, `copyto` copies into it; `FAKE_RCLONE_FAIL=lsf` or `copyto:<name>` makes one fail),
 * `age` (writes `age for <recipient>` and the file; `FAKE_AGE_FAIL=<name>` fails for a file of
 * that name) and the checkout's `./pine` (records its arguments in `told`, one run a line;
 * `FAKE_PINE_FAIL` makes it fail). Each call is a line in `calls`.
 */
const FAKES: Record<string, string> = {
  rclone: [
    '#!/bin/sh',
    'echo "rclone $*" >>"$FAKE_ROOT/calls"',
    'case $1 in',
    '  lsf)',
    '    if [ "${FAKE_RCLONE_FAIL:-}" = lsf ]; then echo "Failed to lsf: 403 Forbidden" >&2; exit 1; fi',
    '    ls "$FAKE_ROOT/bucket" ;;',
    '  copyto)',
    '    name=${3##*/}',
    '    if [ "${FAKE_RCLONE_FAIL:-}" = "copyto:$name" ]; then echo "Failed to copy: 500" >&2; exit 1; fi',
    '    cp "$2" "$FAKE_ROOT/bucket/$name" ;;',
    'esac',
  ].join('\n'),
  age: [
    '#!/bin/sh',
    'echo "age $*" >>"$FAKE_ROOT/calls"',
    // age -r <recipient> -o <out> <in>
    'if [ "${FAKE_AGE_FAIL:-}" = "${5##*/}" ]; then echo "age: error" >&2; exit 1; fi',
    '{ echo "age for $2"; cat "$5"; } >"$4"',
  ].join('\n'),
};

export interface HostScene {
  root: string;
  home: string;
  backups: string;
  bucket: string;
  /** The file the fake `./pine` records each run's arguments in. */
  told: string;
  calls: string;
}

/** A host of its own: a home, a backup folder, a bucket, the fakes, a checkout with a copy of the scripts. */
export function hostScene(): HostScene {
  const root = mkdtempSync(path.join(tmpdir(), 'pine-host-'));
  const home = path.join(root, 'home');
  const backups = path.join(root, 'backups');
  const bucket = path.join(root, 'bucket');
  const bin = path.join(root, 'bin');
  const checkout = path.join(root, 'checkout');
  for (const dir of [home, backups, bucket, bin, path.join(checkout, 'scripts', 'host')]) {
    mkdirSync(dir, { recursive: true });
  }
  for (const [name, text] of Object.entries(FAKES)) {
    writeFileSync(path.join(bin, name), `${text}\n`, { mode: 0o755 });
  }
  writeFileSync(
    path.join(checkout, 'pine'),
    [
      '#!/bin/sh',
      'printf "%s|" "$@" >>"$FAKE_ROOT/told"',
      'echo >>"$FAKE_ROOT/told"',
      'if [ -n "${FAKE_PINE_FAIL:-}" ]; then echo "pine: could not tell" >&2; exit 1; fi',
      'echo "The owner was told."',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  for (const script of ['offsite-setup.sh', 'offsite-upload.sh']) {
    copyFileSync(path.join(HOST_SCRIPTS, script), path.join(checkout, 'scripts', 'host', script));
  }
  return {
    root,
    home,
    backups,
    bucket,
    told: path.join(root, 'told'),
    calls: path.join(root, 'calls'),
  };
}

/**
 * Runs `scripts/host/<script>` (its copy in the scene's checkout) with `sh`, the fakes first on
 * the PATH, `HOME` the scene's, and `input` on its standard input. `undefined` where there is no
 * `sh` (a test skips then).
 */
export function runHostScript(
  scene: HostScene,
  script: 'offsite-setup.sh' | 'offsite-upload.sh',
  env: Record<string, string> = {},
  input = '',
): ScriptRun | undefined {
  const run = spawnSync(
    'sh',
    [shPath(path.join(scene.root, 'checkout', 'scripts', 'host', script))],
    {
      env: {
        ...process.env,
        PATH: `${path.join(scene.root, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
        HOME: shPath(scene.home),
        FAKE_ROOT: shPath(scene.root),
        ...env,
      },
      input,
      encoding: 'utf8',
    },
  );
  if (run.error && 'code' in run.error && run.error.code === 'ENOENT') return undefined;
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
