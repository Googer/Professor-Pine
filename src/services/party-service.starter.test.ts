import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { TEST_GUILD_ROW, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { textOf, thumbnailOf } from '../../test/support/messages.js';
import { ALICE, REPORTER } from '../../test/support/parties.js';
import { createdMeetup, partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { PartyStatus } from '../domain/party/status.js';
import { FIRST_LINE } from './party-service.js';

const yveltal = { boss: { key: 'yveltal' } } as const;

/** The calls of a kind, in order. */
const callsOf = (gateway: FakePartyGateway, method: string): string[] =>
  gateway.calls.filter((call) => call.startsWith(`${method} `));

describe('PartyService: the first message of a forum post', () => {
  it('is the post itself where Discord takes a components-v2 message there, said once', async () => {
    const made = await reportedRaid(yveltal);
    const post = made.gateway.posts.get(made.postId);
    expect(post?.message.v2).toBe(true);
    expect(post?.edits).toBe(0);
    expect(callsOf(made.gateway, 'createPost')).toEqual([`createPost ${WEST_FORUM}`]);
    await made.service.createMeetup({
      name: 'Picnic',
      creatorId: ALICE,
      regionChannelId: WEST_CHANNEL,
    });
    const said = made.entries.filter((entry) => entry.msg === 'forum posts are made as they are');
    expect(said).toHaveLength(1);
  });

  it('is a line of text edited into the post where Discord refuses it, and so from then on', async () => {
    const gateway = new FakePartyGateway();
    gateway.refuseV2Starter = true;
    const made = await reportedRaid(yveltal, {}, { gateway });
    const post = made.gateway.posts.get(made.postId);
    // Made with the line, then edited into the post: what the render made, nothing else.
    expect(post?.message.v2).toBe(true);
    expect(post?.edits).toBe(1);
    expect(textOf(post?.message)).toContain('Level 5 raid');
    expect(thumbnailOf(post?.message)).toBeDefined();
    expect(post?.title).toBe('Yveltal · The Stacks');
    // With its picture, without it (the picture might have been what was refused), then the line.
    expect(callsOf(gateway, 'createPost')).toEqual([
      `createPost ${WEST_FORUM}`,
      `createPost ${WEST_FORUM}`,
      `createPost ${WEST_FORUM}`,
    ]);
    expect(callsOf(gateway, 'editPost')).toEqual([`editPost ${made.postId}`]);
    // The line is known to be classic: it is converted at once, without an edit Discord refuses.
    expect(gateway.converted).toEqual([{ id: made.postId, direct: true }]);
    // The render that follows the creation sends nothing: the post shows it already.
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(1);
    // The next post is made with the line at once.
    const before = gateway.calls.length;
    const meetup = await made.service.createMeetup({
      name: 'Picnic',
      creatorId: ALICE,
      regionChannelId: WEST_CHANNEL,
    });
    if (meetup.kind !== 'created') throw new Error(meetup.kind);
    expect(gateway.calls.slice(before).filter((call) => call.startsWith('createPost'))).toEqual([
      `createPost ${WEST_FORUM}`,
    ]);
    expect(made.gateway.posts.get(meetup.party.forumPostId ?? '')?.message.v2).toBe(true);
    const said = made.entries.filter(
      (entry) => entry.msg === 'Discord refused a components-v2 first message of a forum post',
    );
    expect(said).toHaveLength(1);
  });

  it('first says what the post is for, in the line it is made with', async () => {
    const gateway = new FakePartyGateway();
    gateway.refuseV2Starter = true;
    const seen: unknown[] = [];
    const create = gateway.createPost.bind(gateway);
    gateway.createPost = (forumId, post) => {
      seen.push(post.message);
      return create(forumId, post);
    };
    await createdMeetup({}, {}, { gateway });
    expect(seen.at(-1)).toEqual({ content: FIRST_LINE });
  });

  it('is made as it is but without its picture where Discord refuses only the picture', async () => {
    const gateway = new FakePartyGateway();
    gateway.rejectThumbnails = true;
    const made = await reportedRaid(yveltal, {}, { gateway });
    const post = made.gateway.posts.get(made.postId);
    expect(post?.message.v2).toBe(true);
    expect(post?.edits).toBe(0);
    expect(thumbnailOf(post?.message)).toBeUndefined();
    // No line of text was posted, so no stray post flashed by.
    expect(callsOf(gateway, 'createPost')).toHaveLength(2);
    expect(gateway.deletedPosts).toEqual([]);
    expect(made.entries.map((entry) => entry.msg)).toContain('forum posts are made as they are');
    // And so from then on: the next post is made without the line too.
    const meetup = await made.service.createMeetup({
      name: 'Picnic',
      creatorId: ALICE,
      regionChannelId: WEST_CHANNEL,
    });
    if (meetup.kind !== 'created') throw new Error(meetup.kind);
    expect(callsOf(gateway, 'createPost')).toHaveLength(3);
  });

  it('falls back to the line only when the post without its picture is refused too', async () => {
    const gateway = new FakePartyGateway();
    gateway.refuseV2Starter = true;
    gateway.rejectThumbnails = true;
    const made = await reportedRaid(yveltal, {}, { gateway });
    const post = made.gateway.posts.get(made.postId);
    expect(post?.message.v2).toBe(true);
    expect(thumbnailOf(post?.message)).toBeUndefined();
    expect(callsOf(gateway, 'createPost')).toHaveLength(3);
    // The line is edited into the post without the picture: nothing was taken back.
    expect(post?.edits).toBe(1);
    expect(gateway.deletedPosts).toEqual([]);
  });
});

describe('PartyService: the first message of a forum post, when an emoji is refused', () => {
  it('edits the line into the post with plain emoji, its picture kept, where Discord names the emoji', async () => {
    const gateway = new FakePartyGateway();
    gateway.refuseV2Starter = true;
    gateway.rejectCustomEmoji = true;
    const appEmoji = {
      get: (name: string) => (name === 'pinejoin' ? '<:pinejoin:1400000000000000001>' : undefined),
    };
    const made = await reportedRaid(yveltal, { appEmoji }, { gateway });
    const post = made.gateway.posts.get(made.postId);
    expect(thumbnailOf(post?.message)).toBeDefined();
    expect(JSON.stringify(post?.message)).not.toContain('pinejoin');
    // As it is, with plain emoji, bare (the first message refused as v2 each time), the line.
    expect(callsOf(gateway, 'createPost')).toHaveLength(4);
    // The edit: refused for the emoji it names, then with the plain ones at once.
    expect(callsOf(gateway, 'editPost')).toHaveLength(2);
    expect(gateway.deletedPosts).toEqual([]);
  });

  it('edits the line into the post with plain emoji at once where the first way named the emoji', async () => {
    const gateway = new FakePartyGateway();
    gateway.rejectCustomEmoji = true;
    // Discord names the emoji before it refuses a v2 first message: only the post with plain
    // emoji is refused as a first message.
    const create = gateway.createPost.bind(gateway);
    gateway.createPost = (forumId, post) => {
      gateway.refuseV2Starter = !JSON.stringify(post.message).includes('pinejoin');
      return create(forumId, post);
    };
    const appEmoji = {
      get: (name: string) => (name === 'pinejoin' ? '<:pinejoin:1400000000000000001>' : undefined),
    };
    const made = await reportedRaid(yveltal, { appEmoji }, { gateway });
    const post = made.gateway.posts.get(made.postId);
    expect(thumbnailOf(post?.message)).toBeDefined();
    expect(JSON.stringify(post?.message)).not.toContain('pinejoin');
    // As it is (the emoji named), with plain emoji, bare (refused as v2 each time), the line.
    expect(callsOf(gateway, 'createPost')).toHaveLength(4);
    // The emoji named on the first way is left out of the edit at once.
    expect(callsOf(gateway, 'editPost')).toHaveLength(1);
    expect(gateway.deletedPosts).toEqual([]);
  });
});

describe('PartyService: the first message of a forum post, when things go wrong', () => {
  it('says with Discord’s code why it makes posts with a line of text from now on', async () => {
    const gateway = new FakePartyGateway();
    gateway.refuseV2Starter = true;
    const made = await reportedRaid(yveltal, {}, { gateway });
    const switched = made.entries.find(
      (entry) => entry.msg === 'Discord refused a components-v2 first message of a forum post',
    );
    expect(switched).toMatchObject({ level: 30, code: 50035 });
  });

  it('takes an empty message as the refusal too, where Discord dropped the flag of a v2 message', async () => {
    const gateway = new FakePartyGateway();
    gateway.refuseV2Starter = 'empty';
    const made = await reportedRaid(yveltal, {}, { gateway });
    const post = made.gateway.posts.get(made.postId);
    expect(post?.message.v2).toBe(true);
    expect(post?.edits).toBe(1);
    expect(gateway.converted).toEqual([{ id: made.postId, direct: true }]);
    const switched = made.entries.find(
      (entry) => entry.msg === 'Discord refused a components-v2 first message of a forum post',
    );
    expect(switched).toMatchObject({ level: 30, code: 50006 });
  });

  it('passes an empty message on once direct posts have worked: it is the message’s own fault', async () => {
    const gateway = new FakePartyGateway();
    const made = await reportedRaid(yveltal, {}, { gateway });
    gateway.refuseV2Starter = 'empty';
    await expect(
      made.service.createMeetup({
        name: 'Picnic',
        creatorId: ALICE,
        regionChannelId: WEST_CHANNEL,
      }),
    ).rejects.toThrow('Cannot send an empty message');
    // Nothing was tried without the post's first message: no line of text was posted.
    expect(callsOf(gateway, 'createPost')).toHaveLength(2);
  });

  it('answers that the post could not be made when it went during the edit, not that there is no forum', async () => {
    const gateway = new FakePartyGateway();
    gateway.refuseV2Starter = true;
    const made = await partyServiceWith([], {}, { gateway });
    const edit = gateway.editPost.bind(gateway);
    gateway.editPost = (postId, message, options) => {
      gateway.gone.add(postId);
      return edit(postId, message, options);
    };
    const gym = gymsFixture().get(1);
    if (!gym) throw new Error('no gym 1');
    const outcome = await made.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    expect(outcome).toEqual({ kind: 'no-post' });
    expect(made.store.active()).toEqual([]);
  });

  it('names the post it could not take back, so that staff find a stray first line', async () => {
    const gateway = new FakePartyGateway();
    gateway.refuseV2Starter = true;
    gateway.textLimit = 20;
    gateway.failing.set('deletePost', new Error('Discord is down'));
    const made = await partyServiceWith([], {}, { gateway });
    const gym = gymsFixture().get(1);
    if (!gym) throw new Error('no gym 1');
    await made.service
      .reportRaid({
        gym,
        guildRow: TEST_GUILD_ROW,
        reporterId: REPORTER,
        anonymous: false,
        autoStatus: PartyStatus.Interested,
        tier: { level: 'T5', shadow: false },
        boss: { key: 'yveltal' },
      })
      .catch(() => undefined);
    const stray = made.entries.find((entry) => entry.msg === 'could not delete a lost post');
    expect(stray).toMatchObject({ level: 50 });
    expect(typeof stray?.post).toBe('string');
  });

  it('refuses a post Discord refuses for its length, on either path, and keeps no raid', async () => {
    for (const refuseV2Starter of [false, true]) {
      const gateway = new FakePartyGateway();
      gateway.refuseV2Starter = refuseV2Starter;
      gateway.textLimit = 20;
      const made = await partyServiceWith([], {}, { gateway });
      const gym = gymsFixture().get(1);
      if (!gym) throw new Error('no gym 1');
      await expect(
        made.service.reportRaid({
          gym,
          guildRow: TEST_GUILD_ROW,
          reporterId: REPORTER,
          anonymous: false,
          autoStatus: PartyStatus.Interested,
          tier: { level: 'T5', shadow: false },
          boss: null,
        }),
      ).rejects.toThrow('Invalid Form Body');
      expect(made.store.active()).toEqual([]);
      // Whatever was made on the way was taken back.
      expect(
        gateway.postsIn(WEST_FORUM).filter((post) => !gateway.deletedPosts.includes(post.id)),
      ).toHaveLength(0);
    }
  });
});
