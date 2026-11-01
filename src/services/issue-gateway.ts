import { z } from 'zod';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';
import { readLimitedJson, type LimitedResponse } from './limited-json.js';

/** An issue to open: GitHub takes the title as text and renders the body as Markdown. */
export interface NewIssue {
  title: string;
  body: string;
  labels: readonly string[];
}

/**
 * What came of opening an issue: its number when the answer could be read (an issue GitHub
 * created is open, whatever else its answer said). `disabled`: no token or repository is
 * configured. `refused`: GitHub answered with any status but 201 (`status`), also a redirect
 * (a renamed or moved repository), which is not followed. `timeout`,
 * `unreachable`: no answer came, and nothing is known of the issue.
 */
export type IssueOutcome =
  | { ok: true; number: number | undefined }
  | { ok: false; reason: 'disabled' | 'refused' | 'timeout' | 'unreachable'; status?: number };

/**
 * Where `/request` sends what members ask of the gym list: the issues of a GitHub repository.
 * Nothing here throws: a failure is an answer. Tests use `FakeIssues` (`test/support/issues.ts`);
 * nothing in a test touches the network.
 */
export interface IssueGateway {
  /** False when no token or repository is configured. */
  readonly enabled: boolean;
  open(issue: NewIssue): Promise<IssueOutcome>;
}

/** What is used of GitHub's answer: read with a byte limit (`readLimitedJson`). */
export type IssueResponse = LimitedResponse;

export type IssueFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    redirect: 'manual';
    signal: AbortSignal;
  },
) => Promise<IssueResponse>;

export interface GitHubIssuesOptions {
  /** `GITHUB_TOKEN`: a secret, only ever in the request's header. */
  token: string | undefined;
  /** `GITHUB_REPO`, `owner/repo`. */
  repo: string | undefined;
  fetch: IssueFetch;
  log: Logger;
  /** How long opening an issue may take. Default ten seconds. */
  timeoutMs?: number;
}

/** GitHub's API; the version its documentation names for this request. */
const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
/** GitHub refuses a title of more characters than this. */
export const MAX_ISSUE_TITLE = 256;

/** The characters of a text, whole: a cut between them never leaves half of one. */
export function codePointsOf(text: string): string[] {
  return [...text];
}

const createdIssue = z.object({ number: z.number().int().positive() });

/**
 * How much of GitHub's answer is read: an issue's or a refusal's JSON is a few kilobytes. The
 * request's timeout (`timeoutMs`) also ends a read that takes too long.
 */
const MAX_ANSWER_BYTES = 16 * 1024;

/** GitHub's answer as JSON, or undefined when it was too large or could not be read. */
async function answerOf(response: IssueResponse): Promise<unknown> {
  const read = await readLimitedJson(response, MAX_ANSWER_BYTES).catch(() => undefined);
  return read?.ok ? read.value : undefined;
}

/**
 * What GitHub's message of a refusal says, as a word of Pine's own for the log: the message
 * itself is never logged (it can quote the request).
 */
const REFUSALS: readonly (readonly [RegExp, string])[] = [
  [/archived/i, 'archived'],
  [/bad credentials/i, 'bad-credentials'],
  [/rate limit/i, 'rate-limited'],
  [/not accessible|permission/i, 'no-permission'],
  [/not found/i, 'not-found'],
  [/issues are disabled|issues has been disabled/i, 'issues-disabled'],
  [/validation failed/i, 'invalid'],
];

const refusalMessage = z.object({ message: z.string().max(1_000) });

export function refusalKind(body: unknown): string {
  const parsed = refusalMessage.safeParse(body);
  if (!parsed.success) return 'unknown';
  return REFUSALS.find(([pattern]) => pattern.test(parsed.data.message))?.[1] ?? 'other';
}

/**
 * Opens issues through GitHub's REST API (`POST /repos/<repo>/issues`) with a token. The token
 * is in the `Authorization` header and nowhere else: never logged, never in a sentence. What a
 * failure says is logged by its status and a word for its kind (`refusalKind`), never GitHub's
 * message (it can quote the request).
 */
export class GitHubIssues implements IssueGateway {
  private readonly timeoutMs: number;

  constructor(private readonly options: GitHubIssuesOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  get enabled(): boolean {
    return Boolean(this.options.token) && Boolean(this.options.repo);
  }

  async open(issue: NewIssue): Promise<IssueOutcome> {
    const { token, repo, log } = this.options;
    if (!this.enabled || token === undefined || repo === undefined) {
      return { ok: false, reason: 'disabled' };
    }
    let response: IssueResponse;
    try {
      response = await this.options.fetch(`${GITHUB_API}/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Professor-Pine',
          'X-GitHub-Api-Version': API_VERSION,
        },
        body: JSON.stringify({
          title: codePointsOf(issue.title).slice(0, MAX_ISSUE_TITLE).join(''),
          body: issue.body,
          labels: issue.labels,
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const timeout = err instanceof Error && err.name === 'TimeoutError';
      log.warn(
        { reason: timeout ? 'timeout' : failureReason(err) },
        'could not open an issue on GitHub',
      );
      return { ok: false, reason: timeout ? 'timeout' : 'unreachable' };
    }
    if (response.status !== 201) {
      const refusal = refusalKind(await answerOf(response));
      log.warn({ status: response.status, refusal }, 'GitHub refused to open an issue');
      return { ok: false, reason: 'refused', status: response.status };
    }
    const parsed = createdIssue.safeParse(await answerOf(response));
    const number = parsed.success ? parsed.data.number : undefined;
    log.info({ issue: number }, 'opened an issue on GitHub');
    return { ok: true, number };
  }
}
