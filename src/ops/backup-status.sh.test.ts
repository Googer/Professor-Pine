import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runBackupScript } from '../../test/support/backup-script.js';
import { readBackupStatus, type BackupStatus } from './backup-status.js';

const dir = () => mkdtempSync(path.join(tmpdir(), 'pine-backup-status-'));

describe('readBackupStatus', () => {
  it('reads what docker/backup.sh writes after a good run, a failed one and when off', (context) => {
    const ops = dir();
    const status = path.join(ops, 'backup-status.json');
    // One sh for all: the script's own write_status, a good run then a failed one. The reason
    // is worded as MySQL may word it: quotes, a backslash, more than one line.
    const run = runBackupScript(
      'write_status true "" pine-backup-20261016.sql.gz 729298 9 "an old dump could not be deleted"\n' +
        'cp "$OPS/backup-status.json" "$OPS/good.json"\n' +
        'write_status false "$1" pine-backup-20261017.sql.gz 0 0\n' +
        'cp "$OPS/backup-status.json" "$OPS/failed.json"\n' +
        'write_off_status',
      { BACKUP_OPS_DIR: ops },
      ['mysqldump: Got error: 1049: Unknown database \'nosuch\'\nat "C:\\dumps"'],
    );
    if (!run) return context.skip('no sh here');
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);

    const good = readBackupStatus(path.join(ops, 'good.json')) as BackupStatus;
    expect(good).toMatchObject({
      ok: true,
      file: 'pine-backup-20261016.sql.gz',
      bytes: 729298,
      seconds: 9,
      warning: 'an old dump could not be deleted',
    });
    expect(good.lastOkAt).toBe(good.finishedAt);
    expect(readBackupStatus(path.join(ops, 'failed.json'))).toMatchObject({
      ok: false,
      reason: 'mysqldump: Got error: 1049: Unknown database \'nosuch\' at "C:\\dumps"',
      // The last good run is kept.
      lastOkAt: good.finishedAt,
    });
    expect(readBackupStatus(status)).toEqual({ off: true });
  });

  it('is nothing before the first backup, or for a file it cannot read', () => {
    const folder = dir();
    expect(readBackupStatus(path.join(folder, 'backup-status.json'))).toBeUndefined();
    const broken = path.join(folder, 'broken.json');
    writeFileSync(broken, '{"ok": "yes"}');
    expect(readBackupStatus(broken)).toBeUndefined();
  });
});
