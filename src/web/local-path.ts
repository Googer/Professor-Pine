/**
 * A page of a server here: `/s/<snowflake>`, then segments of letters, digits, `.`, `_`, `~`
 * and `-` (no `..`), no query, no fragment, at most 200 characters.
 */
const SERVER_PAGE = /^\/s\/\d{15,20}(?:\/(?!\.\.?(?:\/|$))[A-Za-z0-9._~-]+)*\/?$/;
const MAX_LENGTH = 200;
/** The page of the Wayfarer export tool (plan 8W-P), not of a server: taken only exactly. */
const TOOL_PAGE = '/userscript';
/** The top page (plan 8M-14): its servers or the login; taken only exactly. */
const TOP_PAGE = '/';

/**
 * The path a login may return to (`next`), or undefined: only a page of a server here, the
 * tool's page `/userscript` or the top page `/` exactly, never an address that a browser would take to another site
 * (`//host`, `/\host`, a scheme) or anything with a query, an escape or a line break in it. An
 * open redirect is a finding.
 */
export function localPath(path: unknown): string | undefined {
  if (typeof path !== 'string' || path.length > MAX_LENGTH) return undefined;
  return path === TOP_PAGE || path === TOOL_PAGE || SERVER_PAGE.test(path) ? path : undefined;
}
