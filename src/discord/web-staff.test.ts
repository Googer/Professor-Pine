import {
  Collection,
  DiscordAPIError,
  PermissionFlagsBits,
  PermissionsBitField,
  RESTJSONErrorCodes,
  type Client,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { DiscordRegionStaff } from './web-staff.js';

const SERVER = '412345678901234567';
const OTHER_SERVER = '412345678901234568';
const OWNER = '700000000000000099';
const USER = '700000000000000001';

/** A member as `DiscordRegionStaff` reads one: the names of their roles, their permissions. */
function member(roles: string[], ...permissions: bigint[]) {
  return {
    roles: { cache: new Collection(roles.map((name, i) => [String(i), { name }])) },
    permissions: new PermissionsBitField(permissions),
  };
}

function apiError(code: number, status: number): DiscordAPIError {
  return new DiscordAPIError({ code, message: 'no' }, code, status, 'GET', '/x', {});
}

/**
 * `DiscordRegionStaff` over a client whose cache has the one server, whose `members.fetch`
 * answers what `fetched` gives (or rejects with it); `asked` records each fetch's options.
 */
function setup(fetched: () => unknown) {
  const asked: unknown[] = [];
  const guild = {
    members: {
      fetch: (options: unknown) => {
        asked.push(options);
        const answer = fetched();
        return answer instanceof Error || answer instanceof DOMException
          ? Promise.reject(answer)
          : Promise.resolve(answer);
      },
    },
  };
  const client = { guilds: { cache: new Collection([[SERVER, guild]]) } } as unknown as Client;
  const { log, entries } = createTestLogger();
  const staff = new DiscordRegionStaff({
    client,
    guilds: { idFor: (id) => Promise.resolve(id === SERVER ? 1 : undefined) },
    ownerId: OWNER,
    log,
  });
  return { staff, asked, entries };
}

describe('who is staff of a server on the web pages, asked of Discord', () => {
  it('fetches the member fresh, and takes Administrator for Manage Server and Manage Channels', async () => {
    const { staff, asked } = setup(() => member(['Moderator'], PermissionFlagsBits.Administrator));
    expect(await staff.check(SERVER, USER)).toEqual({
      kind: 'staff',
      staff: {
        staffId: USER,
        guildId: 1,
        server: SERVER,
        mayManageChannels: true,
        mayRemoveRegions: true,
      },
    });
    expect(asked).toEqual([{ user: USER, force: true }]);
  });

  it('is no staff without Manage Server, but staff with it without a staff role (plan 19C-2)', async () => {
    const noManage = setup(() => member(['Moderator'], PermissionFlagsBits.ManageChannels));
    expect(await noManage.staff.check(SERVER, USER)).toEqual({ kind: 'not-staff' });
    const noRole = setup(() => member(['Raider'], PermissionFlagsBits.ManageGuild));
    expect(await noRole.staff.check(SERVER, USER)).toMatchObject({ kind: 'staff' });
  });

  it('is no member for somebody Discord does not know in the server', async () => {
    const { staff } = setup(() => apiError(RESTJSONErrorCodes.UnknownMember, 404));
    expect(await staff.check(SERVER, USER)).toEqual({ kind: 'not-member' });
  });

  it('is no member of a server the bot does not have, asking nothing', async () => {
    const { staff, asked } = setup(() => member(['Moderator'], PermissionFlagsBits.ManageGuild));
    expect(await staff.check(OTHER_SERVER, USER)).toEqual({ kind: 'not-member' });
    expect(asked).toEqual([]);
  });

  it('cannot say while Discord fails or does not answer, and logs it', async () => {
    for (const failure of [
      apiError(0, 500),
      apiError(0, 503),
      new DOMException('This operation was aborted', 'AbortError'),
    ]) {
      const { staff, entries } = setup(() => failure);
      expect(await staff.check(SERVER, USER)).toEqual({ kind: 'unreachable' });
      expect(entries.map((entry) => entry.msg)).toContain(
        'could not fetch a member for the web pages',
      );
    }
  });
});
