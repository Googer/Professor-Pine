import { cellCentre, isWayfarerCell } from '@pine/wayspot-core/s2';
import { describe, expect, it } from 'vitest';
import { metresBetween } from '@pine/wayspot-core/distance';
import type { ResearchDecision } from '../research/reports.js';
import type { RocketDecision } from '../rocket/reports.js';
import {
  confirmedWith,
  detailWithoutMembers,
  endingOfRow,
  reportCell,
  researchFate,
  rocketFate,
  takeBackEnding,
} from './report-history.js';

const BROCK = '200000000000000031';
const MISTY = '200000000000000032';
const GARY = '200000000000000033';

describe('how a research report standing at a stop ends (plan 8H-2, Part A)', () => {
  const cases: [ResearchDecision, string, ReturnType<typeof researchFate>][] = [
    // A reward over the "one of": narrowed, and a confirmation by another member.
    ['narrow', MISTY, { ending: 'narrowed', confirms: true }],
    ['narrow', BROCK, { ending: 'narrowed', confirms: false }],
    // Reported already: kept, and confirmed by another member only.
    ['again', MISTY, { ending: undefined, confirms: true }],
    ['again', BROCK, { ending: undefined, confirms: false }],
    ['less', MISTY, { ending: undefined, confirms: true }],
    ['less', BROCK, { ending: undefined, confirms: false }],
    // A contradiction replaced: the reporter's own corrected, another's ticked contradicted.
    ['correct', BROCK, { ending: 'corrected', confirms: false }],
    ['correct', MISTY, { ending: 'contradicted', confirms: false }],
    // Asked first: nothing happens to it; nothing standing: nothing to end.
    ['asks', MISTY, { ending: undefined, confirms: false }],
    ['new', MISTY, { ending: undefined, confirms: false }],
  ];
  it.each(cases)('%s by %s', (decision, by, fate) => {
    expect(researchFate(decision, BROCK, by)).toEqual(fate);
  });
});

describe('how a Rocket report standing at a stop ends (plan 8H-2, Part A)', () => {
  const cases: [RocketDecision, string, ReturnType<typeof rocketFate>][] = [
    // Grunt over grunt, hideout over anything: Rocket's turnover, by anyone.
    ['report', MISTY, { ending: 'churned', confirms: false }],
    ['report', BROCK, { ending: 'churned', confirms: false }],
    // Refined in place: the version before it ends as refined.
    ['refine', MISTY, { ending: 'refined', confirms: false }],
    // The same grunt again: confirmed by another member only.
    ['already', MISTY, { ending: undefined, confirms: true }],
    ['already', BROCK, { ending: undefined, confirms: false }],
    ['asks', MISTY, { ending: undefined, confirms: false }],
  ];
  it.each(cases)('%s by %s', (decision, by, fate) => {
    expect(rocketFate(decision, BROCK, by)).toEqual(fate);
  });
});

describe('how each row a save takes away ends', () => {
  const at = 10_000;

  it('says a row whose end had passed stood, ended at its own end (review H3)', () => {
    expect(endingOfRow({ endsAt: 9_000 }, at, 'contradicted')).toEqual({
      ending: 'stood',
      endedAt: 9_000,
    });
    expect(endingOfRow({ endsAt: at }, at, undefined)).toEqual({ ending: 'stood', endedAt: at });
  });

  it('ends the row decided about as decided, at the moment of the save', () => {
    expect(endingOfRow({ endsAt: 20_000 }, at, 'narrowed')).toEqual({
      ending: 'narrowed',
      endedAt: at,
    });
    expect(endingOfRow({ endsAt: 20_000 }, at, 'refined')).toEqual({
      ending: 'refined',
      endedAt: at,
    });
  });

  it('churns any other row that still stood (a grunt of yesterday past midnight)', () => {
    expect(endingOfRow({ endsAt: 20_000 }, at, undefined)).toEqual({
      ending: 'churned',
      endedAt: at,
    });
  });
});

describe('how a report taken back ends (review H8)', () => {
  it('is withdrawn by its reporter, whoever they are', () => {
    expect(takeBackEnding(BROCK, BROCK, 'member')).toBe('withdrawn');
    expect(takeBackEnding(BROCK, BROCK, 'staff')).toBe('withdrawn');
  });

  it('is staff’s where somebody else took it back', () => {
    expect(takeBackEnding(BROCK, MISTY, 'staff')).toBe('staff');
  });

  it('is unposted where Pine undid a grunt shown nowhere, its reporter’s or not', () => {
    expect(takeBackEnding(BROCK, BROCK, 'unposted')).toBe('unposted');
    expect(takeBackEnding(BROCK, MISTY, 'unposted')).toBe('unposted');
  });
});

describe('who confirmed a version (review H6)', () => {
  it('counts each other member once, never the reporter', () => {
    const once = confirmedWith([], MISTY, BROCK);
    expect(once).toEqual([MISTY]);
    // Ten presses of "Already reported" by one friend confirm once: the very same list.
    expect(confirmedWith(once, MISTY, BROCK)).toBe(once);
    expect(confirmedWith(once, BROCK, BROCK)).toBe(once);
    expect(confirmedWith(once, GARY, BROCK)).toEqual([MISTY, GARY]);
  });
});

describe('the detail as the history keeps it (review H12)', () => {
  it('writes every member a text names @member, and leaves the rest as it is', () => {
    const detail = {
      text: `Trade with <@${MISTY}> or ${GARY}`,
      category: null,
      rewards: [{ kind: 'encounter', name: 'Dratini <:shiny:123456789012345678>', dex: 147 }],
      typed: true,
    };
    expect(detailWithoutMembers(detail)).toEqual({
      text: 'Trade with @member or @member',
      category: null,
      rewards: [{ kind: 'encounter', name: 'Dratini <:shiny:123456789012345678>', dex: 147 }],
      typed: true,
    });
  });

  it('walks a detail of a shape this version cannot read, and keeps it JSON', () => {
    const odd = { balloon: [`<@!${BROCK}>`, 3, true, null] };
    const kept = detailWithoutMembers(odd);
    expect(kept).toEqual({ balloon: ['@member', 3, true, null] });
    expect(JSON.parse(JSON.stringify(kept))).toEqual(kept);
  });
});

describe('where a report is kept to have been (Q1)', () => {
  const MURAL = { lat: 40.4441, lon: -79.9901 };

  it('is the S2 cell of level 14 its stop lies in, about 600 meters across', () => {
    const cell = reportCell(MURAL);
    // Level 14, as Wayfarer's cells are.
    expect(isWayfarerCell(cell)).toBe(true);
    const centre = cellCentre(cell);
    expect(centre && metresBetween(centre, MURAL)).toBeLessThan(600);
  });

  it('is the same cell for a stop next door, another a few kilometers away', () => {
    expect(reportCell({ lat: 40.4442, lon: -79.9902 })).toBe(reportCell(MURAL));
    expect(reportCell({ lat: 40.48, lon: -79.95 })).not.toBe(reportCell(MURAL));
  });
});
