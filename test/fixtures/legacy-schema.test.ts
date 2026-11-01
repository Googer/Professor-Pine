import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXED_MIGRATION_TIME } from '../../scripts/legacy-schema/normalise.js';
import { LEGACY_SCHEMA_FIXTURE } from '../support/mysql.js';

describe('legacy schema fixture', () => {
  const fixture = readFileSync(LEGACY_SCHEMA_FIXTURE, 'utf8');

  it('never drops a table', () => {
    expect(fixture).not.toMatch(/drop\s+table/i);
  });

  it('uses the fixed migration time so regenerating does not change the file', () => {
    const times = fixture.match(/'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}'/g) ?? [];
    expect(times.length).toBeGreaterThan(0);
    expect(new Set(times)).toEqual(new Set([`'${FIXED_MIGRATION_TIME}'`]));
  });
});
