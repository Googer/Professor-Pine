import { plainNoLinks } from './text.js';

/**
 * How many characters of a server's name a list of servers shows (the owner's DMs about a new
 * install's servers, `/operator servers list`): cut before it is escaped, so that twenty names
 * stay well within what one message holds however their staff named them.
 */
export const SERVER_NAME_CHARS = 40;

/**
 * A server's name as a list of servers shows it: cut to `SERVER_NAME_CHARS` (an ellipsis in the
 * place of the rest), then made plain and without links (`plainNoLinks`).
 */
export function serverNameShown(name: string): string {
  const chars = Array.from(name.trim());
  const cut =
    chars.length > SERVER_NAME_CHARS
      ? `${chars.slice(0, SERVER_NAME_CHARS - 1).join('')}…`
      : chars.join('');
  return plainNoLinks(cut);
}

/**
 * The guide to running one's own Pine (plan 19C-1): the repository's, named to a server this
 * Pine refuses. The address in angle brackets, so that Discord shows no preview of it (a preview
 * needs Embed Links, which a system channel may not give).
 */
export const OWN_PINE_GUIDE =
  'https://github.com/Googer/Professor-Pine/blob/master/docs/guides/new-instance.md';

/**
 * What a server that may not have this Pine is told in its system channel before Pine leaves it
 * (plan 19C-1; spec "Joining, the setup state, leaving"): plain text, naming nobody.
 */
export const PRIVATE_INSTANCE_TEXT =
  'This Pine is private: it serves only the servers its operators allow. To run Pine for your ' +
  `community, see <${OWN_PINE_GUIDE}>.`;
