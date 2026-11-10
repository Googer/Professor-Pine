import type { IssueGateway, IssueOutcome, NewIssue } from '../../src/services/issue-gateway.js';

/**
 * GitHub's issues as a test wants them: nothing leaves the process. Every issue is recorded in
 * `opened` and answered with the next number, unless `failing` gives the answer of a failure.
 * Like the real one it never throws and never answers in the same turn of the event loop.
 */
export class FakeIssues implements IssueGateway {
  enabled = true;
  failing: Extract<IssueOutcome, { ok: false }> | undefined;
  readonly opened: NewIssue[] = [];
  private next = 1;

  open(issue: NewIssue): Promise<IssueOutcome> {
    const answer: IssueOutcome = this.failing ?? { ok: true, number: this.next };
    if (answer.ok) {
      this.opened.push(issue);
      this.next += 1;
    }
    return new Promise((resolve) => {
      setImmediate(() => {
        resolve(answer);
      });
    });
  }
}
