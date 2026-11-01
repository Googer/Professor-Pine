import { ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
import { checkModal } from '../../test/support/fake-interactions.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  PARTY_NOW,
  PARTY_ZONE,
  REPORTER,
  testRaid,
  testTrain,
  withAttendees,
} from '../../test/support/parties.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { openToken } from '../discord/dialog.js';
import type { RaidParty } from '../domain/party/party.js';
import {
  ANY_GROUP,
  groupChoice,
  groupMenuDialog,
  groupWays,
  LABEL_INPUT,
  NEW_GROUP,
  whichGroupDialog,
} from './group-dialogs.js';

const DAVE = '200000000000000005';
const MEET = at('2026-10-13T14:45');

/** A raid of two groups: A with the reporter, a meeting time, B (newer) with a label. */
const two = (): RaidParty =>
  withAttendees(
    {
      ...testRaid(),
      groups: [
        { id: 'A', startTime: MEET },
        { id: 'B', label: 'by the bridge', opened: PARTY_NOW + 60_000 },
      ],
      defaultGroupId: 'B',
    },
    { [BOB]: { group: 'B', number: 2 } },
  );

const shown = (party = two(), lobbySize?: number, action: 'maybe' | 'join' | 'here' = 'join') =>
  whichGroupDialog({ party, memberId: ALICE, lobbySize, zone: PARTY_ZONE, now: PARTY_NOW }, action);

describe('whichGroupDialog', () => {
  it('asks a newcomer which group, in letter order, the default group marked (review r0 A2)', () => {
    const dialog = shown();
    checkModal(dialog);
    expect(dialog.title).toBe('Join this raid');
    expect(decodeCustomId(dialog.custom_id)).toEqual({
      kind: 'party',
      id: two().id,
      action: 'joinform',
      args: ['join', openToken(PARTY_NOW)],
    });
    // Kept short: Discord adds its own box to every dialog.
    expect(dialogTexts(dialog)).toEqual([]);
    expect(dialogChoices(dialog)).toEqual([
      {
        value: `A:${PARTY_NOW.toString(36)}`,
        label: 'Group A',
        description: '1 trainer · meeting at 2:45 PM',
        picked: false,
      },
      {
        // Where Join, +1 and Remote place a newcomer: the default group (iPhone picks it; Android
        // picks the first, A).
        value: groupChoice(two(), { id: 'B', opened: PARTY_NOW + 60_000 }),
        label: 'Group B: by the bridge',
        description: '2 trainers · no meeting time yet',
        picked: true,
      },
    ]);
  });

  it('lists a letter given again in its place, not after the groups opened before it (plan 8X-G)', () => {
    // C and D were opened, A and B went, and A was opened again last.
    const reused = withAttendees(
      {
        ...testRaid(),
        groups: [
          { id: 'C', opened: PARTY_NOW + 1 },
          { id: 'D', opened: PARTY_NOW + 2 },
          { id: 'A', opened: PARTY_NOW + 3 },
        ],
        defaultGroupId: 'A',
      },
      { [REPORTER]: { group: 'C' }, [BOB]: { group: 'D' }, [CAROL]: { group: 'A' } },
    );
    expect(dialogChoices(shown(reused, 4)).map(({ label }) => label)).toEqual([
      'Any group with room',
      'Group A',
      'Group C',
      'Group D',
    ]);
    expect(
      groupWays(reused, BOB).map((way) => (way.kind === 'new' ? 'new' : way.group.id)),
    ).toEqual(['A', 'C']);
  });

  it('is titled by the button that was pressed', () => {
    expect(shown(two(), undefined, 'maybe').title).toBe('Interested in this raid');
    expect(shown(two(), undefined, 'here').title).toBe('Here for this raid');
    const train = { ...testTrain(), groups: [{ id: 'A' as const }, { id: 'B' as const }] };
    expect(
      whichGroupDialog(
        { party: train, memberId: ALICE, lobbySize: undefined, zone: PARTY_ZONE, now: PARTY_NOW },
        'join',
      ).title,
    ).toBe('Join this train');
  });

  it('says nothing of meeting times on a train, and that a group is empty', () => {
    const made = testTrain();
    const train = {
      ...made,
      groups: [{ id: 'A' as const }, { id: 'B' as const, opened: PARTY_NOW + 1 }],
    };
    const dialog = whichGroupDialog(
      { party: train, memberId: ALICE, lobbySize: undefined, zone: PARTY_ZONE, now: PARTY_NOW },
      'join',
    );
    expect(dialogChoices(dialog).map(({ label, description }) => [label, description])).toEqual([
      ['Group A', '1 trainer'],
      ['Group B', 'Nobody yet'],
    ]);
  });

  it('offers any group with room first where groups have a size, saying which that is now', () => {
    const dialog = shown(two(), 4);
    const [first, ...groups] = dialogChoices(dialog);
    expect(first).toEqual({
      value: ANY_GROUP,
      label: 'Any group with room',
      description: 'Now: group B (2/4 coming)',
      picked: true,
    });
    expect(groups.map(({ description, picked }) => [description, picked])).toEqual([
      ['0/4 coming · 1 interested · meeting at 2:45 PM', false],
      ['2/4 coming · no meeting time yet', false],
    ]);
    // Every group full: a new one, while the party may have one more.
    const full = withAttendees(two(), {
      [REPORTER]: { group: 'A', number: 4 },
      [BOB]: { group: 'B', number: 4 },
    });
    expect(dialogChoices(shown(full, 4))[0]?.description).toBe('Now: a new group, C');
  });

  it('says what happens when every group is full and there may be no more', () => {
    const five = withAttendees(
      {
        ...testRaid(),
        groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id, n) => ({
          id,
          opened: PARTY_NOW + n,
        })),
        defaultGroupId: 'E',
      },
      {
        [REPORTER]: { group: 'A', number: 5 },
        [BOB]: { group: 'B', number: 4 },
        [CAROL]: { group: 'C', number: 4 },
        [DAVE]: { group: 'D', number: 4 },
        '200000000000000006': { group: 'E', number: 4 },
      },
    );
    const [first] = dialogChoices(shown(five, 4));
    // The join goes over the size there, as Join's choice does (`chooseGroup`).
    expect(first).toMatchObject({
      label: 'Any group: all are full',
      description: 'The one with the most room: group B (4/4 coming)',
    });
  });
});

describe('groupMenuDialog (Group…)', () => {
  const view = (party: RaidParty, memberId = BOB) => ({
    party,
    memberId,
    lobbySize: undefined,
    zone: PARTY_ZONE,
    now: PARTY_NOW,
  });
  const menu = (party: RaidParty, memberId = BOB) =>
    groupMenuDialog(view(party, memberId), groupWays(party, memberId));

  it('offers a member the other groups in letter order, then a new group with an optional label', () => {
    const three = withAttendees(
      {
        ...two(),
        groups: [...two().groups, { id: 'C' as const, opened: PARTY_NOW + 120_000 }],
      },
      { [CAROL]: { group: 'C' } },
    );
    const dialog = menu(three);
    checkModal(dialog);
    expect(dialog.title).toBe('Change group');
    expect(decodeCustomId(dialog.custom_id)).toMatchObject({
      action: 'regroupform',
      args: ['in', openToken(PARTY_NOW)],
    });
    expect(dialogTexts(dialog)).toEqual(["You're in group B (by the bridge)."]);
    expect(
      dialogChoices(dialog).map(({ label, description, picked }) => [label, description, picked]),
    ).toEqual([
      ['Group A', '1 trainer · meeting at 2:45 PM', true],
      ['Group C', '1 trainer · no meeting time yet', false],
      ['A new group (D)', 'Just you, until others join', false],
    ]);
    expect(dialogChoices(dialog).at(-1)?.value).toBe(NEW_GROUP);
    const field = dialog.components.find(
      (one) => one.type === ComponentType.Label && one.component.type === ComponentType.TextInput,
    );
    expect(field).toMatchObject({
      label: 'Label for a new group (optional)',
      component: { custom_id: LABEL_INPUT, required: false, max_length: 100 },
    });
  });

  it('signs up a newcomer by it: every group to choose from, titled so', () => {
    const dialog = menu(two(), ALICE);
    expect(dialog.title).toBe('Join a group');
    // No `SIGNED_UP_MARK`: its Submit signs them up.
    expect(decodeCustomId(dialog.custom_id)).toMatchObject({ args: [openToken(PARTY_NOW)] });
    expect(dialogTexts(dialog)).toEqual(['You join as coming, in the group you pick.']);
    expect(dialogChoices(dialog).map(({ label }) => label)).toEqual([
      'Group A',
      'Group B: by the bridge',
      'A new group (C)',
    ]);
  });

  it('asks nothing where only one way is left, and says what Submit does', () => {
    // One group, with somebody else in it: only a new group.
    const one = withAttendees(testRaid(), { [BOB]: {} });
    const dialog = menu(one);
    checkModal(dialog);
    expect(dialogChoices(dialog)).toEqual([]);
    expect(dialogTexts(dialog)).toEqual([
      "You're in group A. Submit opens group B and moves you to it.",
    ]);
    // Drawn for a member signed up (`SIGNED_UP_MARK`), then the one way.
    expect(decodeCustomId(dialog.custom_id)).toMatchObject({
      args: ['in', NEW_GROUP, openToken(PARTY_NOW)],
    });
    // Five groups: moves only, and no label asked.
    const five = withAttendees(
      {
        ...testRaid(),
        groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({ id })),
        attendees: {},
      },
      { [BOB]: { group: 'A' }, [ALICE]: { group: 'E' } },
    );
    const moves = menu(five);
    expect(dialogChoices(moves).map(({ value }) => value.split(':')[0])).toEqual([
      'B',
      'C',
      'D',
      'E',
    ]);
    expect(
      moves.components.some(
        (one) => one.type === ComponentType.Label && one.component.type === ComponentType.TextInput,
      ),
    ).toBe(false);
  });

  it('offers no new group to a member alone in a plain group: it would change nothing', () => {
    // The reporter is alone in A (no meeting time now), Bob in B: only the move to B is left.
    const plain = { ...two(), groups: [{ id: 'A' as const }, ...two().groups.slice(1)] };
    expect(groupWays(plain, REPORTER).map((way) => way.kind)).toEqual(['move']);
    // A meeting time keeps A when the reporter leaves it: a new group would change that.
    expect(groupWays(two(), REPORTER).map((way) => way.kind)).toEqual(['move', 'new']);
    expect(dialogTexts(menu(plain, REPORTER))).toEqual([
      "You're in group A. Submit moves you to group B.",
    ]);
  });

  it('has a custom id of its own each time it opens: Discord keeps a pick per custom id (plan 8X-F)', () => {
    const first = groupMenuDialog(view(two()), groupWays(two(), BOB));
    const again = groupMenuDialog(
      { ...view(two()), now: PARTY_NOW + 1_000 },
      groupWays(two(), BOB),
    );
    expect(again.custom_id).not.toBe(first.custom_id);
    const asked = (now: number) =>
      whichGroupDialog(
        { party: two(), memberId: ALICE, lobbySize: undefined, zone: PARTY_ZONE, now },
        'join',
      );
    expect(asked(PARTY_NOW + 1_000).custom_id).not.toBe(asked(PARTY_NOW).custom_id);
  });

  it('names a group to move to by its stamp in a dialog without a choice', () => {
    const party = {
      ...two(),
      groups: [{ id: 'A' as const }, { id: 'B' as const, opened: PARTY_NOW + 60_000 }],
    };
    const ways = groupWays(party, BOB).filter((way) => way.kind === 'move');
    const dialog = groupMenuDialog(view(party), ways);
    expect(dialogTexts(dialog)).toEqual(["You're in group B. Submit moves you to group A."]);
    expect(decodeCustomId(dialog.custom_id)?.args).toEqual([
      'in',
      ...groupChoice(party, { id: 'A' }).split(':'),
      openToken(PARTY_NOW),
    ]);
  });
});
