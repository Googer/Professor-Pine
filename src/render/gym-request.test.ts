import { describe, expect, it } from 'vitest';
import { MAX_ISSUE_TITLE } from '../services/issue-gateway.js';
import { gymRequestIssue, noGitHubMentions } from './gym-request.js';

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
      body: 'Request from `Alice` in `Pinewood Raids`:\n\nGone since May\n\nSee the photo',
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
    expect(issue.body).toBe('Request from someone in a server:\n\nGone');
  });
});
