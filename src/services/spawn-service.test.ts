import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import { catalogueFixture, iconsFixture } from '../../test/support/game-data.js';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { ALICE } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import {
  accentOf,
  componentCount,
  textDisplays,
  textOf,
  thumbnailBeside,
  thumbnailOf,
  thumbnailsOf,
} from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import { raidBossesFixture } from '../../test/support/raid-bosses.js';
import { MAX_DETAILS } from '../commands/notifications/wild.js';
import {
  sightingMessage,
  SPAWN_FOOTER,
  SPAWN_MINUTES,
  SPAWN_CAUTION,
  SPAWN_WARNING,
  spawnBrief,
  spawnFooter,
  spawnMessage,
  spawnSentence,
  spawnTextMessage,
  type SpawnView,
} from '../render/spawn.js';
import { DELETE_AGAIN_MS, SpawnService, UNOWN_DEX, type SpawnReport } from './spawn-service.js';

const report = (guildId: string, more: Partial<SpawnReport> = {}): SpawnReport => ({
  guildId,
  regionChannelId: WEST_CHANNEL,
  pokemon: { dex: 147, key: 'dratini', name: 'Dratini' },
  details: 'by the fountain',
  reporter: { id: ALICE, name: 'Alice' },
  ...more,
});

function refusal(code: number): DiscordAPIError {
  return new DiscordAPIError({ code, message: 'Missing' }, code, 403, 'POST', '/x', {});
}

const background = watchEachTest();

/** Lets the work in the background finish, then checks that `done` came of it. */
async function until(done: () => boolean): Promise<void> {
  await background.settle();
  if (!done()) throw new Error('it never happened');
}

describe('SpawnService', () => {
  it('answers that the channel is gone, and tells nobody', async () => {
    const made = await partyServiceWith();
    const sent: string[] = [];
    const service = new SpawnService({
      gateway: {
        sendMessage: (channelId) => {
          sent.push(channelId);
          return Promise.resolve(undefined);
        },
        deleteMessage: () => Promise.resolve(),
        findChannel: () => undefined,
        mayPost: () => true,
      },
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      notify: {
        spawnReported: () => {
          throw new Error('nobody should be told');
        },
      },
      settings: made.settings,
      log: made.log,
    });
    expect(await service.report(report(made.gateway.guildId))).toEqual({ kind: 'no-channel' });
    expect(sent).toEqual([WEST_CHANNEL]);
    expect(service.pending).toBe(0);
  });

  it('rejects when the report cannot be sent, and has nothing to delete then', async () => {
    const made = await partyServiceWith();
    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    await expect(made.spawns.report(report(made.gateway.guildId))).rejects.toThrow('away');
    expect(made.spawns.pending).toBe(0);
    await made.notify.flush();
    expect(made.dms.jobs).toEqual([]);
  });

  it('answers that it was refused when the bot may not post there, and says so at warn', async () => {
    for (const code of [RESTJSONErrorCodes.MissingPermissions, RESTJSONErrorCodes.MissingAccess]) {
      const made = await partyServiceWith();
      made.gateway.failing.set('sendMessage', refusal(code));
      expect(await made.spawns.report(report(made.gateway.guildId))).toEqual({ kind: 'refused' });
      expect(made.spawns.pending).toBe(0);
      const said = made.entries.filter(
        (entry) => entry.msg === 'the bot may not post a spawn report in the channel of a region',
      );
      expect(said).toHaveLength(1);
      expect(said[0]).toMatchObject({ level: 40, channel: WEST_CHANNEL });
      await made.notify.flush();
      expect(made.dms.jobs).toEqual([]);
    }
  });

  it('posts the report as text where the bot may not post embeds: details and warning, no picture', async () => {
    const made = await partyServiceWith();
    made.gateway.noEmbeds.add(WEST_CHANNEL);
    const outcome = await made.spawns.report(
      report(made.gateway.guildId, { pokemon: { dex: 92, key: 'gastly', name: 'Gastly' } }),
    );
    expect(outcome.kind).toBe('posted');
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(posted?.message).toEqual({
      content:
        `A wild **Gastly** has been reported by **Alice** (<@${ALICE}>):\n` +
        `by the fountain\n\n${SPAWN_WARNING}\n-# ${SPAWN_FOOTER}`,
    });
    // It is deleted like any other report.
    expect(made.spawns.pending).toBe(1);
  });

  it('tries once more a minute later to delete a report it could not delete, then forgets it', async () => {
    const made = await partyServiceWith();
    await made.spawns.report(report(made.gateway.guildId));
    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    made.spawnTimers[0]?.run();
    await until(() => made.spawnTimers.length === 2);
    expect(made.spawnTimers[1]?.ms).toBe(DELETE_AGAIN_MS);
    expect(DELETE_AGAIN_MS).toBe(60_000);
    // It still counts as waiting: a shutdown meanwhile would try as well.
    expect(made.spawns.pending).toBe(1);
    made.spawnTimers[1]?.run();
    await until(() => made.spawns.pending === 0);
    await made.spawns.flush();
    expect(made.spawnTimers).toHaveLength(2);
    expect(
      made.entries.filter((entry) => entry.msg === 'could not delete a spawn report'),
    ).toHaveLength(1);
    // The second try works when Discord is back.
    const other = await partyServiceWith();
    await other.spawns.report(report(other.gateway.guildId));
    other.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    other.spawnTimers[0]?.run();
    await until(() => other.spawnTimers.length === 2);
    other.gateway.failing.delete('deleteMessage');
    other.spawnTimers[1]?.run();
    await until(() => other.gateway.deleted.length === 1);
    expect(other.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('takes no report once it is shut down, and says how many reports it could not remove', async () => {
    const made = await partyServiceWith();
    await made.spawns.report(report(made.gateway.guildId));
    await made.spawns.report(report(made.gateway.guildId));
    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    await made.spawns.flush();
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'spawn reports could not be removed at shutdown and stay',
      ),
    ).toMatchObject([{ level: 40, standing: 2 }]);
    made.gateway.failing.delete('deleteMessage');
    const before = made.gateway.messagesIn(WEST_CHANNEL).length;
    expect(await made.spawns.report(report(made.gateway.guildId))).toEqual({ kind: 'closed' });
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(before);
    expect(made.spawns.pending).toBe(0);
  });

  /**
   * A service over the fake gateway whose sends and deletions wait until `release` is called,
   * and whose timers the test fires.
   */
  async function held() {
    const made = await partyServiceWith();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const timers: (() => void)[] = [];
    const told: unknown[] = [];
    const waited = { sends: 0, deletions: 0 };
    const service = new SpawnService({
      gateway: {
        sendMessage: async (channelId, message) => {
          waited.sends += 1;
          await gate;
          return made.gateway.sendMessage(channelId, message);
        },
        deleteMessage: async (channelId, messageId) => {
          waited.deletions += 1;
          await gate;
          return made.gateway.deleteMessage(channelId, messageId);
        },
        findChannel: (near, name) => made.gateway.findChannel(near, name),
        mayPost: (channelId) => made.gateway.mayPost(channelId),
      },
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      notify: { spawnReported: (news) => told.push(news) },
      settings: made.settings,
      log: made.log,
      setTimer: (run) => {
        timers.push(run);
        return () => undefined;
      },
    });
    return { made, service, release, timers, told, waited };
  }

  it('deletes at once a report whose send was on its way at shutdown, and answers that it is closed', async () => {
    const { made, service, release, timers, told, waited } = await held();
    const reporting = service.report(report(made.gateway.guildId));
    await until(() => waited.sends === 1);
    const flushing = service.flush();
    release();
    expect(await reporting).toEqual({ kind: 'closed' });
    await flushing;
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(made.gateway.deleted).toHaveLength(1);
    expect(service.pending).toBe(0);
    expect(timers).toEqual([]);
    expect(told).toEqual([]);
  });

  it('says so when a deletion that was on its way at shutdown fails', async () => {
    const { made, service, release, timers, waited } = await held();
    release();
    await service.report(report(made.gateway.guildId));
    // The deletion at its time is on its way when the bot shuts down, and fails.
    let fail: () => void = () => undefined;
    const failing = new Promise<void>((resolve) => {
      fail = resolve;
    });
    const deleteMessage = made.gateway.deleteMessage.bind(made.gateway);
    made.gateway.deleteMessage = async () => {
      await failing;
      throw new Error('Discord is away');
    };
    timers[0]?.();
    await until(() => waited.deletions === 1);
    const flushing = service.flush();
    fail();
    await flushing;
    made.gateway.deleteMessage = deleteMessage;
    expect(
      made.entries.filter((entry) => entry.msg === 'could not delete a spawn report'),
    ).toMatchObject([{ level: 40, channel: WEST_CHANNEL, err: { message: 'Discord is away' } }]);
    // Nothing is tried a minute later: the bot is gone by then.
    expect(timers).toHaveLength(1);
    expect(service.pending).toBe(0);
  });

  it('deletes a report by its own timer, after the time it is given', async () => {
    const made = await partyServiceWith();
    // The service's own timer, on the test's clock.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const service = new SpawnService({
      gateway: made.gateway,
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      settings: made.settings,
      log: made.log,
      deleteAfterMs: 20,
    });
    await service.report(report(made.gateway.guildId));
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
    expect(service.pending).toBe(1);
    // Nothing but the timer deletes it: no flush.
    vi.advanceTimersByTime(19);
    await background.settle();
    expect(made.gateway.deleted).toEqual([]);
    vi.advanceTimersByTime(1);
    await background.settle();
    expect(made.gateway.deleted).toHaveLength(1);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(service.pending).toBe(0);
    expect(SPAWN_MINUTES).toBe(30);
  });

  it('shows the picture of the raid boss feed for a current boss, and the icon of any other Pokémon', async () => {
    const made = await partyServiceWith();
    const service = new SpawnService({
      gateway: made.gateway,
      raidBosses: raidBossesFixture(),
      gameData: { catalogue: catalogueFixture(), icons: iconsFixture() },
      settings: made.settings,
      log: made.log,
      setTimer: () => () => undefined,
    });
    const boss = raidBossesFixture()
      .bosses()
      .find((one) => one.entry?.key === 'gastly');
    expect(boss?.image).toBeDefined();
    await service.report(
      report(made.gateway.guildId, { pokemon: { dex: 92, key: 'gastly', name: 'Gastly' } }),
    );
    await service.report(report(made.gateway.guildId));
    await service.report(
      report(made.gateway.guildId, { pokemon: { dex: 201, key: 'unown_f', name: 'Unown (F)' } }),
    );
    await service.report(
      report(made.gateway.guildId, { pokemon: { dex: 99_999, key: 'nomon', name: 'Nomon' } }),
    );
    const pictures = made.gateway
      .messagesIn(WEST_CHANNEL)
      .map((posted) => thumbnailOf(posted.message));
    expect(pictures).toEqual([
      boss?.image,
      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm147.icon.png',
      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm201.fUNOWN_F.icon.png',
      undefined,
    ]);
    // Without a list of icons only the feed's pictures are known, as before.
    const bare = new SpawnService({
      gateway: made.gateway,
      raidBosses: raidBossesFixture(),
      gameData: { catalogue: catalogueFixture() },
      settings: made.settings,
      log: made.log,
      setTimer: () => () => undefined,
    });
    await bare.report(report(made.gateway.guildId));
    expect(made.gateway.messagesIn(WEST_CHANNEL).at(-1)?.message.embeds?.[0]?.thumbnail).toBe(
      undefined,
    );
  });

  it('hands the notifier what it posted, with the time of the report', async () => {
    const made = await partyServiceWith();
    const told: unknown[] = [];
    const service = new SpawnService({
      gateway: made.gateway,
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      notify: { spawnReported: (news) => told.push(news) },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
    });
    await service.report(report(made.gateway.guildId, { iv: 'zero' }));
    expect(told).toEqual([
      {
        ...report(made.gateway.guildId, { iv: 'zero' }),
        messageId: made.gateway.messagesIn(WEST_CHANNEL)[0]?.id,
        eventAt: made.clock.now,
        goneAt: made.clock.now + SPAWN_MINUTES * 60_000,
        view: {
          pokemon: 'Dratini',
          iv: 'zero',
          details: 'by the fountain',
          reporter: { id: ALICE, name: 'Alice' },
          image: undefined,
        },
      },
    ]);
    await service.flush();
    expect(UNOWN_DEX).toBe(201);
  });

  it('calls a report costumed where an event on lists it costumed, in the report and to the notifier', async () => {
    const made = await partyServiceWith();
    const told: { costumed?: boolean; view: SpawnView }[] = [];
    const asked: number[] = [];
    const service = new SpawnService({
      gateway: made.gateway,
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      notify: { spawnReported: (news) => told.push(news) },
      // Dratini costumed and plain (plan 8R-4: then costumed), Pikachu plain only.
      costumes: {
        sightingsAt: (moment) => {
          asked.push(moment);
          return [
            { key: 'dratini', dex: 147, costumed: false },
            { key: 'dratini', dex: 147, costumed: true },
            { key: 'pikachu', dex: 25, costumed: false },
          ];
        },
      },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
    });
    const outcome = await service.report(report(made.gateway.guildId));
    expect(outcome).toMatchObject({ kind: 'posted', costumed: true });
    expect(asked).toEqual([made.clock.now]);
    expect(told[0]?.costumed).toBe(true);
    expect(told[0]?.view.costumed).toBe(true);
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(textDisplays(posted?.message)[0]).toMatch(/^### Wild costumed Dratini\n/);
    const plain = await service.report(
      report(made.gateway.guildId, { pokemon: { dex: 25, key: 'pikachu', name: 'Pikachu' } }),
    );
    expect(plain).not.toHaveProperty('costumed');
    expect(told[1]).not.toHaveProperty('costumed');
    await service.flush();
  });

  it('posts a report as plain when the events’ spawns cannot be asked, and says so', async () => {
    const made = await partyServiceWith();
    const service = new SpawnService({
      gateway: made.gateway,
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      costumes: {
        sightingsAt: () => {
          throw new Error('broken');
        },
      },
      settings: made.settings,
      log: made.log,
    });
    expect(await service.report(report(made.gateway.guildId))).toMatchObject({ kind: 'posted' });
    expect(
      made.entries.filter((entry) => entry.msg === 'could not tell whether a spawn is costumed'),
    ).toHaveLength(1);
    await service.flush();
  });

  it('hands the notifier the moment the report goes away, the one the report shows', async () => {
    const made = await partyServiceWith();
    const told: { goneAt?: number; eventAt: number }[] = [];
    const service = new SpawnService({
      gateway: made.gateway,
      raidBosses: { bosses: () => [] },
      gameData: { catalogue: catalogueFixture() },
      notify: { spawnReported: (news) => told.push(news) },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      deleteAfterMs: 10 * 60_000,
      setTimer: () => () => undefined,
    });
    await service.report(report(made.gateway.guildId));
    expect(told[0]?.goneAt).toBe(made.clock.now + 10 * 60_000);
  });

  async function pictured(withSightings = false) {
    const made = await partyServiceWith();
    const SIGHTINGS = '100000000000000031';
    if (withSightings) made.gateway.channelNames.set(SIGHTINGS, made.settings.channels.unown);
    const told: unknown[] = [];
    const timers: { run: () => void; ms: number }[] = [];
    const service = new SpawnService({
      gateway: made.gateway,
      raidBosses: raidBossesFixture(),
      gameData: { catalogue: catalogueFixture(), icons: iconsFixture() },
      notify: { spawnReported: (news) => told.push(news) },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      setTimer: (run, ms) => {
        timers.push({ run, ms });
        return () => undefined;
      },
    });
    made.gateway.rejectThumbnails = true;
    return { made, service, told, timers, SIGHTINGS };
  }

  it('posts a report again without its picture when Discord refuses the picture', async () => {
    const { made, service, told, timers } = await pictured();
    const outcome = await service.report(
      report(made.gateway.guildId, { pokemon: { dex: 92, key: 'gastly', name: 'Gastly' } }),
    );
    expect(outcome.kind).toBe('posted');
    const posted = made.gateway.messagesIn(WEST_CHANNEL);
    expect(posted).toHaveLength(1);
    const message = posted[0]?.message;
    expect(message === undefined ? 'none' : thumbnailOf(message)).toBeUndefined();
    expect(message === undefined ? '' : textOf(message)).toContain('### Wild Gastly');
    expect(service.pending).toBe(1);
    expect(timers.map((timer) => timer.ms)).toEqual([SPAWN_MINUTES * 60_000]);
    // Told to who wants it.
    expect(told).toHaveLength(1);
    await service.flush();
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('posts a report again without either picture when Discord refuses one', async () => {
    const { made, service } = await pictured();
    await service.report(
      report(made.gateway.guildId, {
        near: {
          kind: 'stop',
          id: '0123456789abcdef0123456789abcdef.16',
          title: 'Bench',
          lat: 40.05,
          lon: -80.05,
          image: 'https://lh3.googleusercontent.com/b',
          address: null,
        },
      }),
    );
    const posted = made.gateway.messagesIn(WEST_CHANNEL);
    expect(posted).toHaveLength(1);
    expect(thumbnailsOf(posted[0]?.message)).toEqual([]);
    expect(textOf(posted[0]?.message)).toContain('Near **Bench** (PokéStop)');
    // Without its picture, a place without an address need not say it has none.
    expect(textOf(posted[0]?.message)).toContain('Near **Bench** (PokéStop) · [Map]');
    expect(textOf(posted[0]?.message)).not.toContain('(no address available)');
    await service.flush();
  });

  it('posts the Unown sighting again without its picture too', async () => {
    const { made, service, SIGHTINGS } = await pictured(true);
    await service.report(
      report(made.gateway.guildId, { pokemon: { dex: 201, key: 'unown_f', name: 'Unown (F)' } }),
    );
    const region = made.gateway.messagesIn(WEST_CHANNEL);
    const sighting = made.gateway.messagesIn(SIGHTINGS);
    expect(region).toHaveLength(1);
    expect(sighting).toHaveLength(1);
    const message = sighting[0]?.message;
    expect(message === undefined ? 'none' : thumbnailOf(message)).toBeUndefined();
    expect(message === undefined ? '' : textOf(message)).toContain('Unown (F)');
    await service.flush();
  });
});

describe('the messages of a spawn report', () => {
  const view: SpawnView = {
    pokemon: 'Dratini',
    details: null,
    reporter: { id: ALICE, name: 'Alice' },
  };

  const GONE = Date.UTC(2026, 9, 15, 16, 30);

  it('is one container: the head with the picture, where it is, and the small print', () => {
    const message = spawnMessage(
      {
        ...view,
        iv: 'perfect',
        details: 'by the fountain',
        image: 'https://example.com/pm147.png',
      },
      SPAWN_FOOTER,
      GONE,
    );
    expect(textDisplays(message)).toEqual([
      `### Wild Dratini\nwith 100% IVs · reported by **Alice** (<@${ALICE}>)\n` +
        `This report goes away <t:${String(GONE / 1000)}:R>.`,
      '**Where**\nby the fountain',
      `-# Spawns can be gone before you get there. · ${SPAWN_FOOTER}`,
    ]);
    expect(SPAWN_CAUTION).toBe('Spawns can be gone before you get there.');
    expect(accentOf(message)).toBe(0x2ecc71);
    expect(thumbnailOf(message)).toBe('https://example.com/pm147.png');
    expectV2Sendable(message);
  });

  const NEAR = {
    kind: 'stop' as const,
    id: '0123456789abcdef0123456789abcdef.16',
    title: 'Fountain *Square* https://example.com',
    lat: 40.05,
    lon: -80.05,
    image: 'https://lh3.googleusercontent.com/square',
    address: '20 *Market* Street, Pinewood, PA 15999, USA',
  };
  const NEAR_LINE =
    'Near **Fountain \\*Square\\* https:​//example.com** (PokéStop) · ' +
    '20 \\*Market\\* Street, Pinewood, PA 15999, USA · ' +
    '[Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)';

  it('says the address of the place it is near, or that it has none', () => {
    const line = (address: string | null) =>
      textDisplays(
        spawnMessage({ ...view, details: 'here', near: { ...NEAR, address } }, '', GONE),
      )[1];
    expect(line(null)).toContain('(PokéStop) · (no address available) · [Map]');
    expect(line('Ave https://evil.example')).toContain(
      '(PokéStop) · Ave https:\u200b//evil.example · [Map]',
    );
  });

  it('names the place it is near, with its map link and its picture beside where it is', () => {
    const message = spawnMessage(
      { ...view, details: 'by the fountain', image: 'https://example.com/pm147.png', near: NEAR },
      SPAWN_FOOTER,
      GONE,
    );
    expect(textDisplays(message)[1]).toBe(`**Where**\nby the fountain\n${NEAR_LINE}`);
    expect(thumbnailOf(message)).toBe('https://example.com/pm147.png');
    expect(thumbnailBeside(message, '**Where**')).toBe(`${NEAR.image}=s400`);
    expectV2Sendable(message);
    // A picture from elsewhere is not shown; a gym and a power spot are named as such.
    const gym = spawnMessage(
      { ...view, details: 'here', near: { ...NEAR, kind: 'gym', image: 'https://example.com/x' } },
      SPAWN_FOOTER,
      GONE,
    );
    expect(thumbnailsOf(gym)).toEqual([]);
    expect(textDisplays(gym)[1]).toContain('(gym) · 20 \\*Market\\* Street');
    const spot = sightingMessage(
      { ...view, details: 'here', near: { ...NEAR, kind: 'powerspot' } },
      WEST_CHANNEL,
    );
    expect(textOf(spot)).toContain('(Power Spot) · 20 \\*Market\\* Street');
    // Text, the brief of a direct message: the place by name.
    expect(
      spawnTextMessage({ ...view, details: 'here', near: NEAR }, SPAWN_FOOTER).content,
    ).toContain(`here\n${NEAR_LINE}`);
    expect(spawnBrief({ ...view, details: 'here', near: NEAR }, GONE).lines).toEqual([
      '**Where** here',
      NEAR_LINE,
      `The report goes away <t:${String(GONE / 1000)}:R>.`,
    ]);
  });

  it('has no Where when nothing was said about where, and no picture without one', () => {
    for (const details of [null, '   ']) {
      const message = spawnMessage({ ...view, details }, SPAWN_FOOTER, GONE);
      expect(textDisplays(message)).toEqual([
        `### Wild Dratini\nReported by **Alice** (<@${ALICE}>)\n` +
          `This report goes away <t:${String(GONE / 1000)}:R>.`,
        `-# ${SPAWN_CAUTION} · ${SPAWN_FOOTER}`,
      ]);
      expect(thumbnailOf(message)).toBeUndefined();
      expectV2Sendable(message);
    }
  });

  it('keeps the longest report within what Discord takes', () => {
    const typed: SpawnView = {
      pokemon: '*_~`|>['.repeat(20),
      iv: 'zero',
      details: '*_~`|>[<@1>'.repeat(Math.ceil(MAX_DETAILS / 11)).slice(0, MAX_DETAILS),
      reporter: { id: ALICE, name: '*_~`|>['.repeat(5) },
      image: 'https://example.com/pm147.png',
      near: { ...NEAR, title: '[*]'.repeat(85), image: `${NEAR.image}/${'p'.repeat(200)}` },
    };
    for (const message of [
      spawnMessage(typed, SPAWN_FOOTER, GONE),
      sightingMessage(typed, WEST_CHANNEL),
    ]) {
      expect(componentCount(message)).toBeLessThanOrEqual(40);
      expectV2Sendable(message);
    }
  });

  it('names the reporter with the mention in the server and by name alone elsewhere', () => {
    expect(textDisplays(spawnMessage(view, SPAWN_FOOTER, GONE))[0]).toContain(
      `Reported by **Alice** (<@${ALICE}>)`,
    );
    // A direct message leads to the report by its button: the sentence has no address.
    expect(spawnSentence({ ...view, iv: 'zero' }, WEST_CHANNEL)).toBe(
      `A wild **Dratini** with 0% IVs has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
    );
    // The sighting stays: its head is the sentence that names the region, and no footer.
    expect(
      textDisplays(sightingMessage({ ...view, details: 'at the library' }, WEST_CHANNEL)),
    ).toEqual([
      `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
      '**Where**\nat the library',
      `-# ${SPAWN_CAUTION}`,
    ]);
  });

  it('says "costumed" before the name of a costumed spawn in every message (plan 8R-4)', () => {
    const costumed: SpawnView = { ...view, costumed: true };
    expect(textDisplays(spawnMessage(costumed, SPAWN_FOOTER, GONE))[0]).toMatch(
      /^### Wild costumed Dratini\n/,
    );
    expect(spawnSentence({ ...costumed, iv: 'zero' }, WEST_CHANNEL)).toBe(
      `A wild costumed **Dratini** with 0% IVs has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
    );
    expect(spawnTextMessage(costumed, SPAWN_FOOTER).content).toMatch(
      /^A wild costumed \*\*Dratini\*\* has been reported by/,
    );
  });

  it('shows no working link a member typed, in the details or in their name, in any message', () => {
    const typed: SpawnView = {
      pokemon: 'Dratini',
      details: 'free coins https://evil.example/a_b www.evil.example discord.gg/abc',
      reporter: { id: ALICE, name: 'discord.gg/xyz' },
    };
    const details =
      'free coins https:\u200B//evil.\u200Bexample/a\\_b www.\u200Bevil.example discord.\u200Bgg/abc';
    const texts = [
      textOf(spawnMessage(typed, SPAWN_FOOTER, GONE)),
      spawnTextMessage(typed, SPAWN_FOOTER).content,
      textOf(sightingMessage(typed, WEST_CHANNEL)),
      // The direct message: the sentence and the brief.
      spawnSentence(typed, WEST_CHANNEL),
      ...spawnBrief(typed, 0).lines,
    ];
    for (const text of texts) {
      expect(text).not.toContain('://');
      expect(text).not.toContain('www.e');
      expect(text).not.toMatch(/discord\.gg/);
    }
    expect(spawnTextMessage(typed, SPAWN_FOOTER).content).toContain(
      `${details}\n\n${SPAWN_WARNING}`,
    );
    expect(textDisplays(spawnMessage(typed, SPAWN_FOOTER, GONE))[1]).toBe(`**Where**\n${details}`);
    expect(textDisplays(spawnMessage(typed, SPAWN_FOOTER, GONE))[0]).toContain(
      `Reported by **discord.\u200Bgg/xyz** (<@${ALICE}>)`,
    );
    expect(spawnSentence(typed, WEST_CHANNEL)).toBe(
      `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **discord.\u200Bgg/xyz**.`,
    );
  });

  it('names `/want` in the footer only where the server has notifications', () => {
    expect(spawnFooter(true)).toBe(SPAWN_FOOTER);
    expect(SPAWN_FOOTER).toBe('/want tells you of spawns like this one · /wild reports one');
    expect(spawnFooter(false)).toBe('/wild reports a spawn like this one');
    expect(textDisplays(spawnMessage(view, spawnFooter(false), GONE)).at(-1)).toBe(
      `-# ${SPAWN_CAUTION} · /wild reports a spawn like this one`,
    );
    expect(spawnTextMessage(view, spawnFooter(false)).content).toMatch(
      /\n-# \/wild reports a spawn like this one$/,
    );
  });
});
