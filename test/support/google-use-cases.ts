import { expect, it } from 'vitest';
import type { GoogleUse } from '../../src/services/google-use.js';

/**
 * What the counts of questions to Google do, run against the repository and its twin alike.
 * `made` gives fresh counts; `legacy` writes a day of the old count of gyms (`GymLookupDay`).
 */
export function googleUseCases(
  made: () => Promise<{ use: GoogleUse; legacy: (day: string, gyms: number) => Promise<void> }>,
): void {
  it('counts the questions per day and kind, with the old count of gyms as places', async () => {
    const { use, legacy } = await made();
    expect(await use.usedOn(['2026-10-25'])).toEqual(new Map());
    await use.use('2026-10-25', 'places');
    await use.use('2026-10-25', 'places');
    await use.use('2026-10-25', 'geocode');
    await use.use('2026-10-26', 'geocode');
    await legacy('2026-10-24', 40);
    await legacy('2026-10-25', 3);
    const used = await use.usedOn(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
    expect(used).toEqual(
      new Map([
        ['2026-10-24', { places: 40, geocodes: 0 }],
        ['2026-10-25', { places: 5, geocodes: 1 }],
        ['2026-10-26', { places: 0, geocodes: 1 }],
      ]),
    );
  });
}
