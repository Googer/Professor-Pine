import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogChoices, dialogOf, shownDialog } from '../../../test/support/dialogs.js';
import {
  fakeButton,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { testGyms } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL, PARTY_NOW } from '../../../test/support/parties.js';
import { createdTrain } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import { MOVE_INPUT } from '../../render/train-dialogs.js';

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

/** A train on a route of four gyms (4, 1, 7, 2), with Alice and Bob coming. */
async function setup() {
  const made = await createdTrain({ route: [4, 1, 7, 2] });
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [], [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const who = (userId: string) => ({
    userId,
    displayName: userId === ALICE ? 'Alice' : 'Bob',
    channelId: made.postId,
  });
  /** A press of Move… on the post. */
  const open = (userId = ALICE) =>
    handle(fakeButton({ customId: `party:${made.party.id}:move`, ...who(userId) }));
  /** The Submit of a Move… dialog, with this choice picked where it has one. */
  const submit = (
    dialog: APIModalInteractionResponseCallbackData,
    picked?: string,
    userId = ALICE,
  ) =>
    handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        ...(picked === undefined ? {} : { picked: { [MOVE_INPUT]: picked } }),
        ...who(userId),
      }),
    );
  const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;
  return { ...made, ctx, handle, open, submit, answerOf };
}

/** The value of a dialog's choice whose label begins so. */
function choiceOf(dialog: APIModalInteractionResponseCallbackData, label: string): string {
  const found = dialogChoices(dialog).find((choice) => choice.label.startsWith(label));
  if (!found) throw new Error(`no choice ${label}`);
  return found.value;
}

describe('Move… of a train’s post (plan 8X-G)', () => {
  it('opens the dialog, and its Submit moves the train and says where it is privately', async () => {
    const made = await setup();
    const pressed = await made.open();
    const dialog = shownDialog(pressed);
    expect(dialog.title).toBe('Move the train');
    const submitted = await made.submit(dialog, choiceOf(dialog, 'Next'));
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(made.current().train.stop).toBe(1);
    expect(made.answerOf(submitted)).toBe(
      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
    );
    // Closing the dialog moves nothing: nothing happens without a Submit.
    await made.open();
    expect(made.current().train.stop).toBe(1);
  });

  it('skips and goes back as picked', async () => {
    const made = await setup();
    const first = shownDialog(await made.open());
    await made.submit(first, choiceOf(first, 'Skip'));
    expect(made.current().train.stop).toBe(2);
    const second = shownDialog(await made.open());
    const back = await made.submit(second, choiceOf(second, 'Previous'));
    expect(made.current().train.stop).toBe(1);
    expect(made.answerOf(back)).toMatch(/^The train is at stop 2 of 4/);
  });

  it('moves the train once when two members submit Next from dialogs opened at the same stop', async () => {
    const made = await setup();
    const alice = shownDialog(await made.open());
    const bob = shownDialog(await made.open(BOB));
    const first = await made.submit(alice, choiceOf(alice, 'Next'));
    const second = await made.submit(bob, choiceOf(bob, 'Next'), BOB);
    expect(made.current().train.stop).toBe(1);
    expect(made.answerOf(first)).toMatch(/^The train is at stop 2 of 4/);
    expect(made.answerOf(second)).toBe(
      'The train has moved on since you opened this: ' +
        `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}.`,
    );
  });

  it('refuses who may not move the train before it opens, and again at Submit', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open(BOB));
    await made.trains.setConductor(made.party.id, { id: ALICE, name: 'Alice' });
    const refused = await made.open(BOB);
    expect(dialogOf(refused)).toBeUndefined();
    expect(sent(refused.reply)).toEqual({
      content: expect.stringMatching(/conductor/) as unknown,
      flags: MessageFlags.Ephemeral,
    });
    const late = await made.submit(dialog, choiceOf(dialog, 'Next'), BOB);
    expect(made.current().train.stop).toBe(0);
    expect(made.answerOf(late)).toMatch(/conductor/);
  });

  it('says Move… takes a route finished by its Next back, the post having no Previous', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'skip', false);
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    const dialog = shownDialog(await made.open());
    const submitted = await made.submit(dialog, choiceOf(dialog, 'Next'));
    expect(made.answerOf(submitted)).toBe(
      `The train has finished its route of 4 stops. Move… takes it back to stop 4: ${FOUNTAIN}. ` +
        'I am telling the others.',
    );
  });

  it('takes a mistaken Finish back from a finished route, the move in the dialog’s id', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    await made.trains.move(made.party.id, { id: ALICE }, 'finish', false);
    const dialog = shownDialog(await made.open());
    expect(dialogChoices(dialog)).toEqual([]);
    const submitted = await made.submit(dialog);
    expect(made.current().train.stop).toBe(1);
    expect(made.answerOf(submitted)).toMatch(/^The train is at stop 2 of 4/);
  });

  it('answers a Submit without its choice, or of a train that is gone, without moving anything', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    const forged = await made.handle(
      fakeModal({ customId: dialog.custom_id, userId: ALICE, channelId: made.postId }),
    );
    expect(sent(forged.reply).content).toBe(STALE_COMPONENT);
    expect(made.current().train.stop).toBe(0);
    await made.service.end(made.party.id);
    const over = await made.submit(dialog, choiceOf(dialog, 'Next'));
    expect(made.answerOf(over)).toBe('This train is over.');
  });

  it('is not offered on a train that is over', async () => {
    const made = await setup();
    await made.service.end(made.party.id);
    const pressed = await made.open(CAROL);
    expect(dialogOf(pressed)).toBeUndefined();
    expect(sent(pressed.reply).content).toBe('This train is over.');
  });
});
