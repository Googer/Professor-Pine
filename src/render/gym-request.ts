import type { V2Message } from '../discord/party-gateway.js';
import { tidyLine } from '../domain/gyms/gym-text.js';
import { codePointsOf, MAX_ISSUE_TITLE, type NewIssue } from '../services/issue-gateway.js';
import { fencedBlock, memberText, plain } from './text.js';
import { LIST_COLOUR, textMessage } from './v2.js';

/** A zero-width space: what breaks a mention or a reference on GitHub without showing. */
const BREAK = '\u200b';

/**
 * Text for GitHub that pings and links nothing there: GitHub renders the body of an issue as
 * Markdown, notifies whoever an `@name` names (a person or a team) and links `#12` to an issue
 * of the repository (as it does `GH-12`), so a zero-width space follows every `@` and `#` and
 * the `GH-` before a number. It also follows every `&`, because GitHub reads HTML references
 * (`&#64;`, `&commat;`) before it looks for mentions, and the `github` of `github.com/`, because
 * GitHub turns the address of an issue or a commit into a reference that shows in its timeline.
 * The text reads the same. Nothing else is escaped: GitHub shows what a member typed as they
 * typed it, and a backslash would show.
 */
export function noGitHubMentions(text: string): string {
  return text
    .replace(/[@#&]/g, `$&${BREAK}`)
    .replace(/\bGH-(?=\d)/gi, `$&${BREAK}`)
    .replace(/\bgithub(?=\.com\/)/gi, `$&${BREAK}`);
}

/**
 * A name in the body of an issue: as code (backticks taken out of it first), so that nothing in
 * it is read as Markdown, and pinging nobody; `fallback` when nothing is left of it (an empty
 * code span shows as backticks).
 */
function asCode(name: string, fallback: string): string {
  const text = name.replace(/`/g, '').trim();
  return text === '' ? fallback : `\`${noGitHubMentions(text)}\``;
}

/** What `/request` puts into an issue: who asked, from which server, about which gym. */
export interface GymRequest {
  gym: { id: number; name: string };
  /** The member's display name: no id of a member goes to GitHub. */
  memberName: string;
  serverName: string;
  /** What the member wrote, as typed. */
  text: string;
}

/**
 * The issue of a gym request (spec row 190): titled `Gym request: <name> (#<id>)`, with the
 * member's words in the body under who sent them from where, in a fenced block (`fencedBlock`:
 * GitHub renders the body as Markdown, and the words are a member's), and the gym's number as
 * its label. The title is text on GitHub (no Markdown): the name is only tidied of control and
 * direction characters (`tidyLine`), and cut (by whole characters) so that the number always
 * stays within GitHub's limit.
 */
export function gymRequestIssue(request: GymRequest): NewIssue {
  const { gym } = request;
  const prefix = 'Gym request: ';
  const suffix = ` (#${String(gym.id)})`;
  const room = MAX_ISSUE_TITLE - codePointsOf(prefix).length - codePointsOf(suffix).length;
  const whole = codePointsOf(tidyLine(gym.name) || 'Gym');
  const name = whole.length <= room ? whole.join('') : `${whole.slice(0, room - 1).join('')}…`;
  return {
    title: `${prefix}${name}${suffix}`,
    // The member's words as a block of text: GitHub renders nothing in it (plan 8Z-2), and the
    // breaks stay in it all the same, so that nothing hangs on the fence alone.
    body:
      `Request from ${asCode(request.memberName, 'someone')} in ` +
      `${asCode(request.serverName, 'a server')}:\n\n` +
      fencedBlock(noGitHubMentions(request.text), 'text'),
    labels: [String(gym.id)],
  };
}

/**
 * A gym request in the server's own moderators' bot lab (plan 19B-4: a server the instance's
 * repository does not serve), what the issue holds as a components-v2 message: the issue's title
 * as its heading, who sent it (`memberText`: a mention, which pings nobody, the message naming
 * nobody to ping), and the member's words quoted as text (`plain`: nothing in them renders or
 * pings). The server is the lab's own, so it is not named.
 */
export function gymRequestPost(
  request: Omit<GymRequest, 'serverName'> & { memberId: string },
): V2Message {
  const { gym } = request;
  return textMessage(LIST_COLOUR, [
    `### Gym request: ${plain(tidyLine(gym.name) || 'Gym')} (#${String(gym.id)})`,
    `From ${memberText({ id: request.memberId, name: request.memberName })}:`,
    `> ${plain(request.text)}`,
  ]);
}
