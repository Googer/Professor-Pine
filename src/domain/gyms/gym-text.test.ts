import { describe, expect, it } from 'vitest';
import {
  changedGymTexts,
  GYM_TEXT_LIMITS,
  gymFormTexts,
  gymTextProblems,
  keywordsLine,
  KEYWORDS_LINE,
  parseKeywords,
  tidyGymTexts,
  tidyLine,
  tidyParagraph,
  type GymTexts,
} from './gym-text.js';

/** As long as typed: for texts whose stored form is no wider. */
const asTyped = (text: string): number => text.length;
/** An apostrophe is six characters once stored, as `he.encode` writes it. */
const encoded = (text: string): number => text.replace(/'/g, '&#x27;').length;

describe('tidyLine', () => {
  it('makes one line with single spaces of whatever was typed', () => {
    expect(tidyLine('  Big \t Fountain\r\n by the\u00a0lake ')).toBe('Big Fountain by the lake');
    expect(tidyLine('\n\n')).toBe('');
  });

  it('drops invisible formatting characters but keeps the joiner of emoji', () => {
    expect(tidyLine('Big\u202e Fountain\u200b')).toBe('Big Fountain');
    expect(tidyLine('Family \u{1f468}\u200d\u{1f467}')).toBe('Family \u{1f468}\u200d\u{1f467}');
    expect(tidyLine('a\u0000b')).toBe('a b');
    // The non-joiner belongs to words of Persian and of Indic scripts; the tag characters make
    // the flags of England, Scotland and Wales.
    expect(tidyLine('\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645')).toBe(
      '\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645',
    );
    const scotland = '\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}';
    expect(tidyLine(`Thistle ${scotland}`)).toBe(`Thistle ${scotland}`);
  });
});

describe('tidyParagraph', () => {
  it('keeps the lines, tidies each and allows one empty line between two', () => {
    expect(tidyParagraph('  Park  closes at dusk. \r\n\r\n\r\n\r\n  Use the  east gate.\n')).toBe(
      'Park closes at dusk.\n\nUse the east gate.',
    );
    expect(tidyParagraph(' \n \n')).toBe('');
  });
});

describe('parseKeywords', () => {
  it('reads lower-case keywords, each once, in the order typed', () => {
    expect(parseKeywords('Plaza,  Town  Square ,plaza,, FOUNTAIN')).toEqual([
      'plaza',
      'town square',
      'fountain',
    ]);
  });

  it('takes a line break for a comma and nothing for no keywords', () => {
    expect(parseKeywords('plaza\nsquare')).toEqual(['plaza', 'square']);
    expect(parseKeywords(' , ,')).toEqual([]);
    expect(parseKeywords('')).toEqual([]);
  });

  it('reads back the line it is shown as', () => {
    const keywords = ['plaza', 'town square'];
    expect(keywordsLine(keywords)).toBe('plaza, town square');
    expect(parseKeywords(keywordsLine(keywords))).toEqual(keywords);
  });
});

describe('tidyGymTexts', () => {
  it('tidies every field that was sent and leaves out the others', () => {
    expect(
      tidyGymTexts({
        name: ' Big  Fountain ',
        nickname: '  ',
        description: 'By the\n\n\n\nlake',
        keywords: 'Plaza, plaza',
      }),
    ).toEqual({
      name: 'Big Fountain',
      nickname: null,
      description: 'By the\n\nlake',
      keywords: ['plaza'],
    });
    expect(tidyGymTexts({ notice: ' \n ' })).toEqual({ notice: null });
  });
});

describe('gymTextProblems', () => {
  it('finds nothing wrong with ordinary texts', () => {
    const texts: GymTexts = {
      name: 'Big Fountain',
      nickname: null,
      description: 'By the lake',
      notice: null,
      keywords: ['plaza'],
    };
    expect(gymTextProblems(texts, asTyped)).toEqual([]);
    expect(gymTextProblems({}, asTyped)).toEqual([]);
  });

  it('refuses a name of nothing', () => {
    expect(gymTextProblems({ name: '' }, asTyped)).toEqual([{ field: 'name', kind: 'blank' }]);
  });

  it('says by how much a text is longer than may be typed', () => {
    const problems = gymTextProblems(
      {
        name: 'n'.repeat(GYM_TEXT_LIMITS.name + 3),
        nickname: 'k'.repeat(GYM_TEXT_LIMITS.nickname + 1),
        description: 'd'.repeat(GYM_TEXT_LIMITS.description + 20),
        notice: 'x'.repeat(GYM_TEXT_LIMITS.notice + 7),
      },
      asTyped,
    );
    expect(problems).toEqual([
      { field: 'name', kind: 'too-long', by: 3, limit: 100 },
      { field: 'nickname', kind: 'too-long', by: 1, limit: 100 },
      { field: 'description', kind: 'too-long', by: 20, limit: 1_000 },
      { field: 'notice', kind: 'too-long', by: 7, limit: 500 },
    ]);
  });

  it('says by how much a name or nickname is too wide once stored', () => {
    // 60 apostrophes are 60 characters typed and 360 stored.
    const quotes = "'".repeat(60);
    expect(gymTextProblems({ name: quotes, nickname: quotes }, encoded)).toEqual([
      { field: 'name', kind: 'too-long-stored', by: 105 },
      { field: 'nickname', kind: 'too-long-stored', by: 105 },
    ]);
    // Exactly as wide as the column is fine.
    const fits = "'".repeat(42) + 'abc';
    expect(encoded(fits)).toBe(255);
    expect(gymTextProblems({ name: fits }, encoded)).toEqual([]);
    // A description and a notice are in columns without that limit.
    expect(gymTextProblems({ description: quotes, notice: quotes }, encoded)).toEqual([]);
  });

  it('names a keyword that is too long, and says how many are too many', () => {
    const long = 'k'.repeat(GYM_TEXT_LIMITS.keyword + 2);
    expect(gymTextProblems({ keywords: ['plaza', long] }, asTyped)).toEqual([
      { field: 'keywords', kind: 'keyword-too-long', keyword: long, by: 2, limit: 50 },
    ]);
    const many = Array.from({ length: GYM_TEXT_LIMITS.keywords + 4 }, (_, i) => `k${i}`);
    expect(gymTextProblems({ keywords: many }, asTyped)).toEqual([
      { field: 'keywords', kind: 'too-many-keywords', by: 4, limit: 30 },
    ]);
  });
});

describe('changedGymTexts', () => {
  const shown: GymTexts = {
    name: 'Big Fountain',
    nickname: 'The Splash',
    description: null,
    notice: 'Closes at dusk',
    keywords: ['plaza', 'square'],
  };

  it('gives nothing for a form that came back as it was filled', () => {
    expect(changedGymTexts(shown, { ...shown, keywords: [...shown.keywords] })).toEqual({});
  });

  it('gives only the fields that differ', () => {
    expect(
      changedGymTexts(shown, { ...shown, nickname: null, description: 'By the lake' }),
    ).toEqual({ nickname: null, description: 'By the lake' });
    expect(changedGymTexts(shown, { ...shown, keywords: ['square', 'plaza'] })).toEqual({
      keywords: ['square', 'plaza'],
    });
    expect(changedGymTexts(shown, { ...shown, keywords: [] })).toEqual({ keywords: [] });
  });

  it('does not take a field the form did not have for emptied', () => {
    const { notice: _notice, ...withoutNotice } = shown;
    expect(changedGymTexts(withoutNotice, { name: 'Bigger Fountain' })).toEqual({
      name: 'Bigger Fountain',
    });
  });
});

describe('gymFormTexts', () => {
  const gym: GymTexts = {
    name: 'Big  Fountain',
    nickname: null,
    description: 'By the lake',
    notice: null,
    keywords: ['plaza'],
  };

  it('shows every field of an ordinary gym, tidied', () => {
    const { shown, tooLong } = gymFormTexts(gym);
    expect(tooLong).toEqual([]);
    expect(shown).toEqual({ ...gym, name: 'Big Fountain' });
    // A form sent back untouched changes nothing, also where tidying changed the text.
    expect(
      changedGymTexts(
        shown,
        tidyGymTexts({
          name: 'Big Fountain',
          nickname: '',
          description: 'By the lake',
          notice: '',
          keywords: 'plaza',
        }),
      ),
    ).toEqual({});
  });

  it('leaves a text out of the form that is longer than its field', () => {
    const { shown, tooLong } = gymFormTexts({
      ...gym,
      name: 'n'.repeat(GYM_TEXT_LIMITS.name + 1),
      notice: 'x'.repeat(GYM_TEXT_LIMITS.notice + 1),
      keywords: Array.from({ length: 40 }, (_, i) => `${'k'.repeat(48)}${i}`),
    });
    expect(tooLong).toEqual(['name', 'notice', 'keywords']);
    expect(shown).toEqual({ nickname: null, description: 'By the lake' });
    expect(KEYWORDS_LINE).toBe(1_560);
  });

  it('shows a text that is exactly as long as its field', () => {
    const name = 'n'.repeat(GYM_TEXT_LIMITS.name);
    expect(gymFormTexts({ ...gym, name }).shown.name).toBe(name);
  });
});
