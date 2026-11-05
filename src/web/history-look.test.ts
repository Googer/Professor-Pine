import { describe, expect, it } from 'vitest';
import { blockAt, clientSheet } from '../../test/support/stylesheets.js';

/** The history page's stylesheet (plan 8H-5), as the browser reads it. */
describe("the history page's look", () => {
  it('breaks a long region name anywhere in the table rather than widening a phone (P10)', () => {
    const cell = blockAt(clientSheet('history.css'), /#tally-table td\s*\{/u);
    expect(cell).toMatch(/overflow-wrap:\s*anywhere;/u);
  });
});
