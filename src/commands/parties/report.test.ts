import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { OTHER_GUILD_ID, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { LIBRARY } from '../../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
import { textOf } from '../../../test/support/messages.js';
import { ALICE, BOB, CAROL, PARTY_NOW } from '../../../test/support/parties.js';
import { reportsWith } from '../../../test/support/reports-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import { InteractionRouter } from '../../discord/router.js';
import { MAX_REPORT_REASON } from '../../domain/moderation/reports.js';
import {
  partyReportForm,
  report,
  REPORT_ALREADY,
  REPORT_REASON_INPUT,
  REPORT_SENT,
  reportControls,
} from './report.js';

const ADMIN_ROLE = '800000000000000001';

/** A meetup of Alice's, `/report` and its form routed as the bot routes them. */
async function setup(options: SafetyOptions = {}) {
  const made = await reportsWith(options);
  const outcome = await made.service.createMeetup({
    name: 'Book swap',
    creatorId: ALICE,
    creator: { name: 'Alice' },
    regionChannelId: WEST_CHANNEL,
    place: LIBRARY,
    startTime: PARTY_NOW + 24 * 3_600_000,
    description: 'Bring a book.',
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  const party = outcome.party;
  const postId = party.forumPostId ?? '';
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
    reports: made.reports,
    meetupSafety: made.safety,
  });
  let now = PARTY_NOW;
  const router = new InteractionRouter(ctx, [report], [reportControls, partyButtons], {
    now: () => now,
  });
  const handle = async <I extends FakeInteraction>(interaction: I) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const inPost = { channelId: postId, thread: { parentId: WEST_FORUM } };
  /** The form of a report of the meetup, sent by `userId` with this reason. */
  const submit = (reason: string, userId = BOB, extra: object = {}) =>
    handle(
      fakeModal({
        customId: partyReportForm(party).custom_id,
        form: partyReportForm(party),
        userId,
        displayName: userId === BOB ? 'Bob' : 'Carol',
        fields: { [REPORT_REASON_INPUT]: reason },
        guildRoleNames: { [ADMIN_ROLE]: 'Admin' },
        ...inPost,
        ...extra,
      }),
    );
  return {
    ...made,
    party,
    postId,
    inPost,
    handle,
    submit,
    later: (ms: number) => (now += ms),
  };
}

describe('/report', () => {
  it('opens a form that asks what is wrong, in the post of a party, and changes nothing', async () => {
    const made = await setup();
    const used = await made.handle(
      fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }),
    );
    expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
    expect(partyReportForm(made.party).title).toBe('Report this meetup to the moderators');
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
    const elsewhere = await made.handle(
      fakeChatInput({ commandName: 'report', userId: BOB, channelId: WEST_CHANNEL }),
    );
    expect(sent(elsewhere.reply).content).toBe(
      'Use this in the post of a raid, max battle, train or meetup that is still active.',
    );
  });

  it('sends the reason to the moderators privately, and tells the member who reported twice', async () => {
    const made = await setup();
    const first = await made.submit('A home address.');
    expect(first.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(first.editReply).content).toBe(REPORT_SENT);
    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain('A home address.');
    expect(made.gateway.messagesIn(made.postId)).toEqual([]);
    expect(sent((await made.submit('Again.')).editReply).content).toBe(REPORT_ALREADY);
    expect(sent((await made.submit('Mine.', CAROL)).editReply).content).toBe(REPORT_SENT);
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
  });

  it('tells a member who reported the party already before the form opens, and nobody else', async () => {
    const made = await setup();
    await made.submit('A home address.');
    const again = await made.handle(
      fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }),
    );
    expect(again.showModal).not.toHaveBeenCalled();
    expect(sent(again.reply)).toEqual({ content: REPORT_ALREADY, flags: MessageFlags.Ephemeral });
    const carol = await made.handle(
      fakeChatInput({ commandName: 'report', userId: CAROL, ...made.inPost }),
    );
    expect(carol.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
    // Decided, the report is no longer open: Bob may report the party anew.
    const [kept] = [...made.reportStore.reports.keys()];
    await made.reportStore.decideReport(kept ?? '', 'dismissed', null, null);
    const anew = await made.handle(
      fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }),
    );
    expect(anew.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
  });

  it('refuses the form while the member’s five reports an hour are used up; opening it counts nothing', async () => {
    const made = await setup();
    const open = () =>
      made.handle(fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }));
    for (let i = 0; i < 6; i++) expect((await open()).showModal).toHaveBeenCalled();
    for (let i = 0; i < 5; i++) {
      expect((await made.submit(`Reason ${String(i)}`)).editReply).toHaveBeenCalled();
    }
    const full = await open();
    expect(full.showModal).not.toHaveBeenCalled();
    expect(sent(full.reply).content).toMatch(/^You can use \/report again in /);
  });

  it('gives back the reports that could not reach the moderators: none of the member’s doing', async () => {
    const made = await setup();
    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    // As many as the hour allows: none of them counted, the form still opens.
    for (let i = 0; i < 5; i++) {
      expect(sent((await made.submit(`Reason ${String(i)}`)).followUp).content).toBe(
        'I could not send your report to the moderators. Try again later.',
      );
    }
    made.gateway.failing.delete('sendMessage');
    const open = await made.handle(
      fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }),
    );
    expect(open.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
  });

  it('opens the form as before when the reports cannot be read', async () => {
    const made = await setup();
    await made.submit('A home address.');
    made.reportStore.failing.add('openReport');
    const used = await made.handle(
      fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost }),
    );
    expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
    // The form's submit still tells them.
    made.reportStore.failing.delete('openReport');
    expect(sent((await made.submit('Again.')).editReply).content).toBe(REPORT_ALREADY);
  });

  it('opens the form after a second when the reports do not answer, and logs it', async () => {
    const made = await setup();
    await made.submit('A home address.');
    made.reportStore.openReport = () => new Promise(() => undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const used = fakeChatInput({ commandName: 'report', userId: BOB, ...made.inPost });
      const handled = made.handle(used);
      await vi.advanceTimersByTimeAsync(999);
      expect(used.showModal).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await handled;
      expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
      expect(
        made.entries.some(
          (one) => one.msg === 'could not read whether a member reported this already',
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a reason of white space alone, without counting it', async () => {
    const made = await setup();
    for (let i = 0; i < 6; i++) {
      const blank = await made.submit('  \n ');
      expect(sent(blank.reply).content).toBe(
        'Say what is wrong, so that the moderators know what to look at.',
      );
      expect(blank.deferReply).not.toHaveBeenCalled();
    }
    expect(sent((await made.submit('Real.')).editReply).content).toBe(REPORT_SENT);
  });

  it('takes five reports an hour of a member, the Apps menu’s forms too', async () => {
    const made = await setup();
    for (let i = 0; i < 5; i++) await made.submit(`Reason ${String(i)}`);
    const sixth = await made.submit('Six.');
    expect(sent(sixth.reply).content).toMatch(/^You can use \/report again in /);
    made.later(3_600_000);
    expect((await made.submit('Seven.')).editReply).toHaveBeenCalled();
  });

  it('takes no form for a party of another server, nor one that has ended', async () => {
    const made = await setup();
    const foreign = await made.submit('Elsewhere.', BOB, { guildId: OTHER_GUILD_ID });
    expect(sent(foreign.reply).content).toBe('This control is no longer active.');
    await made.service.end(made.party.id);
    const late = await made.submit('Too late.');
    expect(sent(late.reply).content).toBe('This has ended.');
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
  });

  it('puts the report into the post without a moderators’ channel, as a member’s /delete did', async () => {
    const made = await setup({ moderation: null });
    const first = await made.submit('Made twice\n**now**');
    expect(sent(first.editReply).content).toBe(
      'I have put your report into the post, for the moderators.',
    );
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `<@&${ADMIN_ROLE}>: **Bob** (<@${BOB}>) asks for this meetup to be deleted.\n> Made twice \\*\\*now\\*\\*`,
      mention: { roles: [ADMIN_ROLE] },
    });
    expect(sent((await made.submit('Again.')).editReply).content).toBe(
      'You have already asked the moderators about this meetup.',
    );
    // A long reason is quoted in part: the message keeps within what Discord takes.
    await made.submit('*'.repeat(MAX_REPORT_REASON), CAROL);
    const quoted = made.gateway.messagesIn(made.postId).at(-1)?.message.content ?? '';
    expect(quoted.length).toBeLessThan(2000);
  });

  it('takes a form of the old /delete, opened before it was for staff alone, as a report', async () => {
    const made = await setup();
    const old = await made.handle(
      fakeModal({
        customId: `party:${made.party.id}:delete`,
        userId: BOB,
        fields: { [REPORT_REASON_INPUT]: 'From an old form.' },
        ...made.inPost,
      }),
    );
    expect(sent(old.editReply).content).toBe(REPORT_SENT);
    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain('From an old form.');
  });
});
