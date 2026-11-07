import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { EAST_CHANNEL, UNBOUNDED_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { ALICE, BOB, MINUTE, withAttendees, stops, gym } from '../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  reportedRaid,
  restarted,
  TestRegions,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { Tally } from '../../test/support/tally.js';
import {
  watchBackground,
  watchImmediates,
  type ImmediateWatch,
} from '../../test/support/timers.js';
import { PartyStatus } from '../domain/party/status.js';
import { MANAGE_TRAIN_LABEL, MOVE_TRAIN_LABEL } from '../render/party-controls.js';
import type { Member } from './attendance-service.js';
import { RETRY_AFTER_MS } from './party-mirrors.js';
import type { PartyServiceOptions } from './party-service.js';
import {
  buttonsOf,
  copiedPost,
  customIdsOf,
  leadOf,
  textDisplays,
  textOf,
} from '../../test/support/messages.js';

const alice: Member = { id: ALICE, name: 'Alice' };
/** Every change is shown at once, as when changes come far apart. */
const NO_DELAY = { renderDelayMs: 0, sharedDelayMs: 0 };

type Made = Awaited<ReturnType<typeof createdTrain>>;

/** The copies of party messages in a channel: what was sent there as a post is (v2). */
const copiesIn = (made: Pick<Made, 'gateway'>, channelId: string) =>
  made.gateway.messagesIn(channelId).filter((sent) => sent.message.v2 === true);

/** The invented gyms, with the Library (gym 1) lying in these region channels. */
function gymsWithLibraryIn(...channels: string[]): PartyServiceOptions['gyms'] {
  const gyms = gymsFixture();
  return {
    get: (id) => gyms.get(id),
    regionsOf: (id) => (id === 1 ? channels : gyms.regionsOf(id)),
  };
}

function missingPermissions(): DiscordAPIError {
  const code = RESTJSONErrorCodes.MissingPermissions;
  return new DiscordAPIError(
    { code, message: 'Missing Permissions' },
    code,
    403,
    'POST',
    '/channels/x/messages',
    {},
  );
}

describe('the copies of a train in the regions it stops in', () => {
  it('puts a copy into the channel of another region the route has a stop in, with a line that invites', async () => {
    // The bridge and the Library are in West, where the train was made; the mural is in East.
    const made = await createdTrain({ route: stops(4, 1, 7) });
    const { gateway, postId } = made;
    const [copy] = copiesIn(made, EAST_CHANNEL);
    const post = gateway.posts.get(postId);
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(leadOf(copy?.message)).toBe(
      `A raid train that stops in this region. Sign up here to follow it in its post: <#${postId}>`,
    );
    expect(copiedPost(copy?.message)).toEqual(textDisplays(post?.message));
    expect(copy?.message.mention).toBeUndefined();
    expect(made.current().mirrorMessages).toEqual([
      { channelId: EAST_CHANNEL, messageId: copy?.id, kind: 'region' },
    ]);
    // The channel of its own region has the line that links to the post, and no copy.
    expect(copiesIn(made, WEST_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
  });

  it('carries the controls of the post without the button that moves the train', async () => {
    const made = await createdTrain({ route: stops(4, 7) });
    const [copy] = copiesIn(made, EAST_CHANNEL);
    const post = buttonsOf(made.gateway.posts.get(made.postId)?.message);
    // Move… and Manage… last (plan 8X-G): the copy has neither.
    expect(post.slice(-2).map((button) => button.label)).toEqual([
      MOVE_TRAIN_LABEL,
      MANAGE_TRAIN_LABEL,
    ]);
    expect(buttonsOf(copy?.message)).toEqual(post.slice(0, -2));
    expect(customIdsOf(copy?.message)).toContain(`party:${made.party.id}:join`);
    expect(customIdsOf(copy?.message)).not.toContain(`party:${made.party.id}:move`);
    expect(customIdsOf(copy?.message)).not.toContain(`party:${made.party.id}:manage`);
    // The copy at the bottom of the post itself keeps it.
    await made.service.showStatus(made.party.id);
    await made.service.flush();
    const status = made.gateway.messagesIn(made.postId).at(-1);
    expect(buttonsOf(status?.message)).toEqual(post);
  });

  it('makes none for a train that stays in its own region, or has no route', async () => {
    const home = await createdTrain({ route: stops(4, 1, 2) });
    expect(home.current().mirrorMessages).toEqual([]);
    expect(copiesIn(home, EAST_CHANNEL)).toEqual([]);
    expect(copiesIn(home, WEST_CHANNEL)).toEqual([]);
    const empty = await createdTrain();
    expect(empty.current().mirrorMessages).toEqual([]);
  });

  it('makes none for a raid or a meetup', async () => {
    const raid = await reportedRaid({ boss: { key: 'yveltal' } });
    const meetup = await createdMeetup();
    for (const made of [raid, meetup]) {
      expect(made.current().mirrorMessages).toEqual([]);
      expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
      expect(copiesIn(made, WEST_CHANNEL)).toEqual([]);
    }
  });

  it('shows a change in the copy too, and edits nothing when nothing changed', async () => {
    const made = await createdTrain({ route: stops(4, 7) });
    const { gateway, attendance, service, postId } = made;
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    const [copy] = copiesIn(made, EAST_CHANNEL);
    expect(copy?.edits).toBe(1);
    expect(textOf(copy?.message)).toContain('Alice');
    expect(copiedPost(copy?.message)).toEqual(textDisplays(gateway.posts.get(postId)?.message));
    const before = gateway.calls.length;
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.calls.slice(before).filter((call) => call.startsWith('edit'))).toEqual([]);
  });

  it('keeps the copy for a stop the train has left, and on a finished route', async () => {
    const made = await createdTrain({ route: stops(7, 4, 1) });
    const [copy] = copiesIn(made, EAST_CHANNEL);
    await made.trains.move(made.party.id, { id: made.party.createdById }, 'next', false);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL).map((sent) => sent.id)).toEqual([copy?.id]);
    await made.trains.move(made.party.id, { id: made.party.createdById }, 'finish', false);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL).map((sent) => sent.id)).toEqual([copy?.id]);
    expect(made.current().mirrorMessages).toHaveLength(1);
  });

  it('follows the route: a stop in another region brings a copy, its last stop there takes it away', async () => {
    const made = await createdTrain({ route: stops(4) });
    const maker: Member = { id: made.party.createdById };
    expect(made.current().mirrorMessages).toEqual([]);
    await made.trains.addStop(made.party.id, maker, gym(7));
    await made.trains.addStop(made.party.id, maker, gym(8));
    await made.service.flush();
    // Two stops in East are one copy there.
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    const [copy] = copiesIn(made, EAST_CHANNEL);
    await made.trains.removeStop(made.party.id, maker, 2);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL).map((sent) => sent.id)).toEqual([copy?.id]);
    await made.trains.removeStop(made.party.id, maker, 2);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(made.gateway.deleted).toContainEqual({ channelId: EAST_CHANNEL, messageId: copy?.id });
    expect(made.current().mirrorMessages).toEqual([]);
    // And with the whole route.
    await made.trains.addStop(made.party.id, maker, gym(9));
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    await made.trains.clearRoute(made.party.id, maker, true);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('has one copy in each region of a gym that lies in several, and keeps them all', async () => {
    const gyms = gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);
    const made = await createdTrain({ route: stops(1) }, { gyms });
    const recorded = () =>
      made
        .current()
        .mirrorMessages.map(({ kind, channelId }) => `${kind} ${channelId}`)
        .sort();
    const both = [`region ${EAST_CHANNEL}`, `region ${UNBOUNDED_CHANNEL}`];
    expect(recorded()).toEqual(both);
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    expect(copiesIn(made, WEST_CHANNEL)).toEqual([]);
    // Neither counts as an earlier copy of the other: both stay, and both are kept up to date.
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    expect(recorded()).toEqual(both);
    expect(made.gateway.deleted.filter((gone) => gone.channelId !== made.postId)).toEqual([]);
    for (const channelId of [EAST_CHANNEL, UNBOUNDED_CHANNEL]) {
      const [copy] = copiesIn(made, channelId);
      expect(copy?.edits).toBe(1);
      expect(textOf(copy?.message)).toContain('Alice');
    }
  });

  it('leaves out a region of another server', async () => {
    const regions = new TestRegions();
    regions.rows = regions.rows.map((region) =>
      region.channelId === EAST_CHANNEL ? { ...region, guildId: 2 } : region,
    );
    const made = await createdTrain({ route: stops(4, 7) }, {}, { regions });
    expect(made.current().mirrorMessages).toEqual([]);
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
  });

  it('leaves no channel out once the region of the train is gone', async () => {
    const made = await createdTrain({ route: stops(4, 7) });
    await made.store.update(made.party.id, (party) => ({ party: { ...party, regionId: null } }));
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(copiesIn(made, WEST_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages.map((mirror) => mirror.kind)).toEqual([
      'region',
      'region',
    ]);
  });

  it('has a copy of each of two trains through one region', async () => {
    const first = await createdTrain({ route: stops(4, 7) });
    const second = await createdTrain({ name: 'Sunday megas', route: stops(8) }, {}, first);
    expect(copiesIn(first, EAST_CHANNEL)).toHaveLength(2);
    const [one] = first.current().mirrorMessages;
    const [two] = second.current().mirrorMessages;
    expect(one).toMatchObject({ kind: 'region', channelId: EAST_CHANNEL });
    expect(two).toMatchObject({ kind: 'region', channelId: EAST_CHANNEL });
    expect(one?.messageId).not.toBe(two?.messageId);
    // A change of one train leaves the copy of the other alone.
    await second.attendance.signUp(second.party.id, alice, PartyStatus.Coming);
    await second.service.flush();
    expect(copiesIn(first, EAST_CHANNEL)).toHaveLength(2);
    expect(first.gateway.deleted.filter((gone) => gone.channelId === EAST_CHANNEL)).toEqual([]);
  });
});

describe('the copies of a train: restarts, failures and the end', () => {
  it('keeps the copy over a restart: no second one, one edit, and then only for a change', async () => {
    const made = await createdTrain({ route: stops(4, 7) });
    const [copy] = copiesIn(made, EAST_CHANNEL);
    const again = await restarted(made);
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(copiesIn(made, EAST_CHANNEL).map((sent) => sent.id)).toEqual([copy?.id]);
    expect(copiesIn(made, EAST_CHANNEL)[0]?.edits).toBe(1);
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)[0]?.edits).toBe(1);
  });

  it('makes a copy anew that somebody deleted', async () => {
    const made = await createdTrain({ route: stops(4, 7) });
    const [first] = copiesIn(made, EAST_CHANNEL);
    made.gateway.gone.add(first?.id ?? '');
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    const copies = copiesIn(made, EAST_CHANNEL).filter((copy) => copy.id !== first?.id);
    expect(copies).toHaveLength(1);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: EAST_CHANNEL, messageId: copies[0]?.id, kind: 'region' },
    ]);
  });

  it('leaves a region channel alone for ten minutes that refused it, and the others go on', async () => {
    const gyms = gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);
    const made = await createdTrain({}, { gyms });
    const { gateway, service, attendance, clock, entries } = made;
    const send = gateway.sendMessage.bind(gateway);
    let refuse = true;
    gateway.sendMessage = (channelId, message) =>
      channelId === EAST_CHANNEL && refuse
        ? Promise.reject(missingPermissions())
        : send(channelId, message);
    await made.trains.addStop(made.party.id, { id: made.party.createdById }, gym(1));
    await service.flush();
    for (let change = 0; change < 3; change++) {
      await attendance.changeNumber(made.party.id, { id: made.party.createdById }, 1);
      await service.flush();
    }
    const warnings = entries.filter((entry) => entry.level === 40);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.msg).toMatch(/I lack a permission in that channel/);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toMatchObject([
      { kind: 'region', channelId: UNBOUNDED_CHANNEL },
    ]);
    // Ten minutes later it is tried again, and by then the permission is there.
    refuse = false;
    clock.now += 10 * MINUTE;
    await attendance.changeNumber(made.party.id, { id: made.party.createdById }, 1);
    await service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toHaveLength(2);
  });

  it('deletes every copy when the train ends, before the post is archived', async () => {
    const gyms = gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);
    const made = await createdTrain({ route: stops(1) }, { gyms });
    const copies = made.current().mirrorMessages;
    expect(copies).toHaveLength(2);
    const before = made.gateway.calls.length;
    await made.service.end(made.party.id);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toEqual([]);
    for (const { channelId, messageId } of copies) {
      expect(made.gateway.deleted).toContainEqual({ channelId, messageId });
    }
    const calls = made.gateway.calls.slice(before);
    expect(calls.at(-1)).toMatch(/^archivePost /);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });
});

describe('the copies of a train: a region channel where the bot may not post embeds', () => {
  const everywhere = () => gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);

  it('gets no copy, and nothing is sent there', async () => {
    const gateway = new FakePartyGateway();
    gateway.noEmbeds.add(UNBOUNDED_CHANNEL);
    const made = await createdTrain({ route: stops(1) }, { gyms: everywhere() }, { gateway });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    expect(gateway.calls.filter((call) => call === `sendMessage ${UNBOUNDED_CHANNEL}`)).toEqual([]);
    expect(gateway.messagesIn(UNBOUNDED_CHANNEL)).toEqual([]);
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toMatchObject([
      { kind: 'region', channelId: EAST_CHANNEL },
    ]);
    // Nothing is wrong with that: no warning, and nothing to try again.
    expect(made.entries.filter((entry) => entry.level === 40 || entry.level === 50)).toEqual([]);
  });

  it('loses the copy it has, like a region the route has left, and the others stay', async () => {
    const made = await createdTrain({ route: stops(1) }, { gyms: everywhere() });
    const { gateway } = made;
    const [east] = copiesIn(made, EAST_CHANNEL);
    const [unbounded] = copiesIn(made, UNBOUNDED_CHANNEL);
    gateway.noEmbeds.add(EAST_CHANNEL);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(gateway.deleted).toContainEqual({ channelId: EAST_CHANNEL, messageId: east?.id });
    expect(copiesIn(made, UNBOUNDED_CHANNEL).map((copy) => copy.id)).toEqual([unbounded?.id]);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)[0]?.edits).toBe(1);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: UNBOUNDED_CHANNEL, messageId: unbounded?.id, kind: 'region' },
    ]);
    // Once the bot may post there again, the next change brings the copy back.
    gateway.noEmbeds.delete(EAST_CHANNEL);
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
  });
});

describe('the copies of a train: what fails in one region leaves the others alone', () => {
  const everywhere = () => gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);
  const warnings = (made: Made) => made.entries.filter((entry) => entry.level === 40);

  it('takes a region channel that is gone for gone: one send, one line in the log, for every train', async () => {
    const gateway = new FakePartyGateway();
    gateway.gone.add(UNBOUNDED_CHANNEL);
    const made = await createdTrain({ route: stops(1) }, { gyms: everywhere() }, { gateway });
    const maker: Member = { id: made.party.createdById };
    for (let change = 0; change < 3; change++) {
      await made.attendance.changeNumber(made.party.id, maker, 1);
      await made.service.flush();
    }
    const sends = () => gateway.calls.filter((call) => call === `sendMessage ${UNBOUNDED_CHANNEL}`);
    expect(sends()).toHaveLength(1);
    expect(warnings(made)).toHaveLength(1);
    expect(warnings(made)[0]?.msg).toMatch(/its channel is gone/);
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toMatchObject([
      { kind: 'region', channelId: EAST_CHANNEL },
    ]);
    // Neither ten minutes later nor for another train through it: a channel Discord does not
    // know does not come back (the region stays until staff remove it, `/region list`).
    made.clock.now += 20 * MINUTE;
    await made.attendance.changeNumber(made.party.id, maker, 1);
    await made.service.flush();
    const other = await made.service.createTrain({
      name: 'Sunday megas',
      creatorId: BOB,
      regionChannelId: WEST_CHANNEL,
    });
    if (other.kind !== 'created') throw new Error(other.kind);
    await made.trains.addStop(other.party.id, { id: BOB }, gym(1));
    await made.service.flush();
    expect(made.store.get(other.party.id)?.mirrorMessages).toMatchObject([
      { kind: 'region', channelId: EAST_CHANNEL },
    ]);
    expect(sends()).toHaveLength(1);
    expect(warnings(made)).toHaveLength(1);
  });

  it('keeps on record a copy it could not delete, deletes the other, and uses it again when the route returns', async () => {
    const made = await createdTrain({ route: stops(4, 1) }, { gyms: everywhere() });
    const { gateway } = made;
    const maker: Member = { id: made.party.createdById };
    const [east] = copiesIn(made, EAST_CHANNEL);
    const [unbounded] = copiesIn(made, UNBOUNDED_CHANNEL);
    const remove = gateway.deleteMessage.bind(gateway);
    gateway.deleteMessage = (channelId, messageId) =>
      channelId === EAST_CHANNEL
        ? Promise.reject(new Error('Discord is down'))
        : remove(channelId, messageId);
    await made.trains.removeStop(made.party.id, maker, 2);
    await made.service.flush();
    // The copy in the other region went; the one that could not be deleted is still known.
    expect(gateway.deleted).toContainEqual({
      channelId: UNBOUNDED_CHANNEL,
      messageId: unbounded?.id,
    });
    expect(made.current().mirrorMessages).toEqual([
      { channelId: EAST_CHANNEL, messageId: east?.id, kind: 'region' },
    ]);
    expect(warnings(made).map((entry) => entry.msg)).toEqual([
      'could not delete a copy of a party message',
    ]);
    // The route comes back to both regions: the copy that stayed is the copy again.
    const before = gateway.calls.length;
    await made.trains.addStop(made.party.id, maker, gym(1));
    await made.service.flush();
    expect(gateway.calls.slice(before)).not.toContain(`sendMessage ${EAST_CHANNEL}`);
    expect(copiesIn(made, EAST_CHANNEL).map((copy) => copy.id)).toEqual([east?.id]);
    expect(copiedPost(east?.message)).toEqual(
      textDisplays(gateway.posts.get(made.postId)?.message),
    );
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    expect(
      made
        .current()
        .mirrorMessages.map((mirror) => mirror.channelId)
        .sort(),
    ).toEqual([EAST_CHANNEL, UNBOUNDED_CHANNEL]);
  });

  it('leaves no copy and does not open the post again when the train ends while a copy is on its way', async () => {
    const made = await createdTrain({ route: stops(4) }, NO_DELAY);
    const { gateway, service, postId } = made;
    const background = watchBackground();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = gateway.sendMessage.bind(gateway);
    const onItsWay = new Tally('the sends to East');
    gateway.sendMessage = async (channelId, message) => {
      if (channelId === EAST_CHANNEL) {
        onItsWay.add();
        await gate;
      }
      return send(channelId, message);
    };
    await made.trains.addStop(made.party.id, { id: made.party.createdById }, gym(7));
    await onItsWay.reached(1);
    const ended = service.end(made.party.id);
    // Everything but the held send is done, and nothing is archived yet.
    await background.settle();
    expect(gateway.posts.get(postId)?.archived).toBe(false);
    release();
    expect(await ended).toBe(true);
    await service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, reopened: 0 });
    expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
  });
});

describe('the copies of a train: a failure is made good without a change of the train', () => {
  const everywhere = () => gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);
  const warnings = (made: Made) => made.entries.filter((entry) => entry.level === 40);

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

  /** A train with a copy in two regions; edits of the one in East fail while `failing.on`. */
  async function withFailingEdits() {
    const made = await createdTrain({ route: stops(1) }, { gyms: everywhere(), ...NO_DELAY });
    const failing = { on: true };
    const edit = made.gateway.editMessage.bind(made.gateway);
    made.gateway.editMessage = (channelId, messageId, message) =>
      channelId === EAST_CHANNEL && failing.on
        ? Promise.reject(new Error('Discord is down'))
        : edit(channelId, messageId, message);
    /** Somebody signs up, without a line in the post: the copies are to show them. */
    const change = async (memberId: string): Promise<void> => {
      await made.store.update(made.party.id, (party) => ({
        party: withAttendees(party, { [memberId]: {} }),
      }));
      made.service.changed(made.party.id);
    };
    const east = () => copiesIn(made, EAST_CHANNEL)[0];
    const unbounded = () => copiesIn(made, UNBOUNDED_CHANNEL)[0];
    return { ...made, failing, change, east, unbounded };
  }

  it('makes a failed edit in one region again after ten minutes, and edits the other at once', async () => {
    const made = await withFailingEdits();
    const timers = vi.getTimerCount();
    await made.change(ALICE);
    await immediates.settle();
    expect(warnings(made)).toHaveLength(1);
    expect(made.unbounded()?.edits).toBe(1);
    // The run is over: it has asked for another.
    expect(vi.getTimerCount()).toBe(timers + 1);
    expect(warnings(made)[0]?.msg).toBe('could not update a copy of a party message');
    expect(made.east()?.edits).toBe(0);
    // The copy whose edit failed is still the copy.
    expect(made.current().mirrorMessages).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(timers + 1);

    // A second failure asks for nothing more: one run is waiting already.
    await made.change(BOB);
    await immediates.settle();
    expect(warnings(made)).toHaveLength(2);
    expect(made.unbounded()?.edits).toBe(2);
    expect(vi.getTimerCount()).toBe(timers + 1);

    // Ten minutes later the edit is made, although the train did not change again.
    made.failing.on = false;
    made.clock.now += RETRY_AFTER_MS;
    vi.advanceTimersByTime(RETRY_AFTER_MS);
    await immediates.settle();
    expect(made.east()?.edits).toBe(1);
    // All is well: nothing more is waiting.
    expect(vi.getTimerCount()).toBe(timers);
    expect(made.east()?.message).toEqual(made.unbounded()?.message);
    expect(textOf(made.east()?.message)).toContain(BOB);
    expect(made.unbounded()?.edits).toBe(2);
    await made.service.flush();
    // All is well: nothing more is waiting.
    expect(vi.getTimerCount()).toBe(timers);
  });

  it('tries a channel again that refused it, a moment after the ten minutes are over and not before', async () => {
    // The channel of East refuses the bot from the start: the train has its copy elsewhere.
    const gateway = new FakePartyGateway();
    const send = gateway.sendMessage.bind(gateway);
    let refuse = true;
    let asked = 0;
    gateway.sendMessage = (channelId, message) => {
      if (channelId === EAST_CHANNEL) asked++;
      return channelId === EAST_CHANNEL && refuse
        ? Promise.reject(missingPermissions())
        : send(channelId, message);
    };
    const made = await createdTrain(
      { route: stops(1) },
      { gyms: everywhere(), ...NO_DELAY },
      { gateway },
    );
    expect(warnings(made)).toHaveLength(1);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toHaveLength(1);
    // A run that leaves the refusing channel alone asks for another.
    const timers = vi.getTimerCount();
    await made.store.update(made.party.id, (party) => ({
      party: withAttendees(party, { [ALICE]: {} }),
    }));
    made.service.changed(made.party.id);
    await immediates.settle();
    expect(copiesIn(made, UNBOUNDED_CHANNEL)[0]?.edits).toBe(1);
    expect(vi.getTimerCount()).toBe(timers + 1);
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(asked).toBe(1);

    // One millisecond before the refusal ends nothing is tried: a run then would find the
    // channel still left alone, and wait all over again.
    refuse = false;
    made.clock.now += 10 * MINUTE - 1;
    vi.advanceTimersByTime(10 * MINUTE);
    await immediates.settle();
    expect(vi.getTimerCount()).toBe(timers + 1);
    expect(asked).toBe(1);

    // A moment later the refusal is over, and the copy is sent without the train changing.
    made.clock.now += RETRY_AFTER_MS - 10 * MINUTE + 1;
    vi.advanceTimersByTime(RETRY_AFTER_MS - 10 * MINUTE);
    await immediates.settle();
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toHaveLength(2);
    // All is well: the run asked for no other.
    expect(vi.getTimerCount()).toBe(timers);
    expect(asked).toBe(2);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    await made.service.flush();
  });

  it('tries nothing again for a train that has ended meanwhile', async () => {
    const made = await withFailingEdits();
    const timers = vi.getTimerCount();
    await made.change(ALICE);
    await immediates.settle();
    expect(warnings(made)).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(timers + 1);
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(vi.getTimerCount()).toBe(timers);
    const before = made.gateway.calls.length;
    made.clock.now += RETRY_AFTER_MS;
    vi.advanceTimersByTime(RETRY_AFTER_MS);
    await immediates.settle();
    expect(made.gateway.calls.slice(before)).toEqual([]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('asks for nothing after shutdown', async () => {
    const made = await withFailingEdits();
    const timers = vi.getTimerCount();
    await made.change(ALICE);
    await immediates.settle();
    expect(warnings(made)).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(timers + 1);
    await made.service.flush();
    expect(vi.getTimerCount()).toBe(timers);
  });
});
