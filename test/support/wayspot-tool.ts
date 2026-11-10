import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CHANGELOG_FILE, TOOL_FILE } from '../../src/domain/script-access/tool-file.js';

/**
 * A tool file as the private repository's build writes it for the server, made small (never the
 * real tool's code): the header block with the placeholders of its addresses, and a body.
 */
export function toolText(version = '1.2.0'): string {
  return [
    '// ==UserScript==',
    '// @name         Pine Wayfarer export',
    `// @version      ${version}`,
    '// @match        https://wayfarer.example.test/*',
    '// @updateURL    {{PINE_META_URL}}',
    '// @downloadURL  {{PINE_SCRIPT_URL}}',
    '// ==/UserScript==',
    '"use strict";',
    '(() => { const seen = "{{PINE_META_URL}} stays in the body"; })();',
    '',
  ].join('\n');
}

/** A changelog as the private repository keeps it: four versions, newest first. */
export const TOOL_CHANGELOG = [
  '# Changelog',
  '',
  'What an admin will notice, newest first.',
  '',
  '## 1.2.0',
  '',
  '- Fixes <b>one</b> thing.',
  '',
  '## 1.1.0',
  '- A smaller panel.',
  '## 1.0.1',
  '- Clearer words.',
  '## 1.0.0',
  '- The tool on its own.',
  '',
].join('\n');

/**
 * A folder as `wayspot-tool/` of a stack: the tool file (`toolText`, unless `script` is given or
 * null for none) and the changelog (unless null). Made in the run's temporary folder.
 */
export function toolFolder(options: { script?: string | null; changelog?: string | null } = {}): {
  dir: string;
  write: (file: 'script' | 'changelog', text: string, mtime?: number) => void;
} {
  const dir = mkdtempSync(path.join(tmpdir(), 'pine-tool-'));
  const write = (file: 'script' | 'changelog', text: string, mtime?: number) => {
    const target = path.join(dir, file === 'script' ? TOOL_FILE : CHANGELOG_FILE);
    writeFileSync(target, text);
    if (mtime !== undefined) utimesSync(target, mtime / 1000, mtime / 1000);
  };
  const script = options.script === undefined ? toolText() : options.script;
  if (script !== null) write('script', script);
  const changelog = options.changelog === undefined ? TOOL_CHANGELOG : options.changelog;
  if (changelog !== null) write('changelog', changelog);
  return { dir, write };
}
