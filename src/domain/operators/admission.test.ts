import { describe, expect, it } from 'vitest';
import { mayHave, NO_STANDING, type Admission, type Standing } from './admission.js';

const HOME = '512345678901234567';
const ELSEWHERE = '612345678901234567';

const recorded: Standing = { ...NO_STANDING, recorded: true };
const allowed: Standing = { ...NO_STANDING, allowed: true };
const blocked = (standing: Standing): Standing => ({ ...standing, blocked: true });

/** No `servers` in the file: closed to new servers. */
const closed: Admission = { open: false, listed: undefined };
/** `servers` lists HOME. */
const listing: Admission = { open: false, listed: [HOME] };
/** `servers: "open"`. */
const open: Admission = { open: true, listed: undefined };

describe('who may have this Pine', () => {
  it('is, without a list, only a server recorded at the upgrade or allowed by an operator', () => {
    expect(mayHave(HOME, closed, recorded)).toBe(true);
    expect(mayHave(ELSEWHERE, closed, NO_STANDING)).toBe(false);
    expect(mayHave(ELSEWHERE, closed, allowed)).toBe(true);
  });

  it('is, with a list, a listed server, and the recorded and the allowed besides', () => {
    expect(mayHave(HOME, listing, NO_STANDING)).toBe(true);
    expect(mayHave(ELSEWHERE, listing, NO_STANDING)).toBe(false);
    expect(mayHave(ELSEWHERE, listing, recorded)).toBe(true);
    expect(mayHave(ELSEWHERE, listing, allowed)).toBe(true);
  });

  it('is, on an open instance, any server', () => {
    expect(mayHave(HOME, open, NO_STANDING)).toBe(true);
    expect(mayHave(ELSEWHERE, open, NO_STANDING)).toBe(true);
  });

  it('is never a blocked server, whatever else would allow it', () => {
    expect(mayHave(HOME, listing, blocked(recorded))).toBe(false);
    expect(mayHave(ELSEWHERE, listing, NO_STANDING)).toBe(false);
    expect(mayHave(HOME, closed, blocked(allowed))).toBe(false);
    expect(mayHave(ELSEWHERE, open, blocked(NO_STANDING))).toBe(false);
    // The other server of each instance still may.
    expect(mayHave(ELSEWHERE, open, NO_STANDING)).toBe(true);
    expect(mayHave(ELSEWHERE, closed, allowed)).toBe(true);
  });
});
