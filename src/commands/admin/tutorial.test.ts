import { ChannelType, Collection, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID, fakeChatInput } from '../../../test/support/fake-interactions.js';
import { MemoryLegacyIndex } from '../../../test/support/legacy-fill-ins.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { TUTORIAL_MARK } from '../../render/tutorial.js';
import { settings } from '../settings/settings.js';
import { admin } from './index.js';

const BOT = '4242';

/** A message of the channel's history, with what a run may do to it. */
const inHistory = (id: string, author: string, at: number, mark?: number) => ({
  id,
  author: { id: author },
  createdTimestamp: at,
  components: mark === undefined ? [] : [{ id: mark }],
  edit: vi.fn(() => Promise.resolve()),
  delete: vi.fn(() => Promise.resolve()),
});

function setup(contextOptions: object = {}) {
  const { ctx } = createTestContext(contextOptions);
  const router = new InteractionRouter(ctx, [admin], []);
  const run = async (
    history: ReadonlyArray<ReturnType<typeof inHistory>> = [],
    extra: object = {},
  ) => {
    const send = vi.fn(() => Promise.resolve());
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommand: 'tutorial',
      roleNames: ['Moderator'],
      channelName: 'raid-bot-tutorial',
      channelMore: {
        type: ChannelType.GuildText,
        send,
        messages: {
          fetch: () => Promise.resolve(new Collection(history.map((one) => [one.id, one]))),
        },
      },
      ...extra,
    });
    Object.assign(interaction, { client: { user: { id: BOT } } });
    await router.handle(interaction as never);
    return { interaction, send };
  };
  return { ctx, run };
}

const answerOf = (interaction: ReturnType<typeof fakeChatInput>): string =>
  [interaction.editReply, interaction.reply, interaction.followUp]
    .flatMap((mock) =>
      mock.mock.calls.map((call) => (call[0] as { content?: string }).content ?? ''),
    )
    .join('\n');

describe('/admin tutorial', () => {
  it('is for staff', async () => {
    const { run } = setup();
    const { interaction, send } = await run([], { roleNames: [] });
    expect(answerOf(interaction)).toBe('Only admins, moderators and bot developers can do that.');
    expect(send).not.toHaveBeenCalled();
  });

  it('posts the course, each message pinging nobody', async () => {
    const { run } = setup();
    const { interaction, send } = await run();
    expect(send.mock.calls.length).toBeGreaterThan(4);
    for (const [payload] of send.mock.calls as unknown as Array<
      [{ allowedMentions: { parse: string[] }; components: Array<{ id: number }> }]
    >) {
      expect(payload.allowedMentions.parse).toEqual([]);
      expect(payload.components[0]?.id).toBe(TUTORIAL_MARK);
    }
    expect(answerOf(interaction)).toMatch(/^Done: posted \d+ messages\.$/u);
  });

  it('tells of the old bot’s raids only where this server has a member index (B13)', async () => {
    const sentText = async (legacyIndex: MemoryLegacyIndex) => {
      const { run } = setup({ legacyIndex, commands: [settings, admin] });
      return JSON.stringify((await run()).send.mock.calls);
    };
    const here = new MemoryLegacyIndex();
    here.addServer(FAKE_GUILD_ID);
    expect(await sentText(here)).toContain('and add your raids from the old bot');
    const elsewhere = new MemoryLegacyIndex();
    elsewhere.addServer('412345678901234599');
    const text = await sentText(elsewhere);
    expect(text).toContain('/settings');
    expect(text).not.toContain('old bot');
  });

  it('edits its own messages in order when run again, and touches nothing else', async () => {
    const { run } = setup();
    const first = inHistory('1', BOT, 10, TUTORIAL_MARK);
    const second = inHistory('2', BOT, 20, TUTORIAL_MARK);
    // Newest first, as Discord gives them.
    const someoneElse = inHistory('3', '7', 15);
    const request = inHistory('4', BOT, 5, 99);
    const { send } = await run([second, someoneElse, first, request]);
    const firstText = JSON.stringify(first.edit.mock.calls[0]);
    // An edit stays a components-v2 message that pings nobody.
    const [edited] = first.edit.mock.calls[0] as unknown as [
      { flags: number; allowedMentions: { parse: string[] } },
    ];
    expect(edited.flags).toBe(MessageFlags.IsComponentsV2);
    expect(edited.allowedMentions.parse).toEqual([]);
    expect(firstText).toContain('Meet Professor Pine');
    expect(JSON.stringify(second.edit.mock.calls[0])).toContain('Creat');
    // The rest of the course follows.
    expect(send).toHaveBeenCalled();
    for (const other of [someoneElse, request]) {
      expect(other.edit).not.toHaveBeenCalled();
      expect(other.delete).not.toHaveBeenCalled();
    }
  });

  it('deletes what a shorter course no longer needs', async () => {
    const { run } = setup();
    const many = Array.from({ length: 9 }, (_, index) =>
      inHistory(String(index + 1), BOT, index + 1, TUTORIAL_MARK),
    );
    const { interaction } = await run(many);
    expect(many.at(-1)?.delete).toHaveBeenCalled();
    expect(many[0]?.delete).not.toHaveBeenCalled();
    expect(answerOf(interaction)).toMatch(/deleted \d messages?\.$/u);
  });

  it('is refused anywhere but a plain text channel', async () => {
    const { run } = setup();
    const { interaction, send } = await run([], {
      channelMore: { type: ChannelType.GuildAnnouncement, send: vi.fn() },
    });
    expect(answerOf(interaction)).toBe('Use this in a plain text channel.');
    expect(send).not.toHaveBeenCalled();
  });

  it('is refused in a channel that has another job', async () => {
    const { ctx, run } = setup();
    const named = ctx.config.settings.channels['bot-updates'];
    const { interaction, send } = await run([], { channelName: named });
    expect(answerOf(interaction)).toContain('another job');
    expect(send).not.toHaveBeenCalled();
  });

  it("is refused in a region's channel", async () => {
    const { ctx, run } = setup();
    vi.spyOn(ctx.regions, 'byChannel').mockReturnValue({ id: 1 } as never);
    const { interaction, send } = await run();
    expect(answerOf(interaction)).toContain('another job');
    expect(send).not.toHaveBeenCalled();
  });

  it('says so where the channel holds more than it looks through', async () => {
    const { run } = setup();
    const crowded = Array.from({ length: 100 }, (_, index) =>
      inHistory(String(index + 1), '7', index + 1),
    );
    const { interaction } = await run(crowded);
    expect(answerOf(interaction)).toContain('more than 100 messages');
    const { interaction: quiet } = await run();
    expect(answerOf(quiet)).not.toContain('more than 100');
  });

  it('names what it lacks, before it reads or posts anything', async () => {
    const { run } = setup();
    const { interaction, send } = await run([], {
      appPermissions: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages,
    });
    expect(answerOf(interaction)).toBe(
      'I need Embed Links, Read Message History in this channel for that.',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('is refused during a rehearsal, which reaches no member', async () => {
    const { run } = setup({ rehearsal: { admits: () => true } });
    const { interaction, send } = await run();
    expect(answerOf(interaction)).toContain('rehearsal');
    expect(send).not.toHaveBeenCalled();
  });
});
