import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asV2, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { textOf } from '../../../test/support/messages.js';
import { ALICE, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { AUDIT_WHERE, NOTHING_LOGGED } from '../../render/audit.js';
import { audit } from './audit.js';
import { closePartyAs } from './delete.js';

const MOD = { id: '200000000000000009', name: 'Misty' };

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
    // 31 entries: the creation and 30 changes.
    expect(text).toContain('-# …and 6 earlier changes');
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
});
