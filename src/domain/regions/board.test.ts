import { describe, expect, it } from 'vitest';
import { boardThreadOf, channelsWithBoards } from './board.js';

describe('boardThreadOf', () => {
  it('is the summary post of a region with a forum and a summary recorded, else none', () => {
    const forum = '100000000000000011';
    const post = '100000000000000051';
    expect(boardThreadOf({ forumChannelId: forum, summaryMessageId: post })).toBe(post);
    expect(boardThreadOf({ forumChannelId: forum, summaryMessageId: null })).toBeNull();
    // A summary left recorded without its forum is no board.
    expect(boardThreadOf({ forumChannelId: null, summaryMessageId: post })).toBeNull();
  });
});

describe('channelsWithBoards', () => {
  it('keeps the channels whose region has a board, in their order', () => {
    const regions = new Map([
      ['west', { forumChannelId: 'f1', summaryMessageId: 'p1' }],
      ['east', { forumChannelId: 'f2', summaryMessageId: null }],
      ['north', { forumChannelId: 'f3', summaryMessageId: 'p3' }],
    ]);
    expect(channelsWithBoards(['north', 'east', 'gone', 'west'], (id) => regions.get(id))).toEqual([
      'north',
      'west',
    ]);
  });
});
