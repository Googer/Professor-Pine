import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asV2, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { textOf } from '../../../test/support/messages.js';
import { ALICE, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { TestServers } from '../../../test/support/server-values.js';
import { AUDIT_LINES, AUDIT_WHERE, NOTHING_LOGGED } from '../../render/audit.js';
import { audit } from './audit.js';
import { closePartyAs } from './delete.js';

const MOD = { id: '200000000000000009', name: 'Misty' };
const MODERATORS = '300000000000000099';

async function setup() {
  const made = await reportedRaid({ anonymous: true, reporter: { name: 'Ash' } });
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
    partyAudit: made.auditStore,
  });
  const router = new InteractionRouter(ctx, [audit], []);
  /** `/audit` by Alice with these roles, in the raid's post unless `where` says otherwise. */
  const run = async (roleNames: string[] = ['Moderator'], where: object = {}) => {
    await made.service.flush();
    await made.audit.flush();
    const interaction = fakeChatInput({
      commandName: 'audit',
      userId: ALICE,
      roleNames,
      guildId: made.gateway.guildId,
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
      ...where,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** The private answer's text. */
  const answerOf = (interaction: Awaited<ReturnType<typeof run>>) =>
    textOf(asV2(sent(interaction.editReply)));
  return { made, ctx, run, answerOf };
}

describe('/audit', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is for staff, as /delete is: Manage Messages by default', () => {
    expect(audit.data.toJSON().default_member_permissions).toBe(
      String(PermissionFlagsBits.ManageMessages),
    );
  });

  it('refuses a member who is not staff, privately', async () => {
    const { run } = await setup();
    const used = await run([]);
    const reply = sent(used.reply);
    expect((reply.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    expect(JSON.stringify(reply)).toContain('Only admins and moderators');
  });

  it("shows the post's log privately, naming the anonymous reporter", async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
    const { run, answerOf, made } = await setup();
    await made.service.keep(made.party.id, true, { id: ALICE, name: 'Alice' });
    const used = await run();
    expect(used.ephemeral).toBe(true);
    const text = answerOf(used);
    expect(text).toContain('### Log of this raid');
    expect(text).toContain(
      `**Ash** (<@${REPORTER}>) reported it (anonymous in the post): Level 5 raid (egg) at **The Stacks**.`,
    );
    expect(text).toContain(`**Alice** (<@${ALICE}>) kept its post open`);
  });

  it('shows the log of a post whose raid has ended', async () => {
    const { run, answerOf, made, ctx } = await setup();
    await closePartyAs(ctx, made.party, MOD, 'archive');
    const text = answerOf(await run());
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(text).toContain(`**Misty** (<@${MOD.id}>) closed it (archived the post).`);
  });

  it('shows the newest 25 changes and counts the earlier ones', async () => {
    const { run, answerOf, made } = await setup();
    for (let n = 0; n < 15; n++) {
      await made.service.keep(made.party.id, true, { id: ALICE });
      await made.service.keep(made.party.id, false, { id: ALICE });
    }
    const text = answerOf(await run());
    // 31 entries: the creation, which stays first, and 30 changes, of which 25 are shown.
    expect(text.split('\n')[1]).toContain('reported it (anonymous in the post)');
    expect(text).toContain('-# …and 5 earlier changes');
    expect(text.split('\n').filter((line) => line.includes('/admin save-party'))).toHaveLength(25);
  });

  it('says so where nothing is logged for the post', async () => {
    const { run, answerOf } = await setup();
    const text = answerOf(await run(['Moderator'], { channelId: '400000000000000099' }));
    expect(text).toContain(NOTHING_LOGGED);
  });

  it('asks for a post or a member outside a post', async () => {
    const { run } = await setup();
    const used = await run(['Moderator'], { channelId: WEST_CHANNEL, thread: undefined });
    const answers = [used.reply, used.editReply, used.followUp].flatMap((mock) =>
      mock.mock.calls.map((call) => JSON.stringify(call[0])),
    );
    expect(answers.join(' ')).toContain(JSON.stringify(AUDIT_WHERE).slice(1, -1));
    // Private: the deferral was, so the answer that follows is.
    expect(used.ephemeral).toBe(true);
    expect(used.reply).not.toHaveBeenCalled();
  });

  it("shows a member's changes in the server, each with its post", async () => {
    const { run, answerOf, made } = await setup();
    await made.service.keep(made.party.id, true, { id: ALICE, name: 'Alice' });
    const text = answerOf(
      await run(['Moderator'], {
        channelId: WEST_CHANNEL,
        thread: undefined,
        resolved: { member: { id: ALICE, bot: false, username: 'alice', globalName: 'Alice' } },
        resolvedMembers: { member: { displayName: 'Alice A.' } },
      }),
    );
    expect(text).toContain(`### Changes by **Alice A.** (<@${ALICE}>)`);
    expect(text).toContain(`in <#${made.postId}>: kept its post open`);
    expect(text).not.toContain('reported it');
  });

  it("lists the member's changes of the server's settings among them, by time (plan 19A-1)", async () => {
    const { run, answerOf, made, ctx } = await setup();
    if (!(ctx.servers instanceof TestServers)) throw new Error('no TestServers');
    const servers = ctx.servers;
    const alice = { id: ALICE, name: 'Alice' };
    servers.now = () => made.clock.now - 60_000;
    await servers.set(made.gateway.guildId, (v) => ({ ...v, postNewGyms: false }), alice);
    await made.service.keep(made.party.id, true, alice);
    servers.now = () => made.clock.now + 60_000;
    await servers.set(
      made.gateway.guildId,
      (v) => ({ ...v, channels: { ...v.channels, moderation: MODERATORS } }),
      alice,
    );
    // Another member's change, and one in another server, are not hers here.
    await servers.set(made.gateway.guildId, (v) => ({ ...v, postNewGyms: true }), MOD);
    await servers.set('412345678901234599', (v) => ({ ...v, distanceUnits: 'imperial' }), alice);
    const text = answerOf(
      await run(['Moderator'], {
        channelId: WEST_CHANNEL,
        thread: undefined,
        resolved: { member: { id: ALICE, bot: false, username: 'alice', globalName: 'Alice' } },
        resolvedMembers: { member: { displayName: 'Alice A.' } },
      }),
    );
    const lines = text.split('\n');
    const at = (words: string) => lines.findIndex((line) => line.includes(words));
    expect(at('in the server’s settings: turned off posting new gyms')).toBeGreaterThan(-1);
    expect(at('kept its post open')).toBeGreaterThan(at('turned off posting new gyms'));
    expect(
      at(`in the server’s settings: set the moderators’ channel to <#${MODERATORS}>.`),
    ).toBeGreaterThan(at('kept its post open'));
    expect(text).not.toContain('turned on posting new gyms');
    expect(text).not.toContain('distance units');
  });

  it('says there are more when her party and settings entries together pass the lines shown', async () => {
    const { run, answerOf, made, ctx } = await setup();
    if (!(ctx.servers instanceof TestServers)) throw new Error('no TestServers');
    const servers = ctx.servers;
    const alice = { id: ALICE, name: 'Alice' };
    for (let n = 0; n < AUDIT_LINES; n++) {
      servers.now = () => made.clock.now + n;
      await servers.set(
        made.gateway.guildId,
        (v) => ({ ...v, postNewGyms: !v.postNewGyms }),
        alice,
      );
    }
    await made.service.keep(made.party.id, true, alice);
    made.clock.now += 1_000;
    const text = answerOf(
      await run(['Moderator'], {
        channelId: WEST_CHANNEL,
        thread: undefined,
        resolved: { member: { id: ALICE, bot: false, username: 'alice', globalName: 'Alice' } },
        resolvedMembers: { member: { displayName: 'Alice A.' } },
      }),
    );
    expect(text).toContain('-# …and earlier changes');
    expect(text.split('\n').filter((line) => line.startsWith('<t:'))).toHaveLength(AUDIT_LINES);
  });
});
