import { feedTime } from '../../src/domain/time/zoned.js';

/**
 * Epoch ms of a time written as the feeds write it (`feedTime`): `2026-10-24T14:00` is a
 * wall-clock time in `zone`, one with an offset or `Z` that moment, a date alone its midnight.
 * Throws on a time it cannot read, so that a typo in a test is no NaN.
 */
export function zonedAt(text: string, zone: string): number {
  const time = feedTime(text, zone);
  if (!time) throw new Error(`bad test time ${text}`);
  return time.epochMilliseconds;
}
