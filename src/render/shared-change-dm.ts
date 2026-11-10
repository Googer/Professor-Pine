import type { V2Message } from '../discord/party-gateway.js';
import { plainNoLinks } from './text.js';
import { textMessage } from './v2.js';

/** The edge of the owner's DM about shared data: Discord's blue, as the tool request's. */
const SHARED_ACCENT = 0x5865f2;

/** What the owner is told of a change of data every server shares. */
export interface SharedChangeView {
  /** Who did it: their name in the server where they did it, and their id. */
  by: { id: string; name: string | undefined };
  /** The server they did it in: its name, where the bot knows it, and its id. */
  server: { id: string; name: string | undefined };
  /** What changed, as a sentence ("Set the event window, for every server: …"). */
  change: string;
}

/**
 * The DM to the bot's owner about a change of data all servers share (Matt's ruling 5 of
 * 2026-11-10: the event window and the boss overrides stay trust between the servers, and the
 * owner is told): who did it (their name through `plainNoLinks` and their id as plain text: no
 * mention, as the tool request's DM), in which server (its name through `plainNoLinks`, and its
 * id), and what changed. Nothing on it to press.
 */
export function sharedChangeDm(view: SharedChangeView): V2Message {
  const named = (name: string | undefined, fallback: string): string => {
    const shown = name === undefined ? '' : plainNoLinks(name).trim();
    return shown === '' ? fallback : shown;
  };
  return textMessage(SHARED_ACCENT, [
    '### Shared data changed',
    `**${named(view.by.name, 'A member')}** · ${view.by.id}\n` +
      `in **${named(view.server.name, 'a server')}** · ${view.server.id}`,
    view.change,
  ]);
}
