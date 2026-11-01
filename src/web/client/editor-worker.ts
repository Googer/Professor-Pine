import { CoverageChecker, type CoverageRequest } from './coverage-check.js';

/**
 * The region editor's worker (plan 8M-2): works out the overlaps and gaps of the staged regions
 * (`CoverageChecker`) off the page's thread, which stays free for drawing. A script of Pine's,
 * so the CSP's `script-src 'self'` lets it run.
 */
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<CoverageRequest>) => void) | null;
  postMessage(message: unknown): void;
};
const checker = new CoverageChecker();
scope.onmessage = (event) => {
  const answer = checker.handle(event.data);
  if (answer) scope.postMessage(answer);
};
