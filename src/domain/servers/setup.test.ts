import { describe, expect, it } from 'vitest';
import { setupDone, setupItems, type SetupFacts } from './setup.js';

const nothing: SetupFacts = { values: { channels: {} }, regions: 0, gyms: 0 };
const required: SetupFacts = {
  values: {
    timezone: 'America/New_York',
    channels: { 'bot-lab': '300000000000000001', 'mod-bot-lab': '300000000000000002' },
  },
  regions: 1,
  gyms: 0,
};

describe('the setup of a server (plan 19C-2)', () => {
  it('lists its items in order, the time zone, both bot labs and a region required', () => {
    expect(setupItems(nothing)).toEqual([
      { key: 'timezone', required: true, done: false },
      { key: 'bot-lab', required: true, done: false },
      { key: 'mod-bot-lab', required: true, done: false },
      { key: 'region', required: true, done: false },
      { key: 'moderation', required: false, done: false },
      { key: 'events', required: false, done: false },
      { key: 'channels', required: false, done: false },
      { key: 'gyms', required: false, done: false },
    ]);
  });

  it('is done once the required items are, whatever the rest', () => {
    expect(setupDone(nothing)).toBe(false);
    expect(setupDone(required)).toBe(true);
    for (const missing of [
      { ...required, values: { ...required.values, timezone: undefined } },
      { ...required, values: { ...required.values, channels: { 'bot-lab': '1' } } },
      { ...required, values: { ...required.values, channels: { 'mod-bot-lab': '2' } } },
      { ...required, regions: 0 },
    ]) {
      expect(setupDone(missing)).toBe(false);
    }
  });

  it('counts the other channels done only when each of them is set', () => {
    const some = {
      ...required,
      values: { ...required.values, channels: { ...required.values.channels, unown: '3' } },
    };
    expect(setupItems(some).find((item) => item.key === 'channels')?.done).toBe(false);
    const all = {
      ...required,
      values: {
        ...required.values,
        channels: {
          ...required.values.channels,
          unown: '3',
          'elite-gym-raids': '4',
          'remote-raids': '5',
          pvp: '6',
          'bot-updates': '7',
        },
      },
      gyms: 12,
    };
    const done = setupItems(all)
      .filter((item) => item.done)
      .map((item) => item.key);
    expect(done).toEqual(['timezone', 'bot-lab', 'mod-bot-lab', 'region', 'channels', 'gyms']);
  });
});
