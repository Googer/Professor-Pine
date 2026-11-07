/**
 * A character that shows: no white space, no character Unicode says to ignore when it cannot
 * be drawn (the Hangul fillers, the variation selectors, the joiners), no combining mark (it
 * shows only on a character before it) and no blank braille pattern (U+2800, drawn as nothing).
 */
const VISIBLE = /[^\s\p{Default_Ignorable_Code_Point}\p{M}\u2800]/u;

/**
 * A member's short text (a name, a group's label) as it is kept: on one line, runs of white space
 * as one space, the ends trimmed, and without control and format characters (a zero-width space
 * is nothing, and a direction override would turn a title around). The zero-width joiner stays:
 * emoji are built with it. The empty text when nothing in it shows (`VISIBLE`): a name of Hangul
 * fillers or blank braille looks like no name at all.
 */
export function tidyShortText(text: string): string {
  const tidy = text
    .replace(/\s+/g, ' ')
    .replace(/(?!\u200d)[\p{Cc}\p{Cf}]/gu, '')
    .replace(/ +/g, ' ')
    .trim();
  return VISIBLE.test(tidy) ? tidy : '';
}
