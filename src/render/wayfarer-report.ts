import type { ExportedWayspot } from '@pine/wayspot-core/export-file';
import type { ImportPlan, Matched } from '../domain/wayspots/match.js';
import type { ReviewCandidate } from '../domain/wayspots/review.js';
import type { BeyondGym } from '../domain/wayspots/scanned-area.js';

/**
 * The full list of what an import does, attached to `/gym import`'s preview as a CSV file: how
 * Pittsburgh's first import (thousands of gyms) is read, in a spreadsheet.
 */

export const REPORT_HEADER = 'gym,name,what,wayspot,title,kind,metres,cell,region';

/** What happens to a gym or a Wayspot, one word per line of the report. */
export type ReportWhat =
  | 'matched-id'
  | 'matched-name'
  | 'matched-place'
  | 'renamed'
  | 'tidied'
  | 'moved'
  | 'added'
  | 'held'
  | 'review-match'
  | 'review-missing'
  | 'review-unknown'
  | 'not-in-wayfarer'
  | 'not-covered'
  | 'answered'
  | 'outside'
  | 'beyond';

/** Excel reads a file without it as the local code page and garbles every accent. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/**
 * A text as a cell: control characters (line breaks among them) are a space, so that every row
 * is one line; a text a spreadsheet would read as a formula (`=`, `+`, `-`, `@`) gets an
 * apostrophe in front, since titles are anybody's text; a cell with a comma or a double quote
 * is quoted, its quotes doubled (RFC 4180).
 */
function cell(text: string): string {
  const line = text.replace(/[\p{Cc}\u2028\u2029]+/gu, ' ');
  const safe = /^[=+\-@]/.test(line) ? `'${line}` : line;
  return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A distance in metres, to a tenth. */
const metres = (value: number): string => value.toFixed(1);

/**
 * What a matched gym's line says: a move before a rename, either before a name only tidied
 * (spaces or capitals), all of them before how it was found.
 */
function matchedWhat(match: Matched): ReportWhat {
  if (match.move) return 'moved';
  if (match.rename !== null) return match.tidyOnly ? 'tidied' : 'renamed';
  return `matched-${match.by}`;
}

interface Line {
  gym: number | null;
  what: ReportWhat;
  wayspot?: Pick<ExportedWayspot, 'id' | 'title' | 'kind'>;
  metres?: number;
  cell?: string;
  /** The channel of a region, by id. */
  region?: string;
}

/**
 * The report of a plan: the header, then one line per gym by id (a review item with its nearest
 * candidate), then one per Wayspot that is added, then one per Wayspot that is held (`held`:
 * with the gym that holds it back where `gyms` names it, else none), then one per Wayfarer gym
 * just outside the regions (`outside`: its distance from the nearest outline and that region's
 * channel, by name), then one per gym beyond the scanned area (`beyond`: in no region, outside
 * the file's outlines grown by its margin, with how far beyond the nearest outline; what the
 * deletion after an import offers). `gyms` gives the names of the gyms this server may name, `channels` those
 * of the regions' channels; a gym or a channel it lacks has an empty one. Lines end with CR LF,
 * and the file begins with a byte order mark.
 */
export function importReportCsv(
  plan: ImportPlan,
  gyms: ReadonlyMap<number, { name: string }>,
  channels: ReadonlyMap<string, string> = new Map(),
  beyond: readonly BeyondGym[] = [],
): string {
  const lines: Line[] = [
    ...plan.matched.map((match): Line => ({
      gym: match.gymId,
      what: matchedWhat(match),
      wayspot: match.wayspot,
      metres: match.metres,
    })),
    ...plan.reviews.map((review): Line => {
      const nearest: ReviewCandidate | undefined = review.candidates[0];
      return {
        gym: review.gymId,
        what: `review-${review.kind}`,
        ...(nearest ? { wayspot: nearest, metres: nearest.metres } : {}),
      };
    }),
    ...plan.notInWayfarer.map((gymId): Line => ({ gym: gymId, what: 'not-in-wayfarer' })),
    ...plan.answered.map((gymId): Line => ({ gym: gymId, what: 'answered' })),
    ...plan.notCovered.map((gap): Line => ({
      gym: gap.gymId,
      what: 'not-covered',
      cell: gap.cell,
    })),
  ].sort((a, b) => (a.gym ?? 0) - (b.gym ?? 0));
  const added = plan.added.map((wayspot): Line => ({ gym: null, what: 'added', wayspot }));
  const held = plan.held.map(({ wayspot, gymId }): Line => ({
    gym: gyms.has(gymId) ? gymId : null,
    what: 'held',
    wayspot,
  }));
  const outside = plan.outsideGyms.map((one): Line => ({
    gym: null,
    what: 'outside',
    wayspot: one.wayspot,
    metres: one.metres,
    region: one.channelId,
  }));
  const past = beyond.map((one): Line => ({ gym: one.gymId, what: 'beyond', metres: one.metres }));
  const rows = [...lines, ...added, ...held, ...outside, ...past].map((line) =>
    [
      line.gym === null ? '' : String(line.gym),
      line.gym === null ? '' : cell(gyms.get(line.gym)?.name ?? ''),
      line.what,
      line.wayspot?.id ?? '',
      cell(line.wayspot?.title ?? ''),
      line.wayspot?.kind ?? '',
      line.metres === undefined ? '' : metres(line.metres),
      line.cell ?? '',
      line.region === undefined ? '' : cell(channels.get(line.region) ?? ''),
    ].join(','),
  );
  return BYTE_ORDER_MARK + [REPORT_HEADER, ...rows].map((row) => `${row}\r\n`).join('');
}
