import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  dialogChoices,
  dialogText,
  shownDialog,
  withoutToken,
} from '../../../test/support/dialogs.js';
import { sent, type FakeInteraction } from '../../../test/support/fake-interactions.js';
import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
import { answerOf, buttonsOf } from '../../../test/support/gym-commands.js';
import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, REPORTER } from '../../../test/support/parties.js';
import {
  MEMBER,
  MODERATOR,
  regionCommandsWith,
  regionSaid,
} from '../../../test/support/region-commands.js';
import { Rehearsal } from '../../services/rehearsal.js';
import { FORUM_INPUT } from './remove.js';
import { EXPIRED, REHEARSAL_CHANNELS } from './shared.js';
import { PartyStatus } from '../../domain/party/status.js';

type Made = Awaited<ReturnType<typeof regionCommandsWith>>;

/** Reports a raid at a gym and gives its post. */
async function reported(made: Made, gymId: number): Promise<string> {
  const gym = made.directory.get(gymId);
  if (!gym) throw new Error(`no gym ${gymId}`);
  const outcome = await made.service.reportRaid({
    gym,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: { level: 'T5', shadow: false },
    boss: null,
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  await made.service.flush();
  return outcome.party.forumPostId ?? '';
}

function missingPermissions(): DiscordAPIError {
  const code = RESTJSONErrorCodes.MissingPermissions;
  return new DiscordAPIError(
    { code, message: 'Missing Permissions' },
    code,
    403,
    'DELETE',
    '/x',
    {},
  );
}

/** `/region remove` of `region`, and the dialog it opened. */
async function asked(made: Made, region = 'id:1', extra: object = {}) {
  const used = await made.use('remove', { region }, extra);
  return { used, dialog: shownDialog(used) };
}

/** What a Submit was answered, after its private acknowledgement. */
function outcome(submitted: FakeInteraction): string {
  expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  return regionSaid(answerOf(submitted));
}

const KEEP = { [FORUM_INPUT]: 'keep' };
const DELETE = { [FORUM_INPUT]: 'delete' };

describe('/region remove: the dialog', () => {
  it('says what the removal does, counted, and asks what becomes of the forum', async () => {
    const made = await regionCommandsWith();
    await reported(made, 1);
    made.routes.add(ALICE, 1, 'Loop', [1, 2]);
    made.routes.add(ALICE, 1, 'Other', [3]);
    const { used, dialog } = await asked(made);
    expect(used.deferReply).not.toHaveBeenCalled();
    expect(used.reply).not.toHaveBeenCalled();
    expect(withoutToken(dialog.custom_id)).toBe('region:1:remove');
    expect(dialog.title).toBe('Remove a region');
    // Channels are named in a dialog, never mentioned.
    expect(dialogText(dialog).split('\n')).toEqual([
      'Remove the region #west? This cannot be undone.',
      '- 1 active raid, max battle, train or meetup will be ended; its post says why',
      '- 8 gyms will lie in no region of this server: no raid can be reported there until a ' +
        'region covers them',
      '- 2 saved routes of members will go with it',
      'Its text channel stays as it is, and no gym is deleted.',
      'Its forum #west-raids can stay as history or be deleted, as you pick below.',
      '',
      'Submit removes it.',
    ]);
    expect(dialogChoices(dialog)).toEqual([
      {
        value: 'keep',
        label: 'Keep it as history',
        description: 'Its posts are archived and locked.',
        picked: false,
      },
      {
        value: 'delete',
        label: 'Delete it',
        description: 'Deletes every post in it for good.',
        picked: false,
      },
    ]);
    // Nothing has happened yet.
    expect(made.regions.byId(1)).toBeDefined();
    expect(made.store.inRegion(1)).toHaveLength(1);
  });

  it('asks nothing about a forum where there is none to keep or delete', async () => {
    const made = await regionCommandsWith();
    const { dialog } = await asked(made, 'unbounded');
    expect(withoutToken(dialog.custom_id)).toBe('region:3:remove:keep');
    expect(dialogChoices(dialog)).toEqual([]);
    expect(dialogText(dialog).split('\n')).toEqual([
      'Remove the region #unbounded? This cannot be undone.',
      'Nothing goes with it.',
      'Its text channel stays as it is, and no gym is deleted.',
      'It has no forum.',
      '',
      'Submit removes it.',
    ]);
    made.gateway.gone.add(EAST_FORUM);
    made.gateway.gone.add(EAST_CHANNEL);
    const east = dialogText((await asked(made, 'id:2')).dialog);
    expect(east).toContain(`Remove the region of the deleted channel ${EAST_CHANNEL}?`);
    expect(east).toContain('Its forum is gone already.');
    expect(east).not.toContain('text channel stays');
  });

  it('refuses a region of another server, or none, without a dialog', async () => {
    const made = await regionCommandsWith();
    for (const typed of ['id:99', 'nowhere']) {
      const used = await made.use('remove', { region: typed });
      expect(used.showModal).not.toHaveBeenCalled();
      expect(regionSaid(sent(used.reply))).toContain('is no region of this server');
    }
  });

  it('opens no dialog when what goes with the region takes too long to read', async () => {
    const made = await regionCommandsWith();
    let arrive: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    vi.spyOn(made.regionAdmin, 'removalQuestion').mockImplementation(() => {
      arrive();
      return new Promise(() => undefined);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const using = made.use('remove', { region: 'id:1' });
      await reading;
      await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
      const used = await using;
      expect(used.showModal).not.toHaveBeenCalled();
      expect(sent(used.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
    } finally {
      vi.useRealTimers();
    }
    expect(made.regions.byId(1)).toBeDefined();
  });

  it('gives the buttons of the question it asked before no answer but that it expired', async () => {
    const made = await regionCommandsWith();
    for (const action of ['keep', 'delete', 'cancel']) {
      const pressed = await made.press(`region:0123456789abcdef:${action}`);
      expect(regionSaid(answerOf(pressed))).toBe(EXPIRED);
    }
    expect(made.regions.byId(1)).toBeDefined();
  });
});

describe('/region remove: the answers', () => {
  it('says how many of its parties were ended when one could not be', async () => {
    const made = await regionCommandsWith();
    await reported(made, 1);
    await reported(made, 2);
    const { dialog } = await asked(made);
    // The raid that is ended second cannot be ended: its row is gone from under it. (Both were
    // made in the same millisecond, so which is second is the store's order, by id.)
    const [, second] = made.store.inRegion(1);
    if (!second) throw new Error('no second raid');
    const post = second.forumPostId ?? '';
    made.storage.rows.delete(second.id);
    expect(outcome(await made.submit(dialog, KEEP))).toBe(
      `I could not end <#${post}>, so the region was not removed. Try again in a moment; the ` +
        'log says what failed.\n1 of its raids, max battles, trains and meetups was ended already.',
    );
  });

  it('says when the regions could not be loaded again', async () => {
    const made = await regionCommandsWith();
    const { dialog } = await asked(made, 'id:3');
    made.directory.load = () => Promise.reject(new Error('connection lost'));
    expect(outcome(await made.submit(dialog))).toContain(
      'The region is removed, but I could not load the regions again: members see the change ' +
        'after the next restart.',
    );
  });

  it('removes the region from a dialog opened before its id had a per-open token', async () => {
    const made = await regionCommandsWith();
    const { dialog } = await asked(made);
    const old = { ...dialog, custom_id: withoutToken(dialog.custom_id) };
    expect(outcome(await made.submit(old, KEEP))).toContain('stays as history.');
  });

  it('names the forum the row had when it was removed, not what memory said', async () => {
    const made = await regionCommandsWith();
    const remove = made.regions.remove;
    made.regions.remove = async (id, guildId) => {
      const removed = await remove(id, guildId);
      return removed.removed ? { ...removed, forumChannelId: EAST_FORUM } : removed;
    };
    const { dialog } = await asked(made);
    expect(outcome(await made.submit(dialog, KEEP))).toContain(
      `Its forum <#${EAST_FORUM}> stays as history.`,
    );
    // A row without a forum names none, whatever memory said.
    const other = await regionCommandsWith();
    other.regions.remove = async (id, guildId) => {
      const removed = await remove.call(other.regions, id, guildId);
      return removed.removed ? { ...removed, forumChannelId: null } : removed;
    };
    const done = outcome(await other.submit((await asked(other)).dialog, KEEP));
    expect(done).not.toContain('<#>');
    expect(done).not.toContain('Its forum');
  });

  it('removes the region and keeps the forum as history', async () => {
    const made = await regionCommandsWith();
    const post = await reported(made, 1);
    made.routes.add(ALICE, 1, 'Loop', [1, 2]);
    const { dialog } = await asked(made);
    const submitted = await made.submit(dialog, KEEP);
    await made.settle();
    // The answers after Submit keep their mentions.
    expect(outcome(submitted).split('\n')).toEqual([
      `Removed the region <#${WEST_CHANNEL}>.`,
      '- 1 active raid, max battle, train or meetup was ended; its post says why',
      '- 8 gyms now lie in no region of this server: no raid can be reported there until a ' +
        'region covers them',
      '- 1 saved route of members went with it',
      `Its forum <#${WEST_FORUM}> stays as history.`,
      'If members gave themselves a role for this region, take it off the list with ' +
        '`/admin self-roles remove`.',
    ]);
    expect(buttonsOf(answerOf(submitted))).toEqual([]);
    expect(made.regions.byId(1)).toBeUndefined();
    expect(made.gateway.posts.get(post)).toMatchObject({ archived: true, locked: true });
    expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
    // The channel is no region now: a member asking there is told so.
    const used = await made.run('bounds', { userId: MEMBER, roleNames: [] });
    expect(regionSaid(answerOf(used))).toContain('This channel is not a region.');
  });

  it('removes the region and deletes its forum when that was picked', async () => {
    const made = await regionCommandsWith();
    const { dialog } = await asked(made);
    expect(outcome(await made.submit(dialog, DELETE))).toContain(
      'Its forum was deleted, with every post in it.',
    );
    expect(made.gateway.deletedChannels).toEqual([WEST_FORUM]);
  });

  it('says when the forum could not be deleted, and that the region is gone all the same', async () => {
    const made = await regionCommandsWith();
    made.gateway.failing.set('deleteChannel', missingPermissions());
    const { dialog } = await asked(made);
    expect(outcome(await made.submit(dialog, DELETE))).toContain(
      `I could not delete its forum <#${WEST_FORUM}> (I need Manage Channels there): delete it ` +
        'by hand. The region is gone all the same.',
    );
    expect(made.regions.byId(1)).toBeUndefined();
  });

  it('says that nothing was removed when a party could not be ended', async () => {
    const made = await regionCommandsWith();
    const post = await reported(made, 1);
    const { dialog } = await asked(made);
    made.storage.failing = new Error('connection lost');
    const submitted = await made.submit(dialog, KEEP);
    made.storage.failing = undefined;
    expect(outcome(submitted)).toBe(
      `I could not end <#${post}>, so the region was not removed. Try again in a moment; the ` +
        'log says what failed.',
    );
    expect(made.regions.byId(1)).toBeDefined();
  });

  it('says that the region is still there when its row could not be deleted', async () => {
    const made = await regionCommandsWith();
    await reported(made, 1);
    const { dialog } = await asked(made);
    made.regions.failing = new Error('connection lost');
    const submitted = await made.submit(dialog, KEEP);
    made.regions.failing = undefined;
    expect(outcome(submitted).split('\n')).toEqual([
      'I could not remove the region, and it is still there (the log says what failed). Try ' +
        'again in a moment.',
      '1 of its raids, max battles, trains and meetups was ended before that.',
    ]);
  });

  it('says that the region is gone when somebody removed it in between, or on a second Submit', async () => {
    const made = await regionCommandsWith();
    const first = await asked(made, 'id:3');
    const second = await asked(made, 'id:3');
    await made.submit(first.dialog);
    expect(outcome(await made.submit(second.dialog))).toBe('That region no longer exists.');
    expect(outcome(await made.submit(first.dialog))).toBe('That region no longer exists.');
  });

  it('ends a party that was made between the dialog and its Submit', async () => {
    const made = await regionCommandsWith();
    const { dialog } = await asked(made);
    const post = await reported(made, 2);
    expect(outcome(await made.submit(dialog, KEEP))).toContain(
      '- 1 active raid, max battle, train or meetup was ended; its post says why',
    );
    expect(made.gateway.posts.get(post)?.archived).toBe(true);
  });
});

describe('/region remove: staff without Manage Channels, and rehearsal mode', () => {
  /** A moderator whose roles do not let them manage channels. */
  const LACKING = { permissions: 0n };

  it('offers no choice for the forum, says why, and keeps it on Submit', async () => {
    const made = await regionCommandsWith();
    const { dialog } = await asked(made, 'id:1', LACKING);
    expect(withoutToken(dialog.custom_id)).toBe('region:1:remove:keep');
    expect(dialogChoices(dialog)).toEqual([]);
    expect(dialogText(dialog)).toContain(
      'Its forum #west-raids stays as history (its posts are archived and locked): deleting it ' +
        'takes the Manage Channels permission, which you lack.',
    );
    expect(outcome(await made.submit(dialog, {}, LACKING))).toContain(
      `Its forum <#${WEST_FORUM}> stays as history.`,
    );
    expect(made.gateway.deletedChannels).toEqual([]);
  });

  it('offers no choice for the forum in rehearsal mode, and says why', async () => {
    const rehearsal = new Rehearsal({ allowlist: [MODERATOR], regions: ['west'], staffRoles: [] });
    const made = await regionCommandsWith([], { rehearsal });
    const { dialog } = await asked(made);
    expect(withoutToken(dialog.custom_id)).toBe('region:1:remove:keep');
    expect(dialogText(dialog)).toContain(
      'Its forum #west-raids stays as history (its posts are archived and locked): rehearsal mode ' +
        'is on, and I delete no channel now.',
    );
    expect(made.regions.byId(1)).toBeDefined();
  });

  it('refuses in rehearsal mode to delete the forum, and removes nothing', async () => {
    const made = await regionCommandsWith();
    const { dialog } = await asked(made);
    // Rehearsal mode came on after the dialog opened.
    Object.assign(made.ctx, {
      rehearsal: new Rehearsal({ allowlist: [MODERATOR], regions: ['west'], staffRoles: [] }),
    });
    const submitted = await made.submit(dialog, DELETE);
    expect(sent(submitted.followUp).content).toBe(REHEARSAL_CHANNELS);
    expect(made.regions.byId(1)).toBeDefined();
    expect(made.gateway.deletedChannels).toEqual([]);
  });

  it('refuses to delete the forum for one who lost Manage Channels since the dialog opened', async () => {
    const made = await regionCommandsWith();
    const { dialog } = await asked(made);
    const submitted = await made.submit(dialog, DELETE, LACKING);
    expect(sent(submitted.followUp).content).toBe(
      'Deleting the forum of a region takes the Manage Channels permission, which you lack. ' +
        'Nothing was removed.',
    );
    expect(made.regions.byId(1)).toBeDefined();
    expect(made.gateway.deletedChannels).toEqual([]);
  });

  it('says who deleted the forum in the audit log of the server', async () => {
    const made = await regionCommandsWith();
    await made.submit((await asked(made)).dialog, DELETE);
    expect(made.gateway.deletedChannels).toEqual([WEST_FORUM]);
    expect(made.gateway.auditReasons.get(WEST_FORUM)).toBe(
      `/region remove by ${made.staff.userId ?? ''}`,
    );
  });

  it('lets only staff submit', async () => {
    const made = await regionCommandsWith();
    const { dialog } = await asked(made, 'id:3');
    const member = await made.submit(dialog, {}, { userId: MEMBER, roleNames: [] });
    expect(regionSaid(sent(member.reply))).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    expect(made.regions.byId(3)).toBeDefined();
  });
});
