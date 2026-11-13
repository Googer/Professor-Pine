import { dialogText, shownDialog } from '../../../test/support/dialogs.js';
import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { asV2, sent } from '../../../test/support/fake-interactions.js';
import { STAFF_PLACE, withOtherServer } from '../../../test/support/gym-admin.js';
import { NORTH_PLACE, TEST_GUILD_ROW } from '../../../test/support/gyms.js';
import {
  answerOf,
  buttonId,
  buttonsOf,
  gymCommandsWith,
  gymViewOf,
  MEMBER,
  said,
} from '../../../test/support/gym-commands.js';
import { REPORTER } from '../../../test/support/parties.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { PartyStatus } from '../../domain/party/status.js';
import { moveForm, VIEW_GONE, viewControls } from './view-controls.js';

type Made = Awaited<ReturnType<typeof gymCommandsWith>>;

/** `/gym show` of a gym: its answer, with the view's buttons. */
async function shown(made: Made, gym: string) {
  return answerOf(await made.use('show', { gym }));
}

/** The form a press opened. */
function formOf(pressed: { showModal: { mock: { calls: unknown[][] } } }) {
  const form = pressed.showModal.mock.calls[0]?.[0] as { custom_id: string } | undefined;
  if (!form) throw new Error('no form was opened');
  return form;
}

describe('the buttons of the view of /gym show', () => {
  it('stand beside the Map link of /gym show, and only there', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:1');
    expect(buttonsOf(view)).toEqual([
      ['Map', ''],
      ['Edit…', 'gymview:1:edit'],
      ['Make elite', 'gymview:1:elite:1'],
      ['Move…', 'gymview:1:move'],
      ['Delete…', 'gymview:1:delete'],
    ]);
    expectV2Sendable(asV2(view));
    // An answer of a change has none of them.
    const elite = answerOf(await made.use('elite', { gym: 'id:1', eligible: true }));
    expect(buttonsOf(elite).map(([label]) => label)).toEqual(['Map']);
    expect(viewControls({ id: 1, taggedEx: false, confirmedEx: true })[1]).toMatchObject({
      label: 'Not elite',
      custom_id: 'gymview:1:elite:0',
    });
  });

  it('marks a gym elite and takes it back in place, the label saying what a press does', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:1');
    const marked = await made.press(buttonId(view, 'Make elite'));
    expect(marked.deferUpdate).toHaveBeenCalledTimes(1);
    expect(marked.reply).not.toHaveBeenCalled();
    const answer = answerOf(marked);
    expect(said(answer)).toBe(
      '**Pinewood Public Library** (The Stacks, #1) is now marked as an elite raid gym.',
    );
    expect(gymViewOf(answer).facts['Elite raid gym']).toBe('yes');
    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
      'Map',
      'Edit…',
      'Not elite',
      'Move…',
      'Delete…',
    ]);
    expect(made.gymStore.row(1)).toMatchObject({ taggedEx: true });
    const cleared = answerOf(await made.press(buttonId(answer, 'Not elite')));
    expect(said(cleared)).toContain('is no longer marked as an elite raid gym.');
    expect(made.gymStore.row(1)).toMatchObject({ taggedEx: false, confirmedEx: false });
  });

  it('sets what its label said, also on a view drawn before somebody else changed the mark', async () => {
    const made = await gymCommandsWith();
    const stale = await shown(made, 'id:1');
    await made.use('elite', { gym: 'id:1', eligible: true });
    const pressed = await made.press(buttonId(stale, 'Make elite'));
    // Make elite on a gym that is one already keeps it one.
    expect(made.gymStore.row(1)).toMatchObject({ taggedEx: true });
    expect(said(answerOf(pressed))).toBe(
      '**Pinewood Public Library** (The Stacks, #1) was an elite raid gym already.',
    );
    expect(buttonsOf(answerOf(pressed))).toContainEqual(['Not elite', 'gymview:1:elite:0']);
  });

  it('says in the place of the view that a gym deleted during the press is gone', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:1');
    vi.spyOn(made.admin, 'setElite').mockResolvedValueOnce(undefined);
    const pressed = await made.press(buttonId(view, 'Make elite'));
    expect(pressed.followUp).not.toHaveBeenCalled();
    expect(said(answerOf(pressed))).toBe(VIEW_GONE);
    expect(buttonsOf(answerOf(pressed))).toEqual([]);
  });

  it('names the gym in the title of the Move form as a sentence does, within 45 characters', () => {
    expect(moveForm({ id: 6, name: 'A'.repeat(60) }).title).toBe(`Move ${'A'.repeat(37)}…`);
    expect(moveForm({ id: 6, name: '\u202e\u200b' }).title).toBe('Move gym #6');
    expect(moveForm({ id: 6, name: '*Big* Fountain' }).title).toBe('Move *Big* Fountain');
  });

  it('moves a gym into another server’s region, and refuses a gym gone, from the Move form', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:6');
    const form = formOf(await made.press(buttonId(view, 'Move…')));
    await withOtherServer(made);
    // Far: asked first, as any far move; no refusal for the other server's region (plan 19B-2).
    const far = await made.submit(form.custom_id, {
      location: `${NORTH_PLACE.lat}, ${NORTH_PLACE.lon}`,
    });
    expect(said(answerOf(far))).toMatch(/^Move \*\*Maple Leaf Mosaic\*\* \(#6\) from /);
    await made.admin.delete(6, { id: REPORTER }, STAFF_PLACE);
    const gone = await made.submit(form.custom_id, { location: '40.0302, -80.03' });
    expect(said(answerOf(gone))).toBe(VIEW_GONE);
  });

  it('opens the form of /gym edit, and answers it in a message of its own', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:1');
    const pressed = await made.press(buttonId(view, 'Edit…'));
    const form = formOf(pressed) as unknown as {
      custom_id: string;
      components: { components: { custom_id: string; value?: string }[] }[];
    };
    const typed = Object.fromEntries(
      form.components.map((row) => [
        row.components[0]?.custom_id ?? '',
        row.components[0]?.value ?? '',
      ]),
    );
    expect(typed.name).toBe('Pinewood Public Library');
    const submitted = await made.submit(form.custom_id, { ...typed, notice: 'Wet paint' });
    // The view stays as it is: the answer is a private message of its own.
    expect(submitted.update).not.toHaveBeenCalled();
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const answer = answerOf(submitted);
    expect(said(answer)).toBe(
      'Changed the notice of **Pinewood Public Library** (The Stacks, #1).',
    );
    expect(gymViewOf(answer).facts.Notice).toBe('Wet paint');
    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Map']);
    expect(made.gymStore.row(1)?.notice).toBe('Wet paint');
  });

  it('answers a refused form of Edit… in a message of its own, and the next in its place', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:1');
    const form = formOf(await made.press(buttonId(view, 'Edit…')));
    const refused = await made.submit(form.custom_id, { name: '' });
    expect(refused.update).not.toHaveBeenCalled();
    const refusal = sent(refused.reply);
    expect(refusal.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    expect(said(refusal)).toMatch(/^A gym needs a name\./);
    // Opened again from the refusal, the form is answered in the place of the refusal.
    const again = await made.press(buttonId(refusal, 'Open the form again…'));
    const second = formOf(again);
    const done = await made.submit(second.custom_id, { name: 'Reading Room' });
    expect(done.deferUpdate).toHaveBeenCalledTimes(1);
    expect(said(answerOf(done))).toMatch(/^Changed the name, .* of \*\*Reading Room\*\* \(#1\)\.$/);
  });

  it('moves a gym from the form of Move…, answering as /gym move in a message of its own', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:6');
    const pressed = await made.press(buttonId(view, 'Move…'));
    const form = formOf(pressed);
    expect(form).toEqual(moveForm({ id: 6, name: 'Maple Leaf Mosaic' }));
    // A correction of some metres: moved at once.
    const near = await made.submit(form.custom_id, { location: '40.0302, -80.03' });
    expect(near.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(near.update).not.toHaveBeenCalled();
    expect(said(answerOf(near))).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\* \(#6\) from /);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.0302, lon: -80.03 });
    // Far away: the question of /gym move, answered in its place.
    const far = await made.submit(form.custom_id, { location: '40.2, -80.03' });
    const question = answerOf(far);
    expect(said(question)).toContain('Move **Maple Leaf Mosaic** (#6) from');
    const moved = await made.press(buttonId(question, 'Move anyway'));
    expect(said(answerOf(moved))).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\*/);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.2 });
    // A place that cannot be read is refused as /gym move refuses it.
    const unread = await made.submit(form.custom_id, { location: 'somewhere' });
    expect(said(answerOf(unread))).toMatch(/^I could not read a place from that\./);
  });

  it('refuses a place the Move form cannot read as /gym move does, the view untouched', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:6');
    const form = formOf(await made.press(buttonId(view, 'Move…')));
    const before = made.gymStore.row(6);
    const refused = await made.submit(form.custom_id, { location: 'nowhere' });
    expect(refused.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(refused.update).not.toHaveBeenCalled();
    expect(said(answerOf(refused))).toMatch(/^I could not read a place from that\./);
    expect(made.gymStore.row(6)).toEqual(before);
  });

  it('asks before it deletes, in the dialog of /gym delete, the view staying', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:6');
    const pressed = await made.press(buttonId(view, 'Delete…'));
    expect(pressed.deferReply).not.toHaveBeenCalled();
    expect(pressed.update).not.toHaveBeenCalled();
    const dialog = shownDialog(pressed);
    expect(dialog.title).toBe('Delete a gym');
    expect(dialogText(dialog)).toBe(
      'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.\nNothing refers to it.\n\n' +
        'Submit deletes it.',
    );
    const deleted = await made.submit(dialog.custom_id, {});
    expect(deleted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(deleted.update).not.toHaveBeenCalled();
    expect(said(answerOf(deleted))).toBe('Deleted **Maple Leaf Mosaic** (#6).');
    expect(made.gymStore.row(6)).toBeUndefined();
  });

  it('refuses to delete a gym with a raid, as /gym delete does', async () => {
    const made = await gymCommandsWith();
    const gym = made.directory.stored(6);
    if (!gym) throw new Error('no gym 6');
    const raid = await made.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (raid.kind !== 'created') throw new Error('no raid');
    const view = await shown(made, 'id:6');
    const pressed = await made.press(buttonId(view, 'Delete…'));
    expect(pressed.showModal).not.toHaveBeenCalled();
    expect(said(answerOf(pressed))).toMatch(/^A raid is at \*\*Maple Leaf Mosaic\*\* \(#6\)/);
    expect(made.gymStore.row(6)).toBeDefined();
  });

  it('refuses every button of a gym that is gone, or lies in another server’s regions only', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:6');
    await made.admin.delete(6, { id: REPORTER }, STAFF_PLACE);
    for (const label of ['Edit…', 'Make elite', 'Move…', 'Delete…']) {
      const pressed = await made.press(buttonId(view, label));
      expect(said(answerOf(pressed))).toBe(VIEW_GONE);
      expect(pressed.showModal).not.toHaveBeenCalled();
    }
    const north = await withOtherServer(made);
    const foreign = await made.press(`gymview:${north.id}:elite`);
    expect(said(answerOf(foreign))).toBe(VIEW_GONE);
    expect(made.gymStore.row(north.id)).toMatchObject({ taggedEx: false });
    // A number that is no gym's, and one that is no number.
    expect(said(answerOf(await made.press('gymview:4242:delete')))).toBe(VIEW_GONE);
    expect(said(answerOf(await made.press('gymview:x:delete')))).toBe(VIEW_GONE);
  });

  it('lets nobody but staff press them', async () => {
    const made = await gymCommandsWith();
    const view = await shown(made, 'id:1');
    const pressed = await made.press(buttonId(view, 'Make elite'), {
      userId: MEMBER,
      roleNames: [],
    });
    expect(said(sent(pressed.reply))).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    expect(made.gymStore.row(1)).toMatchObject({ taggedEx: false });
  });
});
