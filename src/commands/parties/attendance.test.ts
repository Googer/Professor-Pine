import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { fakeAutocomplete, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL, REPORTER } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { CommandModule } from '../../discord/command.js';
import { LATE_DEFER_MS } from '../../discord/late-reply.js';
import { InteractionRouter } from '../../discord/router.js';
import { attendeeOf, endParty } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import type { RaidReport } from '../../services/party-service.js';
import {
  coming,
  done,
  here,
  hmm,
  interested,
  join,
  leave,
  local,
  notHere,
  remote,
} from './attendance.js';
import { group } from './group.js';

const all: CommandModule[] = [
  join,
  coming,
  interested,
  hmm,
  here,
  notHere,
  done,
  leave,
  remote,
  local,
  group,
];

async function setup(report: Partial<RaidReport> = {}) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, []);
  /** A command used in the raid's post, by Alice unless said otherwise. */
  const run = async (
    commandName: string,
    options: Record<string, string | number> = {},
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({
      commandName,
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
      userId: ALICE,
      displayName: 'Alice',
      roleNames: ['Valor'],
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const answer = async (
    commandName: string,
    options?: Record<string, string | number>,
    extra?: object,
  ) => sent((await run(commandName, options, extra)).reply).content;
  const alice = () => attendeeOf(made.current(), ALICE);
  return { ...made, ctx, router, run, answer, alice };
}

describe('the attendance commands', () => {
  it('/join signs the member up as coming, privately, and notes name and team', async () => {
    const made = await setup();
    const used = await made.run('join');
    expect(used.reply).toHaveBeenCalledWith({
      content: 'You are coming.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.alice()).toMatchObject({
      status: PartyStatus.Coming,
      name: 'Alice',
      team: 'valor',
    });
    await made.attendance.flush();
    expect(made.said()).toEqual([`**Alice** (<@${ALICE}>) is coming.`]);
  });

  it('/coming is /join and /hmm is /interested by other names, with the same options', async () => {
    const made = await setup();
    expect(await made.answer('hmm', { count: 2 })).toBe('You are interested with 1 more.');
    expect(made.alice()).toMatchObject({ status: PartyStatus.Interested, number: 2 });
    expect(await made.answer('coming')).toBe('You are coming with 1 more.');
    expect(made.alice()).toMatchObject({ status: PartyStatus.Coming });
    for (const [other, original] of [
      [hmm, interested],
      [coming, join],
    ] as const) {
      const { name, ...json } = other.data.toJSON();
      const { name: _name, ...same } = original.data.toJSON();
      expect(json).toEqual(same);
      expect(name).not.toBe(original.data.name);
      expect(other.formOf).toBe(original.data.name);
      expect(other.throttle).toBe(original.throttle);
      // Its help shows how to use it by its own name.
      expect(other.help.examples).toEqual(
        original.help.examples?.map((example) =>
          example.replace(`/${original.data.name}`, `/${name}`),
        ),
      );
      expect(other.help.examples?.every((example) => example.startsWith(`/${name}`))).toBe(true);
    }
  });

  it('takes a head count that includes the member, and refuses one that is too large', async () => {
    const made = await setup();
    expect(await made.answer('join', { count: 3 })).toBe('You are coming with 2 more.');
    expect(await made.answer('here')).toBe('You are here with 2 more.');
    expect(await made.answer('interested', { count: 1 })).toBe('You are interested.');
    expect(await made.answer('join', { count: 22 })).toBe(
      'Give the number of trainers including yourself, from 1 to 21.',
    );
    expect(made.alice()).toMatchObject({ status: PartyStatus.Interested, number: 1 });
  });

  it('takes a group, and refuses one the raid does not have', async () => {
    const made = await setup();
    expect(await made.answer('join', { group: 'B' })).toBe('This raid has no such group.');
    await made.run('group', {}, { subcommand: 'new', userId: BOB });
    expect(await made.answer('join', { group: 'A' })).toBe('You are coming, in group A.');
    // Without a group, a member stays where they are; a new member lands in the newest group.
    expect(await made.answer('here')).toBe('You are here, in group A.');
    expect(await made.answer('interested', {}, { userId: CAROL })).toBe(
      'You are interested, in group B.',
    );
  });

  it('reads a group as it is typed, and refuses what is no group instead of ignoring it', async () => {
    const made = await setup();
    await made.run('group', {}, { subcommand: 'new', userId: BOB });
    expect(await made.answer('join', { group: ' b ' })).toBe('You are coming, in group B.');
    expect(await made.answer('here', { group: 'Group A' })).toBe('You are here, in group A.');
    // What the list shows can be sent as it is, by a member who types it or presses Enter early.
    expect(await made.answer('here', { group: 'Group B: park side (4)' })).toBe(
      'You are here, in group B.',
    );
    expect(await made.answer('join', { group: 'the park' })).toBe('This raid has no such group.');
    expect(await made.answer('join', { group: 'Group' })).toBe('This raid has no such group.');
    expect(await made.answer('group', { letter: 'b' }, { subcommand: 'join' })).toBe(
      'You are here, in group B.',
    );
    expect(await made.answer('group', { letter: 'F' }, { subcommand: 'join' })).toBe(
      'This raid has no such group.',
    );
    expect(made.alice()).toMatchObject({ group: 'B', status: PartyStatus.Present });
  });

  it('offers the groups the raid has, with name and head count', async () => {
    const made = await setup();
    await made.run('group', {}, { subcommand: 'new', userId: BOB });
    await made.run('group', { text: 'park side' }, { subcommand: 'label', userId: BOB });
    const offered = async (focused: string, extra: object = {}) => {
      const interaction = fakeAutocomplete({
        commandName: 'join',
        channelId: made.postId,
        thread: { parentId: WEST_FORUM },
        focused,
        focusedName: 'group',
        ...extra,
      });
      await made.router.handle(interaction as never);
      return interaction.respond.mock.calls[0]?.[0];
    };
    expect(await offered('')).toEqual([
      { name: 'Group A (1)', value: 'A' },
      { name: 'Group B: park side (1)', value: 'B' },
    ]);
    expect(await offered('b')).toEqual([{ name: 'Group B: park side (1)', value: 'B' }]);
    expect(await offered('group a')).toEqual([{ name: 'Group A (1)', value: 'A' }]);
    expect(await offered('PARK')).toEqual([{ name: 'Group B: park side (1)', value: 'B' }]);
    expect(await offered('z')).toEqual([]);
    // A long name gives way to the head count.
    await made.run('group', { text: 'x'.repeat(100) }, { subcommand: 'label', userId: BOB });
    const [, long] = (await offered('')) ?? [];
    expect(long?.name).toMatch(/^Group B: x+… \(1\)$/);
    expect(long?.name.length).toBeLessThanOrEqual(100);
    await made.run('group', { text: 'park side' }, { subcommand: 'label', userId: BOB });
    expect(
      await offered('', { commandName: 'group', subcommand: 'join', focusedName: 'letter' }),
    ).toHaveLength(2);
    expect(await offered('', { commandName: 'remote' })).toHaveLength(2);
    // Anywhere else there is no raid to have groups.
    expect(await offered('', { channelId: WEST_CHANNEL, thread: undefined })).toEqual([]);
  });

  it('offers a letter given again by letter, as the post lists it (review r0 A7)', async () => {
    const made = await setup();
    // Bob opens B, Alice joins A, the reporter opens C and Alice follows (A goes), then three
    // more open D, E and A again, the last.
    const id = made.party.id;
    await made.attendance.newGroup(id, { id: BOB, name: 'Bob' });
    await made.attendance.joinGroup(id, { id: ALICE, name: 'Alice' }, 'A');
    await made.attendance.newGroup(id, { id: REPORTER, name: 'Reporter' });
    await made.attendance.joinGroup(id, { id: ALICE, name: 'Alice' }, 'C');
    for (const member of [CAROL, '200000000000000011', '200000000000000012']) {
      await made.attendance.newGroup(id, { id: member, name: 'Somebody' });
    }
    const interaction = fakeAutocomplete({
      commandName: 'join',
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
      focused: '',
      focusedName: 'group',
    });
    await made.router.handle(interaction as never);
    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(interaction.respond.mock.calls[0]?.[0]?.map((choice) => choice.value)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
  });

  it('/remote and /local keep the status of an attendee and sign up anybody else as interested', async () => {
    const made = await setup();
    expect(await made.answer('remote')).toBe('You are interested, remotely.');
    await made.run('join');
    expect(await made.answer('local', { count: 2 })).toBe('You are coming with 1 more, in person.');
    expect(await made.answer('remote')).toBe('You are coming with 1 more, remotely.');
  });

  it('/remote is refused on an elite raid', async () => {
    const made = await setup({ tier: { level: 'Elite', shadow: false } });
    expect(await made.answer('remote')).toBe('Elite raids can only be done in person.');
  });

  it('/not-here and /leave are for attendees', async () => {
    const made = await setup();
    expect(await made.answer('not-here')).toBe('You are not signed up for this raid.');
    expect(await made.answer('leave')).toBe('You are not signed up for this raid.');
    await made.run('here');
    expect(await made.answer('not-here')).toBe('You are interested.');
    expect(await made.answer('leave')).toBe('You have left this raid.');
    expect(made.alice()).toBeUndefined();
  });

  it('/done is refused for an egg and for somebody who is not signed up', async () => {
    const egg = await setup();
    await egg.run('join');
    expect(await egg.answer('done')).toBe('This raid has not hatched yet.');
    const hatched = await setup({ boss: { key: 'yveltal' } });
    expect(await hatched.answer('done')).toBe('You are not signed up for this raid.');
  });

  it('/done completes the raid and says whether others were asked', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    await made.run('here');
    expect(await made.answer('done')).toBe('You are done.');
    expect(await made.answer('done')).toBe('You were done already.');
    await made.run('here');
    await made.run('here', {}, { userId: BOB });
    expect(await made.answer('done')).toBe(
      'You are done. I have asked the others of your group who are here whether they are too.',
    );
  });

  it('works only in the post of an active raid', async () => {
    const made = await setup();
    const elsewhere = { channelId: WEST_CHANNEL, thread: undefined };
    for (const command of all) {
      const extra = command === group ? { ...elsewhere, subcommand: 'new' } : elsewhere;
      expect(await made.answer(command.data.name, {}, extra)).toBe(
        'Use this in the post of a raid, max battle, train or meetup that is still active.',
      );
    }
    await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
    expect(await made.answer('join')).toBe(
      'Use this in the post of a raid, max battle, train or meetup that is still active.',
    );
  });

  it('holds back a member who uses one command more than thirty times a minute', async () => {
    const made = await setup();
    for (let n = 0; n < 30; n++) await made.run(n % 2 === 0 ? 'join' : 'interested');
    expect(await made.answer('join')).toBe('You are coming.');
    for (let n = 0; n < 14; n++) await made.run('join');
    expect(await made.answer('join')).toMatch(/^You can use \/join again in /);
    expect(await made.answer('interested')).toBe('You are interested.');
  });

  // Plan 8Z-2, fix round F-A5: a newcomer is asked of Discord (`memberAccess`) before the write,
  // which may eat Discord's three seconds: the commands are acknowledged late, as a press is.
  it('acknowledge a newcomer late while Discord is slow to say how they stand to the forum, and answer in its place', async () => {
    const uses: Array<[string, Record<string, string>, object, string]> = [
      ['join', {}, {}, 'You are coming.'],
      ['interested', {}, {}, 'You are interested.'],
      ['here', {}, {}, 'You are here.'],
      ['group', { letter: 'A' }, { subcommand: 'join' }, 'You are coming.'],
    ];
    for (const [commandName, options, extra, said] of uses) {
      const made = await setup();
      const asked = Promise.withResolvers<void>();
      const answered = Promise.withResolvers<void>();
      const look = made.gateway.memberAccess.bind(made.gateway);
      vi.spyOn(made.gateway, 'memberAccess').mockImplementationOnce(async (forum, member) => {
        asked.resolve();
        await answered.promise;
        return look(forum, member);
      });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const using = made.run(commandName, options, extra);
        await asked.promise;
        await vi.advanceTimersByTimeAsync(LATE_DEFER_MS);
        answered.resolve();
        const used = await using;
        expect(used.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
        expect(used.reply).not.toHaveBeenCalled();
        expect(sent(used.editReply).content).toBe(said);
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it('files every one of them under the raid basics, with a description of what it does', () => {
    for (const command of all) {
      expect(command.help.category).toBe('basic-raid');
      expect(command.help.details).toBeTruthy();
      expect(command.data.toJSON().description.length).toBeGreaterThan(10);
    }
  });
});

describe('/group', () => {
  it('new opens a group and moves the member into it', async () => {
    const made = await setup();
    expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
      'You opened group B and are in it.',
    );
    expect(made.alice()).toMatchObject({ group: 'B', status: PartyStatus.Coming });
    expect(made.current().groups.map((g) => g.id)).toEqual(['A', 'B']);
  });

  it('new is refused when there are five groups', async () => {
    const made = await setup();
    // Each by somebody else: a group its one member leaves goes (plan 8X-1B).
    for (const userId of [ALICE, BOB, CAROL, '200000000000000005']) {
      await made.run('group', {}, { subcommand: 'new', userId });
    }
    // By somebody not signed up: Alice, alone in B, would change nothing by a new group.
    expect(
      await made.answer('group', {}, { subcommand: 'new', userId: '200000000000000006' }),
    ).toBe('A raid cannot have more than five groups.');
  });

  it('new is refused, as Group… refuses it, where it would change nothing', async () => {
    const made = await setup();
    // The reporter is the one member of the raid's one group.
    expect(await made.answer('group', {}, { subcommand: 'new', userId: REPORTER })).toBe(
      'You are the only one here: a new group would change nothing.',
    );
    await made.run('group', {}, { subcommand: 'new', userId: BOB });
    // Bob is alone in B, a group of his own without a label or a meeting time.
    expect(await made.answer('group', {}, { subcommand: 'new', userId: BOB })).toBe(
      'You are alone in group B already: a new group would change nothing.',
    );
    expect(made.current().groups.map((g) => g.id)).toEqual(['A', 'B']);
  });

  it('join moves the member, and signs up somebody new as coming', async () => {
    const made = await setup();
    await made.run('group', {}, { subcommand: 'new', userId: BOB });
    expect(await made.answer('group', { letter: 'A' }, { subcommand: 'join' })).toBe(
      'You are coming, in group A.',
    );
    expect(await made.answer('group', { letter: 'B' }, { subcommand: 'join' })).toBe(
      'You are coming, in group B.',
    );
    expect(await made.answer('group', { letter: 'E' }, { subcommand: 'join' })).toBe(
      'This raid has no such group.',
    );
  });

  it('label names the group of the member and removes the name without a text', async () => {
    const made = await setup();
    expect(await made.answer('group', { text: 'x' }, { subcommand: 'label' })).toBe(
      'You are not signed up for this raid.',
    );
    await made.run('join');
    expect(await made.answer('group', { text: 'by the *fountain*' }, { subcommand: 'label' })).toBe(
      'Your group is now group A (by the \\*fountain\\*).',
    );
    expect(made.current().groups[0]?.label).toBe('by the *fountain*');
    expect(await made.answer('group', {}, { subcommand: 'label' })).toBe(
      'Group A has no name any more.',
    );
    expect(made.current().groups[0]).toEqual({ id: 'A' });
  });
});
