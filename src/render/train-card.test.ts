import { describe, expect, it } from 'vitest';
import type { TrainCard } from '../domain/history/train-card.js';
import type { Fit } from './party-post.js';
import { raidTallyWords, trainCardText } from './train-card.js';

const MINUTE = 60_000;
const whole: Fit = { list: (items) => items.join(', '), part: (make) => make(Infinity) };
const channels = new Map([
  [1, '100000000000000001'],
  [2, '100000000000000002'],
]);
const channelOf = (regionId: number) => channels.get(regionId);

const card = (overrides: Partial<TrainCard> = {}): TrainCard => ({
  stops: { count: 14, durationMs: 100 * MINUTE },
  regionIds: [2, 1],
  riders: { members: 12, heads: 15 },
  peakRiders: 9,
  raids: [
    { tier: 'T5', shadow: false, count: 3 },
    { tier: 'D5', shadow: false, count: 2 },
  ],
  ...overrides,
});

describe('trainCardText: the card of an ended train in its post', () => {
  it('says the stops and time, the regions in order, the riders and the raids recorded', () => {
    expect(trainCardText(card(), channelOf, whole).split('\n')).toEqual([
      '**How the train went**',
      'About 14 stops in 1 h 40 min',
      'Through <#100000000000000002> · <#100000000000000001>',
      '12 riders, 15 with their +1s; at most 9 riders at once',
      'Recorded along the way: 3 Level 5 raids, 2 Dynamax 5★ max battles',
      '-# Approximate: a stop made in the game without moving the train in Pine is not counted.',
    ]);
  });

  it('says one of each in the singular, and riders without +1s once', () => {
    const text = trainCardText(
      card({
        stops: { count: 1, durationMs: 20 * MINUTE },
        regionIds: [1],
        riders: { members: 1, heads: 1 },
        peakRiders: 1,
        raids: [{ tier: 'G', shadow: false, count: 1 }],
      }),
      channelOf,
      whole,
    );
    expect(text).toContain('About 1 stop in 20 min');
    // One rider, the most at once: that says nothing more.
    expect(text).toContain('\n1 rider\n');
    expect(text).toContain('Recorded along the way: 1 Gigantamax max battle');
  });

  it('says when none were recorded, and leaves out what it does not know', () => {
    const text = trainCardText(
      card({ raids: [], peakRiders: null, regionIds: null }),
      channelOf,
      whole,
    );
    expect(text).toContain('No raids or max battles recorded along the way.');
    expect(text).toContain('12 riders, 15 with their +1s\n');
    expect(text).not.toContain('Through');
    // The raids not read: no line of them.
    expect(trainCardText(card({ raids: null }), channelOf, whole)).not.toContain('along the way');
  });

  it('says no most at once where everybody who rode was aboard together', () => {
    const text = trainCardText(
      card({ riders: { members: 12, heads: 12 }, peakRiders: 12 }),
      channelOf,
      whole,
    );
    expect(text.split('\n')[3]).toBe('12 riders');
  });

  it('says nobody rode a train that moved without riders', () => {
    const text = trainCardText(
      card({ riders: { members: 0, heads: 0 }, peakRiders: 0 }),
      channelOf,
      whole,
    );
    expect(text.split('\n')[3]).toBe('Nobody rode it.');
    expect(text).not.toContain('0 riders');
  });

  it('cuts a long line of raids to fit, saying how many tiers more', () => {
    const raids = ['Elite', 'SuperMega', 'MegaLegendary', 'T5', 'Mega', 'T3', 'T1', 'G', 'D5'].map(
      (tier) => ({ tier, shadow: false, count: 99 }),
    );
    const cut: Fit = { list: whole.list, part: (make) => make(120) };
    const line = trainCardText(card({ raids, regionIds: null }), channelOf, cut)
      .split('\n')
      .find((part) => part.startsWith('Recorded'));
    expect(line?.length).toBeLessThanOrEqual(120);
    expect(line).toMatch(/^Recorded along the way: 99 Elite raids, .*, …and \d+ more$/u);
  });

  it('says only the riders of a train that never started', () => {
    expect(
      trainCardText(
        card({ stops: null, regionIds: null, raids: null, riders: { members: 0, heads: 0 } }),
        channelOf,
        whole,
      ).split('\n'),
    ).toEqual(['**How the train went**', 'It never left: nobody rode it.']);
    expect(
      trainCardText(card({ stops: null, regionIds: null, raids: null }), channelOf, whole),
    ).toBe(
      '**How the train went**\nIt never left.\n12 riders, 15 with their +1s; at most 9 riders at once',
    );
  });

  it('names a region gone since by nothing, and cuts a long line of regions to fit', () => {
    expect(trainCardText(card({ regionIds: [7, 1] }), channelOf, whole)).toContain(
      'Through <#100000000000000001>\n',
    );
    const many = new Map(
      Array.from({ length: 40 }, (_, n) => [
        n + 1,
        `1000000000000000${String(n).padStart(2, '0')}`,
      ]),
    );
    const cut: Fit = { list: whole.list, part: (make) => make(200) };
    const text = trainCardText(card({ regionIds: [...many.keys()] }), (id) => many.get(id), cut);
    const line = text.split('\n').find((part) => part.startsWith('Through'));
    expect(line?.length).toBeLessThanOrEqual(200);
    expect(line).toMatch(/ and \d+ more$/u);
  });
});

describe('raidTallyWords: a tier of the raids along the way', () => {
  it('words every tier of the history, legacy and shadow ones too', () => {
    const words = (tier: string | null, shadow = false, count = 2) =>
      raidTallyWords({ tier, shadow, count });
    expect(words('T5', true)).toBe('2 Shadow Level 5 raids');
    expect(words('T1', false, 1)).toBe('1 Level 1 raid');
    expect(words('Mega')).toBe('2 Mega raids');
    expect(words('MegaLegendary', false, 1)).toBe('1 Mega Legendary raid');
    expect(words('SuperMega')).toBe('2 Super Mega raids');
    expect(words('Elite')).toBe('2 Elite raids');
    expect(words('T2')).toBe('2 Level 2 raids');
    expect(words('T4')).toBe('2 Level 4 raids');
    expect(words('EX')).toBe('2 EX raids');
    expect(words('D1')).toBe('2 Dynamax 1★ max battles');
    expect(words('G', false, 1)).toBe('1 Gigantamax max battle');
    expect(words(null)).toBe('2 raids of a tier not known');
  });
});
