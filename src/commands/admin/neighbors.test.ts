import { describe, expect, it } from 'vitest';
import {
  asV2,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { textsOf } from '../../../test/support/boss-commands.js';
import { buttonsOf, textOf } from '../../../test/support/messages.js';
import {
  NEIGHBOR_ASH as ASH,
  NEIGHBOR_BROCK as BROCK,
  NEIGHBOR_MISTY as MISTY,
  neighborRow,
} from '../../../test/support/server-neighbor-cases.js';
import { neighborsWith } from '../../../test/support/server-neighbors.js';
import { neighborCopyWith } from '../../../test/support/neighbor-gyms.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { BOT_STAFF_ONLY } from '../../discord/guards.js';
import { InteractionRouter } from '../../discord/router.js';
import { NEIGHBORS_MAX, neighborPair, type NeighborRow } from '../../domain/servers/neighbors.js';
import { ASKED } from '../../render/server-neighbors.js';
import { admin } from './index.js';
import { copySaid, neighborControls, NOT_A_SERVER } from './neighbors.js';

const STAFF = '200000000000000001';
const MEMBER = '200000000000000002';

async function neighborCommandsWith(
  options: { rows?: readonly NeighborRow[]; reachable?: string[] } = {},
) {
  const made = await neighborsWith(options);
  // Pallet Town is the gyms' test server (row 1), Pewter City the second (row 2), Cerulean the third.
  const copying = await neighborCopyWith();
  const rows = new Map([
    [ASH, 1],
    [BROCK, 2],
    [MISTY, 3],
  ]);
  const invites = new Map([
    ['pewter-gym', BROCK],
    ['pallet', ASH],
  ]);
  // The invite codes Discord was asked about, in order.
  const invitesAsked: string[] = [];
  const { ctx } = createTestContext({
    neighbors: made.neighbors,
    invites: {
      serverOfInvite: (code) => {
        invitesAsked.push(code);
        return Promise.resolve(invites.get(code));
      },
    },
    neighborCopy: copying.copy,
    guilds: { idFor: (snowflake) => Promise.resolve(rows.get(snowflake)) },
  });
  const router = new InteractionRouter(ctx, [admin], [neighborControls]);
  const staff = (guildId: string) => ({ userId: STAFF, roleNames: ['Admin'], guildId });
  const use = async (
    subcommand: string,
    options: Record<string, string>,
    guildId = ASH,
    who: object = staff(guildId),
  ) => {
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommandGroup: 'neighbors',
      subcommand,
      options,
      ...who,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const press = async (customId: string, guildId: string, who: object = staff(guildId)) => {
    const interaction = fakeButton({ customId, v2Message: true, ...who });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, ctx, router, use, press, staff, copying, invitesAsked };
}

describe('/admin neighbors (plan 19E)', () => {
  it('asks a server by its id or an invite link, and its staff are told in their lab', async () => {
    const made = await neighborCommandsWith();
    expect(said(await made.use('ask', { server: 'https://discord.gg/pewter-gym' }))).toBe(
      'Asked. Their staff answer in their moderators’ bot lab, and I tell your moderators’ bot ' +
        'lab when they do. A request nobody answers expires after a week.',
    );
    expect(made.lab.of(BROCK)).toHaveLength(1);
    expect(made.lab.of(MISTY)).toEqual([]);
    // Asked again by its id: one request per pair, and nothing sent twice.
    expect(said(await made.use('ask', { server: BROCK }))).toBe(ASKED);
    expect(made.lab.of(BROCK)).toHaveLength(1);
  });

  it('answers an invite Discord does not know, and a server it cannot tell, as any request', async () => {
    const made = await neighborCommandsWith({ reachable: [ASH] });
    expect(said(await made.use('ask', { server: 'discord.gg/nowhere' }))).toBe(ASKED);
    expect(said(await made.use('ask', { server: MISTY }))).toBe(ASKED);
    expect(made.lab.posted).toEqual([]);
  });

  it('refuses what is no server, and the server itself', async () => {
    const made = await neighborCommandsWith();
    expect(said(await made.use('ask', { server: 'Pewter City' }))).toBe(
      'Give the server’s ID (17 to 20 digits) or an invite link to it, such as ' +
        'https://discord.gg/abc123.',
    );
    expect(said(await made.use('ask', { server: 'https://discord.gg/pallet' }))).toBe(
      'That is this server: a server cannot be its own neighbor.',
    );
  });

  it('is for staff only', async () => {
    const made = await neighborCommandsWith();
    const used = await made.use('ask', { server: BROCK }, ASH, {
      userId: MEMBER,
      roleNames: [],
      guildId: ASH,
    });
    expect(said(used)).toBe(BOT_STAFF_ONLY);
    expect(made.store.rows.size).toBe(0);
  });

  it('is accepted by the other server’s staff in their lab, the post shown anew in place', async () => {
    const made = await neighborCommandsWith();
    await made.use('ask', { server: BROCK });
    const [request] = made.lab.of(BROCK);
    const accept = buttonsOf(request).find((button) => button.label === 'Accept')?.customId;
    // A member who is not staff, and staff of a third server, cannot answer it.
    const member = await made.press(accept!, BROCK, {
      userId: MEMBER,
      roleNames: [],
      guildId: BROCK,
    });
    expect(said(member)).toBe(BOT_STAFF_ONLY);
    const elsewhere = await made.press(accept!, MISTY);
    expect(said(elsewhere)).toBe('This request has expired or was answered already.');
    expect(made.neighbors.areNeighbors(ASH, BROCK)).toBe(false);
    const pressed = await made.press(accept!, BROCK);
    const shown = asV2(pressed.update.mock.calls[0]![0]);
    expect(textOf(shown)).toBe(
      '### Neighbors\n**Pallet Town** (`412345678901234501`) and this server are neighbors now. ' +
        'Either can end it with `/admin neighbors end`.',
    );
    expect(buttonsOf(shown)).toEqual([]);
    expect(made.neighbors.areNeighbors(ASH, BROCK)).toBe(true);
    expect(made.neighbors.neighborsOf(MISTY)).toEqual([]);
    expect(made.lab.of(ASH)).toHaveLength(1);
  });

  it('points staff to the request the other server sent them already', async () => {
    const made = await neighborCommandsWith({ rows: [neighborRow()] });
    expect(said(await made.use('ask', { server: ASH }, BROCK))).toBe(
      '**Pallet Town** (`412345678901234501`) already asked to be this server’s neighbor. Its ' +
        'request is posted again in your moderators’ bot lab: accept it there.\n\n' +
        'If it does not show up, choose a moderators’ bot lab in `/admin settings` or allow me ' +
        'to post in it, then ask again.',
    );
  });

  it('shows a declined request anew in its place, saying when its server may ask again', async () => {
    const made = await neighborCommandsWith({ rows: [neighborRow()] });
    const pressed = await made.press(`neighbor:${ASH}:decline`, BROCK);
    expect(textOf(asV2(pressed.update.mock.calls[0]![0]))).toMatch(
      /^### Request declined\nThis server declined the request of \*\*Pallet Town\*\* \(`412345678901234501`\) to be neighbors\. That server may ask again <t:\d+:R>\.$/,
    );
  });

  it('says in its help what the limit counts, and that a copy takes what the neighbor adds later', () => {
    expect(admin.subcommands.get('neighbors ask')?.help?.details).toContain(
      'A server may have 10 neighbors and requests it sent, together.',
    );
    expect(admin.subcommands.get('neighbors copy')?.help?.details).toContain(
      'run it again to copy what the neighbor adds later.',
    );
  });

  it('refuses an acceptance past the limit, saying how to make room', async () => {
    const others = Array.from({ length: NEIGHBORS_MAX }, (_, n) =>
      neighborRow({
        ...neighborPair(BROCK, String(512345678901234500n + BigInt(n))),
        askedBy: BROCK,
        acceptedAt: 1,
      }),
    );
    const made = await neighborCommandsWith({ rows: [neighborRow(), ...others] });
    expect(said(await made.press(`neighbor:${ASH}:accept`, BROCK))).toBe(
      'This server already has 10 neighbors and requests it sent, together the most it may ' +
        'have. End a neighbor or take back a request with `/admin neighbors end`, then accept ' +
        'this one.',
    );
  });

  it('answers a press at once while the post in the asker’s lab hangs (review R1)', async () => {
    const made = await neighborCommandsWith({ rows: [neighborRow()] });
    made.lab.hold = new Promise<void>(() => undefined);
    const pressed = await made.press(`neighbor:${ASH}:accept`, BROCK);
    expect(textOf(asV2(pressed.update.mock.calls[0]![0]))).toContain('are neighbors now');
    expect(made.lab.of(ASH)).toHaveLength(1);
  });

  it('tells the other server once a week, whichever of the staff asks again (review R2)', async () => {
    const made = await neighborCommandsWith();
    const other = { userId: MEMBER, roleNames: ['Admin'], guildId: ASH };
    expect(said(await made.use('ask', { server: BROCK }))).toBe(ASKED);
    expect(said(await made.use('end', { server: BROCK }))).toBe(
      'Took back this server’s request to `412345678901234502`.',
    );
    expect(said(await made.use('ask', { server: BROCK }, ASH, other))).toBe(ASKED);
    await made.neighbors.idle();
    expect(made.lab.of(BROCK)).toHaveLength(1);
  });

  it('holds a server’s asks to five in ten minutes, across its staff (review R2)', async () => {
    const made = await neighborCommandsWith();
    const other = { userId: MEMBER, roleNames: ['Admin'], guildId: ASH };
    const servers = Array.from({ length: 6 }, (_, n) => String(512345678901234500n + BigInt(n)));
    for (const server of servers.slice(0, 3)) {
      expect(said(await made.use('ask', { server }))).toBe(ASKED);
    }
    // Refused before anything is counted against the server: not a server, the server itself.
    expect(said(await made.use('ask', { server: 'nowhere' }, ASH, other))).toBe(NOT_A_SERVER);
    expect(said(await made.use('ask', { server: ASH }, ASH, other))).toBe(
      'That is this server: a server cannot be its own neighbor.',
    );
    for (const server of servers.slice(3, 5)) {
      expect(said(await made.use('ask', { server }, ASH, other))).toBe(ASKED);
    }
    expect(said(await made.use('ask', { server: servers[5]! }, ASH, other))).toBe(
      'This server’s staff have sent 5 requests to be neighbors in ten minutes, the most they ' +
        'may. Ask again in 10 minutes.',
    );
    expect(made.store.rows.size).toBe(5);
    // Another server's staff are not held by it.
    expect(said(await made.use('ask', { server: servers[5]! }, BROCK))).toBe(ASKED);
  });

  it('gives a member back the use their server’s throttle refused (review RR2)', async () => {
    const made = await neighborCommandsWith();
    const other = { userId: MEMBER, roleNames: ['Admin'], guildId: ASH };
    const servers = Array.from({ length: 6 }, (_, n) => String(512345678901234500n + BigInt(n)));
    // Four asks of hers and one of another's: the server's five in ten minutes.
    for (const server of servers.slice(0, 4)) {
      expect(said(await made.use('ask', { server }))).toBe(ASKED);
    }
    expect(said(await made.use('ask', { server: servers[4]! }, ASH, other))).toBe(ASKED);
    expect(said(await made.use('ask', { server: servers[5]! }))).toBe(
      'This server’s staff have sent 5 requests to be neighbors in ten minutes, the most they ' +
        'may. Ask again in 10 minutes.',
    );
    // Her fifth use was given back: she may still ask in another server she is staff of.
    expect(said(await made.use('ask', { server: servers[5]! }, BROCK))).toBe(ASKED);
  });

  it('lists the server’s neighbors and requests, naming only what it may', async () => {
    const made = await neighborCommandsWith({
      rows: [
        neighborRow({ acceptedAt: Date.parse('2026-11-10T12:00:00Z') }),
        { ...neighborRow({ askedBy: ASH }), serverA: ASH, serverB: MISTY },
      ],
    });
    const listed = said(await made.use('list', {}));
    expect(listed).toContain('**Neighbors** (1)\n- **Pewter City** (`412345678901234502`)');
    // A request this server sent names the server by the id it was given, never by its name.
    expect(listed).toContain('**Requests sent**\n- `412345678901234503`, asked');
    expect(listed).not.toContain('Cerulean City');
    const brock = said(await made.use('list', {}, BROCK));
    expect(brock).toContain('- **Pallet Town** (`412345678901234501`)');
    const misty = said(await made.use('list', {}, MISTY));
    expect(misty).toContain('**Requests received**\n- **Pallet Town**');
    const none = await neighborCommandsWith();
    expect(said(await none.use('list', {}))).toBe(
      '**Neighbors** (0)\nNone yet. Ask a server with `/admin neighbors ask`.',
    );
  });

  it('ends being neighbors from either side, and offers the neighbors to end', async () => {
    const made = await neighborCommandsWith({ rows: [neighborRow({ acceptedAt: 1 })] });
    const typing = fakeAutocomplete({
      commandName: 'admin',
      subcommandGroup: 'neighbors',
      subcommand: 'end',
      focused: '',
      focusedName: 'server',
      ...made.staff(BROCK),
    });
    await made.router.handle(typing as never);
    expect(typing.respond).toHaveBeenCalledWith([
      { name: 'Pallet Town (412345678901234501)', value: ASH },
    ]);
    expect(said(await made.use('end', { server: ASH }, BROCK))).toBe(
      'This server and **Pallet Town** are no longer neighbors. Both servers’ moderators’ bot ' +
        'labs are told.',
    );
    expect(made.neighbors.areNeighbors(ASH, BROCK)).toBe(false);
    expect(said(await made.use('end', { server: ASH }, BROCK))).toBe(
      'This server is not neighbors with `412345678901234501` and has no open request to it.',
    );
  });

  it('holds `end` to ten uses a member, and a server’s invite links in it to five, in ten minutes (final review R6-2)', async () => {
    const made = await neighborCommandsWith();
    const other = { userId: MEMBER, roleNames: ['Admin'], guildId: ASH };
    const none = 'This server is not neighbors with that server and has no open request to it.';
    for (let n = 0; n < 5; n += 1) {
      expect(
        said(await made.use('end', { server: `https://discord.gg/nowhere${String(n)}` })),
      ).toBe(none);
    }
    // The server's five invite links: another of its staff is refused before Discord is asked,
    // and that use is given back to them.
    expect(said(await made.use('end', { server: 'discord.gg/pewter-gym' }, ASH, other))).toBe(
      'This server’s staff have named 5 servers by invite link in ten minutes, the most they ' +
        'may. Give the server’s ID instead, or try again in 10 minutes.',
    );
    expect(made.invitesAsked).toHaveLength(5);
    // By its ID, a server is named without Discord, up to each member's ten uses.
    for (let n = 0; n < 5; n += 1) {
      expect(said(await made.use('end', { server: BROCK }))).toBe(
        'This server is not neighbors with `412345678901234502` and has no open request to it.',
      );
    }
    expect(said(await made.use('end', { server: BROCK }))).toBe(
      'You can use /admin neighbors end again in 10 minutes.',
    );
    for (let n = 0; n < 10; n += 1) {
      expect(said(await made.use('end', { server: BROCK }, ASH, other))).not.toContain(
        'You can use',
      );
    }
    // Another server's staff are not held by it.
    const theirs = { userId: '200000000000000003', roleNames: ['Admin'], guildId: BROCK };
    expect(said(await made.use('end', { server: 'discord.gg/pallet' }, BROCK, theirs))).toBe(
      'This server is not neighbors with `412345678901234501` and has no open request to it.',
    );
    expect(made.invitesAsked).toHaveLength(6);
  });

  it('copies a neighbor’s curated gym texts onto this server’s same gyms, never over its own', async () => {
    const made = await neighborCommandsWith({ rows: [neighborRow({ acceptedAt: 1 })] });
    expect(said(await made.use('copy', { server: BROCK }))).toBe(
      'Copied from **Pewter City** onto 2 gyms of this server: 1 nickname, 1 notice and 1 list ' +
        'of search words. Nothing your staff set was replaced. 1 gym is already shared by both ' +
        'servers, with the same texts in both.\n\nRun it again later to copy what **Pewter City** ' +
        'adds.',
    );
    expect(made.copying.directory.of(1).get(2)?.nickname).toBe('Splash');
    expect(said(await made.use('copy', { server: BROCK }))).toBe(
      'Nothing to copy from **Pewter City**: on the gyms you both have, this server’s texts are ' +
        'filled in already, or **Pewter City**’s are empty. 1 gym is already shared by both ' +
        'servers, with the same texts in both.',
    );
    // Only from a neighbor.
    expect(said(await made.use('copy', { server: MISTY }))).toBe(
      'This server is not neighbors with `412345678901234503`. You can copy only from a neighbor.',
    );
  });

  it('says a copy onto one gym in the singular (staging F2)', () => {
    const one = { gyms: 1, shared: 0, nickname: 1, notice: 0, description: 0, keywords: 0 };
    expect(copySaid('**Pewter City**', one)).toBe(
      'Copied from **Pewter City** onto 1 gym of this server: 1 nickname. Nothing your staff ' +
        'set was replaced.\n\nRun it again later to copy what **Pewter City** adds.',
    );
    const shared = { gyms: 0, shared: 2, nickname: 0, notice: 0, description: 0, keywords: 0 };
    expect(copySaid('**Pewter City**', shared)).toBe(
      'Nothing to copy from **Pewter City**: on the gyms you both have, this server’s texts are ' +
        'filled in already, or **Pewter City**’s are empty. 2 gyms are already shared by both ' +
        'servers, with the same texts in both.',
    );
  });
});

/** What the member was told: the answer, or the refusal the router sent after a deferral. */
function said(interaction: FakeInteraction): string | undefined {
  return textsOf(interaction)
    .filter((text) => text !== '')
    .at(-1);
}
