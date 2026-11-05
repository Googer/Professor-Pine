import { describe } from 'vitest';
import { activityReaderCases } from './activity-cases.js';
import { MemoryActivity } from './activity.js';

describe('the activity buckets in memory', () => {
  activityReaderCases(() => {
    const reader = new MemoryActivity();
    return Promise.resolve({ reader, add: (serverId, buckets) => reader.add(serverId, buckets) });
  });
});
