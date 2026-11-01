import { describe, expect, it } from 'vitest';
import { isDeadlock, isDuplicateEntry } from './errors.js';

/** MySQL's duplicate-key error as mysql2 gives it. */
function duplicate(key: string): Error {
  return Object.assign(new Error(`Duplicate entry 'x' for key '${key}'`), {
    errno: 1062,
    code: 'ER_DUP_ENTRY',
    sqlMessage: `Duplicate entry 'x' for key '${key}'`,
  });
}

describe('isDuplicateEntry', () => {
  it('knows MySQL’s duplicate-key error, and nothing else', () => {
    expect(isDuplicateEntry(duplicate('Region.PRIMARY'))).toBe(true);
    expect(isDuplicateEntry(Object.assign(new Error('Deadlock'), { errno: 1213 }))).toBe(false);
    expect(isDuplicateEntry('Duplicate entry')).toBe(false);
    expect(isDuplicateEntry(undefined)).toBe(false);
  });

  it('asked of one key, knows only a duplicate of that key', () => {
    const open = duplicate('MeetupAppeal.meetupappeal_openkey_unique');
    expect(isDuplicateEntry(open, 'meetupappeal_openkey_unique')).toBe(true);
    expect(isDuplicateEntry(duplicate('MeetupAppeal.PRIMARY'), 'meetupappeal_openkey_unique')).toBe(
      false,
    );
    // MySQL before 8.0.19 names the key without its table.
    expect(
      isDuplicateEntry(duplicate('meetupappeal_openkey_unique'), 'meetupappeal_openkey_unique'),
    ).toBe(true);
  });
});

describe('isDeadlock', () => {
  it('knows MySQL’s deadlock, and nothing else', () => {
    expect(isDeadlock(Object.assign(new Error('Deadlock'), { errno: 1213 }))).toBe(true);
    expect(isDeadlock(duplicate('Region.PRIMARY'))).toBe(false);
    expect(isDeadlock('Deadlock')).toBe(false);
    expect(isDeadlock(undefined)).toBe(false);
  });
});
