import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shownDialog } from '../../test/support/dialogs.js';
import {
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, asRaid, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { components } from '../components/index.js';
import { InteractionRouter } from '../discord/router.js';
import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
import { commands } from './index.js';

const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: false } };
const YVELTAL = pokemonTarget(717);

/**
 * The commands as the bot runs them, over the services of `partyServiceWith`: every way a
 * member causes something members are told about, to see that the member who did it is the one
 * who is left out.
 */
async function setup(overrides: Parameters<typeof partyServiceWith>[1] = {}) {
  const made = await partyServiceWith([], overrides);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
    wants: made.wants,
    gymTargets: made.gymTargets,
    users: made.users,
  });
  const router = new InteractionRouter(ctx, commands, components);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  /** A command used in the channel of West. */
  const inRegion = (userId: string, commandName: string, options: Record<string, string>) =>
    handle(
      fakeChatInput({ commandName, channelId: WEST_CHANNEL, userId, displayName: userId, options }),
    );
  /** A command used in the post of a party. */
  const inPost = (
    userId: string,
    postId: string,
    forumId: string,
    commandName: string,
    options: Record<string, string>,
  ) =>
    handle(
      fakeChatInput({
        commandName,
        channelId: postId,
        thread: { parentId: forumId },
        userId,
        displayName: userId,
        options,
      }),
    );
  /** Whoever was told since the last call, in order. */
  let read = 0;
  const told = async (): Promise<string[]> => {
    await made.notify.flush();
    const fresh = made.dms.jobs.slice(read).map((job) => job.userId);
    read = made.dms.jobs.length;
    return fresh;
  };
  /** Everybody in `ids` wants this. */
  const want = async (target: NotificationTarget, ...ids: string[]) => {
    for (const id of ids) await made.wants.set(id, made.gateway.guildId, target, 'raid');
  };
  const target = async (gymId: number, ...ids: string[]) => {
    for (const id of ids) await made.gymTargets.add(id, made.gateway.guildId, gymId);
  };
  /** The one raid, as it is stored. */
  const raid = () => asRaid(made.store.active()[0]);
  return { ...made, ctx, users: ctx.users, handle, inRegion, inPost, told, want, target, raid };
}

describe('who is told, and who is left out, by every way a member causes it', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('`/raid`: not the reporter', async () => {
    const made = await setup();
    await made.want(T5, ALICE, BOB);
    await made.inRegion(ALICE, 'raid', { boss: 'e:T5:0', gym: 'g:1' });
    expect(made.raid().createdById).toBe(ALICE);
    expect(await made.told()).toEqual([BOB]);
  });

  it('`/raid` answers as ever when the notifier cannot even begin', async () => {
    const made = await setup({
      notifying: {
        raidBosses: {
          bosses: () => {
            throw new Error('the boss list is broken');
          },
        },
      },
    });
    await made.want(T5, BOB);
    const used = await made.inRegion(ALICE, 'raid', { boss: 'e:T5:0', gym: 'g:1' });
    const postId = made.raid().forumPostId ?? '';
    expect(JSON.stringify(sent(used.editReply))).toContain(postId);
    expect(await made.told()).toEqual([]);
    expect(made.entries.some((entry) => entry.msg === 'could not tell members of an event')).toBe(
      true,
    );
  });

  it('`/boss`: not whoever set it', async () => {
    const made = await setup();
    await made.inRegion(CAROL, 'raid', { boss: 'e:T5:0', gym: 'g:1' });
    await made.told();
    await made.want(YVELTAL, ALICE, BOB);
    const postId = made.raid().forumPostId ?? '';
    await made.inPost(ALICE, postId, WEST_FORUM, 'boss', { pokemon: 'b:yveltal:T5:0' });
    expect(made.raid().raid.boss).toEqual({ key: 'yveltal' });
    expect(await made.told()).toEqual([BOB]);
  });

  it('`/location` within the region: not whoever moved it', async () => {
    const made = await setup();
    await made.inRegion(CAROL, 'raid', { boss: 'e:T5:0', gym: 'g:1' });
    await made.told();
    await made.target(2, ALICE, BOB);
    const postId = made.raid().forumPostId ?? '';
    await made.inPost(ALICE, postId, WEST_FORUM, 'location', { gym: 'g:2' });
    expect(made.raid().gymId).toBe(2);
    // Carol, signed up as its reporter, hears by a DM of its own that it moved; Bob targets the
    // gym; Alice, who moved it, hears nothing.
    expect(await made.told()).toEqual([CAROL, BOB]);
  });

  it('`/location` into another region: not whoever moved it', async () => {
    const made = await setup();
    await made.inRegion(CAROL, 'raid', { boss: 'e:T5:0', gym: 'g:1' });
    await made.told();
    await made.target(7, ALICE, BOB);
    const postId = made.raid().forumPostId ?? '';
    const asked = await made.inPost(ALICE, postId, WEST_FORUM, 'location', { gym: 'g:7' });
    // Moving it asks first, in a dialog (plan 8Q): its Submit moves it.
    const dialog = shownDialog(asked);
    await made.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        channelId: postId,
        thread: { parentId: WEST_FORUM },
        userId: ALICE,
        displayName: ALICE,
      }),
    );
    expect(made.raid()).toMatchObject({ gymId: 7, forumChannelId: EAST_FORUM });
    // Carol, signed up as its reporter, hears by a DM of its own that it moved; Bob targets the
    // gym; Alice, who moved it, hears nothing.
    expect(await made.told()).toEqual([CAROL, BOB]);
  });
});

describe('who is told about trains and meeting times, and who is left out', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('`/train`: not who made it', async () => {
    const made = await setup();
    for (const id of [ALICE, BOB]) await made.newTrains.set(id, made.gateway.guildId, true, 1);
    await made.inRegion(ALICE, 'train', { name: 'Saturday legendaries' });
    expect(made.store.active()[0]).toMatchObject({ type: 'train', createdById: ALICE });
    expect(await made.told()).toEqual([BOB]);
  });

  it('`/meet` in a raid: the others of the group, not who set the time', async () => {
    const made = await setup();
    await made.inRegion(CAROL, 'raid', { boss: 'yveltal', gym: 'g:1' });
    const postId = made.raid().forumPostId ?? '';
    for (const id of [ALICE, BOB]) await made.inPost(id, postId, WEST_FORUM, 'join', {});
    await made.told();
    await made.inPost(ALICE, postId, WEST_FORUM, 'meet', { time: '20' });
    expect(made.raid().groups[0]?.startTime).toBeDefined();
    expect((await made.told()).sort()).toEqual([BOB, CAROL].sort());
  });

  it('`/meet` in a train: everybody else who is signed up', async () => {
    const made = await setup();
    await made.inRegion(CAROL, 'train', { name: 'Saturday legendaries' });
    const postId = made.store.active()[0]?.forumPostId ?? '';
    for (const id of [ALICE, BOB]) await made.inPost(id, postId, WEST_FORUM, 'join', {});
    await made.told();
    await made.inPost(ALICE, postId, WEST_FORUM, 'meet', { time: '4pm' });
    await made.timed.flush();
    expect((await made.told()).sort()).toEqual([BOB, CAROL].sort());
  });
});
