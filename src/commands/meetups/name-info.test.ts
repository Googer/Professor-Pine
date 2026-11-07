import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, testRaid } from '../../../test/support/parties.js';
import { createdMeetup } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { components } from '../../components/index.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { attendeeOf } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { name } from '../parties/name.js';
import { info, INFO_INPUT, INFO_KIND, infoControls, infoForm, refusedWithText } from './info.js';
import { header, textDisplays, textOf } from '../../../test/support/messages.js';

const RAID_POST = '300000000000000055';
const NOT_A_MEETUP = 'This is the post of a raid: that only works in the post of a meetup.';
const NO_POST = 'Use this in the post of a meetup that is still active.';
/** `/name` is for every party that has a name: a train as well. */
const NOT_NAMED = 'This is the post of a raid: that only works in the post of a train or meetup.';
const NO_NAMED_POST = 'Use this in the post of a train or meetup that is still active.';

/** The inputs of the one row of a form. */
function inputsOf(form: ReturnType<typeof infoForm>) {
  const rows = form.components as unknown as {
    components: { custom_id: string; value?: string; placeholder?: string }[];
  }[];
  return rows[0]?.components ?? [];
}

/** A meetup with its post, and beside it a raid that has one too. */
async function setup() {
  const made = await createdMeetup({ creatorId: ALICE });
  const raid = { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: RAID_POST };
  await made.store.add(raid);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [name, info], [infoControls]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const where = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  const inRaid = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
  /** A command in the post of the meetup, by Alice unless `extra` says otherwise. */
  const run = (commandName: string, options: Record<string, string> = {}, extra: object = {}) =>
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
  const answer = async (commandName: string, options?: Record<string, string>, extra?: object) =>
    sent((await run(commandName, options, extra)).reply).content;
  /** The form of `/info`, sent from the post of the meetup by Alice with this text. */
  const submit = (text: string, extra: object = {}) =>
    handle(
      fakeModal({
        customId: infoForm(made.current()).custom_id,
        userId: ALICE,
        displayName: 'Alice',
        fields: { [INFO_INPUT]: text },
        ...where,
        ...extra,
      }),
    );
  /** Everything said in the post, line by line, once all of it has gone out. */
  const lines = async (): Promise<string[]> => {
    await made.timed.flush();
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  const post = () => made.gateway.posts.get(made.postId);
  return { ...made, raid, ctx, handle, run, answer, submit, lines, post, where, inRaid };
}

describe('/name', () => {
  it('renames the meetup: the post says who did it, and its title follows', async () => {
    const made = await setup();
    expect(await made.answer('name', { name: '  Raid hour   meet ' })).toBe(
      'This meetup is now called **Raid hour meet**.',
    );
    expect(made.current().timed.name).toBe('Raid hour meet');
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) renamed this meetup: **Raid hour meet**.`,
    ]);
    expect(made.post()).toMatchObject({ title: 'Meetup · Raid hour meet', renames: 1 });
    expect(header(made.post()?.message)[0]).toBe('### Meetup: Raid hour meet');
  });

  it('answers privately, and says nothing for the name the meetup has', async () => {
    const made = await setup();
    const used = await made.run('name', { name: 'Community Day picnic' });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'This meetup is called **Community Day picnic** already.',
      flags: MessageFlags.Ephemeral,
    });
    expect(await made.lines()).toEqual([]);
    expect(made.post()?.renames).toBe(0);
  });

  it('makes the name plain where it is said, and keeps it as typed in the title', async () => {
    const made = await setup();
    expect(await made.answer('name', { name: '**Bold** @everyone' })).toBe(
      'This meetup is now called **\\*\\*Bold\\*\\* @\u200beveryone**.',
    );
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) renamed this meetup: **\\*\\*Bold\\*\\* @\u200beveryone**.`,
    ]);
    expect(made.post()?.title).toBe('Meetup · **Bold** @everyone');
  });

  it('refuses a text that is no name', async () => {
    const made = await setup();
    expect(await made.answer('name', { name: '   ' })).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('name', { name: 'x'.repeat(81) })).toBe(
      'Give a name of 1 to 80 characters.',
    );
    expect(made.current().timed.name).toBe('Community Day picnic');
  });

  it('keeps to the two renames Discord allows a post: the newest name shows later', async () => {
    const made = await setup();
    for (const next of ['One', 'Two', 'Three']) {
      await made.run('name', { name: next });
      await made.service.flush();
    }
    expect(made.current().timed.name).toBe('Three');
    expect(made.post()).toMatchObject({ title: 'Meetup · Two', renames: 2 });
    expect(header(made.post()?.message)[0]).toBe('### Meetup: Three');
    // Ten minutes on, the title catches up.
    made.clock.now += 10 * 60_000 + 1;
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.post()).toMatchObject({ title: 'Meetup · Three', renames: 3 });
  });

  it('is for the post of a meetup: not for a raid, and not for any other place', async () => {
    const made = await setup();
    expect(await made.answer('name', { name: 'Picnic' }, made.inRaid)).toBe(NOT_NAMED);
    expect(await made.answer('name', { name: 'Picnic' }, { channelId: WEST_CHANNEL })).toBe(
      NO_NAMED_POST,
    );
    expect(made.store.get(made.raid.id)).toBe(made.raid);
    await made.service.end(made.party.id);
    expect(await made.answer('name', { name: 'Picnic' })).toBe(NO_NAMED_POST);
  });
});

describe('/info', () => {
  it('opens a form with one paragraph, empty for a meetup nobody wrote about', async () => {
    const made = await setup();
    const used = await made.run('info');
    expect(used.reply).not.toHaveBeenCalled();
    expect(used.showModal).toHaveBeenCalledWith(infoForm(made.current()));
    const form = infoForm(made.current());
    expect(decodeCustomId(form.custom_id)).toEqual({
      kind: INFO_KIND,
      id: made.party.id,
      action: 'set',
      args: [],
    });
    expect(form.title.length).toBeLessThanOrEqual(45);
    expect(form.components).toHaveLength(1);
    const [input] = inputsOf(form);
    expect(input).toMatchObject({
      custom_id: INFO_INPUT,
      style: 2,
      required: false,
      max_length: 1000,
    });
    expect(input && 'value' in input).toBe(false);
    expect((input?.placeholder ?? '').length).toBeLessThanOrEqual(100);
  });

  it('shows what was sent in the post, says who changed it, and answers privately', async () => {
    const made = await setup();
    const sentForm = await made.submit('  Bring snacks.\n\nWe meet at the **fountain**. ');
    expect(sentForm.reply).toHaveBeenCalledWith({
      content: 'The post of this meetup shows what you wrote, under "Meeting Information".',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.current().meetup.description).toBe('Bring snacks.\n\nWe meet at the **fountain**.');
    expect(await made.lines()).toEqual([`**Alice** (<@${ALICE}>) changed the information.`]);
    expect(textDisplays(made.post()?.message)[1]?.split('\n')).toEqual([
      '**Meeting Information**',
      'Bring snacks.',
      '',
      'We meet at the \\*\\*fountain\\*\\*.',
    ]);
  });

  it('opens the form with the text as it is, for the next staff member to correct', async () => {
    const made = await setup();
    await made.submit('Bring snacks.');
    const used = await made.run('info', {}, { userId: BOB, roleNames: ['Moderator'] });
    expect(used.showModal).toHaveBeenCalledExactlyOnceWith(infoForm(made.current()));
    expect(inputsOf(infoForm(made.current()))[0]).toMatchObject({ value: 'Bring snacks.' });
  });

  it('removes the text when the form comes back empty, and says nothing when nothing changed', async () => {
    const made = await setup();
    expect(sent((await made.submit('  ')).reply).content).toBe(
      'Nothing changed: that is what the post says already.',
    );
    await made.submit('Bring snacks.');
    expect(sent((await made.submit('Bring snacks.  ')).reply).content).toBe(
      'Nothing changed: that is what the post says already.',
    );
    expect(sent((await made.submit(' \n ')).reply).content).toBe(
      'The post of this meetup has no information any more.',
    );
    expect(made.current().meetup.description).toBeNull();
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) changed the information.`,
      `**Alice** (<@${ALICE}>) removed the information.`,
    ]);
    expect(textOf(made.post()?.message)).not.toContain('Information');
  });

  it('signs nobody up, staff or its maker', async () => {
    const made = await setup();
    await made.submit('Bring snacks.', { userId: BOB, roleNames: ['Moderator'] });
    expect(attendeeOf(made.current(), BOB)).toBeUndefined();
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming);
    await made.submit('Bring more snacks.');
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ name: 'Alice' });
  });

  it('refuses a text that is too long, should one come past the form, and gives it back', async () => {
    const made = await setup();
    const long = `${'x'.repeat(990)} and the end`;
    const refusal = sent((await made.submit(long)).reply).content ?? '';
    expect(refusal).toBe(
      `That is too long: keep it to 1000 characters.\nWhat you wrote:\n\`\`\`\n${long}\n\`\`\``,
    );
    expect(made.current().meetup.description).toBeNull();
  });

  it('never holds a form back for being one of many: the text would be lost', async () => {
    const made = await setup();
    // More than the command itself allows in a minute; each form was opened by a use of it.
    for (let n = 1; n <= 12; n++) {
      const used = await made.submit(`Bring ${n} snacks.`);
      expect(sent(used.reply).content).toBe(
        'The post of this meetup shows what you wrote, under "Meeting Information".',
      );
    }
    expect(made.current().meetup.description).toBe('Bring 12 snacks.');
  });

  it('gives the text back when something fails that nobody foresaw, and still reports it', async () => {
    const made = await setup();
    made.timed.setDescription = () => Promise.reject(new Error('the database is away'));
    const used = await made.submit('Bring snacks.');
    // The text first, in the one answer the form gets; the report of the failure follows it.
    expect(used.reply).toHaveBeenCalledExactlyOnceWith({
      content:
        'Something went wrong, and the post was not changed.\n' +
        'What you wrote:\n```\nBring snacks.\n```',
      flags: MessageFlags.Ephemeral,
    });
    expect(used.followUp).toHaveBeenCalledOnce();
    expect(sent(used.followUp).content).toMatch(
      /^Something went wrong\. Try again in a moment; if it happens again, tell staff the code `[0-9a-f]{6}`\.$/,
    );
    expect(made.current().meetup.description).toBeNull();
    // An empty form has nothing to give back: only the report.
    const empty = await made.submit('  ');
    expect(empty.followUp).not.toHaveBeenCalled();
    expect(sent(empty.reply).content).toMatch(/^Something went wrong\. Try again in a moment/);
  });

  it('keeps a refusal within one message, and a code block typed into it from ending the block', () => {
    const cut = refusedWithText('No.', 'y'.repeat(3000));
    expect(cut.length).toBeLessThanOrEqual(2000);
    expect(cut.endsWith('…\n```')).toBe(true);
    const fenced = refusedWithText('No.', 'a ```js\ncode``` b');
    expect(fenced.match(/```/g)).toHaveLength(2);
    expect(refusedWithText('No.', '  ')).toBe('No.');
  });

  it('takes the form only from the post of that meetup', async () => {
    const made = await setup();
    const elsewhere = await made.submit('Elsewhere', {
      channelId: WEST_CHANNEL,
      thread: undefined,
    });
    expect(sent(elsewhere.reply).content).toBe(STALE_COMPONENT);
    const inRaid = await made.submit('In the raid', made.inRaid);
    expect(sent(inRaid.reply).content).toBe(STALE_COMPONENT);
    const other = await made.handle(
      fakeModal({
        customId: `${INFO_KIND}:${made.party.id}:other`,
        fields: { [INFO_INPUT]: 'x' },
        ...made.where,
      }),
    );
    expect(sent(other.reply).content).toBe(STALE_COMPONENT);
    expect(made.current().meetup.description).toBeNull();
  });

  it('says that the meetup is over when it ended while the form was open, and gives the text back', async () => {
    const made = await setup();
    const custom = infoForm(made.current()).custom_id;
    await made.service.end(made.party.id);
    const late = await made.handle(
      fakeModal({ customId: custom, fields: { [INFO_INPUT]: 'Bring snacks.' }, ...made.where }),
    );
    expect(sent(late.reply).content).toBe(
      'This meetup is over.\nWhat you wrote:\n```\nBring snacks.\n```',
    );
    // The same when its post is no longer in the cache.
    const uncached = await made.handle(
      fakeModal({
        customId: custom,
        fields: { [INFO_INPUT]: 'Bring snacks.' },
        channelId: made.postId,
        uncachedChannel: true,
      }),
    );
    expect(sent(uncached.reply).content).toMatch(/^This meetup is over\./);
  });

  it('is for the post of a meetup: not for a raid, and not for any other place', async () => {
    const made = await setup();
    const inRaid = await made.run('info', {}, made.inRaid);
    expect(inRaid.showModal).not.toHaveBeenCalled();
    expect(sent(inRaid.reply).content).toBe(NOT_A_MEETUP);
    expect(await made.answer('info', {}, { channelId: WEST_CHANNEL })).toBe(NO_POST);
  });

  it('has its form among the controls the router knows', () => {
    expect(components.map((handler) => handler.kind)).toContain(INFO_KIND);
    expect(new Set(components.map((handler) => handler.kind)).size).toBe(components.length);
  });
});
