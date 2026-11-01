import { tidyLine } from '../domain/gyms/gym-text.js';
import { codePointsOf, MAX_ISSUE_TITLE, type NewIssue } from '../services/issue-gateway.js';

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
 * member's words in the body under who sent them from where, and the gym's number as its
 * label. The title is text on GitHub (no Markdown): the name is only tidied of control and
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
    body:
      `Request from ${asCode(request.memberName, 'someone')} in ` +
      `${asCode(request.serverName, 'a server')}:\n\n${noGitHubMentions(request.text)}`,
    labels: [String(gym.id)],
  };
}
