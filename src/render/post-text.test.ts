import { describe, expect, it } from 'vitest';
import type { PostLine, PostNode } from '../domain/web/party-data.js';
import { noMeetingTime } from './party-post.js';
import { postText, type PostTextOptions } from './post-text.js';
import { linkTextOf, mapMarkdown, UNCERTAIN_TIME } from './raid-post.js';
import { memberName, plain, plainLines, plainNoLinks, timestamp } from './text.js';

const GUILD = '412345678901234567';
const MAPS = 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05';

/** Google Maps and this server's posts may be links; Pine serves the emoji of id 1111…. */
const options: PostTextOptions = {
  emoji: (id) => (id === '111111111111111111' ? `/emoji/${id}.png` : undefined),
  channel: (id) => ({
    href: `https://discord.com/channels/${GUILD}/${id}`,
    name: id === '555555555555555555' ? 'Train · Library run' : 'another post',
  }),
  linkable: (url) =>
    url.startsWith('https://www.google.com/maps/') ||
    url.startsWith(`https://discord.com/channels/${GUILD}/`),
};

const read = (text: string): PostLine[] => postText(text, options);

/** The text a reader sees of nodes: what each shows, emoji by name, times by their moment. */
function shown(nodes: readonly PostNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
        case 'code':
          return node.text;
        case 'emoji':
          return `:${node.name}:`;
        case 'time':
          return `[${node.at}]`;
        default:
          return shown(node.children);
      }
    })
    .join('');
}

const text = (value: string): PostNode => ({ kind: 'text', text: value });

describe('postText: the lines', () => {
  it('reads a heading, small print and plain lines, an empty line kept', () => {
    expect(read('### Level 5 raid (egg)\nHatches soon.\n\n-# Reported by **Ash**')).toEqual([
      { style: 'heading', nodes: [text('Level 5 raid (egg)')] },
      { style: 'plain', nodes: [text('Hatches soon.')] },
      { style: 'plain', nodes: [] },
      {
        style: 'small',
        nodes: [text('Reported by '), { kind: 'strong', children: [text('Ash')] }],
      },
    ]);
  });

  it('takes an escaped heading or small print as text, as Discord does', () => {
    expect(read(plain('### not a heading'))).toEqual([
      { style: 'plain', nodes: [text('### not a heading')] },
    ]);
    expect(read(plain('-# not small'))).toEqual([
      { style: 'plain', nodes: [text('-# not small')] },
    ]);
  });
});

describe('postText: inside a line', () => {
  it('reads bold, italics, strike and code, nested', () => {
    expect(read('**Where · stop 2 of 7** and *soon* ~~1\\. Library~~ `/hatch`')).toEqual([
      {
        style: 'plain',
        nodes: [
          { kind: 'strong', children: [text('Where · stop 2 of 7')] },
          text(' and '),
          { kind: 'em', children: [text('soon')] },
          text(' '),
          { kind: 'strike', children: [text('1. Library')] },
          text(' '),
          { kind: 'code', text: '/hatch' },
        ],
      },
    ]);
    expect(read('**2\\. *The Stacks*** (the train is here)')[0]?.nodes).toEqual([
      {
        kind: 'strong',
        children: [text('2. '), { kind: 'em', children: [text('The Stacks')] }],
      },
      text(' (the train is here)'),
    ]);
  });

  it('leaves a marker that opens nothing as text', () => {
    expect(read('a * b ** c ~~')[0]?.nodes).toEqual([text('a * b ** c ~~')]);
  });

  it('reads the uncertain time’s note, with its command in code', () => {
    const [line] = read(UNCERTAIN_TIME);
    expect(line?.nodes).toContainEqual({ kind: 'code', text: '/hatch' });
    expect(shown(line?.nodes ?? [])).toBe(UNCERTAIN_TIME.replaceAll('`', ''));
  });

  it('reads the Map of a Where as a link, its address in angle brackets or not', () => {
    expect(read(`**Library** · ${mapMarkdown({ lat: 40.05, lon: -80.05 })}`)[0]?.nodes).toEqual([
      { kind: 'strong', children: [text('Library')] },
      text(' · '),
      { kind: 'link', href: MAPS, children: [text('Map')] },
    ]);
    expect(read(`[Map](${MAPS})`)[0]?.nodes).toEqual([
      { kind: 'link', href: MAPS, children: [text('Map')] },
    ]);
  });

  it('reads a link’s text with its escapes undone', () => {
    expect(read(`[${linkTextOf('Fire [Co] Inc.')}](<${MAPS}>)`)[0]?.nodes).toEqual([
      { kind: 'link', href: MAPS, children: [text('Fire [Co] Inc.')] },
    ]);
  });

  it('shows a link to an address the page may not link as its text', () => {
    expect(read('[Click](<https://evil.example/x>) and [Map](http://maps.google.com)')).toEqual([
      { style: 'plain', nodes: [text('Click and Map')] },
    ]);
  });

  it('links a bare address the page may link, and leaves another as text', () => {
    expect(read(`See ${MAPS}. Or https://evil.example/x`)[0]?.nodes).toEqual([
      text('See '),
      { kind: 'link', href: MAPS, children: [text(MAPS)] },
      text('. Or https://evil.example/x'),
    ]);
    expect(read(`<${MAPS}>`)[0]?.nodes).toEqual([
      { kind: 'link', href: MAPS, children: [text(MAPS)] },
    ]);
  });

  it('never links an address a member’s name broke (plainNoLinks)', () => {
    const name = plainNoLinks(`Ash ${MAPS}`);
    expect(read(name)[0]?.nodes).toEqual([text(`Ash ${MAPS}`)]);
  });

  it('reads custom emoji: Pine’s picture where it serves one, else the name', () => {
    expect(
      read('<:pinejoin:111111111111111111> Coming (2) <a:spin:222222222222222222> 🤔')[0]?.nodes,
    ).toEqual([
      { kind: 'emoji', name: 'pinejoin', src: '/emoji/111111111111111111.png' },
      text(' Coming (2) '),
      { kind: 'emoji', name: 'spin' },
      text(' 🤔'),
    ]);
  });

  it('reads a timestamp as its moment and style, Discord’s f without one', () => {
    const at = 1_760_000_000_000;
    expect(read(`Hatches ${timestamp(at, 'R')}, at ${timestamp(at)}. <t:1760000000>`)).toEqual([
      {
        style: 'plain',
        nodes: [
          text('Hatches '),
          { kind: 'time', at, style: 'R' },
          text(', at '),
          { kind: 'time', at, style: 't' },
          text('. '),
          { kind: 'time', at, style: 'f' },
        ],
      },
    ]);
  });

  it('shows a timestamp no date can be as it is written (review 8A-14)', () => {
    expect(read('at <t:99999999999999999:t> and <t:9000000000000:R>')).toEqual([
      { style: 'plain', nodes: [text('at <t:99999999999999999:t> and <t:9000000000000:R>')] },
    ]);
  });

  it('reads __text__ as underlined, as Discord does (review 8A-14)', () => {
    expect(read('a __b__ c')[0]?.nodes).toEqual([
      text('a '),
      { kind: 'underline', children: [text('b')] },
      text(' c'),
    ]);
  });

  it('names a member without a name as unknown, never by the id', () => {
    const nodes = read(`Coming (2): Ash, ${memberName({ id: '333333333333333333' })}`)[0]?.nodes;
    expect(nodes).toEqual([text('Coming (2): Ash, unknown member')]);
  });

  it('links another post by the name the reader may see', () => {
    expect(read('-# Split off from <#555555555555555555>')[0]).toEqual({
      style: 'small',
      nodes: [
        text('Split off from '),
        {
          kind: 'link',
          href: `https://discord.com/channels/${GUILD}/555555555555555555`,
          children: [text('Train · Library run')],
        },
      ],
    });
    expect(shown(read('went its own way: <#666666666666666666>')[0]?.nodes ?? [])).toBe(
      'went its own way: another post',
    );
  });

  it('reads the meeting hint with Meet…’s icon', () => {
    expect(read(noMeetingTime('⏰'))).toEqual([
      { style: 'small', nodes: [text('No meeting time yet: ⏰ sets one.')] },
    ]);
  });
});

/** Small random texts with every character the markdown reads, from a seed (no library). */
function texts(seed: number, count: number): string[] {
  const pieces = [
    'a',
    'Z',
    '7',
    ' ',
    '  ',
    '*',
    '**',
    '_',
    '~~',
    '`',
    '\\',
    '|',
    '>',
    '#',
    '-',
    '.',
    '[',
    ']',
    '(',
    ')',
    '<',
    '@',
    ':',
    '/',
    'everyone',
    'here',
    'https://x.test/a',
    `${MAPS}`,
    '<:pinejoin:111111111111111111>',
    '<t:1760000000:R>',
    '<@333333333333333333>',
    '<#555555555555555555>',
    '### ',
    '-# ',
    '1. ',
    'é',
    '🎉',
    '__',
    'www.',
    'ab/',
    '\u200b',
    '.\u200b',
  ];
  let state = seed;
  const next = (): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state;
  };
  return Array.from({ length: count }, () => {
    const length = 1 + (next() % 12);
    return Array.from({ length }, () => pieces[next() % pieces.length]).join('');
  });
}

/**
 * A text a member typed with a zero-width space where `plain` or `plainNoLinks` would put one
 * (after `<`, the `@` of a mass mention, the `:` or `.` of an address): which is theirs cannot be
 * told (as `unplain` says), so the property leaves such texts out.
 */
const ambiguous = (typed: string): boolean =>
  /<\u200b|@\u200b(?:everyone|here)|:\u200b[\\/]|\.\u200b[a-z0-9-]{2,}\/|www\.\u200b/iu.test(
    typed,
  ) ||
  // discord.js escapes a run of four asterisks as `*\*\**`, which Discord itself reads as
  // italics: a limit of `plain`, not of the reader (Discord shows the same).
  /\*{4}/u.test(typed);

describe('postText: what members wrote reads as they wrote it', () => {
  it('leaves out few texts as ambiguous', () => {
    const all = texts(8, 3_000);
    expect(all.filter(ambiguous).length).toBeLessThan(all.length / 10);
  });

  it('gives back the text of plain(s), its white space as plain leaves it', () => {
    for (const typed of texts(8, 3_000).filter((one) => !ambiguous(one))) {
      const lines = read(plain(typed));
      expect(lines, JSON.stringify(typed)).toHaveLength(1);
      expect(lines[0]?.style).toBe('plain');
      expect(shown(lines[0]?.nodes ?? []), JSON.stringify(typed)).toBe(
        typed.replace(/\s+/gu, ' ').trim(),
      );
    }
  });

  it('gives back the lines of plainLines(s) and the text of plainNoLinks(s)', () => {
    for (const typed of texts(21, 1_000).filter((one) => !ambiguous(one))) {
      const two = `${typed}\n${typed}`;
      const lines = read(plainLines(two));
      const tidy = typed.replace(/\s+/gu, ' ').trim();
      expect(
        lines.map((line) => shown(line.nodes)),
        JSON.stringify(two),
      ).toEqual(tidy === '' ? [''] : [tidy, tidy]);
      expect(shown(read(plainNoLinks(typed))[0]?.nodes ?? []), JSON.stringify(typed)).toBe(tidy);
    }
  });
});
