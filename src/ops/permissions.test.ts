import { OverwriteType, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  basePermissions,
  channelPermissions,
  missingNeeds,
  REGION_CHANNEL_NEEDS,
  regionsKept,
  SERVER_NEEDS,
  shareKeeps,
} from './permissions.js';

const GUILD = '100000000000000001';
const BOT = '200000000000000001';
const BOT_ROLE = '300000000000000001';
const MOD_ROLE = '300000000000000002';

const bits = (...flags: bigint[]): string => String(flags.reduce((all, flag) => all | flag, 0n));

const roles = [
  { id: GUILD, name: '@everyone', permissions: bits(P.ViewChannel, P.SendMessages), position: 0 },
  { id: BOT_ROLE, name: 'Pine', permissions: bits(P.ManageChannels, P.ManageRoles), position: 5 },
  { id: MOD_ROLE, name: 'Mods', permissions: bits(P.Administrator), position: 9 },
];
const guild = { id: GUILD, ownerId: '200000000000000099' };
const bot = { id: BOT, roleIds: [BOT_ROLE] };

describe('basePermissions', () => {
  it("joins the everyone role's permissions with the member's roles", () => {
    const base = basePermissions(guild, roles, bot);
    expect(base).toBe(P.ViewChannel | P.SendMessages | P.ManageChannels | P.ManageRoles);
  });

  it('gives everything to an administrator and to the owner', () => {
    const all = basePermissions(guild, roles, { id: BOT, roleIds: [MOD_ROLE] });
    expect(all & P.ManageThreads).toBe(P.ManageThreads);
    const owner = basePermissions(guild, roles, { id: guild.ownerId, roleIds: [] });
    expect(owner & P.BanMembers).toBe(P.BanMembers);
  });
});

describe('channelPermissions', () => {
  const base = basePermissions(guild, roles, bot);

  it('applies the overwrites of everyone, then the roles, then the member', () => {
    const overwrites = [
      {
        id: GUILD,
        type: OverwriteType.Role,
        allow: '0',
        deny: bits(P.ViewChannel, P.SendMessages),
      },
      { id: BOT_ROLE, type: OverwriteType.Role, allow: bits(P.ViewChannel), deny: '0' },
      { id: BOT, type: OverwriteType.Member, allow: bits(P.EmbedLinks), deny: bits(P.ManageRoles) },
    ];
    const channel = channelPermissions(base, GUILD, bot, overwrites);
    expect(channel & P.ViewChannel).toBe(P.ViewChannel);
    expect(channel & P.SendMessages).toBe(0n);
    expect(channel & P.EmbedLinks).toBe(P.EmbedLinks);
    expect(channel & P.ManageRoles).toBe(0n);
  });

  it("lets a role's allowance beat another role's denial", () => {
    const overwrites = [
      { id: BOT_ROLE, type: OverwriteType.Role, allow: bits(P.SendMessages), deny: '0' },
      { id: MOD_ROLE, type: OverwriteType.Role, allow: '0', deny: bits(P.SendMessages) },
    ];
    const both = { id: BOT, roleIds: [BOT_ROLE, MOD_ROLE] };
    // The administrator role makes everything allowed whatever the overwrites say.
    expect(channelPermissions(basePermissions(guild, roles, both), GUILD, both, overwrites)).toBe(
      basePermissions(guild, roles, both),
    );
    const plain = roles.map((role) =>
      role.id === MOD_ROLE ? { ...role, permissions: '0' } : role,
    );
    const base2 = basePermissions(guild, plain, both);
    expect(channelPermissions(base2, GUILD, both, overwrites) & P.SendMessages).toBe(
      P.SendMessages,
    );
  });
});

describe('shareKeeps (plan 8H-5, R-A)', () => {
  const MEMBER = '300000000000000003';
  const MUTED = '300000000000000004';
  const BROCK = '200000000000000002';
  const view = String(P.ViewChannel);
  const role = (id: string, allow: string, deny: string) => ({
    id,
    type: OverwriteType.Role,
    allow,
    deny,
  });
  /** A server whose everyone role sees every channel, with a member role and a muted role. */
  const open = [
    { id: GUILD, permissions: P.ViewChannel | P.SendMessages },
    { id: MEMBER, permissions: 0n },
    { id: MUTED, permissions: 0n },
  ];
  /** A gated server: everyone sees nothing; the member role sees the channels. */
  const gated = [
    { id: GUILD, permissions: 0n },
    { id: MEMBER, permissions: P.ViewChannel | P.SendMessages },
    { id: MUTED, permissions: 0n },
  ];
  const keeps = (
    roles: typeof open,
    region: ReturnType<typeof role>[],
    share:
      | ReturnType<typeof role>[]
      | { id: string; type: OverwriteType; allow: string; deny: string }[],
    rolesOf: (id: string) => readonly string[] | null | undefined = () => undefined,
  ) => shareKeeps({ guildId: GUILD, roles, region, share, rolesOf });

  it('keeps a region everyone sees shared where everyone sees, and drops a private one', () => {
    expect(keeps(open, [], [])).toBe(true);
    expect(keeps(open, [role(GUILD, '0', view), role(MEMBER, view, '0')], [])).toBe(false);
    // Shared where only the member role sees, a region only that role sees is kept.
    expect(
      keeps(
        open,
        [role(GUILD, '0', view), role(MEMBER, view, '0')],
        [role(GUILD, '0', view), role(MEMBER, view, '0')],
      ),
    ).toBe(true);
  });

  it('judges a gated server by its roles: everyone there sees nothing', () => {
    expect(keeps(gated, [], [])).toBe(true);
    // A forum kept from the member role, open to a moderators' role, is dropped.
    expect(keeps(gated, [role(MEMBER, '0', view), role(MOD_ROLE, view, '0')], [])).toBe(false);
  });

  it('drops a region a denied role held beside one that sees the share channel keeps out', () => {
    // The share channel lets the member role in; the forum denies the muted role, which a member
    // of both holds: allows beat denies on the share channel, the denial wins on the forum.
    const share = [role(GUILD, '0', view), role(MEMBER, view, '0')];
    expect(keeps(open, [role(MUTED, '0', view)], share)).toBe(false);
    expect(keeps(open, [], share)).toBe(true);
  });

  it('drops a region a member let into the share channel by name does not see, or is unknown', () => {
    const share = [
      role(GUILD, '0', view),
      { id: BROCK, type: OverwriteType.Member, allow: view, deny: '0' },
    ];
    const region = [role(MUTED, '0', view)];
    expect(keeps(open, region, share, () => [])).toBe(true);
    expect(keeps(open, region, share, () => [MUTED])).toBe(false);
    // Not in the cache: nobody can say what they see.
    expect(keeps(open, region, share)).toBe(false);
    // A member's own denial on the forum is accepted: counts only, nobody named.
    expect(
      keeps(
        open,
        [{ id: BROCK, type: OverwriteType.Member, allow: '0', deny: view }],
        [],
        () => [],
      ),
    ).toBe(true);
    // A member let in by name who is not in the server lets nobody in (R2).
    expect(
      keeps(
        open,
        [role(MUTED, '0', view)],
        [role(GUILD, '0', view), { id: BROCK, type: OverwriteType.Member, allow: view, deny: '0' }],
        () => null,
      ),
    ).toBe(true);
  });

  it('keeps a region whose channel is the one shared into, or the forum of the post shared into (R2)', () => {
    const closed = [role(GUILD, '0', view), role(MEMBER, view, '0')];
    const kept = regionsKept({
      guildId: GUILD,
      roles: open,
      share: [],
      shareIds: ['post', 'forum'],
      regions: [
        { id: 'forum', overwrites: closed },
        { id: 'other', overwrites: closed },
        { id: 'open', overwrites: [] },
      ],
      rolesOf: () => undefined,
    });
    expect([...kept]).toEqual(['forum', 'open']);
  });

  it('reads each share overwrite and asks of each named member once a share, however many regions (8H5-4)', () => {
    let reads = 0;
    const counted = (one: { id: string; type: OverwriteType; allow: string; deny: string }) => ({
      id: one.id,
      type: one.type,
      get allow() {
        reads += 1;
        return one.allow;
      },
      get deny() {
        reads += 1;
        return one.deny;
      },
    });
    const share = [
      counted(role(GUILD, '0', view)),
      counted(role(MEMBER, view, '0')),
      counted({ id: BROCK, type: OverwriteType.Member, allow: view, deny: '0' }),
    ];
    let asked = 0;
    const kept = regionsKept({
      guildId: GUILD,
      roles: open,
      share,
      shareIds: ['room'],
      regions: Array.from({ length: 6 }, (_, n) => ({
        id: `forum${String(n)}`,
        overwrites: n % 2 === 0 ? [] : [role(MUTED, '0', view)],
      })),
      rolesOf: () => {
        asked += 1;
        return [MEMBER];
      },
    });
    expect([...kept]).toEqual(['forum0', 'forum2', 'forum4']);
    expect(asked).toBe(1);
    // Each of the three overwrites' two fields read once (twice for Brock's allow, which also
    // says he is let in by name).
    expect(reads).toBeLessThanOrEqual(share.length * 2 + 1);
  });

  /** A small seeded generator (mulberry32): the same cases on every run. */
  const seeded = (seed: number) => {
    let state = seed >>> 0;
    return (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
  };

  it('agrees with a search over every set of roles on random servers (R1)', () => {
    const random = seeded(8_005);
    const ids = [
      '300000000000000011',
      '300000000000000012',
      '300000000000000013',
      '300000000000000014',
    ];
    const pick = <T>(choices: readonly T[]): T =>
      choices[Math.floor(random() * choices.length)] as T;
    /** View allowed, denied or neither for everyone and each role, maybe none at all. */
    const overwrites = () =>
      [GUILD, ...ids].flatMap((id) => {
        const how = pick(['allow', 'deny', 'none', 'none'] as const);
        return how === 'none'
          ? []
          : [role(id, how === 'allow' ? view : '0', how === 'deny' ? view : '0')];
      });
    let differing = 0;
    let dropped = 0;
    for (let n = 0; n < 2_000; n++) {
      const roles = [GUILD, ...ids].map((id) => ({
        id,
        // Now and then an administrator role, which sees everything.
        permissions:
          random() < 0.03 ? P.Administrator : pick([0n, 0n, P.ViewChannel, P.SendMessages]),
      }));
      const region = overwrites();
      const share = overwrites();
      // The search: every set of the four roles (everyone's alone included) that sees the share
      // channel must see the region.
      let expected = true;
      for (let mask = 0; mask < 1 << ids.length; mask++) {
        const member = { id: '', roleIds: ids.filter((_, bit) => (mask & (1 << bit)) !== 0) };
        let base = roles[0]?.permissions ?? 0n;
        for (const id of member.roleIds)
          base |= roles.find((one) => one.id === id)?.permissions ?? 0n;
        if ((base & P.Administrator) !== 0n) base = PermissionsBitField.All;
        const sees = (on: typeof region) =>
          (channelPermissions(base, GUILD, member, on) & P.ViewChannel) !== 0n;
        if (sees(share) && !sees(region)) expected = false;
      }
      const got = shareKeeps({ guildId: GUILD, roles, region, share, rolesOf: () => undefined });
      if (got !== expected) differing += 1;
      if (!expected) dropped += 1;
    }
    expect(differing).toBe(0);
    // The cases are not all of one kind.
    expect(dropped).toBeGreaterThan(200);
    expect(dropped).toBeLessThan(1_800);
  });

  it('keeps of many regions at once what it keeps of each alone (8H5-4)', () => {
    const random = seeded(8_054);
    const ids = ['300000000000000011', '300000000000000012', '300000000000000013'];
    const pick = <T>(choices: readonly T[]): T =>
      choices[Math.floor(random() * choices.length)] as T;
    const overwrites = () =>
      [GUILD, ...ids].flatMap((id) => {
        const how = pick(['allow', 'deny', 'none', 'none'] as const);
        return how === 'none'
          ? []
          : [role(id, how === 'allow' ? view : '0', how === 'deny' ? view : '0')];
      });
    for (let n = 0; n < 300; n++) {
      const roles = [GUILD, ...ids].map((id) => ({
        id,
        permissions: pick([0n, P.ViewChannel, P.SendMessages]),
      }));
      const share = [
        ...overwrites(),
        ...(random() < 0.3
          ? [{ id: BROCK, type: OverwriteType.Member, allow: view, deny: '0' }]
          : []),
      ];
      const brock = pick([undefined, null, [], [ids[0] ?? '']] as const);
      const regions = Array.from({ length: 5 }, (_, k) => ({
        id: `forum${String(k)}`,
        overwrites: overwrites(),
      }));
      const server = { guildId: GUILD, roles, share, rolesOf: () => brock };
      const together = regionsKept({ ...server, shareIds: ['room'], regions });
      const alone = regions.filter((one) => shareKeeps({ ...server, region: one.overwrites }));
      expect([...together]).toEqual(alone.map((one) => one.id));
    }
  });
});

describe('missingNeeds', () => {
  it('names what the bot lacks, required and optional apart', () => {
    const missing = missingNeeds(P.ViewChannel | P.SendMessages, REGION_CHANNEL_NEEDS);
    expect(missing.required.map((need) => need.name)).toEqual([
      'Embed Links',
      'Attach Files',
      'Read Message History',
    ]);
    // Nothing is pinned in a region's channel since plan 8R-9: Pin Messages is not asked.
    expect(missing.optional.map((need) => need.name)).toEqual(['Add Reactions', 'Manage Messages']);
  });

  it('finds nothing missing for an administrator', () => {
    const all = basePermissions(guild, roles, { id: BOT, roleIds: [MOD_ROLE] });
    expect(missingNeeds(all, SERVER_NEEDS)).toEqual({ required: [], optional: [] });
  });
});
