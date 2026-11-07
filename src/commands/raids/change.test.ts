import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, at, BOB, MINUTE, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import type { CommandModule } from '../../discord/command.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { InteractionRouter } from '../../discord/router.js';
import { bottomControls, timeForm } from '../../render/party-controls.js';
import type { RaidReport } from '../../services/party-service.js';
import { cancelMeet, meet } from '../parties/meet.js';
import { meetup } from '../meetups/meetup.js';
import { join } from '../parties/attendance.js';
import { duration, end, hatch, timesText } from './change.js';
import { RAID_IS_OVER } from './raid-input.js';

const all: CommandModule[] = [hatch, end, duration, meet, cancelMeet, join];
const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
const HATCHED_ALREADY =
  'This raid was reported hatched, so it cannot hatch later. To correct when it ends, use `/end`.';

beforeEach(() => {
  // The handlers read the clock themselves; the fake gateway needs the real timers.
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup(report: Partial<RaidReport> = {}) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const where = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A command used in the raid's post, by Alice. */
  const run = (commandName: string, options: Record<string, string | number> = {}, extra = {}) =>
    handle(
      fakeChatInput({
        commandName,
        ...where,
        userId: ALICE,
        displayName: 'Alice',
        options,
        ...extra,
      }),
    );
  const answer = async (commandName: string, options?: Record<string, string | number>) =>
    sent((await run(commandName, options)).reply).content;
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { ...made, ctx, handle, run, answer, lines, where };
}

describe('/hatch and /end', () => {
  it('/hatch sets the hatch time from minutes, privately, and the post says who did it', async () => {
    const made = await setup();
    const used = await made.run('hatch', { time: '30' });
    expect(used.reply).toHaveBeenCalledWith({
      content: `Done. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
      flags: MessageFlags.Ephemeral,
    });
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: END });
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) set the hatch time: ${stamp(HATCH)}.`,
    ]);
  });

  it('/hatch takes a clock time, and /end the time the raid ends', async () => {
    const made = await setup();
    await made.run('hatch', { time: '2:30pm' });
    expect(made.current().hatchTime).toBe(HATCH);
    expect(await made.answer('end', { time: '3:20' })).toBe(
      `Done. It hatches at ${stamp(HATCH + 5 * MINUTE)} and ends at ${stamp(END + 5 * MINUTE)}.`,
    );
  });

  it('names the times of a raid that has hatched, or is over, as past', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    vi.setSystemTime(HATCH + 10 * MINUTE);
    expect(await made.answer('end', { time: '3:15pm' })).toBe(
      `Nothing changed. It hatched at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
    );
    expect(timesText(made.current(), END + MINUTE)).toBe(
      `It hatched at ${stamp(HATCH)} and ended at ${stamp(END)}.`,
    );
  });

  it('says so when the raid already has that time', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    expect(await made.answer('hatch', { time: '2:30pm' })).toBe(
      `Nothing changed. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
    );
    expect(await made.lines()).toEqual([]);
  });

  it('explains a time the raid cannot have, and one it cannot read', async () => {
    const made = await setup();
    // An egg reported at 14:00 hatches by 15:00.
    expect(await made.answer('hatch', { time: '5pm' })).toMatch(
      /^"5pm" cannot be the time the egg hatches: it must be between <t:\d+:t> and <t:\d+:t>\.$/,
    );
    expect(await made.answer('end', { time: 'soon' })).toMatch(
      /^I could not read "soon" as the time the raid ends\./,
    );
    expect(await made.answer('hatch', { time: 'cancel' })).toBe(
      'A raid keeps its times once it has them. Give the right time instead.',
    );
    expect(made.current().hatchTime).toBeNull();
  });

  it('corrects a time that was set, later or earlier', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('hatch', { time: '2:40pm' });
    expect(made.current().hatchTime).toBe(HATCH + 10 * MINUTE);
    await made.run('hatch', { time: '2:20pm' });
    expect(made.current().hatchTime).toBe(HATCH - 10 * MINUTE);
  });

  it('works only in the post of a raid', async () => {
    const made = await setup();
    const elsewhere = await made.run('hatch', { time: '30' }, { channelId: '600000000000000009' });
    expect(sent(elsewhere.reply).content).toBe(
      'Use this in the post of a raid that is still active.',
    );
  });

  it('holds back a member who changes the raid more than ten times a minute', async () => {
    const made = await setup();
    for (let n = 0; n < 10; n++) await made.run('hatch', { time: String(20 + n) });
    expect(await made.answer('hatch', { time: '35' })).toMatch(/^You can use \/hatch again in /);
  });
});

describe('the hints of the time options (plan 8X-G, M2)', () => {
  it('name no fixed date, which would go stale once deployed, and help shows a coming one', () => {
    for (const command of [end, meet, meetup]) {
      const options = command.data.toJSON().options ?? [];
      for (const option of options) expect(option.description).not.toMatch(/\d+-\d+/);
      // The help's example with a date is the date three days from today (`DATE_EXAMPLE`).
      expect(command.help.examples?.filter((example) => /\d+-\d+/.test(example))).toEqual([]);
    }
    expect(meet.help.examples).toContain('/meet time:{date} 6:15pm');
    expect(end.help.examples).toContain('/end time:{date} 9pm');
  });
});

describe('/duration', () => {
  it('sets how long the raid lasts and says the new times', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    expect(await made.answer('duration', { minutes: 30 })).toBe(
      `This raid now lasts 30 minutes. It hatches at ${stamp(HATCH)} and ends at ${stamp(HATCH + 30 * MINUTE)}.`,
    );
    expect(await made.answer('duration', { minutes: 30 })).toBe(
      'This raid already lasts 30 minutes.',
    );
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) set the length of this raid to 30 minutes.`,
    ]);
  });

  it('refuses a length no raid has, naming the longest', async () => {
    const made = await setup();
    expect(await made.answer('duration', { minutes: 181 })).toBe(
      'Give the length in minutes, from 1 to 180.',
    );
  });
});

describe('/meet and /cancel-meet', () => {
  const MEET = at('2026-10-13T14:45');

  it('sets the meeting time of the group, tells the member and the others', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('join');
    expect(await made.answer('meet', { time: '2:45pm' })).toBe(
      `The meeting time of your group is ${stamp(MEET)} (${stamp(MEET, 'R')}). I have told the others.`,
    );
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: MEET });
    expect((await made.lines()).slice(-2)).toEqual([
      `**Alice** (<@${ALICE}>) set the meeting time: ${stamp(MEET)} (${stamp(MEET, 'R')}).`,
      `<@${REPORTER}>`,
    ]);
    expect(await made.answer('meet', { time: '2:45pm' })).toBe(
      `The meeting time of your group was ${stamp(MEET)} (${stamp(MEET, 'R')}) already.`,
    );
  });

  it('does not speak of others to a member who is alone in the group', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('join');
    await made.attendance.newGroup(made.party.id, { id: ALICE, name: 'Alice' });
    expect(await made.answer('meet', { time: '2:45pm' })).toBe(
      `The meeting time of group B is ${stamp(MEET)} (${stamp(MEET, 'R')}).`,
    );
  });

  it('takes "hatch" for the hatch time, and "cancel" to remove it', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('join');
    await made.run('meet', { time: 'hatch' });
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: HATCH });
    expect(await made.answer('meet', { time: 'cancel' })).toBe(
      'The meeting time of your group is canceled.',
    );
    expect(made.current().groups[0]).toEqual({ id: 'A' });
  });

  it('refuses a time outside the raid, and a member who is not signed up', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    expect(await made.answer('meet', { time: '2:45pm' })).toBe(
      'You are not signed up for this raid.',
    );
    await made.run('join');
    expect(await made.answer('meet', { time: '4pm' })).toMatch(
      /^"4pm" cannot be a meeting time: it must be between /,
    );
  });

  it('/cancel-meet removes the time, and says when there was none', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('join');
    expect(await made.answer('cancel-meet')).toBe('There was no meeting time.');
    await made.run('meet', { time: '2:45pm' });
    expect(await made.answer('cancel-meet')).toBe('The meeting time is canceled.');
    expect(made.current().groups[0]).toEqual({ id: 'A' });
  });
});

describe('what the commands guard against', () => {
  it('holds back a member who keeps changing the meeting time', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    await made.run('join');
    for (const time of ['2:40pm', '2:45pm', '2:50pm']) await made.run('meet', { time });
    expect(await made.answer('meet', { time: '2:55pm' })).toMatch(/^You can use \/meet again in /);
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: at('2026-10-13T14:50') });
  });

  it('gives a raid that was seen hatched no more time than a raid lasts', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    // Reported hatched at 14:00: it ends by 14:45 at the latest.
    expect(await made.answer('end', { time: '50' })).toMatch(
      /^"50" cannot be the time the raid ends: it must be between /,
    );
    expect(made.current().endTime).toBeNull();
    expect(await made.answer('end', { time: '40' })).toMatch(/^Done\./);
    const other = await setup({ boss: { key: 'yveltal' } });
    await other.run('join');
    expect(await other.answer('meet', { time: '3pm' })).toMatch(
      /^"3pm" cannot be a meeting time: it must be between /,
    );
  });

  it('refuses a hatch time still to come for a raid that was seen hatched, also once it has times', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    expect(await made.answer('hatch', { time: '10' })).toBe(HATCHED_ALREADY);
    expect(made.current().hatchTime).toBeNull();
    // A time it hatched at is taken, and with it the raid is still not to hatch again.
    expect(await made.answer('hatch', { time: '1:50pm' })).toMatch(/^Done\./);
    expect(await made.answer('hatch', { time: '2:05pm' })).toBe(HATCHED_ALREADY);
    expect(made.current().hatchTime).toBe(at('2026-10-13T13:50'));
    // An egg's hatch time still moves later.
    const egg = await setup();
    expect(await egg.answer('hatch', { time: '10' })).toMatch(/^Done\./);
    expect(await egg.answer('hatch', { time: '20' })).toMatch(/^Done\./);
  });

  it('says a raid without times is over when its last possible moment has passed', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    vi.setSystemTime(PARTY_NOW + 50 * MINUTE);
    expect(await made.answer('end', { time: '10' })).toBe(RAID_IS_OVER);
    expect(made.current().endTime).toBeNull();
  });

  it('names the day of a time that is not today', async () => {
    const made = await setup({ tier: { level: 'Elite', shadow: false } });
    const tomorrow = at('2026-10-14T13:00');
    expect(await made.answer('hatch', { time: '10/14 1:00pm' })).toBe(
      `Done. It hatches at ${stamp(tomorrow, 'f')} and ends at ${stamp(tomorrow + 30 * MINUTE, 'f')}.`,
    );
  });
});

describe('the "Set time" button and its form', () => {
  const actions = (made: Awaited<ReturnType<typeof setup>>) =>
    bottomControls(made.current(), { emoji: {} })
      .flat()
      .map(({ button }) => ('custom_id' in button ? decodeCustomId(button.custom_id)?.action : ''));

  it('is on a post without times, and gone once the raid has them', async () => {
    const made = await setup();
    expect(actions(made)).toContain('time');
    await made.run('hatch', { time: '30' });
    expect(actions(made)).not.toContain('time');
    await made.service.flush();
    const shown = JSON.stringify(made.gateway.posts.get(made.postId)?.message.components);
    expect(shown).not.toContain(':time');
  });

  it('opens a form that asks an egg when it hatches, and a hatched raid when it ends', async () => {
    const egg = await setup();
    const click = await egg.handle(
      fakeButton({ customId: `party:${egg.party.id}:time`, ...egg.where, userId: ALICE }),
    );
    expect(click.showModal).toHaveBeenCalledExactlyOnceWith(timeForm(egg.party.id, 'hatch'));
    expect(click.reply).not.toHaveBeenCalled();

    const boss = await setup({ boss: { key: 'yveltal' } });
    const other = await boss.handle(
      fakeButton({ customId: `party:${boss.party.id}:time`, ...boss.where, userId: ALICE }),
    );
    expect(other.showModal).toHaveBeenCalledExactlyOnceWith(timeForm(boss.party.id, 'end'));
    const form = timeForm(boss.party.id, 'end');
    expect(decodeCustomId(form.custom_id)).toEqual({
      kind: 'party',
      id: boss.party.id,
      action: 'time',
      args: ['end'],
    });
    expect(form.title.length).toBeLessThanOrEqual(45);
  });

  it('does not open the form for a raid without times that is over', async () => {
    const made = await setup();
    vi.setSystemTime((made.current().lastPossibleTime ?? 0) + MINUTE);
    const click = await made.handle(
      fakeButton({ customId: `party:${made.party.id}:time`, ...made.where, userId: ALICE }),
    );
    expect(click.showModal).not.toHaveBeenCalled();
    expect(sent(click.reply)).toEqual({ content: RAID_IS_OVER, flags: MessageFlags.Ephemeral });
  });

  it('sets the time that was typed into the form, as what the form asked for', async () => {
    const made = await setup();
    const form = await made.handle(
      fakeModal({
        customId: `party:${made.party.id}:time:hatch`,
        ...made.where,
        userId: BOB,
        displayName: 'Bob',
        fields: { time: '30' },
      }),
    );
    expect(sent(form.reply)).toEqual({
      content: `Done. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
      flags: MessageFlags.Ephemeral,
    });
    expect(await made.lines()).toEqual([
      `**Bob** (<@${BOB}>) set the hatch time: ${stamp(HATCH)}.`,
    ]);

    const hatched = await setup({ boss: { key: 'yveltal' } });
    await hatched.handle(
      fakeModal({
        customId: `party:${hatched.party.id}:time:end`,
        ...hatched.where,
        userId: BOB,
        fields: { time: '2:40pm' },
      }),
    );
    expect(hatched.current()).toMatchObject({
      hatchTime: at('2026-10-13T13:55'),
      endTime: at('2026-10-13T14:40'),
    });
  });

  it('explains what it cannot read, privately, and leaves the raid alone', async () => {
    const made = await setup();
    const form = await made.handle(
      fakeModal({
        customId: `party:${made.party.id}:time:hatch`,
        ...made.where,
        fields: { time: 'whenever' },
      }),
    );
    expect(sent(form.reply).content).toMatch(
      /^I could not read "whenever" as the time the egg hatches\./,
    );
    expect(sent(form.reply).flags).toBe(MessageFlags.Ephemeral);
    expect(made.current().hatchTime).toBeNull();
  });

  it('says so when somebody set the time meanwhile, or the raid is over', async () => {
    const made = await setup({ time: { hatch: HATCH } });
    const late = await made.handle(
      fakeButton({ customId: `party:${made.party.id}:time`, ...made.where }),
    );
    expect(late.showModal).not.toHaveBeenCalled();
    expect(sent(late.reply).content).toBe(
      `This raid has its times already. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}. ` +
        'Use `/hatch` or `/end` to correct them.',
    );
    // The form was open while somebody else set the time: theirs stands.
    const form = await made.handle(
      fakeModal({
        customId: `party:${made.party.id}:time:hatch`,
        ...made.where,
        fields: { time: '2:50pm' },
      }),
    );
    expect(sent(form.reply).content).toMatch(/^This raid has its times already\./);
    expect(made.current().hatchTime).toBe(HATCH);
    await made.service.end(made.party.id);
    for (const interaction of [
      fakeButton({ customId: `party:${made.party.id}:time`, ...made.where }),
      fakeModal({ customId: `party:${made.party.id}:time:hatch`, fields: { time: '30' } }),
    ]) {
      await made.handle(interaction);
      expect(sent(interaction.reply).content).toBe('This raid is over.');
    }
  });

  it('answers a form it does not know as no longer active', async () => {
    const made = await setup();
    for (const customId of [`party:${made.party.id}:time`, `party:${made.party.id}:time:meet`]) {
      const form = await made.handle(fakeModal({ customId, fields: { time: '30' } }));
      expect(sent(form.reply).content).toBe('This no longer works.');
    }
  });
});
