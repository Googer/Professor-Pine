import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageFlags,
  type MessageContextMenuCommandInteraction,
} from 'discord.js';
import { channelContext } from '../../discord/channel-context.js';
import type { MessageCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { requireGuild } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import { askedShots, saysNothing } from '../../discord/screenshot-message.js';
import { MENTION_THROTTLE, type AskedMessage, type NotRead } from './mention.js';
import { START_BY_MS } from './read-screenshot.js';

/** The name of the entry in the Apps menu of a message (Matt, 2026-11-10). */
export const READ_SCREENSHOT_NAME = 'Read screenshot';

/** What a member is told who uses it on a message of the bot's own. */
const MINE = 'That is a message of my own: there is no screenshot for me to read in it.';

/** Said where a mention is not read either: outside a region channel, in a post or a thread. */
const REGION_CHANNELS_ONLY = 'I read screenshots only from messages in a region channel.';

/**
 * Why nothing of the message was read, for the member who asked (`ScreenshotTrigger.readFor`).
 * A mention in such a place draws no answer at all; a command must give one.
 */
const NOT_READ: Readonly<Record<NotRead, string>> = {
  'no-picture': 'That message has no picture I can read.',
  post: REGION_CHANNELS_ONLY,
  'no-region': REGION_CHANNELS_ONLY,
  'being-read': 'I am reading that message already.',
  rehearsal:
    'I read no screenshots from messages during the rehearsal: attach it to `/raid` or `/max` ' +
    'instead.',
  closing: 'I am restarting just now. Try again in a moment.',
  off: 'I do not read screenshots here.',
  'no-server': 'This server is not set up for raids yet.',
  'not-for-me': 'That is not a message I read screenshots from.',
};

/**
 * Said when the message was read but nothing of it reached the member (Discord refused the
 * answer, which is logged where it was sent): what was made is in the channel.
 */
const UNANSWERED =
  'I could not tell you here what came of it. If a raid or max battle was reported, its line ' +
  'is in the channel.';

/**
 * The message the command was used on, as the screenshot trigger reads it (`AskedMessage`), over
 * the interaction: Discord sends the message with its attachments and its text, no intent
 * needed. What a mention's flow does to the message itself it does to this one (the 🤔 while it
 * reads, the ✅, taking the asker's own away); what it would say in the channel under the
 * message it says to the member alone: the first reply in the place of the "thinking…" line (an
 * edit of the deferred answer: a first follow-up would take that place anyway), every later one
 * a private follow-up. A question goes at a mention's question's time, by the interaction's
 * token; what came of it stays until the member dismisses it (review F8, the trigger's `say`).
 * `answered` says whether any reached the member.
 */
function askedMessage(interaction: MessageContextMenuCommandInteraction): {
  message: AskedMessage;
  answered: () => boolean;
} {
  const target = interaction.targetMessage;
  const botId = interaction.client.user.id;
  /** The replies tried, and those Discord took. */
  let tried = 0;
  let sent = 0;
  // A forward's pictures are the message's it forwards, as of that message (review F3).
  const { attachments, createdAt } = askedShots(target);
  const message: AskedMessage = {
    id: target.id,
    channelId: target.channelId,
    guildId: interaction.guildId,
    inThread: channelContext(interaction).isThread,
    authorId: target.author.id,
    createdAt,
    bare: saysNothing(target.content, botId),
    attachments,
    channelName: (channelId) => interaction.guild?.channels.cache.get(channelId)?.name,
    react: async (emoji) => {
      await target.react(emoji);
    },
    unreact: async (emoji) => {
      await target.reactions.cache.get(emoji)?.users.remove(botId);
    },
    // Nobody is pinged: a reply that pings is a passive reading's, which this never is.
    reply: async ({ content, components }) => {
      const payload = {
        content,
        ...(components ? { components } : {}),
        allowedMentions: { parse: [] },
      };
      if (tried++ === 0) {
        await interaction.editReply(payload);
        sent++;
        return {
          delete: async () => {
            await interaction.deleteReply();
          },
        };
      }
      const followUp = await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
      sent++;
      return {
        delete: async () => {
          await interaction.deleteReply(followUp.id);
        },
      };
    },
    delete: async () => {
      await target.delete();
    },
  };
  return { message, answered: () => sent > 0 };
}

/**
 * "Read screenshot" in the Apps menu of a message (plan 7M; Matt, 2026-11-10: "function the
 * same as a mention in effect, for people that don't think of / aren't aware of that option"):
 * the message's screenshots are read exactly as a mention of the bot in it would have had them
 * read, by the mention's own code (`ScreenshotTrigger.readFor`, `ctx.messageShots`), for the
 * member who used it: every decision, question, report and kept record is that flow's. Only how
 * it answers is the command's: privately (`askedMessage`), since anybody may use it on anybody's
 * message, and the channel is told nothing but what a report itself posts there.
 *
 * It has no throttle of its own: each picture is a use in the member's window of screenshots,
 * the one their mentions count in (`MENTION_THROTTLE`), counted by the trigger.
 */
export const readScreenshotMessage: MessageCommand = {
  target: 'message',
  data: new ContextMenuCommandBuilder()
    .setName(READ_SCREENSHOT_NAME)
    .setType(ApplicationCommandType.Message),
  help: {
    category: 'raid-crud',
    description:
      'Report the raid or max battle on a screenshot somebody posted without mentioning me',
    details:
      'Use it on a message in a region channel whose screenshot of a raid, an egg or a max ' +
      'battle was posted without a mention of me. I read every picture of the message and ' +
      'report what it shows, just as if it had been posted with the mention.\n\n' +
      'The report is yours, whoever posted the screenshot: you are signed up as your settings ' +
      'say, and when I cannot tell the gym or the Power Spot, I ask you. Only you see my ' +
      'answers.\n\n' +
      'Each picture counts as one of your screenshots, with those you post with a mention: ' +
      `${String(MENTION_THROTTLE.uses)} in ${String(MENTION_THROTTLE.perSeconds / 60)} minutes. ` +
      'Your own message goes once every screenshot of it made a report, if it says nothing ' +
      'else; somebody else’s message always stays.',
  },
  enabled: (config) => config.settings.ocr.enabled,
  guards: [requireGuild],
  // The read takes seconds, and the first answer must come within three.
  defer: 'ephemeral',
  async run(interaction, ctx) {
    if (interaction.targetMessage.author.id === interaction.client.user.id) {
      throw new UserError(MINE);
    }
    const { message, answered } = askedMessage(interaction);
    const why = await ctx.messageShots.readFor(message, {
      id: interaction.user.id,
      member: memberInfo(interaction),
      startBy: interaction.createdTimestamp + START_BY_MS,
    });
    if (why !== undefined) throw new UserError(NOT_READ[why]);
    if (!answered()) throw new UserError(UNANSWERED);
  },
};
