import { describe, expect, it, vi } from 'vitest';
import {
  LIBRARY,
  MOD,
  MODERATOR,
  newRequest,
  OTHER_SERVER,
  requestId,
  SAFETY_PIN,
} from '../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL, meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
import { buttonLabels, linksOf, textOf } from '../../test/support/messages.js';
import { ALICE, BOB, MINUTE, PARTY_NOW } from '../../test/support/parties.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import type { KnownPlace } from '../domain/geo/place.js';
import { MAX_MEETUP_DESCRIPTION } from '../domain/party/party.js';
import type { RequestAsk } from './meetup-safety.js';
import { testServerValues } from '../../test/support/server-values.js';

const HOUR = 60 * MINUTE;
const SERVER = '412345678901234567';

const PARK: KnownPlace = {
  ...LIBRARY,
  id: 'f0e1d2c3b4a5968778695a4b3c2d1e0f.16',
  title: 'Riverside Park',
};

/** What `/meetup` asks the moderators for: Alice's book swap at the library, a day ahead. */
function asked(more: Partial<RequestAsk> = {}): RequestAsk {
  return {
    serverId: SERVER,
    regionChannelId: WEST_CHANNEL,
    maker: { id: ALICE, name: 'Alice', team: 'mystic' as const },
    place: LIBRARY,
    name: '  Book   swap ',
    startTime: PARTY_NOW + 24 * HOUR,
    description: 'Bring a book.  \n\n\n\nTake a book.',
    ...more,
  };
}

describe('MeetupSafety.verdict', () => {
  it('is off without a moderators’ channel: every place allowed, the storage never asked', async () => {
    const made = await meetupSafetyWith({ moderation: null });
    made.storage.failing.add('ruling');
    made.storage.failing.add('block');
    expect(made.safety.on(SERVER)).toBe(false);
    for (const place of [SAFETY_PIN, LIBRARY]) {
      expect(
        await made.safety.verdict({ serverId: SERVER, place, makerId: ALICE, staff: false }),
      ).toBe('allowed');
    }
  });

  it('holds a pin and a flagged Wayspot, and follows the rulings and blocks of the server', async () => {
    const made = await meetupSafetyWith();
    expect(made.safety.on(SERVER)).toBe(true);
    const verdict = (place: typeof LIBRARY | typeof SAFETY_PIN, staff = false) =>
      made.safety.verdict({ serverId: SERVER, place, makerId: ALICE, staff });
    expect(await verdict(PARK)).toBe('allowed');
    expect(await verdict(LIBRARY)).toBe('review');
    expect(await verdict(SAFETY_PIN)).toBe('review');
    await made.storage.rule(SERVER, { kind: 'stop', id: LIBRARY.id }, 'allow', MOD);
    expect(await verdict(LIBRARY)).toBe('allowed');
    await made.storage.rule(SERVER, { kind: 'stop', id: PARK.id }, 'refuse', MOD);
    expect(await verdict(PARK)).toBe('refused');
    expect(await verdict(PARK, true)).toBe('allowed');
    await made.storage.addBlock(SERVER, ALICE, MOD);
    expect(await verdict(LIBRARY)).toBe('blocked');
    expect(await verdict(SAFETY_PIN, true)).toBe('allowed');
  });

  it("adds the words of the server's settings to the flagged ones, its own alone", async () => {
    const made = await meetupSafetyWith({ flaggedWords: ['park'] });
    expect(
      await made.safety.verdict({ serverId: SERVER, place: PARK, makerId: ALICE, staff: false }),
    ).toBe('review');
    made.servers.changed.set(OTHER_SERVER, {
      ...made.servers.values,
      flaggedWords: ['garden'],
    });
    expect(
      await made.safety.verdict({
        serverId: OTHER_SERVER,
        place: PARK,
        makerId: ALICE,
        staff: false,
      }),
    ).toBe('allowed');
  });

  it('checks a gym by its official name as well as by the nickname its post shows', async () => {
    const made = await meetupSafetyWith({ flaggedWords: ['public library'] });
    // Gym 1 is the Pinewood Public Library, "The Stacks" to its members.
    const stacks: KnownPlace = { ...LIBRARY, kind: 'gym', id: '1', title: 'The Stacks' };
    expect(
      await made.safety.verdict({ serverId: SERVER, place: stacks, makerId: ALICE, staff: false }),
    ).toBe('review');
    const fountain: KnownPlace = { ...stacks, id: '2', title: 'Old Stone Fountain' };
    expect(
      await made.safety.verdict({
        serverId: SERVER,
        place: fountain,
        makerId: ALICE,
        staff: false,
      }),
    ).toBe('allowed');
  });
});

describe('MeetupSafety.submit', () => {
  it('posts the request in the moderators’ channel and keeps it, pending', async () => {
    const made = await meetupSafetyWith();
    const outcome = await made.safety.submit(asked());
    expect(outcome.kind).toBe('sent');
    const [stored] = made.storage.requests.values();
    expect(stored).toMatchObject({
      serverId: SERVER,
      regionChannelId: WEST_CHANNEL,
      makerId: ALICE,
      makerName: 'Alice',
      makerTeam: 'mystic',
      place: LIBRARY,
      name: 'Book swap',
      description: 'Bring a book.\n\nTake a book.',
      createdAt: PARTY_NOW,
      expiresAt: PARTY_NOW + 23 * HOUR,
      status: 'pending',
      channelId: MOD_CHANNEL,
    });
    const [post] = made.gateway.messagesIn(MOD_CHANNEL);
    expect(stored?.messageId).toBe(post?.id);
    expect(textOf(post?.message)).toContain('### Meetup waiting for approval');
    expect(buttonLabels(post?.message)).toContain('Approve');
    expect(stored?.source).toBeNull();
    expect(textOf(post?.message)).not.toContain('on the map');
  });

  it('keeps where a meetup was asked for, and its post says it was the live map', async () => {
    const made = await meetupSafetyWith();
    expect((await made.safety.submit({ ...asked(), source: 'map' })).kind).toBe('sent');
    const [stored] = made.storage.requests.values();
    expect(stored?.source).toBe('map');
    const [post] = made.gateway.messagesIn(MOD_CHANNEL);
    expect(textOf(post?.message)).toContain(` on the map in <#${WEST_CHANNEL}>`);
  });

  it('keeps nothing when the moderators’ channel is not there, and says so in the log', async () => {
    const made = await meetupSafetyWith({ channel: false });
    expect((await made.safety.submit(asked())).kind).toBe('not-sent');
    expect(made.storage.requests.size).toBe(0);
    expect(made.entries.map((entry) => entry.msg)).toContain(
      "the moderators' channel is not there: a meetup was not sent for approval",
    );
  });

  it('stays on where the file named a moderators’ channel the server lacks, and sends nothing (review F2)', async () => {
    const made = await meetupSafetyWith({ moderation: null });
    made.servers.values = { ...made.servers.values, unmatched: ['channels.moderation'] };
    expect(made.safety.on(SERVER)).toBe(true);
    expect(
      await made.safety.verdict({
        serverId: SERVER,
        place: SAFETY_PIN,
        makerId: ALICE,
        staff: false,
      }),
    ).not.toBe('allowed');
    expect((await made.safety.submit(asked())).kind).toBe('not-sent');
    expect(made.storage.requests.size).toBe(0);
    expect(made.entries.map((entry) => entry.msg)).toContain(
      "the moderators' channel is not there: a meetup was not sent for approval",
    );
  });

  it('keeps nothing when the post is refused', async () => {
    const made = await meetupSafetyWith();
    made.gateway.failing.set('sendMessage', new Error('Missing Access'));
    expect((await made.safety.submit(asked())).kind).toBe('not-sent');
    expect(made.storage.requests.size).toBe(0);
    expect(made.entries.map((entry) => entry.msg)).toContain(
      'could not send a meetup to the moderators for approval',
    );
  });

  it('sends the post first, and takes it back when the request cannot be kept', async () => {
    const made = await meetupSafetyWith();
    made.storage.failing.add('addRequest');
    expect((await made.safety.submit(asked())).kind).toBe('not-sent');
    expect(made.storage.requests.size).toBe(0);
    expect(made.gateway.deleted.map((one) => one.channelId)).toEqual([MOD_CHANNEL]);
    expect(made.entries.map((entry) => entry.msg)).toContain(
      'could not send a meetup to the moderators for approval',
    );
  });

  it('refuses a name or information a meetup cannot have, and sends nothing', async () => {
    const made = await meetupSafetyWith();
    expect((await made.safety.submit(asked({ name: ' \u200b ' }))).kind).toBe('bad-name');
    expect((await made.safety.submit(asked({ description: '  \n ' }))).kind).toBe(
      'bad-description',
    );
    expect(
      (await made.safety.submit(asked({ description: 'x'.repeat(MAX_MEETUP_DESCRIPTION + 1) })))
        .kind,
    ).toBe('bad-description');
    expect(made.storage.requests.size).toBe(0);
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
  });

  it('makes no request that would expire within the hour: a start two hours ahead at least', async () => {
    const made = await meetupSafetyWith();
    expect(
      (await made.safety.submit(asked({ startTime: PARTY_NOW + 2 * HOUR - MINUTE }))).kind,
    ).toBe('too-soon');
    expect(made.storage.requests.size).toBe(0);
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
    expect((await made.safety.submit(asked({ startTime: PARTY_NOW + 2 * HOUR }))).kind).toBe(
      'sent',
    );
  });

  it('withdraws a request whose maker was blocked while it was sent, and tells them they are blocked', async () => {
    const made = await meetupSafetyWith();
    const add = made.storage.addRequest.bind(made.storage);
    vi.spyOn(made.storage, 'addRequest').mockImplementationOnce(async (request) => {
      await add(request);
      // Blocked over another request between the check and this one being kept.
      await made.storage.addBlock(SERVER, ALICE, MOD);
    });
    expect(await made.safety.submit(asked())).toEqual({ kind: 'blocked' });
    const [stored] = made.storage.requests.values();
    expect(stored).toMatchObject({ status: 'withdrawn' });
    const [post] = made.gateway.messagesIn(MOD_CHANNEL);
    expect(textOf(post?.message)).toContain('its maker was blocked from making meetups here');
    expect(buttonLabels(post?.message)).toEqual([]);
    expect(made.dms.to(ALICE)).toEqual([]);
  });
});

describe('MeetupSafety.make', () => {
  /** What 8M-5's map or `/meetup` asks for, Alice not staff unless said. */
  const make = (made: Awaited<ReturnType<typeof meetupSafetyWith>>, more = {}, staff = false) =>
    made.safety.make({ ...asked(more), staff });

  it('posts a meetup at a place that is allowed, and holds one that needs a moderator', async () => {
    const made = await meetupSafetyWith();
    const posted = await make(made, { place: PARK });
    expect(posted).toMatchObject({
      kind: 'posted',
      party: { type: 'meetup', createdById: ALICE, timed: { name: 'Book swap' } },
    });
    expect(made.storage.requests.size).toBe(0);
    const held = await make(made);
    expect(held).toMatchObject({ kind: 'held', request: { status: 'pending', makerId: ALICE } });
    expect(made.storage.requests.size).toBe(1);
    // Staff skip the check.
    expect(await make(made, { place: SAFETY_PIN }, true)).toMatchObject({ kind: 'posted' });
    expect(made.storage.requests.size).toBe(1);
  });

  it('makes no meetup at a Power Spot, for staff neither, and asks nobody', async () => {
    const made = await meetupSafetyWith();
    const spot: KnownPlace = { ...PARK, kind: 'powerspot' };
    expect(await make(made, { place: spot })).toEqual({ kind: 'power-spot' });
    expect(await make(made, { place: spot }, true)).toEqual({ kind: 'power-spot' });
    expect(made.store.active().filter((party) => party.type === 'meetup')).toEqual([]);
    expect(made.storage.requests.size).toBe(0);
  });

  it('refuses a place refused for good, a blocked member, a start too soon and a bad text', async () => {
    const made = await meetupSafetyWith();
    await made.storage.rule(SERVER, { kind: 'stop', id: PARK.id }, 'refuse', MOD);
    expect(await make(made, { place: PARK })).toEqual({ kind: 'refused' });
    expect(await make(made, { startTime: PARTY_NOW + HOUR })).toEqual({ kind: 'too-soon' });
    expect(await make(made, { place: SAFETY_PIN, name: '  ' })).toEqual({ kind: 'bad-name' });
    // The map has no form that refuses it first: information of white space is refused here.
    expect(await make(made, { place: LIBRARY, description: ' \n ' })).toEqual({
      kind: 'bad-description',
    });
    await made.storage.rule(SERVER, { kind: 'stop', id: LIBRARY.id }, 'allow', MOD);
    expect(await make(made, { description: ' \n ' })).toEqual({ kind: 'bad-description' });
    await made.storage.addBlock(SERVER, ALICE, MOD);
    expect(await make(made)).toEqual({ kind: 'blocked' });
    expect(made.store.active().filter((party) => party.type === 'meetup')).toEqual([]);
    expect(made.storage.requests.size).toBe(0);
  });

  it('closes the meetup at once when its maker was blocked while it was made', async () => {
    const made = await meetupSafetyWith();
    const create = made.service.createMeetup.bind(made.service);
    vi.spyOn(made.service, 'createMeetup').mockImplementationOnce(async (request) => {
      const outcome = await create(request);
      await made.storage.addBlock(SERVER, ALICE, MOD);
      return outcome;
    });
    expect(await make(made, { place: PARK })).toEqual({ kind: 'blocked' });
    expect(made.store.active().filter((party) => party.type === 'meetup')).toEqual([]);
  });
});

const MODERATOR_MEMBER = { id: MODERATOR, name: 'Mod' };

describe('MeetupSafety.decide', () => {
  it('approves: the meetup is made as its maker asked, the place allowed for good', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    made.clock.now += HOUR;
    const outcome = await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
    expect(outcome.kind).toBe('done');
    const [party] = made.store.active().filter((one) => one.type === 'meetup');
    expect(party).toMatchObject({
      createdById: ALICE,
      forumChannelId: WEST_FORUM,
      timed: { name: 'Book swap', startTime: request.startTime },
      meetup: { description: 'Bring a book.', place: LIBRARY },
    });
    expect(party?.attendees[ALICE]).toMatchObject({ name: 'Alice', team: 'mystic' });
    expect(made.storage.requests.get(request.id)).toMatchObject({
      status: 'approved',
      decision: 'approve',
      decidedBy: MODERATOR,
      decidedByName: 'Mod',
      decidedAt: PARTY_NOW + HOUR,
      partyId: party?.id,
    });
    expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBe('allow');
    // The moderators' post says what came of it, without its buttons.
    const post = made.postOf(request);
    expect(textOf(post?.message)).toContain(
      `**Approved** by **Mod** (<@${MODERATOR}>) <t:${String((PARTY_NOW + HOUR) / 1000)}:R>`,
    );
    expect(textOf(post?.message)).toContain(`<#${party?.forumPostId ?? ''}>`);
    expect(buttonLabels(post?.message)).toEqual([]);
    // The maker is told, with a way to the post.
    const [dm] = made.dms.to(ALICE);
    expect(textOf(dm)).toBe('A moderator approved your meetup **Book swap**: it is posted.');
    expect(linksOf(dm)).toEqual([
      `Go to post https://discord.com/channels/${SERVER}/${party?.forumPostId ?? ''}`,
    ]);
  });

  it('approves a meetup with its end: it is made with it', async () => {
    const made = await meetupSafetyWith();
    const endTime = PARTY_NOW + 26 * HOUR;
    const request = await made.held({ endTime });
    expect(request.endTime).toBe(endTime);
    await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
    const [party] = made.store.active().filter((one) => one.type === 'meetup');
    expect(party).toMatchObject({ endTime, timed: { startTime: request.startTime } });
  });

  it('approves once: the meetup is made, and the place has no ruling', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held({ place: SAFETY_PIN });
    expect(
      (await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SERVER)).kind,
    ).toBe('done');
    expect(made.store.active().filter((one) => one.type === 'meetup')).toHaveLength(1);
    expect(made.storage.rulingRows.size).toBe(0);
    expect(textOf(made.postOf(request)?.message)).toContain('**Approved once** by **Mod**');
  });

  it('refuses, for this meetup or for good, and tells the maker without saying why', async () => {
    const made = await meetupSafetyWith();
    const once = await made.held();
    const forGood = await made.held({ name: 'Book swap two' });
    await made.safety.decide(once.id, 'refuse', MODERATOR_MEMBER, SERVER);
    expect(made.storage.rulingRows.size).toBe(0);
    await made.safety.decide(forGood.id, 'refuse-forever', MODERATOR_MEMBER, SERVER);
    expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBe('refuse');
    expect(made.store.active().filter((one) => one.type === 'meetup')).toEqual([]);
    expect(made.storage.requests.get(forGood.id)).toMatchObject({
      status: 'refused',
      decision: 'refuse-forever',
    });
    expect(textOf(made.postOf(once)?.message)).toContain('**Refused** by **Mod**');
    expect(textOf(made.postOf(forGood)?.message)).toContain('**Refused from now on** by **Mod**');
    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
      'A moderator did not approve your meetup **Book swap**, so it is not posted.',
      'A moderator did not approve your meetup **Book swap two**, so it is not posted.',
    ]);
  });

  it('lets the first decision win and tells a later one who decided what', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    await made.safety.decide(request.id, 'refuse', MODERATOR_MEMBER, SERVER);
    const later = await made.safety.decide(request.id, 'approve', { id: BOB, name: 'Bob' }, SERVER);
    expect(later).toMatchObject({
      kind: 'decided-before',
      request: { status: 'refused', decidedBy: MODERATOR },
    });
    expect(made.store.active().filter((one) => one.type === 'meetup')).toEqual([]);
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('gives a pin no ruling: Approve and Refuse from now on are not for it', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held({ place: SAFETY_PIN });
    for (const decision of ['approve', 'refuse-forever'] as const) {
      expect((await made.safety.decide(request.id, decision, MODERATOR_MEMBER, SERVER)).kind).toBe(
        'not-for-a-pin',
      );
    }
    expect(made.storage.requests.get(request.id)?.status).toBe('pending');
  });

  it('knows no request of another server, nor one that is gone', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    expect(
      (await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, OTHER_SERVER)).kind,
    ).toBe('gone');
    expect((await made.safety.decide(requestId(9), 'approve', MODERATOR_MEMBER, SERVER)).kind).toBe(
      'gone',
    );
  });

  it('marks an approval failed when the meetup cannot be made, and tells the maker', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    // The region's forum is gone meanwhile.
    await made.regions.setForum(1, null);
    const outcome = await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
    expect(outcome).toMatchObject({ kind: 'done', failure: 'its region has no forum' });
    expect(made.storage.requests.get(request.id)).toMatchObject({
      status: 'failed',
      partyId: null,
      failure: { kind: 'no-forum' },
    });
    expect(textOf(made.postOf(request)?.message)).toContain(
      'but the meetup could not be made: its region has no forum. Its maker was told.',
    );
    expect(textOf(made.dms.to(ALICE)[0])).toBe(
      'A moderator approved your meetup **Book swap**, but I could not make it: its region has ' +
        'no forum. Use `/meetup` again later.',
    );
  });

  // Plan 8Z-2, fix round F-A4: `/meetup` asks the forum before its form; the approval came
  // later, so the meetup is not made into a forum somebody has kept its maker out of since.
  it('marks an approval failed when somebody keeps its maker out of the forum by then, in words that blame nobody', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const outcome = await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
    expect(outcome).toMatchObject({
      kind: 'done',
      failure: 'its maker is kept out of the forum its post would be in',
    });
    expect(made.storage.requests.get(request.id)).toMatchObject({
      status: 'failed',
      partyId: null,
      failure: { kind: 'kept-out' },
    });
    expect(made.gateway.postsIn(WEST_FORUM)).toEqual([]);
    expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBeUndefined();
    expect(textOf(made.postOf(request)?.message)).toContain(
      'but the meetup could not be made: its maker is kept out of the forum its post would be ' +
        'in. Its maker was told.',
    );
    expect(textOf(made.dms.to(ALICE)[0])).toBe(
      'A moderator approved your meetup **Book swap**, but I could not make it: you are kept ' +
        'out of the forum its post would be in.',
    );
  });

  // 8Z-2 final fix F5: one failed member fetch no longer ends the request for good.
  it('stores no approval while Discord cannot say whether its maker is kept out, and approves at the next press', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    const shownBefore = textOf(made.postOf(request)?.message);
    made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const outcome = await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SERVER);
    expect(outcome).toEqual({ kind: 'unchecked', decision: 'approve-once' });
    // Nothing kept, posted or said: the request is open, its post as it was.
    expect(made.storage.requests.get(request.id)).toMatchObject({
      status: 'pending',
      decidedBy: null,
    });
    expect(made.gateway.postsIn(WEST_FORUM)).toEqual([]);
    expect(textOf(made.postOf(request)?.message)).toBe(shownBefore);
    expect(made.dms.to(ALICE)).toEqual([]);
    // Discord is back: the next press approves it.
    made.gateway.failing.delete('memberAccess');
    const again = await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SERVER);
    expect(again).toMatchObject({ kind: 'done' });
    expect(again).not.toHaveProperty('failure');
    expect(made.storage.requests.get(request.id)?.status).toBe('approved');
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
  });

  it('says so when the bot may not make posts in the forum of an approved meetup', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    made.gateway.refusePosts.set(WEST_FORUM, ['Create Posts', 'Manage Posts']);
    const outcome = await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
    expect(outcome).toMatchObject({
      kind: 'done',
      failure:
        "I am not allowed to make posts in its forum (the server's staff must give me Create " +
        'Posts and Manage Posts there)',
    });
    // The other moderators read it in the post, which is drawn from what is kept.
    expect(made.storage.requests.get(request.id)?.failure).toEqual({
      kind: 'posts-refused',
      forumId: WEST_FORUM,
      missing: ['Create Posts', 'Manage Posts'],
    });
    expect(textOf(made.postOf(request)?.message)).toContain(
      `but the meetup could not be made: I am not allowed to make posts in <#${WEST_FORUM}> ` +
        "(the server's staff must give me Create Posts and Manage Posts there). Its maker was " +
        'told.',
    );
    made.gateway.refusePosts.set(WEST_FORUM, []);
    const second = await made.held();
    expect(await made.safety.decide(second.id, 'approve', MODERATOR_MEMBER, SERVER)).toMatchObject({
      kind: 'done',
      failure:
        "Discord does not let me make posts in its forum (the server's staff must check that I " +
        'have View Channel, Create Posts, Send Messages in Posts and Manage Posts there)',
    });
  });

  it('writes no ruling for an approval whose meetup could not be made', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    await made.regions.setForum(1, null);
    await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
    expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBeUndefined();
  });

  it('shows the outcome and tells the maker even when what is kept of it cannot be written', async () => {
    for (const failing of ['rule', 'settleApproval'] as const) {
      const made = await meetupSafetyWith();
      const request = await made.held();
      made.storage.failing.add(failing);
      const outcome = await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
      expect(outcome.kind).toBe('done');
      const [party] = made.store.active().filter((one) => one.type === 'meetup');
      expect(party).toBeDefined();
      expect(textOf(made.postOf(request)?.message)).toContain('**Approved** by **Mod**');
      expect(textOf(made.dms.to(ALICE)[0])).toBe(
        'A moderator approved your meetup **Book swap**: it is posted.',
      );
      expect(made.entries.map((entry) => entry.msg)).toContain(
        'could not keep what came of an approved meetup request',
      );
    }
  });

  it('tries once more to keep the meetup of an approval when the first write fails', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    vi.spyOn(made.storage, 'settleApproval').mockRejectedValueOnce(
      new Error('the database blinked'),
    );
    await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
    const [party] = made.store.active().filter((one) => one.type === 'meetup');
    expect(made.storage.requests.get(request.id)).toMatchObject({
      status: 'approved',
      partyId: party?.id,
    });
  });

  it('lets one of two decisions at the same moment win, and makes one meetup at most', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    const both = await Promise.all([
      made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SERVER),
      made.safety.decide(request.id, 'refuse', { id: BOB, name: 'Bob' }, SERVER),
    ]);
    expect(both.map((one) => one.kind).sort()).toEqual(['decided-before', 'done']);
    expect(made.store.active().filter((one) => one.type === 'meetup').length).toBeLessThanOrEqual(
      1,
    );
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('expires a request whose time is up instead of deciding it', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    made.clock.now = request.expiresAt;
    expect((await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER)).kind).toBe(
      'expired',
    );
    expect(made.storage.requests.get(request.id)?.status).toBe('expired');
    expect(made.store.active().filter((one) => one.type === 'meetup')).toEqual([]);
  });
});

describe('MeetupSafety.expire', () => {
  it('expires the pending requests whose time is up, edits their posts and tells their makers', async () => {
    const made = await meetupSafetyWith();
    const soon = await made.held({ startTime: PARTY_NOW + 3 * HOUR });
    const later = await made.held({ name: 'Later swap' });
    made.clock.now = soon.expiresAt;
    expect(await made.safety.expire()).toBe(1);
    expect(made.storage.requests.get(soon.id)?.status).toBe('expired');
    expect(made.storage.requests.get(later.id)?.status).toBe('pending');
    expect(textOf(made.postOf(soon)?.message)).toContain('**Expired**');
    // Its maker is not blocked: Block member stays (8S-1 review W7).
    expect(buttonLabels(made.postOf(soon)?.message)).toEqual(['Block member']);
    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
      'No moderator decided on your meetup **Book swap** in time, so it is not posted. Use ' +
        '`/meetup` again with a later start.',
    ]);
    expect(await made.safety.expire()).toBe(0);
  });

  it('expires the requests left when the safety was turned off', async () => {
    const made = await meetupSafetyWith({ moderation: null });
    await made.storage.addRequest(
      newRequest(1, { serverId: SERVER, makerId: ALICE, expiresAt: PARTY_NOW }),
    );
    expect(await made.safety.expire()).toBe(1);
    expect(made.storage.requests.get(requestId(1))?.status).toBe('expired');
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('fails an approval that never got its meetup, once it is five minutes old', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    // The bot stopped between the approval and the meetup.
    await made.storage.decideRequest(request.id, 'approved', 'approve', MOD);
    made.clock.now = MOD.at + 5 * MINUTE - 1;
    await made.safety.expire();
    expect(made.storage.requests.get(request.id)?.status).toBe('approved');
    made.clock.now = MOD.at + 5 * MINUTE;
    await made.safety.expire();
    expect(made.storage.requests.get(request.id)).toMatchObject({
      status: 'failed',
      partyId: null,
      failure: { kind: 'error' },
    });
    expect(textOf(made.postOf(request)?.message)).toContain(
      'but the meetup could not be made: something went wrong. Its maker was told.',
    );
    expect(buttonLabels(made.postOf(request)?.message)).toEqual([]);
    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
      'A moderator approved your meetup **Book swap**, but I could not make it: something went ' +
        'wrong. Use `/meetup` again later.',
    ]);
    await made.safety.expire();
    expect(made.dms.to(ALICE)).toHaveLength(1);
    expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBeUndefined();
  });
});

describe('MeetupSafety.warnAtStart', () => {
  // Plan 19A-1: the moderators' channel is a server's; fix round 4, I5: one line per reason for
  // the servers of a shard's start, their ids listed.
  const warnedOf = (made: Awaited<ReturnType<typeof meetupSafetyWith>>) =>
    made.entries.filter((entry) => entry.level === 40).map((entry) => [entry.msg, entry.servers]);
  const THIRD_SERVER = '412345678901234569';

  it("says in one line which servers have no moderators' channel", async () => {
    const made = await meetupSafetyWith();
    made.servers.changed.set(OTHER_SERVER, testServerValues());
    made.servers.changed.set(THIRD_SERVER, testServerValues());
    made.safety.warnAtStart([SERVER, OTHER_SERVER, THIRD_SERVER]);
    expect(warnedOf(made)).toEqual([
      [
        "meetup safety is off in these servers: they have no moderators' channel set",
        [OTHER_SERVER, THIRD_SERVER],
      ],
    ]);
  });

  it('says each reason once for three servers, each server under its own', async () => {
    const made = await meetupSafetyWith();
    made.gateway.noEmbeds.add(MOD_CHANNEL);
    made.servers.changed.set(
      OTHER_SERVER,
      testServerValues({ unmatched: ['channels.moderation'] }),
    );
    // THIRD_SERVER: the test's moderators' channel, which is not among its channels.
    made.safety.warnAtStart([SERVER, OTHER_SERVER, THIRD_SERVER]);
    expect(warnedOf(made)).toEqual([
      [
        "the moderators' channel of the settings file is not in these servers: meetups that need a moderator's approval cannot be made there until their staff set one",
        [OTHER_SERVER],
      ],
      [
        "the moderators' channel of these servers is gone: meetups that need a moderator's approval cannot be made there",
        [THIRD_SERVER],
      ],
      [
        "the bot cannot post in the moderators' channel of these servers (View Channel, Send Messages, Embed Links): meetups that need a moderator's approval cannot be made there",
        [SERVER],
      ],
    ]);
  });

  it('says nothing of a server that has its channel', async () => {
    const made = await meetupSafetyWith();
    made.safety.warnAtStart([SERVER]);
    expect(warnedOf(made)).toEqual([]);
  });

  it('lists the first 50 servers of a reason and how many more', async () => {
    const made = await meetupSafetyWith();
    const many = Array.from({ length: 53 }, (_, i) => `4123456789012${String(i).padStart(5, '0')}`);
    made.safety.warnAtStart(many);
    expect(warnedOf(made)).toEqual([
      [
        "the moderators' channel of these servers is gone: meetups that need a moderator's approval cannot be made there",
        [...many.slice(0, 50), 'and 3 more'],
      ],
    ]);
  });
});
