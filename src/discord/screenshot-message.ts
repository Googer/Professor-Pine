import type { Attachment, Message } from 'discord.js';
import type { PostedMessage } from '../commands/screenshots/mention.js';
import { teamOfRoles } from '../domain/party/party.js';
import type { ScreenshotSource } from '../services/screenshot-service.js';

/**
 * Whether a message says nothing but mentions of the bot, if any: such a message may go once its
 * screenshots are raids (`PostedMessage.bare`). A message that mentions the bot, and one a
 * message command was used on, carry their text without the Message Content intent.
 */
export function saysNothing(content: string, botId: string): boolean {
  return content.replaceAll(`<@${botId}>`, '').replaceAll(`<@!${botId}>`, '').trim() === '';
}

/** The attachments of a message as the screenshot reader takes them. */
export function shotSources(
  attachments: Iterable<Pick<Attachment, 'url' | 'name' | 'contentType' | 'size'>>,
): ScreenshotSource[] {
  return [...attachments].map((attachment) => ({
    url: attachment.url,
    name: attachment.name,
    contentType: attachment.contentType,
    size: attachment.size,
  }));
}

/**
 * A posted message as the screenshot trigger sees it (`PostedMessage`), over discord.js. Like
 * `PartyGateway`'s implementation it has no unit tests: the staging run is its test. The bot is
 * mentioned when its own mention is in the text (`parsedUsers`): a reply to one of its messages,
 * @everyone, @here or a role does not count. A message that mentions the bot carries its text
 * without the Message Content intent, which `bare` reads. The reply answers the message without pinging its
 * author (the client's mentions are off).
 */
export function postedMessage(message: Message): PostedMessage {
  const botId = message.client.user.id;
  const { member } = message;
  const team = member ? teamOfRoles(member.roles.cache.map((role) => role.name)) : undefined;
  return {
    id: message.id,
    channelId: message.channelId,
    guildId: message.guildId,
    inThread: message.channel.isThread(),
    authorId: message.author.id,
    authorBot: message.author.bot || message.webhookId !== null,
    member: {
      ...(member ? { name: member.displayName } : {}),
      ...(team ? { team } : {}),
    },
    createdAt: message.createdTimestamp,
    mentionsBot: message.mentions.parsedUsers.has(botId),
    // Nothing but the bot's own mention(s): the message may go once its screenshots are raids.
    bare: saysNothing(message.content, botId),
    channelName: (channelId) => message.guild?.channels.cache.get(channelId)?.name,
    attachments: shotSources(message.attachments.values()),
    react: async (emoji) => {
      await message.react(emoji);
    },
    unreact: async (emoji) => {
      await message.reactions.cache.get(emoji)?.users.remove(botId);
    },
    reply: async ({ ping, ...payload }) => {
      const sent = await message.reply({
        ...payload,
        allowedMentions: ping === undefined ? { parse: [] } : { users: [ping] },
      });
      return {
        delete: async () => {
          await sent.delete();
        },
      };
    },
    delete: async () => {
      await message.delete();
    },
  };
}
