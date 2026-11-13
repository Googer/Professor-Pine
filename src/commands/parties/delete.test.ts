import {
  MessageFlags,
  PermissionFlagsBits,
  type APIModalInteractionResponseCallbackData,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  dialogChoices,
  dialogTexts,
  shownDialog,
  withoutToken,
} from '../../../test/support/dialogs.js';
import {
  asV2,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import {
  OTHER_GUILD_ID,
  REMOTE_CHANNEL,
  TEST_GUILD_ROW,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { missingPermissions, networkAway } from '../../../test/support/fake-gateway.js';
import { MODERATOR } from '../../../test/support/meetup-safety-cases.js';
import { ALICE, BOB } from '../../../test/support/parties.js';
import { reportedMeetup } from '../../../test/support/reports-service.js';
import { gatewayWithMirrorChannels, reportedRaid } from '../../../test/support/party-service.js';
import { TEST_ENV } from '../../../test/support/test-env.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import { REMOVAL_INPUT } from '../../render/moderation.js';
import { closeControls, deleteParty } from './delete.js';
import { accentOf, buttonsOf, header, textOf } from '../../../test/support/messages.js';

const yveltal = { boss: { key: 'yveltal' } } as const;

/** The names of the fakes' channels as the server has them: the forum of the raids. */
const CHANNELS = { [WEST_FORUM]: 'west-raids' };

async function setup() {
  const made = await reportedRaid(yveltal, {}, { gateway: gatewayWithMirrorChannels() });
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [deleteParty], [partyButtons, closeControls]);
  const handle = async <I extends FakeInteraction>(interaction: I) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const inPost = {
    channelId: made.postId,
    thread: { parentId: WEST_FORUM },
    guildChannelNames: CHANNELS,
  };
  /** `/delete` in the raid's post (or where `extra` says), by Alice with these roles. */
  const run = (roleNames: string[] = [], extra: object = {}) =>
    handle(fakeChatInput({ commandName: 'delete', userId: ALICE, roleNames, ...inPost, ...extra }));
  /** The dialog of `/delete` as a moderator is shown it now, in the post or where `extra` says. */
  const opened = async (extra: object = {}) => shownDialog(await run(['Moderator'], extra));
  /**
   * The Submit of the dialog of `/delete` (opened now unless given), `removal` picked (none for
   * a dialog without the choice), by Alice with these roles.
   */
  const submit = async (
    removal: 'archive' | 'delete' | undefined,
    roleNames = ['Moderator'],
    extra: object = {},
    dialog?: APIModalInteractionResponseCallbackData,
  ) => {
    const form = dialog ?? (await opened());
    return handle(
      fakeModal({
        customId: form.custom_id,
        form,
        ...(removal === undefined ? {} : { picked: { [REMOVAL_INPUT]: removal } }),
        userId: ALICE,
        roleNames,
        ...inPost,
        ...extra,
      }),
    );
  };
  /** What a Submit was answered, after its private acknowledgement: its last edit. */
  const shown = (submitted: FakeInteraction) => {
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    return textOf(asV2(sent(submitted.editReply, submitted.editReply.mock.calls.length - 1)));
  };
  return { ...made, ctx, run, opened, submit, shown, handle };
}

describe('/delete', () => {
  it('is for staff alone, and hidden from the others by Manage Messages', async () => {
    expect(deleteParty.data.toJSON().default_member_permissions).toBe(
      String(PermissionFlagsBits.ManageMessages),
    );
    expect(deleteParty.help.category).toBe('admin');
    const made = await setup();
    for (const roleNames of [['Valor'], ['Bot Developer']]) {
      const used = await made.run(roleNames);
      expect(used.showModal).not.toHaveBeenCalled();
      expect(sent(used.reply)).toEqual({
        content: 'Only admins and moderators can do that.',
        flags: MessageFlags.Ephemeral,
      });
    }
    // A dialog submitted by somebody who is no longer staff.
    const submitted = await made.submit('archive', ['Valor']);
    expect(sent(submitted.reply).content).toBe('Only admins and moderators can do that.');
    expect(made.store.get(made.party.id)).toBeDefined();
  });

  it('asks staff in a dialog whether to archive the post or delete it, and changes nothing yet', async () => {
    for (const who of [{ roleNames: ['ADMIN'] }, { userId: TEST_ENV.OWNER_ID }]) {
      const made = await setup();
      const used = await made.run(who.roleNames ?? [], who.userId ? { userId: who.userId } : {});
      expect(used.reply).not.toHaveBeenCalled();
      expect(used.deferReply).not.toHaveBeenCalled();
      const dialog = shownDialog(used);
      expect(withoutToken(dialog.custom_id)).toBe(`pclose:${made.party.id}:close`);
      expect(dialog.title).toBe('Close this raid');
      expect(dialogTexts(dialog)).toEqual(['Close this raid?']);
      expect(
        dialogChoices(dialog).map(({ value, label, picked }) => [value, label, picked]),
      ).toEqual([
        ['archive', 'Archive post', false],
        ['delete', 'Delete post', false],
      ]);
      expect(made.store.get(made.party.id)).toBeDefined();
    }
  });

  it('offers no choice where the bot may not delete the post, and archives it on Submit', async () => {
    const made = await setup();
    made.gateway.noManaging.add(WEST_FORUM);
    const dialog = await made.opened();
    expect(withoutToken(dialog.custom_id)).toBe(`pclose:${made.party.id}:close:archive`);
    expect(dialogChoices(dialog)).toEqual([]);
    expect(dialogTexts(dialog)[0]).toContain(
      "I can't delete posts in #west-raids (Manage Threads is missing there)",
    );
    expect(made.shown(await made.submit(undefined, ['Moderator'], {}, dialog))).toBe(
      'This raid is closed: its gym is free for a new report, and I am archiving and locking its post.',
    );
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
    expect(made.gateway.deletedPosts).toEqual([]);
  });

  it('archives: the post says who closed it, and is archived and locked', async () => {
    const made = await setup();
    const { gateway, store, postId } = made;
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.attendance.flush();
    await made.service.flush();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);

    const submitted = await made.submit('archive');
    expect(made.shown(submitted)).toBe(
      'This raid is closed: its gym is free for a new report, and I am archiving and locking its post.',
    );
    expect(store.get(made.party.id)).toBeUndefined();
    // Recorded in the history as closed, and its row (with its members' ids) deleted.
    expect(made.history.records).toEqual([
      expect.objectContaining({ partyId: made.party.id, ending: 'cancelled', closedBy: 'staff' }),
    ]);
    expect(made.said().at(-1)).toBe(`This raid was closed by **Member** (<@${ALICE}>).`);
    const post = gateway.posts.get(postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(buttonsOf(post?.message)).toEqual([]);
    expect(header(post?.message)[1]).toBe(`This raid was closed by **Member** (<@${ALICE}>).`);
    expect(accentOf(post?.message)).toBe(0xe74c3c);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
  });

  it('deletes: the post goes with everything in it, and the copies and link line with it', async () => {
    const made = await setup();
    const { gateway, postId } = made;
    await made.service.flush();
    const submitted = await made.submit('delete');
    expect(made.shown(submitted)).toBe(
      'This raid is closed: its gym is free for a new report, and I am deleting its post.',
    );
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(gateway.deletedPosts).toEqual([postId]);
    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(made.history.records).toEqual([
      expect.objectContaining({ partyId: made.party.id, ending: 'cancelled' }),
    ]);
  });

  it('refuses to delete where the bot may no longer, before anything ends', async () => {
    const made = await setup();
    const dialog = await made.opened();
    made.gateway.noManaging.add(WEST_FORUM);
    const submitted = await made.submit('delete', ['Moderator'], {}, dialog);
    expect(made.shown(submitted)).toBe(
      `I can't delete posts in <#${WEST_FORUM}> (Manage Threads is missing there). Archive it, or ` +
        'delete it yourself.',
    );
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.gateway.deletedPosts).toEqual([]);
  });

  it('answers the moderator before anything is done to the post', async () => {
    const made = await setup();
    const dialog = await made.opened();
    const submitted = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      picked: { [REMOVAL_INPUT]: 'archive' },
      userId: ALICE,
      roleNames: ['Admin'],
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
    });
    let callsWhenAnswered = -1;
    let activeWhenAnswered = true;
    const before = made.gateway.calls.length;
    submitted.editReply.mockImplementation(() => {
      callsWhenAnswered = made.gateway.calls.length - before;
      activeWhenAnswered = made.store.get(made.party.id) !== undefined;
      return Promise.resolve();
    });
    await made.handle(submitted);
    expect(submitted.editReply).toHaveBeenCalledTimes(1);
    // The party had left the store, and Discord had not been asked for anything yet.
    expect(activeWhenAnswered).toBe(false);
    expect(callsWhenAnswered).toBe(0);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('closes the raid although the answer cannot be given', async () => {
    const made = await setup();
    const dialog = await made.opened();
    const submitted = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      picked: { [REMOVAL_INPUT]: 'archive' },
      userId: ALICE,
      roleNames: ['Admin'],
    });
    submitted.editReply.mockImplementation(() => Promise.reject(new Error('Unknown interaction')));
    await made.handle(submitted);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
  });

  it('takes no Submit for a party of another server: it has ended there', async () => {
    const made = await setup();
    const submitted = await made.submit('delete', ['Moderator'], { guildId: OTHER_GUILD_ID });
    expect(made.shown(submitted)).toBe('This has ended.');
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.gateway.deletedPosts).toEqual([]);
  });

  it('gives a Submit without the choice (a dialog of an older shape) the stale answer', async () => {
    const made = await setup();
    const forged = await made.handle(
      fakeModal({
        customId: `pclose:${made.party.id}:close`,
        userId: ALICE,
        roleNames: ['Moderator'],
        channelId: made.postId,
        thread: { parentId: WEST_FORUM },
      }),
    );
    expect(sent(forged.reply).content).toBe(STALE_COMPONENT);
    expect(made.store.get(made.party.id)).toBeDefined();
  });

  it('submits a dialog opened before its id had a per-open token', async () => {
    const made = await setup();
    const dialog = await made.opened();
    const old = { ...dialog, custom_id: withoutToken(dialog.custom_id) };
    expect(made.shown(await made.submit('archive', ['Moderator'], {}, old))).toBe(
      'This raid is closed: its gym is free for a new report, and I am archiving and locking its post.',
    );
  });

  it('gives the buttons of the question it asked before the stale answer', async () => {
    const made = await setup();
    for (const removal of ['archive', 'delete']) {
      const pressed = await made.handle(
        fakeButton({
          customId: `pclose:${made.party.id}:${removal}`,
          userId: ALICE,
          roleNames: ['Moderator'],
          ephemeralMessage: true,
          v2Message: true,
        }),
      );
      expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
    }
    expect(made.store.get(made.party.id)).toBeDefined();
  });

  it('says that the post was archived where Discord refused to delete it', async () => {
    const made = await setup();
    made.gateway.failing.set('deletePost', missingPermissions('MANAGE_THREADS'));
    expect(made.shown(await made.submit('delete'))).toBe(
      'This raid is closed: its gym is free for a new report, and its post is archived: ' +
        'Discord refused to delete it; delete it yourself.',
    );
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true });
  });

  it('says that the deletion is still to come where the network failed it (review r1 C1)', async () => {
    const made = await setup();
    made.gateway.failing.set('deletePost', networkAway());
    expect(made.shown(await made.submit('delete'))).toBe(
      'This raid is closed: its gym is free for a new report, and its post is archived for now: ' +
        'Discord did not answer when I tried to delete it. I will try again within the hour; if ' +
        'it is still there after that, delete it yourself.',
    );
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true });
    made.gateway.failing.clear();
    await made.service.redoClosings();
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
  });

  it('deletes the post of a raid that ended a moment before, when Delete post was picked', async () => {
    const made = await setup();
    const dialog = await made.opened();
    const endAs = made.service.endAs.bind(made.service);
    // The raid ends between the Submit and the closing.
    made.service.endAs = async (...args) => {
      await endAs(made.party.id);
      return endAs(...args);
    };
    expect(made.shown(await made.submit('delete', ['Moderator'], {}, dialog))).toBe(
      'This raid was over already; I deleted its post.',
    );
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
  });

  it('takes it calmly when the answer cannot be given in the post it just deleted', async () => {
    const made = await setup();
    const dialog = await made.opened();
    const endAs = made.service.endAs.bind(made.service);
    made.service.endAs = async (...args) => {
      await endAs(made.party.id);
      return endAs(...args);
    };
    const submitted = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      picked: { [REMOVAL_INPUT]: 'delete' },
      userId: ALICE,
      roleNames: ['Moderator'],
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
    });
    // The answer lived in the post, which is gone with it.
    submitted.editReply.mockImplementation(() => Promise.reject(new Error('Unknown Channel')));
    await made.handle(submitted);
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
    expect(submitted.followUp).not.toHaveBeenCalled();
  });

  it('has no limit on the command; its dialog takes twenty Submits a minute', async () => {
    expect(deleteParty.throttle).toBeUndefined();
    const made = await setup();
    const dialog = await made.opened();
    for (let i = 0; i < 20; i++) await made.submit('archive', ['Moderator'], {}, dialog);
    expect(sent((await made.submit('archive', ['Moderator'], {}, dialog)).reply).content).toMatch(
      /^That was a lot of clicks/,
    );
  });

  it('closes as many raids as there are, one after the other', async () => {
    const made = await setup();
    for (const gymId of [2, 3]) {
      const gym = made.ctx.gyms.stored(gymId);
      if (!gym) throw new Error('an invented gym is missing');
      const outcome = await made.service.reportRaid({
        gym,
        guildRow: TEST_GUILD_ROW,
        reporterId: BOB,
        anonymous: false,
        autoStatus: PartyStatus.Interested,
        tier: { level: 'T5', shadow: false },
        boss: null,
      });
      if (outcome.kind !== 'created') throw new Error(outcome.kind);
      const where = { channelId: outcome.party.forumPostId };
      const dialog = await made.opened(where);
      expect(withoutToken(dialog.custom_id)).toBe(`pclose:${outcome.party.id}:close`);
      const submitted = await made.submit('archive', ['Moderator'], where, dialog);
      expect(made.shown(submitted)).toMatch(/^This raid is closed/);
      expect(made.store.get(outcome.party.id)).toBeUndefined();
    }
  });

  it('frees the gym for a new report', async () => {
    const made = await setup();
    await made.submit('archive', ['Admin']);
    const gym = made.ctx.gyms.stored(1);
    if (!gym) throw new Error('no gym 1');
    const again = await made.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    expect(again.kind).toBe('created');
  });

  it('says that the raid is over when somebody else closed it first', async () => {
    const made = await setup();
    const dialog = await made.opened();
    await made.service.end(made.party.id);
    expect(made.shown(await made.submit('archive', ['Moderator'], {}, dialog))).toBe(
      'This has ended.',
    );
    const made2 = await setup();
    const dialog2 = await made2.opened();
    const endAs = made2.service.endAs.bind(made2.service);
    // The raid ends between the Submit and the closing.
    made2.service.endAs = async (...args) => {
      await endAs(made2.party.id);
      return endAs(...args);
    };
    expect(made2.shown(await made2.submit('archive', ['Moderator'], {}, dialog2))).toBe(
      'This raid is over.',
    );
  });
});

describe('requests to delete a raid in its post (reports without a moderators’ channel)', () => {
  /** Makes the next `sendMessage` into the post fail, once. */
  function failNextSend(made: Awaited<ReturnType<typeof setup>>): void {
    const send = made.gateway.sendMessage.bind(made.gateway);
    let failed = false;
    made.gateway.sendMessage = (channelId, message) => {
      if (!failed && channelId === made.postId) {
        failed = true;
        return Promise.reject(new Error('Discord is away'));
      }
      return send(channelId, message);
    };
  }
  const ADMIN_ROLE = '800000000000000001';
  const MODERATOR_ROLE = '800000000000000002';
  const roles = [ADMIN_ROLE, MODERATOR_ROLE];
  /** The requests in the post: the messages that say which roles they may ping. */
  const requests = (made: Awaited<ReturnType<typeof setup>>) =>
    made.gateway
      .messagesIn(made.postId)
      .map((message) => message.message)
      .filter((message) => message.mention?.roles !== undefined);
  const pinging = (made: Awaited<ReturnType<typeof setup>>) =>
    requests(made).filter((message) => (message.mention?.roles?.length ?? 0) > 0);

  it('pings the roles with the next request when the first could not be sent', async () => {
    const made = await setup();
    failNextSend(made);
    await expect(
      made.service.requestDeletion(made.party.id, { id: ALICE }, 'one', roles),
    ).rejects.toThrow('Discord is away');
    expect(await made.service.requestDeletion(made.party.id, { id: BOB }, 'two', roles)).toBe(
      'asked',
    );
    expect(pinging(made)).toHaveLength(1);
    expect(requests(made)[0]?.content).toContain(`<@${BOB}>`);
  });

  it('pings the roles with the second of two requests at once when the first fails', async () => {
    const made = await setup();
    failNextSend(made);
    const outcomes = await Promise.allSettled([
      made.service.requestDeletion(made.party.id, { id: ALICE }, 'one', roles),
      made.service.requestDeletion(made.party.id, { id: BOB }, 'two', roles),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['rejected', 'fulfilled']);
    expect(pinging(made)).toHaveLength(1);
    expect(requests(made)).toHaveLength(1);
  });

  it('puts exactly one message with roles into the post for two requests at once', async () => {
    const made = await setup();
    const outcomes = await Promise.all([
      made.service.requestDeletion(made.party.id, { id: ALICE }, 'one', roles),
      made.service.requestDeletion(made.party.id, { id: BOB }, 'two', roles),
    ]);
    expect(outcomes).toEqual(['asked', 'asked']);
    expect(requests(made)).toHaveLength(2);
    expect(pinging(made)).toHaveLength(1);
  });

  it('does not tell a member who sent two forms at once that they asked when the first failed', async () => {
    const made = await setup();
    failNextSend(made);
    const outcomes = await Promise.allSettled([
      made.service.requestDeletion(made.party.id, { id: ALICE }, 'one', roles),
      made.service.requestDeletion(made.party.id, { id: ALICE }, 'one again', roles),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['rejected', 'fulfilled']);
    expect(outcomes[1]).toEqual({ status: 'fulfilled', value: 'asked' });
    expect(requests(made)).toHaveLength(1);
    expect(requests(made)[0]?.content).toContain('one again');
  });

  it('says that a request is gone when the raid ended while it waited', async () => {
    const made = await setup();
    const first = made.service.requestDeletion(made.party.id, { id: ALICE }, 'one', roles);
    const second = made.service.requestDeletion(made.party.id, { id: BOB }, 'two', roles);
    await made.service.end(made.party.id);
    await first;
    expect(await second).toBe('gone');
    expect(made.service.deletionRequestsTracked).toBe(0);
  });

  it('forgets who asked once the raid has ended, also because its post is gone', async () => {
    const made = await setup();
    await made.service.requestDeletion(made.party.id, { id: ALICE }, 'A duplicate', roles);
    expect(made.service.deletionRequestsTracked).toBe(1);
    await made.service.end(made.party.id);
    expect(made.service.deletionRequestsTracked).toBe(0);
    expect(await made.service.requestDeletion(made.party.id, { id: ALICE }, 'again', [])).toBe(
      'gone',
    );
    const other = await setup();
    await other.service.requestDeletion(other.party.id, { id: ALICE }, 'A duplicate', roles);
    other.gateway.gone.add(other.postId);
    await other.attendance.signUp(other.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await other.service.flush();
    expect(other.store.get(other.party.id)).toBeUndefined();
    expect(other.service.deletionRequestsTracked).toBe(0);
  });
});

describe('/delete of a reported party', () => {
  /** Alice's meetup reported by Bob, and Mod's answer to the question of `/delete`. */
  async function reportedAndClosed(removal: 'archive' | 'delete', refuse = false, away = false) {
    const made = await reportedMeetup();
    const outcome = await made.report();
    if (outcome.kind !== 'sent') throw new Error(outcome.kind);
    const { ctx } = createTestContext({
      partyService: made.service,
      attendance: made.attendance,
      parties: made.store,
      regions: made.regions,
      reports: made.reports,
      meetupSafety: made.safety,
    });
    if (refuse) made.gateway.failing.set('deletePost', missingPermissions('MANAGE_THREADS'));
    if (away) made.gateway.failing.set('deletePost', networkAway());
    const router = new InteractionRouter(ctx, [deleteParty], [closeControls]);
    const asMod = {
      userId: MODERATOR,
      displayName: 'Mod',
      roleNames: ['Moderator'],
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
    };
    const used = fakeChatInput({ commandName: 'delete', ...asMod });
    await router.handle(used as never);
    const dialog = shownDialog(used);
    // A meetup's dialog says so.
    expect(dialog.title).toBe('Close this meetup');
    await router.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        picked: { [REMOVAL_INPUT]: removal },
        ...asMod,
      }) as never,
    );
    await made.reports.flush();
    return {
      stored: await made.reportStore.report(outcome.report.id),
      post: made.reportPostOf(outcome.report),
    };
  }

  it('closes the report as that moderator’s, without the way to the post it deleted', async () => {
    const { stored, post } = await reportedAndClosed('delete');
    expect(stored).toMatchObject({
      status: 'closed',
      removal: 'delete',
      decidedBy: MODERATOR,
      decidedByName: 'Mod',
    });
    expect(textOf(post)).toContain(`**Closed** by **Mod** (<@${MODERATOR}>)`);
    expect(textOf(post)).toContain('its post is deleted.');
    expect(textOf(post)).not.toContain('over before a moderator decided');
    expect(buttonsOf(post)).toEqual([]);
  });

  it('says how the post really went: archived, also where Discord refused to delete it', async () => {
    const archived = await reportedAndClosed('archive');
    expect(archived.stored).toMatchObject({ status: 'closed', removal: 'archive' });
    expect(textOf(archived.post)).toContain('its post is archived.');
    expect(buttonsOf(archived.post).map((button) => button.label)).toEqual(['Go to post']);
    const refused = await reportedAndClosed('delete', true);
    expect(refused.stored).toMatchObject({ status: 'closed', removal: 'denied' });
    expect(textOf(refused.post)).toContain('archived: Discord refused to delete it');
    expect(buttonsOf(refused.post).map((button) => button.label)).toEqual(['Go to post']);
  });

  it('keeps a deletion the network failed as deleted: the redo deletes it (review r1 C1)', async () => {
    const { stored, post } = await reportedAndClosed('delete', false, true);
    expect(stored).toMatchObject({ status: 'closed', removal: 'delete' });
    expect(textOf(post)).toContain('its post is deleted.');
  });
});
