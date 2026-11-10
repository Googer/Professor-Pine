import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { base64url, regionVersion, sha256, versionText } from './version.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });
const SQUARE = [p(40, -80.1), p(40.1, -80.1), p(40.1, -80), p(40, -80), p(40, -80.1)];

describe('sha256', () => {
  it('gives what node gives, for texts of every length around the blocks', () => {
    for (const text of [
      '',
      'abc',
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(63),
      'a'.repeat(64),
      'a'.repeat(65),
      'a'.repeat(1_000),
      'Pokémon Gö — 東京 🏳️‍🌈',
    ]) {
      const ours = Buffer.from(sha256(text)).toString('hex');
      expect(ours, text).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });

  it('writes bytes as base64url without padding, as node does', () => {
    for (const length of [0, 1, 2, 3, 4, 31, 32]) {
      const bytes = Uint8Array.from({ length }, (_unused, i) => (i * 37 + 251) % 256);
      expect(base64url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
    }
  });
});

describe('the version of a region', () => {
  it('is 16 characters of base64url over the outline and the description', () => {
    const version = regionVersion(SQUARE, null);
    expect(version).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(version).toBe(
      createHash('sha256').update(versionText(SQUARE, null)).digest('base64url').slice(0, 16),
    );
  });

  it('changes with a corner moved by more than a rounding, and with the description', () => {
    const before = regionVersion(SQUARE, null);
    const moved = SQUARE.map((point, i) => (i === 1 ? p(40.100002, -80.1) : point));
    expect(regionVersion(moved, null)).not.toBe(before);
    expect(regionVersion(SQUARE, 'Town')).not.toBe(before);
    expect(regionVersion(SQUARE, 'Town')).not.toBe(regionVersion(SQUARE, 'Towns'));
  });

  it('is the same for an outline read back at six decimals', () => {
    const precise = SQUARE.map(({ lat, lon }) => p(lat + 1e-8, lon - 3e-8));
    expect(regionVersion(precise, null)).toBe(regionVersion(SQUARE, null));
    // Minus zero and plus zero are one place.
    expect(versionText([p(-0, 0), p(1e-9, -1e-9)], null)).toBe(
      versionText([p(0, 0), p(0, 0)], null),
    );
  });

  it('is the same for an open and a closed ring, and for none and an empty description', () => {
    expect(regionVersion(SQUARE.slice(0, -1), null)).toBe(regionVersion(SQUARE, null));
    expect(regionVersion(SQUARE, '')).toBe(regionVersion(SQUARE, null));
  });

  it('has one for a region without an outline', () => {
    expect(regionVersion(null, null)).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(regionVersion(null, null)).not.toBe(regionVersion(SQUARE, null));
  });
});
