import { describe, expect, it } from 'vitest';
import type { RebuiltServer } from '../db/repositories/activity-repository.js';
import { rebuildStep, USAGE } from './activity-rebuild.js';

/** A rebuild that records what it was asked, answering with `answer`'s servers. */
function rebuilding(answer: RebuiltServer[] | Error) {
  const asked: Array<string | undefined> = [];
  return {
    asked,
    activity: {
      rebuild: (serverId?: string) => {
        asked.push(serverId);
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
      },
    },
  };
}

const WEST = '412345678901234567';
const EAST = '412345678901234568';

describe('npm run activity:rebuild', () => {
  it('rebuilds every server’s buckets and says each one’s final mark and its records (8H4-7)', async () => {
    const made = rebuilding([
      { serverId: WEST, lastHistoryId: 301_544, lastDayHistoryId: 301_544, records: 253_118 },
      { serverId: EAST, lastHistoryId: 301_540, lastDayHistoryId: 301_540, records: 1 },
    ]);
    const said: string[] = [];
    expect(await rebuildStep([], { activity: made.activity, say: (line) => said.push(line) })).toBe(
      0,
    );
    expect(made.asked).toEqual([undefined]);
    expect(said).toEqual([
      'Rebuilding the activity heatmap and the raids per day from the party history (the bot may keep running).',
      `Server ${WEST}: 253,118 records of the party history read, up to record 301544.`,
      `Server ${EAST}: 1 record of the party history read, up to record 301540.`,
      'Rebuilt the activity of 2 servers.',
    ]);
  });

  it('rebuilds one server with --server', async () => {
    const made = rebuilding([
      { serverId: WEST, lastHistoryId: 7, lastDayHistoryId: 7, records: 1 },
    ]);
    const said: string[] = [];
    expect(
      await rebuildStep(['--server', WEST], {
        activity: made.activity,
        say: (line) => said.push(line),
      }),
    ).toBe(0);
    expect(made.asked).toEqual([WEST]);
    expect(said.slice(1)).toEqual([
      `Server ${WEST}: 1 record of the party history read, up to record 7.`,
      'Rebuilt the activity of 1 server.',
    ]);
  });

  it('says where the days’ mark ended where it is not the buckets’ (plan 8H-8)', async () => {
    // Beside another rebuild of the same server, the two marks may end apart.
    const made = rebuilding([
      { serverId: WEST, lastHistoryId: 9, lastDayHistoryId: 4, records: 3 },
    ]);
    const said: string[] = [];
    expect(await rebuildStep([], { activity: made.activity, say: (line) => said.push(line) })).toBe(
      0,
    );
    expect(said.slice(1)).toEqual([
      `Server ${WEST}: 3 records of the party history read, up to record 4 (the heatmap up to record 9).`,
      'Rebuilt the activity of 1 server.',
    ]);
  });

  it('says a server whose history is gone counted none', async () => {
    const made = rebuilding([
      { serverId: WEST, lastHistoryId: 0, lastDayHistoryId: 0, records: 0 },
    ]);
    const said: string[] = [];
    expect(await rebuildStep([], { activity: made.activity, say: (line) => said.push(line) })).toBe(
      0,
    );
    expect(said.slice(1)).toEqual([
      `Server ${WEST}: no records of the party history.`,
      'Rebuilt the activity of 1 server.',
    ]);
  });

  it('is used wrongly with anything else, and rebuilds nothing', async () => {
    for (const args of [['--server'], ['--server', 'west'], ['extra'], ['--server', '1', 'x']]) {
      const made = rebuilding([]);
      const said: string[] = [];
      expect(
        await rebuildStep(args, { activity: made.activity, say: (line) => said.push(line) }),
      ).toBe(2);
      expect(said).toEqual([USAGE]);
      expect(made.asked).toEqual([]);
    }
  });

  it('fails with what went wrong', async () => {
    const made = rebuilding(new Error('Table ActivityBucket does not exist'));
    const said: string[] = [];
    expect(await rebuildStep([], { activity: made.activity, say: (line) => said.push(line) })).toBe(
      1,
    );
    expect(said.at(-1)).toBe('Table ActivityBucket does not exist');
  });
});
