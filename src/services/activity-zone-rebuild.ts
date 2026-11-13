import type { ActivityRepository } from '../db/repositories/activity-repository.js';
import type { Logger } from '../log.js';

/**
 * A server's activity rebuilt in its new zone (plan 19A-2; design "Time zones"): the heatmap's
 * buckets and the raids per day are stored on the server's clock, so a change of its zone
 * (`ServerSettings.onZoneChange`) starts `ActivityRepository.rebuild(serverId)` in the background,
 * as `npm run activity:rebuild -- --server <id>` would (derived, and safe beside the hourly
 * adding). Meanwhile the heatmap and the history page show what is there. One rebuild at a time
 * per server: changes while one runs are taken by one more after it. Logged, a failure too; the
 * next change, or `activity:rebuild`, tries again. Stopped at shutdown before its next batch
 * (`close`; fix round 1, N2): what it left half done is done again by the next change or the
 * command.
 */
export class ActivityZoneRebuild {
  /** The rebuild under way of each server, and whether another was asked for meanwhile. */
  private readonly running = new Map<string, { done: Promise<void>; again: boolean }>();
  private closed = false;

  constructor(
    private readonly options: {
      activity: Pick<ActivityRepository, 'rebuild'>;
      log: Logger;
    },
  ) {}

  /** A server's zone changed: its activity is rebuilt in the background. Never throws. */
  zoneChanged(serverId: string): void {
    if (this.closed) return;
    const under = this.running.get(serverId);
    if (under !== undefined) {
      under.again = true;
      return;
    }
    const entry = { done: Promise.resolve(), again: true };
    this.running.set(serverId, entry);
    entry.done = (async () => {
      // Forgotten in the same turn as the loop's last look for a change meanwhile, so that a
      // change after it starts a rebuild of its own (fix round 1, N1).
      try {
        while (entry.again && !this.closed) {
          entry.again = false;
          await this.rebuild(serverId);
        }
      } finally {
        this.running.delete(serverId);
      }
    })();
  }

  /**
   * Stops at shutdown (fix round 1, N2): a rebuild under way ends after its batch under way, no
   * other starts; resolves once none runs. Never rejects.
   */
  async close(): Promise<void> {
    this.closed = true;
    await this.whenIdle();
  }

  /** Resolves once no rebuild is under way. For tests and shutdown. */
  async whenIdle(): Promise<void> {
    while (this.running.size > 0) {
      await Promise.all([...this.running.values()].map((one) => one.done));
    }
  }

  private async rebuild(serverId: string): Promise<void> {
    const { activity, log } = this.options;
    log.info({ guild: serverId }, 'rebuilding the activity of a server in its new zone');
    try {
      const [done] = await activity.rebuild(serverId, () => this.closed);
      log.info(
        { guild: serverId, records: done?.records ?? 0 },
        'rebuilt the activity of a server in its new zone',
      );
    } catch (err) {
      log.error(
        { err, guild: serverId },
        'could not rebuild the activity of a server in its new zone',
      );
    }
  }
}
