import { describe, expect, it } from 'vitest';
import { ADMINISTRATORS_ONLY, mapMemberRole, moderatorsNamed, publicMapOn } from './standing.js';

const ROLE = '300000000000000001';
const CHANNEL = '500000000000000001';

describe('a server’s standing settings (plan 19A-1, review F1, F2; fix round 3, H3)', () => {
  it('counts every member on the map where no member role is set, and only that role’s where one is', () => {
    expect(mapMemberRole({ roles: {} })).toBeUndefined();
    expect(mapMemberRole({ roles: { mapMember: ROLE } })).toBe(ROLE);
  });

  it('keeps the map for administrators where the file named a member role the server lacks', () => {
    expect(mapMemberRole({ roles: {}, unmatched: ['roles.mapMember'] })).toBe(ADMINISTRATORS_ONLY);
    // Once staff choose one, it is the role.
    expect(mapMemberRole({ roles: { mapMember: ROLE }, unmatched: ['roles.mapMember'] })).toBe(
      ROLE,
    );
  });

  it('has the moderators where a channel is set, or the file named one the server lacks', () => {
    expect(moderatorsNamed({ channels: {} })).toBe(false);
    expect(moderatorsNamed({ channels: { moderation: CHANNEL } })).toBe(true);
    expect(moderatorsNamed({ channels: {}, unmatched: ['channels.moderation'] })).toBe(true);
    expect(moderatorsNamed({ channels: {}, unmatched: ['roles.mapMember'] })).toBe(false);
  });
});

describe('the map for visitors who are not logged in (plan 19C-4)', () => {
  it('is open on an instance that lists its servers, or none, unless the server’s staff closed it', () => {
    expect(publicMapOn({}, { open: false })).toBe(true);
    expect(publicMapOn({ publicMap: false }, { open: false })).toBe(false);
    expect(publicMapOn({ publicMap: true }, { open: false })).toBe(true);
  });

  it('is closed on an open instance unless the server’s staff opened it', () => {
    expect(publicMapOn({}, { open: true })).toBe(false);
    expect(publicMapOn({ publicMap: true }, { open: true })).toBe(true);
    expect(publicMapOn({ publicMap: false }, { open: true })).toBe(false);
  });
});
