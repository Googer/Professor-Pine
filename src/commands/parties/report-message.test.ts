import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_BOT_ID,
  fakeMessageCommand,
  fakeModal,
  sent,
  type FakeInteraction,
  type FakeTargetMessage,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
import { textOf } from '../../../test/support/messages.js';
import { BOB, CAROL } from '../../../test/support/parties.js';
import { reportedMeetup } from '../../../test/support/reports-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { EXPIRED } from '../../services/pending-requests.js';
import {
  partyReportForm,
  REPORT_ALREADY,
  REPORT_REASON_INPUT,
  REPORT_SENT,
  reportControls,
} from './report.js';
import { NOTHING_TO_REPORT, reportMessageCommand } from './report-message.js';

const DAVE = '200000000000000005';

async function setup(options: SafetyOptions = {}) {
  const made = await reportedMeetup(options);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
    reports: made.reports,
    meetupSafety: made.safety,
  });
  const router = new InteractionRouter(ctx, [reportMessageCommand], [reportControls]);
  const handle = async <I extends FakeInteraction>(interaction: I) => {
    await router.handle(interaction as never);
    return interaction;
  };
  /** The Apps menu's entry used by Bob on this message, in its channel. */
  const use = (target: FakeTargetMessage, extra: object = {}) =>
    handle(
      fakeMessageCommand({
        userId: BOB,
        displayName: 'Bob',
        channelId: target.channelId ?? WEST_CHANNEL,
        targetMessage: target,
        ...extra,
      }),
    );
  /** The form the entry opened, sent by Bob with this reason. */
  const submit = (opened: FakeInteraction, reason: string, userId = BOB) => {
    const form = opened.showModal.mock.calls[0]?.[0] as { custom_id: string };
    return handle(
      fakeModal({
        customId: form.custom_id,
        form,
        userId,
        displayName: 'Bob',
        fields: { [REPORT_REASON_INPUT]: reason },
      }),
    );
  };
  return { ...made, use, submit, handle };
}

describe('Report to moderators (the Apps menu of a message)', () => {
  it('reports the party of its post, of a copy of it, and of its link line', async () => {
    const made = await setup();
    await made.service.showStatus(made.party.id);
    await made.service.flush();
    const copy = made.store.get(made.party.id)?.mirrorMessages[0];
    if (!copy) throw new Error('no copy');
    const targets: FakeTargetMessage[] = [
      { id: made.postId, channelId: made.postId, authorId: FAKE_BOT_ID },
      { id: copy.messageId, channelId: copy.channelId, authorId: FAKE_BOT_ID },
      { id: made.party.regionLinkMessageId ?? '', channelId: WEST_CHANNEL, authorId: FAKE_BOT_ID },
    ];
    for (const target of targets) {
      const used = await made.use(target);
      expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
    }
  });

  it('has nothing to report on another message of the bot', async () => {
    const made = await setup();
    const used = await made.use({ id: '800000000000000009', authorId: FAKE_BOT_ID });
    expect(sent(used.reply)).toEqual({ content: NOTHING_TO_REPORT, flags: MessageFlags.Ephemeral });
  });

  it('keeps one message a member is about to report: their newer form replaces the older', async () => {
    const made = await setup();
    const first = await made.use({ id: '800000000000000001', authorId: DAVE, content: 'One.' });
    const second = await made.use({ id: '800000000000000002', authorId: DAVE, content: 'Two.' });
    expect(sent((await made.submit(first, 'Old form.')).reply).content).toBe(EXPIRED);
    expect(sent((await made.submit(second, 'New form.')).editReply).content).toBe(REPORT_SENT);
    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain('Two.');
  });

  it('reports a member’s message with a copy of it, also one in a party’s post', async () => {
    const made = await setup();
    const used = await made.use(
      {
        id: '800000000000000001',
        channelId: made.postId,
        authorId: DAVE,
        authorName: 'Dave',
        content: 'Come to my house, 12 Elm Street.',
        attachments: ['door.jpg'],
      },
      { thread: { parentId: WEST_FORUM } },
    );
    const form = used.showModal.mock.calls[0]?.[0] as { custom_id: string; title: string };
    expect(decodeCustomId(form.custom_id)).toMatchObject({ kind: 'report', action: 'message' });
    expect(form.title).toBe('Report this message to the moderators');
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
    const submitted = await made.submit(used, 'A home address.');
    expect(sent(submitted.editReply).content).toBe(REPORT_SENT);
    const text = textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message);
    expect(text).toContain(`Written by **Dave** (<@${DAVE}>) in the post of **`);
    expect(text).not.toContain(`<#${made.postId}>`);
    expect(text).toContain('Come to my house, 12 Elm Street.');
    expect(text).toContain('**Attachments**: door.jpg');
    // The form is used once.
    expect(sent((await made.submit(used, 'Again.')).reply).content).toBe(EXPIRED);
  });

  it('copies what a forwarded message forwards, and says it is forwarded', async () => {
    const made = await setup();
    const used = await made.use({
      id: '800000000000000001',
      authorId: DAVE,
      authorName: 'Dave',
      forwards: { content: 'Their address is 12 Elm Street.', attachments: ['house.jpg'] },
    });
    await made.submit(used, 'An address.');
    const text = textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message);
    expect(text).toContain('**What it said** (forwarded)\nTheir address is 12 Elm Street.');
    expect(text).toContain('**Attachments**: house.jpg');
    expect(text).not.toContain('(no text)');
  });

  it('tells a member who reported the party or the message already, before the form opens', async () => {
    const made = await setup();
    await made.report(BOB);
    const post = await made.use({ id: made.postId, channelId: made.postId, authorId: FAKE_BOT_ID });
    expect(post.showModal).not.toHaveBeenCalled();
    expect(sent(post.reply)).toEqual({ content: REPORT_ALREADY, flags: MessageFlags.Ephemeral });
    const target = { id: '800000000000000001', authorId: DAVE, content: 'One.' };
    await made.submit(await made.use(target), 'Rude.');
    const again = await made.use(target);
    expect(again.showModal).not.toHaveBeenCalled();
    expect(sent(again.reply).content).toBe(REPORT_ALREADY);
    const carol = await made.use(target, { userId: CAROL });
    expect(carol.showModal).toHaveBeenCalled();
  });

  it('refuses the form while the member’s reports of the hour are used up, the form of /report’s too', async () => {
    const made = await setup();
    for (let n = 1; n <= 5; n++) {
      const used = await made.use({ id: `80000000000000000${String(n)}`, authorId: DAVE });
      expect(sent((await made.submit(used, 'Rude.')).editReply).content).toBe(REPORT_SENT);
    }
    const full = await made.use({ id: '800000000000000006', authorId: DAVE });
    expect(full.showModal).not.toHaveBeenCalled();
    expect(sent(full.reply).content).toMatch(/^You can use \/report again in /);
  });

  it('refuses a message where the server has no moderators’ channel', async () => {
    const made = await setup({ moderation: null });
    const used = await made.use({ id: '800000000000000001', authorId: DAVE });
    expect(sent(used.reply).content).toBe("This server has no moderators' channel.");
  });
});
