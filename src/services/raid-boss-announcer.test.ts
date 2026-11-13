import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import {
  feedReply,
  raidBossServiceWith,
  readRaidBossFeed,
} from '../../test/support/raid-bosses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { loadSettings } from '../config/settings.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { diffBosses } from '../domain/pogo/boss-diff.js';
import type { FeedBoss } from '../domain/pogo/raid-boss-feed.js';
import { diffFeed, effectiveBosses, type NewBossOverride } from '../domain/pogo/raid-bosses.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import { RaidBossAnnouncer } from './raid-boss-announcer.js';
import type { FeedChange } from './raid-boss-service.js';
import { TestServers, testServerValues, withZones } from '../../test/support/server-values.js';
import { RecordingDms } from '../../test/support/dms.js';
import { RecordingNotices } from '../../test/support/server-notices.js';
import { TEST_ENV } from '../../test/support/test-env.js';
import { DM_PRIORITY } from './dm-sender.js';

const HOUR = 60 * 60_000;
const OWNER = TEST_ENV.OWNER_ID ?? '';
const OTHER_GUILD = '412345678901234599';
const UPDATES = '700000000000000001';
const OTHER_UPDATES = '700000000000000003';
const MOD_LAB = '700000000000000005';
const T1: RaidTier = { level: 'T1', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };

const zekrom: FeedBoss = {
  pokemonId: 'ZEKROM',
  form: null,
  tier: T5,
  shiny: false,
  name: 'Zekrom',
};
const pikachu = (year: string): FeedBoss => ({
  pokemonId: 'PIKACHU',
  form: `PIKACHU_GLASS_HELMET_${year}`,
  tier: T1,
  shiny: false,
  name: 'Pikachu',
});

/** A change of the feed from these rows to those, as the service reports it (no overrides). */
function change(before: FeedBoss[], after: FeedBoss[]): FeedChange {
  const list = (rows: FeedBoss[]) => effectiveBosses(rows, [], catalogueFixture(), 0);
  return { ...diffFeed(before, after), seen: diffBosses(list(before), list(after)) };
}

const ZEKROM_OVERRIDE: NewBossOverride = {
  action: 'add',
  pokemonId: 'ZEKROM',
  form: null,
  tier: T5,
  shiny: null,
  expiresAt: null,
  createdBy: '123456789012345678',
};

function setup(options: { announceChanges?: boolean; servers?: string[]; ownerId?: string } = {}) {
  const gateway = new FakePartyGateway();
  const base = loadSettings(TEST_SETTINGS_PATH);
  const settings = {
    ...base,
    raidBosses: { ...base.raidBosses, announceChanges: options.announceChanges ?? true },
  };
  const { log, entries } = createTestLogger();
  // The channels each server's staff set (plan 19A-1): the main server's bot updates and
  // moderators' bot lab, the other's bot updates, none in a third.
  const servers = new TestServers(
    testServerValues({ channels: { 'bot-updates': UPDATES, 'mod-bot-lab': MOD_LAB } }),
  );
  servers.changed.set(
    OTHER_GUILD,
    testServerValues({ channels: { 'bot-updates': OTHER_UPDATES } }),
  );
  servers.changed.set('412345678901234500', testServerValues({ channels: {} }));
  const dms = new RecordingDms();
  const notices = new RecordingNotices();
  const announcer = new RaidBossAnnouncer({
    gateway,
    serverIds: () => options.servers ?? [gateway.guildId],
    servers,
    settings,
    log,
    dms,
    ownerId: options.ownerId ?? OWNER,
    notices,
  });
  const sentTo = (channelId: string) =>
    gateway.messages
      .filter((message) => message.channelId === channelId)
      .map((message) => message.message.content);
  /** The owner's DMs, as plain text. */
  const toOwner = () => dms.to(OWNER).map((message) => (message as { content: string }).content);
  return { gateway, announcer, entries, sentTo, servers, dms, notices, toOwner };
}

/** The feed as downloaded, without Yveltal and with Zekrom. */
function changedFeed(): string {
  const feed = (readRaidBossFeed() as { name: string }[]).filter(
    (entry) => entry.name !== 'Yveltal',
  );
  return JSON.stringify([...feed, { name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false }]);
}

describe('RaidBossAnnouncer', () => {
  it('posts a change of the list in the channel for bot updates of every server', async () => {
    const { gateway, announcer, sentTo } = setup({ servers: ['412345678901234567', OTHER_GUILD] });
    gateway.addChannel('700000000000000001', 'bot-updates');
    // Another channel of that name is not the one its staff set.
    gateway.addChannel('700000000000000002', 'bot-updates');
    gateway.addChannel('700000000000000003', 'bot-updates', { guildId: OTHER_GUILD });
    const bosses = await raidBossServiceWith();
    announcer.attach(bosses.service);
    announcer.ready();
    bosses.state.respond = () => Promise.resolve(feedReply(200, changedFeed()));
    bosses.state.now += HOUR;
    await bosses.service.sync();
    await announcer.flush();
    const text = '**The raid bosses have changed**\n**T5** · New: Zekrom · Gone: Yveltal';
    expect(sentTo('700000000000000001')).toEqual([text]);
    expect(sentTo('700000000000000003')).toEqual([text]);
    expect(gateway.messages).toHaveLength(2);
    expect(gateway.messages[0]?.message.mention).toBeUndefined();
  });

  it('tells a zone’s change to the servers in that zone only, once each (plan 19A-2)', async () => {
    const { gateway, announcer, sentTo, servers } = setup({
      servers: ['412345678901234567', OTHER_GUILD],
    });
    withZones({ [OTHER_GUILD]: 'Europe/Berlin' }, servers);
    gateway.addChannel(UPDATES, 'bot-updates');
    gateway.addChannel(OTHER_UPDATES, 'bot-updates', { guildId: OTHER_GUILD });
    announcer.ready();
    announcer.changed({ ...change([], [zekrom]), zone: 'Europe/Berlin' });
    await announcer.flush();
    expect(sentTo(OTHER_UPDATES)).toHaveLength(1);
    expect(sentTo(UPDATES)).toEqual([]);
    announcer.changed({ ...change([], [zekrom]), zone: 'America/New_York' });
    await announcer.flush();
    expect(sentTo(OTHER_UPDATES)).toHaveLength(1);
    expect(sentTo(UPDATES)).toHaveLength(1);
  });

  it('waits for the client to be ready', async () => {
    const { gateway, announcer, sentTo } = setup();
    gateway.addChannel('700000000000000001', 'bot-updates');
    const bosses = await raidBossServiceWith();
    announcer.attach(bosses.service);
    bosses.state.respond = () => Promise.resolve(feedReply(200, changedFeed()));
    await bosses.service.sync();
    await announcer.flush();
    expect(gateway.messages).toEqual([]);
    announcer.ready();
    await announcer.flush();
    expect(sentTo('700000000000000001')).toHaveLength(1);
  });

  it('says nothing when the setting is off, or when members see the same list', async () => {
    const off = setup({ announceChanges: false });
    off.gateway.addChannel('700000000000000001', 'bot-updates');
    off.announcer.ready();
    off.announcer.changed(change([], [zekrom]));
    const on = setup();
    on.gateway.addChannel('700000000000000001', 'bot-updates');
    on.announcer.ready();
    on.announcer.changed(change([pikachu('2026')], [pikachu('2027')]));
    await off.announcer.flush();
    await on.announcer.flush();
    expect(off.gateway.messages).toEqual([]);
    expect(on.gateway.messages).toEqual([]);
  });

  it('announces what members see, with the overrides in force', async () => {
    const { gateway, announcer, sentTo } = setup();
    gateway.addChannel('700000000000000001', 'bot-updates');
    const bosses = await raidBossServiceWith({
      overrides: [
        { ...ZEKROM_OVERRIDE, action: 'hide' },
        { ...ZEKROM_OVERRIDE, action: 'add', pokemonId: 'YVELTAL' },
      ],
    });
    announcer.attach(bosses.service);
    announcer.ready();
    const feed = (readRaidBossFeed() as { name: string }[]).filter(
      (entry) => entry.name !== 'Yveltal',
    );
    feed.push({ name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false } as never);
    feed.push({ name: 'Mew', tier: '5-Star Raids', canBeShiny: false } as never);
    bosses.state.respond = () => Promise.resolve(feedReply(200, JSON.stringify(feed)));
    bosses.state.now += HOUR;
    await bosses.service.sync();
    await announcer.flush();
    // Zekrom stays hidden and Yveltal stays added: only Mew is news to members.
    expect(sentTo('700000000000000001')).toEqual([
      '**The raid bosses have changed**\n**T5** · New: Mew',
    ]);
  });

  it('posts only where the bot may post embeds, and logs what failed', async () => {
    const { gateway, announcer, entries } = setup({ servers: ['412345678901234567', OTHER_GUILD] });
    gateway.addChannel('700000000000000001', 'bot-updates');
    gateway.addChannel('700000000000000003', 'bot-updates', { guildId: OTHER_GUILD });
    gateway.noEmbeds.add('700000000000000001');
    gateway.failing.set('sendMessage', new Error('Missing Access'));
    announcer.ready();
    announcer.changed(change([], [zekrom]));
    await announcer.flush();
    expect(gateway.messages).toEqual([]);
    expect(
      entries.filter((e) => e['msg'] === 'could not announce the raid boss list'),
    ).toMatchObject([{ guild: OTHER_GUILD, what: 'change' }]);
  });

  it('keeps the ten newest announcements while it waits for the client', async () => {
    const { announcer, toOwner } = setup();
    for (let hour = 1; hour <= 11; hour++) {
      announcer.stale({ lastSyncedAt: hour * HOUR, reason: 'down' });
    }
    expect(toOwner()).toEqual([]);
    announcer.ready();
    await announcer.flush();
    const sent = toOwner();
    expect(sent).toHaveLength(10);
    expect(sent[0]).toContain(`<t:${String((2 * HOUR) / 1000)}:f>`);
  });

  // Plan 19B-1: what is wrong with one server's setup goes to its own staff.
  it('tells a server’s staff that its bot updates channel is gone or takes no post', async () => {
    const { gateway, announcer, notices } = setup({
      servers: ['412345678901234567', OTHER_GUILD, '412345678901234500'],
    });
    // The main server's channel is gone; the other's takes no embeds; the third set none.
    gateway.addChannel('700000000000000003', 'bot-updates', { guildId: OTHER_GUILD });
    gateway.noEmbeds.add('700000000000000003');
    announcer.ready();
    announcer.changed(change([], [zekrom]));
    await announcer.flush();
    expect(gateway.messages).toEqual([]);
    expect(notices.told).toEqual([
      {
        server: '412345678901234567',
        key: 'bot-updates:gone',
        text:
          'The bot updates channel set for this server is gone, so I could not announce a ' +
          'change of the raid bosses. Staff choose another in /admin settings.',
      },
      {
        server: OTHER_GUILD,
        key: 'bot-updates:cannot-post',
        text:
          `I may not post in <#700000000000000003>, the bot updates channel, so I could not ` +
          'announce a change of the raid bosses. Staff give me View Channel, Send Messages ' +
          'and Embed Links there.',
      },
    ]);
  });

  it('tells nothing of a server Discord says is unavailable', async () => {
    const AWAY = '412345678901234599';
    const { announcer, notices, servers, gateway } = setup({ servers: [AWAY] });
    servers.changed.set(AWAY, testServerValues({ channels: { 'bot-updates': OTHER_UPDATES } }));
    // Its channels as the cache kept them, without the bot updates channel: not said to be gone.
    gateway.addChannel('700000000000000071', 'general', { guildId: AWAY });
    gateway.unavailableServers.add(AWAY);
    announcer.ready();
    announcer.changed(change([], [zekrom]));
    await announcer.flush();
    expect(gateway.messages).toEqual([]);
    expect(notices.told).toEqual([]);
  });

  it('passes over a server it has left, and a server without the channel', async () => {
    const { gateway, announcer, sentTo } = setup({
      servers: ['412345678901234567', '412345678901234500', OTHER_GUILD],
    });
    gateway.addChannel('700000000000000003', 'bot-updates', { guildId: OTHER_GUILD });
    announcer.ready();
    announcer.changed(change([], [zekrom]));
    await announcer.flush();
    expect(gateway.messages).toHaveLength(1);
    expect(sentTo('700000000000000003')).toHaveLength(1);
  });

  it('waits in flush for the messages on their way, and sends nothing once closed', async () => {
    const { gateway, announcer, dms } = setup();
    gateway.addChannel('700000000000000001', 'bot-updates');
    announcer.ready();
    announcer.changed(change([], [zekrom]));
    expect(gateway.messages).toEqual([]);
    await announcer.flush();
    expect(gateway.messages).toHaveLength(1);
    await announcer.close();
    announcer.changed(change([], [zekrom]));
    announcer.stale({ lastSyncedAt: HOUR, reason: 'down' });
    await announcer.flush();
    expect(gateway.messages).toHaveLength(1);
    expect(dms.jobs).toEqual([]);
  });

  it('warns the owner of a stale list once, without the error, whatever the setting (plan 19B-1)', async () => {
    const { gateway, announcer, sentTo, dms, toOwner, notices } = setup({
      announceChanges: false,
    });
    gateway.addChannel('700000000000000005', 'mod-bot-only');
    gateway.addChannel('700000000000000001', 'bot-updates');
    const bosses = await raidBossServiceWith({ staleAfterMs: 48 * HOUR });
    announcer.attach(bosses.service);
    announcer.ready();
    const readAt = bosses.state.now;
    bosses.state.respond = () => Promise.resolve(feedReply(500, 'secret database text'));
    bosses.state.now += 49 * HOUR;
    await bosses.service.sync();
    bosses.state.now += HOUR;
    await bosses.service.sync();
    await announcer.flush();
    const [warning, ...more] = toOwner();
    expect(more).toEqual([]);
    expect(warning).toContain(`since <t:${String(readAt / 1000)}:f>`);
    expect(warning).not.toContain('500');
    expect(warning).not.toContain('secret');
    expect(dms.jobs[0]).toMatchObject({ userId: OWNER, priority: DM_PRIORITY.normal });
    // The feed is the instance's: no server's channel hears of it.
    expect(sentTo('700000000000000005')).toEqual([]);
    expect(sentTo('700000000000000001')).toEqual([]);
    expect(notices.told).toEqual([]);
  });

  it('tells nobody of a stale list without an owner', async () => {
    const { announcer, dms, gateway } = setup({ ownerId: ' ' });
    gateway.addChannel('700000000000000005', 'mod-bot-only');
    announcer.ready();
    announcer.stale({ lastSyncedAt: HOUR, reason: 'down' });
    await announcer.flush();
    expect(dms.jobs).toEqual([]);
    expect(gateway.messages).toEqual([]);
  });
});
