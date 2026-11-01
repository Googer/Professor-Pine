import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  dialogChoices,
  dialogTexts,
  shownDialog,
  withoutToken,
} from '../../test/support/dialogs.js';
import {
  asV2,
  fakeButton,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
import { networkAway } from '../../test/support/fake-gateway.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { reportedMeetup } from '../../test/support/reports-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { DIALOG_READ_MS, SLOW_READ } from '../discord/dialog.js';
import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
import { REMOVAL_INPUT } from '../render/moderation.js';
import { reportDecisionControls, reportDecisionWords } from './moderation-reports.js';

/** The names of the fakes' channels as the server has them: the forum of the meetups. */
const CHANNELS = { [WEST_FORUM]: 'west-meetups' };

async function setup() {
  const made = await reportedMeetup();
  const outcome = await made.report();
  if (outcome.kind !== 'sent') throw new Error(outcome.kind);
  const { ctx } = createTestContext({
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    reports: made.reports,
    meetupSafety: made.safety,
  });
  const router = new InteractionRouter(ctx, [], [reportDecisionControls]);
  const id = outcome.report.id;
  const asMod = {
    userId: '200000000000000009',
    displayName: 'Mod',
    roleNames: ['Moderator'],
    channelId: MOD_CHANNEL,
    guildChannelNames: CHANNELS,
  };
  const pressOn = async (
    reportId: string,
    action: string,
    extra: object = {},
  ): Promise<FakeInteraction> => {
    const interaction = fakeButton({
      customId: `mreport:${reportId}:${action}`,
      v2Message: true,
      ...asMod,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const press = (action: string, extra: object = {}) => pressOn(id, action, extra);
  /**
   * The Submit of the dialog of `action` (opened now by its button unless given), `removal`
   * picked (none for a dialog without the choice).
   */
  const submit = async (
    action: string,
    removal: 'archive' | 'delete' | undefined,
    dialog?: APIModalInteractionResponseCallbackData,
  ): Promise<FakeInteraction> => {
    const form = dialog ?? shownDialog(await press(action));
    const interaction = fakeModal({
      customId: form.custom_id,
      form,
      ...(removal === undefined ? {} : { picked: { [REMOVAL_INPUT]: removal } }),
      ...asMod,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, id, router, press, pressOn, submit };
}

describe('the buttons of a report’s post', () => {
  it('ask in a dialog whether to archive or delete before an action that ends the party', async () => {
    const made = await setup();
    const asked = await made.press('close');
    expect(asked.reply).not.toHaveBeenCalled();
    const dialog = shownDialog(asked);
    expect(withoutToken(dialog.custom_id)).toBe(`mreport:${made.id}:close`);
    expect(dialog.title).toBe('Close this meetup');
    expect(dialogTexts(dialog)).toEqual(['Close this meetup?']);
    expect(dialogChoices(dialog).map(({ value, picked }) => [value, picked])).toEqual([
      ['archive', false],
      ['delete', false],
    ]);
    const refuse = shownDialog(await made.press('refuse'));
    expect([withoutToken(refuse.custom_id), refuse.title, dialogTexts(refuse)]).toEqual([
      `mreport:${made.id}:refuse`,
      'Refuse this place',
      ['Refuse this place for good, and close this meetup?'],
    ]);
    const block = shownDialog(await made.press('block'));
    expect([block.title, dialogTexts(block)]).toEqual([
      'Block the maker',
      ['Block its maker from creating meetups here, and close this meetup?'],
    ]);
    expect(made.store.get(made.party.id)).toBeDefined();
  });

  it('carry out the choice on Submit, privately', async () => {
    const made = await setup();
    const chosen = await made.submit('close', 'archive');
    expect(chosen.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(textOf(asV2(sent(chosen.editReply)))).toBe(
      'Closed: the meetup is over, and its post archived.',
    );
    expect(made.store.get(made.party.id)).toBeUndefined();
    const again = await made.press('dismiss');
    expect(sent(again.editReply).content).toMatch(
      /^\*\*Mod\*\* \(<@200000000000000009>\) decided this already <t:\d+:R>: closed\.$/,
    );
  });

  it('offer no choice where the bot may not delete the post, archiving it on Submit', async () => {
    const made = await setup();
    made.gateway.noManaging.add(WEST_FORUM);
    const dialog = shownDialog(await made.press('close'));
    expect(withoutToken(dialog.custom_id)).toBe(`mreport:${made.id}:close:archive`);
    expect(dialogChoices(dialog)).toEqual([]);
    expect(dialogTexts(dialog)[0]).toContain("I can't delete posts in #west-meetups");
    const chosen = await made.submit('close', undefined, dialog);
    expect(textOf(asV2(sent(chosen.editReply)))).toBe(
      'Closed: the meetup is over, and its post archived.',
    );
  });

  it('dismiss at once, privately', async () => {
    const made = await setup();
    const dismissed = await made.press('dismiss');
    expect(dismissed.showModal).not.toHaveBeenCalled();
    expect(dismissed.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(dismissed.editReply).content).toBe('Dismissed: nothing else changes.');
  });

  it('answer an action that ends a party at once when the report is decided already', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.press('close'));
    await made.press('dismiss');
    const again = await made.press('close');
    expect(again.showModal).not.toHaveBeenCalled();
    expect(sent(again.reply).content).toMatch(/decided this already .*: dismissed\.$/);
    // A dialog opened before is answered the same way.
    const late = await made.submit('close', 'archive', dialog);
    expect(textOf(asV2(sent(late.editReply)))).toMatch(/decided this already .*: dismissed\.$/);
    expect(made.store.get(made.party.id)).toBeDefined();
  });

  it('open no dialog when the report takes too long to read', async () => {
    const made = await setup();
    let arrive: () => void = () => undefined;
    const asked = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    vi.spyOn(made.reports, 'reportOf').mockImplementation(() => {
      arrive();
      return new Promise(() => undefined);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pressing = made.press('close');
      await asked;
      await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
      const pressed = await pressing;
      expect(pressed.showModal).not.toHaveBeenCalled();
      expect(sent(pressed.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keep Archive post where the bot may no longer delete the post at Submit', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.press('close'));
    made.gateway.noManaging.add(WEST_FORUM);
    const refused = await made.submit('close', 'delete', dialog);
    const shown = asV2(sent(refused.editReply));
    expect(textOf(shown)).toBe(
      `I can't delete posts in <#${WEST_FORUM}> (Manage Threads is missing there). Archive it, or ` +
        'delete it yourself.',
    );
    expect(buttonsOf(shown).map((button) => [button.label, button.customId])).toEqual([
      ['Archive post', `mreport:${made.id}:close:archive`],
    ]);
    expect(made.store.get(made.party.id)).toBeDefined();
    // It archives at once.
    const archived = await made.press('close:archive', { ephemeralMessage: true });
    expect(textOf(asV2(sent(archived.editReply)))).toBe(
      'Closed: the meetup is over, and its post archived.',
    );
  });

  it('refuse a Submit by a moderator demoted since the dialog opened, the report still open', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.press('close'));
    const submitted = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      picked: { [REMOVAL_INPUT]: 'archive' },
      userId: '200000000000000009',
      displayName: 'Mod',
      roleNames: ['Valor'],
      channelId: MOD_CHANNEL,
    });
    await made.router.handle(submitted as never);
    expect(sent(submitted.reply).content).toBe('Only admins and moderators can do that.');
    expect(submitted.deferReply).not.toHaveBeenCalled();
    expect(made.store.get(made.party.id)).toBeDefined();
    expect((await made.reportStore.report(made.id))?.status).toBe('open');
  });

  it('carry out a dialog opened before its id had a per-open token', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.press('close'));
    const submitted = fakeModal({
      customId: withoutToken(dialog.custom_id),
      form: dialog,
      picked: { [REMOVAL_INPUT]: 'archive' },
      userId: '200000000000000009',
      displayName: 'Mod',
      roleNames: ['Moderator'],
      channelId: MOD_CHANNEL,
    });
    await made.router.handle(submitted as never);
    expect(textOf(asV2(sent(submitted.editReply)))).toBe(
      'Closed: the meetup is over, and its post archived.',
    );
  });

  it('give a Submit without the choice (a dialog of an older shape) the stale answer', async () => {
    const made = await setup();
    const forged = fakeModal({
      customId: `mreport:${made.id}:close`,
      userId: '200000000000000009',
      displayName: 'Mod',
      roleNames: ['Moderator'],
      channelId: MOD_CHANNEL,
    });
    await made.router.handle(forged as never);
    expect(sent(forged.reply).content).toBe(STALE_COMPONENT);
    expect((await made.reportStore.report(made.id))?.status).toBe('open');
  });

  it('give the Delete post of the question they asked before the stale answer', async () => {
    const made = await setup();
    const pressed = await made.press('close:delete', { ephemeralMessage: true });
    expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
    expect(made.store.get(made.party.id)).toBeDefined();
  });

  it('say it could not be done, the report open, where a step failed', async () => {
    const made = await setup();
    made.storage.failing.add('addBlock');
    const failed = await made.submit('block', 'archive');
    expect(textOf(asV2(sent(failed.editReply)))).toBe(
      'That could not be done: nothing changed, and the report is still open. Try again.',
    );
  });

  it('say what was done where a later step failed, and whether the report is open again', async () => {
    const made = await setup();
    made.service.endAs = () => Promise.reject(new Error('the database is away'));
    const blocked = await made.submit('block', 'archive');
    expect(textOf(asV2(sent(blocked.editReply)))).toBe(
      'That could not be finished: its maker is blocked, but the meetup is not closed. The ' +
        'report is open again: try again.',
    );
    made.reportStore.failing.add('reopenReport');
    const stuck = await made.submit('close', 'archive');
    expect(textOf(asV2(sent(stuck.editReply)))).toBe(
      'That could not be finished: the meetup is not closed, and the report could not be ' +
        'opened again. Close the meetup with /delete.',
    );
  });

  it('say that a message could not be deleted, and whether its report is open again', () => {
    const failed = {
      kind: 'failed',
      word: 'message',
      placeRefused: false,
      blocked: false,
    } as const;
    expect(reportDecisionWords({ ...failed, reopened: true })).toBe(
      'That could not be done: nothing changed, and the report is still open. Try again.',
    );
    expect(reportDecisionWords({ ...failed, reopened: false })).toBe(
      'That could not be finished: the message is not deleted, and the report could not be ' +
        'opened again. Delete the message yourself.',
    );
  });

  it('say that a place that is now a pin cannot be refused', async () => {
    const made = await setup();
    made.service.placeOf = () => SAFETY_PIN;
    const refused = await made.submit('refuse', 'archive');
    expect(textOf(asV2(sent(refused.editReply)))).toBe(
      'The meetup’s place is now a dropped pin or none, which cannot be refused: nothing ' +
        'changed, and the report is still open.',
    );
  });

  it('say that Discord refused to delete the post, which is archived', async () => {
    const made = await setup();
    made.gateway.failing.set('deletePost', new Error('Missing Permissions'));
    const chosen = await made.submit('close', 'delete');
    expect(textOf(asV2(sent(chosen.editReply)))).toBe(
      'Closed: the meetup is over, and its post archived: Discord refused to delete it; delete ' +
        'it yourself.',
    );
  });

  it('say that the deletion is still to come where the network failed it (review r1 C1)', async () => {
    const made = await setup();
    made.gateway.failing.set('deletePost', networkAway());
    const chosen = await made.submit('close', 'delete');
    expect(textOf(asV2(sent(chosen.editReply)))).toBe(
      'Closed: the meetup is over, and its post is archived for now: Discord did not answer ' +
        'when I tried to delete it. I will try again within the hour; if it is still there ' +
        'after that, delete it yourself.',
    );
  });

  it('take twenty presses and Submits a minute of a moderator', async () => {
    const made = await setup();
    // Opening the dialog counts, and so does each Submit.
    const dialog = shownDialog(await made.press('close'));
    for (let i = 0; i < 19; i++) await made.submit('close', 'archive', dialog);
    expect(sent((await made.press('close')).reply).content).toMatch(/^That was a lot of clicks/);
  });

  it('delete a reported message, and say where the bot may not', async () => {
    const made = await setup();
    const reported = await made.reports.reportMessage({
      serverId: made.gateway.guildId,
      message: {
        channelId: WEST_CHANNEL,
        messageId: '800000000000000001',
        authorId: '200000000000000005',
        authorName: 'Dave',
        sentAt: 1,
        text: 'Hurtful.',
        attachments: [],
      },
      partyTitle: null,
      nearChannelId: WEST_CHANNEL,
      reporter: { id: '200000000000000003', name: 'Bob' },
      reason: 'Rude.',
    });
    if (reported.kind !== 'sent') throw new Error(reported.kind);
    made.gateway.noManaging.add(WEST_CHANNEL);
    const refused = await made.pressOn(reported.report.id, 'delete');
    expect(sent(refused.editReply).content).toBe(
      `I can't delete messages in <#${WEST_CHANNEL}>; delete it yourself.`,
    );
    made.gateway.noManaging.delete(WEST_CHANNEL);
    const deleted = await made.pressOn(reported.report.id, 'delete');
    expect(sent(deleted.editReply).content).toBe('Deleted: the message is gone.');
    expect(made.gateway.deleted.map((one) => one.messageId)).toContain('800000000000000001');
  });

  it('are for staff alone, a refusal uncounted', async () => {
    const made = await setup();
    for (let i = 0; i < 25; i++) {
      const refused = await made.press('dismiss', { roleNames: ['Valor'] });
      expect(sent(refused.reply).content).toBe('Only admins and moderators can do that.');
    }
    expect(sent((await made.press('dismiss')).editReply).content).toBe(
      'Dismissed: nothing else changes.',
    );
  });
});
