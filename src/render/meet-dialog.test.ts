import { describe, expect, it } from 'vitest';
import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
import { checkModal } from '../../test/support/fake-interactions.js';
import { at, PARTY_ZONE, testRaid, testRaidRules } from '../../test/support/parties.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { openToken } from '../discord/dialog.js';
import type { RaidParty } from '../domain/party/party.js';
import { setHatchTime } from '../domain/party/raid.js';
import { meetDialog, NO_MEETING } from './meet-dialog.js';

const HATCH = at('2026-10-13T14:30');
const raid: RaidParty = setHatchTime(testRaid(), HATCH, testRaidRules(), at('2026-10-13T14:00'));

describe('meetDialog', () => {
  it('has a custom id of its own each time it opens: Discord keeps a pick per custom id (plan 8X-F)', () => {
    // Staging of 8X: the web client preselected the time submitted before, not the group's.
    const now = at('2026-10-13T14:12');
    const first = meetDialog({ party: raid, groupId: 'A', zone: PARTY_ZONE, now });
    const again = meetDialog({ party: raid, groupId: 'A', zone: PARTY_ZONE, now: now + 1_000 });
    expect(again.custom_id).not.toBe(first.custom_id);
  });

  it('asks for the meeting time of the member’s group in a menu, the hatch first on an egg', () => {
    const now = at('2026-10-13T14:12');
    const dialog = meetDialog({ party: raid, groupId: 'A', zone: PARTY_ZONE, now });
    checkModal(dialog);
    expect(dialog.title).toBe('Meeting time');
    expect(decodeCustomId(dialog.custom_id)).toEqual({
      kind: 'meet',
      id: raid.id,
      action: 'time',
      args: ['A', raid.createdAt.toString(36), openToken(now)],
    });
    expect(dialogTexts(dialog)).toEqual(['For your group: everybody in it is told.']);
    const choices = dialogChoices(dialog);
    expect(choices[0]).toEqual({
      value: String(HATCH),
      label: 'At hatch (2:30 PM) · in-game RSVP',
      description: undefined,
      picked: true,
    });
    expect(choices.map(({ label }) => label).slice(1, 5)).toEqual([
      '2:35 PM',
      '2:40 PM',
      '2:45 PM · in-game RSVP',
      '2:50 PM',
    ]);
    // Nobody has set one: nothing to remove.
    expect(choices.map(({ value }) => value)).not.toContain(NO_MEETING);
  });

  it('names the group where there are several, and starts at its time, with a way to remove it', () => {
    const set = at('2026-10-13T14:52');
    const grouped: RaidParty = {
      ...raid,
      groups: [{ id: 'A' }, { id: 'B', opened: raid.createdAt + 1, startTime: set }],
    };
    const now = at('2026-10-13T14:40');
    const dialog = meetDialog({ party: grouped, groupId: 'B', zone: PARTY_ZONE, now });
    checkModal(dialog);
    expect(dialog.title).toBe('Meeting time for group B');
    const choices = dialogChoices(dialog);
    expect(choices.filter(({ picked }) => picked)).toEqual([
      {
        value: String(set),
        label: '2:52 PM',
        description: "Your group's meeting time now",
        picked: true,
      },
    ]);
    expect(choices.at(-1)).toMatchObject({ value: NO_MEETING, label: 'No meeting time' });
  });

  it('starts at the next in-game RSVP time on a hatched raid without a meeting time', () => {
    const now = at('2026-10-13T14:31');
    const choices = dialogChoices(meetDialog({ party: raid, groupId: 'A', zone: PARTY_ZONE, now }));
    expect(choices.find(({ picked }) => picked)?.label).toBe('2:45 PM · in-game RSVP');
  });
});
