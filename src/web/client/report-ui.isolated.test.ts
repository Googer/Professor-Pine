import { describe, expect, it, vi } from 'vitest';
import type { GeoView } from '../../domain/web/geo-data.js';
import type { PageNode, MapGym } from './popup.js';
import { FormHold } from './raid-forms.js';
import { REPORT_KINDS, type ReportKind } from './report-menu.js';
import { ReportFlow, type ReportFlowDeps } from './report-ui.js';
import type { MapSpot } from './max-ui.js';

// Leaflet reads the browser's `window` as it loads; the Report button's controller uses none of
// it (only `reportUi`, the page's side, does). Isolated: a mocked module needs a module graph of
// its own (testing.md).
vi.mock('leaflet', () => ({}));

/** Every text of a tree, in order. */
const texts = (node: PageNode | undefined): string[] =>
  node === undefined
    ? []
    : [...(node.text === undefined ? [] : [node.text]), ...(node.children ?? []).flatMap(texts)];

const kind = (id: string): ReportKind => {
  const found = REPORT_KINDS.find((one) => one.id === id);
  if (!found) throw new Error(id);
  return found;
};

const gym = (id: number, name: string, lat: number, lon: number): MapGym => ({
  id,
  name,
  nickname: null,
  lat,
  lon,
  regionIds: [1],
  address: null,
  description: null,
  notice: null,
});

const GYMS = new Map([
  [1, gym(1, 'Library', 40.441, -79.95)],
  [2, gym(2, 'Fountain', 40.444, -79.95)],
]);

const REGIONS: GeoView['regions'] = [
  {
    id: 7,
    name: 'oakland',
    outline: [
      [40.43, -79.97],
      [40.46, -79.97],
      [40.46, -79.93],
      [40.43, -79.93],
      [40.43, -79.97],
    ],
  },
];

/**
 * The controller over a real hold and fake deps that write down what they were asked, and, for a
 * step 3, whether the hold was free at that moment (the form takes its own claim).
 */
function started(more: Partial<ReportFlowDeps> = {}) {
  const calls: string[] = [];
  let box: PageNode | undefined;
  /** The live part of the box drawn anew since the box was drawn (R2-2). */
  let live: PageNode | undefined;
  const landings: Array<() => void> = [];
  let inBox = true;
  const later: Array<() => void> = [];
  const hold = new FormHold<string>({
    draw: () => undefined,
    popup: () => undefined,
    later: (run) => {
      run();
    },
    controls: () => undefined,
  });
  const free = () => (hold.editing ? 'held' : 'free');
  const deps: ReportFlowDeps = {
    hold,
    say: (text) => calls.push(`say ${text}`),
    showBox: (node) => {
      box = node;
      live = undefined;
      calls.push(node === undefined ? 'box back' : 'box');
    },
    showLive: (node) => {
      live = node;
      calls.push('live');
    },
    focusBox: () => calls.push('focus box'),
    focusInBox: () => inBox,
    focusReport: () => calls.push('focus Report'),
    mark: (pick) => calls.push(`mark ${pick ?? 'none'}`),
    placesChanged: () => calls.push('places'),
    redrawn: () => calls.push('redrawn'),
    closePopup: () => calls.push('close popup'),
    openMenu: () => calls.push('menu'),
    later: (run) => later.push(run),
    regions: REGIONS,
    gyms: GYMS,
    origin: () => ({ lat: 40.44, lon: -79.95 }),
    units: 'imperial',
    flyTo: (at, landed) => {
      calls.push(`fly ${String(at.lat)}`);
      landings.push(landed);
    },
    showPin: (point) => calls.push(point === undefined ? 'pin off' : `pin ${String(point.lat)}`),
    openRaid: (one) => {
      calls.push(`raid? ${one.name} ${free()}`);
      return one.id === 2;
    },
    toRaidForm: (one) => calls.push(`raid form ${one.name} ${free()}`),
    openBattle: (spot) => {
      calls.push(`battle? ${spot} ${free()}`);
      return spot === 'busy';
    },
    toMaxForm: (spot) => calls.push(`max form ${spot.title} ${free()}`),
    maxAt: (point) => calls.push(`max at ${String(point.lat)} ${free()}`),
    spawnAt: (point, place) =>
      calls.push(
        `spawn at ${place ? `${place.kind}:${place.id} ` : ''}${String(point.lat)} ${free()}`,
      ),
    startTrain: (region) => calls.push(`train ${String(region)}`),
    startMeetup: () => calls.push('meetup'),
    toStop: (id, stop) => calls.push(`${id} at ${stop.title} ${free()}`),
    // The server's nearest never come, unless the test says so (plan 8M-11A).
    nearest: () => new Promise(() => undefined),
    ...more,
  };
  const flow = new ReportFlow(deps);
  return {
    flow,
    hold,
    calls,
    box: () => box,
    /** What the box shows now: its live part as last drawn, else the box as drawn. */
    shown: () => texts(live ?? box),
    land: () => {
      for (const landed of landings.splice(0)) landed();
    },
    leave: () => {
      inBox = false;
    },
    runLater: () => {
      for (const run of later.splice(0)) run();
    },
  };
}

describe("the Report button's step 2 (plan 8M-9A, R1-2)", () => {
  it('holds the side pane as route mode does, its heading focused, the places drawn', () => {
    const { flow, hold, calls, box } = started();
    flow.choose(kind('spawn'));
    expect(hold.editing).toBe(true);
    expect(hold.asideHeld).toBe(true);
    expect(flow.picks('point')).toBe(true);
    expect(flow.inTools()).toBe(true);
    expect(texts(box())[0]).toBe('Report a wild spawn');
    expect(calls).toEqual(['close popup', 'mark point', 'box', 'places', 'redrawn', 'focus box']);
  });

  it('gives everything back on Cancel: the hold, the box, the places, the focus on Report', () => {
    const { flow, hold, calls } = started();
    flow.choose(kind('spawn'));
    calls.length = 0;
    flow.cancel();
    expect(hold.editing).toBe(false);
    expect(flow.picks('point')).toBe(false);
    expect(calls).toEqual([
      'box back',
      'places',
      'redrawn',
      'mark none',
      'pin off',
      'focus Report',
    ]);
    // The focus elsewhere meanwhile: left where it is.
    const other = started();
    other.flow.choose(kind('spawn'));
    other.leave();
    other.calls.length = 0;
    other.flow.cancel();
    expect(other.calls).not.toContain('focus Report');
  });

  it('goes back to step 1 on ← Back', () => {
    const { flow, hold, calls } = started();
    flow.choose(kind('spawn'));
    calls.length = 0;
    flow.back();
    expect(hold.editing).toBe(false);
    expect(calls.at(-1)).toBe('menu');
  });

  it('closes an open popup on Escape, and only that; Escape again ends step 2', () => {
    const { flow, calls } = started();
    flow.choose(kind('spawn'));
    calls.length = 0;
    expect(flow.escape(true)).toBe(true);
    expect(calls).toEqual(['close popup']);
    expect(flow.picks('point')).toBe(true);
    expect(flow.escape(false)).toBe(true);
    expect(flow.picks('point')).toBe(false);
    // Outside step 2 Escape is not the Report button's.
    expect(flow.escape(false)).toBe(false);
  });

  // R2-5: Escape is the open sheet's (the layers'), never step 2's.
  it('leaves step 2 alone on Escape while another sheet is open', () => {
    const { flow, calls } = started();
    flow.choose(kind('spawn'));
    calls.length = 0;
    expect(flow.escape(false, true)).toBe(false);
    expect(flow.escape(true, true)).toBe(false);
    expect(flow.picks('point')).toBe(true);
    expect(calls).toEqual([]);
  });

  // R1-9: the list's draw asks whether Report is still offered; ending then draws nothing anew.
  it('ends when Report is no longer offered, without drawing the parties inside their draw', () => {
    const { flow, hold, calls } = started();
    flow.choose(kind('spawn'));
    calls.length = 0;
    flow.refresh(false);
    expect(hold.editing).toBe(false);
    expect(calls).toContain('places');
    expect(calls).not.toContain('redrawn');
    // Still offered: nothing changes.
    flow.choose(kind('spawn'));
    calls.length = 0;
    flow.refresh(true);
    expect(calls).toEqual([]);
  });

  it('says that another form is open, and takes nothing', () => {
    const { flow, hold, calls } = started();
    const other = hold.take(true);
    flow.choose(kind('raid'));
    expect(calls).toEqual(['say Close the form that is open first.']);
    expect(hold.holds(other ?? { inPopup: false })).toBe(true);
  });
});

describe("the Report button's step 2 per kind and step 3 (plan 8M-9A, A4 to A6)", () => {
  it('lists the nearest gyms; a gym picked opens its raid, else its form, the hold free first', () => {
    const { flow, calls, box } = started();
    flow.choose(kind('raid'));
    expect(texts(box())).toEqual(
      expect.arrayContaining(['Nearest', 'Library', '360 ft', 'Fountain', '0.3 mi']),
    );
    expect(calls).toContain('mark gyms');
    calls.length = 0;
    expect(flow.gymClicked(GYMS.get(1) as MapGym)).toBe(true);
    expect(calls).toContain('raid? Library free');
    expect(calls.at(-1)).toBe('raid form Library free');
    // The raid standing at a gym: opened, no form; from its line in the list too.
    flow.choose(kind('raid'));
    calls.length = 0;
    flow.nearPicked('2');
    expect(calls.at(-1)).toBe('raid? Fountain free');
  });

  it('flies to the Power Spots, lists them as they come, and says why when they do not', () => {
    const { flow, calls, shown, land } = started();
    flow.choose(kind('max'));
    expect(calls).toContain('fly 40.44');
    expect(shown()).toContain('Finding the nearest…');
    // R2-4: on its way, the map's zoom says nothing yet: the places are not taken off for good.
    flow.spotsCame('zoom');
    expect(shown()).toContain('Finding the nearest…');
    land();
    flow.spotsCame('failed');
    expect(shown()).toContain(
      'The Power Spots could not be loaded. Tap the map for an unlisted power spot.',
    );
    flow.spotsCame('zoom');
    expect(shown()).toContain('Zoom in to see the Power Spots near here.');
    // R2-2: only the live part of the box is drawn anew, never the box.
    calls.length = 0;
    flow.spotsCame([
      { id: 'busy', title: 'Gazebo', lat: 40.4405, lon: -79.95 },
      { id: 'quiet', title: 'Bench', lat: 40.442, lon: -79.95 },
    ]);
    expect(calls).toEqual(['live']);
    expect(shown()).toEqual(expect.arrayContaining(['Gazebo', 'Bench']));
    calls.length = 0;
    flow.nearPicked('quiet');
    expect(calls).toEqual([
      'box back',
      'places',
      'redrawn',
      'mark none',
      'pin off',
      'battle? quiet free',
      'max form Bench free',
    ]);
  });

  // Plan 8M-11A: the five nearest Power Spots the server gives, wherever they are, not those of
  // the view the map flew to.
  it('lists the nearest the server gives, and the view answering after does not replace them', async () => {
    const asked: string[] = [];
    let answer: (spots: readonly MapSpot[]) => void = () => undefined;
    const { flow, shown, land } = started({
      nearest: (pick, at) => {
        asked.push(`${pick} ${String(at.lat)}`);
        return new Promise((resolve) => {
          answer = resolve;
        });
      },
    });
    flow.choose(kind('max'));
    expect(asked).toEqual(['spots 40.44']);
    const far = (n: number): MapSpot => ({
      id: `s${String(n)}`,
      title: `Spot ${String(n)}`,
      lat: 40.44 + n / 100,
      lon: -79.95,
    });
    answer([1, 2, 3, 4, 5].map(far));
    await flow.nearestCame;
    expect(shown()).toEqual(expect.arrayContaining(['Spot 1', 'Spot 5']));
    land();
    flow.spotsCame([{ id: 'near', title: 'Gazebo', lat: 40.4405, lon: -79.95 }]);
    expect(shown()).toEqual(expect.arrayContaining(['Spot 1', 'Spot 5']));
    expect(shown()).not.toContain('Gazebo');
  });

  it("opens a battle's marker as it would, step 2 ending once the tap is through", () => {
    const { flow, hold, runLater } = started();
    flow.choose(kind('max'));
    expect(flow.spotClicked({ lat: 40.44, lon: -79.95 }, true)).toBe(false);
    expect(hold.editing).toBe(true);
    runLater();
    expect(hold.editing).toBe(false);
  });

  // Review B7: a battle's marker is dimmed while gyms are picked; its tap is no step 3 of a raid.
  it("takes a battle's tap while another kind is picked, and does nothing with it", () => {
    const { flow, hold, calls, runLater } = started();
    flow.choose(kind('raid'));
    calls.length = 0;
    expect(flow.spotClicked({ id: 'busy', lat: 40.44, lon: -79.95 }, true)).toBe(true);
    runLater();
    expect(calls).toEqual([]);
    expect(hold.editing).toBe(true);
    expect(flow.picks('gyms')).toBe(true);
    // Outside step 2 a battle opens as it would.
    flow.cancel();
    expect(flow.spotClicked({ id: 'busy', lat: 40.44, lon: -79.95 }, true)).toBe(false);
  });

  // R1-1: a tap puts a pin; the form opens from the box, so a double tap only zooms.
  it('puts a pin where the map is tapped, and opens the form there from the box', () => {
    const { flow, calls, shown } = started();
    flow.choose(kind('max'));
    calls.length = 0;
    expect(flow.mapClicked({ lat: 40.45, lon: -79.95 })).toBe(true);
    expect(flow.mapClicked({ lat: 40.451, lon: -79.95 })).toBe(true);
    expect(calls).toEqual(['pin 40.45', 'live', 'pin 40.451', 'live']);
    expect(flow.picks('spots')).toBe(true);
    expect(shown()).toEqual(expect.arrayContaining(['Unlisted power spot here', 'Report here']));
    calls.length = 0;
    flow.pinPicked();
    expect(calls.at(-1)).toBe('max at 40.451 free');
    expect(calls).toContain('pin off');
    // A spawn: its pin at a gym, a Power Spot or a PokéStop tapped, reported at that place
    // itself (Matt, 2026-11-07, as `/wild near:` names it); at a point tapped, a pin.
    const spawn = started();
    spawn.flow.choose(kind('spawn'));
    expect(spawn.flow.gymClicked(GYMS.get(2) as MapGym)).toBe(true);
    expect(spawn.shown()).toEqual(expect.arrayContaining(['Spawn here', 'Report here']));
    spawn.flow.pinPicked();
    expect(spawn.calls.at(-1)).toBe('spawn at gym:2 40.444 free');
    const tapped = (tap: (flow: ReportFlow) => void) => {
      const one = started();
      one.flow.choose(kind('spawn'));
      tap(one.flow);
      one.flow.pinPicked();
      return one.calls.at(-1);
    };
    expect(tapped((flow) => flow.spotClicked({ id: 'abc', lat: 40.45, lon: -79.95 }))).toBe(
      'spawn at powerspot:abc 40.45 free',
    );
    expect(
      tapped((flow) =>
        flow.stopClicked({ id: 'stop-1', title: 'Yellow Mural', lat: 40.44, lon: -79.95 }),
      ),
    ).toBe('spawn at stop:stop-1 40.44 free');
    // A place tapped, then a point: the pin is the point's.
    expect(
      tapped((flow) => {
        flow.gymClicked(GYMS.get(2) as MapGym);
        flow.mapClicked({ lat: 40.45, lon: -79.95 });
      }),
    ).toBe('spawn at 40.45 free');
    expect(tapped((flow) => flow.mapClicked({ lat: 40.45, lon: -79.95 }))).toBe(
      'spawn at 40.45 free',
    );
  });

  // Review B6: a point in no region is refused at the pin, step 2 going on, as a long press is.
  it('says a pin in no region is in none, on its line, and stays in step 2', () => {
    for (const id of ['spawn', 'max']) {
      const { flow, hold, calls, shown } = started();
      flow.choose(kind(id));
      flow.mapClicked({ lat: 41, lon: -81 });
      expect(shown()).toContain('That point is not in a region of this server.');
      expect(shown()).not.toContain('Report here');
      calls.length = 0;
      flow.pinPicked();
      expect(calls).toEqual([]);
      expect(hold.editing).toBe(true);
      // A pin moved into a region may be reported.
      flow.mapClicked({ lat: 40.45, lon: -79.95 });
      expect(shown()).toContain('Report here');
      expect(shown()).not.toContain('That point is not in a region of this server.');
    }
  });

  // Plan 8M-9B (B9): step 2 for stops as for Power Spots.
  it('flies to the PokéStops, lists the nearest, and opens the kind’s step 3 at the stop tapped', () => {
    for (const id of ['research', 'rocket']) {
      const { flow, calls, shown, land, hold } = started();
      flow.choose(kind(id));
      expect(calls).toContain('fly 40.44');
      expect(flow.picks('stops')).toBe(true);
      expect(shown()).toEqual(expect.arrayContaining(['Tap a PokéStop on the map.']));
      land();
      flow.stopsCame('failed');
      expect(shown()).toContain('The PokéStops could not be loaded. Try again in a moment.');
      flow.stopsCame('zoom');
      expect(shown()).toContain('Zoom in to see the PokéStops near here.');
      flow.stopsCame([
        { id: 'stop-1', title: 'Yellow Mural', lat: 40.4405, lon: -79.95 },
        { id: 'stop-2', title: 'Blue Bench', lat: 40.442, lon: -79.95 },
      ]);
      expect(shown()).toEqual(expect.arrayContaining(['Yellow Mural', 'Blue Bench']));
      // A tap on open map puts no pin: a report needs a stop.
      calls.length = 0;
      expect(flow.mapClicked({ lat: 40.45, lon: -79.95 })).toBe(true);
      expect(calls).toEqual(['live']);
      expect(shown()).toContain('Tap a PokéStop.');
      // A stop tapped (its dot, or the marker of its reports): step 3 there, the hold free first.
      calls.length = 0;
      expect(
        flow.stopClicked({ id: 'stop-2', title: 'Blue Bench', lat: 40.442, lon: -79.95 }),
      ).toBe(true);
      expect(calls.at(-1)).toBe(`${id} at Blue Bench free`);
      expect(hold.editing).toBe(false);
    }
    // A line of the nearest picks it as a tap does.
    const { flow, calls } = started();
    flow.choose(kind('research'));
    flow.stopsCame([{ id: 'stop-1', title: 'Yellow Mural', lat: 40.4405, lon: -79.95 }]);
    flow.nearPicked('stop-1');
    expect(calls.at(-1)).toBe('research at Yellow Mural free');
  });

  it('takes a stop’s tap while another kind is picked, and gives it up outside step 2', () => {
    const { flow, calls } = started();
    expect(flow.stopClicked({ id: 'stop-1', title: 'Yellow Mural', lat: 40.44, lon: -79.95 })).toBe(
      false,
    );
    flow.choose(kind('raid'));
    calls.length = 0;
    expect(flow.stopClicked({ id: 'stop-1', title: 'Yellow Mural', lat: 40.44, lon: -79.95 })).toBe(
      true,
    );
    expect(calls).toEqual([]);
    // A spawn's step 2 puts the pin at the stop (review B6), as before.
    flow.cancel();
    flow.choose(kind('spawn'));
    calls.length = 0;
    expect(flow.stopClicked({ id: 'stop-1', title: 'Yellow Mural', lat: 40.44, lon: -79.95 })).toBe(
      true,
    );
    expect(calls).toContain('pin 40.44');
  });

  it('opens a train with its region prefilled and a meetup with its picking, no step 2', () => {
    const { flow, hold, calls } = started();
    flow.choose(kind('train'));
    flow.choose(kind('meetup'));
    expect(calls).toEqual(['train 7', 'meetup']);
    expect(hold.editing).toBe(false);
  });
});
