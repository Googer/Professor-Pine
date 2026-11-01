import type { ExportedWayspot, WayspotKind } from '@pine/wayspot-core/export-file';
import type { ImportPlan, Matched } from '../../src/domain/wayspots/match.js';
import { importReportCsv } from '../../src/render/wayfarer-report.js';

/**
 * The input of `@pine/wayspot-core/fixtures/import-report.csv`, the import's report as
 * `/gym import` attaches it: the file is a contract with the Pine Wayspot export tool, and
 * `wayfarer-report.contract.test.ts` checks that the writer still makes exactly it. A change of the
 * writer that changes the file is checked against the tool before the fixture is made anew. Every kind of
 * line, two gyms in cells the export did not cover (one named with a comma and quotes), a cell
 * token in a name.
 */

const idOf = (n: number): string => `${n.toString(16).padStart(32, '0')}.16`;

function wayspot(n: number, title: string, kind: WayspotKind = 'gym'): ExportedWayspot {
  return {
    id: idOf(n),
    kind,
    status: 'ACTIVE',
    lat: 40.44,
    lon: -79.95,
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

const PLAN: ImportPlan = {
  matched: [
    matched(1),
    matched(2, { by: 'name', rename: 'Title 2' }),
    matched(3, { by: 'place', metres: 4.26, move: true }),
  ],
  added: [wayspot(50, 'New Mural')],
  held: [{ wayspot: wayspot(70, 'Sixth Mural'), gymId: 4 }],
  reviews: [
    {
      gymId: 4,
      kind: 'match',
      candidates: [
        { id: idOf(30), kind: 'stop', title: 'Bench', lat: 40.44, lon: -79.95, metres: 12.34 },
      ],
    },
    { gymId: 5, kind: 'unknown', candidates: [] },
  ],
  notInWayfarer: [6],
  notCovered: [
    { gymId: 7, cell: '8834ede1' },
    { gymId: 8, cell: '8834f1fd' },
  ],
  unchangedSeen: [],
  outside: 0,
  outsideGyms: [{ wayspot: wayspot(60, 'Water Tower'), metres: 212.34, channelId: '111' }],
  answered: [9],
};

const GYMS = new Map<number, { name: string }>([
  [1, { name: 'Library' }],
  [2, { name: 'Fountain' }],
  [3, { name: 'Church' }],
  [4, { name: 'Bridge' }],
  [7, { name: 'Mural 8834ee1b' }],
  [8, { name: 'Cafe "Corner", the old one' }],
]);

/** The report the fixture holds, made by the writer as it is now. */
export function importReportFixtureText(): string {
  return importReportCsv(PLAN, GYMS, new Map([['111', 'squirrel-hill']]), [
    { gymId: 10, metres: 812.5 },
  ]);
}
