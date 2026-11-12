import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ELITE_GYM_CHANNEL, REMOTE_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { ALICE, asRaid, at, BOB, MINUTE, withAttendees } from '../../test/support/parties.js';
import {
  gatewayWithMirrorChannels,
  type ServiceOverrides,
  reportedRaid,
  restarted,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import {
  TEST_SERVER_CHANNELS,
  TestServers,
  testServerValues,
  withFeatures,
} from '../../test/support/server-values.js';
import { Tally } from '../../test/support/tally.js';
import {
  watchBackground,
  watchImmediates,
  type ImmediateWatch,
} from '../../test/support/timers.js';
import { setBoss, setEndTime } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';
import { RETRY_AFTER_MS } from './party-mirrors.js';
import type { PartyServiceOptions, RaidReport } from './party-service.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import {
  buttonsOf,
  copiedPost,
  customIdsOf,
  leadOf,
  textDisplays,
  textOf,
  thumbnailOf,
  thumbnailsOf,
} from '../../test/support/messages.js';

const AFAR_CHANNEL = '100000000000000029';
const alice: Member = { id: ALICE, name: 'Alice' };

/** What a copy elsewhere shows of a post: its texts (Meet… works there too, plan 8X-1B). */
const elsewhere = (message: OutgoingMessage | undefined): string[] => textDisplays(message);
const yveltal = { boss: { key: 'yveltal' } } as const;
const ELITE = { level: 'Elite', shadow: false } as const;

/** The invented gyms, with the Library (gym 1) as an elite raid gym. */
function gymsWithExLibrary(): PartyServiceOptions['gyms'] {
  const gyms = gymsFixture();
  return {
    get: (id) => {
      const gym = gyms.get(id);
      return gym && id === 1 ? { ...gym, taggedEx: true } : gym;
    },
    regionsOf: (id) => gyms.regionsOf(id),
  };
}

/** A raid at the Library in a server that has both channels for copies. */
function mirrored(report: Partial<RaidReport> = {}, overrides: ServiceOverrides = {}) {
  return reportedRaid(report, overrides, { gateway: gatewayWithMirrorChannels() });
}

describe('the copies of a raid in other channels', () => {
  it('puts a new raid into the remote channel, with the controls and a link to the post', async () => {
    const made = await mirrored(yveltal);
    const { gateway, postId } = made;
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    const post = gateway.posts.get(postId);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
    expect(leadOf(copy?.message)).toBe(`A raid in <#${WEST_CHANNEL}>: <#${postId}>`);
    expect(copiedPost(copy?.message)).toEqual(elsewhere(post?.message));
    expect(buttonsOf(copy?.message)).toEqual(buttonsOf(post?.message));
    expect(copy?.message.mention).toBeUndefined();
    expect(made.current().mirrorMessages).toEqual([
      { channelId: REMOTE_CHANNEL, messageId: copy?.id, kind: 'remote' },
    ]);
    // The Library is no elite raid gym.
    expect(gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
  });

  it('puts a raid at an elite raid gym into the channel for those as well', async () => {
    const made = await mirrored({}, { gyms: gymsWithExLibrary() });
    expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)).toHaveLength(1);
    expect(leadOf(made.gateway.messagesIn(ELITE_GYM_CHANNEL)[0]?.message)).toBe(
      `A raid at an elite raid gym in <#${WEST_CHANNEL}>: <#${made.postId}>`,
    );
    expect(made.current().mirrorMessages.map((mirror) => mirror.kind)).toEqual(['ex', 'remote']);

    // An elite raid there too: it is only the remote channel that an elite raid stays out of.
    const elite = await mirrored(
      { tier: { level: 'Elite', shadow: false } },
      { gyms: gymsWithExLibrary() },
    );
    expect(elite.gateway.messagesIn(ELITE_GYM_CHANNEL)).toHaveLength(1);
    expect(elite.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
  });

  it("makes the copy in the channel the server's staff set, by its id, whatever its name", async () => {
    const gateway = gatewayWithMirrorChannels();
    gateway.channelNames.set(AFAR_CHANNEL, 'raids-from-afar');
    const servers = new TestServers(
      testServerValues({ channels: { ...TEST_SERVER_CHANNELS, 'remote-raids': AFAR_CHANNEL } }),
    );
    const made = await reportedRaid(yveltal, { gyms: gymsWithExLibrary(), servers }, { gateway });
    expect(made.gateway.messagesIn(AFAR_CHANNEL)).toHaveLength(1);
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    // None where the server has none set.
    const unset = new TestServers(testServerValues({ channels: {} }));
    const none = await reportedRaid(
      yveltal,
      { gyms: gymsWithExLibrary(), servers: unset },
      { gateway: gatewayWithMirrorChannels() },
    );
    expect(none.current().mirrorMessages).toEqual([]);
  });

  it('makes no copy where the server has no such channel or the feature is off', async () => {
    const plain = await reportedRaid(yveltal, { gyms: gymsWithExLibrary() });
    expect(plain.current().mirrorMessages).toEqual([]);
    expect(plain.gateway.calls.filter((call) => call.startsWith('sendMessage'))).toEqual([
      `sendMessage ${WEST_CHANNEL}`,
    ]);

    const servers = withFeatures({ exGymChannel: false, remoteRaidChannel: false });
    const off = await mirrored(yveltal, { gyms: gymsWithExLibrary(), servers });
    expect(off.current().mirrorMessages).toEqual([]);
    expect(off.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(off.gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
  });

  it('shows a change in the copy too, and edits nothing when nothing changed', async () => {
    const made = await mirrored(yveltal);
    const { gateway, attendance, service, postId } = made;
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    expect(copy?.edits).toBe(1);
    expect(textOf(copy?.message)).toContain('Alice');
    expect(copiedPost(copy?.message)).toEqual(elsewhere(gateway.posts.get(postId)?.message));

    const before = gateway.calls.length;
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.calls.slice(before).filter((call) => call.startsWith('edit'))).toEqual([]);
  });

  it('carries controls that name the party, not the channel, so they work on the copy', async () => {
    const made = await mirrored(yveltal);
    const [copy] = made.gateway.messagesIn(REMOTE_CHANNEL);
    expect(customIdsOf(copy?.message)).toContain(`party:${made.party.id}:join`);
  });

  it('takes the copy out of the remote channel when the raid turns out to be an elite one', async () => {
    const made = await mirrored();
    const { gateway, store, service } = made;
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    await store.update(made.party.id, (party) =>
      setBoss(asRaid(party), { tier: ELITE, boss: null }, service.rules(), made.clock.now),
    );
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.deleted).toContainEqual({ channelId: REMOTE_CHANNEL, messageId: copy?.id });
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('takes the copies away once the raid is over by the clock', async () => {
    const made = await mirrored(yveltal, { gyms: gymsWithExLibrary() });
    const { gateway, store, service, clock } = made;
    await store.update(made.party.id, (party) => ({
      party: setEndTime(asRaid(party), at('2026-10-13T14:20'), service.rules(), clock.now),
    }));
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);

    clock.now = at('2026-10-13T14:20');
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('makes a copy anew that somebody deleted', async () => {
    const made = await mirrored(yveltal);
    const { gateway, attendance, service } = made;
    const [first] = gateway.messagesIn(REMOTE_CHANNEL);
    gateway.gone.add(first?.id ?? '');
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    const copies = gateway.messagesIn(REMOTE_CHANNEL).filter((copy) => copy.id !== first?.id);
    expect(copies).toHaveLength(1);
    expect(textOf(copies[0]?.message)).toContain('Alice');
    expect(made.current().mirrorMessages).toEqual([
      { channelId: REMOTE_CHANNEL, messageId: copies[0]?.id, kind: 'remote' },
    ]);
  });

  it('logs a copy that cannot be sent and tries again with the next change', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, attendance, service, entries } = made;
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    gateway.failing.set('sendMessage', new Error('Missing Permissions'));
    service.changed(made.party.id);
    await service.flush();
    expect(made.current().mirrorMessages).toEqual([]);
    expect(
      entries.some(
        (entry) => entry.level === 40 && entry.msg === 'could not send a copy of a party message',
      ),
    ).toBe(true);
    expect(gateway.posts.get(made.postId)?.archived).toBe(false);

    gateway.failing.clear();
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
  });

  it('deletes a copy again that it cannot record', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, storage } = made;
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    storage.failing = new Error('the database is away');
    service.changed(made.party.id);
    await service.flush();
    storage.failing = undefined;
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.calls.filter((call) => call === `sendMessage ${REMOTE_CHANNEL}`)).toHaveLength(
      1,
    );
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('sends a copy without the picture when Discord refuses the picture', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service } = made;
    expect(thumbnailOf(gateway.posts.get(made.postId)?.message)).toBeDefined();
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    gateway.rejectThumbnails = true;
    service.changed(made.party.id);
    await service.flush();
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    expect(thumbnailOf(copy?.message)).toBeUndefined();
    expect(copiedPost(copy?.message)).toEqual(elsewhere(gateway.posts.get(made.postId)?.message));
    // Said as the post's warning says it: Discord named the picture (`refusedPart`).
    expect(
      made.entries.filter((entry) => entry.level === 40 && entry.channel === REMOTE_CHANNEL),
    ).toEqual([
      expect.objectContaining({
        msg: 'Discord refused a picture; sending a copy without the pictures',
      }),
    ]);
  });

  it('sends a copy of an egg without its file where Discord refuses files, and remembers it', async () => {
    const made = await reportedRaid();
    const { gateway, service } = made;
    expect(gateway.posts.get(made.postId)?.attachments).toEqual(['raid_egg_2_icon.png']);
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    // Without Attach Files Discord answers Missing Permissions (50013), for the post and the copy.
    gateway.refuseFiles = true;
    service.changed(made.party.id);
    await service.flush();
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    expect(copy).toBeDefined();
    expect(thumbnailOf(copy?.message)).toBeUndefined();
    expect(copy?.attachments).toEqual([]);
    expect(made.current().mirrorMessages.map((mirror) => mirror.channelId)).toContain(
      REMOTE_CHANNEL,
    );
    // The copy was refused once (the post itself had nothing new to show).
    expect(gateway.filesRefused).toBe(1);
    // Edits: the post is refused once, the copy no more; then neither, and nothing is said again.
    for (const member of [alice, { id: BOB, name: 'Bob' }]) {
      await made.attendance.signUp(made.party.id, member, PartyStatus.Coming);
      await made.attendance.flush();
      service.changed(made.party.id);
      await service.flush();
    }
    expect(gateway.messagesIn(REMOTE_CHANNEL)[0]?.edits).toBe(2);
    expect(thumbnailOf(gateway.posts.get(made.postId)?.message)).toBeUndefined();
    expect(gateway.filesRefused).toBe(2);
  });

  it("sends a copy without the gym's picture when Discord refuses it", async () => {
    const gyms = gymsFixture();
    const picture = 'https://lh3.googleusercontent.com/library';
    // A super mega egg has no picture of its own: the library's is the post's only one.
    const made = await reportedRaid(
      { tier: { level: 'SuperMega', shadow: false } },
      {
        gyms: {
          get: (id) => {
            const gym = gyms.get(id);
            return gym && id === 1 ? { ...gym, imageUrl: picture } : gym;
          },
          regionsOf: (id) => gyms.regionsOf(id),
        },
      },
    );
    const { gateway, service } = made;
    expect(thumbnailsOf(gateway.posts.get(made.postId)?.message)).toEqual([`${picture}=s400`]);
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    gateway.rejectThumbnails = true;
    service.changed(made.party.id);
    await service.flush();
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    expect(copy).toBeDefined();
    expect(thumbnailsOf(copy?.message)).toEqual([]);
  });

  it('edits every copy once after a restart, and then only for a change', async () => {
    const made = await mirrored(yveltal);
    const again = await restarted(made);
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)[0]?.edits).toBe(1);
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)[0]?.edits).toBe(1);
  });
});

describe('the copies of a raid: what can go wrong on the way', () => {
  /** Every change is shown at once, as when changes come far apart. */
  const NO_DELAY = { renderDelayMs: 0, sharedDelayMs: 0 };

  /** Holds back the sends that `held` picks until `release()` is called. */
  function holdSends(
    made: Awaited<ReturnType<typeof reportedRaid>>,
    held: (channelId: string) => boolean,
  ) {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = made.gateway.sendMessage.bind(made.gateway);
    made.gateway.sendMessage = async (channelId, message) => {
      if (held(channelId) && message.v2) await gate;
      return send(channelId, message);
    };
    return () => {
      release();
    };
  }

  function missingPermissions(): DiscordAPIError {
    const code = RESTJSONErrorCodes.MissingPermissions;
    return new DiscordAPIError(
      { code, message: 'Missing Permissions' },
      code,
      403,
      'POST',
      '/x',
      {},
    );
  }

  it('lets a /status that is on its way land before the post is archived', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, postId } = made;
    const background = watchBackground();
    const release = holdSends(made, (channelId) => channelId === postId);
    const shown = service.showStatus(made.party.id);
    const ended = service.end(made.party.id);
    // The end waits for the copy: everything else is done, and nothing is archived yet.
    await background.settle();
    expect(gateway.posts.get(postId)?.archived).toBe(false);
    release();
    expect(await ended).toBe(true);
    expect(await shown).toBe(false);
    expect(gateway.messagesIn(postId)).toEqual([]);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
  });

  it('shows in the /status copy what changed while that copy was on its way', async () => {
    const made = await reportedRaid(yveltal, NO_DELAY);
    const { gateway, service, attendance, postId } = made;
    const release = holdSends(made, (channelId) => channelId === postId);
    const shown = service.showStatus(made.party.id);
    const edits = gateway.postEdits(postId).count;
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await gateway.postEdits(postId).reached(edits + 1);
    expect(textOf(gateway.posts.get(postId)?.message)).toContain('Alice');
    release();
    expect(await shown).toBe(true);
    await service.flush();
    const [copy] = gateway.messagesIn(postId).filter((message) => message.message.v2 === true);
    expect(textOf(copy?.message)).toContain('Alice');
  });

  it('keeps an earlier copy on record until it could be deleted, and deletes it then', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, postId, entries } = made;
    await service.showStatus(made.party.id);
    const [first] = gateway.messagesIn(postId);
    gateway.failing.set('deleteMessage', new Error('Discord is away'));
    // The new copy is up: the member is not told that something went wrong.
    expect(await service.showStatus(made.party.id)).toBe(true);
    expect(made.current().mirrorMessages.map((copy) => copy.kind)).toEqual(['status', 'status']);
    expect(
      entries.some((entry) => entry.msg === 'could not delete an earlier copy of a party message'),
    ).toBe(true);

    gateway.failing.clear();
    await service.flush();
    const copies = gateway.messagesIn(postId);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.id).not.toBe(first?.id);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: postId, messageId: copies[0]?.id, kind: 'status' },
    ]);
  });

  it('deletes every copy at the end, also one whose deletion had failed before', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, postId } = made;
    await service.showStatus(made.party.id);
    gateway.failing.set('deleteMessage', new Error('Discord is away'));
    await service.showStatus(made.party.id);
    gateway.failing.clear();
    expect(gateway.messagesIn(postId)).toHaveLength(2);
    await service.end(made.party.id);
    expect(gateway.messagesIn(postId)).toEqual([]);
  });

  it('says so loudly when a copy can neither be recorded nor deleted', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, storage, entries } = made;
    storage.failing = new Error('the database is away');
    gateway.failing.set('deleteMessage', new Error('Discord is away'));
    await expect(service.showStatus(made.party.id)).rejects.toThrow('the database is away');
    storage.failing = undefined;
    expect(
      entries.some(
        (entry) =>
          entry.level === 50 &&
          entry.msg ===
            'could not delete a copy that could not be recorded; it stays, with its buttons',
      ),
    ).toBe(true);
  });

  it('leaves a channel alone for ten minutes that refused it for lack of a permission', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, attendance, clock, entries } = made;
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    const send = gateway.sendMessage.bind(gateway);
    let refuse = true;
    gateway.sendMessage = (channelId, message) =>
      channelId === REMOTE_CHANNEL && refuse
        ? Promise.reject(missingPermissions())
        : send(channelId, message);
    const sends = () => gateway.calls.filter((call) => call === `sendMessage ${REMOTE_CHANNEL}`);
    let asked = 0;
    const real = gateway.findChannel.bind(gateway);
    gateway.findChannel = (near, id) => {
      if (id === REMOTE_CHANNEL) asked++;
      return real(near, id);
    };
    for (let change = 0; change < 3; change++) {
      await attendance.changeNumber(made.party.id, alice, 1);
      await service.flush();
    }
    expect(asked).toBe(3);
    const warnings = entries.filter((entry) => entry.level === 40);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.msg).toMatch(/I lack a permission in that channel/);
    expect(made.current().mirrorMessages).toEqual([]);

    // Ten minutes later it is tried again, and by then the permission is there.
    refuse = false;
    clock.now += 10 * MINUTE;
    await attendance.changeNumber(made.party.id, alice, 1);
    await service.flush();
    expect(sends()).toHaveLength(1);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
  });

  it('deletes a copy in a refusing channel once it is no longer wanted, and edits it no more meanwhile', async () => {
    const made = await mirrored(yveltal, NO_DELAY);
    const { gateway, service, attendance, store, clock } = made;
    await store.update(made.party.id, (party) => ({
      party: setEndTime(asRaid(party), at('2026-10-13T14:05'), service.rules(), clock.now),
    }));
    service.changed(made.party.id);
    await service.flush();
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    expect(copy).toBeDefined();

    const edit = gateway.editMessage.bind(gateway);
    let edits = 0;
    gateway.editMessage = (channelId, messageId, message) => {
      if (channelId !== REMOTE_CHANNEL) return edit(channelId, messageId, message);
      edits++;
      return Promise.reject(missingPermissions());
    };
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    expect(edits).toBe(1);
    // Refused: a second change does not try the edit again.
    await attendance.changeNumber(made.party.id, alice, 1);
    await service.flush();
    expect(edits).toBe(1);
    expect(made.current().mirrorMessages).toHaveLength(1);

    // The raid is over by the clock: the copy goes, the refusal notwithstanding.
    clock.now = at('2026-10-13T14:05');
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.deleted).toContainEqual({ channelId: REMOTE_CHANNEL, messageId: copy?.id });
    expect(made.current().mirrorMessages).toEqual([]);
    expect(edits).toBe(1);
  });

  it('does not refuse a channel anew for a deletion that failed', async () => {
    const made = await mirrored(yveltal, NO_DELAY);
    const { gateway, service, store, clock, entries } = made;
    await store.update(made.party.id, (party) => ({
      party: setEndTime(asRaid(party), at('2026-10-13T14:20'), service.rules(), clock.now),
    }));
    service.changed(made.party.id);
    await service.flush();
    const remove = gateway.deleteMessage.bind(gateway);
    gateway.deleteMessage = (channelId, messageId) =>
      channelId === REMOTE_CHANNEL
        ? Promise.reject(missingPermissions())
        : remove(channelId, messageId);
    clock.now = at('2026-10-13T14:20');
    service.changed(made.party.id);
    await service.flush();
    expect(made.current().mirrorMessages).toHaveLength(1);
    // The next render tries the deletion again, as nothing was left alone.
    gateway.deleteMessage = remove;
    service.changed(made.party.id);
    await service.flush();
    expect(made.current().mirrorMessages).toEqual([]);
    expect(entries.some((entry) => /leave it alone/.test(String(entry.msg)))).toBe(false);
  });

  it('drops a copy of the post that is recorded under another channel', async () => {
    const made = await reportedRaid(yveltal, NO_DELAY);
    const { gateway, service, store, postId } = made;
    const elsewhere = '700000000000000001';
    const messageId = (await gateway.sendMessage(elsewhere, { content: 'a copy' })) ?? '';
    await store.update(made.party.id, (party) => ({
      party: {
        ...party,
        mirrorMessages: [{ channelId: elsewhere, messageId, kind: 'status' as const }],
      },
    }));
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.deleted).toContainEqual({ channelId: elsewhere, messageId });
    expect(made.current().mirrorMessages).toEqual([]);
    expect(gateway.calls.filter((call) => call === `editMessage ${messageId}`)).toEqual([]);
    expect(gateway.messagesIn(postId).filter((message) => message.message.v2 === true)).toEqual([]);
  });

  it('does not make the post wait for the edit of its copy in a shared channel', async () => {
    const made = await mirrored(yveltal, NO_DELAY);
    const { gateway, service, attendance, postId } = made;
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const edit = gateway.editMessage.bind(gateway);
    gateway.editMessage = async (channelId, messageId, message) => {
      if (channelId === REMOTE_CHANNEL) await gate;
      return edit(channelId, messageId, message);
    };
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await gateway.postEdits(postId).reached(1);
    expect(gateway.posts.get(postId)?.edits).toBe(1);
    // The remote channel is slow; the post takes the next change all the same.
    await attendance.changeNumber(made.party.id, alice, 1);
    service.changed(made.party.id);
    const flushed = service.flush();
    await gateway.postEdits(postId).reached(2);
    expect(gateway.posts.get(postId)?.edits).toBe(2);
    expect(gateway.messagesIn(REMOTE_CHANNEL)[0]?.edits).toBe(0);
    release();
    await flushed;
    expect(textOf(gateway.messagesIn(REMOTE_CHANNEL)[0]?.message)).toContain('+1');
  });

  it('waits at the end for an edit of a copy that is under way', async () => {
    const made = await mirrored(yveltal, NO_DELAY);
    const { gateway, service, attendance, postId } = made;
    const background = watchBackground();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const edit = gateway.editMessage.bind(gateway);
    const underWay = new Tally('the edits of the remote copy');
    gateway.editMessage = async (channelId, messageId, message) => {
      if (channelId === REMOTE_CHANNEL) {
        underWay.add();
        await gate;
      }
      return edit(channelId, messageId, message);
    };
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    // The post shows the change, and the edit of its copy is on its way.
    await Promise.all([gateway.postEdits(postId).reached(1), underWay.reached(1)]);
    expect(gateway.posts.get(postId)?.edits).toBe(1);
    const ended = service.end(made.party.id);
    // Everything but the held edit is done, and nothing is archived yet.
    await background.settle();
    expect(gateway.posts.get(postId)?.archived).toBe(false);
    release();
    expect(await ended).toBe(true);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, reopened: 0 });
  });
});

describe('the copies of a raid: a failure is made good without a change of the raid', () => {
  let immediates: ImmediateWatch;
  beforeEach(() => {
    // Only the timers: the fakes answer on `setImmediate`, and the clock of the services is
    // `made.clock`. `immediates.settle()` waits until the work in the background is done.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    immediates = watchImmediates();
  });
  afterEach(() => {
    immediates.restore();
    vi.useRealTimers();
  });

  it('makes a failed edit of the copy in the remote channel again after ten minutes', async () => {
    const made = await mirrored(yveltal, { renderDelayMs: 0, sharedDelayMs: 0 });
    const { gateway, service, entries } = made;
    const copy = () => gateway.messagesIn(REMOTE_CHANNEL)[0];
    const warnings = () => entries.filter((entry) => entry.level === 40);
    const edit = gateway.editMessage.bind(gateway);
    let failing = true;
    gateway.editMessage = (channelId, messageId, message) =>
      channelId === REMOTE_CHANNEL && failing
        ? Promise.reject(new Error('Discord is down'))
        : edit(channelId, messageId, message);
    const timers = vi.getTimerCount();
    // Somebody signs up, without a line in the post: the copy is to show them.
    await made.store.update(made.party.id, (party) => ({
      party: withAttendees(party, { [ALICE]: {} }),
    }));
    service.changed(made.party.id);
    await immediates.settle();
    expect(warnings()).toHaveLength(1);
    // The run is over: it has asked for another.
    expect(vi.getTimerCount()).toBe(timers + 1);
    expect(warnings()[0]?.msg).toBe('could not update a copy of a party message');
    expect(copy()?.edits).toBe(0);
    expect(textOf(copy()?.message)).not.toContain(ALICE);
    expect(made.current().mirrorMessages).toHaveLength(1);

    // Ten minutes later the edit is made, although the raid did not change again.
    failing = false;
    made.clock.now += RETRY_AFTER_MS;
    vi.advanceTimersByTime(RETRY_AFTER_MS);
    await immediates.settle();
    expect(copy()?.edits).toBe(1);
    // All is well: nothing more is waiting.
    expect(vi.getTimerCount()).toBe(timers);
    expect(copiedPost(copy()?.message)).toEqual(elsewhere(gateway.posts.get(made.postId)?.message));
    expect(textOf(copy()?.message)).toContain(ALICE);
    await service.flush();
    // All is well: nothing more is waiting.
    expect(vi.getTimerCount()).toBe(timers);
  });
});

describe('the copies of a raid when it ends', () => {
  it('deletes them before the post is archived, and the archiving stays the last thing', async () => {
    const made = await mirrored(yveltal, { gyms: gymsWithExLibrary() });
    const { gateway, service, postId } = made;
    expect(await service.showStatus(made.party.id)).toBe(true);
    expect(gateway.messagesIn(postId)).toHaveLength(1);

    expect(await service.end(made.party.id)).toBe(true);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(postId)).toEqual([]);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
  });

  it('deletes a copy that a render recorded while the party was ending', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service } = made;
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    // The render that makes the copy is under way when the party ends.
    service.changed(made.party.id);
    const ended = service.end(made.party.id);
    await service.flush();
    expect(await ended).toBe(true);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('deletes them when the post is gone and the party ends for that', async () => {
    const made = await mirrored(yveltal);
    const { gateway, attendance, service, store } = made;
    gateway.gone.add(made.postId);
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    expect(store.get(made.party.id)).toBeUndefined();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
  });

  it('deletes the link line too when the post is gone and the party ends for that', async () => {
    const made = await mirrored(yveltal);
    const { gateway, attendance, service, store } = made;
    expect(gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
    gateway.gone.add(made.postId);
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    expect(store.get(made.party.id)).toBeUndefined();
    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('warns and goes on when the link line of a gone post cannot be deleted', async () => {
    const made = await mirrored(yveltal);
    const { gateway, attendance, service, store, entries } = made;
    gateway.gone.add(made.postId);
    gateway.failing.set('deleteMessage', new Error('Discord is away'));
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    expect(store.get(made.party.id)).toBeUndefined();
    expect(
      entries.some(
        (entry) =>
          entry.level === 40 && entry.msg === 'could not delete the link to an ended party',
      ),
    ).toBe(true);
  });

  it('ends the party although a copy cannot be deleted, with a warning', async () => {
    const made = await mirrored(yveltal);
    const { gateway, service, entries } = made;
    gateway.failing.set('deleteMessage', new Error('Discord is away'));
    expect(await service.end(made.party.id)).toBe(true);
    expect(gateway.posts.get(made.postId)?.archived).toBe(true);
    expect(
      entries.some(
        (entry) =>
          entry.level === 40 &&
          entry.msg === 'could not delete a copy of the message of an ended party',
      ),
    ).toBe(true);
  });
});

describe('PartyService.showStatus', () => {
  it('puts a copy of the message at the bottom of the post, with the controls', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, postId } = made;
    expect(await service.showStatus(made.party.id)).toBe(true);
    const [copy] = gateway.messagesIn(postId);
    // The post's own message, without a line above it.
    expect(copy?.message).toEqual(gateway.posts.get(postId)?.message);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: postId, messageId: copy?.id, kind: 'status' },
    ]);
  });

  it('deletes the copy of an earlier call, so the post has one', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, postId } = made;
    await service.showStatus(made.party.id);
    const [first] = gateway.messagesIn(postId);
    await service.showStatus(made.party.id);
    const copies = gateway.messagesIn(postId);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.id).not.toBe(first?.id);
    expect(made.current().mirrorMessages).toHaveLength(1);
  });

  it('keeps the copy up to date', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, attendance, postId } = made;
    await service.showStatus(made.party.id);
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    const [copy] = gateway.messagesIn(postId);
    expect(textOf(copy?.message)).toContain('Alice');
    expect(copy?.edits).toBe(1);
  });

  it('forgets a copy somebody deleted, without making another', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, attendance, postId } = made;
    await service.showStatus(made.party.id);
    const deleted = gateway.messagesIn(postId)[0]?.id ?? '';
    gateway.gone.add(deleted);
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    expect(made.current().mirrorMessages).toEqual([]);
    // Besides the deleted copy, only the line about Alice is in the post.
    const others = gateway.messagesIn(postId).filter((message) => message.id !== deleted);
    expect(others.filter((message) => message.message.v2 === true)).toEqual([]);
  });

  it('answers false for a party that has ended, and sends nothing', async () => {
    const made = await reportedRaid(yveltal);
    await made.service.end(made.party.id);
    const before = made.gateway.calls.length;
    expect(await made.service.showStatus(made.party.id)).toBe(false);
    expect(made.gateway.calls).toHaveLength(before);
  });
});

describe('the link line in the region channel', () => {
  it('names the post only, so a new title needs no edit of it', async () => {
    const made = await reportedRaid();
    const { gateway, store, service, postId } = made;
    const [link] = gateway.messagesIn(WEST_CHANNEL);
    expect(link?.message.content).toBe(`New raid: <#${postId}>`);
    await store.update(made.party.id, (party) =>
      setBoss(
        asRaid(party),
        { tier: asRaid(party).raid.tier, boss: { key: 'yveltal' } },
        service.rules(),
        made.clock.now,
      ),
    );
    service.changed(made.party.id);
    await service.flush();
    expect(link?.edits).toBe(0);
  });

  it('is left alone when somebody deleted it', async () => {
    const made = await reportedRaid();
    const { gateway, store, service, entries } = made;
    gateway.gone.add(gateway.messagesIn(WEST_CHANNEL)[0]?.id ?? '');
    await store.update(made.party.id, (party) =>
      setBoss(
        asRaid(party),
        { tier: asRaid(party).raid.tier, boss: { key: 'yveltal' } },
        service.rules(),
        made.clock.now,
      ),
    );
    service.changed(made.party.id);
    await service.flush();
    expect(entries.some((entry) => entry.level === 40 || entry.level === 50)).toBe(false);
    expect(store.get(made.party.id)).toBeDefined();
  });
});
