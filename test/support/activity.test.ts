import { describe, expect, it } from 'vitest';
import { activityReaderCases } from './activity-cases.js';
import { MemoryActivity } from './activity.js';

describe('the activity buckets in memory', () => {
  activityReaderCases(() => {
    const reader = new MemoryActivity();
    return Promise.resolve({ reader, add: (serverId, buckets) => reader.add(serverId, buckets) });
  });

  it('counts every read, of buckets and of months alike (8H4-4)', async () => {
    const reader = new MemoryActivity();
    await reader.months('1');
    expect(reader.reads).toBe(1);
    await reader.buckets('1', { hours: [] });
    expect(reader.reads).toBe(2);
    reader.failing = new Error('away');
    await expect(reader.months('1')).rejects.toThrow('away');
    expect(reader.reads).toBe(3);
  });
});
