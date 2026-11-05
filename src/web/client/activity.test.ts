import { describe, expect, it } from 'vitest';
import type { ActivityPlaceView, ActivityView } from '../../domain/web/activity-data.js';
import {
  ACTIVITY_MODE_CHOICES,
  activityAddress,
  AFTER_THE_HOUR_MS,
  CANVAS_TOLERANCE,
  circleLook,
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
  todayStep,
  type PlayerTimer,
} from './activity.js';

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

  it('draws a busier place larger and less see-through', () => {
    const quiet = circleLook(0);
    const busy = circleLook(1);
    const middle = circleLook(0.5);
    expect(quiet.radius).toBeLessThan(middle.radius);
    expect(middle.radius).toBeLessThan(busy.radius);
    expect(quiet.fillOpacity).toBeLessThan(middle.fillOpacity);
    expect(middle.fillOpacity).toBeLessThan(busy.fillOpacity);
    expect(busy.fillOpacity).toBeLessThanOrEqual(0.7);
    // Still a tap target of 32 pixels at its quietest, with the canvas's tolerance (review P6).
    expect(2 * (quiet.radius + CANVAS_TOLERANCE)).toBeGreaterThanOrEqual(32);
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
