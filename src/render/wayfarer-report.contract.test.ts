import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { importReportFixtureText } from '../../test/support/import-report-fixture.js';

/**
 * The file as the package exports it, where the export tool's tests read it too. It is a
 * contract with the tool: a change to the report that the byte test
 * below flags, or a fixture made anew, must be checked against the tool before it is kept.
 */
const FIXTURE = createRequire(import.meta.url).resolve(
  '@pine/wayspot-core/fixtures/import-report.csv',
);

/** The fixture's rows as fields, the header first (RFC 4180 quotes, a byte-order mark). */
function rowsOf(text: string): string[][] {
  const rows: string[][] = [];
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (const line of body.split('\r\n')) {
    if (line === '') continue;
    const fields: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (quoted && c === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = !quoted;
      } else if (c === ',' && !quoted) {
        fields.push(field);
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field);
    rows.push(fields);
  }
  return rows;
}

describe("the import's report, a contract with the export tool", () => {
  it('is still exactly the fixture, byte for byte', () => {
    expect(Buffer.from(importReportFixtureText(), 'utf8')).toEqual(readFileSync(FIXTURE));
  });

  it('has the contract columns, and the cells of the gyms not covered in its cell column', () => {
    const [header = [], ...lines] = rowsOf(readFileSync(FIXTURE, 'utf8'));
    expect(header).toEqual(expect.arrayContaining(['gym', 'what', 'cell']));
    const column = (name: string): number => header.indexOf(name);
    const notCovered = lines.filter((line) => line[column('what')] === 'not-covered');
    expect(notCovered.length).toBeGreaterThan(0);
    for (const line of notCovered) {
      expect(line[column('gym')]).toMatch(/^\d+$/);
      expect(line[column('cell')]).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});
