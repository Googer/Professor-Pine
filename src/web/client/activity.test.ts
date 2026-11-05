import { describe, expect, it } from 'vitest';
import type { ActivityPlaceView, ActivityView } from '../../domain/web/activity-data.js';
import {
  ACTIVITY_MODE_CHOICES,
  activityAddress,
  ActivityCounts,
  AFTER_THE_HOUR_MS,
  CANVAS_TOLERANCE,
  historyStep,
  hourWait,
  leftOutWords,
  MonthPlayer,
  nextAskWait,
  placeWords,
  PLAY_STEP_MS,
  RETRY_AFTER_FAILURE_MS,
  sliderSteps,
  stepWords,
  tappablePlaces,
  tapRadius,
  todayStep,
  type PlayerTimer,
} from './activity.js';
import { CLUSTER_BELOW } from './cluster.js';

const place = (parties: number): ActivityPlaceView => ({
  kind: 'gym',
  id: '1',
  lat: 40,
  lon: -80,
  weight: 1,
  parties,
});

const view = (overrides: Partial<ActivityView> = {}): ActivityView => ({
  mode: 'now',
  weekday: 4,
  places: [],
  leftOut: 0,
  months: { first: '2018-11', last: '2019-02' },
  changesInMs: null,
  ...overrides,
});

/** Timers the test runs by hand, in the order they were set. */
class HandTimer implements PlayerTimer {
  readonly waiting = new Map<number, { run: () => void; ms: number }>();
  private next = 0;
  set(run: () => void, ms: number): number {
    this.next += 1;
    this.waiting.set(this.next, { run, ms });
    return this.next;
  }
  clear(handle: number): void {
    this.waiting.delete(handle);
  }
  /** Runs the timers waiting now, once each. */
  pass(): void {
    const due = [...this.waiting];
    this.waiting.clear();
    for (const [, timer] of due) timer.run();
  }
}

describe('the activity layer’s panel (plan 8H-4)', () => {
  it('offers Expected now first, the presets, then History', () => {
    expect(ACTIVITY_MODE_CHOICES).toEqual([
      { value: 'now', label: 'Expected now' },
      { value: 'evenings', label: 'Weekday evenings' },
      { value: 'weekend', label: 'Weekend afternoons' },
      { value: 'history', label: 'History' },
    ]);
  });

  it('asks the server for the mode, and History for its month or its year', () => {
    expect(activityAddress('123', { mode: 'now' })).toBe('/s/123/api/activity?mode=now');
    expect(activityAddress('123', { mode: 'weekend' })).toBe('/s/123/api/activity?mode=weekend');
    expect(activityAddress('123', { mode: 'history', step: '2019-06' })).toBe(
      '/s/123/api/activity?mode=history&month=2019-06',
    );
    expect(activityAddress('123', { mode: 'history', step: '2019' })).toBe(
      '/s/123/api/activity?mode=history&year=2019',
    );
  });

  it('steps History’s slider from the first month to the last, or by year', () => {
    const months = { first: '2018-11', last: '2019-02' };
    expect(sliderSteps(months, 'month')).toEqual(['2018-11', '2018-12', '2019-01', '2019-02']);
    expect(sliderSteps(months, 'year')).toEqual(['2018', '2019']);
    expect(sliderSteps({ first: '2019-06', last: '2019-06' }, 'month')).toEqual(['2019-06']);
    expect(sliderSteps(null, 'month')).toEqual([]);
  });

  it('names a step of the slider in words', () => {
    expect(stepWords('2019-06')).toBe('June 2019');
    expect(stepWords('2018-12')).toBe('December 2018');
    expect(stepWords('2019')).toBe('2019');
  });

  it('says a place’s parties for its mode in its popup', () => {
    expect(placeWords(view(), place(12))).toBe(
      '12 parties at this time of day on Thursdays, over the years',
    );
    expect(placeWords(view({ weekday: 7 }), place(3))).toBe(
      '3 parties at this time of day on Sundays, over the years',
    );
    expect(placeWords(view({ mode: 'evenings', weekday: null }), place(5))).toBe(
      '5 parties on weekday evenings, over the years',
    );
    expect(placeWords(view({ mode: 'weekend', weekday: null }), place(5))).toBe(
      '5 parties on weekend afternoons, over the years',
    );
    expect(placeWords(view({ mode: 'history', weekday: null }), place(4), '2019-06')).toBe(
      '4 parties in June 2019',
    );
    expect(placeWords(view({ mode: 'history', weekday: null }), place(1), '2019')).toBe(
      '1 party in 2019',
    );
  });

  it('says how many it left out, and nothing when it left none out', () => {
    expect(leftOutWords(0)).toBeUndefined();
    expect(leftOutWords(1)).toBe('1 party left out (gyms no longer listed, pins)');
    expect(leftOutWords(1204)).toBe('1,204 parties left out (gyms no longer listed, pins)');
  });

  it('gives a busier place a larger target to tap, the quietest still 32 pixels (plan 8H-4H)', () => {
    expect(tapRadius(0)).toBeLessThan(tapRadius(0.5));
    expect(tapRadius(0.5)).toBeLessThan(tapRadius(1));
    expect(tapRadius(2)).toBe(tapRadius(1));
    // With the canvas's tolerance (review P6).
    expect(2 * (tapRadius(0) + CANVAS_TOLERANCE)).toBeGreaterThanOrEqual(32);
  });

  it('asks Expected now again a moment after the server’s next hour, by the server’s count', () => {
    expect(hourWait(view({ changesInMs: 20 * 60_000 }))).toBe(20 * 60_000 + AFTER_THE_HOUR_MS);
    // However late the answer was drawn, and whatever the page's clock says.
    expect(hourWait(view({ changesInMs: 0 }))).toBe(AFTER_THE_HOUR_MS);
    expect(hourWait(view({ mode: 'evenings', weekday: null }))).toBeUndefined();
  });

  it('asks Expected now again a minute after a failed answer, the hour after a good one (8H4-2)', () => {
    expect(nextAskWait('now', undefined)).toBe(RETRY_AFTER_FAILURE_MS);
    expect(RETRY_AFTER_FAILURE_MS).toBe(60_000);
    expect(nextAskWait('now', view({ changesInMs: 20 * 60_000 }))).toBe(
      20 * 60_000 + AFTER_THE_HOUR_MS,
    );
    // Out of Expected now nothing is asked again, failed or not.
    expect(nextAskWait('history', undefined)).toBeUndefined();
    expect(nextAskWait('evenings', undefined)).toBeUndefined();
    expect(nextAskWait('weekend', view({ mode: 'weekend', weekday: null }))).toBeUndefined();
  });

  it('opens History on this month where the server has it, else on its last (review P8)', () => {
    const months = { first: '2018-11', last: '2019-02' };
    expect(historyStep(months, 'month', '2019-01')).toBe('2019-01');
    expect(historyStep(months, 'month', '2026-11')).toBe('2019-02');
    expect(historyStep(months, 'year', '2018-12')).toBe('2018');
    expect(historyStep(null, 'month', '2026-11')).toBeUndefined();
    // Before any month is known it asks for this one: its answer brings the months.
    expect(todayStep(new Date(2026, 10, 5, 12).getTime(), 'month')).toBe('2026-11');
    expect(todayStep(new Date(2026, 0, 5, 12).getTime(), 'year')).toBe('2026');
  });
});

/** A step's answer the test gives when it says: drawn, or failed. */
function answers() {
  const asked: Array<{ at: string; answer: (drawn: boolean) => void }> = [];
  return {
    asked,
    step: (at: string) =>
      new Promise<boolean>((resolve) => {
        asked.push({ at, answer: resolve });
      }),
  };
}

describe('History’s Play', () => {
  const steps = ['2018-11', '2018-12', '2019-01', '2019-02'];

  it('asks the next step a second after the last one’s answer was drawn, and stops at the end', async () => {
    const timer = new HandTimer();
    const made = answers();
    let ended = 0;
    const player = new MonthPlayer(timer);
    player.play(steps, '2018-12', { step: made.step, ended: () => (ended += 1) });
    expect(player.playing()).toBe(true);
    expect([...timer.waiting.values()].map((one) => one.ms)).toEqual([PLAY_STEP_MS]);
    timer.pass();
    expect(made.asked.map((one) => one.at)).toEqual(['2019-01']);
    // A slow answer: nothing more is asked meanwhile, however long it takes.
    expect(timer.waiting.size).toBe(0);
    made.asked[0]?.answer(true);
    await player.idle();
    expect([...timer.waiting.values()].map((one) => one.ms)).toEqual([PLAY_STEP_MS]);
    timer.pass();
    made.asked[1]?.answer(true);
    await player.idle();
    expect(made.asked.map((one) => one.at)).toEqual(['2019-01', '2019-02']);
    expect(player.playing()).toBe(false);
    expect(ended).toBe(1);
    expect(timer.waiting.size).toBe(0);
  });

  it('stops when a step’s answer failed', async () => {
    const timer = new HandTimer();
    const made = answers();
    let ended = 0;
    const player = new MonthPlayer(timer);
    player.play(steps, '2018-11', { step: made.step, ended: () => (ended += 1) });
    timer.pass();
    made.asked[0]?.answer(false);
    await player.idle();
    expect(player.playing()).toBe(false);
    expect(ended).toBe(1);
    expect(timer.waiting.size).toBe(0);
  });

  it('starts from the first month when the last is shown', async () => {
    const timer = new HandTimer();
    const made = answers();
    const player = new MonthPlayer(timer);
    player.play(steps, '2019-02', { step: made.step, ended: () => undefined });
    expect(made.asked.map((one) => one.at)).toEqual(['2018-11']);
    made.asked[0]?.answer(true);
    await player.idle();
    timer.pass();
    expect(made.asked.map((one) => one.at)).toEqual(['2018-11', '2018-12']);
  });

  it('stops on any other press, an answer on its way then asking nothing, and says it ended once', async () => {
    const timer = new HandTimer();
    const made = answers();
    let ended = 0;
    const player = new MonthPlayer(timer);
    player.play(steps, '2018-11', { step: made.step, ended: () => (ended += 1) });
    timer.pass();
    player.stop();
    player.stop();
    made.asked[0]?.answer(true);
    await player.idle();
    expect(player.playing()).toBe(false);
    expect(timer.waiting.size).toBe(0);
    expect(made.asked).toHaveLength(1);
    expect(ended).toBe(1);
  });
});

describe("the activity's counts in the map's popups and clusters (plan 8H-4H)", () => {
  const at = (kind: 'gym' | 'spot', id: string, parties: number): ActivityPlaceView => ({
    kind,
    id,
    lat: 40,
    lon: -80,
    weight: 0.5,
    parties,
  });
  const counts = new ActivityCounts(
    view({ places: [at('gym', '7', 12), at('spot', 'abc.16', 4), at('gym', '9', 130)] }),
  );

  it("gives a gym's or a Power Spot's line in the words of the layer's own popup", () => {
    expect(counts.line('gym', '7')).toBe(
      'Activity: 12 parties at this time of day on Thursdays, over the years',
    );
    expect(counts.line('spot', 'abc.16')).toBe(
      'Activity: 4 parties at this time of day on Thursdays, over the years',
    );
    const history = new ActivityCounts(
      view({ mode: 'history', weekday: null, places: [at('gym', '7', 4)] }),
      '2019-06',
    );
    expect(history.line('gym', '7')).toBe('Activity: 4 parties in June 2019');
  });

  it('leaves the places tappable only at street zoom, and only where their own layer is off', () => {
    const places = [at('gym', '7', 12), at('spot', 'abc.16', 4)];
    const ids = (shown: ActivityPlaceView[]) => shown.map((place) => place.id);
    // At the zoom the gyms are drawn one by one (`CLUSTER_BELOW`) and closer.
    expect(ids(tappablePlaces(places, CLUSTER_BELOW, { gyms: false, spots: false }))).toEqual([
      '7',
      'abc.16',
    ]);
    expect(ids(tappablePlaces(places, 18, { gyms: true, spots: false }))).toEqual(['abc.16']);
    expect(ids(tappablePlaces(places, 18, { gyms: false, spots: true }))).toEqual(['7']);
    expect(tappablePlaces(places, 18, { gyms: true, spots: true })).toEqual([]);
    // Zoomed out nothing is tappable, whatever the layers.
    expect(tappablePlaces(places, CLUSTER_BELOW - 1, { gyms: false, spots: false })).toEqual([]);
  });

  // Review P4: a place or a point picked (the Report button's step 2, route mode) takes the taps.
  it('leaves nothing tappable while a place or a point is being picked', () => {
    const places = [at('gym', '7', 12), at('spot', 'abc.16', 4)];
    expect(tappablePlaces(places, 18, { gyms: false, spots: false, picking: true })).toEqual([]);
  });

  // Review P3: hundreds of circles at street zoom are kept to the view and its margin.
  it('leaves tappable only the places in the box given', () => {
    const near = { ...at('gym', '7', 12), lat: 40.44, lon: -79.95 };
    const far = { ...at('gym', '8', 12), lat: 40.6, lon: -79.95 };
    const box = { south: 40.4, west: -80, north: 40.5, east: -79.9 };
    expect(
      tappablePlaces([near, far], 18, { gyms: false, spots: false }, box).map(({ id }) => id),
    ).toEqual(['7']);
  });

  it('gives no line for a place the glow does not draw, nor for one of the other kind', () => {
    expect(counts.line('gym', '8')).toBeUndefined();
    expect(counts.line('spot', '7')).toBeUndefined();
    expect(counts.line('gym', 'abc.16')).toBeUndefined();
  });

  it("sums a cluster's gyms that the glow draws, and says nothing for a quiet cluster", () => {
    expect(counts.area(['7', '9', '8'])?.shown).toBe('≈ 142 parties in this area');
    expect(counts.area(['7'])?.shown).toBe('≈ 12 parties in this area');
    expect(counts.area(['8', '10'])).toBeUndefined();
    expect(counts.area([])).toBeUndefined();
    expect(new ActivityCounts(view({ places: [at('gym', '1', 1_204)] })).area(['1'])?.shown).toBe(
      '≈ 1,204 parties in this area',
    );
  });

  // Review 8H4H-7: a screen reader hears words, not the symbols.
  it("says a cluster's sum in words for a screen reader, its symbol only where it is seen", () => {
    expect(counts.area(['7', '9', '8'])).toEqual({
      shown: '≈ 142 parties in this area',
      spoken: 'about 142 parties in this area',
    });
  });
});
