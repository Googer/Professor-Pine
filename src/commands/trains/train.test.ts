import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import {
  ALICE,
  at,
  BOB,
  PARTY_NOW,
  testMeetup,
  testRaid,
  testTrain,
  stops,
  gym,
} from '../../../test/support/parties.js';
import { MAX_OPEN_PARTIES } from '../../domain/party/open-parties.js';
import { OPEN_PARTIES_FULL } from '../parties/open-parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { withOutline } from '../../../test/support/providers.js';
import { MemoryUsers } from '../../../test/support/users.js';
import type { AppContext } from '../../app-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { commands } from '../index.js';
import { train, TRAIN_FROM_A_REGION, TRAIN_THROTTLE } from './train.js';
import { buttonsOf, textDisplays, textOf } from '../../../test/support/messages.js';

const RAID_POST = '300000000000000055';

async function setup(overrides: Partial<AppContext> = {}) {
  const raid = { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: RAID_POST };
  const made = await partyServiceWith([raid]);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
    ...overrides,
  });
  const router = new InteractionRouter(ctx, [train], []);
  /** `/train` by Alice, in the channel of West unless `extra` says otherwise. */
  const run = async (name: string, extra: object = {}): Promise<FakeInteraction> => {
    const interaction = fakeChatInput({
      commandName: 'train',
      channelId: WEST_CHANNEL,
      userId: ALICE,
      displayName: 'Alice',
      roleNames: ['Mystic'],
      options: { name },
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** What the member was told: the edit of the deferred answer, or what came in its place. */
  const answer = async (name: string, extra: object = {}): Promise<string | undefined> => {
    const used = await run(name, extra);
    for (const responder of [used.editReply, used.followUp, used.reply]) {
      if (responder.mock.calls.length > 0) return sent(responder).content;
    }
    return undefined;
  };
  const trains = () => made.store.active().filter((party) => party.type === 'train');
  return { ...made, ctx, router, run, answer, trains };
}

describe('/train and the open trains and meetups of a member (plan 8Z)', () => {
  /** `setup` with `MAX_OPEN_PARTIES` open parties of Alice's: trains, and a meetup among them. */
  async function full() {
    const made = await setup();
    for (let n = 0; n < MAX_OPEN_PARTIES; n += 1) {
      const id = `00000000-0000-4000-8000-00000000010${n}`;
      const forumPostId = `30000000000000010${n}`;
      const open =
        n === 0 ? testMeetup({ id, createdById: ALICE }) : testTrain({ id, createdById: ALICE });
      await made.store.add({ ...open, forumChannelId: WEST_FORUM, forumPostId });
    }
    return made;
  }

  it('is refused past the cap, by a guard: nothing is made and the use does not count', async () => {
    const made = await full();
    const before = made.trains().length;
    expect(await made.answer('One more')).toBe(OPEN_PARTIES_FULL);
    expect(made.trains()).toHaveLength(before);
    expect(await made.answer('One more')).toBe(OPEN_PARTIES_FULL);
    // Past the cap for staff too would be a limit message; here it never counted.
    await made.answer('As staff', { roleNames: ['Moderator'] });
    expect(made.trains()).toHaveLength(before + 1);
  });

  it('counts per member: others are not held by it', async () => {
    const made = await full();
    await made.answer('Of Bob', { userId: BOB });
    expect(made.trains().some((party) => party.createdById === BOB)).toBe(true);
  });
});

describe('/train', () => {
  it('makes a train with its post in the forum of the region, and links to it privately', async () => {
    const made = await setup();
    const used = await made.run('  Saturday   legendaries ');
    const [party] = made.trains();
    expect(party).toMatchObject({
      type: 'train',
      regionId: 1,
      forumChannelId: WEST_FORUM,
      createdById: ALICE,
      anonymous: false,
      timed: { name: 'Saturday legendaries', startTime: null },
      train: { route: [], stop: 0, conductorId: null, boss: null },
    });
    // Who made it is interested in group A, and not its conductor.
    expect(party?.attendees).toEqual({
      [ALICE]: {
        number: 1,
        status: PartyStatus.Interested,
        group: 'A',
        remote: false,
        name: 'Alice',
        team: 'mystic',
      },
    });
    const postId = party?.forumPostId ?? '';
    const post = made.gateway.posts.get(postId);
    expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Train · Saturday legendaries' });
    // Made without a route, the post has Manage… and no Move… yet (plan 8X-G).
    expect(buttonsOf(post?.message).find((button) => button.label === 'Manage…')).toMatchObject({
      label: 'Manage…',
      customId: `party:${party?.id ?? ''}:manage`,
    });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(used.editReply).content).toBe(
      `Your train is made. Its post is <#${postId}>. There, \`/route add\` adds its stops, ` +
        '`/meet` sets when it starts, and `/conductor set` makes you its conductor.',
    );
    expect(made.gateway.messagesIn(WEST_CHANNEL).map((message) => message.message.content)).toEqual(
      [`New train: <#${postId}>`],
    );
  });

  it('works in a post of the forum that is no party, and the train belongs to that region', async () => {
    const made = await setup();
    await made.run('Harbour round', {
      channelId: '300000000000000066',
      thread: { parentId: EAST_FORUM },
    });
    expect(made.trains()[0]).toMatchObject({ regionId: 2, forumChannelId: EAST_FORUM });
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toHaveLength(1);
  });

  it('is refused in the post of a party and anywhere that is no region', async () => {
    const made = await setup();
    const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
    expect(await made.answer('Round', inPost)).toBe(TRAIN_FROM_A_REGION);
    expect(await made.answer('Round', { channelId: '600000000000000009' })).toBe(
      TRAIN_FROM_A_REGION,
    );
    expect(TRAIN_FROM_A_REGION).toBe('Create a train from a region channel.');
    expect(await made.answer('Round', { isDm: true })).toBe('This only works in a server.');
    expect(made.trains()).toEqual([]);
  });

  it('says so when the region has no forum yet', async () => {
    const made = await setup();
    // The region without a forum, given an outline: a region channel.
    const regions = withOutline(made.ctx.regions, UNBOUNDED_CHANNEL);
    const other = await setup({ regions });
    expect(await other.answer('Round', { channelId: UNBOUNDED_CHANNEL })).toBe(
      `The region <#${UNBOUNDED_CHANNEL}> has no forum yet. ` +
        'A moderator can create it with `/admin setup-forums`.',
    );
    expect(other.trains()).toEqual([]);
  });

  // Plan 8Z-2: the question the map's route asks before it starts a train (`forumBarred`).
  it('refuses a member somebody keeps out of the region’s forum, uncounted; one it is only hidden from makes it', async () => {
    const made = await setup();
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    for (let n = 0; n < 3; n++) {
      expect(await made.answer(`Loop ${String(n)}`)).toBe(
        'You cannot make a train here: you are kept out of the forum its post would be in.',
      );
    }
    expect(made.trains()).toEqual([]);
    made.gateway.barred.clear();
    made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    expect(await made.answer('Loop')).toBe(
      'I could not check with Discord just now whether you may do that. Try again in a moment.',
    );
    expect(made.trains()).toEqual([]);
    made.gateway.failing.delete('memberAccess');
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.run('Loop');
    expect(made.trains()).toHaveLength(1);
  });

  it('says plainly that the bot may not make posts in the forum, and does not count it', async () => {
    const made = await setup();
    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    for (let n = 0; n < 2; n++) {
      expect(await made.answer(`Loop ${String(n)}`)).toBe(
        `I am not allowed to make posts in <#${WEST_FORUM}>: I lack the permission Manage Posts ` +
          "there. Nothing was made. The server's staff must give it to me.",
      );
    }
    made.gateway.refusePosts.delete(WEST_FORUM);
    await made.run('First');
    await made.run('Second');
    expect(await made.answer('Third')).toMatch(/^You can use \/train again/);
    expect(made.trains()).toHaveLength(2);
  });

  it('refuses a text that is no name, and tidies what is one', async () => {
    const made = await setup();
    expect(await made.answer('   ')).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('x'.repeat(81))).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('\u200b\u200b')).toBe('Give a name of 1 to 80 characters.');
    expect(made.trains()).toEqual([]);
    await made.run('\u202eRound');
    expect(made.trains()[0]).toMatchObject({ timed: { name: 'Round' } });
  });

  it('names who made it and signs them up as interested unless they set otherwise', async () => {
    const made = await setup();
    await made.run('Round');
    const [party] = made.trains();
    expect(party?.anonymous).toBe(false);
    expect(party?.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
    const post = made.gateway.posts.get(party?.forumPostId ?? '');
    expect(textDisplays(post?.message).at(-1)).toBe(`-# Created by **Alice**`);
  });

  it('follows the privacy and the automatic status of who makes it, as a raid does', async () => {
    const users = new MemoryUsers(undefined, {
      autoStatus: PartyStatus.Present,
      raidPrivacy: RaidPrivacy.Anonymous,
    });
    const made = await setup({ users });
    const used = await made.run('Round');
    const [party] = made.trains();
    expect(party?.anonymous).toBe(true);
    expect(party?.createdById).toBe(ALICE);
    expect(party?.makerName).toBe('Alice');
    // Here on a train that is at no gym yet is Coming.
    expect(party?.attendees[ALICE]).toMatchObject({ status: PartyStatus.Coming, name: 'Alice' });
    const post = made.gateway.posts.get(party?.forumPostId ?? '');
    expect(textOf(post?.message)).not.toContain('Created by');
    // Signed up, so in the list of trainers like anybody: only "Created by" is left out.
    expect(textOf(post?.message)).toContain('🏃 Coming (1): ❄️ Alice');
    expect(sent(used.editReply).content).toBe(
      `Your train is made. Its post is <#${party?.forumPostId ?? ''}>. There, \`/route add\` ` +
        'adds its stops, `/meet` sets when it starts, and `/conductor set` makes you its conductor.',
    );
  });

  it('does not sign up a maker whose automatic status is None, and tells them', async () => {
    const users = new MemoryUsers(undefined, {
      autoStatus: PartyStatus.NotInterested,
      raidPrivacy: RaidPrivacy.Anonymous,
    });
    const made = await setup({ users });
    const used = await made.run('Round');
    const [party] = made.trains();
    expect(party?.attendees).toEqual({});
    // Kept for the sentences that name them, though the post does not.
    expect(party?.makerName).toBe('Alice');
    const post = made.gateway.posts.get(party?.forumPostId ?? '');
    expect(textOf(post?.message)).not.toContain('Alice');
    expect(textOf(post?.message)).not.toContain(ALICE);
    expect(sent(used.editReply).content).toBe(
      `Your train is made. Its post is <#${party?.forumPostId ?? ''}>. There, \`/route add\` ` +
        'adds its stops and `/meet` sets when it starts. You are not signed up for it, since ' +
        'your status in `/settings` is None: sign up in the post to move the train or to be its ' +
        'conductor.',
    );
    // And so it is: the maker lays the route and sets the start, and cannot move the train.
    const id = party?.id ?? '';
    const alice = { id: ALICE, name: 'Alice' };
    expect(await made.ctx.trains.addStop(id, alice, gym(4))).toMatchObject({ kind: 'ok' });
    expect(await made.ctx.trains.addStop(id, alice, gym(1))).toMatchObject({ kind: 'ok' });
    expect(await made.ctx.trains.addStop(id, { id: BOB, name: 'Bob' }, gym(7))).toMatchObject({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(
      await made.timed.setStartTime(id, alice, false, made.clock.now + 3_600_000),
    ).toMatchObject({
      kind: 'ok',
    });
    expect(await made.ctx.trains.move(id, alice, 'next', false)).toMatchObject({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(await made.ctx.trains.setConductor(id, alice)).toMatchObject({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(made.store.get(id)).toMatchObject({
      train: { route: stops(4, 1), stop: 0 },
      attendees: {},
    });
    // Visible and None: named, and not in the list.
    const named = await setup({
      users: new MemoryUsers(undefined, { autoStatus: PartyStatus.NotInterested }),
    });
    await named.run('Round');
    const shown = named.gateway.posts.get(named.trains()[0]?.forumPostId ?? '');
    expect(textOf(shown?.message)).toContain(`-# Created by **Alice**`);
    expect(named.trains()[0]?.attendees).toEqual({});
  });

  it('lets a member make two in a quarter of an hour, and does not count a use that made nothing', async () => {
    const made = await setup();
    expect(TRAIN_THROTTLE).toEqual({ uses: 2, perSeconds: 900 });
    const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
    expect(await made.answer('   ')).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('Round', inPost)).toBe(TRAIN_FROM_A_REGION);
    await made.run('First');
    await made.run('Second');
    expect(await made.answer('Third')).toMatch(/^You can use \/train again in 1\d minutes\.$/);
    expect(made.trains()).toHaveLength(2);
    // Another member is not held back.
    await made.run('Fourth', { userId: BOB });
    expect(made.trains()).toHaveLength(3);
  });

  it('makes a train that loops or turns back when told to, and one that finishes otherwise', async () => {
    const made = await setup();
    await made.run('Park loop', { options: { name: 'Park loop', 'at-end': 'loop' } });
    await made.run('Plain', { options: { name: 'Plain' } });
    await made.run('Both ways', {
      userId: BOB,
      options: { name: 'Both ways', 'at-end': 'turn-back' },
    });
    const modes = made.trains().map((party) => `${party.timed.name}: ${party.train.atEnd}`);
    expect(modes.sort()).toEqual(['Both ways: turn-back', 'Park loop: loop', 'Plain: finish']);
    // The option offers the three, by the names the panel's menu has.
    const option = train.data.toJSON().options?.find((found) => found.name === 'at-end');
    expect(option).toMatchObject({
      required: false,
      choices: [
        { name: 'Finish', value: 'finish' },
        { name: 'Loop', value: 'loop' },
        { name: 'Turn back', value: 'turn-back' },
      ],
    });
  });

  it('makes a train of the kind asked for: raids unless told otherwise (plan 8X-4)', async () => {
    const made = await setup();
    await made.run('Wild Area', { options: { name: 'Wild Area', kind: 'gigantamax' } });
    await made.run('Plain', { options: { name: 'Plain' } });
    const kinds = made.trains().map((party) => `${party.timed.name}: ${party.train.kind}`);
    expect(kinds.sort()).toEqual(['Plain: raid', 'Wild Area: gigantamax']);
    const wild = made.trains().find((party) => party.timed.name === 'Wild Area');
    const post = made.gateway.posts.get(wild?.forumPostId ?? '');
    expect(textDisplays(post?.message)[0]?.split('\n')[0]).toBe('### Gigantamax Train: Wild Area');
    const option = train.data.toJSON().options?.find((found) => found.name === 'kind');
    expect(option).toMatchObject({
      required: false,
      description: 'What the train is mainly for (its stops can be gyms or Power Spots)',
      choices: [
        { name: 'Raids', value: 'raid' },
        { name: 'Dynamax Battles', value: 'dynamax' },
        { name: 'Gigantamax Battles', value: 'gigantamax' },
      ],
    });
  });

  it('names no fixed date in the hint of start, nor in the help’s examples (plan 8X-G, M2)', () => {
    const option = train.data.toJSON().options?.find((found) => found.name === 'start');
    expect(option?.description).not.toMatch(/\d+-\d+/);
    expect(train.help.examples?.filter((example) => /\d+-\d+/.test(example))).toEqual([]);
    // The kind by its choice's name (plan 8X-G, item 8).
    expect(train.help.examples).toContain(
      '/train name:Wild Area kind:Gigantamax Battles start:{date} 10am',
    );
  });

  describe('start: a train planned ahead (plan 8X-4; design 6.1)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('makes the train with its start, read as /meet reads it, days ahead too', async () => {
      const made = await setup();
      const used = await made.run('Wild Area', {
        options: { name: 'Wild Area', kind: 'gigantamax', start: '10-24 2pm' },
      });
      const [party] = made.trains();
      const start = at('2026-10-24T14:00');
      expect(party?.timed.startTime).toBe(start);
      // Its route can wait until the day: it is made without one.
      expect(party?.train.route).toEqual([]);
      const post = made.gateway.posts.get(party?.forumPostId ?? '');
      expect(textDisplays(post?.message)[0]?.split('\n')[1]).toMatch(
        new RegExp(`^Starts <t:${start / 1000}:R>`),
      );
      expect(sent(used.editReply).content).toMatch(/^Your train is made\. Its post is /);
      // Its start is set: `/meet` is not offered for it (plan 8X-G, M1).
      expect(sent(used.editReply).content).toMatch(
        /There, `\/route add` adds its stops and `\/conductor set` makes you its conductor\.$/,
      );
    });

    it('refuses a start it cannot read before anything is made, and does not count it', async () => {
      const made = await setup();
      for (let n = 0; n < 3; n++) {
        expect(
          await made.answer('Round', { options: { name: 'Round', start: 'whenever' } }),
        ).toMatch(/^I could not read "whenever" as the time the train starts\./);
      }
      expect(made.trains()).toEqual([]);
      await made.run('First', { options: { name: 'First', start: 'in 30' } });
      await made.run('Second');
      expect(made.trains()).toHaveLength(2);
      expect(made.trains().find((p) => p.timed.name === 'First')?.timed.startTime).toBe(
        PARTY_NOW + 30 * 60_000,
      );
    });

    it('refuses a word that removes a time, before anything is made, uncounted', async () => {
      const made = await setup();
      for (const word of ['none', 'cancel', 'unset']) {
        expect(await made.answer('Round', { options: { name: 'Round', start: word } })).toBe(
          'A new train has no start to remove: leave `start` out.',
        );
      }
      expect(made.trains()).toEqual([]);
      await made.run('First');
      await made.run('Second');
      expect(made.trains()).toHaveLength(2);
    });

    it('makes the train with the start its guard read, though the clock went on meanwhile', async () => {
      const made = await setup();
      // Read at 13:59:30, 30 seconds before 2pm; the train is made at 14:00:30, 30 seconds after.
      vi.setSystemTime(PARTY_NOW - 30_000);
      const used = fakeChatInput({
        commandName: 'train',
        channelId: WEST_CHANNEL,
        userId: ALICE,
        displayName: 'Alice',
        options: { name: 'Round', start: '2pm' },
      });
      const defer = used.deferReply.getMockImplementation();
      used.deferReply.mockImplementation(async (...args: unknown[]) => {
        vi.setSystemTime(PARTY_NOW + 30_000);
        return defer?.(...(args as []));
      });
      await made.router.handle(used as never);
      expect(made.trains()[0]?.timed.startTime).toBe(PARTY_NOW);
    });
  });

  it('is listed with the commands under the trains, with everything a train alone has', () => {
    const filed = commands.filter((command) => command.help.category === 'train');
    expect(filed.map((command) => command.data.name).sort()).toEqual([
      'conductor',
      'finish',
      'next',
      'previous',
      'route',
      'skip',
      'train',
    ]);
    for (const command of filed) expect(command.help.details).toBeTruthy();
  });
});
