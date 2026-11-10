import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Where the backup service (`docker/backup.sh`) leaves the result of its last run, in the
 * stack's `ops` volume, which the watchdog mounts too.
 */
export const BACKUP_STATUS_FILE = '/ops/backup-status.json';

const backupStatusSchema = z.object({
  /** When the last run ended (epoch milliseconds). */
  finishedAt: z.number(),
  ok: z.boolean(),
  /** Why it failed. */
  reason: z.string().optional(),
  /** The dump's file name in the backup folder. */
  file: z.string().optional(),
  bytes: z.number().optional(),
  seconds: z.number().optional(),
  /** When a run last succeeded, this one or an earlier one. */
  lastOkAt: z.number().optional(),
  /**
   * What went wrong beside a good dump (old dumps that could not be deleted; stored programs in
   * the database, which no dump holds). The watchdog tells the owner of it.
   */
  warning: z.string().optional(),
});

/** The result of the last backup, as the backup service writes it. */
export type BackupStatus = z.output<typeof backupStatusSchema>;

/** What the backup service writes when backups are off (BACKUP_DIR blank). */
export interface BackupsOff {
  off: true;
}

const backupStateSchema = z.union([z.strictObject({ off: z.literal(true) }), backupStatusSchema]);

/** Whether the backup service says backups are off. */
export function backupsOff(state: BackupStatus | BackupsOff | undefined): state is BackupsOff {
  return state !== undefined && 'off' in state;
}

/**
 * The last backup's result, or that backups are off, or nothing when no backup ran yet or the
 * file cannot be read.
 */
export function readBackupStatus(
  file: string = BACKUP_STATUS_FILE,
): BackupStatus | BackupsOff | undefined {
  try {
    const parsed = backupStateSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
