import { describe, expect, it } from 'vitest';
import { NO_STANDING, type Standing } from './admission.js';
import {
  isInstanceOperator,
  isSharedDataOperator,
  isTrustedServer,
  type Instance,
} from './tiers.js';

const OWNER = '223456789012345678';
const OPERATOR = '323456789012345678';
const STAFF = '423456789012345678';
const HOME = '512345678901234567';
const ELSEWHERE = '612345678901234567';

/** HOME was recorded at the upgrade to 2.1 (plan 19C-1); ELSEWHERE has no standing. */
const standings: Record<string, Standing> = { [HOME]: { ...NO_STANDING, recorded: true } };
const standingOf = (serverId: string): Standing => standings[serverId] ?? NO_STANDING;

/** Pittsburgh's: no list of servers, so that its staff look after the shared data. */
const unlisted: Instance = {
  ownerId: OWNER,
  operators: [OPERATOR],
  open: false,
  listed: undefined,
  standingOf,
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

  it('are, on an instance without a list, also the staff of a server recorded there', () => {
    expect(isSharedDataOperator(staffAt(HOME), unlisted)).toBe(true);
    // Unset is closed to new servers (plan 19C-1): a server not recorded nor allowed is no
    // server of this Pine.
    expect(isSharedDataOperator(staffAt(ELSEWHERE), unlisted)).toBe(false);
    expect(isSharedDataOperator(staffAt(HOME, false), unlisted)).toBe(false);
  });

  it('are, on an instance that lists its servers, the staff of an allowed server only', () => {
    const listing: Instance = { ...listed, listed: [ELSEWHERE], standingOf: () => NO_STANDING };
    expect(isSharedDataOperator(staffAt(ELSEWHERE), listing)).toBe(true);
    expect(isSharedDataOperator(staffAt(HOME), listing)).toBe(false);
    expect(isSharedDataOperator(staffAt(HOME), listed)).toBe(true);
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

  it('are never the staff of a blocked server', () => {
    const blocked: Instance = {
      ...listed,
      standingOf: (serverId) => ({ ...standingOf(serverId), blocked: serverId === HOME }),
    };
    expect(isSharedDataOperator(staffAt(HOME), blocked)).toBe(false);
    expect(isSharedDataOperator(staffAt(ELSEWHERE), { ...blocked, listed: [ELSEWHERE] })).toBe(
      true,
    );
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

describe('the servers the instance trusts (plan 19C-1)', () => {
  it('are the allowed servers of an instance that is not open', () => {
    expect(isTrustedServer(HOME, unlisted)).toBe(true);
    expect(isTrustedServer(ELSEWHERE, unlisted)).toBe(false);
    const allowedThere: Instance = {
      ...unlisted,
      standingOf: (serverId) => ({ ...standingOf(serverId), allowed: serverId === ELSEWHERE }),
    };
    expect(isTrustedServer(ELSEWHERE, allowedThere)).toBe(true);
  });

  it('are none on an open instance, where every server may have it', () => {
    expect(isTrustedServer(HOME, open)).toBe(false);
    expect(isTrustedServer(ELSEWHERE, open)).toBe(false);
  });
});
