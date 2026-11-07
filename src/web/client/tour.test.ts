import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from './staged-storage.js';
import {
  cardPlace,
  EDITOR_TOUR_KEY,
  EDITOR_TOUR_STEPS,
  editorTourOpens,
  dimmedAround,
  holeOnScreen,
  keepTourSeen,
  nextStop,
  readTourSeen,
  shownTarget,
  TOUR_KEY,
  tourAudience,
  tourDue,
  tourOpensByItself,
  TourRun,
  settledWithin,
  TOUR_WAITS_FOR_REGIONS_MS,
  tourSteps,
  type Rect,
  type TourFacts,
  type TourStep,
} from './tour.js';

const SCREEN = { width: 1000, height: 800 };
const MEMBER: TourFacts = { audience: 'member', finds: true, more: 'lacking', regions: false };
const VISITOR: TourFacts = { audience: 'visitor', finds: false, more: 'discord', regions: false };

/** A storage of the test's: what it holds, one that throws, or one that drops what it is given. */
function storage(held: Record<string, string> = {}, how?: 'throws' | 'drops'): KeyValueStorage {
  const check = () => {
    if (how === 'throws') throw new Error('storage forbidden');
  };
  return {
    getItem: (key) => {
      check();
      return held[key] ?? null;
    },
    setItem: (key, value) => {
      check();
      if (how !== 'drops') held[key] = value;
    },
    removeItem: (key) => {
      check();
      delete held[key];
    },
  };
}

const rect = (left: number, top: number, width = 10, height = 10): Rect => ({
  left,
  top,
  width,
  height,
});

const ids = (steps: readonly TourStep[]) => steps.map((step) => step.id);

describe('the steps', () => {
  it('walks a member through layers, reading the map, browsing, Find and Report', () => {
    expect(ids(tourSteps(MEMBER))).toEqual([
      'welcome',
      'layers',
      'read',
      'browse',
      'find',
      'report',
      'again',
    ]);
  });

  it('walks a visitor through what the public map has, and how to get more', () => {
    expect(ids(tourSteps(VISITOR))).toEqual(['welcome', 'layers', 'find', 'more', 'again']);
    const words = (more: TourFacts['more']) =>
      tourSteps({ ...VISITOR, more }).find((step) => step.id === 'more')?.targets;
    expect(words('discord')?.[0]?.selectors).toEqual(['#account a.login']);
    // A server of links alone has no button: the header's line says how.
    expect(words('links')?.[0]?.selectors).toEqual(['#account .line']);
    expect(words('lacking')?.[0]?.selectors).toEqual(['#account .line']);
  });

  it('shows a member "Your regions…" where the server offers a role that opens a region (plan 8M-20)', () => {
    const steps = tourSteps({ ...MEMBER, regions: true });
    expect(ids(steps)).toEqual([
      'welcome',
      'layers',
      'read',
      'browse',
      'find',
      'report',
      'regions',
      'again',
    ]);
    const step = steps.find((one) => one.id === 'regions');
    expect(step?.heading).toBe('Choosing Your Regions');
    expect(step?.targets[0]?.selectors).toEqual(['#account .account-menu']);
    expect(step?.targets[0]?.words.join(' ')).toContain('Your regions…');
    expect(step?.targets[0]?.words.join(' ')).toContain('Join or leave a region right here!');
    // Not to a visitor, whatever the server offers.
    expect(ids(tourSteps({ ...VISITOR, regions: true }))).not.toContain('regions');
  });

  it('has the step where the view of the regions comes after the list, within its wait (B1)', async () => {
    const timers: Array<{ ms: number; run: () => void }> = [];
    const setTimer = (run: () => void, ms: number) => {
      timers.push({ ms, run });
    };
    let regions = false;
    let came = (): void => undefined;
    const view = new Promise<void>((resolve) => {
      came = () => {
        regions = true;
        resolve();
      };
    });
    const waited = settledWithin(view, TOUR_WAITS_FOR_REGIONS_MS, setTimer);
    came();
    await waited;
    expect(ids(tourSteps({ ...MEMBER, regions }))).toContain('regions');
    // A view that never comes holds the tour back no longer than the wait.
    const never = settledWithin(new Promise(() => undefined), TOUR_WAITS_FOR_REGIONS_MS, setTimer);
    expect(timers.map((one) => one.ms)).toEqual([3000, 3000]);
    timers[1]?.run();
    await never;
    // A view that failed holds it back no longer either.
    await settledWithin(Promise.reject(new Error('offline')), 3000, setTimer);
  });

  it('lets presses through on the layers step alone', () => {
    for (const facts of [MEMBER, VISITOR]) {
      expect(ids(tourSteps(facts).filter((step) => step.pressable === true))).toEqual(['layers']);
    }
  });

  it('says what the box does as it is: Find, or "Find a gym"', () => {
    const said = (finds: boolean) =>
      tourSteps({ ...MEMBER, finds })
        .find((step) => step.id === 'find')
        ?.targets[0]?.words.join(' ');
    expect(said(true)).toContain('reports');
    expect(said(false)).toContain('a gym on the map');
  });

  it('says what a raid train and a meetup are for, and explains nothing else of the game', () => {
    const words = tourSteps(MEMBER)
      .find((step) => step.id === 'read')
      ?.words?.join(' ');
    expect(words).toContain('raid train: a group');
    expect(words).toContain('meetup: trades, lure parties');
    expect(words).not.toContain('field research');
    expect(words).not.toContain('max battle');
  });

  it('keeps every step short', () => {
    for (const facts of [{ ...MEMBER, regions: true }, VISITOR]) {
      for (const step of tourSteps(facts)) {
        for (const words of [step.words ?? [], ...step.targets.map((one) => one.words)]) {
          // Reading the map says the most: it is the one thing the page cannot show by itself.
          expect(words.join(' ').length).toBeLessThanOrEqual(step.id === 'read' ? 320 : 240);
        }
      }
    }
  });
});

describe('who it is for', () => {
  it("gives a member's tour to a member and to one logged in while Discord is away", () => {
    expect(tourAudience({ loggedIn: true, member: true, readOnly: false })).toBe('member');
    expect(tourAudience({ loggedIn: true, member: false, readOnly: true })).toBe('member');
    expect(tourAudience({ loggedIn: true, member: false, readOnly: false })).toBe('visitor');
    expect(tourAudience({ loggedIn: false })).toBe('visitor');
  });
});

describe('what the browser keeps', () => {
  it('reads who the tour was shown as under pine-map-tour, and nothing else', () => {
    expect(TOUR_KEY).toBe('pine-map-tour');
    expect(readTourSeen(storage({ 'pine-map-tour': 'member' }))).toBe('member');
    expect(readTourSeen(storage({ 'pine-map-tour': 'visitor' }))).toBe('visitor');
    expect(readTourSeen(storage({ 'pine-map-tour': 'purple' }))).toBeUndefined();
    expect(readTourSeen(storage({ 'pine-map-tour': 'member' }, 'throws'))).toBeUndefined();
    expect(readTourSeen(undefined)).toBeUndefined();
  });

  it("only moves up: a visitor's tour never forgets a member's", () => {
    const held: Record<string, string> = {};
    expect(keepTourSeen(storage(held), 'visitor')).toBe(true);
    expect(held[TOUR_KEY]).toBe('visitor');
    expect(keepTourSeen(storage(held), 'member')).toBe(true);
    expect(keepTourSeen(storage(held), 'visitor')).toBe(true);
    expect(held[TOUR_KEY]).toBe('member');
  });

  it('says so when the browser cannot keep it', () => {
    expect(keepTourSeen(undefined, 'member')).toBe(false);
    expect(keepTourSeen(storage({}, 'throws'), 'member')).toBe(false);
    expect(keepTourSeen(storage({}, 'drops'), 'member')).toBe(false);
  });
});

describe("the region editor's tour", () => {
  it('walks through drawing, the panel, saving and the way back', () => {
    expect(ids(EDITOR_TOUR_STEPS)).toEqual(['draw', 'panel', 'save', 'back']);
  });

  it('opens once in a browser, under a key of its own', () => {
    const held: Record<string, string> = { [TOUR_KEY]: 'member' };
    expect(editorTourOpens(storage(held))).toBe(true);
    expect(held[EDITOR_TOUR_KEY]).toBe('seen');
    expect(held[TOUR_KEY]).toBe('member');
    expect(editorTourOpens(storage(held))).toBe(false);
  });

  it('does not open in a browser that cannot keep that it did', () => {
    expect(editorTourOpens(undefined)).toBe(false);
    expect(editorTourOpens(storage({}, 'throws'))).toBe(false);
    expect(editorTourOpens(storage({}, 'drops'))).toBe(false);
  });
});

describe('when it opens by itself', () => {
  const calm = { readOnly: false, editorAlone: true, quiet: true };

  it("is due once for a visitor, and once more for a member's tour", () => {
    expect(tourDue(undefined, 'visitor')).toBe(true);
    expect(tourDue('visitor', 'visitor')).toBe(false);
    expect(tourDue('member', 'visitor')).toBe(false);
    expect(tourDue(undefined, 'member')).toBe(true);
    expect(tourDue('visitor', 'member')).toBe(true);
    expect(tourDue('member', 'member')).toBe(false);
  });

  it('waits for a normal visit: not read-only, the editor left alone, the page quiet', () => {
    expect(tourOpensByItself(undefined, 'member', calm)).toBe(true);
    expect(tourOpensByItself(undefined, 'member', { ...calm, readOnly: true })).toBe(false);
    expect(tourOpensByItself(undefined, 'member', { ...calm, editorAlone: false })).toBe(false);
    expect(tourOpensByItself(undefined, 'member', { ...calm, quiet: false })).toBe(false);
    expect(tourOpensByItself('member', 'member', calm)).toBe(false);
  });
});

describe('what a step points at', () => {
  const step: TourStep = {
    id: 'x',
    heading: 'X',
    required: true,
    targets: [
      { selectors: ['.phone'], words: ['phone'] },
      { selectors: ['.row', '.more'], words: ['row'] },
    ],
  };

  it('takes the first target that shows, its elements together', () => {
    const shown = shownTarget(step, (selector) =>
      selector === '.row' ? [rect(10, 10)] : selector === '.more' ? [rect(30, 10, 20)] : [],
    );
    expect(shown?.target.words).toEqual(['row']);
    expect(shown?.hole).toEqual({ left: 10, top: 10, width: 40, height: 10 });
  });

  it('does not count an empty box: a hidden button leaves its box of no size', () => {
    const shown = shownTarget(step, (selector) =>
      selector === '.phone' ? [rect(900, 700, 0, 0)] : selector === '.row' ? [rect(1, 2)] : [],
    );
    expect(shown?.target.words).toEqual(['row']);
    expect(shownTarget(step, () => [rect(1, 1, 0, 0)])).toBeUndefined();
  });
});

describe('going through the steps', () => {
  const steps: TourStep[] = ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    heading: id,
    targets: [],
    required: true,
  }));

  it('moves on and back, and tells where it is', () => {
    const run = new TourRun(steps, () => true);
    expect(run.current()?.id).toBe('a');
    expect(run.position()).toEqual({ at: 1, of: 4, first: true, last: false });
    expect(run.next()).toBe(true);
    expect(run.current()?.id).toBe('b');
    run.back();
    run.back();
    expect(run.current()?.id).toBe('a');
    run.next();
    run.next();
    run.next();
    expect(run.position()).toEqual({ at: 4, of: 4, first: false, last: true });
    expect(run.next()).toBe(false);
  });

  it('passes over a step with nothing to point at, each way, and leaves it out of the count', () => {
    const run = new TourRun(steps, (step) => step.id !== 'b');
    expect(run.position().of).toBe(3);
    run.next();
    expect(run.current()?.id).toBe('c');
    expect(run.position().at).toBe(2);
    run.back();
    expect(run.current()?.id).toBe('a');
  });

  it('counts the step showing even when what it points at went away', () => {
    let gone = false;
    const run = new TourRun(steps, (step) => !(gone && step.id === 'b'));
    run.next();
    gone = true;
    expect(run.position()).toEqual({ at: 2, of: 4, first: false, last: false });
  });

  it('has no step where nothing can be shown', () => {
    expect(new TourRun(steps, () => false).current()).toBeUndefined();
  });
});

describe('Tab', () => {
  it('goes round the list both ways, and in from outside it', () => {
    const stops = ['a', 'b', 'c'];
    expect(nextStop(stops, 'a', false)).toBe('b');
    expect(nextStop(stops, 'c', false)).toBe('a');
    expect(nextStop(stops, 'a', true)).toBe('c');
    expect(nextStop(stops, 'outside', false)).toBe('a');
    expect(nextStop(stops, 'outside', true)).toBe('c');
    expect(nextStop([], 'outside', false)).toBeUndefined();
  });
});

describe('the dimming', () => {
  it('covers all of the screen without a hole', () => {
    expect(dimmedAround(undefined, SCREEN)).toEqual([rect(0, 0, 1000, 800)]);
  });

  it('covers all but the hole, with no overlap', () => {
    const hole = rect(100, 200, 50, 60);
    const blocks = dimmedAround(hole, SCREEN);
    const area = blocks.reduce((sum, block) => sum + block.width * block.height, 0);
    expect(area).toBe(1000 * 800 - 50 * 60);
    expect(blocks).toContainEqual(rect(0, 200, 100, 60));
    expect(blocks).toContainEqual(rect(150, 200, 850, 60));
  });

  it('keeps the hole, with its margin, on the screen', () => {
    expect(holeOnScreen(rect(100, 100, 10, 10), SCREEN)).toEqual(rect(96, 96, 18, 18));
    expect(holeOnScreen(rect(0, 0, 10, 10), SCREEN)).toEqual(rect(0, 0, 14, 14));
    expect(holeOnScreen(rect(990, 790, 10, 10), SCREEN)).toEqual(rect(986, 786, 14, 14));
  });
});

describe('where the card goes', () => {
  const card = { width: 320, height: 200 };
  const overlaps = (at: { left: number; top: number }, hole: Rect) =>
    at.left < hole.left + hole.width &&
    at.left + card.width > hole.left &&
    at.top < hole.top + hole.height &&
    at.top + card.height > hole.top;

  it('is in the middle without a hole', () => {
    expect(cardPlace(undefined, card, SCREEN)).toEqual({ left: 340, top: 300 });
  });

  it('goes beside the hole, never over it, wherever the hole is', () => {
    for (const hole of [
      rect(0, 0, 400, 40), // the header
      rect(900, 740, 50, 50), // a button over the map
      rect(700, 60, 300, 740), // the side pane
    ]) {
      expect(overlaps(cardPlace(hole, card, SCREEN), hole)).toBe(false);
    }
  });

  it('goes beside a button on a phone turned on its side, where above and below have no room', () => {
    const screen = { width: 667, height: 375 };
    const hole = rect(600, 150, 50, 50);
    const at = cardPlace(hole, { width: 320, height: 240 }, screen);
    expect(at.left + 320).toBeLessThanOrEqual(600);
  });

  it('stays on the screen where it fits on no side', () => {
    const at = cardPlace(rect(0, 0, 1000, 700), card, SCREEN);
    expect(at.left).toBeGreaterThanOrEqual(12);
    expect(at.top + card.height).toBeLessThanOrEqual(800 - 12);
  });
});
