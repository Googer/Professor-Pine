import { localTime, zoned } from '../time/zoned.js';

/**
 * The names Android gives a screenshot, with the moment it was taken in the phone's own time:
 * `Screenshot_20261014-132301…`, `Screenshot_20261014_132301…` and
 * `Screenshot_2026-10-14-13-23-01…`, with `_` or `-` after the word, which may be in any case;
 * whatever follows the time is not read (Samsung's app name, `~2`, `(1)`, the extension). An
 * upload that arrives as `image0.jpg` (iOS, some ways of sharing) gives no hint.
 */
const ANDROID_NAMES = [
  /^screenshot[_-](\d{4})(\d{2})(\d{2})[-_](\d{2})(\d{2})(\d{2})(?!\d)/i,
  /^screenshot[_-](\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})(?!\d)/i,
];

/**
 * When a screenshot was taken by the name of its file, read in `zone` (the server's, the zone
 * of the phone's clock as everywhere else); undefined for any other name, for a date or
 * time that does not exist, and for one the clocks repeat (the night they fall back). A hint of the time only: the report decides whether it fits.
 */
export function takenAtFromFileName(name: string, zone: string): number | undefined {
  for (const pattern of ANDROID_NAMES) {
    const match = pattern.exec(name);
    if (!match) continue;
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    if (year === undefined || month === undefined || day === undefined) continue;
    const time = localTime({ year, month, day, hour, minute, second }, zone);
    // A time the clocks skip (spring forward) is moved forward by localTime: it did not exist.
    const exists = time !== undefined && time.hour === hour && time.minute === minute;
    if (!exists) return undefined;
    // A time the clocks repeat (fall back) is two moments an hour apart: no hint.
    const at = time.epochMilliseconds;
    const repeated = [zoned(at + 3_600_000, zone), zoned(at - 3_600_000, zone)].some(
      (other) => other.hour === hour && other.minute === minute,
    );
    return repeated ? undefined : at;
  }
  return undefined;
}
