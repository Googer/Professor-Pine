import { expect, it } from 'vitest';
import type { StopLineStorage } from '../../src/db/repositories/stop-line-repository.js';

/** A line of a region channel of a server and a day (plan 8R-9), not sent yet. */
export function newStopLine(
  overrides: Partial<{ serverId: string; regionChannelId: string; day: string; key: string }> = {},
) {
  return {
    serverId: '100000000000000001',
    regionChannelId: '300000000000000001',
    day: '2026-11-21',
    key: 'research:0123456789abcdef',
    createdAt: 1,
    ...overrides,
  };
}

/** What the lines' storage does, for the repository and its twin (`MemoryStopLines`). */
export function stopLineCases(made: () => Promise<StopLineStorage>): void {
  it('claims a line once per server, region channel, day and key', async () => {
    const store = await made();
    const line = newStopLine();
    expect(await store.claim(line)).toBe(true);
    expect(await store.claim({ ...line, createdAt: 2 })).toBe(false);
    // Another day, channel, server or key is another line.
    expect(await store.claim({ ...line, day: '2026-11-22' })).toBe(true);
    expect(await store.claim({ ...line, regionChannelId: '300000000000000002' })).toBe(true);
    expect(await store.claim({ ...line, serverId: '100000000000000002' })).toBe(true);
    expect(await store.claim({ ...line, key: 'rocket:leader:arlo' })).toBe(true);
  });

  it('keeps the message of a line, and gives the lines of the days before a day', async () => {
    const store = await made();
    await store.claim(newStopLine({ day: '2026-11-20' }));
    await store.claim(newStopLine());
    await store.claim(newStopLine({ day: '2026-11-19', key: 'rocket:giovanni' }));
    await store.sent(newStopLine({ day: '2026-11-20' }), '400000000000000001');
    expect(await store.before('2026-11-21')).toEqual([
      expect.objectContaining({ day: '2026-11-19', key: 'rocket:giovanni', messageId: null }),
      expect.objectContaining({
        day: '2026-11-20',
        key: 'research:0123456789abcdef',
        regionChannelId: '300000000000000001',
        serverId: '100000000000000001',
        messageId: '400000000000000001',
      }),
    ]);
  });

  it('keeps a line sent after its claim was forgotten, so that it can be deleted (review W1)', async () => {
    const store = await made();
    const line = newStopLine({ day: '2026-11-20' });
    await store.claim(line);
    await store.forget(line);
    await store.sent({ ...line, createdAt: 5 }, '400000000000000002');
    expect(await store.before('2026-11-21')).toEqual([
      expect.objectContaining({ day: '2026-11-20', messageId: '400000000000000002', createdAt: 5 }),
    ]);
    // Sent again over a claim that stands: the message is the newer, the claim's time kept.
    await store.claim(newStopLine());
    await store.sent({ ...newStopLine(), createdAt: 9 }, '400000000000000003');
    expect(await store.before('2026-11-22')).toEqual([
      expect.objectContaining({ day: '2026-11-20' }),
      expect.objectContaining({ day: '2026-11-21', messageId: '400000000000000003', createdAt: 1 }),
    ]);
  });

  it('forgets a line, which may be claimed again then', async () => {
    const store = await made();
    const line = newStopLine();
    await store.claim(line);
    await store.forget(line);
    await store.forget(newStopLine({ key: 'never' }));
    expect(await store.before('2026-11-22')).toEqual([]);
    expect(await store.claim(line)).toBe(true);
  });
}
