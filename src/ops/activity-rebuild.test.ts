import { describe, expect, it } from 'vitest';
import { rebuildStep, USAGE } from './activity-rebuild.js';

/** A rebuild that records what it was asked, answering with `records` per server. */
function rebuilding(answer: { servers: number; records: number } | Error) {
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

describe('npm run activity:rebuild', () => {
  it('rebuilds every server’s buckets and says how many records it counted', async () => {
    const made = rebuilding({ servers: 2, records: 253_118 });
    const said: string[] = [];
    expect(await rebuildStep([], { activity: made.activity, say: (line) => said.push(line) })).toBe(
      0,
    );
    expect(made.asked).toEqual([undefined]);
    expect(said).toEqual([
      'Rebuilding the activity heatmap from the party history (the bot may keep running).',
      'Rebuilt the activity of 2 servers from 253,118 records of the party history.',
    ]);
  });

  it('rebuilds one server with --server', async () => {
    const made = rebuilding({ servers: 1, records: 1 });
    const said: string[] = [];
    const server = '412345678901234567';
    expect(
      await rebuildStep(['--server', server], {
        activity: made.activity,
        say: (line) => said.push(line),
      }),
    ).toBe(0);
    expect(made.asked).toEqual([server]);
    expect(said.at(-1)).toBe(
      'Rebuilt the activity of 1 server from 1 record of the party history.',
    );
  });

  it('is used wrongly with anything else, and rebuilds nothing', async () => {
    for (const args of [['--server'], ['--server', 'west'], ['extra'], ['--server', '1', 'x']]) {
      const made = rebuilding({ servers: 0, records: 0 });
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
