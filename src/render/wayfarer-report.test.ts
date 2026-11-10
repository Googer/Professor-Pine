import { describe, expect, it } from 'vitest';
import type { ExportedWayspot, WayspotKind } from '@pine/wayspot-core/export-file';
import type { ImportPlan, Matched } from '../domain/wayspots/match.js';
import { importReportCsv, REPORT_HEADER } from './wayfarer-report.js';

const CHANNELS = new Map([['111', 'squirrel-hill']]);

const idOf = (n: number): string => `${n.toString(16).padStart(32, '0')}.16`;

function wayspot(n: number, title: string, kind: WayspotKind = 'gym'): ExportedWayspot {
  return {
    id: idOf(n),
    kind,
    status: 'ACTIVE',
    lat: 40.05,
    lon: -80.05,
    title,
    address: '',
    description: '',
    image: '',
  };
}

function matched(gymId: number, more: Partial<Matched> = {}): Matched {
  return {
    gymId,
    wayspot: wayspot(gymId, `Title ${gymId}`),
    by: 'id',
    metres: 1.04,
    rename: null,
    tidyOnly: false,
    titleProblem: null,
    move: false,
    picture: null,
    unmark: false,
    ...more,
  };
}

function plan(more: Partial<ImportPlan> = {}): ImportPlan {
  return {
    matched: [],
    added: [],
    held: [],
    reviews: [],
    notInWayfarer: [],
    notCovered: [],
    unchangedSeen: [],
    outside: 0,
    outsideGyms: [],
    answered: [],
    ...more,
  };
}

const names = (...entries: [number, string][]): Map<number, { name: string }> =>
  new Map(entries.map(([id, name]) => [id, { name }]));

/** The rows of a report, without the byte order mark, the header and the line ends. */
function rows(csv: string): string[] {
  const lines = csv.split('\r\n');
  expect(lines.pop()).toBe('');
  expect(lines.shift()).toBe(`\ufeff${REPORT_HEADER}`);
  return lines;
}

describe('importReportCsv', () => {
  it('writes only the header for an empty plan, with a byte order mark and CR LF', () => {
    expect(importReportCsv(plan(), new Map())).toBe(`\ufeff${REPORT_HEADER}\r\n`);
  });

  it('writes one line per gym by id, then the added Wayspots', () => {
    const csv = importReportCsv(
      plan({
        matched: [
          matched(4),
          matched(1, { by: 'name', rename: 'Title 1' }),
          matched(2, { by: 'place', metres: 4.26, move: true, rename: 'Title 2' }),
          matched(6, { by: 'name' }),
          matched(7, { by: 'place' }),
        ],
        reviews: [
          {
            gymId: 3,
            kind: 'match',
            candidates: [
              { id: idOf(30), kind: 'stop', title: 'Bench', lat: 40, lon: -80, metres: 12.34 },
              { id: idOf(31), kind: 'gym', title: 'Mural', lat: 40, lon: -80, metres: 40 },
            ],
          },
          { gymId: 5, kind: 'unknown', candidates: [] },
          {
            gymId: 9,
            kind: 'missing',
            candidates: [
              { id: idOf(90), kind: 'powerspot', title: 'Field', lat: 40, lon: -80, metres: 0 },
            ],
          },
        ],
        notInWayfarer: [8],
        notCovered: [{ gymId: 10, cell: '89c25' }],
        answered: [11],
        added: [wayspot(50, 'New Mural')],
      }),
      names([1, 'Library'], [2, 'Fountain'], [3, 'Church'], [4, 'Bridge'], [8, 'Starbucks']),
    );
    expect(rows(csv)).toEqual([
      `1,Library,renamed,${idOf(1)},Title 1,gym,1.0,,`,
      `2,Fountain,moved,${idOf(2)},Title 2,gym,4.3,,`,
      `3,Church,review-match,${idOf(30)},Bench,stop,12.3,,`,
      `4,Bridge,matched-id,${idOf(4)},Title 4,gym,1.0,,`,
      '5,,review-unknown,,,,,,',
      `6,,matched-name,${idOf(6)},Title 6,gym,1.0,,`,
      `7,,matched-place,${idOf(7)},Title 7,gym,1.0,,`,
      '8,Starbucks,not-in-wayfarer,,,,,,',
      `9,,review-missing,${idOf(90)},Field,powerspot,0.0,,`,
      '10,,not-covered,,,,,89c25,',
      '11,,answered,,,,,,',
      `,,added,${idOf(50)},New Mural,gym,,,`,
    ]);
  });

  it('quotes a text with a comma or a quote, and keeps every row on one line', () => {
    const csv = importReportCsv(
      plan({ matched: [matched(1, { wayspot: wayspot(1, 'The "Old"\nMill, by the\r\nriver') })] }),
      names([1, 'Mill, Old']),
    );
    expect(rows(csv)).toEqual([
      `1,"Mill, Old",matched-id,${idOf(1)},"The ""Old"" Mill, by the river",gym,1.0,,`,
    ]);
  });

  it('keeps a spreadsheet from reading a title or a name as a formula', () => {
    const csv = importReportCsv(
      plan({
        added: [wayspot(1, '=HYPERLINK("http://example.invalid")'), wayspot(2, '@SUM(A1)')],
        notInWayfarer: [3, 4],
      }),
      names([3, '+1 Plaza'], [4, '-Dash']),
    );
    expect(rows(csv)).toEqual([
      "3,'+1 Plaza,not-in-wayfarer,,,,,,",
      "4,'-Dash,not-in-wayfarer,,,,,,",
      `,,added,${idOf(1)},"'=HYPERLINK(""http://example.invalid"")",gym,,,`,
      `,,added,${idOf(2)},'@SUM(A1),gym,,,`,
    ]);
  });

  it('lists the held Wayspots after the added ones, with the gym only where it may be named', () => {
    const csv = importReportCsv(
      plan({
        added: [wayspot(50, 'New Mural')],
        held: [
          { wayspot: wayspot(70, 'Sixth Mural'), gymId: 3 },
          { wayspot: wayspot(71, 'Their Mural'), gymId: 99 },
        ],
        outsideGyms: [{ wayspot: wayspot(60, 'Water Tower'), metres: 212.34, channelId: '111' }],
      }),
      names([3, 'Church']),
      CHANNELS,
    );
    expect(rows(csv)).toEqual([
      `,,added,${idOf(50)},New Mural,gym,,,`,
      `3,Church,held,${idOf(70)},Sixth Mural,gym,,,`,
      `,,held,${idOf(71)},Their Mural,gym,,,`,
      `,,outside,${idOf(60)},Water Tower,gym,212.3,,squirrel-hill`,
    ]);
  });

  it('lists the Wayfarer gyms just outside the regions after the added ones, with their region', () => {
    const csv = importReportCsv(
      plan({
        added: [wayspot(50, 'New Mural')],
        outsideGyms: [
          { wayspot: wayspot(60, 'Water Tower'), metres: 212.34, channelId: '111' },
          { wayspot: wayspot(61, 'Gazebo'), metres: 480, channelId: '222' },
        ],
      }),
      new Map(),
      CHANNELS,
    );
    expect(rows(csv)).toEqual([
      `,,added,${idOf(50)},New Mural,gym,,,`,
      `,,outside,${idOf(60)},Water Tower,gym,212.3,,squirrel-hill`,
      `,,outside,${idOf(61)},Gazebo,gym,480.0,,`,
    ]);
  });
});
