import { plain } from '../render/text.js';
import type { OwnerAlerts } from './owner-alerts.js';

/** The most of a text the owner is sent; past it, the text is cut. */
export const TELL_LIMIT = 1_000;

/** Where the command's own lines go: what it did, and what went wrong. */
export interface TellOutput {
  say(line: string): void;
  warn(line: string): void;
}

/**
 * `./pine tell-owner <text>`: the words given, joined by spaces, as one line of plain text to the
 * owner (`OWNER_ID`) through `OwnerAlerts`, as the watchdog's alerts go. For what runs on the host
 * beside the stack (the upload of the backups off the host, `scripts/host/offsite-upload.sh`),
 * which has no way of its own to Discord. Markdown and mentions arrive as typed; a text longer than
 * `TELL_LIMIT` is cut. The exit status: 0 told, 1 not told, 2 nothing to tell.
 */
export async function tellOwner(
  args: readonly string[],
  alerts: Pick<OwnerAlerts, 'send'> | undefined,
  out: TellOutput,
): Promise<number> {
  // Cut by characters (code points), before the escapes: never through an emoji's two halves,
  // never between a backslash and what it escapes.
  const given = Array.from(args.join(' ').trim());
  const text = plain(
    given.length > TELL_LIMIT ? `${given.slice(0, TELL_LIMIT - 1).join('')}…` : given.join(''),
  );
  if (text === '') {
    out.warn('There is nothing to tell. Usage: tell-owner <text>');
    return 2;
  }
  if (!alerts) {
    out.warn('The owner cannot be told: DISCORD_TOKEN and OWNER_ID must be set (in .env).');
    return 1;
  }
  if ((await alerts.send('host', text)) !== 'sent') {
    out.warn(
      "The owner could not be told: the log line 'could not alert the owner' above says why.",
    );
    return 1;
  }
  out.say('The owner was told.');
  return 0;
}
