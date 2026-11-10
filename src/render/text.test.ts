import { describe, expect, it } from 'vitest';
import {
  clockOrDate,
  clockOrDay,
  count,
  cutMarkdown,
  endSentence,
  fitItems,
  fitMessages,
  hasShownName,
  inMessages,
  isFarOff,
  memberName,
  memberText,
  plain,
  plainLines,
  plainNoLinks,
  timestamp,
  titleCase,
  truncate,
  unplain,
} from './text.js';
import { zonedAt } from '../../test/support/time.js';

describe('plain', () => {
  it('escapes Markdown and tidies white space', () => {
    expect(plain('  park   *side* _now_ \n')).toBe('park \\*side\\* \\_now\\_');
    expect(plain('# big')).toBe('\\# big');
  });

  it('escapes every marker of a long run, so that none is left to format', () => {
    // discord.js left some of a long run bare (`*****bold*****` kept one `*` of each end).
    for (const marker of ['*', '_', '~', '|', '`']) {
      for (const length of [1, 2, 3, 4, 5, 9]) {
        const run = marker.repeat(length);
        const escaped = `\\${marker}`.repeat(length);
        expect(plain(`${run}bold${run}`)).toBe(`${escaped}bold${escaped}`);
        expect(plain(run)).toBe(escaped);
      }
    }
    // What a member typed comes back whole.
    for (const typed of ['*****bold*****', '_____u_____', 'a\\**b**', '`````c`````']) {
      expect(unplain(plain(typed))).toBe(typed);
    }
    // An address keeps its `_` and `*`, part of the link; what formats in pairs is escaped.
    expect(plain('a_b https://x.example/a_b*c')).toBe('a\\_b https://x.example/a_b*c');
    expect(plain('<https://x.example/a_b>')).toBe('<\u200bhttps://x.example/a_b>');
    expect(plain('https://x.example/a~~b~~')).toBe('https://x.example/a\\~\\~b\\~\\~');
    // An address ends at a `<`, as Discord's does: what follows is text again.
    expect(plain('https://x.example/a<b_c')).toBe('https://x.example/a<\u200bb\\_c');
  });

  it('leaves no masked link alive: not a single one, not a second, not one behind a bracket', () => {
    expect(plain('[click](https://example.test)')).toBe('\\[click]\\(https://example.test)');
    // discord.js escapes the first bracket of a line only, and greedily: the real link stayed.
    expect(plain('[ [Official rules](https://evil.example)')).toBe(
      '\\[ [Official rules]\\(https://evil.example)',
    );
    expect(plain('see [a](https://a.example) and [b](https://b.example)')).toBe(
      'see \\[a]\\(https://a.example) and [b]\\(https://b.example)',
    );
    // A backslash a member typed there is shown as one (discord.js escapes it), and the
    // bracket after it gets none of its own: nothing between them makes a link.
    expect(plain('[a]\\(https://a.example)')).toBe('[a]\\\\(https://a.example)');
    expect(plain('f(x) and [y] (z)')).toBe('f(x) and [y] (z)');
  });

  it('keeps a typed mention, channel link, emoji or timestamp from being read as one', () => {
    expect(plain('@everyone')).toBe('@\u200beveryone');
    expect(plain('@here')).toBe('@\u200bhere');
    expect(plain('<@123456789012345678>')).toBe('<\u200b@123456789012345678>');
    expect(plain('<@&123456789012345678>')).toBe('<\u200b@&123456789012345678>');
    expect(plain('<#123456789012345678>')).toBe('<\u200b#123456789012345678>');
    expect(plain('<:pine:1> <a:spin:2> <t:1:R>')).toBe(
      '<\u200b:pine:1> <\u200ba:spin:2> <\u200bt:1:R>',
    );
    expect(plain('2 < 3')).toBe('2 < 3');
  });

  it('breaks every other angle-bracket form too', () => {
    expect(plain('<id:customize>')).toBe('<\u200bid:customize>');
    expect(plain('<sound:1:2>')).toBe('<\u200bsound:1:2>');
    expect(plain('<3')).toBe('<\u200b3');
    expect(plain('a<b')).toBe('a<\u200bb');
  });

  it('puts a zero-width character only where it is needed', () => {
    expect(plain('bob@example.com')).toBe('bob@example.com');
    expect(plain('ask @bob')).toBe('ask @bob');
    expect(plain('hi @everyone and @here')).toBe('hi @\u200beveryone and @\u200bhere');
  });

  it('escapes an underscore right after the start of an emoji', () => {
    expect(plain('<:__x__:1>')).toBe('<\u200b:\\_\\_x\\_\\_:1>');
    expect(plain('<a:_x:1>')).toBe('<\u200ba:\\_x:1>');
  });

  it('escapes a block quote or subtext at the start, and leaves a > elsewhere', () => {
    expect(plain('> quoted')).toBe('\\> quoted');
    expect(plain('>>> quoted')).toBe('\\>>> quoted');
    expect(plain('-# small')).toBe('\\-# small');
    expect(plain('a > b')).toBe('a > b');
    expect(plain('a -# b')).toBe('a -# b');
  });
});

describe('unplain', () => {
  it('gives back exactly the one-line text that plain was given', () => {
    const labels = [
      '1. north_hills',
      'meet at the `gate`',
      '<3 the park',
      '@everyone come',
      'a @here b',
      'north_hills and __under__',
      '**bold** *it* ~~gone~~ ||secret||',
      'a back\\slash, \\* and \\\\',
      '```code``` and ``two``',
      '[link](https://example.com) [ [a](b)',
      '> quoted',
      '-# small',
      '- item',
      '# big',
      '<:pine_cone:123> <@200000000000000002> <#1> <t:1:R>',
    ];
    for (const label of labels) expect(unplain(plain(label))).toBe(label);
  });

  it('leaves text without escapes as it is', () => {
    expect(unplain('You are coming, in group B.')).toBe('You are coming, in group B.');
  });
});

describe('plainNoLinks', () => {
  it('leaves no address a client would make a link of, with or without a scheme', () => {
    expect(plainNoLinks('free coins https://evil.example/a_b')).toBe(
      'free coins https:\u200B//evil.\u200Bexample/a\\_b',
    );
    expect(plainNoLinks('HTTP://EVIL.EXAMPLE and steam://run/1')).toBe(
      'HTTP:\u200B//EVIL.EXAMPLE and steam:\u200B//run/1',
    );
    expect(plainNoLinks('see www.evil.example now')).toBe('see www.\u200Bevil.example now');
    expect(plainNoLinks('join discord.gg/abc123')).toBe('join discord.\u200Bgg/abc123');
    expect(plainNoLinks('discord.com/invite/abc')).toBe('discord.\u200Bcom/invite/abc');
    // An escaped slash is a slash again once the client has read the Markdown.
    expect(plainNoLinks('https:\\//evil.example')).not.toMatch(/:[\\/]/);
  });

  it('is plain in everything else: Markdown, mentions and masked links stay broken', () => {
    expect(plainNoLinks('  **now**   @everyone [x](https://a.example) ')).toBe(
      '\\*\\*now\\*\\* @\u200Beveryone \\[x]\\(https:\u200B//a.example)',
    );
    expect(plainNoLinks('<https://a.example>')).not.toContain('://');
    expect(plainNoLinks('by the fountain, 5 min. from St. Mary/High St.')).toBe(
      'by the fountain, 5 min. from St. Mary/High St.',
    );
  });

  it('leaves `plain` alone: the information of a meetup may link', () => {
    expect(plain('https://example.com/a')).toBe('https://example.com/a');
  });
});

describe('naming a member', () => {
  const id = '200000000000000002';

  it('writes the name in bold with the mention in a sentence, and the name alone in a list', () => {
    expect(memberText({ id, name: 'Alice' })).toBe(`**Alice** (<@${id}>)`);
    expect(memberName({ id, name: 'Alice' })).toBe('Alice');
  });

  it('falls back to the mention for a member without a name, or one that shows nothing', () => {
    for (const member of [{ id }, { id, name: undefined }, { id, name: '' }, { id, name: '  ' }]) {
      expect(memberText(member)).toBe(`<@${id}>`);
      expect(memberName(member)).toBe(`<@${id}>`);
    }
  });

  it('shows a name as text: no Markdown, no mention, nothing that reaches past the bold', () => {
    expect(memberText({ id, name: '**Al**' })).toBe(`**\\*\\*Al\\*\\*** (<@${id}>)`);
    expect(memberName({ id, name: '_Al_' })).toBe('\\_Al\\_');
    expect(memberName({ id, name: '@everyone' })).toBe('@\u200beveryone');
    expect(memberName({ id, name: '<@200000000000000003>' })).toBe('<\u200b@200000000000000003>');
    // A backslash at the end would escape the closing asterisks of the bold.
    expect(memberText({ id, name: 'Al\\' })).toBe(`**Al** (<@${id}>)`);
  });
});

describe('a member whose name is an address', () => {
  it('is named without a link, in a sentence and in a list', () => {
    const member = { id: '200000000000000002', name: 'https://evil.example discord.gg/x' };
    const name = 'https:\u200B//evil.example discord.\u200Bgg/x';
    expect(memberName(member)).toBe(name);
    expect(memberText(member)).toBe(`**${name}** (<@200000000000000002>)`);
  });
});

describe('endSentence (plan 8X-F)', () => {
  it('ends a sentence with a period, unless the text ends in one already', () => {
    expect(endSentence('There is a raid at Gazebo')).toBe('There is a raid at Gazebo.');
    // The staging of 8X: "… at West Mifflin Fire Company Inc.." read twice.
    expect(endSentence('There is a raid at Acme Inc.')).toBe('There is a raid at Acme Inc.');
    expect(endSentence('Is it at Yahoo!')).toBe('Is it at Yahoo!');
    expect(endSentence('at Who?')).toBe('at Who?');
  });

  it('looks through bold, a masked link and the escapes of plain', () => {
    expect(endSentence(`at **${plain('Acme Inc.')}**`)).toBe('at **Acme Inc.**');
    expect(endSentence('at **Acme**')).toBe('at **Acme**.');
    expect(endSentence(`at ${plain('1.')}`)).toBe(`at ${plain('1.')}`);
    expect(endSentence('to [Acme Inc.](<https://maps.example/?q=1>)')).toBe(
      'to [Acme Inc.](<https://maps.example/?q=1>)',
    );
    expect(endSentence('to [Acme](<https://maps.example/?q=1>)')).toBe(
      'to [Acme](<https://maps.example/?q=1>).',
    );
    // A power spot says what it is after its link: the sentence ends there.
    expect(endSentence('to [Acme Inc.](<https://maps.example>) (Power Spot)')).toBe(
      'to [Acme Inc.](<https://maps.example>) (Power Spot).',
    );
  });

  it('keeps the ellipsis of a cut name, and ends the sentence after it', () => {
    expect(endSentence(`at **${truncate('A very long name of a place', 10)}**`)).toBe(
      'at **A very lo…**.',
    );
  });
});

describe('truncate', () => {
  it('leaves a text that fits and cuts a longer one to the limit with an ellipsis', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('exactly10!', 10)).toBe('exactly10!');
    expect(truncate('this is too long', 10)).toBe('this is t…');
    expect(truncate('this is too long', 10)).toHaveLength(10);
    expect(truncate('word  and more', 6)).toBe('word…');
  });

  it('never cuts a character made of two units in half', () => {
    const cut = truncate('ab😀😀😀', 5);
    expect(cut).toBe('ab😀…');
    expect(/[\uD800-\uDBFF]$/.test(cut.slice(0, -1))).toBe(false);
  });
});

describe('cutMarkdown', () => {
  it('leaves a text that fits as it is', () => {
    expect(cutMarkdown('**Bold** and `code`', 50)).toBe('**Bold** and `code`');
  });

  it('cuts a finished markdown text without leaving a construct open', () => {
    // Bold cut in its middle: its marker goes, its text stays plain.
    expect(cutMarkdown('**Pinewood Public Library** was renamed', 14)).toBe('Pinewood Pu…');
    // A code span, a link, a mention or a time cut in its middle: cut before it.
    expect(cutMarkdown('Attach `wayfarer-import.csv` now', 20)).toBe('Attach…');
    expect(cutMarkdown('See [the map](<https://example.test/a>) here', 25)).toBe('See…');
    expect(cutMarkdown('Asked in <#123456789012345678> today', 20)).toBe('Asked in…');
    expect(cutMarkdown('Gone <t:1760000000:R> now', 12)).toBe('Gone…');
    // What closed before the cut stays as it is.
    expect(cutMarkdown('**Bold** and `code` and more words', 21)).toBe('**Bold** and `code`…');
    // An escape is never split.
    expect(cutMarkdown('Tom \\*star\\* of the show', 6)).toBe('Tom…');
    expect(cutMarkdown('Tom \\*star\\* of the show', 7)).toBe('Tom \\*…');
  });

  it('leaves no marker open in member text, whatever it holds, at any limit', () => {
    /** The markers of bold and code, outside escapes, come in pairs. */
    const balanced = (cut: string): boolean => {
      const bare = cut.replace(/\\./gsu, '');
      return (
        (bare.match(/\*\*/gu) ?? []).length % 2 === 0 && (bare.match(/`/gu) ?? []).length % 2 === 0
      );
    };
    const bob = memberText({ id: '300000000000000002', name: 'Bob' });
    const texts = [
      `Renamed **${plain('I <3 Pizza')}** by ${bob} and **${'x'.repeat(60)}**`,
      `**${plain('Cafe [1] near')}** and [Map](<https://example.test/a>) **${'y'.repeat(40)}**`,
      `**${plain('a < b > c')}** **${plain('[x] (y) *z* _w_ `v`')}** \`code\` **end ${'q'.repeat(30)}**`,
    ];
    for (const text of texts) {
      for (let limit = 2; limit <= text.length; limit++) {
        const cut = cutMarkdown(text, limit);
        expect(cut.length, `${limit}`).toBeLessThanOrEqual(limit);
        expect(balanced(cut), `${limit}: ${cut}`).toBe(true);
      }
    }
  });

  it('is at most the limit long', () => {
    const text = `**${'x'.repeat(50)}** \`${'y'.repeat(50)}\` <#${'1'.repeat(18)}>`;
    for (let limit = 2; limit < text.length; limit++) {
      expect(cutMarkdown(text, limit).length).toBeLessThanOrEqual(limit);
    }
  });
});

describe('timestamp', () => {
  it('writes a moment the way Discord shows it in the reader’s own zone', () => {
    expect(timestamp(1_760_000_000_999)).toBe('<t:1760000000:t>');
    expect(timestamp(1_760_000_000_000, 'R')).toBe('<t:1760000000:R>');
  });
});

describe('fitItems', () => {
  it('joins what fits and counts what does not', () => {
    expect(fitItems(['a', 'b', 'c'], 20)).toBe('a, b, c');
    expect(fitItems(['alpha', 'beta', 'gamma', 'delta'], 24)).toBe('alpha, beta, …and 2 more');
    expect(fitItems(['alpha', 'beta'], 3)).toBe('…and 2 more');
    expect(fitItems([], 10)).toBe('');
  });
});

describe('count and titleCase', () => {
  it('counts with the right word', () => {
    expect(count(1, 'trainer')).toBe('1 trainer');
    expect(count(0, 'trainer')).toBe('0 trainers');
    expect(count(2, 'party', 'parties')).toBe('2 parties');
  });

  it('turns an id into words', () => {
    expect(titleCase('partly_cloudy')).toBe('Partly Cloudy');
    expect(titleCase('fairy')).toBe('Fairy');
  });
});

describe('truncate at an escape', () => {
  it('never leaves a lone backslash at the cut', () => {
    // Cut between the backslash and the star it escapes: the backslash goes too.
    expect(truncate('ab\\*cd', 4)).toBe('ab…');
    expect(truncate('\\*'.repeat(10), 6)).toBe('\\*\\*…');
    expect(truncate('\\*'.repeat(10), 7)).toBe('\\*\\*\\*…');
  });

  it('keeps an escaped backslash, which is a pair', () => {
    expect(truncate('ab\\\\cdef', 5)).toBe('ab\\\\…');
    expect(truncate('a\\\\\\*cdef', 5)).toBe('a\\\\…');
  });

  it('stays within the limit, and leaves a text that fits alone', () => {
    for (let limit = 2; limit < 12; limit++) {
      expect(truncate('\\_'.repeat(8), limit).length).toBeLessThanOrEqual(limit);
    }
    expect(truncate('ends in one \\', 20)).toBe('ends in one \\');
  });
});

describe('a time with its day', () => {
  const NOW = 1_791_900_000_000;
  const HOUR = 3_600_000;

  it('is far off beyond half a day, before or after now', () => {
    expect(isFarOff(NOW + 12 * HOUR, NOW)).toBe(false);
    expect(isFarOff(NOW + 12 * HOUR + 1, NOW)).toBe(true);
    expect(isFarOff(NOW - 12 * HOUR - 1, NOW)).toBe(true);
  });

  it('is named by the clock when it is near, with its date when it is far off', () => {
    expect(clockOrDate(NOW + HOUR, NOW)).toBe(`<t:${(NOW + HOUR) / 1000}:t>`);
    expect(clockOrDate(NOW + 30 * HOUR, NOW)).toBe(`<t:${(NOW + 30 * HOUR) / 1000}:f>`);
    expect(timestamp(NOW, 'F')).toBe(`<t:${NOW / 1000}:F>`);
  });
});

describe('a time of a timed party', () => {
  const ZONE = 'America/New_York';
  const at = (iso: string) => zonedAt(iso, ZONE);
  const stamp = (time: number, style: string) => `<t:${time / 1000}:${style}>`;

  it('is named by the clock today, and with its date on any other day, however near', () => {
    const now = at('2026-10-13T23:00');
    expect(clockOrDay(at('2026-10-13T23:30'), now, ZONE)).toBe(stamp(at('2026-10-13T23:30'), 't'));
    expect(clockOrDay(at('2026-10-14T00:30'), now, ZONE)).toBe(stamp(at('2026-10-14T00:30'), 'f'));
    expect(clockOrDay(at('2026-10-17T18:00'), now, ZONE)).toBe(stamp(at('2026-10-17T18:00'), 'f'));
    // Twenty-three hours on and still today.
    const early = at('2026-10-13T00:10');
    expect(clockOrDay(at('2026-10-13T23:10'), early, ZONE)).toBe(
      stamp(at('2026-10-13T23:10'), 't'),
    );
    // The day is that of the zone, not of UTC: 20:30 in New York is past midnight in UTC.
    expect(clockOrDay(at('2026-10-13T20:30'), at('2026-10-13T14:00'), ZONE)).toBe(
      stamp(at('2026-10-13T20:30'), 't'),
    );
  });
});

describe('plainLines', () => {
  it('makes every line plain and keeps the lines', () => {
    expect(plainLines('first *line*\nsecond  line\r\n> third')).toBe(
      'first \\*line\\*\nsecond line\n\\> third',
    );
  });

  it('keeps one empty line between lines at most, and none at the ends', () => {
    expect(plainLines('\n\na\n\n\n\nb\n \n')).toBe('a\n\nb');
    expect(plainLines(' \n\t\n')).toBe('');
  });

  it('leaves no way to start a mention, a heading or a list on a later line', () => {
    expect(plainLines('ok\n# big\n- item\n1. one\n<@123>\n@here')).toBe(
      'ok\n\\# big\n\\- item\n1\\. one\n<\u200b@123>\n@\u200bhere',
    );
  });
});

describe('fitMessages', () => {
  it('joins lines into one message while they fit', () => {
    expect(fitMessages(['a', '', 'b'])).toEqual(['a\n\nb']);
    expect(fitMessages([])).toEqual([]);
  });

  it('starts a new message rather than cut a line, and keeps the order', () => {
    const lines = Array.from({ length: 50 }, (_unused, n) => `${String(n)} ${'x'.repeat(96)}`);
    const messages = fitMessages(lines);
    expect(messages.length).toBeGreaterThan(2);
    for (const message of messages) expect(message.length).toBeLessThanOrEqual(2000);
    expect(messages.join('\n').split('\n')).toEqual(lines);
  });

  it('cuts a single line that is longer than a message, and starts no message with an empty line', () => {
    const [cut] = fitMessages(['y'.repeat(2500)]);
    expect(cut).toHaveLength(2000);
    expect(cut?.endsWith('…')).toBe(true);
    expect(fitMessages(['', '', 'a'])).toEqual(['a']);
  });
});

describe('inMessages', () => {
  const members = (n: number) =>
    Array.from({ length: n }, (_, i) => `7000000000000${String(10000 + i)}`);
  const pinged = (messages: { mention: { users: string[] } }[]) =>
    messages.flatMap((message) => message.mention.users);

  it('is one message with the text and its mentions while they fit', () => {
    const three = members(3);
    expect(inMessages('Lobby up', three)).toEqual([
      {
        content: `Lobby up\n<@${three[0]}> <@${three[1]}> <@${three[2]}>`,
        mention: { users: three },
      },
    ]);
    expect(inMessages('Lobby up', [])).toEqual([{ content: 'Lobby up', mention: { users: [] } }]);
  });

  it('pings everybody, in order and once, in as many messages as it takes', () => {
    const all = members(250);
    const text = `**Alice** (<@100000000000000001>) to everybody in this raid:\n> ${'x'.repeat(500)}`;
    const messages = inMessages(text, all);
    expect(messages.length).toBeGreaterThan(2);
    expect(pinged(messages)).toEqual(all);
    // The text goes first, once; the others hold only mentions, each of those it pings.
    expect(messages[0]?.content.startsWith(text)).toBe(true);
    for (const [index, message] of messages.entries()) {
      expect(message.content.length).toBeLessThanOrEqual(2000);
      expect(message.mention.users.length).toBeLessThanOrEqual(100);
      expect(message.mention.users.length).toBeGreaterThan(0);
      const named = [...message.content.matchAll(/<@(\d+)>/g)].map((m) => m[1]);
      expect(named).toEqual(
        index === 0 ? ['100000000000000001', ...message.mention.users] : message.mention.users,
      );
      if (index > 0) expect(message.content).toMatch(/^(<@\d+> ?)+$/);
    }
  });

  it('keeps a message of short mentions to one hundred pings', () => {
    // Real snowflakes fill 2,000 characters first (some 86 to a message); short ids do not.
    const all = Array.from({ length: 230 }, (_, i) => String(i + 1));
    const messages = inMessages('Go', all);
    expect(messages.map((message) => message.mention.users.length)).toEqual([100, 100, 30]);
  });

  it('sends the text alone first when no mention fits beside it', () => {
    const all = members(2);
    const text = 'y'.repeat(2000);
    expect(inMessages(text, all)).toEqual([
      { content: text, mention: { users: [] } },
      { content: `<@${all[0]}> <@${all[1]}>`, mention: { users: all } },
    ]);
  });
});

describe('hasShownName (W4)', () => {
  it('says whether a name shows as something, or a mention would stand in its place', () => {
    expect(hasShownName('Ash')).toBe(true);
    expect(hasShownName('*Ash*')).toBe(true);
    for (const nothing of ['', '   ', '\\', '\\\\']) {
      expect(hasShownName(nothing), JSON.stringify(nothing)).toBe(false);
      expect(memberName({ id: '1', name: nothing })).toBe('<@1>');
    }
  });
});
