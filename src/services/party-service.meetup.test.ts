import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  ELITE_GYM_CHANNEL,
  REMOTE_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import {
  ALICE,
  asMeetup,
  at,
  BOB,
  MemoryPartyStorage,
  MINUTE,
  PARTY_NOW,
  REPORTER,
  testMeetup,
} from '../../test/support/parties.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { missingPermissions } from '../../test/support/fake-gateway.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import type { KnownPlace } from '../domain/geo/place.js';
import {
  createdMeetup,
  gatewayWithMirrorChannels,
  partyServiceWith,
  restarted,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { setDescription } from '../domain/party/meetup.js';
import { PartyStatus } from '../domain/party/status.js';
import { endParty } from '../domain/party/party.js';
import { setName, setStartTime, setTimedEnd } from '../domain/party/timed.js';
import { renderMeetupPost } from '../render/meetup-post.js';
import type { Member } from './attendance-service.js';
import { PartyStore } from './party-store.js';
import {
  accentOf,
  buttonNames,
  buttonsOf,
  header,
  partTexts,
  textDisplays,
  textOf,
} from '../../test/support/messages.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');

type Made = Awaited<ReturnType<typeof createdMeetup>>;

/** The names of the tags a post carries. */
function tagsOf(made: Made, postId = made.postId): string[] {
  const names = Object.entries(made.tags[WEST_FORUM]);
  const applied = made.gateway.posts.get(postId)?.tagIds ?? [];
  return names.filter(([, id]) => applied.includes(id)).map(([name]) => name);
}

describe('PartyService.createMeetup', () => {
  it('stores the meetup and makes its post in the forum of the region it was made in', async () => {
    const made = await createdMeetup({ creator: { name: 'Rhea', team: 'valor' } });
    const { party, postId, gateway, store } = made;
    expect(party).toMatchObject({
      type: 'meetup',
      status: 'active',
      regionId: 1,
      guildId: 1,
      gymId: null,
      forumChannelId: WEST_FORUM,
      forumPostId: postId,
      createdById: REPORTER,
      anonymous: false,
      timed: { name: 'Community Day picnic', startTime: null },
      meetup: { description: null },
    });
    expect(store.get(party.id)).toEqual(party);
    expect(store.byPost(postId)?.id).toBe(party.id);
    // Who made it is signed up as interested, with the name and team the interaction said.
    expect(party.attendees).toEqual({
      [REPORTER]: {
        number: 1,
        status: PartyStatus.Interested,
        group: 'A',
        remote: false,
        name: 'Rhea',
        team: 'valor',
      },
    });
    const post = gateway.posts.get(postId);
    expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Meetup · Community Day picnic' });
    expect(tagsOf(made)).toEqual(['Meetup']);
    expect(post?.message).toEqual(renderMeetupPost(made.service.timedView(made.current())).message);
    expect(buttonNames(post?.message)).toEqual([
      '🤔',
      '🏃',
      '✅',
      '👋',
      '⬇️',
      '⬆️',
      '📡',
      'Manage…',
    ]);
  });

  it('makes a meetup at a place, and shows the place as it is now, also after an import', async () => {
    const stop: KnownPlace = {
      kind: 'stop',
      id: wayspotId(1),
      title: 'Fountain Square',
      lat: 40.0601,
      lon: -80.0601,
      address: null,
      image: null,
    };
    const { storage, wayspots } = await wayspotsWith([
      keptRow(1, { title: 'Fountain Square', lat: stop.lat, lon: stop.lon, address: null }),
    ]);
    const made = await createdMeetup({ place: stop }, { wayspots });
    expect(made.party.meetup).toEqual({ description: null, place: stop });
    const where = () =>
      textDisplays(made.gateway.posts.get(made.postId)?.message).find((text) =>
        text.startsWith('**Where**'),
      );
    expect(where()).toMatch(/^\*\*Where\*\*\nNear \*\*Fountain Square\*\* \(PokéStop\) · /);
    // An import renames the stop: the post shows the new name, and the meetup keeps what it was
    // named at.
    await storage.saveFromImport(
      {
        upsert: [keptRow(1, { title: 'Fountain Square Park', lat: stop.lat, lon: stop.lon })],
        remove: [],
      },
      PARTY_NOW,
    );
    await wayspots.load();
    await made.service.flush();
    expect(where()).toMatch(/^\*\*Where\*\*\nNear \*\*Fountain Square Park\*\* \(PokéStop\) · /);
    expect(made.current().meetup.place).toEqual(stop);
    // Once the service is closed (shutdown), a load shows nothing anew.
    await made.service.close();
    const edits = made.gateway.posts.get(made.postId)?.edits;
    await wayspots.load();
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(edits);
  });

  it('lets the kept Wayspots load before the parties, as the bot starts', async () => {
    const { wayspots } = await wayspotsWith([keptRow(1, { title: 'Fountain Square' })]);
    const store = new PartyStore({
      storage: new MemoryPartyStorage([]),
      log: createTestLogger().log,
    });
    await partyServiceWith([], { wayspots, store });
    await expect(wayspots.load()).resolves.toBeUndefined();
  });

  it('links to the new post in the channel of the region, as a meetup', async () => {
    const made = await createdMeetup();
    const [link, ...others] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(link?.message.content).toBe(`New meetup: <#${made.postId}>`);
    expect(others).toEqual([]);
    expect(made.current().regionLinkMessageId).toBe(link?.id);
  });

  it('goes into the forum of the region whose channel it was made in', async () => {
    const made = await createdMeetup({ regionChannelId: EAST_CHANNEL });
    expect(made.party).toMatchObject({ regionId: 2, forumChannelId: EAST_FORUM });
    expect(made.gateway.posts.get(made.postId)?.forumId).toBe(EAST_FORUM);
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toHaveLength(1);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('edits nothing right after the post was made: what was sent is what it shows', async () => {
    const made = await createdMeetup();
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ edits: 0, renames: 0, retags: 0 });
  });

  it('makes a meetup with its start and information in one post, announcing nothing', async () => {
    const made = await createdMeetup({ startTime: START, description: 'Bring snacks.' });
    expect(made.party).toMatchObject({
      timed: { startTime: START },
      meetup: { description: 'Bring snacks.' },
    });
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ edits: 0 });
    const shown = textOf(made.gateway.posts.get(made.postId)?.message);
    expect(shown).toContain('Bring snacks.');
    expect(shown).toContain(`<t:${String(START / 1000)}:`);
    // No line in the post about a new start: the meetup was made with it.
    expect(made.said()).toEqual([]);
  });

  it('makes nothing for information that is too long', async () => {
    const made = await partyServiceWith();
    expect(
      await made.service.createMeetup({
        name: 'Picnic',
        creatorId: REPORTER,
        regionChannelId: WEST_CHANNEL,
        description: 'x'.repeat(1001),
      }),
    ).toEqual({ kind: 'bad-description' });
    expect(made.storage.writes).toEqual([]);
  });

  it('keeps meetups apart by nothing: two with one name are two meetups', async () => {
    const made = await createdMeetup();
    const second = await made.service.createMeetup({
      name: 'Community Day picnic',
      creatorId: ALICE,
      regionChannelId: WEST_CHANNEL,
    });
    expect(second.kind).toBe('created');
    expect(made.store.active().map((party) => party.type)).toEqual(['meetup', 'meetup']);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
  });

  it('makes nothing for a text that is no name', async () => {
    const made = await partyServiceWith();
    const request = { creatorId: REPORTER, regionChannelId: WEST_CHANNEL };
    expect(await made.service.createMeetup({ ...request, name: '   ' })).toEqual({
      kind: 'bad-name',
    });
    expect(await made.service.createMeetup({ ...request, name: 'x'.repeat(81) })).toEqual({
      kind: 'bad-name',
    });
    expect(made.storage.writes).toEqual([]);
    expect(made.gateway.calls).toEqual([]);
  });

  it('says why it made nothing: an end not after the start is no bad name', async () => {
    const made = await partyServiceWith();
    const startTime = Date.now() + 3_600_000;
    const outcome = await made.service.createMeetup({
      name: 'Picnic',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
      startTime,
      endTime: startTime,
    });
    expect(outcome).toEqual({ kind: 'cannot-make', reason: 'end-before-start' });
    expect(made.storage.writes).toEqual([]);
  });

  it('says so for a channel that is no region, and for a region without a forum', async () => {
    const made = await partyServiceWith();
    const request = { name: 'Picnic', creatorId: REPORTER };
    expect(
      await made.service.createMeetup({ ...request, regionChannelId: '100000000000000099' }),
    ).toEqual({ kind: 'no-region' });
    expect(
      await made.service.createMeetup({ ...request, regionChannelId: UNBOUNDED_CHANNEL }),
    ).toEqual({ kind: 'no-forum', region: made.regions.byChannel(UNBOUNDED_CHANNEL) });
    expect(made.storage.writes).toEqual([]);
    expect(made.gateway.calls).toEqual([]);
  });

  it('ends the meetup again when its post cannot be made', async () => {
    const made = await partyServiceWith();
    made.gateway.failing.set('createPost', new Error('Discord is down'));
    await expect(
      made.service.createMeetup({
        name: 'Picnic',
        creatorId: REPORTER,
        regionChannelId: WEST_CHANNEL,
      }),
    ).rejects.toThrow('Discord is down');
    expect(made.store.active()).toEqual([]);
    // It never was a meetup: nothing recorded, its row gone.
    expect([...made.storage.rows.values()]).toEqual([]);
    expect(made.history.records).toEqual([]);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('says that the region has no forum when the forum is gone, and leaves no meetup', async () => {
    const made = await partyServiceWith();
    made.gateway.gone.add(WEST_FORUM);
    const outcome = await made.service.createMeetup({
      name: 'Picnic',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
    });
    expect(outcome).toMatchObject({ kind: 'no-forum', region: { id: 1 } });
    expect(made.store.active()).toEqual([]);
  });

  it('makes the meetup all the same when the link line cannot be posted', async () => {
    const made = await partyServiceWith();
    made.gateway.failing.set('sendMessage', new Error('no permission in the region channel'));
    const outcome = await made.service.createMeetup({
      name: 'Picnic',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    expect(outcome.party).toMatchObject({ forumChannelId: WEST_FORUM, regionLinkMessageId: null });
    expect(made.store.get(outcome.party.id)).toEqual(outcome.party);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(
      made.entries.some((entry) => entry.msg === 'could not post the link to a new meetup'),
    ).toBe(true);
  });

  it('makes nothing on Discord when the meetup cannot be stored', async () => {
    const made = await partyServiceWith();
    made.storage.failing = new Error('the database is away');
    await expect(
      made.service.createMeetup({
        name: 'Picnic',
        creatorId: REPORTER,
        regionChannelId: WEST_CHANNEL,
      }),
    ).rejects.toThrow('the database is away');
    made.storage.failing = undefined;
    expect(made.store.active()).toEqual([]);
    expect(made.gateway.calls).toEqual([]);
  });

  it('ends a meetup that a stop left without a post, like a raid', async () => {
    const orphan = testMeetup();
    const made = await partyServiceWith([orphan]);
    await expect(made.service.endPartiesWithoutPost()).resolves.toBe(1);
    expect(made.store.active()).toEqual([]);
  });
});

describe('PartyService: the post of a meetup', () => {
  it('shows who signed up after a change', async () => {
    const made = await createdMeetup();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 2 });
    await made.service.flush();
    const post = made.gateway.posts.get(made.postId);
    expect(post?.edits).toBe(1);
    expect(partTexts(post?.message)[1]).toBe(
      `3 trainers\n🤔 Interested (1): <@${REPORTER}>\n🏃 Coming (2): ❄️ Alice +1`,
    );
    // A render that would change nothing is not sent.
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(1);
  });

  it('follows the name with its title, and shows times and information', async () => {
    const made = await createdMeetup();
    const { store, service, gateway, postId, clock } = made;
    await store.update(made.party.id, (party) => setName(asMeetup(party), 'Raid hour meet'));
    await store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), REPORTER, START, clock.now),
    );
    await store.update(made.party.id, (party) => setTimedEnd(asMeetup(party), END, clock.now));
    await store.update(made.party.id, (party) => setDescription(asMeetup(party), 'Bring snacks.'));
    service.changed(made.party.id);
    await service.flush();
    const post = gateway.posts.get(postId);
    expect(post).toMatchObject({ title: 'Meetup · Raid hour meet', renames: 1 });
    expect(header(post?.message)).toEqual([
      '### Meetup: Raid hour meet',
      `Starts <t:${START / 1000}:R>, at <t:${START / 1000}:t>. Ends at <t:${END / 1000}:t>.`,
    ]);
    expect(textDisplays(post?.message)).toContain('**Meeting Information**\nBring snacks.');
  });

  it('has no copies in the channels for remote raids and raids at elite raid gyms', async () => {
    const made = await createdMeetup(
      {},
      { renderDelayMs: 0, sharedDelayMs: 0 },
      { gateway: gatewayWithMirrorChannels() },
    );
    await made.attendance.setRemote(made.party.id, alice, true);
    await made.service.flush();
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('puts the meetup at the bottom of its post again for /status, and keeps that copy current', async () => {
    const made = await createdMeetup();
    expect(await made.service.showStatus(made.party.id)).toBe(true);
    await made.service.flush();
    const [copy] = made.gateway.messagesIn(made.postId);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: made.postId, messageId: copy?.id, kind: 'status' },
    ]);
    expect(copy?.message).toEqual(made.gateway.posts.get(made.postId)?.message);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.service.flush();
    const [updated] = made.gateway.messagesIn(made.postId);
    expect(textOf(updated?.message)).toContain('Alice');
    expect(updated?.message).toEqual(made.gateway.posts.get(made.postId)?.message);
  });

  it('lists the meetup in the summary of its region, under the raids', async () => {
    const made = await createdMeetup();
    expect(textDisplays(made.service.summaryMessage(1))).toEqual([
      '### Today and coming up\n1 meetup',
      `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
    ]);
    expect(textDisplays(made.service.summaryMessage(2))).toEqual([
      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    ]);
    const gym = gymsFixture().get(1);
    if (!gym) throw new Error('no gym');
    const raid = await made.service.reportRaid({
      gym,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Coming,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (raid.kind !== 'created') throw new Error(raid.kind);
    expect(textDisplays(made.service.summaryMessage(1))).toEqual([
      '### Today and coming up\n1 raid · 1 meetup',
      `**Level 5**\n<#${raid.party.forumPostId ?? ''}> · no time set · 1 trainer`,
      `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
    ]);
  });

  it('brings the pinned summary up to date when a meetup is made, changes and ends', async () => {
    const before = await partyServiceWith();
    const [west] = before.regions.rows;
    if (!west) throw new Error('no region');
    await before.service.ensureSummary(west);
    const summaryId = before.regions.byId(1)?.summaryMessageId ?? '';
    const text = () => textOf(before.gateway.posts.get(summaryId)?.message);
    expect(text()).toBe(
      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    );

    const outcome = await before.service.createMeetup({
      name: 'Picnic',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    await before.service.flush();
    expect(text()).toContain(`<#${outcome.party.forumPostId ?? ''}> · no time set · 1 trainer`);

    await before.attendance.signUp(outcome.party.id, alice, PartyStatus.Coming);
    await before.service.flush();
    expect(text()).toContain('2 trainers');

    await before.service.end(outcome.party.id);
    await before.service.flush();
    expect(text()).toBe(
      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    );
  });
});

describe('PartyService: ending a meetup', () => {
  it('strips the controls, deletes the link line and the copy, and archives the post', async () => {
    const made = await createdMeetup();
    const { service, store, gateway, postId } = made;
    await service.showStatus(made.party.id);
    await service.flush();
    expect(gateway.messagesIn(postId)).toHaveLength(1);

    expect(await service.end(made.party.id)).toBe(true);

    expect(store.get(made.party.id)).toBeUndefined();
    // Recorded in the history, and its row (with its members' ids) deleted.
    expect(made.history.records.map((record) => record.partyId)).toEqual([made.party.id]);
    expect(made.storage.rows.has(made.party.id)).toBe(false);
    const post = gateway.posts.get(postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(buttonsOf(post?.message)).toEqual([]);
    expect(header(post?.message)[0]).toBe('### Meetup: Community Day picnic');
    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(postId)).toEqual([]);
    expect(gateway.calls.filter((call) => call.endsWith(` ${postId}`)).at(-1)).toBe(
      `archivePost ${postId}`,
    );
  });

  it('says the last words, shows them in the place of the times, and tags the post as ended', async () => {
    const made = await createdMeetup();
    const words = 'This meetup was closed by <@200000000000000009>.';
    let answered = false;
    expect(
      await made.service.end(made.party.id, undefined, {
        lastWords: words,
        left: () => {
          answered = true;
          return Promise.resolve();
        },
      }),
    ).toBe(true);
    expect(answered).toBe(true);
    expect(made.said()).toEqual([words]);
    const post = made.gateway.posts.get(made.postId);
    expect(header(post?.message)[1]).toBe(words);
    expect(accentOf(post?.message)).toBe(0xe74c3c);
    expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
    expect(post).toMatchObject({ archived: true, locked: true });
  });

  it('deletes the post in place of archiving it when asked, after the link line', async () => {
    const made = await createdMeetup();
    await made.service.showStatus(made.party.id);
    await made.service.flush();
    const statusCopy = made.gateway.messagesIn(made.postId)[0]?.id;
    let answered = false;
    expect(
      await made.service.end(made.party.id, undefined, {
        lastWords: 'Closed by the moderators.',
        removal: 'delete',
        left: () => {
          answered = true;
          return Promise.resolve();
        },
      }),
    ).toBe(true);
    expect(answered).toBe(true);
    expect(made.gateway.posts.has(made.postId)).toBe(false);
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(await made.service.endAs(made.party.id)).toBe(false);
    // Nothing is said in the post or done to it after it is gone; the history records the end.
    expect(made.gateway.calls.filter((call) => call.endsWith(` ${made.postId}`)).at(-1)).toBe(
      `deletePost ${made.postId}`,
    );
    expect(made.gateway.deleted.map((one) => one.messageId)).toContain(statusCopy);
    expect(made.history.records.map((record) => record.partyId)).toEqual([made.party.id]);
  });

  it('archives the post when Discord refuses to delete it', async () => {
    const made = await createdMeetup();
    made.gateway.failing.set('deletePost', missingPermissions('MANAGE_THREADS'));
    // It says how the post went: archived, as Discord refused the deletion.
    expect(
      await made.service.endAs(made.party.id, undefined, {
        lastWords: 'Closed.',
        removal: 'delete',
      }),
    ).toBe('archived');
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
    expect(made.said()).toEqual(['Closed.']);
    expect(made.entries.some((entry) => entry.msg === 'could not delete the post of a party')).toBe(
      true,
    );
  });

  it('ends only when the condition holds for the meetup as it is stored then', async () => {
    const made = await createdMeetup();
    expect(await made.service.end(made.party.id, (party) => party.saved)).toBe(false);
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(await made.service.end(made.party.id, (party) => party.type === 'meetup')).toBe(true);
  });

  it('ends the meetup when somebody deleted its post', async () => {
    const made = await createdMeetup();
    made.gateway.gone.add(made.postId);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('archives the open post of an ended meetup in its sweep', async () => {
    const made = await createdMeetup();
    await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    expect(await made.service.sweepPosts()).toBe(1);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });
});

describe('PartyService: what is said about a meetup', () => {
  it('puts a request to delete it into the post, as a meetup, pinging the roles once', async () => {
    const made = await createdMeetup();
    const roles = ['500000000000000001'];
    expect(
      await made.service.requestDeletion(made.party.id, { id: ALICE }, 'Made twice', roles),
    ).toBe('asked');
    const [request] = made.gateway.messagesIn(made.postId);
    expect(request?.message).toEqual({
      content: `<@&500000000000000001>: <@${ALICE}> asks for this meetup to be deleted.\n> Made twice`,
      mention: { roles },
    });
    expect(await made.service.requestDeletion(made.party.id, { id: ALICE }, 'Again', roles)).toBe(
      'already',
    );
  });

  it('keeps a meetup for a moderator, and the post says who did', async () => {
    const made = await createdMeetup();
    expect(await made.service.keep(made.party.id, true, { id: ALICE })).toBe('kept');
    expect(made.current().saved).toBe(true);
    expect(made.said()).toEqual([
      `<@${ALICE}> keeps this post open: it will not be archived by itself.`,
    ]);
    await made.service.flush();
    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
      'Kept open by a moderator',
    );
  });

  it('never moves a meetup to a gym: there is no such raid', async () => {
    const made = await createdMeetup();
    const gym = gymsFixture().get(8);
    const east = made.regions.byId(2);
    if (!gym || !east) throw new Error('no gym or region');
    expect(await made.service.relocate(made.party.id, gym, east)).toEqual({ kind: 'gone' });
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
  });
});

describe('PartyService: a meetup after a restart', () => {
  it('shows the post anew from what is stored, and finds the meetup by its post', async () => {
    const made = await createdMeetup();
    await made.store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), REPORTER, START, made.clock.now),
    );
    const again = await restarted(made);
    expect(again.store.byPost(made.postId)).toEqual(made.current());
    again.clock.now += MINUTE;
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(textOf(again.gateway.posts.get(made.postId)?.message)).toContain(
      `Starts <t:${START / 1000}:R>`,
    );
  });
});
