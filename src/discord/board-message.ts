import type { Message } from 'discord.js';
import type { PostedBoardMessage } from '../services/board-keeper.js';

/**
 * A message as the board's keeper sees it (plan 8R-9F, `BoardKeeper.posted`), over discord.js:
 * where, by whom (this bot, another application or a webhook, a member) and whether it is
 * Discord's own. `GuildMessages` gives all of it without Message Content. Like
 * `screenshot-message.ts` it has no unit tests: the staging run is its test.
 */
export function postedBoardMessage(message: Message): PostedBoardMessage {
  return {
    id: message.id,
    channelId: message.channelId,
    guildId: message.guildId,
    authorId: message.author.id,
    by:
      message.author.id === message.client.user.id
        ? 'me'
        : message.author.bot || message.webhookId !== null
          ? 'bot'
          : 'member',
    system: message.system,
    createdAt: message.createdTimestamp,
  };
}
