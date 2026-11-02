import { describe, expect, it } from 'vitest';
import {
  changelogEntries,
  CHANGELOG_SHOWN,
  readToolFile,
  servedMeta,
  servedScript,
  type ToolFile,
} from './tool-file.js';
import { toolText } from '../../../test/support/wayspot-tool.js';

const TOOL_TEXT = toolText();

const URLS = {
  meta: 'https://pine.example.test/userscript/abc/pine-wayfarer-export.meta.js',
  script: 'https://pine.example.test/userscript/abc/pine-wayfarer-export.user.js',
};

function read(text: string): ToolFile {
  const read = readToolFile(text);
  if (!read.ok) throw new Error(read.reason);
  return read.tool;
}

describe('readToolFile', () => {
  it('reads the header block and its version', () => {
    const tool = read(TOOL_TEXT);
    expect(tool.version).toBe('1.2.0');
    expect(tool.header.split('\n')[0]).toBe('// ==UserScript==');
    expect(tool.header.endsWith('// ==/UserScript==\n')).toBe(true);
  });

  it('reads a file with Windows line ends, or a byte order mark first', () => {
    expect(read(TOOL_TEXT.replace(/\n/g, '\r\n')).version).toBe('1.2.0');
    const marked = read(String.fromCharCode(0xfeff) + TOOL_TEXT);
    expect(marked.header.startsWith('// ==UserScript==\n')).toBe(true);
  });

  it('refuses a file without a complete header block or without a version', () => {
    const refused = (text: string) => readToolFile(text).ok;
    expect(refused('"use strict";\n')).toBe(false);
    expect(refused(TOOL_TEXT.replace('// ==/UserScript==\n', ''))).toBe(false);
    expect(refused(TOOL_TEXT.replace('// ==UserScript==\n', ''))).toBe(false);
    expect(refused(TOOL_TEXT.replace('// @version      1.2.0\n', ''))).toBe(false);
    expect(refused(TOOL_TEXT.replace('1.2.0', 'one point two'))).toBe(false);
    // The block must open the file: a header further down is not the script's.
    expect(refused(`"use strict";\n${TOOL_TEXT}`)).toBe(false);
    // A version written after the block is the body's, not the header's.
    expect(
      refused(
        TOOL_TEXT.replace('// @version      1.2.0\n', '').replace(
          '"use strict";',
          '// @version 9.9.9',
        ),
      ),
    ).toBe(false);
  });

  it('refuses the build for installing by hand: its header has no addresses to fill', () => {
    const handBuild = TOOL_TEXT.replace(
      '// @updateURL    {{PINE_META_URL}}\n// @downloadURL  {{PINE_SCRIPT_URL}}\n',
      '// @downloadURL  none\n',
    );
    expect(readToolFile(handBuild)).toEqual({
      ok: false,
      reason: 'its header has no {{PINE_SCRIPT_URL}}: deploy the serve build',
    });
    // The body's copy of a placeholder is no header's.
    expect(readToolFile(TOOL_TEXT.replace('// @updateURL    {{PINE_META_URL}}\n', ''))).toEqual({
      ok: false,
      reason: 'its header has no {{PINE_META_URL}}: deploy the serve build',
    });
  });
});

describe('the files served', () => {
  it("fills the header's placeholders with the key's addresses, the body left as it is", () => {
    const served = servedScript(read(TOOL_TEXT), URLS);
    expect(served).toContain(`// @updateURL    ${URLS.meta}\n`);
    expect(served).toContain(`// @downloadURL  ${URLS.script}\n`);
    expect(served).toContain('"{{PINE_META_URL}} stays in the body"');
    expect(served.endsWith('})();\n')).toBe(true);
  });

  it('serves the header block alone as the meta file', () => {
    const meta = servedMeta(read(TOOL_TEXT), URLS);
    expect(meta.split('\n')).toEqual([
      '// ==UserScript==',
      '// @name         Pine Wayfarer export',
      '// @version      1.2.0',
      '// @match        https://wayfarer.example.test/*',
      `// @updateURL    ${URLS.meta}`,
      `// @downloadURL  ${URLS.script}`,
      '// ==/UserScript==',
      '',
    ]);
  });
});

describe('changelogEntries', () => {
  const CHANGELOG = [
    '# Changelog',
    '',
    'What an admin will notice, newest first.',
    '',
    '## 1.3.0',
    '',
    '- Faster.',
    '- Quieter.',
    '',
    '## 1.2.0',
    '- A new panel.',
    '## 1.1.0',
    '',
    '## 1.0.0',
    '- The tool on its own.',
    '',
  ].join('\r\n');

  it('gives the three newest entries, each its version and its text', () => {
    expect(CHANGELOG_SHOWN).toBe(3);
    expect(changelogEntries(CHANGELOG)).toEqual([
      { version: '1.3.0', text: '- Faster.\n- Quieter.' },
      { version: '1.2.0', text: '- A new panel.' },
      { version: '1.1.0', text: '' },
    ]);
  });

  it('gives nothing for a file without such headings', () => {
    expect(changelogEntries('# Changelog\n\nNothing yet.\n')).toEqual([]);
  });
});
