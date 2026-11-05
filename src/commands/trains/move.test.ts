import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { testGyms, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER, stops } from '../../../test/support/parties.js';
import { createdMeetup, createdTrain } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import { ClickAnswers } from '../../discord/click-answers.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { attendeeOf, type TrainAtEnd } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { conductor } from './conductor.js';
import { finish, next, previous, skip } from './move.js';
import { header, textOf } from '../../../test/support/messages.js';

/*
 * The commands that move a train and `/conductor`. Move… and Manage… of the post, which took the
 * place of the Manage train panel (plan 8X-G), are `move-dialog.test.ts` and
 * `manage-dialog.test.ts`.
 */

const all: CommandModule[] = [next, previous, skip, finish, conductor];

const maps = (id: number): string => {
  const gym = testGyms().find((found) => found.id === id);
  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
};
const STACKS = `[The Stacks](<${maps(1)}>)`;
const MURAL = `[Harbor Lighthouse Mural](<${maps(7)}>)`;
const FOUNTAIN = `[Old Stone Fountain](<${maps(2)}>)`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/** A train on a route of four gyms, with Alice and Bob coming beside the member who made it. */
async function setup(route: readonly number[] = [4, 1, 7, 2], windowMs = 0, atEnd?: TrainAtEnd) {
  const made = await createdTrain({ route, ...(atEnd === undefined ? {} : { atEnd }) });
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
  await made.attendance.flush();
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
  });
  const context =
    windowMs === 0 ? ctx : { ...ctx, clickAnswers: new ClickAnswers({ log: ctx.log, windowMs }) };
  const router = new InteractionRouter(context, all, [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A command used in the post of the train, by Alice unless `extra` says otherwise. */
  const run = (commandName: string, extra: object = {}) =>
    handle(
      fakeChatInput({ commandName, ...inPost, userId: ALICE, displayName: 'Alice', ...extra }),
    );
  const answer = async (commandName: string, extra?: object): Promise<string | undefined> =>
    sent((await run(commandName, extra)).reply).content;
  /** Everything said in the post, line by line, once all of it has gone out. */
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.trains.flush();
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { ...made, ctx, handle, run, answer, lines, inPost };
}

describe('/next, /previous, /skip and /finish', () => {
  it('/next moves the train to its next stop, tells the member where it is, and the others in the post', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Present);
    const used = await made.run('next');
    expect(used.reply).toHaveBeenCalledWith({
      content: `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
      flags: MessageFlags.Ephemeral,
    });
    expect(made.current().train.stop).toBe(1);
    // Who was here is on the way to the next stop.
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Coming);
    expect(await made.lines()).toEqual([
      `**Bob** (<@${BOB}>) is here.`,
      `The train is moving to ${STACKS}. Moved by **Alice** (<@${ALICE}>).`,
      `<@${REPORTER}> <@${BOB}>`,
    ]);
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
      users: [REPORTER, BOB],
    });
    const message = made.gateway.posts.get(made.postId)?.message;
    expect(textOf(message)).toMatch(/\*\*Where · stop \d+ of \d+\*\*\n\*\*The Stacks\*\* · /);
  });

  it('/finish leaves who was here here, as its help says', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Present);
    await made.run('finish');
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    const details = finish.help.details;
    const text = typeof details === 'function' ? details(made.ctx.config.settings) : details;
    expect(text).toContain('Who was here stays here');
    expect(text).not.toContain('is coming again');
  });

  it('each says where the train is afterwards', async () => {
    const made = await setup();
    expect(await made.answer('skip')).toBe(
      `The train is at stop 3 of 4: ${MURAL}. Next is ${FOUNTAIN}. I am telling the others.`,
    );
    expect(await made.answer('previous')).toBe(
      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
    );
    expect(await made.answer('finish')).toBe(
      `The train has finished its route of 4 stops. \`/previous\` takes it back to stop 2: ${STACKS}. ` +
        'I am telling the others.',
    );
    // Back from the end, the train is where it was when the route was finished.
    expect(await made.answer('previous')).toBe(
      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
    );
    expect(await made.answer('skip')).toBe(
      `The train is at stop 4 of 4: ${FOUNTAIN}. It is the last stop: Next finishes the route. ` +
        'I am telling the others.',
    );
    // From the last stop, next finishes the route.
    expect(await made.answer('next')).toBe(
      `The train has finished its route of 4 stops. \`/previous\` takes it back to stop 4: ${FOUNTAIN}. ` +
        'I am telling the others.',
    );
    expect(made.current()).toMatchObject({ status: 'active', train: { stop: 4 } });
  });

  it('refuse a move that cannot be made, with the reason', async () => {
    const made = await setup();
    expect(await made.answer('previous')).toBe('This train is at its first stop.');
    await made.run('finish');
    expect(await made.answer('next')).toBe('This train has finished its route.');
    expect(await made.answer('finish')).toBe('This train has finished its route.');
    expect(await made.answer('skip')).toBe('There is no stop after the next one to skip to.');
    const empty = await setup([]);
    for (const command of ['next', 'previous', 'skip', 'finish']) {
      expect(await empty.answer(command)).toBe(
        'This train has no route yet. Add its stops with `/route add`.',
      );
    }
    expect(await empty.lines()).toEqual([]);
  });

  it('are for anybody who is signed up while there is no conductor', async () => {
    const made = await setup();
    expect(await made.answer('next', { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(await made.answer('next', { userId: BOB })).toMatch(/^The train is at stop 2 of 4/);
    // Moderators may, signed up or not.
    expect(await made.answer('next', { userId: CAROL, roleNames: ['Moderator'] })).toMatch(
      /^The train is at stop 3 of 4/,
    );
  });

  it('are for the conductor and the moderators alone once there is a conductor', async () => {
    const made = await setup();
    await made.trains.setConductor(made.party.id, { id: BOB });
    for (const command of ['next', 'previous', 'skip', 'finish']) {
      expect(await made.answer(command)).toBe(
        'This train has a conductor: only they and the moderators can move it.',
      );
    }
    expect(made.current().train.stop).toBe(0);
    expect(await made.answer('next', { userId: BOB })).toMatch(/^The train is at stop 2 of 4/);
    expect(await made.answer('next', { roleNames: ['Admin'] })).toMatch(
      /^The train is at stop 3 of 4/,
    );
    // A bot developer is no moderator of raids.
    expect(await made.answer('next', { roleNames: ['Bot Developer'] })).toBe(
      'This train has a conductor: only they and the moderators can move it.',
    );
  });

  it('do not say that the others are told when there are none', async () => {
    const made = await createdTrain({ route: stops(4, 1) });
    const { ctx } = createTestContext({
      partyService: made.service,
      attendance: made.attendance,
      trains: made.trains,
      parties: made.store,
      regions: made.regions,
    });
    const used = fakeChatInput({
      commandName: 'next',
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
      userId: REPORTER,
    });
    await new InteractionRouter(ctx, all, []).handle(used as never);
    expect(sent(used.reply).content).toBe(
      `The train is at stop 2 of 2: ${STACKS}. It is the last stop: Next finishes the route.`,
    );
  });

  it('hold back a member who moves the train more than ten times in a minute', async () => {
    const made = await setup();
    // Each command has its own count: ten times there and ten times back.
    for (let n = 0; n < 10; n++) {
      await made.run('next');
      await made.run('previous');
    }
    expect(await made.answer('next')).toBe('You can use /next again in 1 minute.');
    expect(made.current().train.stop).toBe(0);
  });

  it('work only in the post of a train', async () => {
    const made = await setup();
    expect(await made.answer('next', { channelId: '600000000000000009', thread: undefined })).toBe(
      'Use this in the post of a train that is still active.',
    );
    const meetup = await createdMeetup();
    const { ctx } = createTestContext({
      partyService: meetup.service,
      attendance: meetup.attendance,
      trains: meetup.trains,
      parties: meetup.store,
      regions: meetup.regions,
    });
    const router = new InteractionRouter(ctx, all, []);
    for (const [commandName, subcommand] of [
      ['next'],
      ['previous'],
      ['skip'],
      ['finish'],
      ['conductor', 'set'],
      ['conductor', 'clear'],
    ] as const) {
      const used = fakeChatInput({
        commandName,
        ...(subcommand ? { subcommand } : {}),
        channelId: meetup.postId,
        thread: { parentId: WEST_FORUM },
        userId: REPORTER,
      });
      await router.handle(used as never);
      expect(sent(used.reply).content).toBe(
        'This is the post of a meetup: that only works in the post of a train.',
      );
    }
  });
});

describe('/conductor', () => {
  it('set makes the member the conductor, and the post says so', async () => {
    const made = await setup();
    expect(await made.answer('conductor', { subcommand: 'set' })).toBe(
      'You are the conductor of this train. Only you and the moderators can move it now.',
    );
    expect(made.current().train.conductorId).toBe(ALICE);
    expect(await made.answer('conductor', { subcommand: 'set' })).toBe(
      'You are the conductor of this train already.',
    );
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) is the conductor of this train now.`,
    ]);
    const message = made.gateway.posts.get(made.postId)?.message;
    expect(header(message)).toContain('Conductor: Alice');
  });

  it('set takes over from another conductor, which the post says by name', async () => {
    const made = await setup();
    await made.run('conductor', { subcommand: 'set', userId: BOB, displayName: 'Bob' });
    expect(await made.answer('conductor', { subcommand: 'set' })).toBe(
      `You are the conductor of this train, in the place of **Bob** (<@${BOB}>). ` +
        'Only you and the moderators can move it now.',
    );
    expect((await made.lines()).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) is the conductor of this train now, in the place of **Bob** (<@${BOB}>).`,
    );
    // No line pings anybody.
    for (const message of made.gateway.messagesIn(made.postId)) {
      expect(message.message.mention).toBeUndefined();
    }
  });

  it('set is for a member who is signed up', async () => {
    const made = await setup();
    expect(await made.answer('conductor', { subcommand: 'set', userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(made.current().train.conductorId).toBeNull();
  });

  it('clear is for the conductor themself and for the moderators', async () => {
    const made = await setup();
    expect(await made.answer('conductor', { subcommand: 'clear' })).toBe(
      'This train has no conductor. Anybody who is signed up can move it.',
    );
    await made.run('conductor', { subcommand: 'set', userId: BOB, displayName: 'Bob' });
    expect(await made.answer('conductor', { subcommand: 'clear' })).toBe(
      'Only the conductor of this train and the moderators can do that.',
    );
    expect(await made.answer('conductor', { subcommand: 'clear', roleNames: ['Moderator'] })).toBe(
      'This train has no conductor any more. Anybody who is signed up can move it.',
    );
    await made.run('conductor', { subcommand: 'set', userId: BOB, displayName: 'Bob' });
    expect(
      await made.answer('conductor', { subcommand: 'clear', userId: BOB, displayName: 'Bob' }),
    ).toBe('You are no longer the conductor of this train. Anybody who is signed up can move it.');
    expect(made.current().train.conductorId).toBeNull();
    expect((await made.lines()).filter((line) => /took|no longer/.test(line))).toEqual([
      `**Alice** (<@${ALICE}>) took **Bob** (<@${BOB}>) off as the conductor of this train.`,
      `**Bob** (<@${BOB}>) is no longer the conductor of this train.`,
    ]);
  });
});
