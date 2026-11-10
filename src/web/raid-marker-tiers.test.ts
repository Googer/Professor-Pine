import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { RAID_TIER_GROUPS, type RaidTierGroup } from '../domain/pogo/raid-tier.js';
import type { MapTierGroup } from '../domain/web/party-data.js';
import { maxRing, tierColour } from './client/raid-marker.js';

/**
 * The ring of a raid's marker on the map (plan 8M-7) for every group of tiers the domain makes
 * (`raidTierGroup`, sent with the list): here, outside `src/web/client/`, since the domain's
 * tier module is beyond the client's type check (no Node).
 */
describe("a raid marker's ring", () => {
  it('is drawn for every tier group in a property theme.css defines, through a class of map.css', () => {
    const client = path.resolve(import.meta.dirname, 'client');
    const theme = readFileSync(path.join(client, 'theme.css'), 'utf8');
    const map = readFileSync(path.join(client, 'map.css'), 'utf8');
    for (const group of RAID_TIER_GROUPS) {
      // The page's type of the group names the same ones.
      const named: MapTierGroup = group;
      expect(theme, group).toContain(`${tierColour(named)}:`);
      expect(map, group).toMatch(new RegExp(String.raw`\.raid-marker\.tier-${group}\b`, 'u'));
    }
  });
});

// Plan 8M-9A (A1): a max battle's ring is Dynamax's or Gigantamax's, light and dark.
describe("a max battle marker's ring", () => {
  it('is drawn for Dynamax and Gigantamax in a property theme.css defines, through a class of map.css', () => {
    const client = path.resolve(import.meta.dirname, 'client');
    const theme = readFileSync(path.join(client, 'theme.css'), 'utf8');
    const map = readFileSync(path.join(client, 'map.css'), 'utf8');
    for (const level of ['D1', 'G'] as const) {
      const ring = maxRing(level);
      // Light in :root and dark under its media query: the name twice.
      expect(theme.split(`${tierColour(ring)}:`).length - 1, ring).toBe(2);
      expect(map, ring).toMatch(new RegExp(String.raw`\.raid-marker\.tier-${ring}\b`, 'u'));
    }
  });
});

describe("the page's tier groups", () => {
  it("are the domain's, both ways (fix round 1)", () => {
    expectTypeOf<MapTierGroup>().toEqualTypeOf<RaidTierGroup>();
  });
});
