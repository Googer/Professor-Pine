import { describe, expect, it } from 'vitest';
import {
  askAgainAt,
  communityLine,
  COMMUNITY_MAX,
  decidedState,
  decisionFits,
  keptName,
  mayAskAgain,
  REASK_MS,
  type ScriptAccess,
} from './access.js';

const refused = (decidedAt: number): ScriptAccess => ({
  id: 1,
  userId: '200000000000000001',
  name: 'Ash',
  community: 'Pinewood',
  state: 'refused',
  key: null,
  askedAt: decidedAt - 1_000,
  decidedAt,
  lastFetchAt: null,
  lastVersion: null,
});

describe('communityLine', () => {
  it('keeps one line, its white space runs one space, trimmed', () => {
    expect(communityLine('  Pine\twood \r\n raiders  ')).toBe('Pine wood raiders');
    expect(communityLine(' \n\t ')).toBe('');
  });

  it('cuts to 200 code points before anything else, never a pair in half', () => {
    const emoji = '🌲'.repeat(COMMUNITY_MAX + 5);
    expect([...communityLine(emoji)]).toHaveLength(COMMUNITY_MAX);
    // Cut first: the spaces beyond the cut never count, those before it are trimmed after.
    expect(communityLine(`${'a'.repeat(COMMUNITY_MAX - 1)}   b`)).toBe(
      'a'.repeat(COMMUNITY_MAX - 1),
    );
  });
});

describe('keptName', () => {
  it('cuts a name to 100 code points', () => {
    expect([...keptName('Zoë'.repeat(50))]).toHaveLength(100);
    expect(keptName('Ash')).toBe('Ash');
  });
});

describe('decisions', () => {
  it('approves from asked, refused and revoked; refuses an open request; revokes an approval', () => {
    expect(decisionFits('approve', 'asked')).toBe(true);
    expect(decisionFits('approve', 'refused')).toBe(true);
    expect(decisionFits('approve', 'revoked')).toBe(true);
    expect(decisionFits('approve', 'approved')).toBe(false);
    expect(decisionFits('refuse', 'asked')).toBe(true);
    expect(decisionFits('refuse', 'approved')).toBe(false);
    expect(decisionFits('revoke', 'approved')).toBe(true);
    expect(decisionFits('revoke', 'asked')).toBe(false);
    expect([decidedState('approve'), decidedState('refuse'), decidedState('revoke')]).toEqual([
      'approved',
      'refused',
      'revoked',
    ]);
  });
});

describe('asking again', () => {
  it('lets a refused member ask again 30 days after the refusal', () => {
    const access = refused(1_000_000);
    expect(askAgainAt(access)).toBe(1_000_000 + REASK_MS);
    expect(mayAskAgain(access, 1_000_000 + REASK_MS - 1)).toBe(false);
    expect(mayAskAgain(access, 1_000_000 + REASK_MS)).toBe(true);
  });

  it('never for any other state', () => {
    for (const state of ['asked', 'approved', 'revoked'] as const) {
      const access = { ...refused(1_000), state };
      expect(askAgainAt(access)).toBeUndefined();
      expect(mayAskAgain(access, 1_000 + 2 * REASK_MS)).toBe(false);
    }
  });
});
