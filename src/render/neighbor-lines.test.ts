import { describe, expect, it } from 'vitest';
import { neighborHeads, neighborLine, neighborsBlock } from './party-post.js';

const LINK = 'https://discord.com/channels/412345678901234502/900000000000000001';

describe('a neighbor’s line in a post (plan 19E)', () => {
  it('names the server, what and when, the heads by status in the post’s words, and links the post', () => {
    expect(
      neighborLine({
        server: 'Pewter **City**',
        what: 'Level 5 raid against Yveltal',
        when: 'hatches <t:1:t>',
        heads: { interested: 2, coming: 3, present: 1, complete: 0 },
        link: LINK,
      }),
    ).toBe(
      '- **Pewter \\*\\*City\\*\\*** · Level 5 raid against Yveltal · hatches <t:1:t> · ' +
        `Interested (2), Coming (3), Here (1) · [Its post](<${LINK}>)`,
    );
    // A server whose name the bot does not know, and a party without a time.
    expect(
      neighborLine({
        server: undefined,
        what: 'Level 1 raid (egg)',
        when: undefined,
        heads: { interested: 0, coming: 0, present: 0, complete: 2 },
        link: LINK,
      }),
    ).toBe(`- **A neighboring server** · Level 1 raid (egg) · Done (2) · [Its post](<${LINK}>)`);
    expect(neighborHeads({ interested: 0, coming: 0, present: 0, complete: 0 })).toBe('nobody yet');
  });

  it('heads the lines by where they are', () => {
    expect(neighborsBlock('gym', ['- one', '- two'])).toBe(
      '**Neighbors at this gym**\n- one\n- two',
    );
    expect(neighborsBlock('spot', ['- one'])).toBe('**Neighbors at this Power Spot**\n- one');
  });
});
