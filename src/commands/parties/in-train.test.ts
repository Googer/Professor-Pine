import { gymStop } from '../../domain/party/stops.js';
import { dialogTexts, shownDialog } from '../../../test/support/dialogs.js';
import { REMOVAL_INPUT } from '../../render/moderation.js';
import { ComponentType, MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
  type FakeRow,
} from '../../../test/support/fake-interactions.js';
import { testGyms, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  stops,
} from '../../../test/support/parties.js';
import { createdTrain } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { attendeeOf } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { TIME_INPUT } from '../../render/party-controls.js';
import { admin } from '../admin/index.js';
import { info, infoControls } from '../meetups/info.js';
import { boss, moveset } from '../raids/boss.js';
import { duration, end, hatch } from '../raids/change.js';
import { location, locationControls } from '../raids/location.js';
import { conductor } from '../trains/conductor.js';
import { finish, next, previous, skip } from '../trains/move.js';
import { route } from '../trains/route.js';
import { train } from '../trains/train.js';
import { done, here, interested, join, leave, local, notHere, remote } from './attendance.js';
import { closeControls, deleteParty } from './delete.js';
import { partyReportForm, report, REPORT_REASON_INPUT, reportControls } from './report.js';
import { group } from './group.js';
import { cancelMeet, meet } from './meet.js';
import { name } from './name.js';
import { shout } from './shout.js';
import { status, where } from './status.js';
import {
  buttonLabels,
  buttonsOf,
  header,
  textDisplays,
  textOf,
  thumbnailOf,
} from '../../../test/support/messages.js';

/** A message a control is on that is components v2, as posts and panels are. */
const V2_ROWS: readonly FakeRow[] = [{ type: ComponentType.Container, components: [] }];

const all: CommandModule[] = [
  join,
  interested,
  here,
  notHere,
  done,
  leave,
  remote,
  local,
  group,
  meet,
  cancelMeet,
  end,
  status,
  where,
  shout,
  deleteParty,
  report,
  name,
  info,
  boss,
  moveset,
  hatch,
  duration,
  location,
  route,
  conductor,
  next,
  previous,
  skip,
  finish,
  train,
  admin,
];
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
const ADMIN_ROLE = '800000000000000001';
const NOT_A_RAID = 'This is the post of a train: that only works in the post of a raid.';

const maps = (id: number): string => {
  const gym = testGyms().find((found) => found.id === id);
  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
};

beforeEach(() => {
  // The handlers read the clock themselves; the fake gateway needs the real timers.
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * A train with its post, on a route of three gyms unless `route` says otherwise, and every
 * command and control that was there before trains and works, or is refused, in its post.
 */
async function setup(route: readonly number[] = [4, 1, 7]) {
  const made = await createdTrain({ route });
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, [
    partyButtons,
    infoControls,
    locationControls,
    reportControls,
    closeControls,
  ]);
  /** Everything a member was told in this test, to look for words that do not belong. */
  const told: string[] = [];
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    for (const responder of [
      interaction.reply,
      interaction.editReply,
      interaction.followUp,
      interaction.update,
    ]) {
      for (const [payload] of responder.mock.calls) {
        const content = (payload as { content?: string } | undefined)?.content;
        if (content !== undefined) told.push(content);
        // A components-v2 answer (the Manage train panel) says it in its text.
        const flags = (payload as { flags?: number } | undefined)?.flags ?? 0;
        if ((flags & MessageFlags.IsComponentsV2) !== 0) {
          told.push(textOf(asV2(payload)));
        }
      }
    }
    return interaction;
  };
  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A command used in the post of the train, by Alice unless `extra` says otherwise. */
  const run = (
    commandName: string,
    options: Record<string, string | number | boolean> = {},
    extra: object = {},
  ) =>
    handle(
      fakeChatInput({
        commandName,
        ...inPost,
        userId: ALICE,
        displayName: 'Alice',
        options,
        ...extra,
      }),
    );
  /** What the member is told: the reply, or the edit of a command that takes its time. */
  const answer = async (
    commandName: string,
    options?: Record<string, string | number | boolean>,
    extra?: object,
  ): Promise<string | undefined> => {
    const used = await run(commandName, options, extra);
    for (const responder of [used.reply, used.editReply, used.followUp]) {
      if (responder.mock.calls.length > 0) return sent(responder).content;
    }
    return undefined;
  };
  /** A press on a control of the train, on a components-v2 message (a post, a panel). */
  const click = (action: string, extra: object = {}) =>
    handle(
      fakeButton({
        customId: `party:${made.party.id}:${action}`,
        channelId: made.postId,
        userId: ALICE,
        displayName: 'Alice',
        messageRows: V2_ROWS,
        ...extra,
      }),
    );
  /** Everything said in the post, line by line, once all of it has gone out. */
  const lines = async (): Promise<string[]> => {
    // The lines first: they were said before what is announced a moment later.
    await made.attendance.flush();
    await made.timed.flush();
    await made.trains.flush();
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  const alice = () => attendeeOf(made.current(), ALICE);
  /** The first message of the post, once every render is done. */
  const shown = async () => {
    await made.service.flush();
    return made.gateway.posts.get(made.postId)?.message;
  };
  return { ...made, ctx, handle, run, answer, click, lines, alice, shown, inPost, told };
}

describe('the attendance commands in the post of a train', () => {
  it('sign a member up and take them off again, in the words of a train', async () => {
    const made = await setup();
    expect(await made.answer('interested')).toBe('You are interested.');
    expect(await made.answer('join', { count: 3 })).toBe('You are coming with 2 more.');
    expect(await made.answer('here')).toBe('You are here with 2 more.');
    expect(await made.answer('not-here')).toBe('You are interested with 2 more.');
    expect(await made.answer('remote')).toBe('You are interested with 2 more, remotely.');
    expect(await made.answer('local')).toBe('You are interested with 2 more, in person.');
    expect(await made.answer('leave')).toBe('You have left this train.');
    expect(made.alice()).toBeUndefined();
    expect(await made.answer('leave')).toBe('You are not signed up for this train.');
    expect(await made.answer('not-here')).toBe('You are not signed up for this train.');
  });

  it('/done means leave: the member is taken off, and nobody is asked anything', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Present);
    await made.run('here');
    expect(await made.answer('done')).toBe('You have left this train.');
    expect(made.alice()).toBeUndefined();
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(made.current().prompts.completion).toEqual([]);
    expect(await made.lines()).toEqual([
      `**Bob** (<@${BOB}>) is here.`,
      `**Alice** (<@${ALICE}>) has left.`,
    ]);
    expect(await made.answer('done')).toBe('You are not signed up for this train.');
  });

  it('/leave and /done free the conductor, and the post says that the train has none', async () => {
    const made = await setup();
    await made.run('join');
    await made.trains.setConductor(made.party.id, { id: ALICE });
    expect(await made.answer('leave')).toBe('You have left this train.');
    expect(made.current().train.conductorId).toBeNull();
    await made.run('join');
    await made.trains.setConductor(made.party.id, { id: ALICE });
    await made.attendance.flush();
    expect(await made.answer('done')).toBe('You have left this train.');
    expect(made.current().train.conductorId).toBeNull();
    expect((await made.lines()).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) has left: this train has no conductor now.`,
    );
    expect(textOf(await made.shown())).not.toContain('Conductor');
  });

  it('/group opens, joins and labels groups as in a raid', async () => {
    const made = await setup();
    await made.run('join');
    expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
      'You opened group B and are in it.',
    );
    expect(await made.answer('group', { text: 'by car' }, { subcommand: 'label' })).toBe(
      'Your group is now group B (by car).',
    );
    expect(await made.answer('group', { letter: 'A' }, { subcommand: 'join' })).toBe(
      'You are coming, in group A.',
    );
    expect(await made.answer('join', { group: 'B', count: 2 })).toBe(
      'You are coming with 1 more, in group B (by car).',
    );
    expect(await made.answer('join', { group: 'D' })).toBe('This train has no such group.');
    expect(made.current().groups).toEqual([
      { id: 'A' },
      { id: 'B', label: 'by car', opened: expect.any(Number) as number },
    ]);
    // The list of groups offers them.
    const typing = await made.handle(
      fakeAutocomplete({ commandName: 'join', ...made.inPost, focused: '', focusedName: 'group' }),
    );
    expect(typing.respond).toHaveBeenCalledWith([
      { name: 'Group A (1)', value: 'A' },
      { name: 'Group B: by car (2)', value: 'B' },
    ]);
    // The post lists both groups now, and a group can be split off.
    expect(buttonLabels(await made.shown()).filter((label) => label !== undefined)).toEqual([
      'Group…',
      'Move…',
      'Manage…',
      'Split…',
    ]);
    // Each by somebody else: a group its one member leaves goes (plan 8X-1B).
    for (const userId of [BOB, CAROL, '200000000000000005']) {
      await made.run('group', {}, { subcommand: 'new', userId });
    }
    expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
      'A train cannot have more than five groups.',
    );
  });
});

describe('the buttons of a train post', () => {
  it('sign up, count and leave like those of a raid, and move between groups', async () => {
    const made = await setup();
    expect(sent((await made.click('join')).reply).content).toBe('You are coming.');
    expect(sent((await made.click('more')).reply).content).toBe('You are coming with 1 more.');
    expect(sent((await made.click('remote')).reply).content).toBe(
      'You are coming with 1 more, remotely.',
    );
    expect(sent((await made.click('here')).reply).content).toBe(
      'You are here with 1 more, remotely.',
    );
    await made.attendance.newGroup(made.party.id, { id: BOB });
    // Join B makes a member who is here coming in group B; what else they gave stays.
    expect(sent((await made.click('group:B')).reply).content).toBe(
      'You are coming with 1 more, in group B, remotely.',
    );
    expect(sent((await made.click('leave')).reply).content).toBe('You have left this train.');
    expect(sent((await made.click('less')).reply).content).toBe(
      'You are not signed up for this train.',
    );
  });

  it('take a Done that somebody still has on screen as leave', async () => {
    const made = await setup();
    await made.click('join');
    expect(sent((await made.click('done')).reply).content).toBe('You have left this train.');
    expect(made.alice()).toBeUndefined();
    expect(sent((await made.click('answer:yes')).reply).content).toBe(
      'You were not asked, or you have answered already.',
    );
  });

  it('refuse "Set time" and its form, which only a raid has', async () => {
    const made = await setup();
    const clicked = await made.click('time');
    expect(clicked.showModal).not.toHaveBeenCalled();
    expect(sent(clicked.reply).content).toBe(NOT_A_RAID);
    const form = await made.handle(
      fakeModal({
        customId: `party:${made.party.id}:time:hatch`,
        ...made.inPost,
        userId: ALICE,
        fields: { [TIME_INPUT]: '30' },
      }),
    );
    expect(sent(form.reply).content).toBe(NOT_A_RAID);
  });
});

describe('/meet, /cancel-meet, /end and /name in the post of a train', () => {
  it('/meet sets when the train starts, for everybody, and tells the others', async () => {
    const made = await setup();
    await made.run('join');
    expect(await made.answer('meet', { time: '4pm' })).toBe(
      `This train starts at ${stamp(START)} (${stamp(START, 'R')}). I am telling the others.`,
    );
    expect(made.current().timed.startTime).toBe(START);
    // The start is the train's, not that of a group.
    expect(made.current().groups).toEqual([{ id: 'A' }]);
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) is coming.`,
      `**Alice** (<@${ALICE}>) set the start of this train: ${stamp(START)} (${stamp(START, 'R')}).`,
      `<@${REPORTER}>`,
    ]);
    expect(textOf(await made.shown())).toContain(
      `Starts ${stamp(START, 'R')}, at ${stamp(START)}.`,
    );
    expect(await made.answer('cancel-meet')).toBe(
      'This train has no start time any more. I am telling the others.',
    );
    expect(await made.answer('cancel-meet')).toBe('This train had no start time.');
  });

  it('/meet is for members who are signed up, and explains a time it cannot read', async () => {
    const made = await setup();
    expect(await made.answer('meet', { time: '4pm' })).toBe(
      'You are not signed up for this train.',
    );
    await made.run('join');
    expect(await made.answer('meet', { time: 'gibberish' })).toBe(
      'I could not read "gibberish" as the time the train starts. ' +
        'Try `6:15pm`, `10-16 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).',
    );
  });

  it('/end sets when the train ends, for anybody in the post, and "none" removes it', async () => {
    const made = await setup();
    expect(await made.answer('end', { time: '6pm' })).toBe(
      `This train ends at ${stamp(END)} (${stamp(END, 'R')}).`,
    );
    expect(made.current()).toMatchObject({ endTime: END, lastPossibleTime: END });
    expect(await made.answer('end', { time: '18:00' })).toBe(
      `This train already ends at ${stamp(END)} (${stamp(END, 'R')}).`,
    );
    await made.run('join');
    expect(await made.answer('meet', { time: '7pm' })).toBe(
      'A train cannot start after it ends. Give an earlier start, or change the end first with `/end`.',
    );
    expect(await made.answer('end', { time: 'none' })).toBe('This train has no end time any more.');
    expect(made.current().endTime).toBeNull();
    expect(await made.lines()).toContain(
      `**Alice** (<@${ALICE}>) removed the end time of this train.`,
    );
  });

  it('/name renames the train, and the title of its post follows', async () => {
    const made = await setup();
    expect(await made.answer('name', { name: '  Sunday   legendaries ' })).toBe(
      'This train is now called **Sunday legendaries**.',
    );
    expect(await made.answer('name', { name: 'Sunday legendaries' })).toBe(
      'This train is called **Sunday legendaries** already.',
    );
    expect(await made.answer('name', { name: '   ' })).toBe('Give a name of 1 to 80 characters.');
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) renamed this train: **Sunday legendaries**.`,
    ]);
    expect(made.gateway.posts.get(made.postId)?.title).toBe('Train · Sunday legendaries');
  });
});

describe('/boss in the post of a train', () => {
  const NO_TIER =
    'A train has no tier: name the Pokémon it is after, such as `yveltal`, or `none` for no boss.';

  it('sets which Pokémon the train is after, and the post shows it', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 'yveltal' })).toBe(
      'This train is now after Yveltal.',
    );
    expect(made.current().train.boss).toEqual({ key: 'yveltal' });
    expect(await made.answer('boss', { pokemon: 'Yveltal (T5)' })).toBe(
      'This train is after Yveltal already.',
    );
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) set the boss this train is after: **Yveltal**.`,
    ]);
    const message = await made.shown();
    expect(header(message)[1]).toMatch(/^\*\*After Yveltal\*\*/);
    expect(textOf(message)).toContain('**Weaknesses**');
    expect(thumbnailOf(message)).toBeDefined();
    // Neither the times nor the route of the train have anything to do with it.
    expect(made.current()).toMatchObject({ endTime: null, hatchTime: null, gymId: null });
  });

  it('refuses `tier:`, which is for max battles only (plan 8X-F)', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 'yveltal', tier: 'D3' })).toBe(
      '`tier:` is for a max battle whose boss is on no list. Leave it out here.',
    );
    expect(made.current().train.boss).toBeNull();
  });

  it('ignores a tier typed before the name: a train has none', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 't3 yveltal' })).toBe(
      'This train is now after Yveltal.',
    );
    for (const typed of ['shadow t5 yveltal', 'T5 Yveltal', 'tier 1 yveltal', 'shadow yveltal']) {
      expect(await made.answer('boss', { pokemon: typed })).toBe(
        'This train is after Yveltal already.',
      );
    }
    expect(made.current().train.boss).toEqual({ key: 'yveltal' });
  });

  it('takes a Pokémon that is not on the current boss list: a train may be planned ahead', async () => {
    const made = await setup();
    expect(made.ctx.raidBosses.bosses().some((listed) => listed.entry?.key === 'bulbasaur')).toBe(
      false,
    );
    expect(await made.answer('boss', { pokemon: 'bulbasaur' })).toBe(
      'This train is now after Bulbasaur.',
    );
    expect(made.current().train.boss).toEqual({ key: 'bulbasaur' });
    expect(await made.answer('boss', { pokemon: 't3 bulbasaur' })).toBe(
      'This train is after Bulbasaur already.',
    );
    const message = await made.shown();
    expect(header(message)[1]).toMatch(/^\*\*After Bulbasaur\*\*/);
    // What the game master says of it is shown, though no list has a picture of it.
    expect(textOf(message)).toContain('**Weaknesses**');
    expect(thumbnailOf(message)).toBeUndefined();
  });

  it('asks which mega is meant, and takes the one that is named in full', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 'mega charizard' })).toBe(
      '"mega charizard" could be Mega Charizard X or Mega Charizard Y: type the full name.',
    );
    expect(await made.answer('boss', { pokemon: 'mega charizard y' })).toBe(
      'This train is now after Mega Charizard Y.',
    );
    expect(made.current().train.boss).toEqual({ key: 'charizard_mega_y' });
  });

  it('reads "mega" before a name as the Mega form, as a raid does, and refuses one that has none', async () => {
    const made = await setup();
    for (const typed of ['mega pikachu', 'mega legendary pikachu', 'Mega Pikachu raid']) {
      expect(await made.answer('boss', { pokemon: typed })).toBe(
        'I do not know a Mega Pokémon called "pikachu". Pick one from the list.',
      );
    }
    expect(made.current().train.boss).toBeNull();
    expect(await made.answer('boss', { pokemon: 'mega blastoise' })).toBe(
      'This train is now after Mega Blastoise.',
    );
    expect(made.current().train.boss).toEqual({ key: 'blastoise_mega' });
  });

  it('offers the current bosses without eggs or tiers, then Pokémon by what was typed', async () => {
    const made = await setup();
    const offered = async (focused: string) => {
      const typing = await made.handle(
        fakeAutocomplete({ commandName: 'boss', ...made.inPost, focused, focusedName: 'pokemon' }),
      );
      return (typing.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
    };
    const all = await offered('');
    expect(all.length).toBeGreaterThan(5);
    expect(all.length).toBeLessThanOrEqual(25);
    expect(all.every((choice) => /^[pb]:/.test(choice.value))).toBe(true);
    expect(all.some((choice) => /egg|\(T\d\)/i.test(choice.name))).toBe(false);
    // Each Pokémon once, whatever tiers it is a boss in.
    expect(new Set(all.map((choice) => choice.value)).size).toBe(all.length);
    expect(all).toContainEqual({ name: 'Yveltal', value: 'p:yveltal' });
    expect(await made.answer('boss', { pokemon: 'p:yveltal' })).toBe(
      'This train is now after Yveltal.',
    );
    // A Pokémon that is no boss right now is found by its name.
    expect(await offered('bulba')).toContainEqual({ name: 'Bulbasaur', value: 'p:bulbasaur' });
    expect(await made.answer('boss', { pokemon: 'p:bulbasaur' })).toBe(
      'This train is now after Bulbasaur.',
    );
    // There are no eggs to pick.
    expect(await offered('t5 egg')).toEqual([]);
  });

  it('refuses the tier of an egg with a sentence: a train has no tier', async () => {
    const made = await setup();
    for (const typed of ['t5', 'e:T5:0', 'mega', 'shadow t3', 'tier 5 egg']) {
      expect(await made.answer('boss', { pokemon: typed })).toBe(NO_TIER);
    }
    expect(made.current().train.boss).toBeNull();
    expect(await made.lines()).toEqual([]);
  });

  it('takes "shadow" alone for no Pokémon: it is no name of a boss', async () => {
    const made = await setup();
    // The list has shadow bosses, which a raid finds by `shadow <name>`.
    expect(made.ctx.raidBosses.bosses().some((listed) => listed.tier.shadow)).toBe(true);
    expect(await made.answer('boss', { pokemon: 'shadow' })).toBe(
      'I do not know a Pokémon called "shadow". Pick one from the list.',
    );
    expect(await made.answer('boss', { pokemon: 'shad' })).toBe(
      'I do not know a Pokémon called "shad". Pick one from the list.',
    );
    expect(made.current().train.boss).toBeNull();
  });

  it('says so when the text names no Pokémon, without a word about raids or tiers', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 'qqqqq' })).toBe(
      'I do not know a Pokémon called "qqqqq". Pick one from the list.',
    );
    expect(await made.answer('boss', { pokemon: 't3 qqqqq' })).toBe(
      'I do not know a Pokémon called "qqqqq". Pick one from the list.',
    );
    expect(await made.answer('boss', { pokemon: 'p:no_such_key' })).toBe(
      'I do not know that Pokémon any more. Pick again from the list.',
    );
    expect(made.current().train.boss).toBeNull();
  });

  it('takes the boss off again with "none"', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 'none' })).toBe('This train was after no boss.');
    await made.run('boss', { pokemon: 'yveltal' });
    expect(await made.answer('boss', { pokemon: 'None' })).toBe(
      'This train is after no boss any more.',
    );
    expect(made.current().train.boss).toBeNull();
    expect((await made.lines()).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) removed the boss of this train.`,
    );
  });
});

describe('/where in the post of a train', () => {
  it('shows the stop the train is at, as a link', async () => {
    const made = await setup();
    expect(await made.answer('where')).toBe(
      `**Veterans Memorial Bridge**\n[Open in Google Maps](<${maps(4)}>)`,
    );
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    expect(await made.answer('where')).toBe(
      `**The Stacks** (Pinewood Public Library)\n[Open in Google Maps](<${maps(1)}>)`,
    );
  });

  it('says so when the train is at no gym: before its route, and after it', async () => {
    const none = await setup([]);
    expect(await none.answer('where')).toBe(
      'This train has no route yet. Add its stops with `/route add`.',
    );
    const made = await setup([4]);
    await made.trains.move(made.party.id, { id: REPORTER }, 'finish', false);
    expect(await made.answer('where')).toBe('This train has finished its route: it is at no gym.');
    // A stop that is no longer in the gym list: only a row from before gyms took their stops
    // with them can have one (a gym that is not there cannot be added, and a deleted one is
    // taken off every route), so the train is given it behind the service's back.
    const gone = await setup([4]);
    await gone.store.update(gone.party.id, (party) => ({
      party:
        party.type === 'train' ? { ...party, train: { ...party.train, route: stops(999) } } : party,
    }));
    expect(await gone.answer('where')).toBe('I no longer know the gym this train is at.');
  });
});

describe('the other commands in the post of a train', () => {
  it('/shout tells everybody in the train, and says so when there is nobody else', async () => {
    const made = await setup();
    expect(await made.answer('shout', { message: 'On my way' })).toBe(
      'You are not signed up for this train.',
    );
    await made.run('join');
    expect(await made.answer('shout', { message: 'On my way' })).toBe(
      'Your message is in the post. I pinged 1 trainer.',
    );
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `**Alice** (<@${ALICE}>) to everybody in this train:\n> On my way\n<@${REPORTER}>`,
      mention: { users: [REPORTER] },
    });
    await made.attendance.leave(made.party.id, { id: REPORTER });
    expect(await made.answer('shout', { message: 'Anybody?' })).toBe(
      'Nobody else is signed up for this train, so I said nothing.',
    );
  });

  it('/status puts the train at the bottom of its post again, with all its buttons', async () => {
    const made = await setup();
    expect(await made.answer('status')).toBe(
      'The train is at the bottom of the post again, with its buttons.',
    );
    const [copy] = made.gateway.messagesIn(made.postId);
    expect(header(copy?.message)[0]).toBe('### Raid Train: Saturday legendaries');
    expect(buttonsOf(copy?.message)).toEqual(
      buttonsOf(made.gateway.posts.get(made.postId)?.message),
    );
  });

  it('/status in the channel of the region lists the train under the raids', async () => {
    const made = await setup();
    const used = await made.run('status', {}, { channelId: WEST_CHANNEL, thread: undefined });
    expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
      '### Today and coming up\n1 train',
      `**Trains**\n<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
    ]);
  });

  it('/delete from staff asks first, and Archive post closes the train: the post says who did it', async () => {
    const made = await setup();
    const used = await made.run('delete', {}, { roleNames: ['Moderator'] });
    const dialog = shownDialog(used);
    expect(dialogTexts(dialog)).toEqual(['Close this train?']);
    expect(made.store.get(made.party.id)).toBeDefined();
    const pressed = await made.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        picked: { [REMOVAL_INPUT]: 'archive' },
        userId: ALICE,
        displayName: 'Alice',
        roleNames: ['Moderator'],
        ...made.inPost,
      }),
    );
    expect(textOf(asV2(sent(pressed.editReply)))).toBe(
      'This train is closed: I am archiving and locking its post.',
    );
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.said().at(-1)).toBe(`This train was closed by **Alice** (<@${ALICE}>).`);
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true });
    expect(header(post?.message)[1]).toBe(`This train was closed by **Alice** (<@${ALICE}>).`);
    expect(buttonsOf(post?.message)).toEqual([]);
  });

  it('/report asks what is wrong, and puts it into the post without a moderators’ channel', async () => {
    const made = await setup();
    const used = await made.run('report');
    expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
    const submit = (reason: string, userId = ALICE) =>
      made.handle(
        fakeModal({
          customId: partyReportForm(made.party).custom_id,
          userId,
          fields: { [REPORT_REASON_INPUT]: reason },
          guildRoleNames: { [ADMIN_ROLE]: 'Admin' },
          ...made.inPost,
        }),
      );
    expect(sent((await submit('   ')).reply).content).toBe(
      'Say what is wrong, so that the moderators know what to look at.',
    );
    expect(sent((await submit('Made twice')).editReply).content).toBe(
      'I have put your report into the post, for the moderators.',
    );
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `<@&${ADMIN_ROLE}>: **Member** (<@${ALICE}>) asks for this train to be deleted.\n> Made twice`,
      mention: { roles: [ADMIN_ROLE] },
    });
    expect(sent((await submit('Again')).editReply).content).toBe(
      'You have already asked the moderators about this train.',
    );
    await made.service.end(made.party.id);
    expect(sent((await submit('Too late', CAROL)).reply).content).toBe('This has ended.');
  });

  it('/admin save-party keeps the post of a train and lets it go again', async () => {
    const made = await setup();
    const staff = { subcommand: 'save-party', roleNames: ['Admin'] };
    expect(await made.answer('admin', {}, staff)).toMatch(/^This post is kept/);
    expect(made.current().saved).toBe(true);
    expect(await made.answer('admin', { keep: false }, staff)).toBe(
      'This post is no longer kept: it is archived as usual once the train is over.',
    );
    expect(made.current().saved).toBe(false);
  });
});

describe('what is only for raids or only for meetups, in the post of a train', () => {
  it('refuses every command about a raid as such, naming the kind of post', async () => {
    const made = await setup();
    const before = made.current();
    expect(await made.answer('hatch', { time: '30' })).toBe(NOT_A_RAID);
    expect(await made.answer('duration', { minutes: 30 })).toBe(NOT_A_RAID);
    expect(await made.answer('moveset', { quick: 'snarl' })).toBe(NOT_A_RAID);
    // The route of a train is its own: `/location` moves a raid.
    expect(await made.answer('location', { gym: 'Library' })).toBe(NOT_A_RAID);
    expect(await made.answer('info')).toBe(
      'This is the post of a train: that only works in the post of a meetup.',
    );
    expect(made.current()).toBe(before);
    expect(await made.lines()).toEqual([]);
  });

  it('offers no moves there, also when the train is after a boss', async () => {
    const made = await setup();
    await made.run('boss', { pokemon: 'yveltal' });
    const typing = await made.handle(
      fakeAutocomplete({
        commandName: 'moveset',
        ...made.inPost,
        focused: '',
        focusedName: 'quick',
      }),
    );
    expect(typing.respond).toHaveBeenCalledWith([]);
  });
});

describe('what a member of a train is told', () => {
  it('never calls the train a raid or a meetup, whatever they try in its post', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    const staff = { subcommand: 'save-party', roleNames: ['Admin'] };
    const tries: [string, Record<string, string | number | boolean>?, object?][] = [
      ['leave'],
      ['done'],
      ['not-here'],
      ['meet', { time: '4pm' }],
      ['cancel-meet'],
      ['shout', { message: 'hello' }],
      ['join', { group: 'Z' }],
      ['join', { count: 99 }],
      ['join'],
      ['interested'],
      ['here'],
      ['remote'],
      ['local'],
      ['group', {}, { subcommand: 'new' }],
      ['group', { letter: 'A' }, { subcommand: 'join' }],
      ['group', { letter: 'E' }, { subcommand: 'join' }],
      ['group', { text: 'x' }, { subcommand: 'label' }],
      ['group', { text: 'x'.repeat(101) }, { subcommand: 'label' }],
      ['meet', { time: 'gibberish' }],
      ['meet', { time: '1pm' }],
      ['meet', { time: '4pm' }],
      ['meet', { time: '4pm' }],
      ['end', { time: '3pm' }],
      ['end', { time: 'gibberish' }],
      ['end', { time: '6pm' }],
      ['end', { time: '6pm' }],
      ['meet', { time: '7pm' }],
      ['end', { time: 'none' }],
      ['end', { time: 'none' }],
      ['cancel-meet'],
      ['cancel-meet'],
      ['where'],
      ['boss', { pokemon: 'yveltal' }],
      ['boss', { pokemon: 'yveltal' }],
      ['boss', { pokemon: 't5' }],
      ['boss', { pokemon: 'qqqqq' }],
      ['boss', { pokemon: 't3 yveltal' }],
      ['boss', { pokemon: 'shadow t5 yveltal' }],
      ['boss', { pokemon: 'bulbasaur' }],
      ['boss', { pokemon: 't3 bulbasaur' }],
      ['boss', { pokemon: 'mega charizard' }],
      ['boss', { pokemon: 't1 qqqqq' }],
      ['boss', { pokemon: 'star' }],
      ['boss', { pokemon: 'none' }],
      ['shout', { message: 'hello' }],
      ['status'],
      ['admin', {}, staff],
      ['admin', {}, staff],
      ['admin', { keep: false }, staff],
      ['name', { name: 'Evening train' }],
      ['name', { name: 'Evening train' }],
      ['name', { name: '   ' }],
      ['done'],
      ['where'],
      // What only a train has.
      ['route', {}, { subcommand: 'show' }],
      ['route', { gym: 'g:2' }, { subcommand: 'add' }],
      ['join'],
      ['route', { gym: 'g:2' }, { subcommand: 'add' }],
      ['route', { gym: 'g:2' }, { subcommand: 'add' }],
      ['route', { gym: 'zzzz' }, { subcommand: 'add' }],
      ['route', { gym: 'pinewood' }, { subcommand: 'add' }],
      ['route', {}, { subcommand: 'show' }],
      ['route', { stop: 9 }, { subcommand: 'remove' }],
      ['route', { stop: 4 }, { subcommand: 'remove' }],
      ['route', { from: 1, to: 3 }, { subcommand: 'move' }],
      ['route', { from: 1, to: 9 }, { subcommand: 'move' }],
      ['route', {}, { subcommand: 'clear' }],
      ['route', { name: 'Loop' }, { subcommand: 'save' }],
      ['route', { name: 'Loop' }, { subcommand: 'save' }],
      ['route', { name: '   ' }, { subcommand: 'save' }],
      ['route', { route: 'Loop' }, { subcommand: 'load' }],
      ['route', { route: 'Nothing' }, { subcommand: 'load' }],
      ['route', { route: 'Loop' }, { subcommand: 'forget' }],
      ['route', { route: 'Loop' }, { subcommand: 'forget' }],
      ['next'],
      ['skip'],
      ['skip'],
      ['previous'],
      ['previous'],
      ['previous'],
      ['finish'],
      ['finish'],
      ['next'],
      ['conductor', {}, { subcommand: 'clear' }],
      ['conductor', {}, { subcommand: 'set' }],
      ['conductor', {}, { subcommand: 'set' }],
      ['conductor', {}, { subcommand: 'set', userId: BOB }],
      ['next', {}, { userId: BOB }],
      ['conductor', {}, { subcommand: 'clear', userId: BOB }],
      ['conductor', {}, { subcommand: 'clear' }],
      ['route', {}, { subcommand: 'clear' }],
      ['next'],
      ['train', { name: 'Another one' }],
      ['train', { name: '   ' }],
    ];
    for (const [command, options, extra] of tries) await made.run(command, options, extra);
    // The route was cleared above: the train gets one again, to be moved along.
    for (const gymId of [4, 1, 7, 2])
      await made.trains.addStop(made.party.id, { id: ALICE }, gymStop(gymId));
    const moves = ['next', 'previous', 'skip', 'finish', 'next'];
    // Real moves, the last one refused: the route is finished by then.
    for (const move of moves) await made.run(move);
    expect(made.current().train.stop).toBe(4);
    // A control of the Manage train panel before plan 8X-G, still open in a client.
    await made.click('next:4:1');
    for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'group:A']) {
      await made.click(action);
    }
    // Move… and Manage… (plan 8X-G) of a member who is not signed up, and of one who has left.
    const panel = ['move', 'manage'];
    for (const action of panel) await made.click(action, { userId: CAROL });
    await made.click('leave');
    for (const action of panel) await made.click(action);
    const closing = shownDialog(await made.run('delete', {}, { roleNames: ['Admin'] }));
    await made.handle(
      fakeModal({
        customId: closing.custom_id,
        form: closing,
        picked: { [REMOVAL_INPUT]: 'archive' },
        userId: ALICE,
        roleNames: ['Admin'],
      }),
    );
    for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'group:A', 'leave']) {
      // The train is closed by now: a control that is still on screen says so, without a kind.
      await made.click(action);
    }
    expect(made.told.slice(-8)).toEqual(Array.from({ length: 8 }, () => 'This has ended.'));
    // What only a train has knows that it was one. (By Bob: Alice has used up her clicks.)
    for (const action of panel) await made.click(action, { userId: BOB });
    expect(made.told.slice(-2)).toEqual(Array.from({ length: 2 }, () => 'This train is over.'));
    expect(made.told.length).toBeGreaterThanOrEqual(tries.length + 27);
    // A raid is named only where every kind is ("raid, max battle, train or meetup", "raid or train"), and
    // a meetup only beside the train ("train or meetup"). Nothing speaks of a tier or a report.
    const wrong = made.told.filter(
      (text) =>
        /raid(?!, train or meetup| or train)/i.test(text) || /(?<!train or )meetup/i.test(text),
    );
    expect(wrong).toEqual([]);
    expect(made.told.filter((text) => /\btiers?\b|report/i.test(text))).toEqual([
      'A train has no tier: name the Pokémon it is after, such as `yveltal`, or `none` for no boss.',
    ]);
    await made.timed.flush();
    await made.trains.flush();
    await made.attendance.flush();
    expect(made.said().filter((text) => /raid|meetup/i.test(text))).toEqual([]);
  });
});
