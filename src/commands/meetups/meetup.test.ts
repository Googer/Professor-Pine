import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeChatInput,
  fakeModal,
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
import { MOD } from '../../../test/support/meetup-safety-cases.js';
import {
  MOD_CHANNEL,
  meetupSafetyWith,
  type SafetyOptions,
} from '../../../test/support/meetup-safety-service.js';
import { buttonsOf, textDisplays, textOf } from '../../../test/support/messages.js';
import {
  ALICE,
  BOB,
  MINUTE,
  PARTY_NOW,
  testRaid,
  testTrain,
} from '../../../test/support/parties.js';
import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
import { MAX_OPEN_PARTIES } from '../../domain/party/open-parties.js';
import type { PartyStore } from '../../services/party-store.js';
import { OPEN_PARTIES_FULL } from '../parties/open-parties.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../../test/support/wayspots.js';
import type { AppContext } from '../../app-context.js';
import { InteractionRouter, type RouterOptions } from '../../discord/router.js';
import { MAX_MEETUP_DESCRIPTION } from '../../domain/party/party.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { commands } from '../index.js';
import { INFO_INPUT } from './info.js';
import {
  FROM_A_REGION,
  MEETUP_HELD,
  MEETUP_NOT_SENT,
  MEETUP_THROTTLE,
  MEETUP_TOO_SOON,
  NO_INFORMATION,
  NO_MEETUP_HERE,
  NO_MEETUPS_FOR_YOU,
  NO_POWER_SPOT,
  meetup,
  meetupFormControls,
} from './meetup.js';

/** `count` open trains of Alice's in the party store of `made`. */
async function openTrains(made: { store: PartyStore }, count: number): Promise<void> {
  for (let n = 0; n < count; n += 1) {
    await made.store.add({
      ...testTrain({ id: `00000000-0000-4000-8000-00000000010${n}`, createdById: ALICE }),
      forumChannelId: WEST_FORUM,
      forumPostId: `30000000000000010${n}`,
    });
  }
}

describe('/meetup and the open trains and meetups of a member (plan 8Z)', () => {
  it('is refused before the form past the cap, uncounted, and at the form', async () => {
    const made = await setup();
    await openTrains(made, MAX_OPEN_PARTIES);
    for (let use = 0; use <= MEETUP_THROTTLE.uses; use += 1) {
      const used = await made.command('One more');
      expect(used.showModal).not.toHaveBeenCalled();
      expect(sent(used.reply).content).toBe(OPEN_PARTIES_FULL);
    }
    expect(made.meetups()).toEqual([]);
  });

  it('refuses at the Submit too, the typed text given back, when one was made with the form open', async () => {
    const made = await setup();
    await openTrains(made, MAX_OPEN_PARTIES - 1);
    const used = await made.command('One more');
    expect(used.showModal).toHaveBeenCalledOnce();
    await made.store.add({
      ...testTrain({ id: '00000000-0000-4000-8000-000000000199', createdById: ALICE }),
      forumChannelId: WEST_FORUM,
      forumPostId: '300000000000000199',
    });
    const submitted = await made.submit(used, 'Bring snacks.');
    if (!submitted) throw new Error('the form did not open');
    expect(told(submitted)).toContain(OPEN_PARTIES_FULL);
    expect(told(submitted)).toContain('Bring snacks.');
    expect(made.meetups()).toEqual([]);
  });

  it('counts the meetups waiting for a moderator, so that requests cannot flood them', async () => {
    const made = await setup({}, {});
    await openTrains(made, MAX_OPEN_PARTIES - 1);
    await made.held({ maker: { id: ALICE, name: 'Alice' } });
    const used = await made.command('One more');
    expect(sent(used.reply).content).toBe(OPEN_PARTIES_FULL);
  });

  it('answers SLOW_READ when what it reads before the form takes too long, and counts nothing', async () => {
    const made = await setup({}, {});
    const asked = Promise.withResolvers<undefined>();
    const pendingOf = vi.spyOn(made.storage, 'pendingOf').mockImplementation(() => {
      asked.resolve(undefined);
      return new Promise(() => undefined);
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    const using = made.command('One more');
    await asked.promise;
    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
    const used = await using;
    expect(used.showModal).not.toHaveBeenCalled();
    expect(sent(used.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
    // The use is as good as given back: all of the limit is left.
    pendingOf.mockRestore();
    for (let use = 0; use < MEETUP_THROTTLE.uses; use += 1) {
      expect((await made.command(`Another ${use}`)).showModal).toHaveBeenCalledOnce();
    }
  });

  it('never refuses an approval: a moderator decided', async () => {
    const made = await setup({}, {});
    const request = await made.held({ maker: { id: ALICE, name: 'Alice' } });
    await openTrains(made, MAX_OPEN_PARTIES);
    const outcome = await made.safety.decide(
      request.id,
      'approve-once',
      { id: MOD.id },
      FAKE_GUILD_ID,
    );
    expect(outcome.kind).toBe('done');
    expect(made.meetups()).toHaveLength(1);
  });

  it('holds staff to nothing', async () => {
    const made = await setup();
    await openTrains(made, MAX_OPEN_PARTIES);
    await made.run('As staff', { roleNames: ['Moderator'] });
    expect(made.meetups()).toHaveLength(1);
  });
});

const RAID_POST = '300000000000000055';
const HOUR = 60 * MINUTE;
/** A start the fixtures' clock reads as six in the evening of its day. */
const SIX_PM = PARTY_NOW + 4 * HOUR;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(PARTY_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup(
  overrides: Partial<AppContext> = {},
  safety: SafetyOptions = { moderation: null },
  routing: RouterOptions = {},
) {
  const raid = { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: RAID_POST };
  const made = await meetupSafetyWith(safety, [raid]);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
    meetupSafety: made.safety,
    ...overrides,
  });
  const router = new InteractionRouter(ctx, [meetup], [meetupFormControls], routing);
  /** `/meetup` by Alice in the channel of West, near the fountain, at six, unless `extra` says otherwise. */
  const command = async (name: string, extra: object = {}): Promise<FakeInteraction> => {
    const { options, ...rest } = extra as { options?: object };
    const interaction = fakeChatInput({
      commandName: 'meetup',
      channelId: WEST_CHANNEL,
      userId: ALICE,
      displayName: 'Alice',
      roleNames: ['Mystic'],
      ...rest,
      options: { name, near: 'gym:2', start: '6pm', ...options },
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** The form `/meetup` opened, sent with `text`; undefined when it opened none. */
  const submit = async (
    used: FakeInteraction,
    text = 'Bring snacks.',
    extra: object = {},
  ): Promise<FakeInteraction | undefined> => {
    if (used.showModal.mock.calls.length === 0) return undefined;
    const form = used.showModal.mock.calls[0]?.[0] as { custom_id: string };
    const interaction = fakeModal({
      customId: form.custom_id,
      form,
      fields: { [INFO_INPUT]: text },
      channelId: WEST_CHANNEL,
      userId: ALICE,
      displayName: 'Alice',
      roleNames: ['Mystic'],
      modalFromCommand: true,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** `/meetup` and its form: what the member was told last. */
  const run = async (name: string, extra: object = {}, text?: string) => {
    const used = await command(name, extra);
    const submitted = await submit(
      used,
      text,
      pick(extra, ['userId', 'roleNames', 'channelId', 'thread']),
    );
    return { used, submitted, told: told(submitted ?? used) };
  };
  const meetups = () => made.store.active().filter((party) => party.type === 'meetup');
  return { ...made, ctx, command, submit, run, meetups };
}

function pick(from: object, keys: readonly string[]): object {
  return Object.fromEntries(Object.entries(from).filter(([key]) => keys.includes(key)));
}

/** What a member was told last: an edit of the deferred answer, a follow-up or a reply. */
function told(used: FakeInteraction): string | undefined {
  for (const responder of [used.followUp, used.editReply, used.reply]) {
    if (responder.mock.calls.length > 0) {
      const payload = sent(responder);
      return payload.content ?? textOf({ v2: true, components: payload.components as never });
    }
  }
  return undefined;
}

describe('/meetup', () => {
  it('asks for the information in a form and makes the meetup with all of it in one post', async () => {
    const made = await setup();
    const { used, submitted } = await made.run('  Community Day   picnic ');
    // The form: the information, required, as /info asks for it.
    const form = used.showModal.mock.calls[0]?.[0] as { title: string; components: unknown[] };
    expect(form.title).toBe('About this meetup');
    expect(JSON.stringify(form.components)).toContain(
      `"custom_id":"${INFO_INPUT}","label":"Information","style":2,"required":true,"min_length":1,"max_length":${MAX_MEETUP_DESCRIPTION}`,
    );
    expect(used.deferReply).not.toHaveBeenCalled();
    const [party] = made.meetups();
    expect(party).toMatchObject({
      type: 'meetup',
      regionId: 1,
      forumChannelId: WEST_FORUM,
      createdById: ALICE,
      anonymous: false,
      timed: { name: 'Community Day picnic', startTime: SIX_PM },
      meetup: { description: 'Bring snacks.', place: { kind: 'gym', id: '2' } },
    });
    expect(party?.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Interested,
      team: 'mystic',
    });
    const postId = party?.forumPostId ?? '';
    expect(made.gateway.posts.get(postId)).toMatchObject({
      forumId: WEST_FORUM,
      title: 'Meetup · Community Day picnic',
      edits: 0,
    });
    expect(submitted?.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent((submitted as FakeInteraction).editReply).content).toBe(
      `Your meetup is made. Its post is <#${postId}>. There, \`/meet\` changes when it starts, ` +
        '`/end` sets when it ends, and `/info` changes what it says.',
    );
    expect(made.gateway.messagesIn(WEST_CHANNEL).map((message) => message.message.content)).toEqual(
      [`New meetup: <#${postId}>`],
    );
  });

  it('asks for the name, the place and the start every time, and the end if you like', () => {
    const options = meetup.data.toJSON().options ?? [];
    expect(options.map((option) => [option.name, option.required])).toEqual([
      ['name', true],
      ['near', true],
      ['start', true],
      ['end', false],
    ]);
  });

  it('makes the meetup with its end, read as /end reads a meetup end', async () => {
    const made = await setup();
    await made.run('Picnic', { options: { end: '8pm' } });
    expect(made.meetups()[0]).toMatchObject({
      endTime: SIX_PM + 2 * HOUR,
      timed: { startTime: SIX_PM },
    });
    // `none` is no end, as for /end.
    await made.run('Picnic two', { options: { end: 'none' } });
    expect(made.meetups()[1]?.endTime).toBeNull();
  });

  it('refuses an end before the start, or one it cannot read, before the form', async () => {
    const made = await setup();
    const early = await made.run('Picnic', { options: { end: '5pm' } });
    expect(early.used.showModal).not.toHaveBeenCalled();
    expect(early.told).toMatch(/^"5pm" cannot be the time the meetup ends/);
    expect((await made.run('Picnic', { options: { end: 'later' } })).told).toMatch(
      /^I could not read "later" as the time the meetup ends\./,
    );
    expect(made.meetups()).toEqual([]);
  });

  it('works in a post of the forum that is no party, and the meetup belongs to that region', async () => {
    const made = await setup();
    await made.run('Trade evening', {
      channelId: '300000000000000066',
      thread: { parentId: EAST_FORUM },
    });
    expect(made.meetups()[0]).toMatchObject({ regionId: 2, forumChannelId: EAST_FORUM });
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toHaveLength(1);
  });

  it('is refused in the post of a party and anywhere that is no region, before any form', async () => {
    const made = await setup();
    const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
    expect((await made.run('Picnic', inPost)).told).toBe(FROM_A_REGION);
    expect((await made.run('Picnic', { channelId: '600000000000000009' })).told).toBe(
      FROM_A_REGION,
    );
    expect((await made.run('Picnic', { isDm: true })).told).toBe('This only works in a server.');
    expect(made.meetups()).toEqual([]);
  });

  it('says so when the region has no forum yet', async () => {
    const made = await setup();
    const gyms = { ...made.ctx.gyms, isRegion: (id: string) => id === UNBOUNDED_CHANNEL };
    const other = await setup({ gyms });
    for (let n = 0; n < 3; n++) {
      expect((await other.run('Picnic', { channelId: UNBOUNDED_CHANNEL })).told).toBe(
        `The region <#${UNBOUNDED_CHANNEL}> has no forum yet. ` +
          'A moderator can create it with `/admin setup-forums`.',
      );
    }
    expect(other.meetups()).toEqual([]);
  });

  it('refuses a name of nothing but white space, one that is too long, and one of nothing seen', async () => {
    const made = await setup();
    expect((await made.run('   ')).told).toBe('Give a name of 1 to 80 characters.');
    expect((await made.run('x'.repeat(81))).told).toBe('Give a name of 1 to 80 characters.');
    expect((await made.run('​​')).told).toBe('Give a name of 1 to 80 characters.');
    expect(made.meetups()).toEqual([]);
    await made.run('‮Picnic');
    expect(made.meetups()[0]?.timed.name).toBe('Picnic');
  });

  it('refuses a start it cannot read, one in the past and none, before the form', async () => {
    const made = await setup();
    expect((await made.run('Picnic', { options: { start: 'soonish' } })).told).toMatch(
      /^I could not read "soonish" as the time the meetup starts\./,
    );
    expect((await made.run('Picnic', { options: { start: '10-12 6pm' } })).told).toMatch(
      /^"10-12 6pm" cannot be the time the meetup starts/,
    );
    expect((await made.run('Picnic', { options: { start: 'none' } })).told).toMatch(
      /^Give the time the meetup starts\./,
    );
    expect(made.meetups()).toEqual([]);
  });

  it('takes two meetups with one name: nothing keeps them apart', async () => {
    const made = await setup();
    await made.run('Picnic');
    await made.run('Picnic', { userId: BOB });
    expect(
      made
        .meetups()
        .map((party) => party.createdById)
        .sort(),
    ).toEqual([ALICE, BOB]);
  });

  it('names who made it, whatever they chose for the raids they report', async () => {
    const users = new MemoryUsers(undefined, {
      autoStatus: PartyStatus.Present,
      raidPrivacy: RaidPrivacy.Anonymous,
    });
    const made = await setup({ users });
    await made.run('Picnic');
    const [party] = made.meetups();
    expect(party?.anonymous).toBe(false);
    expect(party?.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
    const post = made.gateway.posts.get(party?.forumPostId ?? '');
    expect(textDisplays(post?.message).at(-1)).toBe(`-# Created by **Alice**`);
  });

  it('lets a member ask twice in a quarter of an hour, a form left unsent counting too', async () => {
    const made = await setup();
    expect(MEETUP_THROTTLE).toEqual({ uses: 2, perSeconds: 900 });
    await made.run('First');
    await made.command('Second');
    expect((await made.run('Third')).told).toMatch(/^You can use \/meetup again in 1\d minutes\.$/);
    expect(made.meetups()).toHaveLength(1);
    await made.run('Fourth', { userId: BOB });
    expect(made.meetups()).toHaveLength(2);
  });

  it('gives the use back when the meetup could not be made for no fault of the member', async () => {
    const made = await setup();
    made.gateway.failing.set('createPost', new Error('Discord is away'));
    for (let n = 0; n < 2; n++) {
      expect((await made.run(`Try ${String(n)}`)).told).toMatch(/^Something went wrong/);
    }
    made.gateway.failing.delete('createPost');
    expect((await made.run('First')).told).toMatch(/^Your meetup is made\./);
    await made.run('Second');
    expect((await made.run('Third')).told).toMatch(/^You can use \/meetup again/);
    expect(made.meetups()).toHaveLength(2);
  });

  it('says plainly that the bot may not make posts in the forum, and does not count it', async () => {
    const made = await setup();
    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    for (let n = 0; n < 2; n++) {
      expect((await made.run(`Try ${String(n)}`)).told).toContain(
        `I am not allowed to make posts in <#${WEST_FORUM}>: I lack the permission Manage Posts ` +
          "there. Nothing was made. The server's staff must give it to me.",
      );
    }
    made.gateway.refusePosts.delete(WEST_FORUM);
    expect((await made.run('First')).told).toMatch(/^Your meetup is made\./);
    await made.run('Second');
    expect((await made.run('Third')).told).toMatch(/^You can use \/meetup again/);
  });

  it('gives back nothing to a window opened after the failed form’s use was counted', async () => {
    const made = await setup();
    const old = await made.command('Old');
    vi.setSystemTime(PARTY_NOW + 16 * MINUTE);
    for (const name of ['New one', 'New two']) await made.command(name);
    made.gateway.failing.set('createPost', new Error('Discord is away'));
    expect(told((await made.submit(old)) ?? old)).toMatch(/^Something went wrong/);
    made.gateway.failing.delete('createPost');
    // The old form's use was counted in the window that closed: the new one stays full.
    const third = await made.command('Third');
    expect(third.showModal).not.toHaveBeenCalled();
    expect(told(third)).toMatch(/^You can use \/meetup again/);
  });

  it('gives a failed form’s use back by when the router counted it, not by another clock', async () => {
    // The router's clock runs an hour behind the one the form is checked by.
    let routerNow = PARTY_NOW - HOUR;
    const made = await setup({}, { moderation: null }, { now: () => routerNow });
    const old = await made.command('Old');
    routerNow += 16 * MINUTE;
    for (const name of ['New one', 'New two']) await made.command(name);
    made.gateway.failing.set('createPost', new Error('Discord is away'));
    expect(told((await made.submit(old)) ?? old)).toMatch(/^Something went wrong/);
    made.gateway.failing.delete('createPost');
    // Counted at the router's hour, in the window that closed: the new one stays full.
    const third = await made.command('Third');
    expect(third.showModal).not.toHaveBeenCalled();
  });

  it('does not count a use that was refused before the form', async () => {
    const made = await setup();
    const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
    await made.run('   ');
    await made.run('Picnic', inPost);
    await made.run('Picnic', { options: { start: 'soonish' } });
    await made.run('Picnic', { options: { near: 'qwxzy' } });
    await made.run('First');
    await made.run('Second');
    expect(made.meetups()).toHaveLength(2);
    expect((await made.run('Third')).told).toMatch(/^You can use \/meetup again/);
  });

  it('makes a meetup near a PokéStop or at a pin', async () => {
    const { wayspots } = await wayspotsWith([
      keptRow(1, { title: 'Fountain Square', lat: 40.0601, lon: -80.0601, image: '', address: '' }),
    ]);
    const made = await setup({ wayspots });
    await made.run('Picnic', { options: { near: `stop:${wayspotId(1)}` } });
    expect(made.meetups()[0]?.meetup.place).toMatchObject({
      kind: 'stop',
      image: null,
      address: null,
    });
    await made.run('Lake picnic', { options: { near: '40.02, -80.02' } });
    const lake = made.meetups().find((party) => party.timed.name === 'Lake picnic');
    expect(lake?.meetup.place).toMatchObject({ kind: 'pin', lat: 40.02 });
    const postId = lake?.forumPostId ?? '';
    expect(textDisplays(made.gateway.posts.get(postId)?.message)[1]).toMatch(/^\*\*Where\*\*\n📍/);
  });

  it('takes no Wayspot without a title, picked or typed by its street, and makes no meetup', async () => {
    const { wayspots } = await wayspotsWith([
      keptRow(1, {
        title: ' ',
        lat: 40.0601,
        lon: -80.0601,
        address: '16 Maple Avenue, Pinewood, PA 15999, USA',
      }),
    ]);
    const made = await setup({ wayspots });
    await made.ctx.placeFinder.built();
    const refusal = async (near: string) => (await made.run('Picnic', { options: { near } })).told;
    expect(await refusal(`stop:${wayspotId(1)}`)).toBe(
      'That place is gone from the list; pick it again.',
    );
    // Typed by its street, it is not among the places offered (a gym on that street is).
    const typed = await refusal('16 Maple Avenue');
    expect(typed).toMatch(/^Which place is "16 Maple Avenue"\?/);
    expect(typed).not.toMatch(/(?:: |, | or )\(PokéStop\)/);
    expect(made.meetups()).toEqual([]);
  });

  it('keeps a long title of a place to 255 characters, never half of an emoji', async () => {
    // The 128th emoji takes the 255th and 256th code units: it is left out whole.
    const title = '🦊'.repeat(130);
    const { wayspots } = await wayspotsWith([keptRow(1, { title, lat: 40.0601, lon: -80.0601 })]);
    const made = await setup({ wayspots });
    await made.ctx.placeFinder.built();
    await made.run('Picnic', { options: { near: `stop:${wayspotId(1)}` } });
    expect(made.meetups()[0]?.meetup.place).toMatchObject({ title: '🦊'.repeat(127) });
    // A pin near it is named by it, cut the same way.
    await made.run('Fox picnic', { options: { near: '40.0602, -80.0602' } });
    const fox = made.meetups().find((party) => party.timed.name === 'Fox picnic');
    expect(fox?.meetup.place).toMatchObject({
      kind: 'pin',
      near: { kind: 'stop', title: '🦊'.repeat(127) },
    });
  });

  it('is never near a Power Spot: not offered, not found, refused when picked, naming no pin by one', async () => {
    const { wayspots } = await wayspotsWith([
      keptRow(1, { title: 'Garden Gnome', kind: 'powerspot', lat: 40.0601, lon: -80.0601 }),
    ]);
    const made = await setup({ wayspots });
    await made.ctx.placeFinder.built();
    const autocomplete = fakeAutocomplete({
      commandName: 'meetup',
      channelId: WEST_CHANNEL,
      focusedName: 'near',
      focused: 'Garden Gnome',
    });
    await new InteractionRouter(made.ctx, [meetup], []).handle(autocomplete as never);
    expect(autocomplete.respond.mock.calls[0]?.[0]).toEqual([]);
    const refusal = async (near: string) => (await made.run('Picnic', { options: { near } })).told;
    expect(await refusal(`powerspot:${wayspotId(1)}`)).toBe(NO_POWER_SPOT);
    expect(await refusal('Garden Gnome')).toMatch(
      /^I know no gym or PokéStop called "Garden Gnome"/,
    );
    expect(made.meetups()).toEqual([]);
    // A pin beside it is named by the gym further off, never by the power spot.
    await made.run('Gnome picnic', { options: { near: '40.0602, -80.0602' } });
    expect(made.meetups()[0]?.meetup.place).toMatchObject({
      kind: 'pin',
      near: { kind: 'gym', title: 'Old Stone Fountain' },
    });
  });

  it('refuses a place it cannot take, without counting it', async () => {
    const made = await setup();
    const refusal = async (near: string) => (await made.run('Picnic', { options: { near } })).told;
    expect(await refusal('https://maps.app.goo.gl/AbC123xyz')).toMatch(
      /^I do not follow short links\./,
    );
    expect(await refusal('qwxzy')).toBe(
      'I know no gym or PokéStop called "qwxzy" here. Pick one from the list that ' +
        'appears while you type, or paste a maps link or coordinates.',
    );
    expect(made.meetups()).toEqual([]);
    await made.run('First');
    await made.run('Second');
    expect(made.meetups()).toHaveLength(MEETUP_THROTTLE.uses);
  });

  it('refuses information of nothing but white space', async () => {
    const made = await setup();
    expect((await made.run('Picnic', {}, '  \n  ')).told).toBe(NO_INFORMATION);
    expect((await made.run('Lake picnic', { options: { near: '40.02, -80.02' } }, ' ')).told).toBe(
      NO_INFORMATION,
    );
    expect(made.meetups()).toEqual([]);
  });

  it('refuses a start that has passed while the form was open', async () => {
    const made = await setup();
    const used = await made.command('Picnic', { options: { start: 'in 10' } });
    vi.setSystemTime(PARTY_NOW + 11 * MINUTE);
    expect(told((await made.submit(used)) as FakeInteraction)).toMatch(
      /^That start has passed meanwhile\. Use `\/meetup` again with a later one\./,
    );
    expect(made.meetups()).toEqual([]);
  });

  it('gives the information back when the form comes after its time', async () => {
    const made = await setup();
    const used = await made.command('Picnic');
    vi.setSystemTime(PARTY_NOW + 31 * MINUTE);
    const submitted = await made.submit(used, 'Bring snacks.');
    expect(told(submitted as FakeInteraction)).toBe(
      'That has expired. Use the command again.\nWhat you wrote:\n```\nBring snacks.\n```',
    );
    expect(made.meetups()).toEqual([]);
  });

  it('says in its help what it asks for, and that the place may need a moderator', () => {
    const details = typeof meetup.help.details === 'string' ? meetup.help.details : '';
    expect(details).toContain('`near`');
    expect(details).toContain('`start`');
    expect(details).toContain('`end`');
    expect(details).toContain('cannot be changed afterwards');
    expect(details).toContain("moderator's approval");
    expect(meetup.help.examples).toContain(
      '/meetup name:Trade evening near:Fountain Square start:6:30pm',
    );
  });

  // Plan 8V-1 (the Campfire links design, 2): one sentence at the end, a link and no fetch; a
  // paragraph of its own since plan 8M-15 (V2).
  it('ends its help with where the official meetups are: Campfire, a paragraph of its own', () => {
    const details = typeof meetup.help.details === 'string' ? meetup.help.details : '';
    const paragraphs = details.split('\n\n');
    expect(paragraphs.at(-1)).toBe(
      'Official meetups by Community Ambassadors are on Campfire: https://campfire.scopely.com/discover',
    );
    expect(paragraphs.at(-2)).toMatch(
      /^A meetup is archived an hour after it is over: .*its post says when\.$/u,
    );
  });

  it('is listed with the commands, under the meetups, with /name and /info', () => {
    const filed = commands.filter((command) => command.help.category === 'meetup');
    expect(filed.map((command) => command.data.name).sort()).toEqual(['info', 'meetup', 'name']);
  });
});

describe('/meetup with meetup safety on', () => {
  const PIN = '40.02, -80.02';

  it('sends a meetup at a pin to the moderators, and tells the member they will hear by DM', async () => {
    const made = await setup({}, {});
    const { told: answer } = await made.run(
      'Lake picnic',
      { options: { near: PIN } },
      'By the tent.',
    );
    expect(answer).toBe(MEETUP_HELD);
    expect(made.meetups()).toEqual([]);
    const [request] = made.storage.requests.values();
    expect(request).toMatchObject({
      makerId: ALICE,
      makerName: 'Alice',
      makerTeam: 'mystic',
      name: 'Lake picnic',
      startTime: SIX_PM,
      endTime: null,
      description: 'By the tent.',
      status: 'pending',
      place: { kind: 'pin' },
    });
    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain('Lake picnic');
  });

  it('keeps the end of a meetup held for the moderators, and its post says it', async () => {
    const made = await setup({}, {});
    await made.run('Lake picnic', { options: { near: PIN, end: '8pm' } }, 'By the tent.');
    const [request] = made.storage.requests.values();
    expect(request).toMatchObject({ startTime: SIX_PM, endTime: SIX_PM + 2 * HOUR });
    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain(
      `Ends <t:${String((SIX_PM + 2 * HOUR) / 1000)}:F>`,
    );
  });

  it('posts a staff member’s meetup at once, wherever it is', async () => {
    const made = await setup({}, {});
    await made.run('Lake picnic', { roleNames: ['Moderator'], options: { near: PIN } });
    expect(made.meetups()).toHaveLength(1);
    expect(made.storage.requests.size).toBe(0);
  });

  it('refuses a place refused for good, and a blocked member, before the form and uncounted', async () => {
    const made = await setup({}, {});
    await made.storage.rule(made.gateway.guildId, { kind: 'gym', id: '2' }, 'refuse', MOD);
    for (let n = 0; n < 3; n++) expect((await made.run('Picnic')).told).toBe(NO_MEETUP_HERE);
    await made.storage.addBlock(made.gateway.guildId, BOB, MOD);
    for (let n = 0; n < 3; n++) {
      expect((await made.run('Picnic', { userId: BOB, options: { near: 'gym:1' } })).told).toBe(
        NO_MEETUPS_FOR_YOU,
      );
    }
    expect(made.meetups()).toEqual([]);
    await made.run('First', { options: { near: 'gym:1' } });
    await made.run('Second', { options: { near: 'gym:1' } });
    expect(made.meetups()).toHaveLength(2);
  });

  it('refuses a blocked member before it reads the place or the start', async () => {
    const made = await setup({}, {});
    await made.storage.addBlock(made.gateway.guildId, BOB, MOD);
    const { told: answer } = await made.run('Picnic', {
      userId: BOB,
      options: { near: 'qwxzy', start: 'whenever' },
    });
    expect(answer).toBe(NO_MEETUPS_FOR_YOU);
  });

  it('answers a blocked member with an Appeal button for this server', async () => {
    const made = await setup({}, {});
    await made.storage.addBlock(made.gateway.guildId, BOB, MOD);
    const { used } = await made.run('Picnic', { userId: BOB });
    const payload = sent(used.reply);
    expect(payload.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    const shown = asV2(payload);
    expect(textOf(shown)).toBe(NO_MEETUPS_FOR_YOU);
    expect(buttonsOf(shown).map((button) => [button.label, button.customId])).toEqual([
      ['Appeal…', `mappeal:${made.gateway.guildId}:open`],
    ]);
  });

  it('reads the place and its check once before the form, in the guard', async () => {
    const made = await setup({}, {});
    const blocks = vi.spyOn(made.storage, 'block');
    const rulings = vi.spyOn(made.storage, 'ruling');
    const used = await made.command('Picnic');
    expect(used.showModal).toHaveBeenCalledOnce();
    expect(blocks).toHaveBeenCalledOnce();
    expect(rulings).toHaveBeenCalledOnce();
  });

  it('asks again on the submit: a place refused while the form was open is refused', async () => {
    const made = await setup({}, {});
    const used = await made.command('Picnic');
    await made.storage.rule(made.gateway.guildId, { kind: 'gym', id: '2' }, 'refuse', MOD);
    expect(told((await made.submit(used, 'Bring snacks.')) as FakeInteraction)).toBe(
      `${NO_MEETUP_HERE}\nWhat you wrote:\n\`\`\`\nBring snacks.\n\`\`\``,
    );
    expect(made.meetups()).toEqual([]);
  });

  it('answers a member blocked while the form was open with Appeal too', async () => {
    const made = await setup({}, {});
    const used = await made.command('Picnic');
    await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
    const submitted = (await made.submit(used)) as FakeInteraction;
    // The check comes with the making, after the private deferral.
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const shown = asV2(sent(submitted.editReply));
    expect(textOf(shown)).toBe(NO_MEETUPS_FOR_YOU);
    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Appeal…']);
    expect(made.meetups()).toEqual([]);
  });

  it('closes a meetup at once whose maker was blocked while it was being made', async () => {
    const made = await setup({}, {});
    const create = made.service.createMeetup.bind(made.service);
    vi.spyOn(made.service, 'createMeetup').mockImplementationOnce(async (asked) => {
      const outcome = await create(asked);
      await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
      return outcome;
    });
    const { submitted } = await made.run('Picnic');
    const shown = asV2(sent((submitted as FakeInteraction).editReply));
    expect(textOf(shown)).toBe(NO_MEETUPS_FOR_YOU);
    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Appeal…']);
    expect(made.meetups()).toEqual([]);
  });

  it('asks for a start two hours ahead when the place needs a moderator', async () => {
    const made = await setup({}, {});
    expect((await made.run('Picnic', { options: { near: PIN, start: 'in 90' } })).told).toBe(
      MEETUP_TOO_SOON,
    );
    expect(made.storage.requests.size).toBe(0);
  });

  it('says so, with the information given back, when the moderators cannot be asked', async () => {
    const made = await setup({}, { channel: false });
    const { told: answer } = await made.run('Picnic', { options: { near: PIN } }, 'By the tent.');
    expect(answer).toBe(`${MEETUP_NOT_SENT}\nWhat you wrote:\n\`\`\`\nBy the tent.\n\`\`\``);
    expect(made.storage.requests.size).toBe(0);
    expect(made.meetups()).toEqual([]);
  });
});
