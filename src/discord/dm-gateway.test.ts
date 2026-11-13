import { ChannelType, type Client } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { DiscordDmGateway } from './dm-gateway.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';
/** A user id of 18 digits for a number. */
const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));

/**
 * As much of a discord.js client as the gateway uses: the channel cache, and `createDM`, which
 * opens a member's channel (a request to Discord) and caches it. `opened` counts those requests.
 */
function fakeClient() {
  const cache = new Map<string, { id: string; type: ChannelType; send: () => Promise<void> }>();
  const opened: string[] = [];
  const client = {
    channels: { cache },
    users: {
      createDM: (userId: string) => {
        opened.push(userId);
        const channel = {
          id: `9${userId}`,
          type: ChannelType.DM,
          send: () => Promise.resolve(),
        };
        cache.set(channel.id, channel);
        return Promise.resolve(channel);
      },
    },
  };
  return { client: client as unknown as Client, opened };
}

describe('DiscordDmGateway', () => {
  it('remembers a member’s DM channel: their next message opens none', async () => {
    const { client, opened } = fakeClient();
    const gateway = new DiscordDmGateway();
    gateway.use(client);
    expect(await gateway.send(idOf(1), { content: 'one' }, HOME)).toBe('sent');
    expect(await gateway.send(idOf(1), { content: 'two' }, HOME)).toBe('sent');
    expect(opened).toEqual([idOf(1)]);
  });

  it('keeps what one server remembers through another server’s burst of first messages (plan 19B-5)', async () => {
    const { client, opened } = fakeClient();
    const gateway = new DiscordDmGateway(4);
    gateway.use(client);
    await gateway.send(idOf(1), { content: 'away' }, AWAY);
    for (let n = 10; n < 20; n++) await gateway.send(idOf(n), { content: 'home' }, HOME);
    opened.length = 0;
    await gateway.send(idOf(1), { content: 'away again' }, AWAY);
    expect(opened).toEqual([]);
  });
});
