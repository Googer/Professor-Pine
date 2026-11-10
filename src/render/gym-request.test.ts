import { describe, expect, it } from 'vitest';
import { MAX_ISSUE_TITLE } from '../services/issue-gateway.js';
import { gymRequestIssue, noGitHubMentions } from './gym-request.js';
import { fencedBlock } from './text.js';

/** No half of a character in a text: no code point among the surrogates. */
const wellFormed = (text: string): boolean =>
  [...text].every((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0xd800 || code > 0xdfff;
  });

describe('gymRequestIssue', () => {
  it('names the gym in the title and labels the issue with its number', () => {
    expect(
      gymRequestIssue({
        gym: { id: 12, name: 'Pinewood Post Office Gym' },
        memberName: 'Alice',
        serverName: 'Pinewood Raids',
        text: 'Gone since May\n\nSee the photo',
      }),
    ).toEqual({
      title: 'Gym request: Pinewood Post Office Gym (#12)',
      body:
        'Request from `Alice` in `Pinewood Raids`:\n\n' +
        '```text\nGone since May\n\nSee the photo\n```',
      labels: ['12'],
    });
  });

  it('keeps control and direction characters out of the title, and never leaves it without a name', () => {
    const issue = (name: string) =>
      gymRequestIssue({ gym: { id: 3, name }, memberName: 'A', serverName: 'S', text: 'T' }).title;
    expect(issue('Old\u202e Mill\u0007')).toBe('Gym request: Old Mill (#3)');
    expect(issue('\u200e')).toBe('Gym request: Gym (#3)');
  });

  it('cuts a long name, never the number, and never inside a character', () => {
    const issue = (name: string) =>
      gymRequestIssue({ gym: { id: 1234567, name }, memberName: 'A', serverName: 'S', text: 'T' })
        .title;
    for (const name of ['x'.repeat(300), '\u{1F3DB}'.repeat(300)]) {
      const title = issue(name);
      expect(title.endsWith('… (#1234567)')).toBe(true);
      expect([...title]).toHaveLength(MAX_ISSUE_TITLE);
      expect(wellFormed(title)).toBe(true);
    }
  });
});

describe('noGitHubMentions', () => {
  it('breaks every @ and #, so that nobody is notified and no issue is linked', () => {
    expect(noGitHubMentions('@octocat and @org/team, mail@example.com, see #12')).toBe(
      '@\u200boctocat and @\u200borg/team, mail@\u200bexample.com, see #\u200b12',
    );
  });

  it('breaks every &, so that no HTML reference becomes an @ or a # on GitHub', () => {
    expect(noGitHubMentions('&#64;x &#x23;1 &commat;x')).toBe(
      '&\u200b#\u200b64;x &\u200b#\u200bx23;1 &\u200bcommat;x',
    );
  });

  it('breaks github.com/ addresses, which GitHub turns into references', () => {
    expect(
      noGitHubMentions('https://github.com/o/r/issues/1 and GitHub.com/o/r, but github alone'),
    ).toBe('https://github\u200b.com/o/r/issues/1 and GitHub\u200b.com/o/r, but github alone');
  });

  it('breaks GH-<number>, which GitHub links to an issue too', () => {
    expect(noGitHubMentions('see GH-12 and gh-3, but not GH-x')).toBe(
      'see GH-\u200b12 and gh-\u200b3, but not GH-x',
    );
  });
});

describe('the names in an issue', () => {
  it('fall back to a word when nothing but backticks is left of them', () => {
    const issue = gymRequestIssue({
      gym: { id: 2, name: 'Old Stone Fountain' },
      memberName: '``',
      serverName: ' ` ',
      text: 'Gone',
    });
    expect(issue.body).toBe('Request from someone in a server:\n\n```text\nGone\n```');
  });
});

// Plan 8Z-2: GitHub renders the body of an issue as Markdown, and the words are a member's.
describe('the words of a request in an issue', () => {
  const bodyOf = (text: string): string =>
    gymRequestIssue({ gym: { id: 2, name: 'G' }, memberName: 'A', serverName: 'S', text }).body;
  const HEAD = 'Request from `A` in `S`:\n\n';

  it('stand in a fenced block, so that nothing of them is read as Markdown', () => {
    const typed =
      'Gone\n===\n[click here](https://example.com) <img src=x> **bold**\n- [ ] a task\n> quoted';
    expect(bodyOf(typed)).toBe(`${HEAD}\`\`\`text\n${typed}\n\`\`\``);
  });

  it('stay inside the fence whatever backticks they hold: the fence is longer than any run', () => {
    const three = 'before\n```\n**Bold outside the block?**\n```\nafter';
    expect(bodyOf(three)).toBe(`${HEAD}\`\`\`\`text\n${three}\n\`\`\`\``);
    const many = `one \` two \`\`\`\`\`\`\` and ${'`'.repeat(40)}`;
    const fence = '`'.repeat(41);
    expect(bodyOf(many)).toBe(`${HEAD}${fence}text\n${many}\n${fence}`);
    // No line of the words can close the block: none has as many backticks as the fence.
    for (const typed of [three, many, '```', '~~~\n```` x\n   `````']) {
      const lines = bodyOf(typed).slice(HEAD.length).split('\n');
      const opening = /^`+/.exec(lines[0] ?? '')?.[0] ?? '';
      expect(opening.length).toBeGreaterThanOrEqual(3);
      expect(lines.at(-1)).toBe(opening);
      for (const line of lines.slice(1, -1)) {
        expect(line.includes(opening)).toBe(false);
      }
    }
  });
});

describe('fencedBlock', () => {
  it('fences a text with three backticks, or one more than its longest run of them', () => {
    expect(fencedBlock('plain')).toBe('```\nplain\n```');
    expect(fencedBlock('a `b` c', 'text')).toBe('```text\na `b` c\n```');
    expect(fencedBlock('a ``` b')).toBe('````\na ``` b\n````');
    expect(fencedBlock('`````')).toBe('``````\n`````\n``````');
    expect(fencedBlock('')).toBe('```\n\n```');
  });
});
