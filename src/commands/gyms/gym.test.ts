import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { sent } from '../../../test/support/fake-interactions.js';
import { UPDATES_CHANNEL } from '../../../test/support/gym-admin.js';
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
import { EAST_CHANNEL, TEST_GUILD_ROW, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { ANSWERED_BELOW } from '../../discord/late-reply.js';
import { PENDING_HOURS } from './shared.js';
import {
  changeServers,
  TestServers,
  testServerValues,
} from '../../../test/support/server-values.js';

const choices = (interaction: { respond: { mock: { calls: unknown[][] } } }) =>
  interaction.respond.mock.calls[0]?.[0] as { name: string; value: string }[];

/** A second moderator of the fakes' server. */
const OTHER_MODERATOR = '200000000000000007';

const FREE = '40.015, -80.015';
const FREE_LINK =
  '[40.015, -80.015](<https://www.google.com/maps/search/?api=1&query=40.015%2C-80.015>)';

describe('/gym: who may use it', () => {
  it('is shown to staff only and tied to no channel', async () => {
    const { ctx } = await gymCommandsWith();
    const { gym } = await import('./index.js');
    const json = gym.data.toJSON();
    expect(json.default_member_permissions).toBe('32');
    expect(gym.guards).toHaveLength(1);
    expect(ctx.config.settings.channels['bot-lab']).toBeDefined();
  });

  it('refuses a member who is not staff, whatever Discord let through', async () => {
    const made = await gymCommandsWith();
    const used = await made.use('show', { gym: 'id:1' }, { userId: MEMBER, roleNames: [] });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'Only admins, moderators and bot developers can do that.',
      flags: MessageFlags.Ephemeral,
    });
    expect(used.deferReply).not.toHaveBeenCalled();
  });

  it('answers a member who is not staff an empty list while they type', async () => {
    const made = await gymCommandsWith();
    const typed = await made.typing('show', 'library', { userId: MEMBER, roleNames: [] });
    expect(choices(typed)).toEqual([]);
    const staff = await made.typing('show', 'library');
    expect(choices(staff)).toEqual([
      { name: 'Pinewood Public Library · The Stacks · #1', value: 'id:1' },
    ]);
  });
});

describe('/gym: the gym option', () => {
  it('lists the gyms of the region by name while nothing is typed, and none elsewhere', async () => {
    const made = await gymCommandsWith();
    const here = choices(await made.typing('show', ''));
    expect(here.map((choice) => choice.name)).toEqual([
      'Maple Leaf Mosaic · #6',
      'Old Stone Fountain · #2',
      'Pinewood Post Office Gym · #12',
      'Pinewood Public Library · The Stacks · #1',
      'Riverside Park Gazebo · #11',
      "St. Mary's Church · #3",
      'Starbucks · #5',
      'Veterans Memorial Bridge · #4',
    ]);
    expect(choices(await made.typing('show', '  ', { channelId: '600000000000000009' }))).toEqual(
      [],
    );
  });

  it('finds every gym, the gyms of the region first', async () => {
    const made = await gymCommandsWith();
    // Two gyms of one name, told apart by their numbers: the one of this region first.
    expect(choices(await made.typing('show', 'starbucks'))).toEqual([
      { name: 'Starbucks · #5', value: 'id:5' },
      { name: 'Starbucks · #9', value: 'id:9' },
    ]);
    expect(
      choices(await made.typing('show', 'starbucks', { channelId: EAST_CHANNEL })).map(
        (choice) => choice.value,
      ),
    ).toEqual(['id:9', 'id:5']);
    // A gym of no region, and one far in another region, are found from here too.
    expect(choices(await made.typing('show', 'lakeview'))).toEqual([
      { name: 'Lakeview Trailhead · #10', value: 'id:10' },
    ]);
    expect(choices(await made.typing('show', 'fresco')).map((choice) => choice.value)).toEqual([
      'id:8',
    ]);
  });

  it('puts the gym with a typed number first', async () => {
    const made = await gymCommandsWith();
    expect(choices(await made.typing('show', '#9'))[0]).toEqual({
      name: 'Starbucks · #9',
      value: 'id:9',
    });
    expect(choices(await made.typing('show', '12'))[0]?.value).toBe('id:12');
    expect(choices(await made.typing('show', '#999'))).toEqual([]);
  });

  it('keeps the number of a gym with a long name in the choice', async () => {
    const made = await gymCommandsWith();
    await made.admin.edit(
      3,
      { name: 'Cathedral '.repeat(10).trim(), nickname: 'N'.repeat(100) },
      MODERATOR,
    );
    const [choice] = choices(await made.typing('show', 'cathedral'));
    expect(choice?.name).toHaveLength(100);
    expect(choice?.name.endsWith('… · #3')).toBe(true);
  });

  it.each([['id:1'], ['#1'], ['1'], ['pinewood public library'], ['Stacks']])(
    'takes %j for the Library',
    async (typed) => {
      const made = await gymCommandsWith();
      const shown = await made.use('show', { gym: typed });
      expect(gymOf(answerOf(shown))).toBe('Gym #1 · 40.05, -80.05');
    },
  );

  it('refuses text that does not name one gym for certain, with the gyms it might mean', async () => {
    const made = await gymCommandsWith();
    const used = await made.use('show', { gym: 'starbucks' });
    expect(sent(used.followUp)).toEqual({
      content:
        '"starbucks" does not name one gym for certain. Pick it from the list, or give its ' +
        'number:\n- **Starbucks** (#5)\n- **Starbucks** (#9)',
      flags: MessageFlags.Ephemeral,
    });
    // A misspelling is a guess, even of one gym.
    const guess = await made.use('show', { gym: 'libary' });
    expect(said(sent(guess.followUp))).toContain('- **Pinewood Public Library** (The Stacks, #1)');
  });

  it('takes digits for the number of a gym, unless another gym is called so', async () => {
    const made = await gymCommandsWith();
    // Gym 12 exists, and no gym has 12 in its name: the number.
    const twelve = await made.use('show', { gym: '12' });
    expect(gymOf(answerOf(twelve))).toMatch(/^Gym #12 /);
    // Not gym 120 or 121 either, which the search would find by the beginning of their number.
    await made.gymStore.create({ name: 'Liberty Bell', lat: 40.021, lon: -80.021 }, 1);
    await made.directory.refreshGym(13);
    const one = await made.use('show', { gym: '1' });
    expect(gymOf(answerOf(one))).toMatch(/^Gym #1 /);

    // A gym that is called "1776": its name is no longer hidden behind gym #12's number…
    await made.admin.edit(13, { name: '12' }, MODERATOR);
    const both = await made.use('show', { gym: '12' });
    expect(said(sent(both.followUp))).toBe(
      '"12" is the number of one gym and in the name of another. Pick the one you mean from ' +
        'the list, or write the number as `#12`:\n' +
        '- **Pinewood Post Office Gym** (#12)\n- **12** (#13)',
    );
    // …and the number with its sign is always the number.
    expect(gymOf(answerOf(await made.use('show', { gym: '#12' })))).toMatch(/^Gym #12 /);
    expect(gymOf(answerOf(await made.use('show', { gym: 'id:12' })))).toMatch(/^Gym #12 /);
    // Digits that are no gym's number are text like any other.
    await made.admin.edit(13, { name: 'Route 1776 Marker' }, MODERATOR);
    const named = await made.use('show', { gym: '1776' });
    expect(gymOf(answerOf(named))).toMatch(/^Gym #13 /);
    expect(said(sent((await made.use('show', { gym: '4242' })).followUp))).toMatch(
      /^I found no gym for "4242"\./,
    );
  });

  it('takes digits for the gym with that number when they are also a word of its own name', async () => {
    const made = await gymCommandsWith();
    await made.admin.edit(12, { name: 'Engine 12 Firehouse' }, MODERATOR);
    const shown = await made.use('show', { gym: '12' });
    expect(gymOf(answerOf(shown))).toMatch(/^Gym #12 /);
    // Another gym that is called so still makes it a question.
    await made.gymStore.create({ name: 'Pier 12', lat: 40.021, lon: -80.021 }, 1);
    await made.directory.refreshGym(13);
    expect(said(sent((await made.use('show', { gym: '12' })).followUp))).toBe(
      '"12" is the number of one gym and in the name of another. Pick the one you mean from ' +
        'the list, or write the number as `#12`:\n' +
        '- **Engine 12 Firehouse** (#12)\n- **Pier 12** (#13)',
    );
  });

  it('keeps a gym that is called by the digits, whatever its own number begins with', async () => {
    const made = await gymCommandsWith();
    // Gym 120 is called "12 Apostles", and no gym has the number 12.
    await made.gymStore.delete(12);
    await made.directory.refreshGym(12);
    for (let id = 13; id <= 120; id++) {
      await made.gymStore.create(
        {
          name: id === 120 ? '12 Apostles' : `Filler ${String.fromCharCode(97 + (id % 26))}`,
          lat: 41 + id / 1000,
          lon: -81,
        },
        1,
      );
    }
    await made.directory.load();
    const apostles = await made.use('show', { gym: '12' });
    expect(gymOf(answerOf(apostles))).toMatch(/^Gym #120 /);
  });

  it('does not act on a number that another gym with a longer number is called by', async () => {
    const made = await gymCommandsWith();
    // Gym 1 exists, and gym 13 is called "1 Main Street": `1` could mean either.
    await made.gymStore.create({ name: '1 Main Street', lat: 41, lon: -81 }, 1);
    await made.directory.refreshGym(13);
    const both = await made.use('show', { gym: '1' });
    expect(said(sent(both.followUp))).toBe(
      '"1" is the number of one gym and in the name of another. Pick the one you mean from ' +
        'the list, or write the number as `#1`:\n' +
        '- **Pinewood Public Library** (The Stacks, #1)\n- **1 Main Street** (#13)',
    );
  });

  it('names a gym whose legacy name shows as nothing by its number', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(3, { name: '\u202e\u200b\u0007', nickname: null });
    await made.directory.refreshGym(3);
    const shown = answerOf(await made.use('show', { gym: '#3' }));
    expect(gymViewOf(shown).title).toBe('Gym #3');
    const typed = await made.typing('show', '#3');
    expect(choices(typed)).toEqual([{ name: 'Gym · #3', value: 'id:3' }]);
    const refused = await made.use('show', { gym: 'starbucks' });
    expect(said(sent(refused.followUp))).not.toContain('****');
  });

  it('shows a legacy name without its control and direction characters, the number in its place', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(3, { name: 'Old\u202e Mill\u0007\u200f', nickname: '\u202eXY' });
    await made.directory.refreshGym(3);
    const [choice] = choices(await made.typing('show', 'mill'));
    expect(choice).toEqual({ name: 'Old Mill · XY · #3', value: 'id:3' });
    const refused = await made.use('show', { gym: 'old' });
    expect(said(sent(refused.followUp))).toContain('- **Old Mill** (XY, #3)');
  });

  it('refuses text that names no gym, and a number that no gym has', async () => {
    const made = await gymCommandsWith();
    expect(said(sent((await made.use('show', { gym: 'zzzz *qqqq*' })).followUp))).toBe(
      'I found no gym for "zzzz \\*qqqq\\*". Type part of its name and pick it from the list, ' +
        'or give its number (`#123`).',
    );
    expect(said(sent((await made.use('show', { gym: '#999' })).followUp))).toBe(
      'There is no gym #999.',
    );
    expect(said(sent((await made.use('show', { gym: 'id:999' })).followUp))).toBe(
      'There is no gym #999.',
    );
  });
});

describe('/gym show', () => {
  it('shows the gym for the staff member alone, with how many members target it', async () => {
    const made = await gymCommandsWith();
    await made.gymTargets.add(MEMBER, made.gateway.guildId, 1);
    const shown = await made.use('show', { gym: 'id:1' });
    expect(shown.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const answer = answerOf(shown);
    expect(answer).toMatchObject({ flags: MessageFlags.IsComponentsV2 });
    expect(answer.files).toBeUndefined();
    const view = gymViewOf(answer);
    expect(view.title).toBe('Pinewood Public Library (The Stacks)');
    expect(view.lines.at(-1)).toBe(`It lies in <#${WEST_CHANNEL}>.`);
    expect(view.facts).toMatchObject({ 'Elite raid gym': 'no', 'Gym targets': '1 member' });
    expect(view.facts['Nearest gym']).toMatch(/^\*\*.+\*\* \(#\d+\), \d+(\.\d)? k?m away$/);
  });

  it('attaches the map picture when there is one', async () => {
    const made = await gymCommandsWith();
    Object.assign(made.ctx, {
      maps: { enabled: true, gym: () => Promise.resolve('var/images/gyms/1-abc.png') },
    });
    const answer = answerOf(await made.use('show', { gym: 'id:1' }));
    expect(answer.files).toEqual(['var/images/gyms/1-abc.png']);
    expect(gymViewOf(answer).pictures).toEqual(['attachment://1-abc.png']);
  });

  it('shows the gym also when its map or its targets cannot be had', async () => {
    const made = await gymCommandsWith();
    Object.assign(made.ctx, {
      maps: { enabled: true, gym: () => Promise.reject(new Error('disk full')) },
    });
    made.gymTargets.failing = new Error('database is down');
    const answer = answerOf(await made.use('show', { gym: 'id:1' }));
    expect(gymViewOf(answer).facts['Gym targets']).toBe('unknown');
    expect(answer.files).toBeUndefined();
    expect(gymViewOf(answer).pictures).toEqual([]);
  });
});

describe('/gym add', () => {
  it('asks with what it understood and stores nothing before the answer', async () => {
    const made = await gymCommandsWith();
    const asked = await made.use('add', { location: FREE, name: '  Clock   Tower ' });
    expect(asked.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const question = answerOf(asked);
    expect(said(question)).toBe(
      `Add **Clock Tower** at ${FREE_LINK}?\nIt would lie in <#${WEST_CHANNEL}>.`,
    );
    expect(buttonsOf(question).map(([label]) => label)).toEqual([
      'Add',
      'Add with details…',
      'Cancel',
    ]);
    expect(made.gymStore.writes).toEqual([]);
  });

  it('adds the gym on Add, shows it and tells the channel for bot updates', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));

    const pressed = await made.press(buttonId(question, 'Add'));

    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    const answer = answerOf(pressed);
    expect(said(answer)).toBe(
      'Added **Clock Tower** (#13).\nIts address and the places around it are being fetched ' +
        'from Google; `/gym show` has them in a moment.',
    );
    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Map']);
    expect(gymViewOf(answer)).toMatchObject({
      title: 'Clock Tower',
      smallPrint: 'Gym #13 · 40.015, -80.015',
    });
    expect(made.gymStore.row(13)).toMatchObject({ name: 'Clock Tower', lat: 40.015, lon: -80.015 });
    expect(made.directory.of(TEST_GUILD_ROW).search(WEST_CHANNEL, 'clock tower')[0]?.gym.id).toBe(
      13,
    );
    await made.settle();
    expect(made.gateway.messagesIn(UPDATES_CHANNEL)).toHaveLength(1);
    expect(made.directory.stored(13)?.places).toBe('Corner Bakery Maple Dental');
    // Answered once: a second press (a double click) is only acknowledged, and writes nothing
    // over the answer of the first.
    const again = await made.press(buttonId(question, 'Add'));
    expect(again.deferUpdate).toHaveBeenCalledTimes(1);
    expect(again.update).not.toHaveBeenCalled();
    expect(again.editReply).not.toHaveBeenCalled();
    expect(again.reply).not.toHaveBeenCalled();
    expect(made.gymStore.row(14)).toBeUndefined();
  });

  it('says that a question has expired when it is older than anything it remembers', async () => {
    const made = await gymCommandsWith();
    const pressed = await made.press('gym:00000000000000aa:add');
    expect(said(sent(pressed.update))).toBe('That has expired. Use the command again.');
    expect(buttonsOf(sent(pressed.update))).toEqual([]);
  });

  it('shows the added gym with its map in place of the question, its file carried', async () => {
    const made = await gymCommandsWith();
    Object.assign(made.ctx, {
      maps: { enabled: true, gym: () => Promise.resolve('var/images/gyms/13-abc.png') },
    });
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const pressed = await made.press(buttonId(question, 'Add'));
    const answer = answerOf(pressed);
    expect(gymViewOf(answer).pictures).toEqual(['attachment://13-abc.png']);
    expect(answer.files).toEqual(['var/images/gyms/13-abc.png']);
    expect(answer.attachments).toEqual([]);
    // The fake holds the message to the file it names: the question it replaces had none.
    expect((await pressed.fetchReply()).attachments).toEqual(['var/images/gyms/13-abc.png']);
  });

  it('asks and answers in components-v2 messages, the buttons in the container', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    expect(question.flags).toBe(MessageFlags.IsComponentsV2);
    expect(buttonsOf(question).map(([label]) => label)).toEqual([
      'Add',
      'Add with details…',
      'Cancel',
    ]);
    const cancelled = await made.press(buttonId(question, 'Cancel'));
    expect(sent(cancelled.update).flags).toBe(MessageFlags.IsComponentsV2);
  });

  it('answers a press on a plain-text question from before the plan below it', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const pressed = await made.press(buttonId(question, 'Add'), { v2Message: false });
    // The old question is closed with a line, plain: it does not become a v2 message in place.
    expect(sent(pressed.editReply)).toEqual({
      content: ANSWERED_BELOW,
      embeds: [],
      components: [],
      attachments: [],
    });
    const below = sent(pressed.followUp);
    expect(below.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    expect(said(below)).toMatch(/^Added \*\*Clock Tower\*\* \(#13\)\./);
    expect(made.gymStore.row(13)).toBeDefined();
    // An expired or cancelled one is told so in plain text.
    const expired = await made.press('gym:00000000000000ab:add', { v2Message: false });
    expect(sent(expired.update)).toEqual({
      content: 'That has expired. Use the command again.',
      embeds: [],
      components: [],
      attachments: [],
    });
  });

  it('keeps a question for hours: a form may be open for long', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const made = await gymCommandsWith();
      const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
      vi.setSystemTime(Date.now() + PENDING_HOURS * 3_600_000 - 60_000);
      const opened = await made.press(buttonId(question, 'Add with details…'));
      expect(opened.showModal).toHaveBeenCalledTimes(1);
      await made.submit(buttonId(question, 'Add with details…').replace(/details$/, 'form'), {
        nickname: 'Big Ben',
      });
      expect(made.gymStore.row(13)?.nickname).toBe('Big Ben');

      const late = answerOf(await made.use('add', { location: '40.02, -80.02', name: 'Late' }));
      vi.setSystemTime(Date.now() + PENDING_HOURS * 3_600_000);
      const pressed = await made.press(buttonId(late, 'Add'));
      expect(said(sent(pressed.update))).toBe('That has expired. Use the command again.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says so when the place was only read from the middle of a map', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(
      await made.use('add', {
        location: 'https://www.google.com/maps/@40.015,-80.015,17z',
        name: 'Clock Tower',
      }),
    );
    expect(said(question).split('\n')).toEqual([
      `Add **Clock Tower** at ${FREE_LINK}?`,
      'I read this from where the map was centered, not from a pin: check the link before you go on.',
      `It would lie in <#${WEST_CHANNEL}>.`,
    ]);
  });

  it('names a gym within ten metres and offers to add anyway', async () => {
    const made = await gymCommandsWith();
    // 5.6 metres north of the Library.
    const question = answerOf(
      await made.use('add', { location: '40.05005,-80.05', name: 'Library Annex' }),
    );
    expect(said(question).split('\n').slice(2)).toEqual([
      'Another gym lies within 10 m of that place:',
      '- **Pinewood Public Library** (The Stacks, #1), 6 m away',
    ]);
    expect(buttonsOf(question).map(([label]) => label)).toEqual([
      'Add anyway',
      'Add with details…',
      'Cancel',
    ]);
    await made.press(buttonId(question, 'Add anyway'));
    expect(made.gymStore.row(13)?.name).toBe('Library Annex');
  });

  it('names the gym nearby in the settings’ units, feet where they are imperial (round 2)', async () => {
    const made = await gymCommandsWith();
    // The server's units (plan 19A-1).
    changeServers(made.ctx, { distanceUnits: 'imperial' });
    const question = answerOf(
      await made.use('add', { location: '40.05005,-80.05', name: 'Library Annex' }),
    );
    expect(said(question).split('\n').slice(2)).toEqual([
      'Another gym lies within 33 ft of that place:',
      '- **Pinewood Public Library** (The Stacks, #1), 18 ft away',
    ]);
  });

  it('asks again when a gym was put at that place since the question', async () => {
    const made = await gymCommandsWith();
    const first = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const second = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    await made.press(buttonId(first, 'Add'));

    const pressed = await made.press(buttonId(second, 'Add'));

    const again = answerOf(pressed);
    expect(said(again).split('\n')).toEqual([
      'A gym was added at that place since I asked, so nothing was added yet.',
      `Add **Clock Tower** at ${FREE_LINK}?`,
      `It would lie in <#${WEST_CHANNEL}>.`,
      'Another gym lies within 10 m of that place:',
      '- **Clock Tower** (#13), 0 m away',
    ]);
    expect(made.gymStore.row(14)).toBeUndefined();
    await made.press(buttonId(again, 'Add anyway'));
    expect(made.gymStore.row(14)?.name).toBe('Clock Tower');
  });

  it('adds one gym when two staff press Add for one place in the same moment', async () => {
    const made = await gymCommandsWith();
    const other = { userId: OTHER_MODERATOR };
    const first = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const second = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }, other));

    const [added, pressed] = await Promise.all([
      made.press(buttonId(first, 'Add')),
      made.press(buttonId(second, 'Add'), other),
    ]);

    expect(said(answerOf(added))).toMatch(/^Added \*\*Clock Tower\*\* \(#13\)\./);
    const again = answerOf(pressed);
    expect(said(again).split('\n')).toEqual([
      'A gym was added at that place since I asked, so nothing was added yet.',
      `Add **Clock Tower** at ${FREE_LINK}?`,
      `It would lie in <#${WEST_CHANNEL}>.`,
      'Another gym lies within 10 m of that place:',
      '- **Clock Tower** (#13), 0 m away',
    ]);
    expect(made.gymStore.row(14)).toBeUndefined();
    await made.press(buttonId(again, 'Add anyway'), other);
    expect(made.gymStore.row(14)?.name).toBe('Clock Tower');
  });

  it('adds nothing on Cancel', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const pressed = await made.press(buttonId(question, 'Cancel'));
    expect(said(sent(pressed.update))).toBe('Nothing was added.');
    expect(buttonsOf(sent(pressed.update))).toEqual([]);
    expect(made.gymStore.writes).toEqual([]);
  });

  it('opens a form for the details and adds the gym with what was sent', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const opened = await made.press(buttonId(question, 'Add with details…'));
    const form = opened.showModal.mock.calls[0]?.[0] as {
      custom_id: string;
      title: string;
      components: { components: { custom_id: string; max_length: number; value?: string }[] }[];
    };
    expect(form.title).toBe('Add Clock Tower');
    expect(
      form.components.map((row) => [row.components[0]?.custom_id, row.components[0]?.max_length]),
    ).toEqual([
      ['nickname', 100],
      ['description', 1_000],
      ['notice', 500],
      ['keywords', 1_560],
    ]);

    const submitted = await made.submit(form.custom_id, {
      nickname: ' Big Ben ',
      description: 'Four faces.\n\n\n\nChimes on the hour.',
      notice: '',
      keywords: 'Clock, tower , CLOCK',
    });

    expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
    expect(said(answerOf(submitted))).toContain('Added **Clock Tower** (Big Ben, #13).');
    expect(made.gymStore.row(13)).toMatchObject({
      name: 'Clock Tower',
      nickname: 'Big Ben',
      description: 'Four faces.\n\nChimes on the hour.',
      notice: null,
      keywords: ['clock', 'tower'],
    });
    // The question was answered by the form: its Add button adds no second gym.
    await made.press(buttonId(question, 'Add'));
    expect(made.gymStore.row(14)).toBeUndefined();
  });

  it('refuses a form whose texts cannot be stored, keeps what was typed and opens it again', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const formId = buttonId(question, 'Add with details…').replace(/details$/, 'form');
    const typed = {
      nickname: "'".repeat(60),
      description: 'Four faces.\nChimes on the hour.',
      notice: '',
      keywords: `clock, ${'k'.repeat(52)}`,
    };
    const refused = await made.submit(formId, typed);
    // The form was opened from the question: the refusal takes its place, so that no button
    // of the question stays that would add the gym without the details.
    expect(refused.reply).not.toHaveBeenCalled();
    const refusal = sent(refused.update);
    expect(said(refusal)).toBe(
      'The nickname is too long as I store it, by 105 characters: apostrophes, accents and ' +
        'letters of other alphabets take several characters each. Shorten it.\n' +
        'The keyword "kkkkkkkkkkkkkkkkkkkkkkkkkkkkk…" is 2 characters too long: a keyword may have 50.\n' +
        'Nothing was saved. What you typed is kept:',
    );
    expect(buttonsOf(refusal).map(([label]) => label)).toEqual(['Open the form again…', 'Cancel']);
    expect(made.gymStore.writes).toEqual([]);

    // The form opens with what was typed, the paragraph included.
    const reopened = await made.press(buttonId(refusal, 'Open the form again…'));
    const form = reopened.showModal.mock.calls[0]?.[0] as {
      custom_id: string;
      components: { components: { custom_id: string; value?: string }[] }[];
    };
    expect(form.custom_id).toBe(formId);
    expect(
      Object.fromEntries(
        form.components.map((row) => [row.components[0]?.custom_id, row.components[0]?.value]),
      ),
    ).toEqual({
      nickname: "'".repeat(60),
      description: 'Four faces.\nChimes on the hour.',
      notice: undefined,
      keywords: `clock, ${'k'.repeat(52)}`,
    });
    // Corrected and sent again, it adds the gym.
    await made.submit(form.custom_id, { ...typed, nickname: 'Big Ben', keywords: 'clock' });
    expect(made.gymStore.row(13)).toMatchObject({
      name: 'Clock Tower',
      nickname: 'Big Ben',
      description: 'Four faces.\nChimes on the hour.',
      keywords: ['clock'],
    });
  });

  it('adds nothing when a refused form is given up', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    await made.press(buttonId(question, 'Add with details…'));
    const formId = buttonId(question, 'Add with details…').replace(/details$/, 'form');
    const refused = await made.submit(formId, { keywords: 'k'.repeat(52) });
    const cancelled = await made.press(buttonId(sent(refused.update), 'Cancel'));
    expect(said(sent(cancelled.update))).toBe('Nothing was added.');
    expect(made.gymStore.writes).toEqual([]);
  });

  it('keeps the details when the question has to be asked anew', async () => {
    const made = await gymCommandsWith();
    const first = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const second = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    await made.press(buttonId(first, 'Add'));
    // The details are sent for the second question, at whose place a gym now stands.
    const typed = {
      nickname: 'Big Ben',
      description: 'Four faces.',
      notice: '',
      keywords: 'Clock',
    };
    const submitted = await made.submit(
      buttonId(second, 'Add with details…').replace(/details$/, 'form'),
      typed,
    );
    const again = answerOf(submitted);
    expect(said(again)).toContain('A gym was added at that place since I asked');
    expect(made.gymStore.row(14)).toBeUndefined();

    // "Add with details…" of the new question opens with them.
    const opened = await made.press(buttonId(again, 'Add with details…'));
    const form = opened.showModal.mock.calls[0]?.[0] as {
      custom_id: string;
      components: { components: { custom_id: string; value?: string }[] }[];
    };
    expect(
      Object.fromEntries(
        form.components.map((row) => [row.components[0]?.custom_id, row.components[0]?.value]),
      ),
    ).toEqual({
      nickname: 'Big Ben',
      description: 'Four faces.',
      notice: undefined,
      keywords: 'Clock',
    });
    await made.submit(form.custom_id, typed);
    expect(made.gymStore.row(14)).toMatchObject({ nickname: 'Big Ben', keywords: ['clock'] });
  });

  it('lets nobody else answer the question, and nobody who is not staff', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const other = await made.press(buttonId(question, 'Add'), { userId: '200000000000000007' });
    expect(said(sent(other.reply))).toBe('That is somebody else’s question.');
    const member = await made.press(buttonId(question, 'Add'), { userId: MEMBER, roleNames: [] });
    expect(said(sent(member.reply))).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    const form = await made.press(buttonId(question, 'Add with details…'), {
      userId: '200000000000000007',
    });
    expect(form.showModal).not.toHaveBeenCalled();
    expect(made.gymStore.writes).toEqual([]);
    // It is still the staff member's to answer.
    await made.press(buttonId(question, 'Add'));
    expect(made.gymStore.row(13)).toBeDefined();
  });

  it('follows a short link, and says so when it leads nowhere', async () => {
    const made = await gymCommandsWith();
    made.geo.links.set(
      'https://maps.app.goo.gl/AbC123',
      'https://www.google.com/maps/place/X/@40.5,-79.9,17z/data=!3d40.015!4d-80.015',
    );
    const question = answerOf(
      await made.use('add', { location: 'https://maps.app.goo.gl/AbC123', name: 'Clock Tower' }),
    );
    expect(said(question)).toContain(FREE_LINK);
    const lost = await made.use('add', { location: 'https://maps.app.goo.gl/Nope', name: 'X' });
    expect(said(sent(lost.followUp))).toBe(
      'I could not follow that link. Paste the coordinates instead.',
    );
    // What many links of the app lead to: a place by its name, without coordinates.
    made.geo.links.set(
      'https://maps.app.goo.gl/Named',
      'https://www.google.com/maps/place/Big+Fountain/data=!4m2!3m1!1s0x8834f1:0x1',
    );
    const named = await made.use('add', { location: 'https://maps.app.goo.gl/Named', name: 'X' });
    expect(said(sent(named.followUp))).toBe(
      'That link does not say where the place is. Open it, long-press the pin, and paste the ' +
        'coordinates Google shows.',
    );
  });

  it('says in its help how to get a location from the game', async () => {
    const { gym } = await import('./index.js');
    const add = gym.subcommands.get('add');
    expect(typeof add?.help?.details === 'string' && add.help.details).toMatch(
      /^In Pokémon GO open the gym, choose View in map, share the link and paste it here\. Coordinates \(`40\.4406, -79\.9959`\) work too\./,
    );
    const subcommands = (gym.data.toJSON().options ?? []) as {
      name: string;
      options?: { name: string; description: string }[];
    }[];
    const option = subcommands
      .find((sub) => sub.name === 'add')
      ?.options?.find((one) => one.name === 'location');
    expect(option?.description).toBe(
      'The link Pokémon GO shares (gym, View in map, share), or coordinates like 40.4406, -79.9959',
    );
    expect(option?.description.length).toBeLessThanOrEqual(100);
  });

  it('adds a gym from the link that "View in map" of Pokémon GO shares', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(
      await made.use('add', {
        location: 'https://maps.google.com/?q=40.015,-80.015&entry=gps&g_ep=CAESBzI1&shorturl=1',
        name: 'Clock Tower',
      }),
    );
    // The place itself: no warning about the middle of a map.
    expect(said(question)).toBe(
      `Add **Clock Tower** at ${FREE_LINK}?\nIt would lie in <#${WEST_CHANNEL}>.`,
    );
  });

  it('refuses a location it cannot read with what it reads, and a name of nothing', async () => {
    const made = await gymCommandsWith();
    const unreadable = await made.use('add', { location: 'by the lake', name: 'Clock Tower' });
    expect(said(sent(unreadable.followUp))).toBe(
      'I could not read a place from that. Give the coordinates as `40.4406, -79.9959`, or ' +
        'paste a link to the place from Google Maps (also the short link its app shares), ' +
        'Apple Maps or the Ingress intel map.',
    );
    const nowhere = await made.use('add', { location: '95.5, 10', name: 'Clock Tower' });
    expect(said(sent(nowhere.followUp))).toMatch(/^Those numbers are no place: a latitude/);
    const nameless = await made.use('add', { location: FREE, name: ' \n ' });
    expect(said(sent(nameless.followUp))).toBe('A gym needs a name.');
    const wide = await made.use('add', { location: FREE, name: "'".repeat(50) });
    expect(said(sent(wide.followUp))).toMatch(
      /^The name is too long as I store it, by 45 characters/,
    );
    expect(made.pending()).toBeGreaterThanOrEqual(0);
    expect(made.gymStore.writes).toEqual([]);
  });

  it('says of a place outside every region that it lies in none, and adds the gym all the same', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: '41.0, -80', name: 'Far Away' }));
    expect(said(question)).toContain('It would lie in no region of this server.');
    const answer = answerOf(await made.press(buttonId(question, 'Add')));
    expect(gymViewOf(answer).lines.at(-1)).toBe('It lies in no region of this server.');
  });

  it('notes a name by the words this server’s search ignores (plan 19B-2)', async () => {
    // This server's search ignores "lodge", not "gym".
    const made = await gymCommandsWith([], {
      servers: new TestServers(testServerValues({ blacklistWords: ['lodge'] })),
    });
    made.geo.enabled = false;
    const searched = answerOf(
      await made.press(
        buttonId(answerOf(await made.use('add', { location: FREE, name: 'The Gym' })), 'Add'),
      ),
    );
    expect(said(searched)).not.toContain('words the search ignores');
    const ignored = answerOf(
      await made.press(
        buttonId(
          answerOf(await made.use('add', { location: '40.031, -80.031', name: 'The Lodge' })),
          'Add',
        ),
      ),
    );
    expect(said(ignored)).toContain('Its name consists only of words the search ignores');
  });

  it('notes a name the search ignores, and that nothing is fetched without a key', async () => {
    const made = await gymCommandsWith();
    made.geo.enabled = false;
    const question = answerOf(await made.use('add', { location: FREE, name: 'The Gym' }));
    const answer = answerOf(await made.press(buttonId(question, 'Add')));
    expect(said(answer).split('\n')).toEqual([
      'Added **The Gym** (#13).',
      'No Google API key is configured, so it has no address and no nearby places.',
      'Its name consists only of words the search ignores, so members will not find it by ' +
        'name: only by its number (#13), or by a nickname or keywords you give it.',
    ]);
  });
});
