import {
  Collection,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import { DiscordWebMembers } from './web-members.js';

const SERVER = '412345678901234567';
const USER = '700000000000000001';

function apiError(code: number, status: number): DiscordAPIError {
  return new DiscordAPIError({ code, message: 'no' }, code, status, 'GET', '/x', {});
}

/**
 * `DiscordWebMembers` over a client whose cache has the one server, whose `members.fetch`
 * answers what `fetched` gives (or rejects with it); `asked` records each fetch's options.
 */
function setup(fetched: () => unknown, now: () => number = () => 1_000) {
  const asked: unknown[] = [];
  const guild = {
    members: {
      fetch: (options: unknown) => {
        asked.push(options);
        const answer = fetched();
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
      },
    },
  };
  const client = { guilds: { cache: new Collection([[SERVER, guild]]) } } as unknown as Client;
  return { members: new DiscordWebMembers(client, now), asked };
}

/**
 * A member as Discord gives them: timed out (`isCommunicationDisabled`), not through the
 * membership screening yet (`pending`), an administrator (who has every permission, as
 * discord.js's `has` answers by default), with Manage Server, as `state` says; none by default.
 */
const member = (
  displayName: string,
  roles: string[],
  state: { timedOut?: boolean; pending?: boolean | null; admin?: boolean; manage?: boolean } = {},
) => ({
  id: USER,
  displayName,
  roles: { cache: new Collection(roles.map((name, i) => [String(i), { name }])) },
  pending: state.pending ?? false,
  isCommunicationDisabled: () => state.timedOut ?? false,
  permissions: {
    has: (permission: bigint) =>
      (state.admin ?? false) ||
      ((state.manage ?? false) && permission === PermissionFlagsBits.ManageGuild),
  },
});

describe('the member who presses a button on the live map, asked of Discord', () => {
  it('is fetched fresh, with the name and team a button of the post would carry', async () => {
    const { members, asked } = setup(() => member('Alice', ['Trainer', 'Mystic']));
    expect(await members.acting(SERVER, USER)).toEqual({
      kind: 'member',
      member: { id: USER, name: 'Alice', team: 'mystic' },
      standing: { roleNames: ['Trainer', 'Mystic'], administrator: false, manageGuild: false },
    });
    expect(asked).toEqual([{ user: USER, force: true }]);
  });

  it('says whether they may manage the server, for the map’s hint of the editor (plan 8M-10)', async () => {
    const { members } = setup(() => member('Alice', ['Moderator'], { manage: true }));
    expect(await members.acting(SERVER, USER)).toMatchObject({
      standing: { roleNames: ['Moderator'], administrator: false, manageGuild: true },
    });
  });

  it('is nobody when not in the server, or in a server the bot is not in', async () => {
    const { members } = setup(() => apiError(RESTJSONErrorCodes.UnknownMember, 404));
    expect(await members.acting(SERVER, USER)).toEqual({ kind: 'not-member' });
    expect(await members.acting('412345678901234999', USER)).toEqual({ kind: 'not-member' });
  });

  it('may not act while timed out, or before finishing the membership screening', async () => {
    const timedOut = setup(() => member('Alice', [], { timedOut: true, pending: true }));
    expect(await timedOut.members.acting(SERVER, USER)).toEqual({ kind: 'timed-out' });
    const pending = setup(() => member('Alice', [], { pending: true }));
    expect(await pending.members.acting(SERVER, USER)).toEqual({ kind: 'pending' });
    // Discord says nothing of the screening (null): no screening to wait for.
    const unknown = setup(() => member('Alice', [], { pending: null }));
    expect((await unknown.members.acting(SERVER, USER)).kind).toBe('member');
  });

  it('acts all the same as an administrator', async () => {
    const { members } = setup(() =>
      member('Alice', ['Valor'], { timedOut: true, pending: true, admin: true }),
    );
    expect(await members.acting(SERVER, USER)).toEqual({
      kind: 'member',
      member: { id: USER, name: 'Alice', team: 'valor' },
      standing: { roleNames: ['Valor'], administrator: true, manageGuild: true },
    });
  });

  it('rejects when Discord cannot be asked', async () => {
    const { members } = setup(() => apiError(0, 503));
    await expect(members.acting(SERVER, USER)).rejects.toThrow();
  });
});

describe('the forced fetch, shared for 2 seconds per member (plan 8Z)', () => {
  const OTHER = '700000000000000002';

  it('asks once for two asks at once, the one answer for both', async () => {
    const held = Promise.withResolvers<unknown>();
    const { members, asked } = setup(() => held.promise);
    const first = members.acting(SERVER, USER);
    const second = members.acting(SERVER, USER);
    held.resolve(member('Alice', []));
    expect(await first).toEqual(await second);
    expect(asked).toHaveLength(1);
  });

  it('reuses the answer until 2 seconds after it came, not after it was asked', async () => {
    const clock = { now: 1_000 };
    const held = Promise.withResolvers<unknown>();
    const { members, asked } = setup(
      () => held.promise,
      () => clock.now,
    );
    const first = members.acting(SERVER, USER);
    clock.now += 500;
    held.resolve(member('Alice', []));
    await first;
    clock.now += 1_999;
    await members.acting(SERVER, USER);
    expect(asked).toHaveLength(1);
    clock.now += 1;
    await members.acting(SERVER, USER);
    expect(asked).toHaveLength(2);
  });

  it('keeps no failure: the next ask asks again', async () => {
    let fails = true;
    const { members, asked } = setup(() => (fails ? apiError(0, 503) : member('Alice', [])));
    await expect(members.acting(SERVER, USER)).rejects.toThrow();
    fails = false;
    expect((await members.acting(SERVER, USER)).kind).toBe('member');
    expect(asked).toHaveLength(2);
  });

  it('shares it with the same member of the same server alone', async () => {
    const { members, asked } = setup(() => member('Alice', []));
    await members.acting(SERVER, USER);
    await members.acting(SERVER, OTHER);
    expect(asked).toHaveLength(2);
  });
});
