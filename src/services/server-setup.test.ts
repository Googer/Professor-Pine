import { describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { TestServers, testServerValues } from '../../test/support/server-values.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ServerSetup, setupCounts } from './server-setup.js';

/** A server set up long ago (the fakes' own) and one in setup (plan 19C-2). */
const SET_UP = FAKE_GUILD_ID;
const NEW = '412345678901234599';
const NEW_LAB = '300000000000000091';
const NEW_MOD_LAB = '300000000000000092';

function setupWith(regions = 0) {
  const servers = new TestServers();
  servers.settingUp.add(NEW);
  // Nothing set in the server in setup, not even its zone (an open instance's start).
  servers.changed.set(NEW, testServerValues({ channels: {}, timezone: undefined }));
  const counts = new Map<string, { regions: number; gyms: number }>([[NEW, { regions, gyms: 0 }]]);
  const sent: Array<{ channelId: string; text: string }> = [];
  const heard: string[] = [];
  const { log, entries } = createTestLogger();
  let refusing: Error | undefined;
  const setup = new ServerSetup({
    servers,
    counts: (serverId) => Promise.resolve(counts.get(serverId) ?? { regions: 0, gyms: 0 }),
    send: (channelId, text) => {
      if (refusing) return Promise.reject(refusing);
      sent.push({ channelId, text });
      return Promise.resolve();
    },
    setUp: (serverId) => heard.push(serverId),
    log,
  });
  const finish = () => {
    servers.changed.set(NEW, {
      ...servers.of(NEW),
      timezone: 'Europe/Berlin',
      channels: { 'bot-lab': NEW_LAB, 'mod-bot-lab': NEW_MOD_LAB },
    });
    counts.set(NEW, { regions: 1, gyms: 0 });
  };
  return {
    servers,
    setup,
    sent,
    heard,
    entries,
    finish,
    refuse: (err: Error | undefined) => {
      refusing = err;
    },
  };
}

describe('leaving setup (plan 19C-2)', () => {
  it('stays in setup while a required item is missing, and says nothing', async () => {
    const made = setupWith();
    made.servers.changed.set(NEW, {
      ...made.servers.of(NEW),
      timezone: 'Europe/Berlin',
      channels: { 'bot-lab': NEW_LAB, 'mod-bot-lab': NEW_MOD_LAB },
    });
    // No region yet.
    expect(await made.setup.check(NEW)).toBe(false);
    expect(made.servers.inSetup(NEW)).toBe(true);
    expect(made.sent).toEqual([]);
    expect(made.heard).toEqual([]);
  });

  it('leaves setup once the required items are done, tells the bot lab once, and what can follow', async () => {
    const made = setupWith();
    made.finish();
    expect(await made.setup.check(NEW)).toBe(true);
    expect(made.servers.inSetup(NEW)).toBe(false);
    expect(made.sent).toEqual([
      {
        channelId: NEW_LAB,
        text:
          'Pine is set up in this server: its commands work for everybody now. Its staff can ' +
          'add the rest when they like: the moderators’ channel, the events forum, the other ' +
          'channels and the gyms.',
      },
    ]);
    expect(made.heard).toEqual([NEW]);
    // Once.
    expect(await made.setup.check(NEW)).toBe(false);
    expect(made.sent).toHaveLength(1);
    expect(made.heard).toEqual([NEW]);
  });

  it('never touches a server set up already', async () => {
    const made = setupWith();
    expect(await made.setup.check(SET_UP)).toBe(false);
    expect(made.servers.markedSetUp).toEqual([]);
    expect(made.sent).toEqual([]);
  });

  it('checks every server in setup at once (a region saved, the start)', async () => {
    const made = setupWith();
    made.finish();
    await made.setup.checkAll();
    expect(made.servers.markedSetUp).toEqual([NEW]);
    expect(made.servers.serversInSetup()).toEqual([]);
  });

  it('stays in setup when the write fails, logs it, and leaves at the next check', async () => {
    const made = setupWith();
    made.finish();
    made.servers.markFailing = new Error('the database is away');
    expect(await made.setup.check(NEW)).toBe(false);
    expect(made.servers.inSetup(NEW)).toBe(true);
    expect(made.sent).toEqual([]);
    expect(made.entries.some((entry) => entry.msg === 'could not record a server set up')).toBe(
      true,
    );
    made.servers.markFailing = undefined;
    expect(await made.setup.check(NEW)).toBe(true);
    expect(made.sent).toHaveLength(1);
  });

  it('is set up whether or not its bot lab takes the message, which is logged', async () => {
    const made = setupWith();
    made.finish();
    made.refuse(new Error('Missing Access'));
    expect(await made.setup.check(NEW)).toBe(true);
    expect(made.servers.inSetup(NEW)).toBe(false);
    expect(made.heard).toEqual([NEW]);
    expect(
      made.entries.some((entry) => entry.msg === 'could not tell a server that it is set up'),
    ).toBe(true);
  });

  it('names only what is left of the rest', async () => {
    const made = setupWith();
    made.finish();
    made.servers.changed.set(NEW, {
      ...made.servers.of(NEW),
      channels: {
        'bot-lab': NEW_LAB,
        'mod-bot-lab': NEW_MOD_LAB,
        moderation: '300000000000000093',
        events: '300000000000000094',
      },
    });
    await made.setup.check(NEW);
    expect(made.sent[0]?.text).toBe(
      'Pine is set up in this server: its commands work for everybody now. Its staff can add ' +
        'the rest when they like: the other channels and the gyms.',
    );
  });
});

describe('what the checklist counts of a server (plan 19C-2)', () => {
  it('counts its regions with an outline, one per channel, and its gyms, by its row', async () => {
    const outline = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
    ];
    const counts = setupCounts({
      guilds: { idFor: (snowflake) => Promise.resolve(snowflake === NEW ? 7 : undefined) },
      regions: {
        all: () => [
          { guildId: 7, channelId: 'a', bounds: outline },
          { guildId: 7, channelId: 'a', bounds: outline },
          { guildId: 7, channelId: 'b', bounds: null },
          { guildId: 8, channelId: 'c', bounds: outline },
        ],
      },
      gyms: { of: (row) => ({ all: () => (row === 7 ? [1, 2, 3] : []) }) },
    });
    expect(await counts(NEW)).toEqual({ regions: 1, gyms: 3 });
    // A server without its row has none.
    expect(await counts(SET_UP)).toEqual({ regions: 0, gyms: 0 });
  });
});
