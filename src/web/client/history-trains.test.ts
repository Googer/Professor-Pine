import { describe, expect, it } from 'vitest';
import type {
  TrainItemView,
  TrainMonthView,
  TrainRouteView,
} from '../../domain/web/train-history-data.js';
import {
  HistoryTrains,
  stillFitPadding,
  stillLegs,
  trainRouteAddress,
  trainsAddress,
} from './history-trains.js';
import { RequestError } from './request-error.js';

const GUILD = '412345678901234567';

const item = (id: number): TrainItemView => ({
  id,
  name: `Train ${String(id)}`,
  when: 'Sun, Jun 14, 6:00 PM',
  about: 'About 2 stops · 3 riders',
});

const month = (ids: number[], more = 0, older = false): TrainMonthView => ({
  month: '2019-06',
  trains: ids.map(item),
  more,
  older,
});

const route = (id: number, overrides: Partial<TrainRouteView> = {}): TrainRouteView => ({
  ...item(id),
  month: '2019-06',
  points: [
    { lat: 40.05, lon: -80.05 },
    { lat: 40.05, lon: -79.99 },
  ],
  route: [0, 1, 0],
  card: [
    { text: 'How the train went', small: false },
    { text: 'About 3 stops in 40 min', small: false },
    { text: 'Approximate: …', small: true },
  ],
  ...overrides,
});

/**
 * The trains' part over a server whose answers the test gives: each question waits in `asked`
 * until it is answered or failed. `lines` are the routes drawn, undefined when the line went.
 */
function trains() {
  const asked: Array<{ url: string; answer: (body: unknown) => void; fail: (err: Error) => void }> =
    [];
  const lines: Array<TrainRouteView | undefined> = [];
  let changes = 0;
  const part = new HistoryTrains(GUILD, {
    get: <T>(url: string) =>
      new Promise<T>((resolve, reject) => {
        asked.push({ url, answer: (body) => resolve(body as T), fail: reject });
      }),
    changed: () => {
      changes += 1;
    },
    line: (shown) => {
      lines.push(shown);
    },
  });
  return { part, asked, lines, changes: () => changes };
}

describe('the trains of History’s month on the map (plan 8H-7B)', () => {
  it('asks for a month’s trains and says how many, the list closed until opened', async () => {
    const { part, asked } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    expect(asked.map((one) => one.url)).toEqual([trainsAddress(GUILD, '2019-06')]);
    expect(part.panel()).toMatchObject({ hidden: false, heading: 'Trains in June 2019' });
    asked[0]?.answer(month([3, 2, 1], 9));
    await part.idle();
    expect(part.panel()).toMatchObject({
      hidden: false,
      heading: 'Trains in June 2019 (12)',
      items: [3, 2, 1].map((id) => ({ ...item(id), chosen: false })),
      more: 'and 9 more',
    });
    // The same month again asks nothing.
    part.show({ kind: 'month', month: '2019-06' });
    expect(asked).toHaveLength(1);
  });

  it('says that there may be more where the server stopped at a full list (plan 8Z-2)', async () => {
    const { part, asked } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    // The older trains of the month were not looked at: no count of them, only that they may be.
    asked[0]?.answer(month([3, 2, 1], 0, true));
    await part.idle();
    expect(part.panel()).toMatchObject({
      heading: 'Trains in June 2019 (3+)',
      more: 'There may be more, earlier in the month.',
    });
    // Without them, a list that leaves none out says nothing under it.
    part.show({ kind: 'month', month: '2019-07' });
    asked[1]?.answer(month([3, 2, 1]));
    await part.idle();
    expect(part.panel().heading).toBe('Trains in July 2019 (3)');
    expect(part.panel().more).toBeUndefined();
  });

  it('says when a month has none, and when the list could not be loaded', async () => {
    const { part, asked } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    asked[0]?.answer(month([]));
    await part.idle();
    expect(part.panel()).toMatchObject({ note: 'No trains to show in June 2019.', items: [] });
    expect(part.panel().heading).toBeUndefined();
    part.show({ kind: 'month', month: '2019-07' });
    asked[1]?.fail(new Error('away'));
    await part.idle();
    expect(part.panel().note).toBe('The trains could not be loaded. Try again in a moment.');
  });

  it('says to pick a month by year, and hides during Play (G8)', () => {
    const { part, asked } = trains();
    part.show({ kind: 'pick' });
    expect(part.panel()).toMatchObject({ hidden: false, note: 'Pick a month to see its trains.' });
    part.show({ kind: 'hidden' });
    expect(part.panel().hidden).toBe(true);
    expect(asked).toEqual([]);
  });

  it('draws a train chosen with its card, and clears it when chosen again', async () => {
    const { part, asked, lines } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    asked[0]?.answer(month([3, 2]));
    await part.idle();
    const chosen = part.choose(2);
    expect(asked[1]?.url).toBe(trainRouteAddress(GUILD, 2));
    asked[1]?.answer(route(2));
    await chosen;
    expect(lines).toEqual([route(2)]);
    expect(part.panel()).toMatchObject({
      items: [
        { id: 3, chosen: false },
        { id: 2, chosen: true },
      ],
      card: { id: 2, lines: route(2).card, unplaced: false },
    });
    await part.choose(2);
    expect(lines).toEqual([route(2), undefined]);
    expect(part.panel().card).toBeUndefined();
    expect(asked).toHaveLength(2);
  });

  it('draws only the train chosen last, another clearing the one before', async () => {
    const { part, asked, lines } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    asked[0]?.answer(month([3, 2]));
    await part.idle();
    const first = part.choose(3);
    const second = part.choose(2);
    asked[2]?.answer(route(2));
    asked[1]?.answer(route(3));
    await Promise.all([first, second]);
    expect(lines.at(-1)).toEqual(route(2));
    expect(lines).not.toContainEqual(route(3));
    expect(part.panel().card?.id).toBe(2);
  });

  it('says a train it cannot place on the map, and one it may not show', async () => {
    const { part, asked } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    asked[0]?.answer(month([3, 2]));
    await part.idle();
    const unplaced = part.choose(3);
    asked[1]?.answer(route(3, { points: [], route: [] }));
    await unplaced;
    expect(part.panel().card).toMatchObject({ id: 3, unplaced: true });
    const refused = part.choose(2);
    asked[2]?.fail(new RequestError(404, 'Not found.'));
    await refused;
    expect(part.panel().card).toBeUndefined();
    expect(part.panel().note).toBe('This train cannot be shown.');
  });

  it('clears the train chosen at a month’s change, Play and the layer turned off (G8)', async () => {
    const { part, asked, lines } = trains();
    for (const leaving of [
      { kind: 'month', month: '2019-07' },
      { kind: 'hidden' },
      { kind: 'pick' },
    ] as const) {
      part.show({ kind: 'month', month: '2019-06' });
      asked.at(-1)?.answer(month([2]));
      await part.idle();
      const chosen = part.choose(2);
      asked.at(-1)?.answer(route(2));
      await chosen;
      part.show(leaving);
      expect(lines.at(-1), leaving.kind).toBeUndefined();
      expect(part.panel().card, leaving.kind).toBeUndefined();
      // Back to June asks for its trains anew.
      part.show({ kind: 'hidden' });
    }
  });

  it('opens a train by the map’s address: its month, and kept chosen when its month is shown', async () => {
    const { part, asked, lines } = trains();
    const opened = part.open(2);
    expect(asked[0]?.url).toBe(trainRouteAddress(GUILD, 2));
    asked[0]?.answer(route(2));
    expect(await opened).toEqual({ month: '2019-06' });
    expect(lines).toEqual([route(2)]);
    part.show({ kind: 'month', month: '2019-06' });
    asked[1]?.answer(month([3, 2]));
    await part.idle();
    expect(part.panel()).toMatchObject({ card: { id: 2 } });
    expect(lines).toEqual([route(2)]);
  });

  it('says once that a train of the address cannot be shown', async () => {
    const { part, asked } = trains();
    const opened = part.open(2);
    asked[0]?.fail(new RequestError(404, 'Not found.'));
    expect(await opened).toBe('refused');
    part.show({ kind: 'month', month: '2019-06' });
    expect(part.panel().note).toBe('This train cannot be shown.');
    asked[1]?.answer(month([3]));
    await part.idle();
    part.show({ kind: 'month', month: '2019-07' });
    expect(part.panel().note).toBeUndefined();
  });

  it('tells a train of the address that another took the place of (B6)', async () => {
    const { part, asked, lines } = trains();
    const opened = part.open(2);
    const chosen = part.choose(3);
    asked[0]?.answer(route(2));
    asked[1]?.answer(route(3));
    expect(await opened).toBe('superseded');
    await chosen;
    expect(lines).toEqual([route(3)]);
  });

  it('keeps the address’s train on its way through History shown meanwhile (R1)', async () => {
    const { part, asked, lines } = trains();
    const opened = part.open(2);
    // The heat's answer of Expected now, then of a month, came first.
    part.show({ kind: 'hidden' });
    part.show({ kind: 'month', month: '2019-07' });
    asked[0]?.answer(route(2));
    expect(await opened).toEqual({ month: '2019-06' });
    expect(lines).toEqual([route(2)]);
  });

  it('lets a change of History take the place of the address’s train on its way (R1)', async () => {
    const { part, asked, lines } = trains();
    const opened = part.open(2);
    part.drop();
    asked[0]?.answer(route(2));
    expect(await opened).toBe('superseded');
    expect(lines).toEqual([]);
  });

  it('marks the list stale from a change of History until the next month is shown (R5)', async () => {
    const { part, asked } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    asked[0]?.answer(month([2]));
    await part.idle();
    expect(part.panel().stale).toBe(false);
    part.drop();
    expect(part.panel()).toMatchObject({ stale: true, items: [{ id: 2 }] });
    part.show({ kind: 'month', month: '2019-07' });
    expect(part.panel().stale).toBe(false);
  });

  it('makes the list pressable again when History comes back to its month (W1)', async () => {
    const { part, asked, changes } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    asked[0]?.answer(month([2]));
    await part.idle();
    // The slider moved on and back before the other month was shown.
    part.drop();
    const before = changes();
    part.show({ kind: 'month', month: '2019-06' });
    expect(part.panel()).toMatchObject({ stale: false, items: [{ id: 2 }] });
    expect(changes()).toBe(before + 1);
    expect(asked).toHaveLength(1);
    // Shown again while not stale, nothing to draw.
    part.show({ kind: 'month', month: '2019-06' });
    expect(changes()).toBe(before + 1);
  });

  it('draws no train whose answer comes after the month changed, Play or the layer off (B1)', async () => {
    for (const leaving of [
      { kind: 'month', month: '2019-07' },
      { kind: 'hidden' },
      { kind: 'pick' },
    ] as const) {
      const { part, asked, lines } = trains();
      part.show({ kind: 'month', month: '2019-06' });
      asked[0]?.answer(month([2]));
      await part.idle();
      const chosen = part.choose(2);
      part.show(leaving);
      asked[1]?.answer(route(2));
      await chosen;
      expect(lines, leaving.kind).toEqual([]);
      expect(part.panel().card, leaving.kind).toBeUndefined();
    }
  });

  it('asks a month whose trains failed again when it is shown again (B4)', async () => {
    const { part, asked } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    asked[0]?.fail(new Error('away'));
    await part.idle();
    part.show({ kind: 'month', month: '2019-06' });
    expect(asked).toHaveLength(2);
    asked[1]?.answer(month([3]));
    await part.idle();
    expect(part.panel().heading).toBe('Trains in June 2019 (1)');
  });

  it('keeps the last month’s trains: back to it after Play asks nothing (B5)', async () => {
    const { part, asked } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    asked[0]?.answer(month([3, 2]));
    await part.idle();
    part.show({ kind: 'hidden' });
    part.show({ kind: 'month', month: '2019-06' });
    expect(asked).toHaveLength(1);
    expect(part.panel().heading).toBe('Trains in June 2019 (2)');
  });

  it('drops the train chosen when History is changed, before the month’s answer (B10)', async () => {
    const { part, asked, lines } = trains();
    part.show({ kind: 'month', month: '2019-06' });
    asked[0]?.answer(month([2]));
    await part.idle();
    const chosen = part.choose(2);
    asked[1]?.answer(route(2));
    await chosen;
    part.drop();
    expect(lines).toEqual([route(2), undefined]);
    expect(part.panel().card).toBeUndefined();
    // The list stays until the next month is shown.
    expect(part.panel().items).toHaveLength(1);
  });
});

describe('stillLegs: an ended train’s line as a live train’s done legs (G9)', () => {
  it('goes through its stops in order, every leg done, no loop closed', () => {
    const legs = stillLegs(route(1));
    expect(legs).toEqual([
      {
        from: { lat: 40.05, lon: -80.05 },
        to: { lat: 40.05, lon: -79.99 },
        done: true,
        closing: false,
      },
      {
        from: { lat: 40.05, lon: -79.99 },
        to: { lat: 40.05, lon: -80.05 },
        done: true,
        closing: false,
      },
    ]);
    expect(stillLegs(route(1, { route: [0] }))).toEqual([]);
  });
});

describe('stillFitPadding: the line fitted to the part of the map the panel leaves free', () => {
  it('pads the right by the panel when it sits beside the map, as on a computer', () => {
    expect(stillFitPadding({ width: 300, height: 400 }, { x: 1000, y: 800 })).toEqual({
      topLeft: [24, 24],
      bottomRight: [324, 24],
    });
  });

  it('pads the top by the panel when it spans most of the map, as on a phone', () => {
    expect(stillFitPadding({ width: 300, height: 250 }, { x: 375, y: 700 })).toEqual({
      topLeft: [24, 274],
      bottomRight: [24, 24],
    });
  });

  it('never gives the panel more than half the map either way', () => {
    expect(stillFitPadding({ width: 700, height: 300 }, { x: 1000, y: 800 })).toEqual({
      topLeft: [24, 24],
      bottomRight: [524, 24],
    });
    expect(stillFitPadding({ width: 340, height: 600 }, { x: 375, y: 700 })).toEqual({
      topLeft: [24, 374],
      bottomRight: [24, 24],
    });
  });

  it('pads by the margin alone while the panel takes no room', () => {
    expect(stillFitPadding({ width: 0, height: 0 }, { x: 375, y: 700 })).toEqual({
      topLeft: [24, 24],
      bottomRight: [24, 24],
    });
  });
});
