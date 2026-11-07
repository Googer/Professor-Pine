import { describe, expect, it } from 'vitest';
import { plannedCountWords, plannedSection } from './event-parties.js';

const ZONE = 'America/New_York';
const at = (iso: string): number =>
  Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE).epochMilliseconds;

describe('plannedCountWords', () => {
  it('counts trains, then meetups, leaving out a kind of none; nothing for none at all', () => {
    expect(plannedCountWords({ trains: 3, meetups: 1 })).toBe('3 trains, 1 meetup');
    expect(plannedCountWords({ trains: 1, meetups: 0 })).toBe('1 train');
    expect(plannedCountWords({ trains: 0, meetups: 2 })).toBe('2 meetups');
    expect(plannedCountWords({ trains: 0, meetups: 0 })).toBeUndefined();
  });
});

describe('plannedSection (an event’s post)', () => {
  it('heads with the counts and links each party everyone may see, with its start', () => {
    const text = plannedSection(
      {
        counts: { trains: 1, meetups: 1 },
        named: [
          { postId: '700000000000000001', start: at('2026-11-09T18:00') },
          { postId: '700000000000000002', start: at('2026-11-10T09:30') },
        ],
      },
      ZONE,
      4_000,
    );
    expect(text).toBe(
      '**Trains and meetups planned**\n1 train, 1 meetup\n' +
        '<#700000000000000001> · Mon, Nov 9, 6 PM\n' +
        '<#700000000000000002> · Tue, Nov 10, 9:30 AM',
    );
    expect(text).not.toMatch(/<t:/u);
  });

  it('counts those in regions not everyone may see without naming them', () => {
    const some = plannedSection(
      {
        counts: { trains: 3, meetups: 0 },
        named: [{ postId: '700000000000000001', start: at('2026-11-09T18:00') }],
      },
      ZONE,
      4_000,
    );
    expect(some?.split('\n').at(-1)).toBe('-# 2 more are in regions not everyone here can see.');
    const one = plannedSection(
      {
        counts: { trains: 1, meetups: 1 },
        named: [{ postId: '700000000000000001', start: at('2026-11-09T18:00') }],
      },
      ZONE,
      4_000,
    );
    expect(one?.split('\n').at(-1)).toBe('-# 1 more is in a region not everyone here can see.');
    expect(plannedSection({ counts: { trains: 0, meetups: 1 }, named: [] }, ZONE, 4_000)).toBe(
      '**Trains and meetups planned**\n1 meetup\n-# It is in a region not everyone here can see.',
    );
    expect(plannedSection({ counts: { trains: 2, meetups: 0 }, named: [] }, ZONE, 4_000)).toBe(
      '**Trains and meetups planned**\n2 trains\n-# They are in regions not everyone here can see.',
    );
  });

  it('is nothing without a party', () => {
    expect(plannedSection({ counts: { trains: 0, meetups: 0 }, named: [] }, ZONE, 4_000)).toBe(
      undefined,
    );
  });

  it('keeps within its room, the list ending with "…and N more"', () => {
    const named = Array.from({ length: 200 }, (_, n) => ({
      postId: String(700000000000000000n + BigInt(n)),
      start: at('2026-11-09T18:00') + n * 60_000,
    }));
    const text = plannedSection({ counts: { trains: 200, meetups: 0 }, named }, ZONE, 1_000) ?? '';
    expect(text.length).toBeLessThanOrEqual(1_000);
    expect(text.split('\n').at(-1)).toMatch(/^…and \d+ more$/u);
    expect(text.split('\n')[1]).toBe('200 trains');
  });
});
