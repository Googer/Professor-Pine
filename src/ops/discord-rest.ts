/*
 * Discord's REST API as the cutover tools use it: discord.js's `REST` (with the bot's token, no
 * gateway) in the CLIs, the client's own `rest` in the bot, `FakeDiscordApi` in tests.
 */

/** Reading only: GETs (the cutover check). */
export interface DiscordRead {
  get(route: `/${string}`, options?: { query?: URLSearchParams }): Promise<unknown>;
}

/** Reading, and deleting channels (the cleanup of legacy channels). */
export interface DiscordDelete extends DiscordRead {
  delete(route: `/${string}`, options?: { reason?: string }): Promise<unknown>;
}
