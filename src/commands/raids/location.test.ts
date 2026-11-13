import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { dialogChoices, dialogText, shownDialog } from '../../../test/support/dialogs.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  OTHER_GUILD_ID,
  OTHER_GUILD_ROW,
  TEST_GUILD_ROW,
  WEST_CHANNEL,
  WEST_FORUM,
  WIDE_CHANNEL,
  wideRegion,
} from '../../../test/support/gyms.js';
import { ALICE, BOB, PARTY_NOW } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import {
  gymsFixture,
  THEIR_GYM,
  twoServerGyms,
  type TestGyms,
} from '../../../test/support/providers.js';
import type { AppContext } from '../../app-context.js';
import { FORUM_TAGS } from '../../render/party-post.js';
import type { GymProvider } from '../../services/gym-directory.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { components } from '../../components/index.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import type { RaidReport } from '../../services/party-service.js';
import { CHANGE_THROTTLE } from './change.js';
import { location, locationControls } from './location.js';

beforeEach(() => {
  // The handler reads the clock itself (whether the other gym's raid is still on): without
  // this the tests depend on the day they run. The fake gateway needs the real timers.
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup(
  report: Partial<RaidReport> = {},
  gyms?: GymProvider,
  guilds?: AppContext['guilds'],
) {
  const made = await reportedRaid(report, gyms ? { gyms } : {});
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
    ...(gyms ? { gyms } : {}),
    ...(guilds ? { guilds } : {}),
  });
  const router = new InteractionRouter(ctx, [location], [locationControls]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const where = {
    channelId: made.postId,
    thread: { parentId: WEST_FORUM },
    guildChannelNames: { [EAST_CHANNEL]: 'east' },
  };
  const run = (options: Record<string, string> = {}, extra = {}) =>
    handle(
      fakeChatInput({
        commandName: 'location',
        ...where,
        userId: ALICE,
        displayName: 'Alice',
        options,
        ...extra,
      }),
    );
  const answer = async (options?: Record<string, string>) =>
    sent((await run(options)).reply).content;
  /** The Submit of the dialog a use of the command opened, by Alice. */
  const submit = (asked: FakeInteraction, extra = {}) => {
    const dialog = shownDialog(asked);
    return handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        ...where,
        userId: ALICE,
        displayName: 'Alice',
        ...extra,
      }),
    );
  };
  /** The choices offered while typing the gym. */
  const offered = async (focused: string) => {
    const interaction = await handle(
      fakeAutocomplete({
        commandName: 'location',
        ...where,
        focusedName: 'gym',
        focused,
        guildChannelNames: { [EAST_CHANNEL]: 'east' },
      }),
    );
    return interaction.respond.mock.calls[0]?.[0];
  };
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { ...made, ctx, handle, run, answer, submit, offered, lines };
}

async function raidAt(
  made: Awaited<ReturnType<typeof setup>>,
  gymId: number,
  tier: RaidReport['tier'] = { level: 'T5', shadow: false },
) {
  const gym = gymsFixture().get(gymId);
  if (!gym) throw new Error('no gym');
  const other = await made.service.reportRaid({
    gym,
    guildRow: TEST_GUILD_ROW,
    reporterId: BOB,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier,
    boss: null,
  });
  if (other.kind !== 'created') throw new Error(other.kind);
  return other.party;
}

describe('/location in two servers whose regions overlap (plan 19B-2)', () => {
  it('neither offers, accepts nor names the other server’s gym in a region of both', async () => {
    const two = twoServerGyms();
    const made = await setup({}, two.gyms, two.guilds);
    expect(JSON.stringify(await made.offered('fountain'))).not.toContain('Stone Fountain');
    const refused = (await made.answer({ gym: 'g:2' })) ?? '';
    expect(refused).not.toContain('Stone Fountain');
    expect(made.current().gymId).toBe(1);
    // Its own gym is offered and taken.
    expect(JSON.stringify(await made.offered('starbucks'))).toContain('Starbucks');
    expect(await made.answer({ gym: 'g:5' })).toBe('This raid is now at Starbucks.');

    // A raid of the other server, in its region Wide (given a forum here), at its gym.
    const WIDE_FORUM = '100000000000000061';
    made.regions.rows.push({ ...wideRegion(), forumChannelId: WIDE_FORUM });
    made.gateway.addForum(WIDE_FORUM, FORUM_TAGS);
    const theirs = await made.service.reportRaid({
      gym: two.gyms.stored(THEIR_GYM)!,
      guildRow: OTHER_GUILD_ROW,
      regionChannelId: WIDE_CHANNEL,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (theirs.kind !== 'created') throw new Error(theirs.kind);
    const inTheirPost = {
      guildId: OTHER_GUILD_ID,
      channelId: theirs.party.forumPostId ?? '',
      thread: { parentId: WIDE_FORUM },
    };
    const offeredThere = async (focused: string) =>
      JSON.stringify(
        (
          await made.handle(
            fakeAutocomplete({
              commandName: 'location',
              ...inTheirPost,
              focusedName: 'gym',
              focused,
            }),
          )
        ).respond.mock.calls[0]?.[0],
      );
    // From the other server: its gym, and not this server's.
    expect(await offeredThere('fountain')).toContain('Old Stone Fountain');
    expect(await offeredThere('library')).not.toContain('Pinewood Public Library');
    const moving = await made.run({ gym: 'g:1' }, inTheirPost);
    expect(sent(moving.reply).content).toBe(
      'I found no gym for "g:1". Type part of its name and pick it from the list.',
    );
    expect(made.store.get(theirs.party.id)?.gymId).toBe(THEIR_GYM);
  });
});

describe('/location', () => {
  it('moves the raid to another gym of the region', async () => {
    const made = await setup();
    expect(await made.answer({ gym: 'g:2' })).toBe('This raid is now at Old Stone Fountain.');
    expect(made.current().gymId).toBe(2);
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) moved this raid to **Old Stone Fountain**.`,
    ]);
    expect(await made.answer({ gym: 'fountain' })).toBe(
      'This raid is at Old Stone Fountain already.',
    );
  });

  it('refuses a gym that lies in no region, and a gym that has a raid, with its post', async () => {
    const made = await setup();
    expect(await made.answer({ gym: 'g:10' })).toMatch(
      /^That gym is not in a region of this server that has a raid forum/,
    );
    const other = await raidAt(made, 2);
    expect(await made.answer({ gym: 'g:2' })).toBe(
      `That gym already has a raid. Its post is <#${other.forumPostId ?? ''}>.`,
    );
    expect(made.current().gymId).toBe(1);
  });

  it('asks for a pick when the text fits several gyms or none', async () => {
    const made = await setup();
    expect(await made.answer({ gym: 'pinewood' })).toMatch(
      /^Several gyms fit "pinewood" \(.+…\)\. Pick one from the list\.$/,
    );
    expect(made.current().gymId).toBe(1);
    expect(await made.answer({ gym: 'starbucks maple' })).toBe('This raid is now at Starbucks.');
    expect(made.current().gymId).toBe(5);
    expect(await made.answer({ gym: 'qqqqqq' })).toBe(
      'I found no gym for "qqqqqq". Type part of its name and pick it from the list.',
    );
  });

  it('offers the gyms of the region while typing, and those just across the border with their region', async () => {
    const made = await setup();
    expect((await made.offered('fount'))?.[0]).toEqual({
      name: 'Old Stone Fountain',
      value: 'g:2',
    });
    expect(await made.offered('lighthouse')).toEqual([
      { name: 'Harbor Lighthouse Mural · east', value: 'g:7' },
    ]);
    // A gym the raid cannot move to is not offered: East has no forum any more.
    const east = made.regions.byId(2);
    if (!east) throw new Error('no region East');
    east.forumChannelId = null;
    expect(await made.offered('lighthouse')).toEqual([]);
  });
});

describe('/location to a gym of another region', () => {
  it('asks first in a dialog, and changes nothing yet', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'lighthouse' });
    expect(asked.reply).not.toHaveBeenCalled();
    const dialog = shownDialog(asked);
    // The gym, and when the use of `/location` was counted (for `carriesOn`, plan 8S-4).
    expect(dialog.custom_id).toBe(`location:${made.party.id}:move:7:${String(PARTY_NOW)}`);
    expect(dialog.title).toBe('Move the raid to another region');
    // The region's channel is named in a dialog, not mentioned.
    expect(dialogText(dialog)).toBe(
      'Harbor Lighthouse Mural is in #east, not in this region. Moving the raid there gives it ' +
        'a new post in the raid forum of that region, with everybody who is signed up, and ' +
        'closes this one. Move it?\n\nSubmit moves it.',
    );
    expect(dialogChoices(dialog)).toEqual([]);
    expect(made.current().gymId).toBe(1);
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
  });

  it('moves the raid on Submit and answers privately with the new post before the old one is closed', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'g:7' });
    const submitted = await made.submit(asked);
    await made.attendance.flush();
    await made.service.flush();
    const [party] = made.store.active();
    expect(party).toMatchObject({ gymId: 7, regionId: 2 });
    expect(party?.id).not.toBe(made.party.id);
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(submitted.editReply).toHaveBeenCalledTimes(1);
    expect(sent(submitted.editReply)).toEqual({
      content: `This raid is now at Harbor Lighthouse Mural. Its new post is <#${party?.forumPostId ?? ''}>.`,
    });
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
    expect(
      made.gateway.messagesIn(party?.forumPostId ?? '').map((message) => message.message.content),
    ).toEqual([
      `**Alice** (<@${ALICE}>) moved this raid here from **The Stacks** in <#100000000000000001>.`,
    ]);
    // A second Submit of the same dialog finds the raid moved: its old self is over.
    expect(sent((await made.submit(asked)).editReply).content).toBe('This raid is over.');
  });

  // The audit of 2026-11-10 (D15): a member kept out of the other region's forum could move a
  // raid into it, and was signed up there with everybody else.
  it('refuses a member who is kept out of the other region’s forum, without a dialog', async () => {
    const made = await setup();
    made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const refused = await made.run({ gym: 'g:7' });
    expect(refused.showModal).not.toHaveBeenCalled();
    expect(sent(refused.reply).content).toBe(
      'You cannot move this raid there: you are kept out of the forum of that region.',
    );
    expect(made.current().gymId).toBe(1);
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    // Within their own region they move it as before.
    expect(await made.answer({ gym: 'g:2' })).toBe('This raid is now at Old Stone Fountain.');
  });

  it('refuses the Submit of a member kept out of that forum since the dialog opened', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'g:7' });
    made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const submitted = await made.submit(asked);
    expect(sent(submitted.editReply).content).toBe(
      'Nothing was moved. You cannot move this raid there: you are kept out of the forum of that region.',
    );
    expect(made.current()).toMatchObject({ id: made.party.id, gymId: 1 });
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
  });

  it('moves it for a member whom that forum is only hidden from, and refuses while Discord cannot say', async () => {
    const made = await setup();
    made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const unknown = await made.run({ gym: 'g:7' });
    expect(unknown.showModal).not.toHaveBeenCalled();
    expect(sent(unknown.reply).content).toBe(
      'I could not check with Discord just now whether you may do that. Try again in a moment.',
    );
    made.gateway.failing.delete('memberAccess');
    made.gateway.shutOut(EAST_FORUM, ALICE);
    const asked = await made.run({ gym: 'g:7' });
    await made.submit(asked);
    expect(made.store.active()[0]).toMatchObject({ gymId: 7, regionId: 2 });
  });

  // Plan 8E: taken by a raid of any kind, here an elite raid for a standard one.
  it('refuses a move to a taken gym of another region without a dialog', async () => {
    const made = await setup();
    const other = await raidAt(made, 7, { level: 'Elite', shadow: false });
    const refused = await made.run({ gym: 'g:7' });
    expect(refused.showModal).not.toHaveBeenCalled();
    expect(sent(refused.reply)).toMatchObject({
      content: `That gym already has a raid. Its post is <#${other.forumPostId ?? ''}>.`,
    });
  });

  it('says why nothing moved when that gym got a raid meanwhile, or the raid has ended', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'g:7' });
    const other = await raidAt(made, 7);
    const taken = await made.submit(asked);
    expect(sent(taken.editReply)).toEqual({
      content:
        'Nothing was moved. That gym already has a raid. ' +
        `Its post is <#${other.forumPostId ?? ''}>.`,
    });
    expect(made.current().gymId).toBe(1);

    const again = await made.run({ gym: 'g:8' });
    await made.service.end(made.party.id);
    const over = await made.submit(again);
    expect(sent(over.editReply).content).toBe('This raid is over.');
  });

  it('says so when the gym is gone by Submit', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'g:7' });
    (made.ctx.gyms as TestGyms).remove(7);
    expect(sent((await made.submit(asked)).editReply).content).toBe('That gym no longer exists.');
    expect(made.current().gymId).toBe(1);
  });

  it('says what the bot lacks in the other region’s forum when it may not post there', async () => {
    const made = await setup();
    made.gateway.refusePosts.set(EAST_FORUM, ['Create Posts', 'Manage Posts']);
    const submitted = await made.submit(await made.run({ gym: 'g:7' }));
    expect(sent(submitted.editReply).content).toBe(
      `Nothing was moved. I am not allowed to make posts in <#${EAST_FORUM}>, the other ` +
        "region's forum: I lack the permissions Create Posts and Manage Posts there. The " +
        "server's staff must give them to me. The raid stays here.",
    );
    made.gateway.refusePosts.set(EAST_FORUM, []);
    const again = await made.submit(await made.run({ gym: 'g:7' }));
    expect(sent(again.editReply).content).toBe(
      `Nothing was moved. Discord does not let me make posts in <#${EAST_FORUM}>, the other ` +
        "region's forum. The server's staff must check that I have View Channel, Create Posts, " +
        'Send Messages in Posts and Manage Posts there. The raid stays here.',
    );
    expect(made.current().gymId).toBe(1);
  });

  it.each([
    ['the other forum refused', 'I am not allowed to make posts'],
    ['whose post went while it was made', 'I could not make the post in the other region'],
  ])('counts no Submit %s: none of the member’s doing', async (_, said) => {
    const made = await setup();
    if (said.startsWith('I am')) made.gateway.refusePosts.set(EAST_FORUM, ['Manage Posts']);
    // A post deleted the moment it was made: the fake cannot lose one once direct posts work.
    else
      vi.spyOn(made.raids, 'setGym').mockResolvedValue({
        kind: 'refused',
        reason: 'post-not-made',
      });
    const first = await made.run({ gym: 'g:7' });
    for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
      const submitted = await made.submit(n === 0 ? first : await made.run({ gym: 'g:7' }));
      expect(sent(submitted.editReply).content).toContain(`Nothing was moved. ${said}`);
      // Said in the answer, once.
      expect(submitted.followUp).not.toHaveBeenCalled();
    }
    // One Submit more than a minute allows: no limit hit, since none counted.
    const late = await made.submit(first);
    expect(sent(late.editReply).content).toContain(`Nothing was moved. ${said}`);
    expect(made.current().gymId).toBe(1);
    // Nor did the uses of `/location` that asked count (plan 8S-4): it may be used again.
    const more = await made.run({ gym: 'g:7' });
    expect(dialogText(shownDialog(more))).toContain('Move it?');
  });

  it('keeps the answer and counts the use of a move that landed before a later step failed', async () => {
    const made = await setup();
    // The raid moved and the member was told, then closing the old post failed.
    vi.spyOn(made.raids, 'setGym').mockImplementation(async (_id, _member, _gym, moved) => {
      await moved?.({ ...made.current(), forumPostId: '900000000000009999' });
      throw new Error('Discord is away');
    });
    for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
      const submitted = await made.submit(await made.run({ gym: 'g:7' }));
      expect(sent(submitted.editReply).content).toContain('This raid is now at');
      expect(submitted.followUp).not.toHaveBeenCalled();
    }
    const more = await made.run({ gym: 'g:7' });
    expect(sent(more.reply).content).toContain('You can use /location again');
  });

  it('counts the use of /location whose dialog was canceled', async () => {
    const made = await setup();
    // Discord's Cancel tells the bot nothing: the dialog opened, and that use stays counted.
    for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
      shownDialog(await made.run({ gym: 'g:7' }));
    }
    const more = await made.run({ gym: 'g:7' });
    expect(sent(more.reply).content).toContain('You can use /location again');
  });

  it('says that nothing moved and reports the failure when the move fails', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'g:7' });
    made.gateway.failing.set('createPost', new Error('Discord is away'));
    const failed = await made.submit(asked);
    expect(sent(failed.editReply)).toEqual({ content: 'Nothing was moved.' });
    expect(failed.followUp).toHaveBeenCalledTimes(1);
    expect(made.current().gymId).toBe(1);
  });

  it('has no limit of its own for moves: the one of every change of a raid applies', async () => {
    const made = await setup();
    const moveTo = async (gym: string) => {
      const [party] = made.store.active();
      const where = {
        channelId: party?.forumPostId ?? '',
        thread: { parentId: party?.forumChannelId ?? '' },
      };
      return made.submit(await made.run({ gym }, where), where);
    };
    // Back and forth, more often than the two in ten minutes there once were.
    for (const gym of ['g:7', 'g:1', 'g:8', 'g:2']) await moveTo(gym);
    expect(made.store.active().map((party) => party.gymId)).toEqual([2]);
    expect(location.throttle).toBe(CHANGE_THROTTLE);
    expect(locationControls.throttle).toBe(CHANGE_THROTTLE);
  });

  it('moves nothing for a Submit that names a party other than the raid of its post', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.run({ gym: 'g:7' }));
    // Sent from outside the raid's post (a forged custom id, another channel or server).
    for (const elsewhere of [
      { channelId: WEST_CHANNEL, thread: undefined },
      { guildId: OTHER_GUILD_ID, channelId: '600000000000000077', thread: undefined },
    ]) {
      const submitted = await made.handle(
        fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE, ...elsewhere }),
      );
      expect(sent(submitted.editReply).content).toBe('This raid is over.');
    }
    // And in no server at all.
    const dm = await made.handle(
      fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE, isDm: true }),
    );
    expect(sent(dm.reply).content).toBe('This only works in a server.');
    expect(made.current().gymId).toBe(1);
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
  });

  it('gives the buttons of the question it asked before the stale answer', async () => {
    const made = await setup();
    for (const action of ['yes', 'no']) {
      const pressed = await made.handle(
        fakeButton({ customId: `location:0123456789abcdef:${action}`, userId: ALICE }),
      );
      expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
    }
    expect(made.current().gymId).toBe(1);
  });

  it('is listed with the controls the router reads', () => {
    expect(components).toContain(locationControls);
  });
});
