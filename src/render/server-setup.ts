import type { SetupItem, SetupItemKey } from '../domain/servers/setup.js';

/**
 * The words of a server's setup (plan 19C-2, `servers.md`): what its bot lab is told once it is
 * set up. Plain text: no member is named, nobody pinged, no staff command named (the bot lab is
 * every member's, review F11).
 */

/** Each item that can follow the setup, as a sentence names it. */
const FOLLOWING: Readonly<Partial<Record<SetupItemKey, string>>> = {
  moderation: 'the moderators’ channel',
  events: 'the events forum',
  channels: 'the other channels',
  gyms: 'the gyms',
};

/** A list in a sentence: `a`, `a and b`, `a, b and c`. */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/** What the bot lab of a server is told once it leaves setup: then what can follow, if any. */
export function setUpWords(items: readonly SetupItem[]): string {
  const rest = items.flatMap((item) => {
    const name = item.done ? undefined : FOLLOWING[item.key];
    return name === undefined ? [] : [name];
  });
  const said = 'Pine is set up in this server: its commands work for everybody now.';
  return rest.length === 0
    ? said
    : `${said} Its staff can add the rest when they like: ${listed(rest)}.`;
}
