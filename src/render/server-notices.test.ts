import { describe, expect, it } from 'vitest';
import { eventsForumCannotPostWords, forumRefusedWords } from './server-notices.js';

describe('what staff are told of a forum that refuses posts', () => {
  it('names the permissions the bot lacks, and asks staff to give them', () => {
    expect(forumRefusedWords('1', ['Send Messages in Posts', 'Manage Posts'])).toBe(
      'I may not make posts in <#1>: I lack the permissions Send Messages in Posts and Manage ' +
        'Posts there. No raid, max battle, train or meetup of the forum’s region can be posted. ' +
        'Give me those permissions in the forum’s settings.',
    );
    expect(eventsForumCannotPostWords('2', ['Manage Posts', 'Embed Links', 'Attach Files'])).toBe(
      'I may not make posts in <#2>, the events forum: I lack the permissions Manage Posts, ' +
        'Embed Links and Attach Files there. I cannot post events. Give me those ' +
        'permissions in the forum’s settings.',
    );
  });

  it('asks staff to check the permissions where Discord named none', () => {
    expect(forumRefusedWords('1', [])).toBe(
      'Discord does not let me make posts in <#1>. No raid, max battle, train or meetup of the ' +
        'forum’s region can be posted. Check my permissions in the forum’s settings.',
    );
  });
});
