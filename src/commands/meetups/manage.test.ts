import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogFields, dialogText, dialogOf, shownDialog } from '../../../test/support/dialogs.js';
import {
  fakeButton,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { ALICE, at, BOB, CAROL, PARTY_NOW } from '../../../test/support/parties.js';
import { createdMeetup } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { TEST_OWNER_ID } from '../../../test/support/web.js';
import { components } from '../../components/index.js';
import { partyButtons } from '../../components/party.js';
import { InteractionRouter, variedThrottleKey } from '../../discord/router.js';
import type { Throttle } from '../../discord/throttle.js';
import { START_THROTTLE } from '../parties/timed.js';
import { CHANGE_THROTTLE } from '../raids/change.js';
import { PartyStatus } from '../../domain/party/status.js';
import { NOTHING_CHANGED } from '../../domain/web/raid-manage.js';
import {
  MEETUP_END_INPUT,
  MEETUP_INFO_INPUT,
  MEETUP_NAME_INPUT,
  MEETUP_START_INPUT,
} from '../../render/manage-dialogs.js';
import { MEETUP_NOT_YOURS } from './meetup-changes.js';
import { meetupManageControls } from './manage.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

const START = at('2026-10-13T18:00');

/**
 * A meetup made by Alice (signed up, as its maker is), starting at six, with information, on
 * Discord: Bob is not signed up, Carol is, and the bot's owner is staff.
 */
async function setup() {
  const made = await createdMeetup({
    name: 'Picnic',
    creatorId: ALICE,
    creator: { name: 'Alice' },
    startTime: START,
    description: 'Bring snacks.',
  });
  await made.attendance.signUp(made.party.id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
  await made.attendance.flush();
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [], [partyButtons, meetupManageControls]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const who = (userId: string) => ({ userId, displayName: 'Somebody', channelId: made.postId });
  const open = (userId = ALICE) =>
    handle(fakeButton({ customId: `party:${made.party.id}:manage`, ...who(userId) }));
  /** The Submit of the dialog; a line not given is submitted as the dialog showed it. */
  const submit = (
    dialog: ReturnType<typeof shownDialog>,
    typed: { name?: string; info?: string; start?: string; end?: string },
    userId = ALICE,
  ) => {
    const shown = new Map(dialogFields(dialog).map((field) => [field.id, field.value ?? '']));
    const line = (id: string, value: string | undefined) =>
      shown.has(id) ? { [id]: value ?? shown.get(id) ?? '' } : {};
    return handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        fields: {
          ...line(MEETUP_NAME_INPUT, typed.name),
          ...line(MEETUP_INFO_INPUT, typed.info),
          ...line(MEETUP_START_INPUT, typed.start),
          ...line(MEETUP_END_INPUT, typed.end),
        },
        ...who(userId),
      }),
    );
  };
  const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;
  return { ...made, ctx, open, submit, answerOf };
}

describe('Manage… of a meetup’s post (plan 8M-21: the map’s editor as a dialog)', () => {
  it('is a control of the bot', () => {
    expect(components).toContain(meetupManageControls);
  });

  it('asks its maker what the map’s editor asks, with its name and information to change', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    expect(dialog.title).toBe('Manage Picnic');
    expect(dialog.custom_id).toMatch(new RegExp(`^mmanage:${made.party.id}:form:.*:~[0-9a-z]+$`));
    expect(dialog.custom_id.length).toBeLessThanOrEqual(100);
    expect(dialogFields(dialog).map((field) => [field.label, field.value])).toEqual([
      ['Name', 'Picnic'],
      ['Information', 'Bring snacks.'],
      ['Starts', undefined],
      ['Ends', undefined],
    ]);
    // In the posts' zone, named, as the map says it (review M3).
    expect(dialogText(dialog)).toBe('Starts now: 6:00 PM (Eastern)\nEnds now: none');
  });

  it('refuses privately a member who is neither its maker nor staff, as the map does', async () => {
    const made = await setup();
    const pressed = await made.open(BOB);
    expect(dialogOf(pressed)).toBeUndefined();
    expect(sent(pressed.reply).content).toBe(MEETUP_NOT_YOURS);
  });

  it('asks staff who are not signed up no start, saying why, as the map’s editor', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open(TEST_OWNER_ID));
    expect(dialogFields(dialog).map((field) => field.label)).toEqual([
      'Name',
      'Information',
      'Ends',
    ]);
    expect(dialogText(dialog)).toContain('Sign up for it to change when it starts.');
  });

  it('changes what was changed, in the commands’ words, and nothing for an untouched Submit', async () => {
    const made = await setup();
    const untouched = await made.submit(shownDialog(await made.open()), {});
    expect(made.answerOf(untouched)).toBe(NOTHING_CHANGED);
    const done = await made.submit(shownDialog(await made.open()), {
      name: 'Park picnic',
      info: 'Bring tea.',
      end: '8pm',
    });
    expect(made.answerOf(done)).toBe(
      'This meetup is now called **Park picnic**. ' +
        'The post of this meetup shows what you wrote, under "Meeting Information". ' +
        `This meetup ends at <t:${String(at('2026-10-13T20:00') / 1000)}:t> (<t:${String(at('2026-10-13T20:00') / 1000)}:R>).`,
    );
    expect(made.current()).toMatchObject({
      timed: { name: 'Park picnic' },
      meetup: { description: 'Bring tea.' },
      endTime: at('2026-10-13T20:00'),
    });
  });

  it('sets both times together as the map does', async () => {
    const made = await setup();
    const done = await made.submit(shownDialog(await made.open()), {
      start: '9pm',
      end: '10pm',
    });
    expect(made.answerOf(done)).toMatch(/^This meetup starts at .* This meetup ends at /u);
    expect(made.current()).toMatchObject({
      timed: { startTime: at('2026-10-13T21:00') },
      endTime: at('2026-10-13T22:00'),
    });
  });

  it('refuses a line drawn from what the meetup no longer is, and leaves one left untouched', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    await made.timed.setName(made.party.id, { id: CAROL }, 'Lake picnic');
    const kept = await made.submit(dialog, {});
    expect(made.answerOf(kept)).toBe(NOTHING_CHANGED);
    const stale = await made.submit(dialog, { name: 'Park picnic' });
    expect(made.answerOf(stale)).toBe('This meetup changed meanwhile: press Manage… again.');
    expect(made.current().timed.name).toBe('Lake picnic');
  });

  it('gives back what was typed of a refused information', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    await made.timed.setDescription(made.party.id, { id: CAROL }, 'Bring games.');
    const refused = await made.submit(dialog, { info: 'Bring tea.' });
    expect(made.answerOf(refused)).toBe(
      'This meetup changed meanwhile: press Manage… again.\nWhat you wrote:\n```\nBring tea.\n```',
    );
  });

  it('refuses a time it cannot read in /end’s words, after what went through', async () => {
    const made = await setup();
    const refused = await made.submit(shownDialog(await made.open()), {
      name: 'Park picnic',
      end: 'later',
    });
    expect(made.answerOf(refused)).toMatch(
      /^This meetup is now called \*\*Park picnic\*\*\. I could not read "later"/u,
    );
    expect(made.current().endTime).toBeNull();
  });

  it('refuses a start of a member who is not signed up before it counts', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    await made.attendance.leave(made.party.id, { id: ALICE });
    const refused = await made.submit(dialog, { start: '7pm' });
    expect(sent(refused.reply).content).toMatch(/signed up/u);
    expect(made.current().timed.startTime).toBe(START);
  });
});

describe('a line drawn from what is gone (review M6: at its own turn, as the map)', () => {
  it('refuses that line at its turn, keeping what went through before it', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    await made.timed.setDescription(made.party.id, { id: CAROL }, 'Bring games.');
    const answer = made.answerOf(
      await made.submit(dialog, { name: 'Park picnic', info: 'Bring tea.' }),
    );
    expect(answer).toBe(
      'This meetup is now called **Park picnic**. This meetup changed meanwhile: press Manage… again.\nWhat you wrote:\n```\nBring tea.\n```',
    );
    expect(made.current().timed.name).toBe('Park picnic');
    expect(made.current().meetup.description).toBe('Bring games.');
  });
});

describe('the windows a meetup’s Manage… counts in (review M1: as the map’s routes count)', () => {
  const MEET = variedThrottleKey('meet', START_THROTTLE);
  /** Whether `uses` more fit the window `key` of Alice, and no more. */
  const left = (
    made: Awaited<ReturnType<typeof setup>>,
    key: string,
    throttle: Throttle,
    uses: number,
  ) => {
    for (let use = 0; use < uses; use++) {
      expect(made.ctx.throttles.use(key, ALICE, throttle, PARTY_NOW)).toBeUndefined();
    }
    expect(made.ctx.throttles.use(key, ALICE, throttle, PARTY_NOW)).toBeDefined();
  };

  it('counts the name, the information and the end each in its command’s window', async () => {
    const made = await setup();
    await made.submit(shownDialog(await made.open()), {
      name: 'Park picnic',
      info: 'Bring tea.',
      end: '8pm',
    });
    left(made, 'name', CHANGE_THROTTLE, CHANGE_THROTTLE.uses - 1);
    left(made, 'info', CHANGE_THROTTLE, CHANGE_THROTTLE.uses - 1);
    left(made, 'end', CHANGE_THROTTLE, CHANGE_THROTTLE.uses - 1);
  });

  it('counts both times in /meet’s and /end’s windows, and refuses a full one in its words', async () => {
    const made = await setup();
    await made.submit(shownDialog(await made.open()), { start: '9pm', end: '10pm' });
    left(made, MEET, START_THROTTLE, START_THROTTLE.uses - 1);
    const full = await made.submit(shownDialog(await made.open()), {
      name: 'Park picnic',
      start: '7pm',
    });
    expect(made.answerOf(full)).toMatch(
      /^This meetup is now called \*\*Park picnic\*\*\. You can use \/meet again in /u,
    );
  });

  it('checks both times before anything counts (review M2): two out of order are refused at once', async () => {
    const made = await setup();
    const refused = await made.submit(shownDialog(await made.open()), { start: '9pm', end: '8pm' });
    expect(sent(refused.reply).content).toMatch(/end/u);
    left(made, MEET, START_THROTTLE, START_THROTTLE.uses);
    left(made, 'end', CHANGE_THROTTLE, CHANGE_THROTTLE.uses);
  });

  it('gives back the uses of times that failed for no fault of the member', async () => {
    const made = await setup();
    const failing = vi
      .spyOn(made.timed, 'setEndTime')
      .mockRejectedValue(new Error('the database is gone'));
    await made.submit(shownDialog(await made.open()), { start: '9pm', end: '10pm' });
    failing.mockRestore();
    left(made, MEET, START_THROTTLE, START_THROTTLE.uses);
    left(made, 'end', CHANGE_THROTTLE, CHANGE_THROTTLE.uses);
  });
});
