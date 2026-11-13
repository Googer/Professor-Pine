import { describe, expect, it } from 'vitest';
import { isInstanceOperator, isSharedDataOperator, type Instance } from './tiers.js';

const OWNER = '223456789012345678';
const OPERATOR = '323456789012345678';
const STAFF = '423456789012345678';
const HOME = '512345678901234567';
const ELSEWHERE = '612345678901234567';

/** Pittsburgh's: no list of servers, so that its staff look after the shared data. */
const unlisted: Instance = {
  ownerId: OWNER,
  operators: [OPERATOR],
  open: false,
  listed: undefined,
};
/** An instance that lists its servers. */
const listed: Instance = { ...unlisted, listed: [HOME] };
/** A public instance: `servers: "open"`. */
const open: Instance = { ...unlisted, open: true };

describe('the instance operators', () => {
  it('are the owner and the operators the file names, nobody else', () => {
    expect(isInstanceOperator(OWNER, listed)).toBe(true);
    expect(isInstanceOperator(OPERATOR, listed)).toBe(true);
    expect(isInstanceOperator(STAFF, listed)).toBe(false);
    expect(isInstanceOperator(OPERATOR, { ...listed, operators: [] })).toBe(false);
  });

  it('are nobody by a blank owner id', () => {
    expect(isInstanceOperator('', { ...listed, ownerId: '' })).toBe(false);
  });
});

describe('the shared-data operators', () => {
  const staffAt = (serverId: string | undefined, botManagement = true) => ({
    userId: STAFF,
    serverId,
    botManagement,
  });

  it('are, on an instance without a list, also the staff of any server asked from', () => {
    expect(isSharedDataOperator(staffAt(HOME), unlisted)).toBe(true);
    expect(isSharedDataOperator(staffAt(ELSEWHERE), unlisted)).toBe(true);
    expect(isSharedDataOperator(staffAt(HOME, false), unlisted)).toBe(false);
  });

  it('are, on an instance that lists its servers, the staff of a listed server only', () => {
    expect(isSharedDataOperator(staffAt(HOME), listed)).toBe(true);
    expect(isSharedDataOperator(staffAt(ELSEWHERE), listed)).toBe(false);
    expect(isSharedDataOperator(staffAt(HOME, false), listed)).toBe(false);
    // The operators wherever they ask.
    expect(
      isSharedDataOperator({ userId: OPERATOR, serverId: ELSEWHERE, botManagement: false }, listed),
    ).toBe(true);
  });

  it('are on an open instance its instance operators only', () => {
    expect(isSharedDataOperator(staffAt(HOME), open)).toBe(false);
    expect(
      isSharedDataOperator({ userId: OPERATOR, serverId: HOME, botManagement: false }, open),
    ).toBe(true);
  });

  it('are in a direct message the instance operators only, whatever their roles', () => {
    expect(isSharedDataOperator(staffAt(undefined), unlisted)).toBe(false);
    expect(isSharedDataOperator(staffAt(undefined), listed)).toBe(false);
    expect(
      isSharedDataOperator({ userId: OPERATOR, serverId: undefined, botManagement: false }, open),
    ).toBe(true);
    expect(
      isSharedDataOperator({ userId: OWNER, serverId: undefined, botManagement: false }, listed),
    ).toBe(true);
  });
});
