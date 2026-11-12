import { ChannelType, Client, OverwriteType, PermissionFlagsBits, type Guild } from 'discord.js';
import { afterEach, describe, expect, it } from 'vitest';
import { serverNamesOf } from './server-names.js';

/*
 * `serverNamesOf` (plan 19A-1, the fill) on a server built as the client's cache holds it
 * (`client.guilds._add` of the data Discord sends, as `views-with.test.ts`).
 */

const GUILD = '400000000000000001';
const BOT = '300000000000000001';
const CATEGORY = '500000000000000001';
const OLD_LAB = '600000000000000001';
const NEW_LAB = '600000000000000002';
const SHUT_UPDATES = '600000000000000003';
const OPEN_UPDATES = '600000000000000004';
const EVENTS = '600000000000000005';
const VOICE_LAB = '600000000000000006';
const UNOWN = '700000000000000001';
const SEND = String(PermissionFlagsBits.SendMessages);

const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.destroy();
});

const role = (id: string, name: string, permissions = '0') => ({
  id,
  name,
  permissions,
  position: 1,
  color: 0,
  hoist: false,
  managed: false,
  mentionable: false,
});

function server(): Guild {
  const client = new Client({ intents: [] });
  clients.push(client);
  // discord.js builds its cache from Discord's data this way; the method is internal to it.
  const guilds = client.guilds as unknown as { _add(data: unknown): Guild };
  const all = String(
    PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks,
  );
  const shut = [{ id: GUILD, type: OverwriteType.Role, allow: '0', deny: SEND }];
  const channel = (id: string, type: ChannelType, name: string, permission_overwrites = []) => ({
    id,
    type,
    name,
    permission_overwrites,
  });
  const guild = guilds._add({
    id: GUILD,
    name: 'Pinewood',
    owner_id: '300000000000000009',
    roles: [role(GUILD, '@everyone', all), role(UNOWN, ' Unown ')],
    channels: [
      channel(CATEGORY, ChannelType.GuildCategory, 'PVP CHAT'),
      // Two text channels of one name: the older (the smaller id) is the one.
      channel(NEW_LAB, ChannelType.GuildText, 'the-bot-lab'),
      channel(OLD_LAB, ChannelType.GuildText, 'the-bot-lab'),
      channel(VOICE_LAB, ChannelType.GuildVoice, 'voice-lab'),
      // Of two, the one the bot may post in, though it is the newer.
      {
        ...channel(SHUT_UPDATES, ChannelType.GuildText, 'bot-updates'),
        permission_overwrites: shut,
      },
      channel(OPEN_UPDATES, ChannelType.GuildText, 'bot-updates'),
      channel(EVENTS, ChannelType.GuildForum, 'events'),
    ],
    members: [
      { user: { id: BOT, username: 'pine' }, roles: [], joined_at: '2020-01-01T00:00:00Z' },
    ],
  });
  (client as unknown as { user: { id: string } }).user = { id: BOT };
  return guild;
}

describe('serverNamesOf', () => {
  it('finds channels by name and kind as the readers found them', () => {
    const names = serverNamesOf(server());
    expect(names.serverId).toBe(GUILD);
    expect(names.channel('the-bot-lab', 'text')).toBe(OLD_LAB);
    expect(names.channel('bot-updates', 'text')).toBe(OPEN_UPDATES);
    expect(names.channel('events', 'forum')).toBe(EVENTS);
    expect(names.channel('events', 'text')).toBeUndefined();
    expect(names.channel('voice-lab', 'text')).toBeUndefined();
    expect(names.channel('nowhere', 'text')).toBeUndefined();
  });

  it('counts the channels of a name and kind (fix round 3, H10)', () => {
    const names = serverNamesOf(server());
    expect(names.howMany('the-bot-lab', 'text')).toBe(2);
    expect(names.howMany('bot-updates', 'text')).toBe(2);
    expect(names.howMany('events', 'forum')).toBe(1);
    expect(names.howMany('the-bot-lab', 'forum')).toBe(0);
    expect(names.howMany('PVP CHAT', 'category')).toBe(1);
  });

  it('finds a category as written, and a role trimmed, whatever its letter case', () => {
    const names = serverNamesOf(server());
    expect(names.category('PVP CHAT')).toBe(CATEGORY);
    expect(names.category('pvp chat')).toBeUndefined();
    expect(names.role('unown')).toBe(UNOWN);
    expect(names.role('Moderator')).toBeUndefined();
  });
});
