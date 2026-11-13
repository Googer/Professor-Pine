import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { asV2, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { textDisplays } from '../../../test/support/messages.js';
import {
  EAST_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { ALICE } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { mapsFixture } from '../../../test/support/providers.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { AppContext } from '../../app-context.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import type { RaidReport } from '../../services/party-service.js';
import { status, where } from './status.js';

const all: CommandModule[] = [status, where];
const yveltal = { boss: { key: 'yveltal' } } as const;

async function setup(report: Partial<RaidReport> = {}, overrides: Partial<AppContext> = {}) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
    ...overrides,
  });
  const router = new InteractionRouter(ctx, all, []);
  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A command by Alice, in the raid's post unless `place` says otherwise. */
  const run = async (commandName: string, place: object = inPost) => {
    const interaction = fakeChatInput({ commandName, userId: ALICE, ...place });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, ctx, run };
}

describe('/status', () => {
  it('puts the raid at the bottom of its post again and says so privately', async () => {
    const made = await setup(yveltal);
    const used = await made.run('status');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(used.editReply).content).toBe(
      'The raid is at the bottom of the post again, with its buttons.',
    );
    const copies = made.gateway.messagesIn(made.postId);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.message).toEqual(made.gateway.posts.get(made.postId)?.message);

    await made.run('status');
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(1);
    expect(made.gateway.messagesIn(made.postId)[0]?.id).not.toBe(copies[0]?.id);
  });

  it('lists the raids of the region in its channel and in its forum, for the member alone', async () => {
    const made = await setup(yveltal);
    const listed = [
      '### Today and coming up\n1 raid',
      `**Level 5**\n<#${made.postId}> · no time set · 1 trainer`,
    ];
    const shown = (used: { editReply: Parameters<typeof sent>[0] }) =>
      textDisplays(asV2(sent(used.editReply)));
    const inChannel = await made.run('status', { channelId: WEST_CHANNEL });
    expect(inChannel.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    // The list of the summary post, as a components-v2 message.
    expect(sent(inChannel.editReply).flags).toBe(MessageFlags.IsComponentsV2);
    expect(shown(inChannel)).toEqual(listed);
    expect(made.gateway.messagesIn(made.postId)).toEqual([]);

    const inForum = await made.run('status', { channelId: WEST_FORUM });
    expect(shown(inForum)).toEqual(listed);

    const elsewhere = await made.run('status', { channelId: EAST_CHANNEL });
    expect(shown(elsewhere)).toEqual([
      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    ]);
  });

  it('lists the region in the post of a raid that has ended', async () => {
    const made = await setup(yveltal);
    await made.service.end(made.party.id);
    const used = await made.run('status');
    expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    ]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('says where it works when used anywhere else', async () => {
    const made = await setup();
    const used = await made.run('status', { channelId: '600000000000000009' });
    expect(used.followUp).toHaveBeenCalledWith({
      content:
        'Use this in the channel of a region, or in the post of a raid, max battle, train or meetup.',
      flags: MessageFlags.Ephemeral,
    });
    // A region without an outline has no gyms and is not a place for raids.
    const unbounded = await made.run('status', { channelId: UNBOUNDED_CHANNEL });
    expect(unbounded.followUp).toHaveBeenCalled();
  });

  it('allows five uses a minute', async () => {
    const made = await setup(yveltal);
    for (let use = 0; use < 5; use++) await made.run('status');
    const sixth = await made.run('status');
    expect(sent(sixth.reply).content).toMatch(/^You can use \/status again in /);
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(1);
  });
});

describe('/where', () => {
  it('links to the gym in Google Maps, privately, and goes out without a map', async () => {
    const made = await setup();
    const used = await made.run('where');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(used.editReply)).toEqual({
      content:
        '**The Stacks** (Pinewood Public Library)\n' +
        '[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)',
      files: [],
    });
    expect(made.gateway.messagesIn(made.postId)).toEqual([]);
  });

  it('attaches the map of the gym when there is one', async () => {
    const asked: number[] = [];
    const maps = {
      ...mapsFixture(),
      gym: (gym: { id: number }) => {
        asked.push(gym.id);
        return Promise.resolve('var/images/gyms/1-abc.png');
      },
    };
    const made = await setup({}, { maps });
    const used = await made.run('where');
    expect(sent(used.editReply).files).toEqual(['var/images/gyms/1-abc.png']);
    expect(asked).toEqual([1]);
  });

  it('names a gym without a nickname by its name', async () => {
    const fountain = (await setup()).ctx.gyms.stored(2);
    if (!fountain) throw new Error('no gym 2');
    const made = await setup({ gym: fountain });
    expect(sent((await made.run('where')).editReply).content).toMatch(
      /^\*\*Old Stone Fountain\*\*\n/,
    );
  });

  it('is for the post of a raid that is going on', async () => {
    const made = await setup();
    const used = await made.run('where', { channelId: WEST_CHANNEL });
    expect(sent(used.reply).content).toBe(
      'Use this in the post of a raid, max battle or train that is still active.',
    );
    expect(used.deferReply).not.toHaveBeenCalled();
  });
});
