import { stopsFrom } from './train-stops.js';
import {
  ComponentType,
  type APIModalInteractionResponseCallbackData,
  type APIRadioGroupComponent,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import { checkModal } from '../../test/support/fake-interactions.js';
import { testGyms } from '../../test/support/gyms.js';
import {
  ALICE,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  testTrain,
  withAttendees,
  stops,
} from '../../test/support/parties.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { openToken } from '../discord/dialog.js';
import type {
  Attendee,
  GroupId,
  PartyGroup,
  TrainDetails,
  TrainParty,
} from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { groupMark } from '../domain/party/train.js';
import type { PostGym } from './raid-post.js';
import {
  SPLIT_FORM,
  SPLIT_GROUP_INPUT,
  splitChoice,
  splitDialog,
  type SplitView,
} from './train-split.js';

const HOUR = 3_600_000;
const gyms = new Map<number, PostGym>(testGyms().map((gym) => [gym.id, gym]));
const DAVE = '200000000000000005';
const ERIKA = '200000000000000006';

/**
 * "Saturday legendaries" on stop 2 of 3 (4, 1, 7): the maker (named Ash, interested) in A with
 * Carol, group B (Fast) with Alice (named Dawn) and Bob (named Iris).
 */
function train(more: Partial<TrainDetails> = {}, groups?: PartyGroup[]): TrainParty {
  const made = withAttendees(testTrain(), {
    [REPORTER]: { name: 'Ash', status: PartyStatus.Interested },
    [CAROL]: { name: 'Carol' },
    [ALICE]: { group: 'B', name: 'Dawn' },
    [BOB]: { group: 'B', name: 'Iris' },
  });
  return {
    ...made,
    forumChannelId: '900000000000000001',
    forumPostId: '910000000000000001',
    groups: groups ?? [{ id: 'A' }, { id: 'B', label: 'Fast' }],
    defaultGroupId: 'B',
    train: { ...made.train, route: stops(4, 1, 7), stop: 1, ...more },
  };
}

function view(party: TrainParty, extra: Partial<SplitView> = {}): SplitView {
  return {
    party,
    stop: stopsFrom(gyms),
    memberId: ALICE,
    staff: false,
    anonymous: false,
    now: PARTY_NOW,
    ...extra,
  };
}

/** The texts of the dialog's text displays. */
function textsOf(dialog: APIModalInteractionResponseCallbackData): string[] {
  return dialog.components.flatMap((component) =>
    component.type === ComponentType.TextDisplay ? [component.content] : [],
  );
}

/** The radio group of the dialog, if it has one. */
function radioOf(dialog: APIModalInteractionResponseCallbackData):
  | {
      label: string;
      radio: APIRadioGroupComponent;
    }
  | undefined {
  for (const component of dialog.components) {
    if (
      component.type === ComponentType.Label &&
      component.component.type === ComponentType.RadioGroup
    ) {
      return { label: component.label, radio: component.component };
    }
  }
  return undefined;
}

/** The one-group dialog's text, for the member and group `extra` and `group` say. */
const textOf = (party: TrainParty, extra: Partial<SplitView> = {}, group: GroupId = 'B'): string =>
  textsOf(splitDialog(view(party, extra), [group])).join('\n');

describe('the dialog of splitting one group off', () => {
  it('says what becomes of the group, who moves and who leads, and has nothing to pick', () => {
    const party = train({ conductorId: CAROL });
    const dialog = splitDialog(view(party), ['B']);
    expect(() => checkModal(dialog)).not.toThrow();
    expect(dialog.title).toBe('Split a group off the train');
    expect(decodeCustomId(dialog.custom_id)).toEqual({
      kind: 'party',
      id: party.id,
      action: SPLIT_FORM,
      args: ['B', groupMark(party, 'B'), openToken(PARTY_NOW)],
    });
    expect(dialog.components).toHaveLength(1);
    expect(textsOf(dialog)).toEqual([
      [
        'Group **B (Fast)** leaves **Saturday legendaries** and becomes a train of its own, ' +
          '**Saturday legendaries (Fast)**:',
        '- the same route, at the same stop (stop 2 of 3: The Stacks), the same boss ' +
          'and start, and it does the same at the end of the route',
        '- Dawn and Iris move to it as they are signed up now',
        '- you are its conductor; Carol stays the conductor of Saturday legendaries',
        '',
        'Submit splits it off.',
      ].join('\n'),
    ]);
  });

  it('says where the train is as it is: no route, finished, not started yet', () => {
    expect(textOf(train({ route: [], stop: 0 }))).toContain(
      '- no route yet, the same boss and start, and it does the same at the end of the route',
    );
    expect(textOf(train({ stop: 3 }))).toContain(
      '- the same route, finished, the same boss and start, and it does the same at the end of the route',
    );
    const waiting = {
      ...train(),
      timed: { name: 'Saturday legendaries', startTime: PARTY_NOW + HOUR },
    };
    expect(textOf(waiting)).toContain(
      '- the same route, at the same stop (stop 2 of 3: The Stacks), not started yet, ' +
        'the same boss and start, and it does the same at the end of the route',
    );
  });

  it('names who leads each train afterwards', () => {
    // The conductor goes with the group.
    expect(textOf(train({ conductorId: ALICE }))).toContain(
      '- you are its conductor, and Saturday legendaries has none then',
    );
    expect(textOf(train({ conductorId: BOB }), { memberId: BOB })).toContain(
      '- you are its conductor, and Saturday legendaries has none then',
    );
    // No conductor anywhere: the member in the group leads the new one.
    expect(textOf(train())).toContain('- you are its conductor');
    // Unless they asked not to be named: then nobody does, as for a train made anonymously.
    expect(textOf(train(), { anonymous: true })).toMatch(/^- it has no conductor$/mu);
    expect(textOf(train({ conductorId: CAROL }), { anonymous: true })).toContain(
      '- it has no conductor; Carol stays the conductor of Saturday legendaries',
    );
    // The conductor who goes with the group leads it still.
    expect(textOf(train({ conductorId: ALICE }), { anonymous: true })).toContain(
      '- you are its conductor, and Saturday legendaries has none then',
    );
    // The conductor of the old train splits a group they are not in.
    expect(textOf(train({ conductorId: CAROL }), { memberId: CAROL })).toContain(
      '- it has no conductor; you stay the conductor of Saturday legendaries',
    );
    // Staff, with the conductor in the group.
    expect(textOf(train({ conductorId: BOB }), { memberId: DAVE, staff: true })).toContain(
      '- Iris is its conductor, and Saturday legendaries has none then',
    );
  });

  it('says it of a group without a label by its letter', () => {
    expect(textOf(train({}, [{ id: 'A' }, { id: 'B' }]))).toContain(
      'Group **B** leaves **Saturday legendaries** and becomes a train of its own, ' +
        '**Saturday legendaries (B)**:',
    );
  });

  it('is for the one group asked about, also for staff, who may split several', () => {
    const party = train({ conductorId: CAROL });
    const dialog = splitDialog(view(party, { memberId: DAVE, staff: true }), ['A']);
    expect(radioOf(dialog)).toBeUndefined();
    expect(decodeCustomId(dialog.custom_id)?.args).toEqual([
      'A',
      groupMark(party, 'A'),
      openToken(PARTY_NOW),
    ]);
    expect(textsOf(dialog)[0]).toMatch(/^Group \*\*A\*\* leaves \*\*Saturday legendaries\*\*/u);
  });

  it('names who moves in the order the post lists them, without their guests', () => {
    const party = withAttendees(train(), {
      // Interested: the post lists Zed before those who come.
      [DAVE]: { group: 'B', name: 'Zed', number: 2, status: PartyStatus.Interested },
    });
    expect(textOf(party)).toContain('- Zed, Dawn and Iris move to it as they are signed up now');
  });

  it('cuts a long list of who moves', () => {
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 30; n++) {
      crowd[`4${String(n).padStart(17, '0')}`] = { group: 'B', name: `Trainer ${n}` };
    }
    expect(textOf(withAttendees(train(), crowd))).toMatch(
      /- Dawn, Iris, Trainer 0, .+, and \d+ more move to it/u,
    );
  });
});

describe('the dialog of picking the group to split off', () => {
  /** Carol, the conductor in A, may split A and B; and C, with Erika in it, too. */
  function three(more: Partial<TrainDetails> = {}): TrainParty {
    const party = train({ conductorId: CAROL, ...more }, [
      { id: 'A' },
      { id: 'B', label: 'Fast' },
      { id: 'C' },
    ]);
    return withAttendees(party, { [ERIKA]: { group: 'C', name: 'Erika' } });
  }

  /** The dialog's text, after its first paragraph (what is the same for every group). */
  const groupsText = (dialog: APIModalInteractionResponseCallbackData): string =>
    textsOf(dialog).join('\n').split('\n\n').slice(1).join('\n\n');

  it('says what is the same for every group and who is in each, and asks for one, none picked', () => {
    const party = three();
    const dialog = splitDialog(view(party, { memberId: CAROL }), ['A', 'B', 'C']);
    expect(() => checkModal(dialog)).not.toThrow();
    expect(dialog.title).toBe('Split a group off the train');
    // The dialog names the train; the pick names the group and its mark.
    expect(decodeCustomId(dialog.custom_id)).toEqual({
      kind: 'party',
      id: party.id,
      action: SPLIT_FORM,
      args: [openToken(PARTY_NOW)],
    });
    expect(textsOf(dialog)).toEqual([
      'The group you pick leaves **Saturday legendaries** and becomes a train of its own, named ' +
        'after the group (**Saturday legendaries (A)**): the same route, at the same stop (stop 2 ' +
        'of 3: The Stacks), the same boss and start, and it does the same at the end of the route. ' +
        'Its members move to it as they ' +
        'are signed up now. If group A leaves, you go with it as its conductor, and Saturday ' +
        'legendaries has none then.\n\n' +
        '**Group A** (2 trainers): Ash, Carol\n' +
        '**Group B (Fast)** (2 trainers): Dawn, Iris\n' +
        '**Group C** (1 trainer): Erika',
    ]);
    const shown = radioOf(dialog);
    expect(shown?.label).toBe('Group that leaves');
    expect(shown?.radio.custom_id).toBe(SPLIT_GROUP_INPUT);
    expect(shown?.radio.required).toBe(true);
    expect(
      shown?.radio.options.map((option) => [
        option.label,
        option.description,
        splitChoice(option.value),
        option.default,
      ]),
    ).toEqual([
      ['Group A · 2 trainers', undefined, { group: 'A', mark: groupMark(party, 'A') }, undefined],
      [
        'Group B (Fast) · 2 trainers',
        undefined,
        { group: 'B', mark: groupMark(party, 'B') },
        undefined,
      ],
      ['Group C · 1 trainer', undefined, { group: 'C', mark: groupMark(party, 'C') }, undefined],
    ]);
  });

  it('names the members of each group as the post lists them: by status, with their guests', () => {
    const party = withAttendees(three(), {
      // Interested, with a guest: the post lists them before those who come.
      [DAVE]: { group: 'B', name: 'Cilan', number: 2, status: PartyStatus.Interested },
    });
    const dialog = splitDialog(view(party, { memberId: CAROL }), ['B', 'C']);
    expect(groupsText(dialog)).toBe(
      '**Group B (Fast)** (4 trainers): Cilan +1, Dawn, Iris\n**Group C** (1 trainer): Erika',
    );
    // Guests count among the trainers, as in the post.
    expect(radioOf(dialog)?.radio.options.map((option) => option.label)).toEqual([
      'Group B (Fast) · 4 trainers',
      'Group C · 1 trainer',
    ]);
  });

  it('says once who leads which train: the conductor goes with their group', () => {
    const party = three();
    const asStaff = splitDialog(view(party, { memberId: DAVE, staff: true }), ['A', 'B']);
    expect(textsOf(asStaff)[0]).toContain(
      'signed up now. If group A leaves, Carol goes with it as its conductor, and Saturday ' +
        'legendaries has none then.\n\n',
    );
    // Without the conductor's group among the choices, or without a conductor, nothing is said.
    for (const [shown, groups] of [
      [view(party, { memberId: CAROL }), ['B', 'C']],
      [view(three({ conductorId: null }), { memberId: DAVE, staff: true }), ['A', 'B']],
    ] as const) {
      expect(textsOf(splitDialog(shown, groups))[0]).toContain('signed up now.\n\n');
    }
  });

  it('names a conductor the bot has no name for as a trainer, not by a mention', () => {
    const party = withAttendees(three(), { [CAROL]: { name: undefined } });
    const text = textsOf(splitDialog(view(party, { memberId: DAVE, staff: true }), ['A', 'B']))[0];
    expect(text).toContain('If group A leaves, a trainer goes with it as its conductor');
    expect(text).toContain('**Group A** (2 trainers): Ash, and 1 more');
    expect(text).not.toContain('<@');
  });

  it('says that staff in a group lead it when it leaves, unless they asked not to be named', () => {
    const party = withAttendees(three(), { [DAVE]: { group: 'C', name: 'Cilan' } });
    expect(
      textsOf(splitDialog(view(party, { memberId: DAVE, staff: true }), ['A', 'B', 'C']))[0],
    ).toContain(
      'If group A leaves, Carol goes with it as its conductor, and Saturday legendaries has ' +
        'none then. If group C leaves, you go with it as its conductor.\n\n',
    );
    expect(
      textsOf(
        splitDialog(view(party, { memberId: DAVE, staff: true, anonymous: true }), ['B', 'C']),
      )[0],
    ).toContain('signed up now.\n\n');
  });

  it('cuts a choice to what Discord takes, and names everybody in the text', () => {
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 30; n++) {
      crowd[`4${String(n).padStart(17, '0')}`] = { group: 'B', name: `Trainer number ${n}` };
    }
    const party: TrainParty = {
      ...withAttendees(three(), crowd),
      timed: { name: 'A very long train name '.repeat(4).trim(), startTime: null },
      groups: [{ id: 'A' }, { id: 'B', label: 'Fast and furious '.repeat(6).trim() }, { id: 'C' }],
    };
    const dialog = splitDialog(view(party, { memberId: CAROL }), ['A', 'B', 'C']);
    expect(() => checkModal(dialog)).not.toThrow();
    const [, long] = radioOf(dialog)?.radio.options ?? [];
    expect(long?.label.length).toBeLessThanOrEqual(100);
    expect(long?.label).toMatch(/^Group B \(Fast and furious .*…\) · 32 trainers$/u);
    const text = groupsText(dialog);
    expect(text).toContain('**Group B (Fast and furious Fast and furious ');
    for (let n = 0; n < 30; n++) expect(text).toContain(`Trainer number ${n}`);
    expect(text).not.toContain('more');
  });

  it('counts the members it has no name for among the more', () => {
    const party = withAttendees(three(), { [DAVE]: { group: 'C' } });
    const dialog = splitDialog(view(party, { memberId: CAROL }), ['B', 'C']);
    expect(groupsText(dialog)).toBe(
      '**Group B (Fast)** (2 trainers): Dawn, Iris\n**Group C** (2 trainers): Erika, and 1 more',
    );
  });

  it('keeps within what Discord takes with the longest texts that need escaping', () => {
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 400; n++) {
      crowd[`4${String(n).padStart(17, '0')}`] = {
        group: (['A', 'B', 'C', 'D', 'E'] as const)[n % 5] ?? 'A',
        name: '*'.repeat(32),
        status: PartyStatus.Coming,
      };
    }
    const heavy = (id: number): PostGym => ({
      name: `${'[*]'.repeat(84)}${id}`,
      nickname: null,
      lat: 40,
      lon: -80,
      notice: null,
      taggedEx: false,
      confirmedEx: false,
    });
    const party: TrainParty = {
      ...withAttendees(train({ conductorId: REPORTER }), crowd),
      timed: { name: '*'.repeat(80), startTime: PARTY_NOW + HOUR },
      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({ id, label: '*'.repeat(100) })),
    };
    const shown = { ...view(party, { memberId: REPORTER }), gym: heavy };
    for (const groups of [['B'], ['A', 'B', 'C', 'D', 'E']] as const) {
      expect(() => checkModal(splitDialog(shown, groups))).not.toThrow();
    }
    // Each group keeps its line, with as many names as fit, cut alike, and how many more.
    const lines = groupsText(splitDialog(shown, ['A', 'B', 'C', 'D', 'E'])).split('\n');
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line).toMatch(/, and \d+ more$/u);
    const named = lines.map((line) => (line.split('): ')[1] ?? '').split(', ').length - 1);
    expect(named[0]).toBeGreaterThan(0);
    expect(new Set(named).size).toBe(1);
    // As many as fit: one more name in each group (64 characters escaped, and ", ") would not.
    const text = textsOf(splitDialog(shown, ['A', 'B', 'C', 'D', 'E']))[0] ?? '';
    expect(text.length).toBeLessThanOrEqual(4_000);
    expect(text.length + 5 * 66).toBeGreaterThan(4_000);
  });
});

describe('the custom ids of the dialogs', () => {
  it('differ for every opening, so that no earlier pick is shown again', () => {
    for (const groups of [['B'], ['A', 'B']] as const) {
      const ids = [PARTY_NOW, PARTY_NOW + 1].map(
        (now) =>
          splitDialog(view(train({ conductorId: CAROL }), { memberId: CAROL, now }), groups)
            .custom_id,
      );
      expect(new Set(ids).size).toBe(2);
    }
  });
});

describe('splitChoice', () => {
  it('reads a choice as the group and its mark, and nothing else', () => {
    expect(splitChoice('B:1x2y3z')).toEqual({ group: 'B', mark: '1x2y3z' });
    expect(splitChoice('B')).toBeUndefined();
    expect(splitChoice('B:')).toBeUndefined();
    expect(splitChoice('Q:1x2y3z')).toBeUndefined();
  });
});
