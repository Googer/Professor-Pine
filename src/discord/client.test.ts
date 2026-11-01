import {
  DMMessageManager,
  GatewayIntentBits,
  GuildMemberManager,
  GuildMessageManager,
  LimitedCollection,
  MessageManager,
  type Client,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  cacheFactory,
  createClient,
  loginWithFallback,
  MEMBER_CACHE_SIZE,
  rejectsLongChannelPatchWait,
} from './client.js';

const disallowed = () => Object.assign(new Error('Used disallowed intents'), { code: 4014 });

/** Fake clients whose login outcome depends on which intents they were created with. */
function fakeFactory(accept: (intents: GatewayIntentBits[]) => boolean) {
  const created: Array<{ intents: GatewayIntentBits[]; destroy: ReturnType<typeof vi.fn> }> = [];
  const create = (intents: GatewayIntentBits[]) => {
    const destroy = vi.fn(() => Promise.resolve());
    created.push({ intents, destroy });
    return {
      login: vi.fn(() =>
        accept(intents) ? Promise.resolve('token') : Promise.reject(disallowed()),
      ),
      destroy,
    } as unknown as Client;
  };
  return { create, created };
}

describe('loginWithFallback', () => {
  it('logs in with the requested intents when Discord accepts them', async () => {
    const { log } = createTestLogger();
    const { create, created } = fakeFactory(() => true);
    const configure = vi.fn();

    const result = await loginWithFallback(
      { ocrPassive: true, autoAssignRole: false },
      { token: 't', log, create, configure },
    );

    expect(result.features).toEqual({ ocrPassive: true, autoAssignRole: false });
    expect(created).toHaveLength(1);
    expect(configure).toHaveBeenCalledTimes(1);
  });

  it('falls back to the largest accepted subset', async () => {
    const { log, entries } = createTestLogger();
    const { create, created } = fakeFactory(
      (intents) => !intents.includes(GatewayIntentBits.GuildMembers),
    );

    const result = await loginWithFallback(
      { ocrPassive: true, autoAssignRole: true },
      { token: 't', log, create, configure: vi.fn() },
    );

    expect(result.features).toEqual({ ocrPassive: true, autoAssignRole: false });
    expect(created[0]?.destroy).toHaveBeenCalled();
    expect(entries.some((e) => String(e.msg).includes('autoAssignRole'))).toBe(true);
  });

  it('gives up with the refusal as the cause when nothing is accepted, without a retry line', async () => {
    const { log, entries } = createTestLogger();
    const { create, created } = fakeFactory(() => false);

    const failure = await loginWithFallback(
      { ocrPassive: true, autoAssignRole: false },
      { token: 't', log, create, configure: vi.fn() },
    ).catch((err: unknown) => err as Error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      'Discord rejected the login even without privileged intents',
    );
    expect((failure as Error).cause).toMatchObject({ code: 4014 });
    expect(created).toHaveLength(2);
    expect(entries.filter((e) => String(e.msg).includes('retrying with fewer'))).toHaveLength(1);
  });

  it('rethrows errors that are not about intents', async () => {
    const { log } = createTestLogger();
    const create = () =>
      ({
        login: () => Promise.reject(new Error('An invalid token was provided.')),
        destroy: () => Promise.resolve(),
      }) as unknown as Client;

    await expect(
      loginWithFallback(
        { ocrPassive: true, autoAssignRole: false },
        { token: 't', log, create, configure: vi.fn() },
      ),
    ).rejects.toThrow('invalid token');
  });
});

describe('createClient', () => {
  it('defaults to allowing no mentions so a forgotten option cannot ping everyone', () => {
    const client = createClient([GatewayIntentBits.Guilds]);
    expect(client.options.allowedMentions?.parse).toEqual([]);
  });
  it('rejects a rate limit on a channel edit instead of waiting for it', () => {
    const client = createClient([GatewayIntentBits.Guilds]);
    const filter = client.options.rest?.rejectOnRateLimit;
    expect(typeof filter).toBe('function');
  });
});

describe('rejectsLongChannelPatchWait', () => {
  const base = {
    route: '/channels/:id',
    method: 'PATCH',
    global: false,
    sublimitTimeout: 0,
    timeToReset: 0,
    retryAfter: 0,
  };

  it('rejects a sublimit and a long bucket wait on a channel edit', () => {
    expect(rejectsLongChannelPatchWait({ ...base, sublimitTimeout: 600_000 })).toBe(true);
    expect(rejectsLongChannelPatchWait({ ...base, timeToReset: 5_001 })).toBe(true);
    expect(rejectsLongChannelPatchWait({ ...base, method: 'patch', timeToReset: 60_000 })).toBe(
      true,
    );
  });

  it('also looks at the retry-after of the answer', () => {
    expect(rejectsLongChannelPatchWait({ ...base, retryAfter: 5_001 })).toBe(true);
    expect(rejectsLongChannelPatchWait({ ...base, timeToReset: 1_000, retryAfter: 60_000 })).toBe(
      true,
    );
    expect(rejectsLongChannelPatchWait({ ...base, retryAfter: 5_000 })).toBe(false);
    expect(rejectsLongChannelPatchWait({ ...base, global: true, retryAfter: 60_000 })).toBe(false);
  });

  it('waits for a global limit and for a short bucket wait', () => {
    expect(rejectsLongChannelPatchWait({ ...base, global: true, timeToReset: 60_000 })).toBe(false);
    expect(rejectsLongChannelPatchWait({ ...base, global: true, sublimitTimeout: 5_000 })).toBe(
      false,
    );
    expect(rejectsLongChannelPatchWait({ ...base, timeToReset: 1_000 })).toBe(false);
    expect(rejectsLongChannelPatchWait({ ...base, timeToReset: 5_000 })).toBe(false);
  });

  it('waits for every other route and method', () => {
    const long = { ...base, sublimitTimeout: 600_000, timeToReset: 600_000 };
    expect(rejectsLongChannelPatchWait({ ...long, method: 'GET' })).toBe(false);
    expect(rejectsLongChannelPatchWait({ ...long, route: '/channels/:id/messages' })).toBe(false);
    expect(rejectsLongChannelPatchWait({ ...long, route: '/channels/:id/messages/:id' })).toBe(
      false,
    );
  });
});

describe('cacheFactory', () => {
  /** The cache discord.js would make for a manager of this class, as `CachedManager` asks for it. */
  const cacheOf = (overridden: unknown, manager: unknown): unknown =>
    (cacheFactory() as unknown as (type: unknown, holds: unknown, manager: unknown) => unknown)(
      overridden,
      undefined,
      manager,
    );

  it('keeps no messages of DM channels, and the default 200 of a server channel', () => {
    const dm = cacheOf(MessageManager, DMMessageManager);
    expect(dm).toBeInstanceOf(LimitedCollection);
    expect((dm as LimitedCollection<string, unknown>).maxSize).toBe(0);
    (dm as LimitedCollection<string, unknown>).set('1', {});
    expect((dm as LimitedCollection<string, unknown>).size).toBe(0);
    const server = cacheOf(MessageManager, GuildMessageManager);
    expect((server as LimitedCollection<string, unknown>).maxSize).toBe(200);
  });

  it('keeps a bounded number of members per server, the bot itself always', () => {
    const members = cacheOf(GuildMemberManager, GuildMemberManager) as LimitedCollection<
      string,
      { id: string; client: { user: { id: string } } }
    >;
    expect(members.maxSize).toBe(MEMBER_CACHE_SIZE);
    const client = { user: { id: 'bot' } };
    members.set('bot', { id: 'bot', client });
    for (let n = 0; n < MEMBER_CACHE_SIZE + 10; n++) {
      members.set(String(n), { id: String(n), client });
    }
    expect(members.size).toBe(MEMBER_CACHE_SIZE);
    expect(members.has('bot')).toBe(true);
    expect(members.has('0')).toBe(false);
    expect(members.has(String(MEMBER_CACHE_SIZE + 9))).toBe(true);
  });

  it('is what the client is made with', () => {
    const client = createClient([]);
    const dm = (
      client.options.makeCache as unknown as (a: unknown, b: unknown, c: unknown) => unknown
    )(MessageManager, undefined, DMMessageManager);
    expect((dm as LimitedCollection<string, unknown>).maxSize).toBe(0);
    void client.destroy();
  });
});
