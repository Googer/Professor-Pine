import { ChannelType, SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { discordPayload } from '../../discord/party-gateway.js';
import { missingNeeds, TUTORIAL_NEEDS } from '../../ops/permissions.js';
import { count } from '../../render/text.js';
import { isTutorialMessage, tutorialMessages, tutorialPlan } from '../../render/tutorial.js';

/** How much of the channel's history a run looks through for its own messages. */
const LOOKS_BACK = 100;

/** Said where the channel holds more than a run looks through. */
const BUSY_CHANNEL = ` This channel has more than ${String(LOOKS_BACK)} messages, and I only look through the last ${String(LOOKS_BACK)}: older tutorial messages here stay as they were, so check for leftovers.`;

/**
 * `/admin tutorial` (plan 8M-18): posts the crash course in this channel, or, run again, edits it
 * in place, adding or deleting the difference. The channel is the record: its own messages carry
 * `TUTORIAL_MARK`, so that nothing else of Pine's is touched, nor anybody else's messages. Staff
 * only, as every `/admin`; refused in a rehearsal, which reaches no member. Two runs at once can
 * post it twice; the next run mends that (it keeps the oldest), so no lock is kept for it.
 */
export const tutorial: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('tutorial')
    .setDescription('Post the crash course in this channel, or update it there'),
  help: {
    details:
      'Posts a few basics of Professor Pine for members in this channel. Use it again and it ' +
      'updates its own messages in place. Other messages stay; it only looks through the last ' +
      `${String(LOOKS_BACK)}, so a quiet channel of its own suits it best.`,
    examples: ['/admin tutorial'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    if (ctx.rehearsal !== undefined) {
      throw new UserError('The tutorial is not posted during a rehearsal: it would reach members.');
    }
    const { channel } = interaction;
    if (channel?.type !== ChannelType.GuildText) {
      throw new UserError('Use this in a plain text channel.');
    }
    const { settings } = ctx.config;
    if (
      ctx.regions.byChannel(channel.id) !== undefined ||
      Object.values(settings.channels).includes(channel.name)
    ) {
      throw new UserError(
        'This channel has another job: use one for the tutorial alone, such as #raid-bot-tutorial.',
      );
    }
    const missing = missingNeeds(interaction.appPermissions.bitfield, TUTORIAL_NEEDS).required;
    if (missing.length > 0) {
      throw new UserError(
        `I need ${missing.map((need) => need.name).join(', ')} in this channel for that.`,
      );
    }
    const row = await ctx.guilds.idFor(interaction.guildId ?? '');
    const blocks = tutorialMessages({
      commands: new Set(ctx.commands.map((command) => command.data.name)),
      screenshots: settings.ocr.enabled,
      liveMap: settings.web !== undefined,
      hasStops: row !== undefined && ctx.placeFinder.hasStops(row),
      meetupsChecked: settings.channels.moderation !== undefined,
      icons: { controlIcon: (name) => ctx.emoji.find(name, null) },
    });
    const botId = interaction.client.user.id;
    const history = await channel.messages.fetch({ limit: LOOKS_BACK });
    const own = [...history.values()]
      .filter((message) => isTutorialMessage(message, botId))
      .sort((one, other) => one.createdTimestamp - other.createdTimestamp);
    const plan = tutorialPlan(
      own.map((message) => message.id),
      blocks.length,
    );
    const block = (index: number) => {
      const message = blocks[index];
      if (message === undefined) throw new Error('a block the plan does not have');
      return discordPayload(message);
    };
    for (const { id, block: index } of plan.edits) {
      await history.get(id)?.edit(block(index));
    }
    for (const index of plan.posts) await channel.send(block(index));
    for (const id of plan.deletes) await history.get(id)?.delete();
    const did = [
      ...(plan.posts.length > 0 ? [`posted ${count(plan.posts.length, 'message')}`] : []),
      ...(plan.edits.length > 0 ? [`updated ${count(plan.edits.length, 'message')}`] : []),
      ...(plan.deletes.length > 0 ? [`deleted ${count(plan.deletes.length, 'message')}`] : []),
    ];
    // Its older messages may lie further back, where a run cannot see them (a busy channel).
    const full = history.size >= LOOKS_BACK;
    await interaction.editReply({
      content: `Done: ${did.join(', ')}.${full ? BUSY_CHANNEL : ''}`,
    });
  },
};
