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

const HOUR = 60 * 60_000;
const OTHER_GUILD = '412345678901234599';
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

function setup(options: { announceChanges?: boolean; servers?: string[] } = {}) {
  const gateway = new FakePartyGateway();
  const base = loadSettings(TEST_SETTINGS_PATH);
  const settings = {
    ...base,
    raidBosses: { ...base.raidBosses, announceChanges: options.announceChanges ?? true },
  };
  const { log, entries } = createTestLogger();
  const announcer = new RaidBossAnnouncer({
    gateway,
    servers: () => options.servers ?? [gateway.guildId],
    settings,
    log,
  });
  const sentTo = (channelId: string) =>
    gateway.messages
      .filter((message) => message.channelId === channelId)
      .map((message) => message.message.content);
  return { gateway, announcer, entries, sentTo };
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
    gateway.addChannel('700000000000000002', 'general');
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
    const { gateway, announcer, sentTo } = setup();
    gateway.addChannel('700000000000000005', 'mod-bot-only');
    for (let hour = 1; hour <= 11; hour++) {
      announcer.stale({ lastSyncedAt: hour * HOUR, reason: 'down' });
    }
    announcer.ready();
    await announcer.flush();
    const sent = sentTo('700000000000000005');
    expect(sent).toHaveLength(10);
    expect(sent[0]).toContain(`<t:${String((2 * HOUR) / 1000)}:f>`);
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
    const { gateway, announcer } = setup();
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
  });

  it('warns the moderators of a stale list once, without the error, whatever the setting', async () => {
    const { gateway, announcer, sentTo } = setup({ announceChanges: false });
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
    const [warning, ...more] = sentTo('700000000000000005');
    expect(more).toEqual([]);
    expect(warning).toContain(`since <t:${String(readAt / 1000)}:f>`);
    expect(warning).not.toContain('500');
    expect(warning).not.toContain('secret');
    expect(sentTo('700000000000000001')).toEqual([]);
  });
});
