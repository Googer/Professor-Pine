import { describe, expect, it } from 'vitest';
import type { PageNode } from './popup.js';
import {
  CASE_ICONS as ICONS,
  CASE_NOW as NOW,
  caseGrunt as grunt,
  caseHideout as hideout,
  caseResearch as research,
  caseView as view,
} from './stop-report-cases.js';
import {
  nextEnd,
  reportsAtStops,
  reportsInView,
  stopMarkerFacts,
  stopMarkerNode,
  stopPlaced,
} from './stop-reports.js';

const MINUTE = 60_000;
const everything = { on: () => true, now: NOW };

/** Every class name of a tree. */
const classes = (node: PageNode): string[] => [
  ...(node.className === undefined ? [] : node.className.split(' ')),
  ...(node.children ?? []).flatMap(classes),
];

describe('the reports at stops on the map (plan 8M-9B)', () => {
  it('gathers every report shown at a stop into one, for the layers on', () => {
    const at = reportsAtStops(
      view({ research: [research(1), research(2)], grunts: [grunt(1)], hideouts: [hideout(3)] }),
      everything,
    );
    expect(
      at.map((one) => [one.stop.key, one.research.length, one.grunts.length, one.hideouts.length]),
    ).toEqual([
      ['stop-1', 1, 1, 0],
      ['stop-2', 1, 0, 0],
      ['stop-3', 0, 0, 1],
    ]);
    const rocketOff = reportsAtStops(
      view({ research: [research(1)], grunts: [grunt(1)], hideouts: [hideout(3)] }),
      { on: (layer) => layer === 'research', now: NOW },
    );
    expect(rocketOff.map((one) => [one.stop.key, one.grunts.length])).toEqual([['stop-1', 0]]);
    expect(reportsAtStops(undefined, everything)).toEqual([]);
  });

  it('drops a report at its end without waiting for the list, but keeps the stop that is open', () => {
    const ended = grunt(1, { endsAt: NOW - 1 });
    expect(reportsAtStops(view({ grunts: [ended] }), everything)).toEqual([]);
    const kept = reportsAtStops(view({ grunts: [ended] }), {
      ...everything,
      keep: new Set(['stop-1']),
    });
    expect(kept.map((one) => one.grunts.length)).toEqual([1]);
    // The next end to drop one at, of what has not ended.
    expect(nextEnd(view({ research: [research(1)], grunts: [grunt(2), ended] }), NOW)).toBe(
      NOW + 25 * MINUTE,
    );
    expect(nextEnd(view(), NOW)).toBeUndefined();
  });

  it('leaves out what a filter hides', () => {
    const at = reportsAtStops(view({ research: [research(1)], grunts: [grunt(1), grunt(2)] }), {
      ...everything,
      shows: (report) => report.id !== 101,
    });
    expect(at.map((one) => [one.stop.key, one.grunts.map((each) => each.id)])).toEqual([
      ['stop-1', []],
      ['stop-2', [102]],
    ]);
  });

  it('pictures a stop by a hideout’s picture, else the research’s, else the Rocket icon', () => {
    const [both] = reportsAtStops(
      view({ research: [research(1)], hideouts: [hideout(1)] }),
      everything,
    );
    expect(stopMarkerFacts(both!, NOW).picture).toEqual({
      kind: 'picture',
      src: 'https://map.example.test/pictures/arlo.png',
    });
    const [task] = reportsAtStops(
      view({ research: [research(1)], grunts: [grunt(1)] }),
      everything,
    );
    expect(stopMarkerFacts(task!, NOW).picture).toEqual({
      kind: 'picture',
      src: `${ICONS}pm147.icon.png`,
    });
    const [rocket] = reportsAtStops(view({ grunts: [grunt(1)] }), everything);
    expect(stopMarkerFacts(rocket!, NOW).picture).toEqual({ kind: 'icon', icon: 'rocket' });
    // A typed task without its reward has no picture: the research icon.
    const [typed] = reportsAtStops(
      view({ research: [research(1, { picture: undefined, rewards: [], typed: true })] }),
      everything,
    );
    expect(stopMarkerFacts(typed!, NOW).picture).toEqual({ kind: 'icon', icon: 'research' });
  });

  it('rings a stop by its layers, both when it has both, with a grunt’s minutes and last minutes', () => {
    const [both] = reportsAtStops(
      view({ research: [research(1)], grunts: [grunt(1)] }),
      everything,
    );
    const facts = stopMarkerFacts(both!, NOW);
    expect(facts.ring).toBe('both');
    expect(facts.end).toBe(NOW + 25 * MINUTE);
    expect(facts.badge).toBe('25 min');
    expect(facts.dimmed).toBe(false);
    const [soon] = reportsAtStops(
      view({ grunts: [grunt(1, { endsAt: NOW + 4 * MINUTE })] }),
      everything,
    );
    expect(stopMarkerFacts(soon!, NOW)).toMatchObject({
      ring: 'rocket',
      badge: '4 min',
      dimmed: true,
    });
    const [task] = reportsAtStops(view({ research: [research(1)] }), everything);
    expect(stopMarkerFacts(task!, NOW)).toMatchObject({ ring: 'research' });
    expect(stopMarkerFacts(task!, NOW).badge).toBeUndefined();
  });

  it('draws a stop’s marker as a circle of ours, a grunt’s end on it for the page to keep current', () => {
    const [both] = reportsAtStops(
      view({ research: [research(1)], grunts: [grunt(1)] }),
      everything,
    );
    const node = stopMarkerNode(both!, NOW, 'full');
    expect(classes(node)).toEqual(expect.arrayContaining(['stop-marker', 'both', 'ring', 'badge']));
    expect(node.attributes).toMatchObject({
      'data-stage': 'hatched',
      'data-end': String(NOW + 25 * MINUTE),
    });
    // Zoomed out, no badge.
    expect(classes(stopMarkerNode(both!, NOW, 'small'))).not.toContain('badge');
    const [rocket] = reportsAtStops(view({ grunts: [grunt(2)] }), everything);
    expect(JSON.stringify(stopMarkerNode(rocket!, NOW, 'full'))).toContain('teamrocket_r.png');
    const [task] = reportsAtStops(view({ research: [research(3)] }), everything);
    expect(stopMarkerNode(task!, NOW, 'full').attributes).not.toHaveProperty('data-end');
  });

  it('names a stop in the list of things at one place by its name and what it has', () => {
    const [both] = reportsAtStops(
      view({ research: [research(1)], grunts: [grunt(1)], hideouts: [] }),
      everything,
    );
    expect(stopPlaced(both!, NOW)).toMatchObject({
      key: 'stop:stop-1',
      gymId: null,
      name: 'Yellow Mural 1',
      time: 'Field research · Water-type grunt 25 min',
      picture: `${ICONS}pm147.icon.png`,
    });
  });

  it('counts the reports in view by layer, for the sheet of the layers', () => {
    const at = reportsAtStops(
      view({ research: [research(1), research(5)], grunts: [grunt(1)], hideouts: [hideout(1)] }),
      everything,
    );
    expect(reportsInView(at, (point) => point.lat < 40.443)).toEqual({ research: 1, rocket: 2 });
  });
});
