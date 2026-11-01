import { describe, expect, it } from 'vitest';
import { matchPowerSpot, type SpotTitle } from './power-spot-match.js';

/** Invented Power Spots: three in the channel's region, two elsewhere in the server. */
const SPOTS: SpotTitle[] = [
  { id: 'a1', title: "Juniper's Swing Corner", local: true },
  { id: 'a2', title: 'Old Lantern Fountain', local: true },
  { id: 'a3', title: 'Bramble Creek Trailhead Kiosk and Map Board', local: true },
  { id: 'b1', title: 'Old Lantern Fountains', local: false },
  { id: 'b2', title: 'Copperleaf Mural', local: false },
];
const ids = (match: ReturnType<typeof matchPowerSpot>) =>
  match.kind === 'candidates' ? match.spots.map((spot) => spot.id) : [];

describe('matchPowerSpot', () => {
  it('matches a name whose space was lost, in capitals, without minding punctuation', () => {
    expect(matchPowerSpot("JUNIPER'SSWING CORNER", SPOTS)).toEqual({
      kind: 'clear',
      spot: SPOTS[0],
    });
    expect(matchPowerSpot('COPPERLEAF MURAL', SPOTS)).toEqual({ kind: 'clear', spot: SPOTS[4] });
  });

  it('matches a name the screen cut short as the start of a title', () => {
    expect(matchPowerSpot('BRAMBLE CREEK TRAILHEAD KIOSK AND', SPOTS)).toEqual({
      kind: 'clear',
      spot: SPOTS[2],
    });
    // Too short a start says nothing: six letters and digits are the least.
    expect(matchPowerSpot('OLD', SPOTS).kind).toBe('unknown');
    expect(matchPowerSpot('COPPER', SPOTS)).toEqual({ kind: 'clear', spot: SPOTS[4] });
    expect(matchPowerSpot('COPPE', SPOTS).kind).toBe('unknown');
  });

  it('takes a title equal to the name before titles it is the start of', () => {
    const bench: SpotTitle = { id: 'd1', title: 'Maple Bench', local: true };
    const east: SpotTitle = { id: 'd2', title: 'Maple Bench East', local: true };
    expect(matchPowerSpot('MAPLE BENCH', [east, bench])).toEqual({ kind: 'clear', spot: bench });
    // Equal elsewhere in the server, the start of one in the region: still the equal one.
    const away = { ...bench, local: false };
    expect(matchPowerSpot('MAPLE BENCH', [east, away])).toEqual({ kind: 'clear', spot: away });
    // Two equal titles in the region: neither is taken.
    const twin: SpotTitle = { id: 'd3', title: 'MAPLE BENCH', local: true };
    expect(ids(matchPowerSpot('MAPLE BENCH', [east, bench, twin]))).toEqual(['d1', 'd3', 'd2']);
  });

  it('takes the one match in the channel’s region before one elsewhere in the server', () => {
    // "Old Lantern Fountain" is the start of "Old Lantern Fountains" too, which lies elsewhere.
    expect(matchPowerSpot('OLD LANTERN FOUNTAIN', SPOTS)).toEqual({
      kind: 'clear',
      spot: SPOTS[1],
    });
  });

  it('asks about a cut name that fits a spot of the region and spots elsewhere (plan 8F-1)', () => {
    // "Old Lantern Foun…" starts a title in the region and one elsewhere: the member chooses.
    expect(matchPowerSpot('OLD LANTERN FOUN', SPOTS)).toEqual({
      kind: 'candidates',
      spots: [SPOTS[1], SPOTS[3]],
    });
    // Fitting a spot of the region only, or one spot elsewhere only, it stays clear.
    const only = SPOTS.filter((spot) => spot.id !== 'b1');
    expect(matchPowerSpot('OLD LANTERN FOUN', only)).toEqual({ kind: 'clear', spot: SPOTS[1] });
    expect(matchPowerSpot('COPPERLEAF MU', SPOTS)).toEqual({ kind: 'clear', spot: SPOTS[4] });
  });

  it('offers every title at least 80% alike when none matches outright, the region’s first', () => {
    const match = matchPowerSpot('OLD LANTERN FOUNTIAN', SPOTS);
    expect(match.kind).toBe('candidates');
    expect(ids(match)).toEqual(['a2', 'b1']);
    // Two alike in the region: both offered, neither taken.
    const twins: SpotTitle[] = [
      { id: 'c1', title: 'Maple Bench East', local: true },
      { id: 'c2', title: 'Maple Bench West', local: true },
    ];
    expect(ids(matchPowerSpot('MAPLE BENCH', twins))).toEqual(['c1', 'c2']);
  });

  it('knows no spot that is not even 80% alike, nor a name that was not read', () => {
    expect(matchPowerSpot('HARBOR SIGNAL TOWER', SPOTS)).toEqual({ kind: 'unknown' });
    expect(matchPowerSpot(null, SPOTS)).toEqual({ kind: 'unknown' });
    expect(matchPowerSpot('...', SPOTS)).toEqual({ kind: 'unknown' });
  });
});
