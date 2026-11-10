import { describe, expect, it } from 'vitest';
import { placeKeptOut, spawnGates, spawnKeptOut } from './spawn-access.js';

describe("who may see and report a region's wild spawns", () => {
  it("asks the region's forum where it has one, then its channel", () => {
    expect(spawnGates({ forumChannelId: 'forum', channelId: 'channel' })).toEqual([
      'forum',
      'channel',
    ]);
    expect(spawnGates({ forumChannelId: null, channelId: 'channel' })).toEqual(['channel']);
  });

  it('keeps out a member barred from either, never one whose roles only hide them', () => {
    expect(spawnKeptOut(['visible', 'barred'], false)).toBe(true);
    expect(spawnKeptOut(['barred', 'visible'], false)).toBe(true);
    expect(spawnKeptOut(['hidden', 'hidden'], false)).toBe(false);
    expect(spawnKeptOut([undefined, 'visible'], false)).toBe(false);
    expect(spawnKeptOut([], false)).toBe(false);
  });

  it('never keeps out an administrator, whom Discord shows every channel', () => {
    expect(spawnKeptOut(['barred', 'barred'], true)).toBe(false);
  });
});

describe('who may report at a place that lies in regions (plan 8Z-2)', () => {
  it('keeps a place from a member whom every region it lies in keeps out', () => {
    expect(placeKeptOut([['barred', 'visible']], false)).toBe(true);
    expect(placeKeptOut([['visible', 'barred'], ['barred']], false)).toBe(true);
  });

  it('counts a place when one of its regions lets them in, hidden or not', () => {
    expect(placeKeptOut([['barred'], ['visible', 'visible']], false)).toBe(false);
    expect(placeKeptOut([['hidden', 'hidden'], ['barred']], false)).toBe(false);
    expect(placeKeptOut([[undefined, 'visible']], false)).toBe(false);
  });

  it('keeps nobody from a place in no region, nor an administrator from any', () => {
    expect(placeKeptOut([], false)).toBe(false);
    expect(placeKeptOut([['barred'], ['barred']], true)).toBe(false);
  });
});
