/**
 * The Pine Wayspot export tool's file as the owner's instance serves it (plan 8W-P): built by the
 * private repository with the placeholders `{{PINE_META_URL}}` and `{{PINE_SCRIPT_URL}}` in
 * its `==UserScript==` header, which the server fills with the addresses of each admin's key,
 * and its `CHANGELOG.md` (`## <version>` headings, newest first). Pure: the reading of the
 * folder is `WayspotToolFiles` (`src/services/wayspot-tool.ts`).
 */

/** The tool file's name, in the folder and in its addresses. */
export const TOOL_FILE = 'pine-wayspot-export.user.js';
/** The header block's name in its addresses: what Tampermonkey asks for an update. */
export const META_FILE = 'pine-wayspot-export.meta.js';
/** The changelog beside the tool file. */
export const CHANGELOG_FILE = 'CHANGELOG.md';
/** How many of the changelog's newest entries the page shows. */
export const CHANGELOG_SHOWN = 3;

/** The placeholders of the header that the server fills. */
const META_PLACEHOLDER = '{{PINE_META_URL}}';
const SCRIPT_PLACEHOLDER = '{{PINE_SCRIPT_URL}}';

/** A version as `@version` may give it: digits, letters, dots, `+` and `-`, up to 40. */
const VERSION = /^[0-9][0-9A-Za-z.+-]{0,39}$/;
/** A byte order mark an editor may have put first: not part of the header's first line. */
const BYTE_ORDER_MARK = 0xfeff;

/** A tool file that reads: its header block (with its last line end), the rest, its version. */
export interface ToolFile {
  header: string;
  body: string;
  version: string;
}

export type ToolFileRead = { ok: true; tool: ToolFile } | { ok: false; reason: string };

/**
 * Reads a tool file: it must open with a complete `// ==UserScript==` … `// ==/UserScript==`
 * block (Windows line ends read as plain ones) that gives `@version` and holds both
 * placeholders (the serve build); anything else is refused with a reason for the log.
 */
export function readToolFile(text: string): ToolFileRead {
  const unmarked = text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text;
  const lines = unmarked.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '// ==UserScript==') {
    return { ok: false, reason: 'it does not open with // ==UserScript==' };
  }
  const end = lines.findIndex((line) => line.trim() === '// ==/UserScript==');
  if (end < 0) return { ok: false, reason: 'its header block has no // ==/UserScript==' };
  const headerLines = lines.slice(0, end + 1);
  const version = headerLines
    .map((line) => /^\/\/\s*@version\s+(\S+)\s*$/.exec(line)?.[1])
    .find((found) => found !== undefined);
  if (version === undefined) return { ok: false, reason: 'its header block has no @version' };
  if (!VERSION.test(version)) return { ok: false, reason: 'its @version is no version' };
  // The build for installing by hand has addresses of its own (none): served, it would never
  // update from the key's link.
  for (const placeholder of [SCRIPT_PLACEHOLDER, META_PLACEHOLDER]) {
    if (!headerLines.some((line) => line.includes(placeholder))) {
      return { ok: false, reason: `its header has no ${placeholder}: deploy the serve build` };
    }
  }
  return {
    ok: true,
    tool: {
      header: `${headerLines.join('\n')}\n`,
      body: lines.slice(end + 1).join('\n'),
      version,
    },
  };
}

/** The two addresses of one key: the header block's and the tool's. */
export interface ToolUrls {
  meta: string;
  script: string;
}

/** The header block with its placeholders filled: the body is never touched. */
function filledHeader(tool: ToolFile, urls: ToolUrls): string {
  return tool.header
    .split(META_PLACEHOLDER)
    .join(urls.meta)
    .split(SCRIPT_PLACEHOLDER)
    .join(urls.script);
}

/** The tool as one key is given it: every copy names its own addresses. */
export function servedScript(tool: ToolFile, urls: ToolUrls): string {
  return filledHeader(tool, urls) + tool.body;
}

/** The header block alone, filled as the tool's: what Tampermonkey reads to look for an update. */
export function servedMeta(tool: ToolFile, urls: ToolUrls): string {
  return filledHeader(tool, urls);
}

/** One version of the changelog: its heading's version and what it says, as text. */
export interface ChangelogEntry {
  version: string;
  text: string;
}

/** The `CHANGELOG_SHOWN` newest entries of a changelog (`## <version>` headings, newest first). */
export function changelogEntries(text: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: { version: string; lines: string[] } | undefined;
  const close = () => {
    if (current) entries.push({ version: current.version, text: current.lines.join('\n').trim() });
  };
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^##\s+(\S.*?)\s*$/.exec(line);
    if (heading?.[1] !== undefined) {
      close();
      current = { version: heading[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  close();
  return entries.slice(0, CHANGELOG_SHOWN);
}
