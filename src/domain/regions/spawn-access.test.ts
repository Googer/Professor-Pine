import { describe, expect, it } from 'vitest';
import { spawnGates, spawnKeptOut } from './spawn-access.js';

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
