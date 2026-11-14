import { describe, expect, it } from 'vitest';
import { deletedSinceLeft } from './deletion.js';

const DAY = 24 * 3_600_000;
const NOW = Date.parse('2026-12-20T18:00:00Z');

describe('deletedSinceLeft', () => {
  it('holds of a server left whose data was deleted after it left', () => {
    expect(deletedSinceLeft({ leftAt: NOW - 31 * DAY, deletedAt: NOW })).toBe(true);
  });

  it('holds of no server left whose data was never deleted, nor of one present', () => {
    expect(deletedSinceLeft({ leftAt: NOW - 31 * DAY, deletedAt: null })).toBe(false);
    expect(deletedSinceLeft({ leftAt: null, deletedAt: null })).toBe(false);
    // Added back after its data was deleted: present, its deletion on record.
    expect(deletedSinceLeft({ leftAt: null, deletedAt: NOW })).toBe(false);
  });

  it('holds of no server that left again after its data was deleted', () => {
    expect(deletedSinceLeft({ leftAt: NOW + 5 * DAY, deletedAt: NOW })).toBe(false);
  });
});
