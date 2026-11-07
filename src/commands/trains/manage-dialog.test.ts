import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogField, dialogOf, dialogTexts, shownDialog } from '../../../test/support/dialogs.js';
import {
  fakeButton,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { ALICE, BOB, CAROL, PARTY_NOW, stops } from '../../../test/support/parties.js';
import { createdTrain } from '../../../test/support/party-service.js';
import { refusedBody } from '../../../test/support/fake-gateway.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { EmojiFinder } from '../../services/application-emoji.js';
import { manageControls } from './move.js';
import { components } from '../../components/index.js';
import { partyButtons } from '../../components/party.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import { CHANGE_THROTTLE } from '../raids/change.js';
import {
  MANAGE_AT_END_INPUT,
  MANAGE_KIND_INPUT,
  MANAGE_ROUTE_INPUT,
  MANAGE_END_INPUT,
  MANAGE_START_INPUT,
} from '../../render/train-dialogs.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/** A train on a route of four gyms (4, 1, 7, 2), with Alice and Bob coming. */
async function setup(route: readonly number[] = [4, 1, 7, 2], emoji?: EmojiFinder) {
  const made = await createdTrain({ route });
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
    ...(emoji === undefined ? {} : { emoji }),
  });
  const router = new InteractionRouter(ctx, [], [partyButtons, manageControls]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const who = (userId: string, extra: object = {}) => ({
    userId,
    displayName: userId === ALICE ? 'Alice' : 'Somebody',
    channelId: made.postId,
    ...extra,
  });
  /** A press of Manage… on the post. */
  const open = (userId = ALICE, extra: object = {}) =>
    handle(fakeButton({ customId: `party:${made.party.id}:manage`, ...who(userId, extra) }));
  /** The Submit of a Manage… dialog with these picked; what is not given is as it was shown. */
  const submit = (
    dialog: APIModalInteractionResponseCallbackData,
    asked: { route?: string; atEnd?: string; kind?: string; start?: string; end?: string },
    userId = ALICE,
  ) => {
    const party = made.current();
    const inputs = new Set(
      dialog.components.flatMap((component) =>
        'component' in component ? [component.component.custom_id] : [],
      ),
    );
    return handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        ...(inputs.has(MANAGE_START_INPUT)
          ? {
              fields: {
                [MANAGE_START_INPUT]: asked.start ?? '',
                [MANAGE_END_INPUT]: asked.end ?? '',
              },
            }
          : {}),
        ...(inputs.has(MANAGE_ROUTE_INPUT)
          ? { picked: { [MANAGE_ROUTE_INPUT]: asked.route ?? 'keep' } }
          : {}),
        selected: {
          ...(inputs.has(MANAGE_AT_END_INPUT)
            ? { [MANAGE_AT_END_INPUT]: [asked.atEnd ?? party.train.atEnd] }
            : {}),
          [MANAGE_KIND_INPUT]: [asked.kind ?? party.train.kind],
        },
        ...who(userId),
      }),
    );
  };
  const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;
  const lines = async (): Promise<string[]> => {
    await made.trains.flush();
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { ...made, ctx, handle, who, open, submit, answerOf, lines };
}

describe('the start in Manage… of a train’s post (Matt, 2026-10-30)', () => {
  it('sets it as /meet reads it, blank keeps it, and cancel removes it', async () => {
    const made = await setup();
    const set = await made.submit(shownDialog(await made.open()), { start: 'in 30' });
    expect(made.answerOf(set)).toMatch(/^This train starts at /u);
    const at = made.current().timed.startTime;
    expect(at).toBe(PARTY_NOW - (PARTY_NOW % 60_000) + 30 * 60_000);
    const kept = await made.submit(shownDialog(await made.open()), {});
    expect(made.answerOf(kept)).toBe('Nothing changed.');
    expect(made.current().timed.startTime).toBe(at);
    const removed = await made.submit(shownDialog(await made.open()), { start: 'cancel' });
    expect(made.answerOf(removed)).toMatch(/^This train has no start time any more\./u);
    expect(made.current().timed.startTime).toBeNull();
  });

  it('counts a start in /meet’s window; a time it cannot read costs no use, a blank field none', async () => {
    const made = await setup();
    const typed = async (start: string) => made.submit(shownDialog(await made.open()), { start });
    // However often: it is read before anything counts, as `/meet` reads it.
    for (let tries = 0; tries < 6; tries++) {
      const bad = await typed('whenever');
      expect(sent(bad.reply).content).toContain('I could not read "whenever"');
    }
    expect(made.current().timed.startTime).toBeNull();
    await typed('in 30');
    await typed('in 40');
    await typed('in 50');
    await made.submit(shownDialog(await made.open()), {});
    const over = await typed('in 60');
    expect(sent(over.reply).content).toMatch(/^You can use \/meet again in /u);
    expect(made.current().timed.startTime).toBe(PARTY_NOW - (PARTY_NOW % 60_000) + 50 * 60_000);
  });

  it('is a control of the bot, and a dialog opened before it was a kind of its own still submits', async () => {
    expect(components).toContain(manageControls);
    const made = await setup();
    const dialog = shownDialog(await made.open());
    const before = { ...dialog, custom_id: dialog.custom_id.replace(/^tmanage/u, 'party') };
    await made.submit(before, { kind: 'dynamax' });
    expect(made.current().train.kind).toBe('dynamax');
  });

  it('refuses a start of who has left the train since the form opened, uncounted', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    const forged = { ...dialog, components: [...dialog.components] };
    for (let tries = 0; tries < 5; tries++) {
      const refused = await made.handle(
        fakeModal({
          customId: forged.custom_id,
          form: forged,
          fields: { [MANAGE_START_INPUT]: 'in 30' },
          picked: { [MANAGE_ROUTE_INPUT]: 'keep' },
          selected: { [MANAGE_AT_END_INPUT]: ['finish'], [MANAGE_KIND_INPUT]: ['raid'] },
          userId: CAROL,
          channelId: made.postId,
          roleNames: ['Moderator'],
        }),
      );
      expect(sent(refused.reply).content).toBe('You are not signed up for this train.');
    }
    expect(made.current().timed.startTime).toBeNull();
  });

  // Matt, 2026-11-07: the end too, as the map's Manage… asks it, through /end's path.
  it('sets the end as /end does, in its words, alone or with the start', async () => {
    const made = await setup();
    const ended = await made.submit(shownDialog(await made.open()), { end: 'in 90' });
    expect(made.answerOf(ended)).toMatch(/^This train ends at <t:\d+:t> \(<t:\d+:R>\)\.$/u);
    const end = PARTY_NOW - (PARTY_NOW % 60_000) + 90 * 60_000;
    expect(made.current().endTime).toBe(end);
    const both = await made.submit(shownDialog(await made.open()), { start: 'in 30', end: 'none' });
    expect(made.answerOf(both)).toMatch(
      /^This train starts at .* This train has no end time any more\.$/u,
    );
    expect(made.current().endTime).toBeNull();
  });

  it('refuses an end it cannot read in /end’s words before it counts, and counts one in /end’s window', async () => {
    const made = await setup();
    for (let tries = 0; tries < 12; tries++) {
      const bad = await made.submit(shownDialog(await made.open()), { end: 'whenever' });
      expect(sent(bad.reply).content).toContain(
        'I could not read "whenever" as the time the train ends.',
      );
    }
    for (let use = 0; use < CHANGE_THROTTLE.uses; use++) {
      await made.submit(shownDialog(await made.open()), { end: `in ${String(60 + use)}` });
    }
    const over = await made.submit(shownDialog(await made.open()), { end: 'in 200' });
    expect(sent(over.reply).content).toMatch(/^You can use \/end again in /u);
  });

  it('does not ask the start of staff who are not signed up, as /meet does not let them', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open(CAROL, { roleNames: ['Moderator'] }));
    expect(JSON.stringify(dialog)).not.toContain(MANAGE_START_INPUT);
    expect(JSON.stringify(dialog)).not.toContain(`"custom_id":"${MANAGE_END_INPUT}"`);
  });
});

describe('Manage… of a train’s post (plan 8X-G)', () => {
  it('reverses the route, sets the mode and the kind in one Submit, and says what it did', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    expect(dialog.title).toBe('Manage the train');
    const submitted = await made.submit(dialog, {
      route: 'reverse',
      atEnd: 'loop',
      kind: 'dynamax',
    });
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(made.current().train).toMatchObject({
      kind: 'dynamax',
      atEnd: 'loop',
      route: stops(2, 7, 1, 4),
    });
    expect(made.answerOf(submitted)).toMatch(
      /^This train is a Max Battle Train now\. The route is reversed\. At the end it loops back to the first stop\. The train is at stop 4 of 4/,
    );
    // One line in the post for all three (after the lines of the sign-ups).
    expect((await made.lines()).at(-1)).toMatch(
      /made this a Max Battle Train\. The route was reversed by .+ set the train to loop\.$/,
    );
  });

  it('changes only what was picked otherwise than shown, and answers a Submit that changes nothing', async () => {
    const made = await setup();
    const alice = shownDialog(await made.open());
    // Bob makes it loop while Alice's dialog is open; she changes only the kind.
    await made.setAtEnd({ id: BOB }, false, 'loop');
    await made.submit(alice, { atEnd: 'finish', kind: 'gigantamax' });
    expect(made.current().train).toMatchObject({ kind: 'gigantamax', atEnd: 'loop' });
    const again = shownDialog(await made.open());
    expect(made.answerOf(await made.submit(again, {}))).toBe('Nothing changed.');
  });

  it('finishes the route here, and refuses a route change from a dialog opened elsewhere', async () => {
    const made = await setup();
    const early = shownDialog(await made.open());
    await made.trains.move(made.party.id, { id: BOB }, 'next', false);
    const late = await made.submit(early, { route: 'finish', kind: 'dynamax' });
    expect(made.current().train).toMatchObject({ stop: 1, kind: 'raid' });
    expect(made.answerOf(late)).toMatch(
      /^The train has moved on since you opened this: The train is at stop 2 of 4.*\. Nothing was changed\.$/,
    );
    // The kind and the mode alone from that dialog ask nothing of where the train is (review r0
    // B1): both are applied.
    const both = await made.submit(early, { atEnd: 'loop', kind: 'gigantamax' });
    expect(made.current().train).toMatchObject({ stop: 1, kind: 'gigantamax', atEnd: 'loop' });
    expect(made.answerOf(both)).toBe(
      'This train is a Gigantamax Train now. At the end it loops back to the first stop.',
    );
    const fresh = shownDialog(await made.open());
    const finished = await made.submit(fresh, { route: 'finish' });
    expect(made.current().train.stop).toBe(4);
    expect(made.answerOf(finished)).toMatch(
      /^The train has finished its route of 4 stops\. Move… takes it back to stop 2: /,
    );
  });

  it('asks a train without a route its kind alone, and is for who may move it and staff', async () => {
    const made = await setup([]);
    const dialog = shownDialog(await made.open());
    expect(dialogTexts(dialog)).toEqual([
      'This train has no route yet. Add its stops with `/route add`.',
    ]);
    // Its start and end as they are now under their labels, as the map says them (2026-11-07).
    expect(dialogField(dialog, 'Starts').description).toBe('Starts now: none');
    await made.submit(dialog, { kind: 'gigantamax' });
    expect(made.current().train.kind).toBe('gigantamax');
    const stranger = await made.open(CAROL);
    expect(dialogOf(stranger)).toBeUndefined();
    expect(sent(stranger.reply).content).toBe('You are not signed up for this train.');
    expect(dialogOf(await made.open(CAROL, { roleNames: ['Moderator'] }))).toBeDefined();
    // The button of a post drawn before 8X-G, on a train without a route, opens Manage….
    const old = await made.handle(
      fakeButton({
        customId: `party:${made.party.id}:move`,
        userId: ALICE,
        channelId: made.postId,
      }),
    );
    expect(dialogOf(old)?.title).toBe('Manage the train');
  });

  it('reverses the route once when two members submit Reverse from dialogs opened at one stop (review r0 B5)', async () => {
    const made = await setup();
    const alice = shownDialog(await made.open());
    const bob = shownDialog(await made.open(BOB));
    await made.submit(alice, { route: 'reverse' });
    const second = await made.submit(bob, { route: 'reverse' }, BOB);
    expect(made.current().train.route).toEqual(stops(2, 7, 1, 4));
    expect(made.answerOf(second)).toMatch(/^The train has moved on since you opened this: /);
    expect((await made.lines()).filter((line) => line.includes('reversed'))).toHaveLength(1);
  });

  it('answers a forged Submit as stale, and the controls of the old panel too', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    const forged = await made.handle(
      fakeModal({ customId: dialog.custom_id, userId: ALICE, channelId: made.postId }),
    );
    expect(sent(forged.reply).content).toBe(STALE_COMPONENT);
    for (const action of ['next:4:1', 'previous:4:4', 'skip:4:7', 'finish:4', 'reverse:4:4']) {
      const pressed = await made.handle(
        fakeButton({
          customId: `party:${made.party.id}:${action}`,
          userId: ALICE,
          channelId: made.postId,
        }),
      );
      expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
    }
    expect(made.current().train.stop).toBe(0);
  });
});

describe('the kinds of Manage… with the application’s emoji', () => {
  /** The emoji of the kind menu's options of a dialog. */
  const kindEmoji = (dialog: APIModalInteractionResponseCallbackData) =>
    dialog.components.flatMap((component) =>
      'component' in component &&
      component.component.custom_id === MANAGE_KIND_INPUT &&
      'options' in component.component
        ? component.component.options.map((option) =>
            'emoji' in option ? option.emoji : undefined,
          )
        : [],
    );
  const own: Record<string, string> = { pinedmax: '<:pinedmax:1400000000000000005>' };

  it('opens again without them, the emoji read anew, when Discord refuses one', async () => {
    const refused = vi.fn();
    const made = await setup(undefined, { find: (name) => own[name], refused });
    const press = fakeButton({ customId: `party:${made.party.id}:manage`, ...made.who(ALICE) });
    press.showModal.mockRejectedValueOnce(refusedBody('an emoji of a menu was refused'));
    await made.handle(press);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(press.showModal).toHaveBeenCalledTimes(2);
    const [first, second] = press.showModal.mock.calls.map(
      (call) => call[0] as APIModalInteractionResponseCallbackData,
    );
    expect(kindEmoji(first!)[1]).toEqual({ id: '1400000000000000005', name: 'pinedmax' });
    expect(kindEmoji(second!)).toEqual([{ name: '⚔️' }, { name: '🔴' }, { name: '🌋' }]);
  });

  it('opens once with the plain emoji, and gives up on another refusal', async () => {
    const refused = vi.fn();
    const made = await setup(undefined, { find: () => undefined, refused });
    const press = fakeButton({ customId: `party:${made.party.id}:manage`, ...made.who(ALICE) });
    press.showModal.mockRejectedValueOnce(refusedBody('something else'));
    await made.handle(press);
    expect(press.showModal).toHaveBeenCalledTimes(1);
    expect(refused).not.toHaveBeenCalled();
  });
});
