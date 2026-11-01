import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, at, MINUTE } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { admin } from './index.js';
import { textOf } from '../../../test/support/messages.js';

const END = at('2026-10-13T14:30');

async function setup() {
  const made = await reportedRaid({ boss: { key: 'yveltal' }, time: { end: END } });
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [admin], []);
  /** `/admin save-party` by Alice, an admin, in the raid's post unless `extra` says otherwise. */
  const run = async (options: Record<string, boolean> = {}, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommand: 'save-party',
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
      userId: ALICE,
      roleNames: ['Admin'],
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const tickAt = async (time: number) => {
    made.clock.now = time;
    await made.scheduler.tick();
    await made.scheduler.whenIdle();
    await made.attendance.flush();
    await made.service.flush();
  };
  return { ...made, run, tickAt };
}

describe('/admin save-party', () => {
  it('keeps the post: the clock neither warns nor archives it', async () => {
    const made = await setup();
    const used = await made.run();
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(used.editReply).toHaveBeenCalledWith({
      content:
        'This post is kept: I will not archive it by myself. `/delete` closes it, and ' +
        '`/admin save-party keep:False` gives it back to the clock.',
    });
    expect(made.current().saved).toBe(true);
    // The post itself says so, also once the line has scrolled away.
    await made.service.flush();
    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
      'Kept open by a moderator: this post is not archived by itself.',
    );
    expect(made.said()).toEqual([
      `**Member** (<@${ALICE}>) keeps this post open: it will not be archived by itself.`,
    ]);

    await made.tickAt(END + 6 * MINUTE);
    await made.tickAt(END + 60 * MINUTE);
    expect(made.current()).toMatchObject({ saved: true, deletionTime: null });
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    expect(made.said()).toHaveLength(1);
  });

  it('takes the warning away from a post that is kept after it was warned', async () => {
    const made = await setup();
    await made.tickAt(END + 6 * MINUTE);
    expect(made.current().prompts.warning).not.toBeNull();
    expect(made.said().some((text) => text.includes('I will archive this post'))).toBe(true);

    await made.run();
    await made.tickAt(END + 7 * MINUTE);
    expect(made.current()).toMatchObject({ saved: true, deletionTime: null });
    expect(made.current().prompts.warning).toBeNull();
    expect(made.said().some((text) => text.includes('I will archive this post'))).toBe(false);
    await made.tickAt(END + 60 * MINUTE);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });

  it('gives the post back to the clock with keep:False', async () => {
    const made = await setup();
    await made.run();
    const used = await made.run({ keep: false });
    expect(sent(used.editReply).content).toBe(
      'This post is no longer kept: it is archived as usual once the raid is over.',
    );
    expect(made.current().saved).toBe(false);
    expect(made.said().at(-1)).toBe(
      `**Member** (<@${ALICE}>) no longer keeps this post open: it will be archived as usual.`,
    );
    await made.tickAt(END + 6 * MINUTE);
    expect(made.current().deletionTime).not.toBeNull();
    await made.tickAt(END + 20 * MINUTE);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
  });

  it('says so, and nothing in the post, when nothing changes', async () => {
    const made = await setup();
    expect(sent((await made.run({ keep: false })).editReply).content).toBe(
      'This post was not kept.',
    );
    await made.run();
    expect(sent((await made.run({ keep: true })).editReply).content).toBe(
      'This post was kept already.',
    );
    expect(made.said()).toHaveLength(1);
  });

  it('is for staff, in the post of a raid that is going on', async () => {
    const made = await setup();
    const member = await made.run({}, { roleNames: ['Valor'] });
    expect(sent(member.reply).content).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    // Bot developers have the rest of `/admin`, but neither this nor `/delete`.
    const developer = await made.run({}, { roleNames: ['Bot Developer'] });
    expect(sent(developer.reply).content).toBe('Only admins and moderators can do that.');
    expect(made.current().saved).toBe(false);
    const elsewhere = await made.run(
      { keep: true },
      { channelId: WEST_CHANNEL, thread: undefined },
    );
    expect(elsewhere.followUp).toHaveBeenCalledWith({
      content: 'Use this in the post of a raid, max battle, train or meetup that is still active.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.current().saved).toBe(false);
  });

  it('lists the kept posts of this server when used outside a post without an option', async () => {
    const made = await setup();
    const outside = { channelId: WEST_CHANNEL, thread: undefined };
    const here = { guildChannelNames: { [WEST_FORUM]: 'west-raids' } };
    const none = await made.run({}, { ...outside, ...here });
    expect(sent(none.editReply).content).toBe(
      'No post is kept. Use this in the post of a raid, max battle, train or meetup to keep it.',
    );
    await made.run();
    const listed = await made.run({}, { ...outside, ...here });
    expect(sent(listed.editReply).content).toBe(
      `Kept posts, which I will not archive by myself:\n<#${made.postId}>`,
    );
    // A post of a forum that is not in this server is none of its business.
    const elsewhere = await made.run({}, { ...outside, guildChannelNames: {} });
    expect(sent(elsewhere.editReply).content).toMatch(/^No post is kept\./);
  });

  it('keeps the post although the line cannot be said', async () => {
    const made = await setup();
    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    const used = await made.run();
    expect(sent(used.editReply).content).toMatch(/^This post is kept/);
    expect(made.current().saved).toBe(true);
  });
});
