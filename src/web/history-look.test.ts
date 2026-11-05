import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet } from '../../test/support/stylesheets.js';

/** The history page's stylesheet (plan 8H-5), as the browser reads it. */
describe("the history page's look", () => {
  it('breaks a long region name anywhere in the table rather than widening a phone (P10)', () => {
    const region = blockAt(clientSheet('history.css'), /#tally-table td:nth-child\(2\)\s*\{/u);
    expect(region).toMatch(/overflow-wrap:\s*anywhere;/u);
  });

  // Staging of 8H-5 (2026-11-05): at phone width "10" broke into "1" over "0".
  it('never breaks a rank or a count, only the region name', () => {
    const cells = blockAt(clientSheet('history.css'), /#tally-table th,\s*#tally-table td\s*\{/u);
    expect(cells).not.toMatch(/overflow-wrap:\s*anywhere;/u);
    const numbers = blockAt(
      clientSheet('history.css'),
      /#tally-table \.count,\s*#tally-table td:first-child\s*\{/u,
    );
    expect(numbers).toMatch(/white-space:\s*nowrap;/u);
  });
});
