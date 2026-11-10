import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  changelogEntries,
  CHANGELOG_FILE,
  readToolFile,
  TOOL_FILE,
  type ChangelogEntry,
  type ToolFile,
} from '../domain/script-access/tool-file.js';
import type { Logger } from '../log.js';

/**
 * Where the tool file is, from the bot's working folder: `wayspot-tool/` (in the image
 * `/app/wayspot-tool`, which the stack mounts read-only from `PINE_TOOL_DIR`).
 */
export const WAYSPOT_TOOL_DIR = 'wayspot-tool';

/** The tool as it is served: the file read, and the changelog's newest entries (none without one). */
export interface ServedTool extends ToolFile {
  changelog: ChangelogEntry[];
}

/** Where the web server gets the tool: undefined while there is none that reads. */
export interface ToolSource {
  read(): Promise<ServedTool | undefined>;
}

/** What a file was when it was last read: its times and size, and what it gave. */
interface Kept<T> {
  stamp: string;
  value: T;
}

/**
 * The times and size of a file, or undefined when it is not there (or cannot be looked at): its
 * change time too, which a `chmod` moves alone, so that a file made readable is read again.
 */
async function stampOf(file: string): Promise<string | undefined> {
  try {
    const found = await stat(file);
    return found.isFile() ? `${found.mtimeMs}:${found.ctimeMs}:${found.size}` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The tool file and its changelog in `wayspot-tool/` (plan 8W-P), read when asked and kept until
 * a file's modification or change time (or size) changes: a deploy renames a new file into
 * place, so the next request reads it. A tool file that does not read (no complete `==UserScript==` block, no
 * `@version`, no placeholders) or cannot be read is not served, and said once at warn per
 * version of the file; a missing one is the usual state of an instance that is not the owner's,
 * and said nothing of.
 */
export class WayspotToolFiles implements ToolSource {
  private readonly dir: string;
  private readonly log: Logger;
  private readonly readText: (file: string) => Promise<string>;
  private script: Kept<ToolFile | undefined> | undefined;
  private changelog: Kept<ChangelogEntry[]> | undefined;

  /** `readText` is for tests: a file that is there but cannot be read. */
  constructor(options: {
    dir?: string;
    log: Logger;
    readText?: (file: string) => Promise<string>;
  }) {
    this.dir = path.resolve(options.dir ?? WAYSPOT_TOOL_DIR);
    this.log = options.log;
    this.readText = options.readText ?? ((file) => readFile(file, 'utf8'));
  }

  async read(): Promise<ServedTool | undefined> {
    const tool = await this.readScript();
    if (!tool) return undefined;
    return { ...tool, changelog: await this.readChangelog() };
  }

  private async readScript(): Promise<ToolFile | undefined> {
    const file = path.join(this.dir, TOOL_FILE);
    const stamp = await stampOf(file);
    if (stamp === undefined) {
      this.script = undefined;
      return undefined;
    }
    if (this.script?.stamp === stamp) return this.script.value;
    let text: string;
    try {
      text = await this.readText(file);
    } catch (err) {
      // Kept under its stamp as a file that does not read: said once, read again once changed.
      this.log.warn({ err }, 'the Wayfarer export tool file could not be read');
      this.script = { stamp, value: undefined };
      return undefined;
    }
    const read = readToolFile(text);
    if (!read.ok) {
      this.log.warn(
        { reason: read.reason },
        'the Wayfarer export tool file does not read: it is not served',
      );
    }
    this.script = { stamp, value: read.ok ? read.tool : undefined };
    return this.script.value;
  }

  private async readChangelog(): Promise<ChangelogEntry[]> {
    const file = path.join(this.dir, CHANGELOG_FILE);
    const stamp = await stampOf(file);
    if (stamp === undefined) return [];
    if (this.changelog?.stamp === stamp) return this.changelog.value;
    try {
      this.changelog = { stamp, value: changelogEntries(await this.readText(file)) };
    } catch {
      return [];
    }
    return this.changelog.value;
  }
}
