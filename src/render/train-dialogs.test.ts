import { ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
import { checkModal } from '../../test/support/fake-interactions.js';
import { testGym, testGyms } from '../../test/support/gyms.js';
import { PARTY_NOW, PARTY_ZONE, stops, testTrain } from '../../test/support/parties.js';
import { clockTime } from '../domain/web/clock.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { openToken } from '../discord/dialog.js';
import type { TrainAtEnd, TrainParty } from '../domain/party/party.js';
import { gymStop } from '../domain/party/stops.js';
import { placeOf, targetOf } from '../domain/party/train.js';
import type { PostGym } from './raid-post.js';
import {
  MANAGE_FORM,
  MANAGE_KIND,
  MANAGE_END_INPUT,
  MANAGE_START_INPUT,
  manageDialog,
  MOVE_FORM,
  MOVE_INPUT,
  moveDialog,
} from './train-dialogs.js';
import { stopsFrom } from './train-stops.js';

const gyms = new Map<number, PostGym>(testGyms().map((gym) => [gym.id, gym]));
const LONG =
  'A gym whose name goes on and on, past what a choice of a dialog can hold in its label, ' +
  'and further still';
gyms.set(90, testGym(90, LONG, 40.05, -80.05));
gyms.set(91, testGym(91, `${LONG}, again`, 40.05, -80.05));
/** A name over the 75 characters a label keeps after "Previous: back to ", within a description's 100. */
const RATHER_LONG =
  'A gym whose name goes on past what the label of an undo holds, though not much further';
gyms.set(92, testGym(92, RATHER_LONG, 40.05, -80.05));

/** The test train on this route of gyms, at the stop with this index. */
function onRoute(
  route: readonly number[],
  stop = 0,
  atEnd: TrainAtEnd = 'finish',
  finishedFrom?: number,
): TrainParty {
  const train = testTrain();
  return {
    ...train,
    train: {
      ...train.train,
      route: stops(...route),
      stop,
      atEnd,
      ...(finishedFrom === undefined ? {} : { finishedFrom: gymStop(finishedFrom) }),
    },
  };
}

const shown = (party: TrainParty) =>
  moveDialog({ party, stop: stopsFrom({ get: (id) => gyms.get(id) }), now: PARTY_NOW });

/** The choices as [value, label, picked]. */
const choices = (party: TrainParty) =>
  dialogChoices(shown(party)).map(({ value, label, picked }) => [value, label, picked]);

/** The longest ids there are: a party's UUID, gyms of ten digits, a token of 2030 (review r0 B4). */
const LONGEST = { gyms: [4294967295, 4294967294, 4294967293], now: Date.UTC(2030, 11, 31) };

describe('the ids of the dialogs of a train (review r0 B4)', () => {
  it('keep Move…’s custom id and choices within 100 characters, mid-route and finished', () => {
    const view = (party: TrainParty) => ({
      party,
      stop: stopsFrom({ get: (id: number) => gyms.get(id) }),
      now: LONGEST.now,
    });
    const mid = onRoute(LONGEST.gyms, 1, 'loop');
    const finished = onRoute(LONGEST.gyms, 3, 'finish', LONGEST.gyms[1]);
    for (const party of [mid, finished, onRoute(LONGEST.gyms.slice(0, 2), 0)]) {
      expect(party.id.length).toBe(36);
      const dialog = moveDialog(view(party));
      checkModal(dialog);
      expect(dialog.custom_id.length).toBeLessThanOrEqual(100);
      for (const choice of dialogChoices(dialog))
        expect(choice.value.length).toBeLessThanOrEqual(100);
    }
  });

  it('keep Manage…’s custom id within 100 characters', () => {
    for (const party of [
      onRoute(LONGEST.gyms, 1),
      onRoute(LONGEST.gyms, 3, 'finish', LONGEST.gyms[2]),
    ]) {
      const dialog = manageDialog({
        party,
        stop: stopsFrom({ get: (id: number) => gyms.get(id) }),
        now: LONGEST.now,
      });
      checkModal(dialog);
      expect(dialog.custom_id.length).toBeLessThanOrEqual(100);
    }
  });
});

describe('moveDialog (plan 8X-G: Move…)', () => {
  it('asks where to move the train, Next picked, each choice carrying where it leads', () => {
    // 4 Veterans Memorial Bridge, 1 The Stacks, 7 Harbor Lighthouse Mural, 2 Old Stone Fountain.
    const train = onRoute([4, 1, 7, 2], 1);
    const dialog = shown(train);
    checkModal(dialog);
    expect(dialog.title).toBe('Move the train');
    expect(decodeCustomId(dialog.custom_id)).toEqual({
      kind: 'party',
      id: train.id,
      action: MOVE_FORM,
      args: [placeOf(train), openToken(PARTY_NOW)],
    });
    // Where it is, without links (a dialog's links are not known to be clickable).
    expect(dialogTexts(dialog)).toEqual([
      'At stop 2 of 4: **The Stacks**\nNext is **Harbor Lighthouse Mural**',
    ]);
    expect(choices(train)).toEqual([
      [`next:${targetOf(train, 'next')}`, 'Next: Harbor Lighthouse Mural', true],
      [`previous:${targetOf(train, 'previous')}`, 'Previous: Veterans Memorial Bridge', false],
      [
        `skip:${targetOf(train, 'skip')}`,
        'Skip Harbor Lighthouse Mural, go to Old Stone Fountain',
        false,
      ],
    ]);
    const radio = dialog.components.find((component) => 'component' in component);
    // The title says the act; the choice where to (review r0, the controller's call).
    expect(radio).toMatchObject({ label: 'Where to', component: { custom_id: MOVE_INPUT } });
  });

  it('leaves out a move that cannot be made from here, and says what Next does at the end', () => {
    // At the first stop: no Previous.
    expect(choices(onRoute([4, 1, 7], 0)).map(([, label]) => label)).toEqual([
      'Next: The Stacks',
      'Skip The Stacks, go to Harbor Lighthouse Mural',
    ]);
    // At the last stop of each mode.
    expect(choices(onRoute([4, 1, 7], 2)).map(([, label]) => label)).toEqual([
      'Next: finish the route',
      'Previous: The Stacks',
    ]);
    expect(choices(onRoute([4, 1, 7], 2, 'loop'))[0]?.[1]).toBe(
      'Next: round to Veterans Memorial Bridge',
    );
    expect(choices(onRoute([4, 1, 7], 2, 'turn-back'))[0]?.[1]).toBe(
      'Next: turn back to The Stacks',
    );
  });

  it('tells Next and Previous apart at the end of a turn-back route (plan 8X-H, G2)', () => {
    // Next turns the route round; Previous undoes a Next made by mistake, still heading for the
    // end (Matt, 2026-10-23: both stay).
    const dialog = shown(onRoute([4, 1, 7], 2, 'turn-back'));
    checkModal(dialog);
    expect(dialogChoices(dialog).map(({ label, description }) => [label, description])).toEqual([
      ['Next: turn back to The Stacks', undefined],
      [
        'Previous: back to The Stacks (undo)',
        'Back one stop, still heading for the end: undoes a Next made by mistake',
      ],
      ['Skip The Stacks, go to Veterans Memorial Bridge', undefined],
    ]);
  });

  it('cuts a long name in the undo’s label before " (undo)", and Next’s description holds it whole', () => {
    const dialog = shown(onRoute([4, 92, 7], 2, 'turn-back'));
    checkModal(dialog);
    const [next, previous] = dialogChoices(dialog);
    expect(RATHER_LONG.length).toBeGreaterThan(75);
    expect(next?.label.startsWith('Next: turn back to A gym whose name')).toBe(true);
    expect(next?.description).toBe(RATHER_LONG);
    expect(previous?.label.startsWith('Previous: back to A gym whose name')).toBe(true);
    expect(previous?.label.endsWith('… (undo)')).toBe(true);
    expect(previous?.label.length).toBeLessThanOrEqual(100);
    expect(previous?.description).toBe(
      'Back one stop, still heading for the end: undoes a Next made by mistake',
    );
  });

  it('leaves Previous out where it is the very move Next is (a loop of two stops)', () => {
    for (const stop of [0, 1]) {
      const dialog = shown(onRoute([4, 1], stop, 'loop'));
      expect(dialogChoices(dialog)).toEqual([]);
      expect(decodeCustomId(dialog.custom_id)?.args[1]).toBe('next');
    }
    // A loop of three keeps both.
    expect(choices(onRoute([4, 1, 7], 0, 'loop')).map(([, label]) => label)).toEqual([
      'Next: The Stacks',
      'Previous: Harbor Lighthouse Mural',
      'Skip The Stacks, go to Harbor Lighthouse Mural',
    ]);
  });

  it('has no choice where one move is left: the text says what Submit does, the id the move', () => {
    // A finished route: Previous alone, which takes a mistaken Finish back.
    const finished = onRoute([4, 1, 7], 3, 'finish', 1);
    const dialog = shown(finished);
    checkModal(dialog);
    expect(dialogChoices(dialog)).toEqual([]);
    // Said once, and without Previous, which the dialog does not have (plan 8X-H, G3).
    expect(dialogTexts(dialog)).toEqual([
      'The train has finished its route of 3 stops.\n\n' +
        'Submit takes it back to stop 2, **The Stacks**.',
    ]);
    expect(decodeCustomId(dialog.custom_id)?.args).toEqual([
      'end',
      'previous',
      targetOf(finished, 'previous'),
      openToken(PARTY_NOW),
    ]);
    // Stop 1 of a route of two that finishes: Next alone.
    const two = shown(onRoute([4, 1], 0));
    expect(dialogChoices(two)).toEqual([]);
    expect(dialogTexts(two)[0]).toMatch(/\n\nSubmit moves it to \*\*The Stacks\*\*\.$/);
  });

  it('cuts long names to fit a choice, and gives them whole in its description', () => {
    const train = onRoute([4, 90, 91], 0);
    const dialog = shown(train);
    checkModal(dialog);
    const [next, skip] = dialogChoices(dialog);
    expect(next?.label.length).toBeLessThanOrEqual(100);
    expect(next?.label.endsWith('…')).toBe(true);
    // The description holds more of it than the label (Discord takes 100 of each).
    expect(next?.description?.startsWith(LONG.slice(0, 90))).toBe(true);
    expect(next?.description?.length).toBeLessThanOrEqual(100);
    expect(next?.description?.length).toBeGreaterThan((next?.label.length ?? 0) - 'Next: '.length);
    expect(skip?.label.length).toBeLessThanOrEqual(100);
    expect(skip?.label).toMatch(/^Skip A gym whose .*…, go to A gym whose .*…$/);
  });
});

const managed = (party: TrainParty) =>
  manageDialog({ party, stop: stopsFrom({ get: (id) => gyms.get(id) }), now: PARTY_NOW });

/** The labels of a dialog's choices, with the values of each and which is picked. */
function managedChoices(party: TrainParty) {
  const dialog = managed(party);
  return dialog.components.flatMap((component) =>
    component.type === ComponentType.Label &&
    (component.component.type === ComponentType.RadioGroup ||
      component.component.type === ComponentType.StringSelect)
      ? [
          {
            label: component.label,
            menu: component.component.type === ComponentType.StringSelect,
            options: component.component.options.map(
              (option) => `${option.value}${option.default === true ? '*' : ''}`,
            ),
          },
        ]
      : [],
  );
}

describe('manageDialog (plan 8X-G: Manage…)', () => {
  // Matt, 2026-10-30: only a typed /meet set a start after a train was made. 2026-11-07: and the
  // end, as the map's Manage… asks it, so that /end is not needed.
  it('asks the start and the end of who may arrange the train, as the map’s form, within five components', () => {
    const train = onRoute([4, 1, 7, 2], 0);
    const view = { party: train, stop: stopsFrom({ get: (id) => gyms.get(id) }), now: PARTY_NOW };
    const asked = manageDialog(view, { zone: PARTY_ZONE });
    checkModal(asked);
    // The route, the mode, the kind, the start and the end: Discord's five. Where the train is
    // goes with "Finish it here", the text left out; the times now under their labels.
    expect(asked.components).toHaveLength(5);
    expect(dialogTexts(asked)).toEqual([]);
    expect(dialogChoices(asked).find((choice) => choice.value === 'finish')?.description).toBe(
      'At stop 1 of 4: Veterans Memorial Bridge',
    );
    expect(asked.components.slice(-2)).toEqual([
      expect.objectContaining({
        label: 'Starts',
        description: 'Starts now: none',
        component: expect.objectContaining({
          custom_id: MANAGE_START_INPUT,
          required: false,
          max_length: 40,
          placeholder: '6:15pm, in 30, or cancel',
        }) as unknown,
      }),
      expect.objectContaining({
        label: 'Ends',
        description: 'Ends now: none',
        component: expect.objectContaining({
          custom_id: MANAGE_END_INPUT,
          required: false,
          max_length: 40,
          placeholder: '8pm, in 90, or none',
        }) as unknown,
      }),
    ]);
    const without = manageDialog(view);
    expect(JSON.stringify(without)).not.toContain(MANAGE_START_INPUT);
    expect(JSON.stringify(without)).not.toContain(`"custom_id":"${MANAGE_END_INPUT}"`);
    expect(dialogTexts(without)).toEqual([
      'At stop 1 of 4: **Veterans Memorial Bridge**\nNext is **The Stacks**',
    ]);
    const set = manageDialog(
      {
        ...view,
        party: {
          ...train,
          timed: { ...train.timed, startTime: PARTY_NOW },
          endTime: PARTY_NOW + 3_600_000,
        },
      },
      { zone: PARTY_ZONE },
    );
    // In the posts' zone as the map says them (`clockTime`), with the day when it is not today.
    expect(
      set.components.slice(-2).map((one) => ('description' in one ? one.description : '')),
    ).toEqual([
      `Starts now: ${clockTime(PARTY_NOW, PARTY_ZONE, PARTY_NOW)}`,
      `Ends now: ${clockTime(PARTY_NOW + 3_600_000, PARTY_ZONE, PARTY_NOW)}`,
    ]);
  });

  it('keeps its text where there is room: a train without a route asks its kind and times', () => {
    const view = {
      party: onRoute([]),
      stop: stopsFrom({ get: (id) => gyms.get(id) }),
      now: PARTY_NOW,
    };
    const asked = manageDialog(view, { zone: PARTY_ZONE });
    checkModal(asked);
    expect(asked.components).toHaveLength(4);
    expect(dialogTexts(asked)).toEqual([
      'This train has no route yet. Add its stops with `/route add`.',
    ]);
  });

  it('asks the route, the mode and the kind, each with what the train has picked', () => {
    const train = onRoute([4, 1, 7, 2], 0);
    const dialog = managed(train);
    checkModal(dialog);
    expect(dialog.title).toBe('Manage the train');
    expect(dialogTexts(dialog)).toEqual([
      'At stop 1 of 4: **Veterans Memorial Bridge**\nNext is **The Stacks**',
    ]);
    expect(managedChoices(train)).toEqual([
      { label: 'The route', menu: false, options: ['keep*', 'reverse', 'finish'] },
      {
        label: 'At the end of the route',
        menu: true,
        options: ['finish*', 'loop', 'turn-back'],
      },
      {
        label: 'What the train is mainly for',
        menu: true,
        options: ['raid*', 'dynamax', 'gigantamax'],
      },
    ]);
    expect(
      dialogChoices(dialog)
        .slice(0, 3)
        .map(({ label }) => label),
    ).toEqual(['Keep it as it is', 'Reverse it', 'Finish it here']);
    // Where the train was, the stop the route began with, and the mode and kind shown.
    expect(decodeCustomId(dialog.custom_id)).toEqual({
      kind: MANAGE_KIND,
      id: train.id,
      action: MANAGE_FORM,
      args: ['4', '4', 'f', 'r', openToken(PARTY_NOW)],
    });
  });

  it('offers only what can be done with the route, and leaves it out when only Keep is left', () => {
    // In the middle of a route that finishes: no Reverse.
    expect(managedChoices(onRoute([4, 1, 7, 2], 1))[0]?.options).toEqual(['keep*', 'finish']);
    // A finished route: no Finish; Reverse only where it was finished from its last stop (2).
    expect(managedChoices(onRoute([4, 1, 7, 2], 4, 'finish', 2))[0]?.options).toEqual([
      'keep*',
      'reverse',
    ]);
    // Finished from another stop: only Keep is left, and the route is not asked.
    expect(managedChoices(onRoute([4, 1, 7, 2], 4, 'finish', 1)).map(({ label }) => label)).toEqual(
      ['At the end of the route', 'What the train is mainly for'],
    );
    // A turn-back train, mid-route: Finish alone with Keep.
    expect(managedChoices(onRoute([4, 1, 7, 2], 1, 'turn-back'))[0]?.options).toEqual([
      'keep*',
      'finish',
    ]);
  });

  it('says of a finished route only that it is finished, and that Reverse starts it again (review r0 B3)', () => {
    const finished = onRoute([4, 1, 7, 2], 4, 'finish', 2);
    expect(dialogTexts(managed(finished))).toEqual([
      'The train has finished its route of 4 stops.',
    ]);
    const reverse = dialogChoices(managed(finished)).find((choice) => choice.value === 'reverse');
    expect(reverse).toMatchObject({
      label: 'Reverse it',
      description:
        'Starts the route again from its last stop, Old Stone Fountain, the other way round',
    });
    // On a route on its way, Reverse says nothing more.
    const going = dialogChoices(managed(onRoute([4, 1, 7, 2], 0))).find(
      (choice) => choice.value === 'reverse',
    );
    expect(going?.description).toBeUndefined();
  });

  it('asks a train without a route its kind alone', () => {
    const train = onRoute([], 0);
    const dialog = managed({ ...train, train: { ...train.train, kind: 'dynamax' } });
    checkModal(dialog);
    expect(dialogTexts(dialog)).toEqual([
      'This train has no route yet. Add its stops with `/route add`.',
    ]);
    expect(managedChoices({ ...train, train: { ...train.train, kind: 'dynamax' } })).toEqual([
      {
        label: 'What the train is mainly for',
        menu: true,
        options: ['raid', 'dynamax*', 'gigantamax'],
      },
    ]);
  });

  it('shows the kinds of max battles with the application’s Dynamax and Gigantamax emoji', () => {
    const train = onRoute([4, 1], 0);
    const view = { party: train, stop: stopsFrom({ get: (id) => gyms.get(id) }), now: PARTY_NOW };
    const kindEmoji = (dialog: ReturnType<typeof manageDialog>) =>
      dialog.components.flatMap((component) =>
        component.type === ComponentType.Label &&
        component.component.type === ComponentType.StringSelect &&
        component.label === 'What the train is mainly for'
          ? component.component.options.map((option) => [option.value, option.emoji])
          : [],
      );
    const own: Record<string, string> = {
      pinedmax: '<:pinedmax:123456789012345678>',
      pinegmax: '<:pinegmax:123456789012345679>',
    };
    const icons = { controlIcon: (name: string) => own[name] };
    const withIcons = manageDialog({ ...view, icons });
    checkModal(withIcons);
    expect(kindEmoji(withIcons)).toEqual([
      ['raid', { name: '⚔️' }],
      ['dynamax', { id: '123456789012345678', name: 'pinedmax' }],
      ['gigantamax', { id: '123456789012345679', name: 'pinegmax' }],
    ]);
    // Until the application has them, the plain emoji.
    expect(kindEmoji(manageDialog(view))).toEqual([
      ['raid', { name: '⚔️' }],
      ['dynamax', { name: '🔴' }],
      ['gigantamax', { name: '🌋' }],
    ]);
  });
});
