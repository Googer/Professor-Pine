import {
  ChannelType,
  Client,
  OverwriteType,
  PermissionFlagsBits,
  type ForumChannel,
  type Guild,
  type GuildMember,
} from 'discord.js';
import { afterEach, describe, expect, it } from 'vitest';
import { DiscordPartyGateway, viewsWith } from './party-gateway.js';

/*
 * `viewsWith` (plan 8M-20, R1) against discord.js's own `permissionsFor`, on servers built as
 * the gateway's cache holds them (`client.guilds._add` of the data Discord sends): the same rule
 * for the roles a member holds, and the rule a role given or taken would make.
 */

const GUILD = '400000000000000001';
const OWNER = '300000000000000009';
const ASH = '300000000000000001';
const MISTY = '300000000000000002';
const BROCK = '300000000000000003';
const GARY = '300000000000000004';
const NORTH = '500000000000000001';
const SOUTH = '500000000000000002';
const MUTED = '500000000000000003';
const ADMIN = '500000000000000004';
const FORUM = '600000000000000001';
const TEXT = '600000000000000002';
const VIEW = String(PermissionFlagsBits.ViewChannel);

interface Overwrite {
  id: string;
  type: OverwriteType;
  allow: string;
  deny: string;
}

const role = (id: string, name: string, permissions = '0') => ({
  id,
  name,
  permissions,
  position: 1,
  color: 0,
  hoist: false,
  managed: false,
  mentionable: false,
});

const member = (id: string, roles: string[]) => ({
  user: { id, username: id },
  roles,
  joined_at: '2020-01-01T00:00:00Z',
});

const clients: Client[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) await client.destroy();
});

/**
 * A server as Discord's `GUILD_CREATE` gives it: @everyone with `everyone`, North, South, Muted
 * and Admin, the forum with `overwrites`, a text channel without any, and Ash (North), Misty (no
 * role), Brock (North and Muted) and the owner (no role).
 */
function serverWith(overwrites: Overwrite[], everyone = VIEW) {
  const client = new Client({ intents: [] });
  clients.push(client);
  // discord.js builds its cache from Discord's data this way; the method is internal to it.
  const guilds = client.guilds as unknown as { _add(data: unknown): Guild };
  const guild = guilds._add({
    id: GUILD,
    name: 'Pinewood',
    owner_id: OWNER,
    roles: [
      role(GUILD, '@everyone', everyone),
      role(NORTH, 'North'),
      role(SOUTH, 'South'),
      role(MUTED, 'Muted'),
      role(ADMIN, 'Admin', String(PermissionFlagsBits.Administrator)),
    ],
    channels: [
      {
        id: FORUM,
        type: ChannelType.GuildForum,
        name: 'north-raids',
        permission_overwrites: overwrites,
      },
      { id: TEXT, type: ChannelType.GuildText, name: 'north', permission_overwrites: [] },
    ],
    members: [
      member(ASH, [NORTH]),
      member(MISTY, []),
      member(BROCK, [NORTH, MUTED]),
      member(GARY, [ADMIN, MUTED]),
      member(OWNER, []),
    ],
  });
  const forum = client.channels.cache.get(FORUM) as ForumChannel;
  const memberOf = (id: string): GuildMember => {
    const found = guild.members.cache.get(id);
    if (!found) throw new Error(`no member ${id}`);
    return found;
  };
  return { client, guild, forum, memberOf };
}

const everyoneDenied: Overwrite = { id: GUILD, type: OverwriteType.Role, allow: '0', deny: VIEW };
const northAllowed: Overwrite = { id: NORTH, type: OverwriteType.Role, allow: VIEW, deny: '0' };
const mutedDenied: Overwrite = { id: MUTED, type: OverwriteType.Role, allow: '0', deny: VIEW };
const southDenied: Overwrite = { id: SOUTH, type: OverwriteType.Role, allow: '0', deny: VIEW };

/** The roles a member holds, without everybody's. */
const heldBy = (who: GuildMember): Set<string> =>
  new Set([...who.roles.cache.keys()].filter((id) => id !== GUILD));

const sees = (forum: ForumChannel, who: GuildMember): boolean =>
  forum.permissionsFor(who).has(PermissionFlagsBits.ViewChannel);

describe('viewsWith', () => {
  const cases: Array<{ name: string; overwrites: Overwrite[]; everyone?: string }> = [
    { name: 'no overwrite', overwrites: [] },
    { name: 'hidden from everybody, open to North', overwrites: [everyoneDenied, northAllowed] },
    {
      name: 'a denial of one role beaten by an allowance of another',
      overwrites: [everyoneDenied, northAllowed, mutedDenied],
    },
    { name: 'open to everybody, denied to Muted', overwrites: [mutedDenied] },
    {
      name: 'a member’s own denial over a role’s allowance',
      overwrites: [
        everyoneDenied,
        northAllowed,
        { id: ASH, type: OverwriteType.Member, allow: '0', deny: VIEW },
      ],
    },
    {
      name: 'a member’s own allowance over everybody’s denial',
      overwrites: [
        everyoneDenied,
        { id: MISTY, type: OverwriteType.Member, allow: VIEW, deny: '0' },
      ],
    },
    { name: 'a server whose everyone role sees nothing', overwrites: [], everyone: '0' },
    {
      name: 'a server whose everyone role sees nothing, the forum open to North',
      overwrites: [northAllowed],
      everyone: '0',
    },
  ];

  for (const { name, overwrites, everyone } of cases) {
    it(`agrees with permissionsFor for the roles each member holds: ${name}`, () => {
      const { forum, memberOf } = serverWith(overwrites, everyone);
      for (const id of [ASH, MISTY, BROCK, GARY, OWNER]) {
        const who = memberOf(id);
        expect(viewsWith(forum, who, heldBy(who)), id).toBe(sees(forum, who));
      }
    });
  }

  it('says what a role given or taken would make of it', () => {
    const { forum, memberOf } = serverWith([everyoneDenied, northAllowed, southDenied]);
    const misty = memberOf(MISTY);
    const ash = memberOf(ASH);
    expect(viewsWith(forum, misty, new Set())).toBe(false);
    expect(viewsWith(forum, misty, new Set([NORTH]))).toBe(true);
    expect(viewsWith(forum, ash, new Set())).toBe(false);
    // A denial of one role is beaten by an allowance of another, as Discord has it.
    expect(viewsWith(forum, misty, new Set([NORTH, SOUTH]))).toBe(true);
    // An administrator sees everything; a role the server no longer has counts for nothing.
    expect(viewsWith(forum, misty, new Set([ADMIN]))).toBe(true);
    expect(viewsWith(forum, misty, new Set(['500000000000000099']))).toBe(false);
  });

  it('keeps the server’s owner and a member’s own overwrite whatever the roles', () => {
    const { forum, memberOf } = serverWith([
      everyoneDenied,
      northAllowed,
      { id: ASH, type: OverwriteType.Member, allow: '0', deny: VIEW },
      { id: MISTY, type: OverwriteType.Member, allow: VIEW, deny: '0' },
    ]);
    expect(viewsWith(forum, memberOf(OWNER), new Set())).toBe(true);
    expect(viewsWith(forum, memberOf(ASH), new Set([NORTH]))).toBe(false);
    expect(viewsWith(forum, memberOf(MISTY), new Set())).toBe(true);
  });
});

describe('DiscordPartyGateway.memberGates', () => {
  /** The gateway over a built server, its member fetches answered from the cache. */
  function gatewayOver(made: ReturnType<typeof serverWith>) {
    const fetched: Array<{ user: string; force: boolean }> = [];
    const members = made.guild.members as unknown as {
      fetch(options: { user: string; force?: boolean }): Promise<GuildMember>;
    };
    members.fetch = (options) => {
      fetched.push({ user: options.user, force: options.force === true });
      return Promise.resolve(made.memberOf(options.user));
    };
    const gateway = new DiscordPartyGateway();
    gateway.use(made.client);
    return { gateway, fetched };
  }

  it('fetches the member once and says how they stand to every gate, and what roles would do', async () => {
    const made = serverWith([
      everyoneDenied,
      northAllowed,
      { id: BROCK, type: OverwriteType.Member, allow: '0', deny: VIEW },
    ]);
    const { gateway, fetched } = gatewayOver(made);
    const misty = await gateway.memberGates(
      GUILD,
      MISTY,
      [FORUM, TEXT, '600000000000000099'],
      true,
    );
    expect(fetched).toEqual([{ user: MISTY, force: true }]);
    expect(misty?.held).toEqual([]);
    expect(Object.fromEntries(misty?.access ?? [])).toEqual({
      [FORUM]: 'hidden',
      [TEXT]: 'visible',
    });
    expect(misty?.seesWith(FORUM, new Set([NORTH]))).toBe(true);
    expect(misty?.seesWith('600000000000000099', new Set([NORTH]))).toBe(false);
    const ash = await gateway.memberGates(GUILD, ASH, [FORUM], false);
    expect(fetched.at(-1)).toEqual({ user: ASH, force: false });
    expect(ash?.held).toEqual([NORTH]);
    expect(ash?.access.get(FORUM)).toBe('visible');
    expect(ash?.seesWith(FORUM, new Set())).toBe(false);
    const brock = await gateway.memberGates(GUILD, BROCK, [FORUM], true);
    expect(brock?.access.get(FORUM)).toBe('barred');
    expect(brock?.seesWith(FORUM, new Set([NORTH]))).toBe(false);
    // What keeps them out (A6): Brock's own overwrite; nobody's role here.
    expect(brock?.denials(FORUM)).toEqual({ own: true, roles: [] });
    expect(misty?.denials(FORUM)).toEqual({ own: false, roles: [] });
  });

  it('names the roles a member holds whose overwrites deny the view (A6)', async () => {
    const made = serverWith([everyoneDenied, northAllowed, mutedDenied]);
    const { gateway } = gatewayOver(made);
    const brock = await gateway.memberGates(GUILD, BROCK, [FORUM], true);
    expect(brock?.denials(FORUM)).toEqual({ own: false, roles: [MUTED] });
    expect(brock?.denials('600000000000000099')).toEqual({ own: false, roles: [] });
  });

  it('answers nothing for a server the bot is not in', async () => {
    const { gateway } = gatewayOver(serverWith([]));
    expect(await gateway.memberGates('400000000000000002', MISTY, [FORUM], true)).toBeUndefined();
  });
});
