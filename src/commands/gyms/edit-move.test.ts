import { gymStop } from '../../domain/party/stops.js';
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
import { loadSettings } from '../../config/settings.js';
import { sent } from '../../../test/support/fake-interactions.js';
import { STAFF_PLACE, UPDATES_CHANNEL } from '../../../test/support/gym-admin.js';
import {
  answerOf,
  buttonId,
  buttonsOf,
  gymCommandsWith,
  gymOf,
  gymViewOf,
  MEMBER,
  MODERATOR,
  said,
} from '../../../test/support/gym-commands.js';
import {
  EAST_CHANNEL,
  TEST_GUILD_ROW,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { REPORTER } from '../../../test/support/parties.js';
import { PartyStatus } from '../../domain/party/status.js';
import { ANSWERED_BELOW } from '../../discord/late-reply.js';
import { testServerValues } from '../../../test/support/server-values.js';

type Made = Awaited<ReturnType<typeof gymCommandsWith>>;

interface Form {
  custom_id: string;
  title: string;
  components: { components: { custom_id: string; value?: string; required?: boolean }[] }[];
}

/** `/gym edit` for a gym: the form that opened. */
async function editForm(made: Made, gym: string): Promise<Form> {
  const used = await made.use('edit', { gym });
  const form = used.showModal.mock.calls[0]?.[0] as Form | undefined;
  if (!form) throw new Error(`no form opened: ${JSON.stringify(used.reply.mock.calls)}`);
  return form;
}

const filled = (form: Form): Record<string, string> =>
  Object.fromEntries(
    form.components.map((row) => [
      row.components[0]?.custom_id ?? '',
      row.components[0]?.value ?? '',
    ]),
  );

const fieldsOf = (answer: ReturnType<typeof answerOf>): Record<string, string> =>
  gymViewOf(answer).facts;

describe('/gym edit', () => {
  it('opens a form at once, filled with the texts of the gym', async () => {
    const made = await gymCommandsWith();
    await made.admin.edit(
      1,
      { notice: 'Closed on Sundays', keywords: ['books', 'mural'] },
      MODERATOR,
    );
    const used = await made.use('edit', { gym: 'id:1' });
    expect(used.deferReply).not.toHaveBeenCalled();
    const form = used.showModal.mock.calls[0]?.[0] as Form;
    expect(form.title).toBe('Edit Pinewood Public Library');
    expect(form.custom_id).toMatch(/^gym:[0-9a-f]{16}:edit$/);
    expect(filled(form)).toEqual({
      name: 'Pinewood Public Library',
      nickname: 'The Stacks',
      description: 'Mural of readers beside the front doors',
      notice: 'Closed on Sundays',
      keywords: 'books, mural',
    });
    expect(form.components[0]?.components[0]?.required).toBe(true);
    expect(form.components[1]?.components[0]?.required).toBe(false);
  });

  it('writes only the fields that were changed, and shows the gym', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    made.gymStore.writes.length = 0;

    const submitted = await made.submit(
      form.custom_id,
      { ...filled(form), nickname: '', notice: 'Closed on Sundays', keywords: 'Books,  mural' },
      { modalFromCommand: true },
    );

    expect(made.gymStore.writes).toEqual([
      {
        what: 'update',
        id: 1,
        patch: { nickname: null, notice: 'Closed on Sundays', keywords: ['books', 'mural'] },
      },
    ]);
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const answer = answerOf(submitted);
    expect(said(answer)).toBe(
      'Changed the nickname, the notice and the keywords of **Pinewood Public Library** (#1).',
    );
    expect(gymViewOf(answer).title).toBe('Pinewood Public Library');
    expect(fieldsOf(answer)).toMatchObject({
      Notice: 'Closed on Sundays',
      Keywords: 'books, mural',
    });
    // Edits are not announced.
    await made.settle();
    expect(made.gateway.messagesIn(UPDATES_CHANNEL)).toEqual([]);
  });

  it('writes nothing for a form that came back as it was, and says so', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    made.gymStore.writes.length = 0;
    const submitted = await made.submit(form.custom_id, filled(form), { modalFromCommand: true });
    expect(said(answerOf(submitted))).toBe('Nothing was changed.');
    expect(answerOf(submitted).flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    expect(buttonsOf(answerOf(submitted))).toEqual([]);
    expect(made.gymStore.writes).toEqual([]);
  });

  it('does not undo what somebody else changed in another field meanwhile', async () => {
    const made = await gymCommandsWith();
    const mine = await editForm(made, 'id:1');
    const theirs = await editForm(made, 'id:1');
    await made.submit(theirs.custom_id, { ...filled(theirs), notice: 'Closed on Sundays' });
    await made.submit(mine.custom_id, { ...filled(mine), nickname: 'Reading Room' });
    expect(made.gymStore.row(1)).toMatchObject({
      nickname: 'Reading Room',
      notice: 'Closed on Sundays',
    });
  });

  it('shows a changed notice in the post of a raid at the gym', async () => {
    const made = await gymCommandsWith();
    const gym = made.directory.get(1);
    if (!gym) throw new Error('no gym');
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
    await made.settle();
    const form = await editForm(made, 'id:1');
    await made.submit(form.custom_id, { ...filled(form), notice: 'Closed on Sundays' });
    await made.settle();
    const post = made.gateway.posts.get(raid.party.forumPostId ?? '');
    expect(JSON.stringify(post?.message)).toContain('Closed on Sundays');
  });

  it('refuses texts that cannot be stored, keeps what was typed and opens the form again', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    made.gymStore.writes.length = 0;
    const typed = {
      ...filled(form),
      name: "'".repeat(50),
      description: 'A long paragraph\nthat nobody types twice gladly.',
    };
    const refused = await made.submit(form.custom_id, typed, { modalFromCommand: true });
    const refusal = answerOf(refused);
    expect(said(refusal)).toMatch(/^The name is too long as I store it, by 45 characters/);
    expect(said(refusal)).toContain('Nothing was saved. What you typed is kept:');
    // The first form came from the command: its refusal is a message of its own.
    expect(refused.reply).toHaveBeenCalledTimes(1);
    expect(refusal.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    expect(buttonsOf(refusal).map(([label]) => label)).toEqual(['Open the form again…', 'Cancel']);
    expect(made.gymStore.writes).toEqual([]);

    // The form again, with what was typed.
    const reopened = await made.press(buttonId(refusal, 'Open the form again…'));
    const again = reopened.showModal.mock.calls[0]?.[0] as Form;
    expect(again.custom_id).toBe(form.custom_id);
    expect(filled(again)).toEqual(typed);

    // Corrected: what is written is what differs from the gym as the first form showed it.
    const submitted = await made.submit(again.custom_id, { ...typed, name: 'Reading Room' });
    expect(made.gymStore.writes).toEqual([
      {
        what: 'update',
        id: 1,
        patch: {
          name: 'Reading Room',
          description: 'A long paragraph\nthat nobody types twice gladly.',
        },
      },
    ]);
    expect(said(answerOf(submitted))).toBe(
      'Changed the name and the description of **Reading Room** (The Stacks, #1).',
    );
    // Answered in the place of the refusal: its button does not stay under a finished edit.
    expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
    expect(submitted.reply).not.toHaveBeenCalled();
    expect(buttonsOf(answerOf(submitted)).map(([label]) => label)).toEqual(['Map']);
  });

  it('answers a second refusal, and "nothing changed", in the place of the first', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    const bad = { ...filled(form), name: "'".repeat(50) };
    const first = await made.submit(form.custom_id, bad, { modalFromCommand: true });
    expect(first.reply).toHaveBeenCalledTimes(1);
    // Sent again as it was, from the form the refusal opened.
    const second = await made.submit(form.custom_id, bad);
    expect(second.reply).not.toHaveBeenCalled();
    expect(said(sent(second.update))).toMatch(/^The name is too long as I store it/);
    expect(buttonsOf(sent(second.update)).map(([label]) => label)).toEqual([
      'Open the form again…',
      'Cancel',
    ]);
    // Put back to what it was: nothing to write, said where the refusal stood.
    const third = await made.submit(form.custom_id, filled(form));
    expect(said(sent(third.update))).toBe('Nothing was changed.');
    expect(buttonsOf(sent(third.update))).toEqual([]);
    expect(made.gymStore.row(1)?.name).toBe('Pinewood Public Library');
  });

  it('opens the form again with exactly what was typed, uncut', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    // Thirty-one keywords, written with spaces and capitals as a member types them, and a
    // notice that ends in an emoji right at the limit of its field.
    const keywords = Array.from({ length: 31 }, (_, n) => ` Key Word ${n} `).join(',');
    const notice = `${'n'.repeat(498)}\u{1f600}`;
    const typed = { ...filled(form), keywords, notice };
    const refused = await made.submit(form.custom_id, typed, { modalFromCommand: true });
    const reopened = await made.press(buttonId(answerOf(refused), 'Open the form again…'));
    const again = reopened.showModal.mock.calls[0]?.[0] as Form;
    expect(filled(again).keywords).toBe(keywords);
    expect(filled(again).notice).toBe(notice);
  });

  it('refuses a name of nothing, a keyword that is too long and too many keywords the same way', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    const blank = await made.submit(form.custom_id, { ...filled(form), name: '  ' });
    expect(said(answerOf(blank))).toMatch(/^A gym needs a name\.\n/);
    const keywords = Array.from({ length: 33 }, (_, n) => `k${n}`).join(',');
    const many = await made.submit(form.custom_id, { ...filled(form), keywords });
    expect(said(answerOf(many))).toMatch(/^That is 3 keywords too many: a gym may have 30\.\n/);
    expect(buttonsOf(answerOf(many)).map(([label]) => label)).toEqual([
      'Open the form again…',
      'Cancel',
    ]);
    expect(made.gymStore.row(1)?.keywords).toEqual([]);
  });

  it('leaves a text out of the form that is too long for it, keeps it, and says so', async () => {
    const made = await gymCommandsWith();
    const long = 'x'.repeat(600);
    await made.gymStore.update(1, { notice: long });
    await made.directory.refreshGym(1);

    const form = await editForm(made, 'id:1');
    expect(Object.keys(filled(form))).toEqual(['name', 'nickname', 'description', 'keywords']);
    expect(
      made.logged.some(
        (entry) => entry.msg === 'texts of a gym are too long for the form of /gym edit',
      ),
    ).toBe(true);

    const submitted = await made.submit(form.custom_id, { ...filled(form), nickname: 'Stacks' });
    expect(said(answerOf(submitted))).toBe(
      'Changed the nickname of **Pinewood Public Library** (Stacks, #1).\n' +
        'The notice of this gym is too long for this form and was left unchanged; whoever runs ' +
        'Pine has to shorten it.',
    );
    expect(made.gymStore.row(1)).toMatchObject({ nickname: 'Stacks', notice: long });
  });

  it('refuses a form whose request is gone, as after a restart, and one of somebody else', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    const other = await made.submit(form.custom_id, filled(form), { userId: '200000000000000007' });
    expect(said(answerOf(other))).toBe('That is somebody else’s question.');
    const member = await made.submit(form.custom_id, filled(form), {
      userId: MEMBER,
      roleNames: [],
    });
    expect(said(answerOf(member))).toBe('Only admins, moderators and bot developers can do that.');
    const unknown = await made.submit('gym:0000000000000000:edit', { name: 'X' });
    expect(answerOf(unknown)).toEqual({
      content: 'That has expired. Use the command again.',
      flags: MessageFlags.Ephemeral,
    });
    // Sent twice: the second finds nothing to answer.
    await made.submit(form.custom_id, { ...filled(form), nickname: 'Stacks' });
    const twice = await made.submit(form.custom_id, { ...filled(form), nickname: 'Other' });
    expect(said(answerOf(twice))).toBe('That has expired. Use the command again.');
    expect(made.gymStore.row(1)?.nickname).toBe('Stacks');
  });

  it('says so when the gym was deleted while the form was open', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:6');
    await made.admin.delete(6, { id: REPORTER }, STAFF_PLACE);
    // The form the command opened: there is no message of the bot above it.
    const submitted = await made.submit(
      form.custom_id,
      { ...filled(form), nickname: 'Leaf' },
      { modalFromCommand: true },
    );
    expect(said(sent(submitted.followUp))).toBe('That gym no longer exists.');
  });

  it('leaves no button behind when a form opened again is sent after the gym was deleted', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:6');
    const bad = { ...filled(form), name: "'".repeat(50) };
    await made.submit(form.custom_id, bad, { modalFromCommand: true });
    await made.admin.delete(6, { id: REPORTER }, STAFF_PLACE);
    // Sent from the form that "Open the form again" under the refusal opened.
    const submitted = await made.submit(form.custom_id, { ...filled(form), nickname: 'Leaf' });
    // In the place of the refusal, without its buttons: not a note beside dead buttons.
    expect(submitted.followUp).not.toHaveBeenCalled();
    expect(said(answerOf(submitted))).toBe('That gym no longer exists.');
    expect(buttonsOf(answerOf(submitted))).toEqual([]);
  });

  it('notes a new name that the search ignores, and not again with every later change', async () => {
    const made = await gymCommandsWith();
    const note = 'Its name consists only of words the search ignores';
    const form = await editForm(made, 'id:1');
    const renamed = await made.submit(form.custom_id, { ...filled(form), name: 'The Gym' });
    expect(said(answerOf(renamed))).toContain(note);
    // It has a nickname: members find it, and a change of its notice says nothing of its name.
    const second = await editForm(made, 'id:1');
    const noticed = await made.submit(second.custom_id, { ...filled(second), notice: 'Wet paint' });
    expect(said(answerOf(noticed))).not.toContain(note);
    // Without nickname and keywords nothing finds it: said with every change.
    const third = await editForm(made, 'id:1');
    const bare = await made.submit(third.custom_id, { ...filled(third), nickname: '' });
    expect(said(answerOf(bare))).toContain(note);
    const fourth = await editForm(made, 'id:1');
    const still = await made.submit(fourth.custom_id, { ...filled(fourth), notice: '' });
    expect(said(answerOf(still))).toContain(note);
  });

  it('says of several texts, and of the keywords, that they are too long for the form', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(1, {
      notice: 'x'.repeat(600),
      keywords: Array.from({ length: 40 }, (_, n) => `${'k'.repeat(48)}${n}`),
    });
    await made.directory.refreshGym(1);
    const form = await editForm(made, 'id:1');
    const both = await made.submit(form.custom_id, filled(form));
    expect(said(answerOf(both))).toBe(
      'Nothing was changed.\nThe notice and the keywords of this gym are too long for this form ' +
        'and were left unchanged; whoever runs Pine has to shorten them.',
    );
    await made.gymStore.update(1, { notice: null });
    await made.directory.refreshGym(1);
    const next = await editForm(made, 'id:1');
    const one = await made.submit(next.custom_id, filled(next));
    expect(said(answerOf(one))).toContain(
      'The keywords of this gym are too long for this form and were left unchanged; whoever ' +
        'runs Pine has to shorten them.',
    );
  });
});

describe('/gym move', () => {
  const link = (lat: number, lon: number): string =>
    `[${lat}, ${lon}](<https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}>)`;

  it('moves the gym at once for a correction of some metres, and says from where to where', async () => {
    const made = await gymCommandsWith();
    const moved = await made.use('move', { gym: 'id:6', location: '40.0302, -80.03' });
    expect(moved.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const answer = answerOf(moved);
    expect(said(answer)).toBe(
      `Moved **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)} (22 m).\n` +
        'Its address and the places around it are being fetched from Google; `/gym show` has ' +
        'them in a moment.',
    );
    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Map']);
    expect(gymOf(answer)).toBe('Gym #6 · 40.0302, -80.03');
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.0302, lon: -80.03 });
  });

  it('asks first when the new place is more than 500 metres away', async () => {
    const made = await gymCommandsWith();
    const asked = await made.use('move', { gym: 'id:6', location: '40.05, -79.95' });
    const question = answerOf(asked);
    expect(said(question).split('\n')).toEqual([
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05, -79.95)}?`,
      'That is 7.2 km from where it is now.',
    ]);
    expect(buttonsOf(question).map(([label]) => label)).toEqual(['Move anyway', 'Cancel']);
    expect(made.gymStore.row(6)?.lat).toBe(40.03);

    const pressed = await made.press(buttonId(question, 'Move anyway'));
    const answer = answerOf(pressed);
    expect(said(answer).split('\n')[0]).toBe(
      `Moved **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05, -79.95)} (7.2 km).`,
    );
    expect(gymViewOf(answer).lines.at(-1)).toBe(`It lies in <#${EAST_CHANNEL}>.`);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.05, lon: -79.95 });
    // 499 metres are a correction; the limit is 500.
    const near = await made.use('move', { gym: 'id:6', location: '40.0544, -79.95' });
    expect(said(answerOf(near))).toMatch(/^Moved /);
  });

  it('asks one question when the place is far away and beside another gym', async () => {
    const made = await gymCommandsWith();
    const asked = await made.use('move', { gym: 'id:6', location: '40.05005,-80.05' });
    const question = answerOf(asked);
    expect(said(question).split('\n')).toEqual([
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05005, -80.05)}?`,
      'That is 2.8 km from where it is now.',
      'Another gym lies within 10 m of that place:',
      '- **Pinewood Public Library** (The Stacks, #1), 6 m away',
    ]);
    expect(buttonsOf(question).map(([label]) => label)).toEqual(['Move anyway', 'Cancel']);
    expect(made.gymStore.row(6)?.lat).toBe(40.03);

    const pressed = await made.press(buttonId(question, 'Move anyway'));
    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    expect(said(answerOf(pressed))).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\* \(#6\) from /);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.05005, lon: -80.05 });
  });

  it('asks first when the place was only read from the middle of a map', async () => {
    const made = await gymCommandsWith();
    const asked = await made.use('move', {
      gym: 'id:6',
      location: 'https://www.google.com/maps/@40.0302,-80.03,17z',
    });
    const question = answerOf(asked);
    expect(said(question).split('\n')).toEqual([
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)}?`,
      'I read this from where the map was centered, not from a pin: check the link before you go on.',
    ]);
    expect(buttonsOf(question).map(([label]) => label)).toEqual(['Move', 'Cancel']);
    await made.press(buttonId(question, 'Move'));
    expect(made.gymStore.row(6)?.lat).toBe(40.0302);
  });

  it('asks again when a gym was put beside the new place since the question', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('move', { gym: 'id:6', location: '40.05, -79.95' }));
    await made.admin.add({ name: 'Newcomer', lat: 40.05002, lon: -79.95 }, STAFF_PLACE);

    const pressed = await made.press(buttonId(question, 'Move anyway'));

    const again = answerOf(pressed);
    expect(said(again).split('\n')).toEqual([
      'A gym was added at that place since I asked, so nothing was moved yet.',
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05, -79.95)}?`,
      'That is 7.2 km from where it is now.',
      'Another gym lies within 10 m of that place:',
      '- **Newcomer** (#13), 2 m away',
    ]);
    expect(made.gymStore.row(6)?.lat).toBe(40.03);
    await made.press(buttonId(again, 'Move anyway'));
    expect(made.gymStore.row(6)?.lat).toBe(40.05);
  });

  it('asks again, with all it said, when the gym itself was moved since the question', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(
      await made.use('move', {
        gym: 'id:6',
        location: 'https://www.google.com/maps/@40.05,-79.95,17z',
      }),
    );
    expect(said(question)).toContain('I read this from where the map was centered');
    // Somebody else corrects the gym meanwhile.
    await made.admin.move(6, { lat: 40.0301, lon: -80.03 }, STAFF_PLACE, {
      from: { lat: 40.03, lon: -80.03 },
      nearIds: [],
    });

    const pressed = await made.press(buttonId(question, 'Move anyway'));

    const again = answerOf(pressed);
    expect(said(again).split('\n')).toEqual([
      'The gym was moved since I asked, so nothing was moved yet.',
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.0301, -80.03)} to ${link(40.05, -79.95)}?`,
      'That is 7.2 km from where it is now.',
      'I read this from where the map was centered, not from a pin: check the link before you go on.',
    ]);
    expect(made.gymStore.row(6)?.lat).toBe(40.0301);
    await made.press(buttonId(again, 'Move anyway'));
    expect(made.gymStore.row(6)?.lat).toBe(40.05);
  });

  it('moves one gym when two staff press Move for one place in the same moment', async () => {
    const made = await gymCommandsWith();
    const other = { userId: '200000000000000007' };
    const first = answerOf(await made.use('move', { gym: 'id:6', location: '40.015, -80.015' }));
    const second = answerOf(
      await made.use('move', { gym: 'id:12', location: '40.015, -80.015' }, other),
    );

    const [moved, pressed] = await Promise.all([
      made.press(buttonId(first, 'Move anyway')),
      made.press(buttonId(second, 'Move anyway'), other),
    ]);

    expect(said(answerOf(moved))).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\* \(#6\)/);
    const again = answerOf(pressed);
    expect(said(again).split('\n')).toEqual([
      'A gym was added at that place since I asked, so nothing was moved yet.',
      `Move **Pinewood Post Office Gym** (#12) from ${link(40.04, -80.04)} to ${link(40.015, -80.015)}?`,
      'That is 3.5 km from where it is now.',
      'Another gym lies within 10 m of that place:',
      '- **Maple Leaf Mosaic** (#6), 0 m away',
    ]);
    expect(made.gymStore.row(12)).toMatchObject({ lat: 40.04, lon: -80.04 });
    await made.press(buttonId(again, 'Move anyway'), other);
    expect(made.gymStore.row(12)).toMatchObject({ lat: 40.015, lon: -80.015 });
  });

  it('asks instead of moving at once when a gym was put there in the same moment', async () => {
    const made = await gymCommandsWith();
    // A correction of some metres needs no question; an add at that very place is on its way.
    const [, moved] = await Promise.all([
      made.admin.add({ name: 'Newcomer', lat: 40.03021, lon: -80.03 }, STAFF_PLACE),
      made.use('move', { gym: 'id:6', location: '40.0302, -80.03' }),
    ]);
    expect(said(answerOf(moved)).split('\n')).toEqual([
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)}?`,
      'Another gym lies within 10 m of that place:',
      '- **Newcomer** (#13), 1 m away',
    ]);
    expect(made.gymStore.row(6)?.lat).toBe(40.03);
  });

  it('keeps the warning about the middle of a map when it asks again for a gym nearby', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(
      await made.use('move', {
        gym: 'id:6',
        location: 'https://www.google.com/maps/@40.0302,-80.03,17z',
      }),
    );
    await made.admin.add({ name: 'Newcomer', lat: 40.03021, lon: -80.03 }, STAFF_PLACE);
    const again = answerOf(await made.press(buttonId(question, 'Move')));
    expect(said(again).split('\n')).toEqual([
      'A gym was added at that place since I asked, so nothing was moved yet.',
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)}?`,
      'I read this from where the map was centered, not from a pin: check the link before you go on.',
      'Another gym lies within 10 m of that place:',
      '- **Newcomer** (#13), 1 m away',
    ]);
  });

  it('leaves the gym where it is on Cancel', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('move', { gym: 'id:6', location: '40.05005,-80.05' }));
    const pressed = await made.press(buttonId(question, 'Cancel'));
    expect(said(sent(pressed.update))).toBe('The gym stays where it is.');
    expect(made.gymStore.row(6)?.lat).toBe(40.03);
  });

  it('takes the question away when the gym was deleted before the answer', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('move', { gym: 'id:6', location: '40.05, -79.95' }));
    await made.admin.delete(6, { id: REPORTER }, STAFF_PLACE);
    const pressed = await made.press(buttonId(question, 'Move anyway'));
    // In the place of the question, without its buttons: not a note beside dead buttons.
    expect(pressed.followUp).not.toHaveBeenCalled();
    expect(said(answerOf(pressed))).toBe('That gym no longer exists.');
    expect(buttonsOf(answerOf(pressed))).toEqual([]);
  });

  it('does not take the gym itself for another gym near its new place', async () => {
    const made = await gymCommandsWith();
    // Five metres from where it is.
    const moved = await made.use('move', { gym: 'id:1', location: '40.05005,-80.05' });
    expect(said(answerOf(moved))).toMatch(/^Moved \*\*Pinewood Public Library\*\*/);
  });

  it('is never refused for a raid or a train, and says what stays when the regions change', async () => {
    const made = await gymCommandsWith();
    const gym = made.directory.get(6);
    if (!gym) throw new Error('no gym');
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
    for (const name of ['Saturday', 'Sunday']) {
      const train = await made.service.createTrain({
        name,
        creatorId: REPORTER,
        regionChannelId: WEST_CHANNEL,
      });
      if (train.kind !== 'created') throw new Error('no train');
      await made.trains.addStop(train.party.id, { id: REPORTER }, gymStop(6));
    }
    const lines = async (location: string): Promise<string[]> => {
      const used = await made.use('move', { gym: 'id:6', location });
      const first = answerOf(used);
      const answer = buttonsOf(first).some(([label]) => label === 'Move anyway')
        ? answerOf(await made.press(buttonId(first, 'Move anyway')))
        : first;
      return said(answer).split('\n').slice(2) ?? [];
    };

    // Within its region: nothing to say.
    expect(await lines('40.0302, -80.03')).toEqual([]);
    // Into another region of this server.
    expect(await lines('40.05, -79.95')).toEqual([
      `The raid at it stays in <#${raid.party.forumPostId ?? ''}>.`,
      'It stays a stop of 2 trains.',
    ]);
    expect(made.store.get(raid.party.id)).toMatchObject({ gymId: 6, regionId: 1 });
    // Out of every region.
    expect(await lines('41.0, -80')).toEqual([
      `The raid at it stays in <#${raid.party.forumPostId ?? ''}>.`,
      'It stays a stop of 2 trains.',
      'It now lies in no region of this server: raids cannot be reported there.',
    ]);
    // Further out, still in none: that is not news.
    expect(await lines('41.001, -80')).toEqual([]);
  });

  it('says nothing of regions for a gym nothing is at', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('move', { gym: 'id:6', location: '41.0, -80' }));
    const answer = answerOf(await made.press(buttonId(question, 'Move anyway')));
    expect(said(answer).split('\n').slice(2)).toEqual([
      'It now lies in no region of this server: raids cannot be reported there.',
    ]);
  });

  it('points to /location when it is used in the post of a raid', async () => {
    const made = await gymCommandsWith();
    const gym = made.directory.get(1);
    if (!gym) throw new Error('no gym');
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
    const inPost = { channelId: raid.party.forumPostId ?? '', thread: { parentId: WEST_FORUM } };
    const moved = await made.use('move', { gym: 'id:6', location: '40.0302, -80.03' }, inPost);
    expect(said(answerOf(moved)).split('\n').at(-1)).toBe(
      'To change this raid’s gym, use `/location`.',
    );
    const asked = await made.use('move', { gym: 'id:6', location: '40.05005,-80.05' }, inPost);
    expect(said(answerOf(asked)).split('\n').at(-1)).toBe(
      'To change this raid’s gym, use `/location`.',
    );
    // The raid is where it was.
    expect(made.store.get(raid.party.id)?.gymId).toBe(1);
  });

  it('says in its help how to get a location from the game', async () => {
    const { gym } = await import('./index.js');
    const details = gym.subcommands.get('move')?.help?.details;
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const text = (distanceUnits: 'imperial' | 'metric'): string =>
      typeof details === 'function'
        ? details(settings, { server: testServerValues({ distanceUnits }) })
        : '';
    // The far move in the settings' units (round 2).
    expect(text('metric')).toContain('than 500 m away or right beside another gym.');
    expect(text('imperial')).toContain('than 0.3 mi away or right beside another gym.');
    expect(text('metric')).toMatch(
      /^In Pokémon GO open the gym, choose View in map, share the link and paste it here\. Coordinates \(`40\.4406, -79\.9959`\) work too\. /,
    );
    const subcommands = (gym.data.toJSON().options ?? []) as {
      name: string;
      options?: { name: string; description: string }[];
    }[];
    expect(
      subcommands.find((sub) => sub.name === 'move')?.options?.find((o) => o.name === 'location')
        ?.description,
    ).toBe(
      'The link Pokémon GO shares (gym, View in map, share), or coordinates like 40.4406, -79.9959',
    );
  });

  it('refuses a location it cannot read', async () => {
    const made = await gymCommandsWith();
    const used = await made.use('move', { gym: 'id:6', location: 'next door' });
    expect(said(sent(used.followUp))).toMatch(/^I could not read a place from that\./);
    expect(made.gymStore.row(6)?.lat).toBe(40.03);
  });
});

describe('/gym elite', () => {
  it('marks a gym as an elite raid gym and takes the mark away', async () => {
    const made = await gymCommandsWith();
    const marked = await made.use('elite', { gym: 'id:1', eligible: true });
    expect(said(answerOf(marked))).toBe(
      '**Pinewood Public Library** (The Stacks, #1) is now marked as an elite raid gym.',
    );
    expect(fieldsOf(answerOf(marked))['Elite raid gym']).toBe('yes');
    expect(made.gymStore.row(1)).toMatchObject({ taggedEx: true, confirmedEx: false });
    const again = await made.use('elite', { gym: 'id:1', eligible: true });
    expect(said(answerOf(again))).toContain('was an elite raid gym already.');

    const cleared = await made.use('elite', { gym: 'id:1', eligible: false });
    expect(said(answerOf(cleared))).toContain('is no longer marked as an elite raid gym.');
    expect(fieldsOf(answerOf(cleared))['Elite raid gym']).toBe('no');
    const none = await made.use('elite', { gym: 'id:1', eligible: false });
    expect(said(answerOf(none))).toContain('was no elite raid gym.');
  });

  it('clears both stored flags of a gym the legacy bot marked', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(2, { confirmedEx: true });
    await made.directory.refreshGym(2);
    const cleared = await made.use('elite', { gym: 'id:2', eligible: false });
    expect(said(answerOf(cleared))).toContain('is no longer marked as an elite raid gym.');
    expect(made.gymStore.row(2)).toMatchObject({ taggedEx: false, confirmedEx: false });
  });

  it('names a gym whose legacy name shows as nothing, instead of an empty bold', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(3, { name: '\u202e\u200b\u0007', nickname: null });
    await made.directory.refreshGym(3);
    const elite = answerOf(await made.use('elite', { gym: '#3', eligible: true }));
    expect(said(elite)).toBe('**Gym** (#3) is now marked as an elite raid gym.');
    expect(gymViewOf(elite).title).toBe('Gym #3');
  });

  it('never says EX', async () => {
    const made = await gymCommandsWith();
    const answer = answerOf(await made.use('elite', { gym: 'id:1', eligible: true }));
    expect(JSON.stringify(answer)).not.toMatch(/\bEX\b/);
    const { gym } = await import('./index.js');
    expect(JSON.stringify(gym.data.toJSON())).not.toMatch(/\bex\b/i);
  });
});

describe('/gym: questions and refusals from before plan 8B-4', () => {
  const closed = {
    content: ANSWERED_BELOW,
    embeds: [],
    components: [],
    attachments: [],
  };

  it('answers Move on a plain-text question below it', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('move', { gym: 'id:6', location: '40.2, -80.03' }));
    const pressed = await made.press(buttonId(question, 'Move anyway'), { v2Message: false });
    expect(sent(pressed.editReply)).toEqual(closed);
    expect(said(sent(pressed.followUp))).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\*/);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.2 });
  });

  it('answers a form opened again from a plain-text refusal below that refusal', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    await made.submit(form.custom_id, { ...filled(form), name: '' }, { modalFromCommand: true });
    // The form opened again from a refusal that was plain text.
    const submitted = await made.submit(
      form.custom_id,
      { ...filled(form), notice: 'Wet paint' },
      { v2Message: false },
    );
    expect(sent(submitted.editReply)).toEqual(closed);
    expect(said(sent(submitted.followUp))).toBe(
      'Changed the notice of **Pinewood Public Library** (The Stacks, #1).',
    );
  });

  it('refuses /gym edit of a gym whose every text is too long for the form', async () => {
    const made = await gymCommandsWith();
    const long = 'x'.repeat(2_000);
    await made.gymStore.update(1, {
      name: 'n'.repeat(250),
      nickname: 'k'.repeat(250),
      description: long,
      notice: long,
      keywords: Array.from({ length: 40 }, (_, n) => `${'k'.repeat(48)}${n}`),
    });
    await made.directory.refreshGym(1);
    const used = await made.use('edit', { gym: 'id:1' });
    expect(used.showModal).not.toHaveBeenCalled();
    expect(said(sent(used.reply))).toMatch(/too long for this form and were left unchanged/);
  });
});
