/**
 * What a moderator may type for a gym. The typed limits are what the form allows; the stored
 * limit is the width of the columns `Gym.name` and `GymMeta.nickname`, which hold the text
 * HTML-entity-encoded (an apostrophe is six characters there, a letter outside Latin-1 more).
 */
export const GYM_TEXT_LIMITS = {
  name: 100,
  nickname: 100,
  description: 1_000,
  /** Shown in every raid post at the gym. */
  notice: 500,
  /** One keyword. */
  keyword: 50,
  /** How many keywords a gym has at most. */
  keywords: 30,
  /** `varchar(255)`, of the encoded text. */
  stored: 255,
} as const;

/** The longest line of keywords a form takes: every keyword at its longest, with the commas. */
export const KEYWORDS_LINE = GYM_TEXT_LIMITS.keywords * (GYM_TEXT_LIMITS.keyword + 2);

/** The texts of a gym a moderator sets. */
export interface GymTexts {
  name: string;
  nickname: string | null;
  description: string | null;
  notice: string | null;
  keywords: string[];
}

export type GymTextField = keyof GymTexts;

/** The fields in the order a form shows them. */
export const GYM_TEXT_FIELDS: readonly GymTextField[] = [
  'name',
  'nickname',
  'description',
  'notice',
  'keywords',
];

/**
 * Why a text cannot be a gym's. `blank`: a name of nothing. `too-long`: longer than may be
 * typed, by `by` characters. `too-long-stored`: short enough as typed, but its stored form
 * (entity-encoded) is `by` characters wider than the column. `keyword-too-long`: the keyword
 * `keyword` is `by` characters too long. `too-many-keywords`: `by` keywords too many.
 */
export type GymTextProblem =
  | { field: 'name'; kind: 'blank' }
  | { field: GymTextField; kind: 'too-long'; by: number; limit: number }
  | { field: 'name' | 'nickname'; kind: 'too-long-stored'; by: number }
  | { field: 'keywords'; kind: 'keyword-too-long'; keyword: string; by: number; limit: number }
  | { field: 'keywords'; kind: 'too-many-keywords'; by: number; limit: number };

/**
 * Whether an invisible formatting character is one that text is written with: the zero-width
 * joiner and non-joiner, and the tag characters of the flags of England, Scotland and Wales.
 */
function writtenWith(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code === 0x200c || code === 0x200d || (code >= 0xe0020 && code <= 0xe007f);
}

/**
 * A text of one line as it is kept: control characters and line breaks are white space, runs
 * of white space are one space, none at either end. Other invisible formatting characters go,
 * but for those that text is written with: the zero-width joiner (emoji are built with it), the
 * non-joiner (words of Persian and of Indic scripts) and the tag characters (the flags of
 * England, Scotland and Wales).
 */
export function tidyLine(text: string): string {
  return text
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .replace(/\p{Cf}/gu, (character) => (writtenWith(character) ? character : ''))
    .replace(/ +/g, ' ')
    .trim();
}

/**
 * A text of several lines as it is kept: each line tidied like `tidyLine`, at most one empty
 * line between two, none at either end.
 */
export function tidyParagraph(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map(tidyLine)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A text that may be left out: null for nothing. */
function orNull(text: string): string | null {
  return text === '' ? null : text;
}

/**
 * The keywords a text names, separated by commas (or line breaks): lower case, tidied, each
 * once, in the order they were typed; empty ones are dropped.
 */
export function parseKeywords(text: string): string[] {
  const keywords = text
    .split(/[,\n\r]/)
    .map((keyword) => tidyLine(keyword).toLowerCase())
    .filter((keyword) => keyword !== '');
  return [...new Set(keywords)];
}

/** The keywords as one line a form shows, and `parseKeywords` reads back. */
export function keywordsLine(keywords: readonly string[]): string {
  return keywords.join(', ');
}

/** What a moderator typed into the fields of a form, tidied; a field that is not there is left out. */
export function tidyGymTexts(typed: {
  name?: string;
  nickname?: string;
  description?: string;
  notice?: string;
  keywords?: string;
}): Partial<GymTexts> {
  return {
    ...(typed.name === undefined ? {} : { name: tidyLine(typed.name) }),
    ...(typed.nickname === undefined ? {} : { nickname: orNull(tidyLine(typed.nickname)) }),
    ...(typed.description === undefined
      ? {}
      : { description: orNull(tidyParagraph(typed.description)) }),
    ...(typed.notice === undefined ? {} : { notice: orNull(tidyParagraph(typed.notice)) }),
    ...(typed.keywords === undefined ? {} : { keywords: parseKeywords(typed.keywords) }),
  };
}

/**
 * What is wrong with these texts (already tidied), in the order of the form; empty when they
 * may be saved. `storedLength` gives the length of a text as the database holds it: the domain
 * does not know the encoding, the repository does (`storedTextLength`).
 */
export function gymTextProblems(
  texts: Partial<GymTexts>,
  storedLength: (text: string) => number,
): GymTextProblem[] {
  const problems: GymTextProblem[] = [];
  const typed = (field: 'name' | 'nickname' | 'description' | 'notice'): boolean => {
    const text = texts[field];
    const limit = GYM_TEXT_LIMITS[field];
    if (typeof text !== 'string' || text.length <= limit) return false;
    problems.push({ field, kind: 'too-long', by: text.length - limit, limit });
    return true;
  };
  const stored = (field: 'name' | 'nickname'): void => {
    const text = texts[field];
    if (typeof text !== 'string') return;
    const by = storedLength(text) - GYM_TEXT_LIMITS.stored;
    if (by > 0) problems.push({ field, kind: 'too-long-stored', by });
  };
  if (texts.name !== undefined) {
    if (texts.name === '') problems.push({ field: 'name', kind: 'blank' });
    else if (!typed('name')) stored('name');
  }
  if (!typed('nickname')) stored('nickname');
  typed('description');
  typed('notice');
  if (texts.keywords !== undefined) {
    const { keyword: limit, keywords: most } = GYM_TEXT_LIMITS;
    for (const keyword of texts.keywords) {
      if (keyword.length > limit) {
        problems.push({
          field: 'keywords',
          kind: 'keyword-too-long',
          keyword,
          by: keyword.length - limit,
          limit,
        });
      }
    }
    if (texts.keywords.length > most) {
      problems.push({
        field: 'keywords',
        kind: 'too-many-keywords',
        by: texts.keywords.length - most,
        limit: most,
      });
    }
  }
  return problems;
}

function sameKeywords(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((keyword, index) => keyword === b[index]);
}

/**
 * The fields a moderator changed in a form: those of `sent` that differ from what the form was
 * filled with (`shown`). Only they are written, so that two moderators who each change another
 * field of one gym do not undo each other. A field the form did not have is not in `sent`.
 */
export function changedGymTexts(
  shown: Partial<GymTexts>,
  sent: Partial<GymTexts>,
): Partial<GymTexts> {
  const changed: Partial<GymTexts> = {};
  if (sent.name !== undefined && sent.name !== shown.name) changed.name = sent.name;
  if (sent.nickname !== undefined && sent.nickname !== shown.nickname) {
    changed.nickname = sent.nickname;
  }
  if (sent.description !== undefined && sent.description !== shown.description) {
    changed.description = sent.description;
  }
  if (sent.notice !== undefined && sent.notice !== shown.notice) changed.notice = sent.notice;
  if (sent.keywords !== undefined && !sameKeywords(sent.keywords, shown.keywords ?? [])) {
    changed.keywords = sent.keywords;
  }
  return changed;
}

/**
 * What a form shows for each field of a gym, and which fields it cannot show: a text longer
 * than the form's field allows would come back cut and be saved cut, so that field is left out
 * (`tooLong`) and stays as it is. `shown` holds the texts as the form's fields have them
 * (tidied, so that sending the form back untouched changes nothing).
 */
export function gymFormTexts(gym: GymTexts): { shown: Partial<GymTexts>; tooLong: GymTextField[] } {
  const all: GymTexts = {
    name: tidyLine(gym.name),
    nickname: orNull(tidyLine(gym.nickname ?? '')),
    description: orNull(tidyParagraph(gym.description ?? '')),
    notice: orNull(tidyParagraph(gym.notice ?? '')),
    keywords: parseKeywords(keywordsLine(gym.keywords)),
  };
  const lengths: Record<GymTextField, [number, number]> = {
    name: [all.name.length, GYM_TEXT_LIMITS.name],
    nickname: [all.nickname?.length ?? 0, GYM_TEXT_LIMITS.nickname],
    description: [all.description?.length ?? 0, GYM_TEXT_LIMITS.description],
    notice: [all.notice?.length ?? 0, GYM_TEXT_LIMITS.notice],
    keywords: [keywordsLine(all.keywords).length, KEYWORDS_LINE],
  };
  const tooLong = GYM_TEXT_FIELDS.filter((field) => lengths[field][0] > lengths[field][1]);
  const shown: Partial<GymTexts> = { ...all };
  for (const field of tooLong) delete shown[field];
  return { shown, tooLong };
}
