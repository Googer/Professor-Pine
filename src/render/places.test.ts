import { describe, expect, it } from 'vitest';
import { MOD, newRequest, SAFETY_SERVER } from '../../test/support/meetup-safety-cases.js';
import { componentCount, textOf } from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import { MAX_PARTY_NAME } from '../domain/party/party.js';
import { PLACES_PAGE, placesList } from './places.js';

const none = {
  serverId: SAFETY_SERVER,
  rulings: [],
  pending: [],
  asks: [],
  blocks: [],
  appeals: [],
  reports: [],
  titleOf: () => 'x',
};

describe('placesList', () => {
  it('says when there is nothing, and holds a page of blocks within what a message holds', () => {
    expect(textOf(placesList(none, 0))).toContain('No rulings, and nothing open.');
    const blocks = Array.from({ length: 25 }, (_, i) => ({
      serverId: SAFETY_SERVER,
      memberId: `2000000000000001${String(i).padStart(2, '0')}`,
      memberName: '_'.repeat(32),
      blockedBy: MOD.id,
      blockedByName: '_'.repeat(32),
      blockedAt: MOD.at,
    }));
    const page = placesList({ ...none, blocks }, 0);
    expectV2Sendable(page);
    expect(componentCount(page)).toBeLessThanOrEqual(40);
    // Past the end: the last page.
    expect(textOf(placesList({ ...none, blocks }, 9))).toContain('Page 3 of 3');
    const pending = Array.from(
      { length: PLACES_PAGE },
      (_, i) =>
        ({
          ...newRequest(i + 1, { name: '*'.repeat(MAX_PARTY_NAME) }),
          status: 'pending',
        }) as never,
    );
    expectV2Sendable(placesList({ ...none, pending }, 0));
  });
});
