import { describe, expect, it } from 'vitest';
import { sqlModeRefusal } from './kysely.js';

describe('sqlModeRefusal', () => {
  it('passes MySQL’s own modes, and an empty one', () => {
    expect(
      sqlModeRefusal(
        'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,' +
          'ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION',
      ),
    ).toBeUndefined();
    expect(sqlModeRefusal('')).toBeUndefined();
  });

  it('refuses NO_BACKSLASH_ESCAPES wherever it stands in the list, and says what to do', () => {
    for (const mode of [
      'NO_BACKSLASH_ESCAPES',
      'STRICT_TRANS_TABLES,NO_BACKSLASH_ESCAPES,NO_ENGINE_SUBSTITUTION',
      'strict_trans_tables,no_backslash_escapes',
    ]) {
      expect(sqlModeRefusal(mode), mode).toMatch(
        /take NO_BACKSLASH_ESCAPES out of the server's sql_mode/,
      );
    }
  });
});
