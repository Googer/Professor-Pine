import { describe, expect, it } from 'vitest';
import { googleUseCases } from '../../test/support/google-use-cases.js';
import { MemoryGoogleUse, usedThisMonth } from './google-use.js';

describe('MemoryGoogleUse', () => {
  googleUseCases(() => {
    const use = new MemoryGoogleUse();
    return Promise.resolve({
      use,
      legacy: (day, gyms) => {
        use.legacy.set(day, gyms);
        return Promise.resolve();
      },
      servers: [1, 2],
    });
  });
});

describe('usedThisMonth', () => {
  it('sums the days of the Pacific month of a moment, and of them today', async () => {
    const use = new MemoryGoogleUse();
    await use.use('2026-09-30', 'places');
    await use.use('2026-10-01', 'places');
    await use.use('2026-10-31', 'places');
    await use.use('2026-10-31', 'geocode');
    await use.use('2026-11-01', 'places');
    await use.use('2026-10-15', 'hand');
    await use.use('2026-11-01', 'hand');
    use.legacy.set('2026-10-02', 10);
    // 23:30 on October 31 in California: November 1 in UTC, still October for Google.
    const used = await usedThisMonth(use, new Date('2026-10-31T23:30:00-07:00').getTime());
    expect(used).toEqual({ monthPlaces: 12, todayPlaces: 1, monthGeocodes: 1, monthByHand: 1 });
  });
});
