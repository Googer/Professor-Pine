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
import { ALICE, BOB, MINUTE, PARTY_NOW, REPORTER, inGyms } from '../../test/support/parties.js';
import {
  createdTrain,
  gatewayWithMirrorChannels,
  partyServiceWith,
  restarted,
} from '../../test/support/party-service.js';
import { PartyStatus } from '../domain/party/status.js';
import { gymStop } from '../domain/party/stops.js';
import { renderTrainPost } from '../render/train-post.js';
import type { Member } from './attendance-service.js';
import { WARN_AGAIN_AFTER } from './party-scheduler.js';
import {
  accentOf,
  buttonLabels,
  buttonsOf,
  header,
  leadOf,
  partTexts,
  textDisplays,
  textOf,
} from '../../test/support/messages.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob' };
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;

type Made = Awaited<ReturnType<typeof createdTrain>>;

/** The names of the tags a post carries. */
function tagsOf(made: Made, forum: typeof WEST_FORUM | typeof EAST_FORUM = WEST_FORUM): string[] {
  const names = Object.entries(made.tags[forum]);
  const applied = made.gateway.posts.get(made.postId)?.tagIds ?? [];
  return names.filter(([, id]) => applied.includes(id)).map(([name]) => name);
}

const shownPost = (made: Made) => made.gateway.posts.get(made.postId)?.message;

/** Runs the clock at a time and lets everything it started go out. */
async function tickAt(made: Made, time: number): Promise<void> {
  made.clock.now = time;
  await made.scheduler.tick();
  await made.scheduler.whenIdle();
  await made.attendance.flush();
  await made.service.flush();
}

describe('PartyService.createTrain', () => {
  it('stores the train and makes its post in the forum of the region it was made in', async () => {
    const made = await createdTrain({ creator: { name: 'Rhea', team: 'valor' } });
    const { party, postId, gateway, store } = made;
    expect(party).toMatchObject({
      type: 'train',
      status: 'active',
      regionId: 1,
      guildId: 1,
      gymId: null,
      forumChannelId: WEST_FORUM,
      forumPostId: postId,
      createdById: REPORTER,
      anonymous: false,
      timed: { name: 'Saturday legendaries', startTime: null },
      train: { route: [], stop: 0, conductorId: null, boss: null },
    });
    expect(store.get(party.id)).toEqual(party);
    expect(store.byPost(postId)?.id).toBe(party.id);
    // Who made it is signed up as interested, and is not the conductor.
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
    expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Train · Saturday legendaries' });
    expect(tagsOf(made)).toEqual(['Train']);
    expect(post?.message).toEqual(renderTrainPost(made.service.trainView(made.current())).message);
    // Made without a route: Manage… and no Move… (plan 8X-G).
    expect(buttonLabels(post?.message)).toContain('Manage…');
    expect(buttonLabels(post?.message)).not.toContain('Move…');
    expect(post).toMatchObject({ edits: 0, renames: 0, retags: 0 });
  });

  it('links to the new post in the channel of the region, as a train', async () => {
    const made = await createdTrain();
    const [link, ...others] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(link?.message.content).toBe(`New train: <#${made.postId}>`);
    expect(others).toEqual([]);
    expect(made.current().regionLinkMessageId).toBe(link?.id);
  });

  it('makes nothing for a text that is no name, a channel that is no region, a region without a forum', async () => {
    const made = await partyServiceWith();
    const request = { creatorId: REPORTER, regionChannelId: WEST_CHANNEL };
    expect(await made.service.createTrain({ ...request, name: '   ' })).toEqual({
      kind: 'bad-name',
    });
    expect(
      await made.service.createTrain({
        ...request,
        name: 'T',
        regionChannelId: '100000000000000099',
      }),
    ).toEqual({ kind: 'no-region' });
    expect(
      await made.service.createTrain({ ...request, name: 'T', regionChannelId: UNBOUNDED_CHANNEL }),
    ).toMatchObject({ kind: 'no-forum', region: { id: 3 } });
    expect(made.storage.writes).toEqual([]);
    expect(made.gateway.calls).toEqual([]);
  });

  it('ends the train again when its post cannot be made', async () => {
    const made = await partyServiceWith();
    made.gateway.failing.set('createPost', new Error('Discord is down'));
    await expect(
      made.service.createTrain({
        name: 'Saturday legendaries',
        creatorId: REPORTER,
        regionChannelId: WEST_CHANNEL,
      }),
    ).rejects.toThrow('Discord is down');
    expect(made.store.active()).toEqual([]);
    // It never was a train: nothing recorded, its row gone.
    expect([...made.storage.rows.values()]).toEqual([]);
    expect(made.history.records).toEqual([]);
  });
});

describe('PartyService: the post of a train', () => {
  it('stays in the forum of the region it was made in, wherever its route leads', async () => {
    // Gym 8 lies in East; the train was made in West.
    const made = await createdTrain({ route: [1, 8] });
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    await made.service.flush();
    expect(made.current()).toMatchObject({ regionId: 1, forumChannelId: WEST_FORUM, gymId: null });
    expect(made.gateway.posts.get(made.postId)?.forumId).toBe(WEST_FORUM);
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    expect(textOf(shownPost(made))).toContain('**Where · stop 2 of 2**\n**Café Élan Fresco** · ');
    // East gets no line that links to a new train: only the copy for the stop there.
    expect(made.gateway.messagesIn(EAST_CHANNEL).map((sent) => leadOf(sent.message))).toEqual([
      'A raid train that stops in this region. ' +
        `Sign up here to follow it in its post: <#${made.postId}>`,
    ]);
  });

  it('shows who signed up and where the train is after a change', async () => {
    const made = await createdTrain({ route: [4, 1] });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.service.flush();
    const texts = partTexts(shownPost(made));
    expect(texts.find((text) => text.startsWith('-# Route'))).toBe(
      '-# Route: **1. Veterans Memorial Bridge** · 2. The Stacks',
    );
    expect(texts.find((text) => text.startsWith('2 trainers'))).toBe(
      `2 trainers\n🤔 Interested (1): <@${REPORTER}>\n✅ Here (1): ❄️ Alice`,
    );
  });

  it('has no copies in the channels for remote raids and raids at elite raid gyms', async () => {
    const made = await createdTrain(
      { route: [4] },
      { renderDelayMs: 0, sharedDelayMs: 0 },
      { gateway: gatewayWithMirrorChannels() },
    );
    await made.attendance.setRemote(made.party.id, alice, true);
    await made.service.flush();
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('puts the train at the bottom of its post again for /status, with its buttons', async () => {
    const made = await createdTrain({ route: [4] });
    expect(await made.service.showStatus(made.party.id)).toBe(true);
    await made.service.flush();
    const [copy] = made.gateway.messagesIn(made.postId);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: made.postId, messageId: copy?.id, kind: 'status' },
    ]);
    expect(copy?.message).toEqual(made.gateway.posts.get(made.postId)?.message);
    expect(copy?.message).toEqual(renderTrainPost(made.service.trainView(made.current())).message);
  });

  it('lists the train in the summary of its region, with the gym it is at', async () => {
    const made = await createdTrain({ route: [4, 1] });
    const trainLine = () => textDisplays(made.service.summaryMessage(1))[1]?.split('\n')[1];
    expect(textDisplays(made.service.summaryMessage(1))).toEqual([
      '### Today and coming up\n1 train',
      `**Trains**\n<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
    ]);
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    // A gym is called by its nickname when it has one.
    expect(trainLine()).toBe(`<#${made.postId}> · at The Stacks · no time set · 1 trainer`);
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    expect(trainLine()).toBe(`<#${made.postId}> · route finished · no time set · 1 trainer`);
    expect(textDisplays(made.service.summaryMessage(2))).toEqual([
      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    ]);
  });
});

describe("PartyService: the train's emoji in the summary (plan 8M-11A)", () => {
  it("marks a train's line with the application's train emoji once it has it, as before without", async () => {
    const mark = '<:pinetrain:1400823744760905730>';
    let uploaded = false;
    const made = await createdTrain(
      { route: [4, 1] },
      { appEmoji: { get: (name) => (uploaded && name === 'pinetrain' ? mark : undefined) } },
    );
    const line = () => textDisplays(made.service.summaryMessage(1))[1]?.split('\n')[1];
    expect(line()).toBe(
      `<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
    );
    uploaded = true;
    expect(line()).toBe(
      `${mark} <#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
    );
  });
});

describe('PartyService: a train passing through another region (plan 8X-G)', () => {
  it('is listed in the summary of a region it stops in, linked to its copy there', async () => {
    // Gym 4 lies in West, gym 7 in East: a West train that stops in East.
    const made = await createdTrain({ route: [4, 7] });
    const east = made.regions.rows.find((row) => row.channelId === EAST_CHANNEL);
    if (!east) throw new Error('no East');
    await made.service.ensureSummary(east);
    await made.service.flush();
    const copy = made
      .current()
      .mirrorMessages.find(
        (mirror) => mirror.kind === 'region' && mirror.channelId === EAST_CHANNEL,
      );
    if (!copy) throw new Error('no copy in East');
    const summary = () => textOf(made.gateway.posts.get(east.summaryMessageId ?? '')?.message);
    const url = `https://discord.com/channels/${made.gateway.guildId}/${EAST_CHANNEL}/${copy.messageId}`;
    expect(summary()).toBe(
      '### Today and coming up\n1 train passing through\n' +
        `**Passing through**\n[Train · Saturday legendaries](<${url}>) · at Veterans Memorial ` +
        'Bridge · no time set · 1 trainer',
    );
    // Its own region lists it as its train, not as passing through.
    expect(textDisplays(made.service.summaryMessage(1))[0]).toBe(
      '### Today and coming up\n1 train',
    );
    // A move of the train is shown in East's summary too.
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    await made.service.flush();
    expect(summary()).toContain('· at Harbor Lighthouse Mural ·');
    // Once its route leaves East, East lists it no more.
    await made.trains.removeStop(made.party.id, { id: REPORTER }, 2);
    await made.service.flush();
    expect(summary()).toBe(
      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    );
  });
});

describe('PartyService: passing through while the train still reaches the region (review r0 C4)', () => {
  // Gym 7 lies in East, gyms 4 and 1 in West: a West train that starts in East.
  const passes = (made: Awaited<ReturnType<typeof createdTrain>>) =>
    textDisplays(made.service.summaryMessage(2)).some((text) =>
      text.startsWith('**Passing through**'),
    );

  it('drops a train that finishes once it is past every stop of the region', async () => {
    const made = await createdTrain({ route: [7, 4, 1], atEnd: 'finish' });
    expect(passes(made)).toBe(true);
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    expect(passes(made)).toBe(false);
  });

  it('keeps a train that loops or turns back for every stop of its route (Matt, 2026-10-22)', async () => {
    for (const atEnd of ['loop', 'turn-back'] as const) {
      const made = await createdTrain({ route: [7, 4, 1], atEnd });
      await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
      await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
      expect(passes(made)).toBe(true);
    }
  });

  it('counts no stop of a finished route', async () => {
    for (const atEnd of ['finish', 'loop'] as const) {
      const made = await createdTrain({ route: [7, 4, 1], atEnd });
      await made.trains.move(made.party.id, { id: REPORTER }, 'finish', false);
      expect(passes(made)).toBe(false);
    }
  });

  it('leaves the summary of another region with its end, and edits none it does not stop in (review r0 C3)', async () => {
    const made = await createdTrain({ route: [4, 7] });
    const east = made.regions.rows.find((row) => row.channelId === EAST_CHANNEL);
    if (!east) throw new Error('no East');
    await made.service.ensureSummary(east);
    await made.service.flush();
    const post = made.gateway.posts.get(east.summaryMessageId ?? '');
    expect(textOf(post?.message)).toContain('**Passing through**');
    await made.service.end(made.party.id);
    await made.service.flush();
    expect(textOf(post?.message)).not.toContain('**Passing through**');
    // A train of West alone: its moves leave East's summary as it is.
    const home = await createdTrain({ route: [4, 1, 2] });
    const there = home.regions.rows.find((row) => row.channelId === EAST_CHANNEL);
    const own = home.regions.rows.find((row) => row.channelId === WEST_CHANNEL);
    if (!there || !own) throw new Error('no East or West');
    await home.service.ensureSummary(there);
    await home.service.ensureSummary(own);
    await home.service.flush();
    const summary = home.gateway.posts.get(there.summaryMessageId ?? '');
    const edits = summary?.edits;
    // At debug the log has a line per edit of a summary, by region (final review F5).
    const editedIn = (regionId: number) =>
      home.entries.filter(
        (entry) => entry.msg === 'edited the summary post' && entry['region'] === regionId,
      ).length;
    const [eastEdits, westEdits] = [editedIn(there.id), editedIn(own.id)];
    await home.trains.move(home.party.id, { id: REPORTER }, 'next', false);
    await home.service.flush();
    expect(summary?.edits).toBe(edits);
    expect(editedIn(there.id)).toBe(eastEdits);
    expect(editedIn(own.id)).toBe(westEdits + 1);
  });
});

describe('PartyService: a train passing through, its copy made after the summary', () => {
  it('links the copy once it is made, though the summary was drawn before it', async () => {
    const made = await createdTrain({ route: [4] });
    const east = made.regions.rows.find((row) => row.channelId === EAST_CHANNEL);
    if (!east) throw new Error('no East');
    await made.service.ensureSummary(east);
    await made.trains.addStop(made.party.id, { id: REPORTER }, gymStop(7));
    await made.service.flush();
    const copy = made
      .current()
      .mirrorMessages.find(
        (mirror) => mirror.kind === 'region' && mirror.channelId === EAST_CHANNEL,
      );
    if (!copy) throw new Error('no copy in East');
    const summary = textOf(made.gateway.posts.get(east.summaryMessageId ?? '')?.message);
    expect(summary).toContain(`/${EAST_CHANNEL}/${copy.messageId}>)`);
  });

  it('links the newest copy while an earlier one that could not be deleted is still recorded (final review F2)', async () => {
    const made = await createdTrain({ route: [4, 7] });
    const east = made.regions.rows.find((row) => row.channelId === EAST_CHANNEL);
    if (!east) throw new Error('no East');
    await made.service.ensureSummary(east);
    await made.service.flush();
    // An earlier copy in East that Discord would not let go of stays on the record, before
    // the copy sent after it.
    made.gateway.failing.set('deleteMessage', new Error('Missing Access'));
    const stale = { channelId: EAST_CHANNEL, messageId: '900000000000009999', kind: 'region' };
    await made.store.update(made.party.id, (party) => ({
      party: { ...party, mirrorMessages: [stale as never, ...party.mirrorMessages] },
    }));
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    await made.service.flush();
    const copies = made
      .current()
      .mirrorMessages.filter(
        (mirror) => mirror.kind === 'region' && mirror.channelId === EAST_CHANNEL,
      );
    const newest = copies.at(-1);
    expect(copies.length).toBe(2);
    expect(newest?.messageId).not.toBe(stale.messageId);
    const summary = textOf(made.gateway.posts.get(east.summaryMessageId ?? '')?.message);
    expect(summary).toContain(`/${EAST_CHANNEL}/${newest?.messageId ?? ''}>)`);
  });
});

describe('PartyService: ending a train', () => {
  it('strips the controls, deletes the link line and archives the post as ended', async () => {
    const made = await createdTrain({ route: [4, 1] });
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(made.store.get(made.party.id)).toBeUndefined();
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(buttonsOf(post?.message)).toEqual([]);
    expect(header(shownPost(made))[1]).toBe('This train is over.');
    expect(accentOf(shownPost(made))).toBe(0xe74c3c);
    expect(tagsOf(made)).toEqual(['Ended', 'Train']);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('puts a request to delete it into the post, as a train', async () => {
    const made = await createdTrain();
    expect(await made.service.requestDeletion(made.party.id, { id: ALICE }, 'Made twice', [])).toBe(
      'asked',
    );
    expect(made.said().at(-1)).toBe(`<@${ALICE}> asks for this train to be deleted.\n> Made twice`);
  });
});

describe('PartyService: a train after a restart', () => {
  it('shows the post anew from what is stored: its route, its conductor, its boss', async () => {
    const made = await createdTrain({ route: [4, 1, 7] });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.trains.setConductor(made.party.id, alice);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.setBoss(made.party.id, alice, { boss: { key: 'yveltal' }, label: 'Yveltal' });
    await made.trains.flush();
    await made.attendance.flush();
    await made.service.flush();
    const shown = made.gateway.posts.get(made.postId)?.message;
    const again = await restarted(made);
    const train = again.store.byPost(made.postId);
    expect(inGyms(train)).toEqual(inGyms(made.current()));
    expect(inGyms(train)).toMatchObject(
      inGyms({
        type: 'train',
        train: { route: [4, 1, 7], stop: 1, conductorId: ALICE, boss: { key: 'yveltal' } },
      }),
    );
    await again.scheduler.tick();
    await again.service.flush();
    expect(again.gateway.posts.get(made.postId)?.message).toEqual(shown);
  });
});

describe('PartyScheduler: a train', () => {
  it('gives a train nobody gave a time a day, and pings its maker with the warning', async () => {
    const made = await createdTrain({ route: [4, 1] });
    await tickAt(made, PARTY_NOW + DAY + 5 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    const warnedAt = PARTY_NOW + DAY + 6 * MINUTE;
    await tickAt(made, warnedAt);
    const due = warnedAt + 60 * MINUTE;
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      {
        content:
          'This train has no end time, so I take it to be over. ' +
          `I will archive this post ${stamp(due, 'R')}; it stays readable afterwards. ` +
          `A time set with \`/meet\` or \`/end\` keeps it open.\n<@${REPORTER}>`,
        mention: { users: [REPORTER] },
      },
    ]);
    expect(tagsOf(made)).toEqual(['Train']);
    await tickAt(made, due);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)).toMatchObject({
      archived: true,
      locked: true,
      reopened: 0,
    });
    expect(header(shownPost(made))[1]).toBe('This train is over.');
    expect(tagsOf(made)).toEqual(['Ended', 'Train']);
  });

  it('pings the conductor instead when the train has one, once', async () => {
    const made = await createdTrain({ route: [4, 1] });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.trains.setConductor(made.party.id, alice);
    await made.attendance.flush();
    for (const message of made.gateway.messagesIn(made.postId)) {
      await made.gateway.deleteMessage(made.postId, message.id);
    }
    await tickAt(made, PARTY_NOW + DAY + 6 * MINUTE);
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
      users: [ALICE],
    });
    for (let n = 0; n < WARN_AGAIN_AFTER; n++) made.scheduler.activity(made.postId);
    await made.scheduler.whenIdle();
    const [again, ...others] = made.gateway.messagesIn(made.postId);
    expect(others).toEqual([]);
    expect(again?.message.mention).toBeUndefined();
  });

  it('pings nobody when the conductor does not allow it, or the train had an end', async () => {
    const quiet = await createdTrain();
    await quiet.attendance.signUp(quiet.party.id, bob, PartyStatus.Coming);
    await quiet.trains.setConductor(quiet.party.id, bob);
    quiet.userSettings.set(BOB, { mentions: false });
    await quiet.attendance.flush();
    await tickAt(quiet, PARTY_NOW + DAY + 6 * MINUTE);
    const warning = quiet.gateway.messagesIn(quiet.postId).at(-1)?.message;
    expect(warning?.content).toMatch(/^This train has no end time/);
    expect(warning?.mention).toBeUndefined();

    const ended = await createdTrain();
    const end = PARTY_NOW + 2 * HOUR;
    await ended.timed.setEndTime(ended.party.id, { id: REPORTER }, end);
    await ended.attendance.flush();
    await tickAt(ended, end + 6 * MINUTE);
    expect(ended.gateway.messagesIn(ended.postId).at(-1)?.message).toEqual({
      content: `This train is over. I will archive this post ${stamp(end + 66 * MINUTE, 'R')}; it stays readable afterwards.`,
    });
  });

  it('does not end a train because its route is finished', async () => {
    const made = await createdTrain({ route: [4] });
    await made.trains.move(made.party.id, { id: REPORTER }, 'finish', false);
    await made.trains.flush();
    await tickAt(made, PARTY_NOW + 12 * HOUR);
    expect(made.current()).toMatchObject({ status: 'active', deletionTime: null });
    expect(tagsOf(made)).toEqual(['Train']);
  });
});
