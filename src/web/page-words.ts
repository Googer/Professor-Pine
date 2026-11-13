import { clockTime } from '../domain/web/clock.js';
import { relativeStamp } from '../render/duration-words.js';
import { unplain } from '../render/text.js';

/** A timestamp of Discord's (`<t:1760000000:t>`), which a page cannot show. */
const TIMESTAMP = /<t:(-?\d+)(?::([tTdDfFR]))?>/gu;

/**
 * An escape (`\_`, `\\`: what members wrote is escaped), a masked link of the bot's
 * (`[name](<address>)`, its text with its own escapes in the first group), or the bot's own
 * markdown: code spans and bold. Read in one pass from the left, so that the backtick after a
 * typed backslash (`\\`) is the bot's and not escaped by it, and a bracket a member escaped
 * begins no link.
 */
const ESCAPE_LINK_OR_MARKDOWN = /\\.|\[((?:\\.|[^\]\\])*)\]\((?:<[^>\s]*>|[^)\s]*)\)|`|\*\*/gsu;

/**
 * A list mark of the bot's at the start of a line (`- ` or `* `, plan 8M-13, A1: a research
 * report of several stops). A member's own arrives escaped (`\- `, `plain()`'s `bulletedList`)
 * and is no mark here. The page writes a bullet (`• `) in its place (fix round 1, R1-2), so that
 * the items still read as a list.
 */
const LIST_MARK = /^[ \t]*[-*][ \t]+/gmu;

/**
 * The words of a command as the live map shows them, as plain text (plans 8M-4, 8M-5): Discord's
 * timestamps as clock times in the server's zone (`clockTime`, as the page writes times) and a
 * relative one as how long until then or since as Discord's client says it (`relativeStamp`, plan
 * 8M-11A: "in 5 hours", "in a day"; in English, the bot's language), the
 * bot's masked links as their text (the page links nothing of a command's words), the bot's own
 * markdown taken out and its list marks at the starts of lines written as bullets (escapes kept
 * as they are; each item stays on its own line), then the escapes of what members and feeds
 * wrote undone (`unplain`). Pure.
 */
export function pageWords(text: string, zone: string, now: number): string {
  return unplain(
    text
      .replace(TIMESTAMP, (_stamp, seconds: string, style: string | undefined) =>
        style === 'R'
          ? relativeStamp(Number(seconds) * 1000, now, 'en-US')
          : clockTime(Number(seconds) * 1000, zone, now),
      )
      .replace(LIST_MARK, '• ')
      .replace(ESCAPE_LINK_OR_MARKDOWN, (match, linked: string | undefined) =>
        match.startsWith('\\') ? match : (linked ?? ''),
      ),
  );
}
