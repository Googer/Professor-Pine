import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeSelect,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  testRegions,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { ALICE, at, BOB, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { InteractionRouter, type RouterOptions } from '../../discord/router.js';
import { Throttles } from '../../discord/throttle.js';
import type { GymProvider } from '../../services/gym-directory.js';
import type { GymLookup } from '../../domain/search/gym-lookup.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { NO_POST_MADE } from '../../render/activity.js';
import { FORUM_TAGS } from '../../render/party-post.js';
import { raid, raidControls } from './raid.js';
import { REPORT_BARRED } from './report.js';

const OTHER_MEMBER = '700000000000000002';

async function setup(users?: Parameters<typeof createTestContext>[0], routing: RouterOptions = {}) {
  const made = await partyServiceWith();
  const { ctx } = createTestContext({
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    ...users,
  });
  const router = new InteractionRouter(ctx, [raid], [raidControls], routing);
  const run = async (options: Record<string, string>, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'raid',
      channelId: WEST_CHANNEL,
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, ctx, router, run, handle };
}

/** The custom id of the n-th control of the first row of a reply. */
function customId(interaction: FakeInteraction, index = 0): string {
  const row = sent(interaction.editReply).components?.[0] as {
    toJSON(): { components: { custom_id: string }[] };
  };
  return row.toJSON().components[index]?.custom_id ?? '';
}

/** What a member was told last: a follow-up, else an edit of the deferred answer, else a reply. */
function told(interaction: FakeInteraction): string | undefined {
  for (const responder of [interaction.followUp, interaction.editReply, interaction.reply]) {
    if (responder.mock.calls.length > 0) return sent(responder).content;
  }
  return undefined;
}

describe('/raid', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('notes the name and the team of the reporter with their sign-up', async () => {
    const { run, store } = await setup();
    await run({ boss: 'e:T5:0', gym: 'g:1' }, { displayName: 'Rhea', roleNames: ['Instinct'] });
    const [party] = store.active();
    expect(Object.values(party?.attendees ?? {})).toMatchObject([
      { name: 'Rhea', team: 'instinct' },
    ]);
  });

  it('reports an egg picked from the lists, with its hatch time, and links the post', async () => {
    const { run, store, gateway } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:1', time: '30' });
    const [party] = store.active();
    expect(party).toMatchObject({
      gymId: 1,
      hatchTime: at('2026-10-13T14:30'),
      raid: { tier: { level: 'T5', shadow: false }, boss: null },
      createdById: interaction.user.id,
      anonymous: false,
    });
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(sent(interaction.editReply)).toMatchObject({
      content: `Reported: T5 egg at The Stacks. Its post is <#${party?.forumPostId}>.`,
      components: [],
    });
  });

  it('hands the region channel it was used in to the report', async () => {
    const { run, service } = await setup();
    const reportRaid = vi.spyOn(service, 'reportRaid');
    await run({ boss: 'e:T5:0', gym: 'g:1' });
    expect(reportRaid).toHaveBeenCalledWith(
      expect.objectContaining({ regionChannelId: WEST_CHANNEL }),
    );
  });

  it('reports a boss typed by name at a gym typed by name, with the end time', async () => {
    const { run, store } = await setup();
    await run({ boss: 'yveltal', gym: 'stone fountain', time: 'at 2:40pm' });
    expect(store.active()[0]).toMatchObject({
      gymId: 2,
      endTime: at('2026-10-13T14:40'),
      raid: { boss: { key: 'yveltal' }, reportedHatched: true },
    });
  });

  it('says so when the gym was deleted from the gym list a moment before', async () => {
    const { run, store, gateway, gyms } = await setup();
    // The member still had the gym in their list; the services no longer have it.
    (gyms as GymLookup<Gym>).remove(2);
    const used = await run({ boss: 'yveltal', gym: 'stone fountain' });
    expect(sent(used.editReply)).toEqual({
      content:
        'Old Stone Fountain was removed from my gym list just now, so there is no raid to ' +
        'report there.',
      components: [],
    });
    expect(store.active()).toEqual([]);
    expect(gateway.posts.size).toBe(0);
  });

  it('uses the member’s settings: automatic status and anonymous reports', async () => {
    const users = new MemoryUsers(undefined, {
      autoStatus: PartyStatus.Coming,
      raidPrivacy: RaidPrivacy.Anonymous,
    });
    const { run, store } = await setup({ users });
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:1' });
    expect(store.active()[0]).toMatchObject({
      anonymous: true,
      attendees: { [interaction.user.id]: { status: PartyStatus.Coming } },
    });
  });

  it('shows the raid a gym already has and says the member was signed up', async () => {
    const { run, store, gateway } = await setup();
    await run({ boss: 'e:T5:0', gym: 'g:1' });
    const again = await run({ boss: 'e:T3:0', gym: 'g:1' }, { userId: OTHER_MEMBER });
    const [party] = store.active();
    expect(sent(again.editReply).content).toBe(
      `There is already a raid at The Stacks. Its post is <#${party?.forumPostId}>. You have been marked as interested.`,
    );
    expect(party?.attendees).toHaveProperty(OTHER_MEMBER);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    const third = await run({ boss: 'e:T5:0', gym: 'g:1' }, { userId: OTHER_MEMBER });
    expect(sent(third.editReply).content).not.toContain('You have been marked');
  });

  it('offers a menu when several gyms fit, and reports at the one chosen', async () => {
    const { run, handle, store } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'pinewood' });
    expect(sent(interaction.editReply).content).toBe(
      'Several gyms fit "pinewood". Which one do you mean?',
    );
    expect(store.active()).toEqual([]);

    const select = await handle(fakeSelect({ customId: customId(interaction), values: ['12'] }));
    expect(select.deferUpdate).toHaveBeenCalled();
    expect(store.active()[0]).toMatchObject({ gymId: 12 });
    expect(sent(select.editReply).content).toContain(
      'Reported: T5 egg at Pinewood Post Office Gym.',
    );
    // The menu works once.
    const second = await handle(fakeSelect({ customId: customId(interaction), values: ['1'] }));
    expect(sent(second.update)).toEqual({
      content: 'That choice has expired. Use `/raid` again.',
      components: [],
    });
    expect(store.active()).toHaveLength(1);
  });

  it('lets only the member who asked use the menu, and only for a gym that was offered', async () => {
    const { run, handle, store } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'pinewood' });
    const stranger = await handle(
      fakeSelect({ customId: customId(interaction), values: ['12'], userId: OTHER_MEMBER }),
    );
    expect(sent(stranger.reply).content).toBe('That is somebody else’s report.');
    const forged = await handle(fakeSelect({ customId: customId(interaction), values: ['7'] }));
    expect(sent(forged.reply).content).toBe('That gym no longer exists. Use `/raid` again.');
    expect(store.active()).toEqual([]);
  });

  it('refuses a report that would put the member in a forum they are kept out of, before counting it', async () => {
    // The Bridge (gym 4) lies in West and East.
    const base = gymsFixture();
    const gyms = Object.assign(Object.create(base) as GymProvider, {
      regionsOf: (gymId: number) =>
        gymId === 4 ? [WEST_CHANNEL, EAST_CHANNEL] : base.regionsOf(gymId),
    });
    const made = await partyServiceWith([], { gyms });
    const { ctx } = createTestContext({
      partyService: made.service,
      parties: made.store,
      regions: made.regions,
      gyms,
    });
    const throttles = new Throttles();
    const router = new InteractionRouter(ctx, [raid], [raidControls], { throttles });
    const use = async (userId: string, channelId: string, gym: string) => {
      const used = fakeChatInput({
        commandName: 'raid',
        channelId,
        userId,
        options: { boss: 'e:T5:0', gym },
      });
      await router.handle(used as never);
      return used;
    };
    // Bob reports the Bridge from East: its raid stands in East's forum.
    await use(BOB, EAST_CHANNEL, 'g:4');
    expect(made.store.active()[0]).toMatchObject({ gymId: 4, regionId: 2 });
    expect(throttles.size).toBe(1);
    made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    // West, which Alice may see, would take a new raid; but /raid would sign her up in East's.
    const refused = await use(ALICE, WEST_CHANNEL, 'g:4');
    expect(sent(refused.reply).content).toBe(REPORT_BARRED);
    expect(made.store.active()).toHaveLength(1);
    expect(made.store.active()[0]?.attendees[ALICE]).toBeUndefined();
    // So is one whose new raid would go to a forum she is kept out of.
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect(sent((await use(ALICE, WEST_CHANNEL, 'g:1')).reply).content).toBe(REPORT_BARRED);
    expect(made.store.active()).toHaveLength(1);
    // Neither was counted against /raid's limit.
    expect(throttles.size).toBe(1);
  });

  // Review 8E-2 of plan 8E: the forum asked about is that of the raid that stands at the gym.
  it('lets a report through past a raid in a barred forum that is over by the clock', async () => {
    // The Bridge (gym 4) lies in West and East.
    const base = gymsFixture();
    const gyms = Object.assign(Object.create(base) as GymProvider, {
      regionsOf: (gymId: number) =>
        gymId === 4 ? [WEST_CHANNEL, EAST_CHANNEL] : base.regionsOf(gymId),
    });
    const made = await partyServiceWith([], { gyms });
    const { ctx } = createTestContext({
      partyService: made.service,
      parties: made.store,
      regions: made.regions,
      gyms,
    });
    const router = new InteractionRouter(ctx, [raid], [raidControls]);
    const use = async (userId: string, channelId: string) => {
      const used = fakeChatInput({
        commandName: 'raid',
        channelId,
        userId,
        options: { boss: 'e:T5:0', gym: 'g:4', time: '30' },
      });
      await router.handle(used as never);
      return used;
    };
    // Bob's egg in East's forum hatches at 14:30 and is over by 15:15; it is still active.
    await use(BOB, EAST_CHANNEL);
    made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    vi.setSystemTime(at('2026-10-13T15:20'));
    made.clock.now = Date.now();
    const used = await use(ALICE, WEST_CHANNEL);
    expect(told(used)).toMatch(/^Reported: T5 egg at /);
    expect(made.store.active()).toMatchObject([
      { gymId: 4, regionId: 2 },
      { gymId: 4, regionId: 1, hatchTime: at('2026-10-13T15:50') },
    ]);
  });

  it('refuses to join a raid reported in a forum the member is kept out of after the check', async () => {
    // The Bridge (gym 4) lies in West and East; Alice is kept out of East's forum.
    const base = gymsFixture();
    const gyms = Object.assign(Object.create(base) as GymProvider, {
      regionsOf: (gymId: number) =>
        gymId === 4 ? [WEST_CHANNEL, EAST_CHANNEL] : base.regionsOf(gymId),
    });
    const made = await partyServiceWith([], { gyms });
    made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const users = new MemoryUsers();
    const { ctx } = createTestContext({
      partyService: made.service,
      parties: made.store,
      regions: made.regions,
      gyms,
      users,
    });
    // Bob reports the Bridge from East after Alice's checks passed, before her report is made.
    const settingsOf = users.get.bind(users);
    users.get = async (userId) => {
      if (userId === ALICE && made.store.active().length === 0) {
        await made.service.reportRaid({
          gym: base.get(4)!,
          reporterId: BOB,
          anonymous: false,
          autoStatus: PartyStatus.Interested,
          tier: { level: 'T5', shadow: false },
          boss: null,
          regionChannelId: EAST_CHANNEL,
        });
      }
      return settingsOf(userId);
    };
    const router = new InteractionRouter(ctx, [raid], [raidControls], {});
    const used = fakeChatInput({
      commandName: 'raid',
      channelId: WEST_CHANNEL,
      userId: ALICE,
      options: { boss: 'e:T5:0', gym: 'g:4' },
    });
    await router.handle(used as never);
    expect(made.store.active()).toHaveLength(1);
    expect(made.store.active()[0]).toMatchObject({ gymId: 4, regionId: 2 });
    expect(made.store.active()[0]?.attendees[ALICE]).toBeUndefined();
    expect(JSON.stringify(used.editReply.mock.calls)).toContain(REPORT_BARRED);
  });

  it('refuses a gym chosen from the menu whose forum the member is kept out of', async () => {
    const { run, handle, store, gateway } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'pinewood' });
    gateway.barred.set(WEST_FORUM, new Set([interaction.user.id]));
    const select = await handle(fakeSelect({ customId: customId(interaction), values: ['12'] }));
    expect(sent(select.editReply).content).toBe('Nothing was reported.');
    expect(JSON.stringify(select.followUp.mock.calls)).toContain(REPORT_BARRED);
    expect(store.active()).toEqual([]);
  });

  it('asks before reporting at a gym of another region, and reports there on yes', async () => {
    const { run, handle, store, gateway } = await setup();
    // Gym 7 lies in East; the command is used in West.
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:7' });
    expect(sent(interaction.editReply).content).toMatch(
      /^Harbor Lighthouse Mural is in <#\d+>, not in this region\. Report the raid there\?$/,
    );
    expect(store.active()).toEqual([]);
    const yes = await handle(fakeButton({ customId: customId(interaction, 0) }));
    expect(store.active()[0]).toMatchObject({ gymId: 7, regionId: 2 });
    expect(gateway.postsIn(EAST_FORUM)).toHaveLength(1);
    expect(sent(yes.editReply).content).toContain('Reported: T5 egg at Harbor Lighthouse Mural.');
  });

  it('refuses "Report it there" when the member was kept out of that forum since the question', async () => {
    const { run, handle, store, gateway } = await setup();
    // Gym 7 lies in East; the command is used in West.
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:7' });
    expect(sent(interaction.editReply).content).toMatch(/Report the raid there\?$/);
    gateway.barred.set(EAST_FORUM, new Set([interaction.user.id]));
    const yes = await handle(fakeButton({ customId: customId(interaction, 0) }));
    expect(sent(yes.editReply).content).toBe('Nothing was reported.');
    expect(JSON.stringify(yes.followUp.mock.calls)).toContain(REPORT_BARRED);
    expect(store.active()).toEqual([]);
    expect(gateway.postsIn(EAST_FORUM)).toHaveLength(0);
  });

  it('reports nothing on cancel', async () => {
    const { run, handle, store } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:7' });
    const no = await handle(fakeButton({ customId: customId(interaction, 1) }));
    expect(sent(no.update)).toEqual({ content: 'Nothing was reported.', components: [] });
    expect(store.active()).toEqual([]);
  });

  it('refuses what it cannot read before anything is created', async () => {
    const { run, store } = await setup();
    const text = async (options: Record<string, string>) => {
      const interaction = await run(options);
      return sent(interaction.followUp).content;
    };
    expect(await text({ boss: 'mewtwo', gym: 'g:1' })).toContain('is not on the current boss list');
    expect(await text({ boss: 'e:T5:0', gym: 'zzzzzz' })).toBe(
      'I found no gym for "zzzzzz". Type part of its name and pick it from the list.',
    );
    expect(await text({ boss: 'e:T5:0', gym: 'g:1', time: 'soon' })).toContain(
      'I could not read "soon"',
    );
    expect(store.active()).toEqual([]);
  });

  // Review 8E-1: a timeless Elite egg would stand a day at its gym and block every report there.
  it('refuses an Elite egg without its hatch time, and reports one with it', async () => {
    const { run, store } = await setup();
    const refused = await run({ boss: 'e:Elite:0', gym: 'g:1' });
    expect(sent(refused.followUp).content).toBe(
      'An Elite egg shows when it hatches: give its hatch time, in minutes from now (`20`) or as a clock time (`6:15pm`).',
    );
    expect(store.active()).toEqual([]);
    await run({ boss: 'e:Elite:0', gym: 'g:1', time: '6:15pm' });
    expect(store.active()).toMatchObject([
      { gymId: 1, hatchTime: at('2026-10-13T18:15'), raid: { tier: { level: 'Elite' } } },
    ]);
  });

  it('says so when the region has no forum', async () => {
    const { run, regions } = await setup();
    const west = regions.rows[0];
    if (west) west.forumChannelId = null;
    const noForum = await run({ boss: 'e:T5:0', gym: 'g:1' });
    expect(sent(noForum.editReply).content).toBe(
      `The region <#${WEST_CHANNEL}> has no raid forum yet. A moderator can create it with \`/admin setup-forums\`.`,
    );
  });

  it('says plainly when the bot may not make posts in the forum, and does not count it', async () => {
    const { run, gateway, store } = await setup();
    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    // More than the twenty a quarter of an hour: none of them counted.
    for (let n = 0; n < 21; n++) {
      const refused = await run({ boss: 'e:T5:0', gym: 'g:1' });
      // Said once, in the answer itself: no second answer below it.
      expect(sent(refused.editReply).content).toBe(
        `I am not allowed to make posts in <#${WEST_FORUM}>: I lack the permission Manage ` +
          "Posts there. Nothing was made. The server's staff must give it to me.",
      );
      expect(refused.followUp).not.toHaveBeenCalled();
    }
    gateway.refusePosts.delete(WEST_FORUM);
    const made = await run({ boss: 'e:T5:0', gym: 'g:1' });
    expect(sent(made.editReply).content).toMatch(/^Reported: T5 egg at /);
    expect(store.active()).toHaveLength(1);
  });

  it('does not count a report from the gym menu whose post the bot may not make', async () => {
    const { run, handle, gateway } = await setup();
    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    for (let n = 0; n < 21; n++) {
      const asked = await run({ boss: 'e:T5:0', gym: 'pinewood' });
      expect(told(asked)).toBe('Several gyms fit "pinewood". Which one do you mean?');
      const picked = await handle(fakeSelect({ customId: customId(asked), values: ['12'] }));
      // The menu's message says it in place of the menu; nothing is said twice.
      expect(sent(picked.editReply)).toEqual({
        content: expect.stringMatching(/^I am not allowed to make posts in /) as unknown,
        components: [],
      });
      expect(picked.followUp).not.toHaveBeenCalled();
    }
  });

  it('gives a menu’s use back by when the router counted it, never to a later window', async () => {
    // The router's clock runs an hour behind the one the handlers read.
    let routerNow = PARTY_NOW - 60 * 60_000;
    const { run, handle, gateway } = await setup(undefined, { now: () => routerNow });
    const asked = await run({ boss: 'e:T5:0', gym: 'pinewood' });
    routerNow += 16 * 60_000;
    // A new window, full: twenty reports at a gym with a raid already.
    for (let n = 0; n < 20; n++) await run({ boss: 'e:T5:0', gym: 'g:1' });
    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    await handle(fakeSelect({ customId: customId(asked), values: ['12'] }));
    // Counted in the window that closed: nothing goes back to the new one.
    expect(sent((await run({ boss: 'e:T5:0', gym: 'g:1' })).reply).content).toMatch(
      /^You can use \/raid again in /,
    );
  });

  it('does not count a report whose post was lost while it was made', async () => {
    const { run, gateway, store } = await setup();
    gateway.losePosts = true;
    for (let n = 0; n < 21; n++) {
      const lost = await run({ boss: 'e:T5:0', gym: 'g:1' });
      expect(sent(lost.editReply).content).toBe(NO_POST_MADE);
      expect(lost.followUp).not.toHaveBeenCalled();
    }
    gateway.losePosts = false;
    expect(sent((await run({ boss: 'e:T5:0', gym: 'g:1' })).editReply).content).toMatch(
      /^Reported: T5 egg at /,
    );
    expect(store.active()).toHaveLength(1);
  });

  it('says so when the gym lies in no region', async () => {
    const { run, store } = await setup();
    // Gym 10 lies in no region.
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:10' });
    expect(sent(interaction.editReply).content).toBe(
      'Lakeview Trailhead is not in any region of this server, so I have nowhere to post the raid.',
    );
    expect(store.active()).toEqual([]);
  });

  it('says the raid was reported, without a link, when its party has no post', async () => {
    const { run, service } = await setup();
    vi.spyOn(service, 'reportRaid').mockResolvedValue({ kind: 'created', party: testRaid() });
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:1' });
    expect(sent(interaction.editReply).content).toBe('Reported: T5 egg at The Stacks.');
  });

  it('shows the generic private error when reporting fails, and the menu is then used up', async () => {
    const { run, handle, service, store } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'pinewood' });
    vi.spyOn(service, 'reportRaid').mockRejectedValue(new Error('boom'));
    const select = await handle(fakeSelect({ customId: customId(interaction), values: ['12'] }));
    const error = sent(select.followUp);
    expect(error.content).toMatch(/^Something went wrong \(ref `[0-9a-f]{6}`\)\.$/);
    expect(error.flags).toBe(64);
    const again = await handle(fakeSelect({ customId: customId(interaction), values: ['12'] }));
    expect(sent(again.update).content).toBe('That choice has expired. Use `/raid` again.');
    expect(store.active()).toEqual([]);
  });

  it('describes the gyms of the menu by nickname, other region and description', async () => {
    const { run } = await setup();
    const options = async (gym: string) => {
      const interaction = await run(
        { boss: 'e:T5:0', gym },
        { guildChannelNames: { [EAST_CHANNEL]: 'east' } },
      );
      const row = sent(interaction.editReply).components?.[0] as {
        toJSON(): { components: { options: { value: string; description?: string }[] }[] };
      };
      return (row.toJSON().components[0]?.options ?? []).map((option) => [
        option.value,
        option.description,
      ]);
    };
    // Both gyms lie in West, where the command is used.
    expect(await options('pinewood')).toEqual(
      expect.arrayContaining([
        ['1', 'The Stacks · Mural of readers beside the front doors'],
        ['12', undefined],
      ]),
    );
    // Gym 7 lies in East, just over the border.
    expect(await options('lighthose')).toEqual([['7', 'east']]);
  });

  it('asks for the one gym that is a likely misspelling', async () => {
    const { run } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'fountian' });
    expect(sent(interaction.editReply).content).toBe('Did you mean this gym?');
  });

  it('goes from the menu to the confirmation for a gym of another region, each step its own', async () => {
    const { run, handle, store, gateway } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'lighthose' });
    const menuToken = customId(interaction);
    // Gym 7 lies in East; the command is used in West.
    const select = await handle(fakeSelect({ customId: menuToken, values: ['7'] }));
    expect(sent(select.editReply).content).toMatch(
      /^Harbor Lighthouse Mural is in <#\d+>, not in this region\. Report the raid there\?$/,
    );
    expect(store.active()).toEqual([]);
    expect(customId(select, 0)).not.toBe(menuToken);
    // The menu is used up; the confirmation has its own token.
    const menuAgain = await handle(fakeSelect({ customId: menuToken, values: ['7'] }));
    expect(sent(menuAgain.update).content).toBe('That choice has expired. Use `/raid` again.');
    const yes = await handle(fakeButton({ customId: customId(select, 0) }));
    expect(store.active()[0]).toMatchObject({ gymId: 7, regionId: 2 });
    expect(gateway.postsIn(EAST_FORUM)).toHaveLength(1);
    expect(sent(yes.editReply).content).toContain('Reported: T5 egg at Harbor Lighthouse Mural.');
  });

  it('says the confirmation has expired when the button is pressed too late', async () => {
    const { run, handle, store } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:7' });
    vi.setSystemTime(PARTY_NOW + 11 * 60_000);
    const yes = await handle(fakeButton({ customId: customId(interaction, 0) }));
    expect(sent(yes.update)).toEqual({
      content: 'That choice has expired. Use `/raid` again.',
      components: [],
    });
    expect(store.active()).toEqual([]);
  });

  it('works from the region’s forum and its posts, and not elsewhere', async () => {
    const { run, store } = await setup();
    await run(
      { boss: 'e:T5:0', gym: 'g:1' },
      { channelId: undefined, thread: { parentId: WEST_FORUM } },
    );
    expect(store.active()).toHaveLength(1);
    const elsewhere = await run(
      { boss: 'e:T5:0', gym: 'g:2' },
      { channelId: '600000000000000009' },
    );
    expect(sent(elsewhere.reply).content).toBe('Use this in a region channel.');
    expect(store.active()).toHaveLength(1);
  });

  it('counts every use against the twenty in a quarter of an hour, the ones that failed too', async () => {
    const { run } = await setup();
    for (let n = 0; n < 20; n++) await run({ boss: 'e:T5:0', gym: 'zzzzzz' });
    const refused = await run({ boss: 'e:T5:0', gym: 'g:1' });
    expect(sent(refused.reply).content).toMatch(/^You can use \/raid again in /);
  });
});

describe('/raid after an error behind a control', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the gym menu when reporting fails after the choice', async () => {
    const { run, handle, service } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'pinewood' });
    vi.spyOn(service, 'reportRaid').mockRejectedValue(new Error('boom'));
    const select = await handle(fakeSelect({ customId: customId(interaction), values: ['12'] }));
    expect(sent(select.editReply)).toEqual({ content: 'Nothing was reported.', components: [] });
    expect(sent(select.followUp).content).toMatch(/^Something went wrong \(ref `[0-9a-f]{6}`\)\.$/);
  });

  it('clears the confirmation when reporting fails after the yes', async () => {
    const { run, handle, service } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:7' });
    vi.spyOn(service, 'reportRaid').mockRejectedValue(new Error('boom'));
    const yes = await handle(fakeButton({ customId: customId(interaction, 0) }));
    expect(sent(yes.editReply)).toEqual({ content: 'Nothing was reported.', components: [] });
    expect(sent(yes.followUp).content).toMatch(/^Something went wrong/);
  });

  it('still shows the error when the message cannot be edited either', async () => {
    const { run, handle, service } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:7' });
    vi.spyOn(service, 'reportRaid').mockRejectedValue(new Error('boom'));
    const button = fakeButton({ customId: customId(interaction, 0) });
    button.editReply.mockRejectedValue(new Error('Unknown Message'));
    const yes = await handle(button);
    expect(sent(yes.followUp).content).toMatch(/^Something went wrong/);
  });
});

describe('/raid confirmation names the region the raid would go to', () => {
  const OTHER_CHANNEL = '100000000000000031';
  const OTHER_FORUM = '100000000000000032';

  async function overlapping(regionsOf: string[], noForumInWest = false) {
    const real = gymsFixture();
    const gyms = new Proxy(real, {
      get(target, property) {
        if (property === 'regionsOf')
          return (id: number) => (id === 7 ? regionsOf : target.regionsOf(id));
        const value: unknown = Reflect.get(target, property);
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
      },
    });
    const made = await partyServiceWith([], { gyms });
    made.gateway.addForum(OTHER_FORUM, FORUM_TAGS);
    const [west] = testRegions();
    const used = made.regions.rows[0];
    if (noForumInWest && used) used.forumChannelId = null;
    made.regions.rows.push({
      ...west!,
      id: 5,
      guildId: 2,
      channelId: OTHER_CHANNEL,
      forumChannelId: OTHER_FORUM,
    });
    const { ctx } = createTestContext({
      partyService: made.service,
      parties: made.store,
      regions: made.regions,
      gyms,
    });
    const router = new InteractionRouter(ctx, [raid], [raidControls]);
    const interaction = fakeChatInput({
      commandName: 'raid',
      channelId: WEST_CHANNEL,
      options: { boss: 'e:T5:0', gym: 'g:7' },
    });
    await router.handle(interaction as never);
    return { ...made, interaction };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is the region of this server, not the first region the gym lies in', async () => {
    const { interaction } = await overlapping([OTHER_CHANNEL, EAST_CHANNEL]);
    expect(sent(interaction.editReply).content).toBe(
      `Harbor Lighthouse Mural is in <#${EAST_CHANNEL}>, not in this region. Report the raid there?`,
    );
  });

  it('says that this region has no raid forum when the gym lies here and the raid goes elsewhere', async () => {
    const { interaction } = await overlapping([WEST_CHANNEL, EAST_CHANNEL], true);
    expect(sent(interaction.editReply).content).toBe(
      `Harbor Lighthouse Mural will be posted in <#${EAST_CHANNEL}> (this region has no raid forum). Report it there?`,
    );
  });

  it('answers that there is no region at once when the gym lies only in other servers', async () => {
    const { interaction, store } = await overlapping([OTHER_CHANNEL]);
    expect(sent(interaction.editReply)).toEqual({
      content:
        'Harbor Lighthouse Mural is not in any region of this server, so I have nowhere to post the raid.',
      components: [],
    });
    expect(store.active()).toEqual([]);
  });
});

describe('/raid autocomplete', () => {
  it('lists bosses and eggs for the boss option', async () => {
    const { router } = await setup();
    const interaction = fakeAutocomplete({
      commandName: 'raid',
      channelId: WEST_CHANNEL,
      focusedName: 'boss',
      focused: 'yve',
    });
    await router.handle(interaction as never);
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Yveltal (T5)', value: 'b:yveltal:T5:0' },
    ]);
  });

  it('lists the gyms of the region for the gym option, also from a post of its forum', async () => {
    const { router } = await setup();
    const interaction = fakeAutocomplete({
      commandName: 'raid',
      thread: { parentId: WEST_FORUM },
      focusedName: 'gym',
      focused: 'libr',
    });
    await router.handle(interaction as never);
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
    ]);
  });
});
