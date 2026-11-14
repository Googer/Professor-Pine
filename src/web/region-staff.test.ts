import { describe, expect, it } from 'vitest';
import { mayEditRegions, regionStaffAnswer, type StaffFacts } from './region-staff.js';

const OWNER = '700000000000000099';
const USER = '700000000000000001';
const SERVER = '412345678901234567';

const facts = (more: Partial<StaffFacts> = {}): StaffFacts => ({
  roleNames: ['Moderator'],
  manageGuild: true,
  manageChannels: false,
  ...more,
});

describe('staff of a server on the web pages', () => {
  it('are those /region admits: an admin, a moderator or a bot developer, who may manage it', () => {
    for (const role of ['Admin', 'moderator', 'Bot Developer']) {
      expect(
        regionStaffAnswer(facts({ roleNames: ['Raider', role] }), USER, OWNER, SERVER, 1),
      ).toEqual({
        kind: 'staff',
        staff: {
          staffId: USER,
          guildId: 1,
          server: SERVER,
          mayManageChannels: false,
          mayRemoveRegions: true,
        },
      });
    }
    expect(
      regionStaffAnswer(facts({ manageChannels: true }), USER, OWNER, SERVER, 1),
    ).toMatchObject({ staff: { mayManageChannels: true } });
    // The bot's owner, as the guard admits them.
    expect(regionStaffAnswer(facts({ roleNames: [] }), OWNER, OWNER, SERVER, 1).kind).toBe('staff');
  });

  it('are also those who may manage the server without a staff role, its owner too (plan 19C-2)', () => {
    // `/region import` and `/region edit` admit them (`requireServerAdmin`); Discord says Manage
    // Server of the server's owner too. They remove no region: `/region remove` refuses them.
    expect(regionStaffAnswer(facts({ roleNames: ['Raider'] }), USER, OWNER, SERVER, 1)).toEqual({
      kind: 'staff',
      staff: {
        staffId: USER,
        guildId: 1,
        server: SERVER,
        mayManageChannels: false,
        mayRemoveRegions: false,
      },
    });
  });

  it('are not members who may not manage the server, whatever their roles', () => {
    // Discord offers /region only to those who may manage the server (its default permission).
    expect(regionStaffAnswer(facts({ manageGuild: false }), USER, OWNER, SERVER, 1)).toEqual({
      kind: 'not-staff',
    });
    expect(
      regionStaffAnswer(
        facts({ roleNames: ['Raider'], manageGuild: false }),
        USER,
        OWNER,
        SERVER,
        1,
      ),
    ).toEqual({ kind: 'not-staff' });
    expect(regionStaffAnswer(undefined, USER, OWNER, SERVER, 1)).toEqual({ kind: 'not-member' });
  });

  it('may edit regions by the one rule the answer and the map’s hint share (plan 8M-10)', () => {
    expect(mayEditRegions({ roleNames: ['Moderator'], manageGuild: true }, USER, OWNER)).toBe(true);
    expect(mayEditRegions({ roleNames: [], manageGuild: true }, OWNER, OWNER)).toBe(true);
    expect(mayEditRegions({ roleNames: ['Raider'], manageGuild: true }, USER, OWNER)).toBe(true);
    expect(mayEditRegions({ roleNames: ['Moderator'], manageGuild: false }, USER, OWNER)).toBe(
      false,
    );
    // What the directory does not say (an older answer) is no Manage Server.
    expect(mayEditRegions({ roleNames: ['Moderator'] }, USER, OWNER)).toBe(false);
  });

  it('wait for the server to be known', () => {
    expect(regionStaffAnswer(facts(), USER, OWNER, SERVER, undefined)).toEqual({
      kind: 'unknown-server',
    });
  });
});
