import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runBackupScript } from '../../test/support/backup-script.js';
import { readBackupStatus } from './backup-status.js';

// docker/backup.sh, sourced as a library: the parts that need neither MySQL nor a clock.

function folders() {
  const root = mkdtempSync(path.join(tmpdir(), 'pine-backup-script-'));
  const ops = path.join(root, 'ops');
  const out = path.join(root, 'backups');
  mkdirSync(out);
  return {
    ops,
    out,
    lock: path.join(root, 'lock'),
    env: {
      BACKUP_OPS_DIR: ops,
      BACKUP_OUT_DIR: out,
      BACKUP_LOCK: path.join(root, 'lock'),
    },
  };
}

describe('the DB_SCHEMA of docker/backup.sh', () => {
  // The name goes into SQL text and bare onto mysqldump's command line.
  it('is letters, digits, _ and inner hyphens, or the service stops with a sentence', (context) => {
    const good = ['pine', 'Pine_2', 'pine-dev', 'p', 'my-pine--db_2'];
    const bad = ['-pine', 'pine-', '--all-databases', 'pine db', 'pi`ne', 'pine;drop', 'p.d'];
    const run = runBackupScript(
      [
        'for name in "$@"; do',
        '  if schema_name_ok "$name"; then echo "ok: $name"; else echo "bad: $name"; fi',
        'done',
        // The settings' check itself: it stops before anything else is read.
        'for name in "$@"; do',
        '  (DB_SCHEMA=$name; setup) 2>&1 || true',
        'done',
      ].join('\n'),
      { MYSQL_ROOT_PASSWORD: 'root', DB_USER: 'pine', DB_PASSWORD: 'pine' },
      [...good, ...bad],
    );
    if (!run) return context.skip('no sh here');

    for (const name of good) expect(run.stdout).toContain(`ok: ${name}\n`);
    for (const name of bad) {
      expect(run.stdout).toContain(`bad: ${name}\n`);
      expect(run.stdout).toContain(
        `DB_SCHEMA must be letters, digits, _ and - (a hyphen neither first nor last), not '${name}'.`,
      );
    }
    for (const name of good) expect(run.stdout).not.toContain(`not '${name}'`);
  });
});

describe('the lock of docker/backup.sh', () => {
  it('takes over a lock whose run is gone, and not one whose run is alive', (context) => {
    const { lock, env } = folders();
    const run = runBackupScript(
      [
        // A run that is gone: no process has this pid.
        'mkdir "$LOCK" && echo 999999 >"$LOCK/pid"',
        'take_lock && echo "stale taken: $(cat "$LOCK/pid")" || echo "stale refused"',
        // A run that is alive: this very shell.
        'take_lock && echo "live taken" || echo "live refused"',
        'echo "me: $$"',
      ].join('\n'),
      env,
    );
    if (!run) return context.skip('no sh here');

    const me = /me: (\d+)/.exec(run.stdout)?.[1];
    expect(run.stdout).toContain(`stale taken: ${me}`);
    expect(run.stdout).toContain('live refused');
    expect(existsSync(path.join(lock, 'pid'))).toBe(true);
  });

  it('records a failure for a scheduled run that finds a backup running, not for one asked now', (context) => {
    const { ops, env } = folders();
    const asked = runBackupScript(
      [
        'mkdir -p "$LOCK" && echo $$ >"$LOCK/pid"',
        'backup_once before-update || echo "now: $?"',
      ].join('\n'),
      env,
    );
    if (!asked) return context.skip('no sh here');
    expect(asked.stdout).toContain('a backup is running already');
    expect(asked.stdout).toContain('now: 1');
    expect(existsSync(path.join(ops, 'backup-status.json'))).toBe(false);

    const scheduled = runBackupScript(
      [
        'mkdir -p "$LOCK" && echo $$ >"$LOCK/pid"',
        'SCHEDULED=yes',
        'backup_once || echo "scheduled: $?"',
      ].join('\n'),
      env,
    );
    expect(scheduled?.stdout).toContain('scheduled: 1');
    expect(existsSync(path.join(ops, 'backup-status.json'))).toBe(true);
  });
});

describe('the dump of docker/backup.sh', () => {
  // The mode itself means nothing in Git Bash: the umask of whoever writes the file does.
  it('is written for its owner alone', (context) => {
    const { out, env } = folders();
    const run = runBackupScript(
      [
        'OWNER_UID=0 OWNER_GID=0 SCHEMA=pine',
        'mysqldump() { echo "-- Dump completed"; }',
        'as_owner() { umask >>"$OUT/umasks"; "$@"; }',
        'make_dump "$OUT/dump.sql.gz" && echo made',
      ].join('\n'),
      env,
    );
    if (!run) return context.skip('no sh here');
    expect(run.stdout).toContain('made');
    expect(readFileSync(path.join(out, 'umasks'), 'utf8').split(/\r?\n/)[0]).toBe('0077');
  });

  // A restore runs a dump's SQL as MySQL's root: what the bot's account could have put into the
  // schema as a trigger, a routine or an event does not travel in it.
  it('is asked for without triggers, routines and events', (context) => {
    const { out, env } = folders();
    const run = runBackupScript(
      [
        'OWNER_UID=0 OWNER_GID=0 SCHEMA=pine',
        'mysqldump() { printf "%s\\n" "$@" >"$OUT/asked"; echo "-- Dump completed"; }',
        'make_dump "$OUT/dump.sql.gz" && echo made',
      ].join('\n'),
      env,
    );
    if (!run) return context.skip('no sh here');
    expect(run.stdout).toContain('made');
    const asked = readFileSync(path.join(out, 'asked'), 'utf8').split(/\r?\n/);
    // mysqldump writes triggers unless told not to; routines and events only when told to.
    expect(asked).toContain('--skip-triggers');
    expect(asked).not.toContain('--triggers');
    expect(asked).not.toContain('--routines');
    expect(asked).not.toContain('--events');
    expect(asked).toContain('pine');
  });
});

describe('stored programs in the database of docker/backup.sh', () => {
  /** A backup whose dump and check are stubbed, of a database with these counts. */
  function backupOf(live: string, more: readonly string[] = []) {
    const { out, ops, env } = folders();
    writeFileSync(path.join(out, '.pine-backups'), 'pine\n');
    const run = runBackupScript(
      [
        'OWNER_UID=0 OWNER_GID=0 KEEP=90 SCHEMA=pine',
        'make_dump() { echo dump >"$1"; }',
        'verify_dump() { verified=yes; }',
        // The live database's answer: its triggers, routines and events.
        `live() { ${live}; }`,
        ...more,
        'backup_once; echo "exit: $?"',
      ].join('\n'),
      { ...env, BACKUP_STACK: 'pine' },
    );
    return run && { run, status: readBackupStatus(path.join(ops, 'backup-status.json')), ops };
  }

  it('are a warning of a good backup: the dump leaves them out', (context) => {
    const backup = backupOf('echo "2 0 1"');
    if (!backup) return context.skip('no sh here');

    expect(backup.run.stdout).toContain('exit: 0');
    expect(backup.status).toMatchObject({
      ok: true,
      warning:
        'the database has 2 triggers and 1 event, which no dump holds (Professor Pine makes none)',
    });
    expect(readFileSync(path.join(backup.ops, 'backup-status.txt'), 'utf8')).toContain(
      '(but the database has 2 triggers and 1 event, which no dump holds',
    );
  });

  it('are counted by kind, one as one', (context) => {
    const backup = backupOf('echo "1 3 0"');
    if (!backup) return context.skip('no sh here');

    expect(backup.status).toMatchObject({
      ok: true,
      warning:
        'the database has 1 trigger and 3 routines, which no dump holds (Professor Pine makes none)',
    });
  });

  it('are no warning where the database has none', (context) => {
    const backup = backupOf('echo "0 0 0"');
    if (!backup) return context.skip('no sh here');

    expect(backup.run.stdout).toContain('exit: 0');
    expect(backup.status).toMatchObject({ ok: true });
    expect(backup.status).not.toHaveProperty('warning');
  });

  it('are a warning of their own when the database cannot be asked, beside one of old dumps', (context) => {
    const backup = backupOf('return 1', [
      'prune_old() { prune_failed=pine-backup-20260701.sql.gz; }',
    ]);
    if (!backup) return context.skip('no sh here');

    expect(backup.run.stdout).toContain('exit: 0');
    expect(backup.status).toMatchObject({
      ok: true,
      warning:
        'old dumps could not be deleted: pine-backup-20260701.sql.gz; ' +
        'the database could not be asked for its triggers, routines and events, which no dump holds',
    });
  });
});

describe('the backup folder of docker/backup.sh', () => {
  // A delete that fails (and its warning) cannot be made on every machine the tests run on.
  it('deletes only its own dumps older than the days kept', (context) => {
    const { out, env } = folders();
    for (const name of [
      'pine-backup-20260701.sql.gz',
      'pine-backup-20261015.sql.gz',
      'pine-20260701.sql',
      '.pine-backups',
    ]) {
      writeFileSync(path.join(out, name), '');
    }
    const run = runBackupScript(
      [
        'OWNER_UID=0 OWNER_GID=0 KEEP=90',
        // 100 and 1 days old, by the file's time.
        'touch -d "100 days ago" "$OUT/pine-backup-20260701.sql.gz" "$OUT/pine-20260701.sql"',
        'touch -d "1 day ago" "$OUT/pine-backup-20261015.sql.gz"',
        'prune_old; echo "failed: [$prune_failed]"',
      ].join('\n'),
      env,
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain('failed: []');
    expect(readdirSync(out).sort()).toEqual([
      '.pine-backups',
      'pine-20260701.sql',
      'pine-backup-20261015.sql.gz',
    ]);
  });

  it('removes what a run that was killed left half-written', (context) => {
    const { out, env } = folders();
    for (const name of [
      '.pine-backup-20261015.sql.gz.partial',
      'pine-backup-20261015.sql.gz',
      'notes.partial',
    ]) {
      writeFileSync(path.join(out, name), '');
    }
    const run = runBackupScript('OWNER_UID=0 OWNER_GID=0\nremove_partials', env);
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(0);
    expect(readdirSync(out).sort()).toEqual(['notes.partial', 'pine-backup-20261015.sql.gz']);
  });
});

describe('the backup folder of one stack', () => {
  it('is claimed by the first stack that writes there, and refused to another', (context) => {
    const { out, env } = folders();
    writeFileSync(path.join(out, '.pine-backups'), '');
    const run = runBackupScript(
      [
        'OWNER_UID=0 OWNER_GID=0',
        'BACKUP_STACK=pine; claim_folder && echo "pine: ok [$(cat "$OUT/.pine-backups")]"',
        'BACKUP_STACK=pine; claim_folder && echo "pine again: ok"',
        'BACKUP_STACK=staging; claim_folder || echo "staging: $reason"',
      ].join('\n'),
      env,
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain('pine: ok [pine]');
    expect(run.stdout).toContain('pine again: ok');
    expect(run.stdout).toContain(
      "staging: the backup folder belongs to the stack 'pine' (its .pine-backups file says so)",
    );
  });

  it('fails a run whose verified dump cannot take its name, and keeps that dump', (context) => {
    const { out, ops, env } = folders();
    writeFileSync(path.join(out, '.pine-backups'), 'pine\n');
    const run = runBackupScript(
      [
        'OWNER_UID=0 OWNER_GID=0 KEEP=90 SCHEMA=pine',
        // The dump and its check, stubbed: a verified dump is there.
        'make_dump() { echo dump >"$1"; }',
        'verify_dump() { verified=yes; }',
        // The rename fails (a share that went away between the check and the rename).
        'as_owner() { if [ "$1" = mv ]; then return 1; fi; "$@"; }',
        'backup_once || echo "failed: $reason"',
      ].join('\n'),
      { ...env, BACKUP_STACK: 'pine' },
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toMatch(
      /failed: the verified dump could not take its name pine-backup-\d{8}\.sql\.gz; it is kept as \.pine-backup-\d{8}\.sql\.gz\.partial/,
    );
    const status = readFileSync(path.join(ops, 'backup-status.json'), 'utf8');
    expect(status).toContain('"ok":false');
    expect(status).not.toContain('"ok":true');
    expect(readdirSync(out).sort()).toEqual([
      expect.stringMatching(/^\.pine-backup-\d{8}\.sql\.gz\.partial$/),
      '.pine-backups',
    ]);
  });

  it('refuses a folder without its marker, and makes none', (context) => {
    const { out, env } = folders();
    const run = runBackupScript(
      ['OWNER_UID=0 OWNER_GID=0', 'claim_folder || echo "refused: $reason"'].join('\n'),
      { ...env, BACKUP_STACK: 'pine' },
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain('refused: the backup folder has no .pine-backups file');
    expect(readdirSync(out)).toEqual([]);
  });

  it('tells how to make the marker where it cannot be written, and needs no write when it names the stack', (context) => {
    const { out, env } = folders();
    writeFileSync(path.join(out, '.pine-backups'), '');
    const run = runBackupScript(
      [
        'OWNER_UID=1000 OWNER_GID=1000',
        // The share squashes the owner's writes to the marker root made.
        'as_owner() { if [ "$1" = sh ]; then return 1; fi; "$@"; }',
        'claim_folder || echo "refused: $reason"',
        'echo pine >"$OUT/.pine-backups"',
        'claim_folder && echo "named: ok"',
      ].join('\n'),
      { ...env, BACKUP_STACK: 'pine' },
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain(
      "refused: the backup folder's .pine-backups file cannot be written as 1000:1000: make it " +
        "as the share's owner with this stack's name in it (echo pine > <BACKUP_DIR>/.pine-backups)",
    );
    expect(run.stdout).toContain('named: ok');
  });
});

describe('the lock of a run asked for now', () => {
  it('is given back by that run only, never when another run holds it', (context) => {
    const { lock, env } = folders();
    const run = runBackupScript(
      [
        // Another run holds it: this one did not take it.
        'mkdir -p "$LOCK" && echo 1 >"$LOCK/pid"',
        'release_own_lock; [ -d "$LOCK" ] && echo "other: kept"',
        'rm -rf "$LOCK"',
        'take_lock && release_own_lock; [ -d "$LOCK" ] || echo "own: given back"',
      ].join('\n'),
      env,
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain('other: kept');
    expect(run.stdout).toContain('own: given back');
    expect(existsSync(lock)).toBe(false);
  });
});

describe('docker/backup.sh with backups off', () => {
  it('says so and makes none when asked for one now', (context) => {
    const { ops, env } = folders();
    const run = runBackupScript('main now; echo "exit: $?"', { ...env, BACKUP_DIR: '' });
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain('backups are off (BACKUP_DIR is blank)');
    expect(run.status).toBe(3);
    expect(existsSync(path.join(ops, 'backup-status.json'))).toBe(false);
  });
});
