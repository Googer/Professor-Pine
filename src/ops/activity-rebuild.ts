import { isSnowflake } from '../db/snowflake.js';
import type { ActivityRepository, RebuiltServer } from '../db/repositories/activity-repository.js';

export const USAGE = 'Usage: npm run activity:rebuild [-- --server <server id>]';

export interface RebuildStepDeps {
  activity: Pick<ActivityRepository, 'rebuild'>;
  say: (line: string) => void;
}

const counted = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Where the two marks ended apart (beside another rebuild of the server), the higher one. */
const apart = (one: RebuiltServer): string =>
  one.lastHistoryId > one.lastDayHistoryId
    ? ` (the heatmap up to record ${String(one.lastHistoryId)})`
    : one.lastDayHistoryId > one.lastHistoryId
      ? ` (the days up to record ${String(one.lastDayHistoryId)})`
      : '';

/**
 * The rebuild of the activity heatmap's buckets (plan 8H-4) and the raids per day (plan 8H-8):
 * every server's, or one's by `--server`, from nothing, through the very adding the hourly upkeep
 * does
 * (`ActivityRepository.rebuild`). Safe to run again, and while the bot runs. Exit 0 done, 1 failed
 * (said why), 2 used wrongly (nothing rebuilt).
 */
export async function rebuildStep(args: readonly string[], deps: RebuildStepDeps): Promise<number> {
  const { say } = deps;
  let server: string | undefined;
  if (args.length === 2 && args[0] === '--server' && isSnowflake(args[1] ?? '')) {
    server = args[1];
  } else if (args.length > 0) {
    say(USAGE);
    return 2;
  }
  say(
    'Rebuilding the activity heatmap and the raids per day from the party history (the bot may keep running).',
  );
  try {
    const done = await deps.activity.rebuild(server);
    // Each server's final mark and its records up to it, not what this run read alone: beside
    // the bot's hourly adding, that takes some of the batches (8H4-7).
    for (const one of done) {
      say(
        one.records === 0
          ? `Server ${one.serverId}: no records of the party history.`
          : `Server ${one.serverId}: ${counted(one.records, 'record', 'records')} of the party history read, up to record ${String(Math.min(one.lastHistoryId, one.lastDayHistoryId))}${apart(one)}.`,
      );
    }
    say(`Rebuilt the activity of ${counted(done.length, 'server', 'servers')}.`);
    return 0;
  } catch (err) {
    say(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
