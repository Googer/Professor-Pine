import type { Client } from 'discord.js';
import type { ApplicationEmojiSource } from '../services/application-emoji.js';

/**
 * The emoji of the bot's application as discord.js reads them (one request for all). The
 * client is handed over once it exists, like the gateways'; a read before that, or before the
 * client knows its application, fails.
 */
export class DiscordApplicationEmoji implements ApplicationEmojiSource {
  private client: Client | undefined;

  use(client: Client): void {
    this.client = client;
  }

  async list(): Promise<ReadonlyMap<string, string>> {
    const application = this.client?.application;
    if (!application) throw new Error('Discord is not connected yet');
    const emojis = await application.emojis.fetch();
    const found = new Map<string, string>();
    for (const emoji of emojis.values()) {
      if (emoji.name) found.set(emoji.name, emoji.toString());
    }
    return found;
  }

  /**
   * An emoji of a server by name, from the cache (the Guilds intent keeps it), by the server's
   * id: an answer is not tied to a channel the cache may lack. Undefined where it has none.
   */
  inServer(guildId: string, name: string): string | undefined {
    return this.client?.guilds.cache
      .get(guildId)
      ?.emojis.cache.find((emoji) => emoji.name === name)
      ?.toString();
  }
}
