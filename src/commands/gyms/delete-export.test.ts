import { gymStop } from '../../domain/party/stops.js';
import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { dialogChoices, dialogText, shownDialog } from '../../../test/support/dialogs.js';
import type { RecordingDms } from '../../../test/support/dms.js';
import { FAKE_GUILD_ID, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { textDisplays } from '../../../test/support/messages.js';
import { STAFF_PLACE, UPDATES_CHANNEL } from '../../../test/support/gym-admin.js';
import {
  answerOf,
  buttonsOf,
  gymCommandsWith,
  gymViewOf,
  MEMBER,
  MODERATOR,
  OTHER_SERVER,
  said,
} from '../../../test/support/gym-commands.js';
import { TEST_GUILD_ROW, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { ALICE, asTrain, BOB, REPORTER, inGyms, stops } from '../../../test/support/parties.js';
import { googleMonth } from '../../domain/geo/google-line.js';
import { PartyStatus } from '../../domain/party/status.js';
import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
import { LIMITS } from '../../render/text.js';
import { EXPIRED } from './shared.js';

type Made = Awaited<ReturnType<typeof gymCommandsWith>>;

async function raidAt(made: Made, gymId: number) {
  const gym = made.directory.stored(gymId);
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
  return raid.party;
}

async function trainOn(made: Made, route: readonly number[]) {
  const created = await made.service.createTrain({
    name: 'Saturday legendaries',
    creatorId: REPORTER,
    regionChannelId: WEST_CHANNEL,
  });
  if (created.kind !== 'created') throw new Error('no train');
  for (const gymId of route) {
    await made.trains.addStop(created.party.id, { id: REPORTER, name: 'Rae' }, gymStop(gymId));
  }
  await made.settle();
  return created.party;
}

describe('/gym delete', () => {
  /** `/gym delete` of gym 6, and the dialog it opened. */
  async function asked(made: Made, gym = 'id:6') {
    const used = await made.use('delete', { gym });
    return { used, dialog: shownDialog(used) };
  }

  it('asks first in a dialog, with what goes with the gym', async () => {
    const made = await gymCommandsWith();
    await trainOn(made, [1, 6]);
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    made.routes.add(BOB, 1, 'Only', [6]);
    await made.gymTargets.add(ALICE, made.gateway.guildId, 6);

    const { used, dialog } = await asked(made);

    expect(used.deferReply).not.toHaveBeenCalled();
    expect(used.reply).not.toHaveBeenCalled();
    expect(dialog.custom_id).toBe('gymview:6:delete');
    expect(dialog.title).toBe('Delete a gym');
    expect(dialogText(dialog).split('\n')).toEqual([
      'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.',
      'With it go:',
      '- its stop on the route of 1 active train',
      '- its stop on 2 saved routes',
      '- the gym target of 1 member',
      '',
      'Submit deletes it.',
    ]);
    expect(dialogChoices(dialog)).toEqual([]);
    expect(made.gymStore.row(6)).toBeDefined();
  });

  it('says so when nothing refers to the gym', async () => {
    const made = await gymCommandsWith();
    const { dialog } = await asked(made);
    expect(dialogText(dialog)).toBe(
      'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.\nNothing refers to it.\n\n' +
        'Submit deletes it.',
    );
  });

  it('opens no dialog when what goes with the gym takes too long to read', async () => {
    const made = await gymCommandsWith();
    let arrive: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    vi.spyOn(made.admin, 'references').mockImplementation(() => {
      arrive();
      return new Promise(() => undefined);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const using = made.use('delete', { gym: 'id:6' });
      await reading;
      await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
      const used = await using;
      expect(used.showModal).not.toHaveBeenCalled();
      expect(sent(used.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
    } finally {
      vi.useRealTimers();
    }
    expect(made.gymStore.row(6)).toBeDefined();
  });

  it('deletes on Submit: the gym, its stops, its saved routes and its targets', async () => {
    const made = await gymCommandsWith();
    const train = await trainOn(made, [1, 6]);
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
    const { dialog } = await asked(made);

    const submitted = await made.submit(dialog.custom_id, {});
    await made.settle();

    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(said(answerOf(submitted))).toBe(
      [
        'Deleted **Maple Leaf Mosaic** (#6).',
        'With it went:',
        '- its stop on the route of 1 active train',
        '- its stop on 1 saved route',
        '- the gym target of 1 member',
      ].join('\n'),
    );
    expect(buttonsOf(answerOf(submitted))).toEqual([]);
    expect(made.gymStore.row(6)).toBeUndefined();
    expect(made.directory.stored(6)).toBeUndefined();
    expect(inGyms(asTrain(made.store.get(train.id)).train.route)).toEqual(inGyms([1]));
    // The post of the train says why, and names nobody as a mention.
    const lines = made.gateway
      .messagesIn(train.forumPostId ?? '')
      .map((message) => message.message.content ?? '');
    expect(lines).toContain("**Maple Leaf Mosaic** was removed from Pine's gym list.");
    expect(made.routes.rows.map((row) => row.stops)).toEqual([stops(1)]);
    expect(made.gymTargets.rows).toEqual([]);
    expect(made.gateway.messagesIn(UPDATES_CHANNEL).map((m) => m.message)).toEqual([
      { content: '**Maple Leaf Mosaic** (#6) was removed from the gym list.' },
    ]);
    // The gym is no longer offered or accepted.
    const typed = await made.typing('show', 'maple leaf mosaic');
    const offered = typed.respond.mock.calls[0]?.[0] ?? [];
    expect(offered.some((choice) => choice.value === 'id:6')).toBe(false);
    expect(said(sent((await made.use('show', { gym: 'id:6' })).followUp))).toBe(
      'There is no gym #6.',
    );
  });

  it('refuses while an active raid is at the gym, with a link to its post, and opens no dialog', async () => {
    const made = await gymCommandsWith();
    const raid = await raidAt(made, 6);
    const used = await made.use('delete', { gym: 'id:6' });
    expect(used.showModal).not.toHaveBeenCalled();
    expect(said(sent(used.reply))).toBe(
      `A raid is at **Maple Leaf Mosaic** (#6): <#${raid.forumPostId ?? ''}>. A gym cannot be ` +
        'deleted while a raid is there: wait until the raid is over, or close it with ' +
        '`/delete` in its post.',
    );
  });

  it('decides again on Submit: a raid that was reported since the dialog keeps the gym', async () => {
    const made = await gymCommandsWith();
    const { dialog } = await asked(made);
    const raid = await raidAt(made, 6);

    const submitted = await made.submit(dialog.custom_id, {});

    expect(said(answerOf(submitted))).toBe(
      `A raid was reported at **Maple Leaf Mosaic** (#6): <#${raid.forumPostId ?? ''}>. A gym ` +
        'cannot be deleted while a raid is there: wait until the raid is over, or close it ' +
        'with `/delete` in its post.',
    );
    expect(made.gymStore.row(6)).toBeDefined();
  });

  it('counts on Submit what is there then, not what the dialog listed', async () => {
    const made = await gymCommandsWith();
    const { dialog } = await asked(made);
    expect(dialogText(dialog)).toContain('Nothing refers to it.');
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    const submitted = await made.submit(dialog.custom_id, {});
    expect(said(answerOf(submitted))).toBe(
      'Deleted **Maple Leaf Mosaic** (#6).\nWith it went:\n- its stop on 1 saved route',
    );
    expect(made.routes.rows.map((row) => row.stops)).toEqual([stops(1)]);
  });

  it('says so when the gym is gone already (a second Submit too), and when the clean-up fails', async () => {
    const made = await gymCommandsWith();
    const { dialog } = await asked(made);
    expect(said(answerOf(await made.submit(dialog.custom_id, {})))).toBe(
      'Deleted **Maple Leaf Mosaic** (#6).',
    );
    expect(said(answerOf(await made.submit(dialog.custom_id, {})))).toBe(
      'That gym no longer exists.',
    );

    const other = await asked(made, 'id:3');
    made.routes.failing = new Error('database is down');
    expect(said(answerOf(await made.submit(other.dialog.custom_id, {})))).toBe(
      'I could not delete the gym, and nothing was changed. Try again in a moment.',
    );
    expect(made.gymStore.row(3)).toBeDefined();
  });

  it('names a train it could not take the gym off, and counts what really went', async () => {
    const made = await gymCommandsWith();
    const broken = await trainOn(made, [1, 6]);
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    // One member with the target in two servers is one member.
    await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
    await made.gymTargets.add(ALICE, '412345678901234568', 6);
    const { dialog } = await asked(made);
    expect(dialogText(dialog)).toContain('- the gym target of 1 member');
    // The gym goes; the train cannot be stored afterwards.
    const remove = made.removal.remove.bind(made.removal);
    made.removal.remove = async (id, server) => {
      const counts = await remove(id, server);
      made.storage.failing = new Error('party table is locked');
      return counts;
    };

    const submitted = await made.submit(dialog.custom_id, {});
    made.storage.failing = undefined;

    expect(said(answerOf(submitted)).split('\n')).toEqual([
      'Deleted **Maple Leaf Mosaic** (#6).',
      'With it went:',
      '- its stop on 1 saved route',
      '- the gym target of 1 member',
      `I could not take it off the route of <#${broken.forumPostId ?? ''}>: use \`/route remove\` in its post.`,
    ]);
    expect(made.directory.stored(6)).toBeUndefined();
  });

  it('lets only staff submit, and takes no gym of another server', async () => {
    const made = await gymCommandsWith();
    const { dialog } = await asked(made);
    const member = await made.submit(dialog.custom_id, {}, { userId: MEMBER, roleNames: [] });
    expect(said(sent(member.reply))).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    const foreign = await made.submit(dialog.custom_id, {}, OTHER_SERVER);
    expect(said(answerOf(foreign))).toBe('That gym no longer exists.');
    expect(made.gymStore.row(6)).toBeDefined();
  });

  it('gives the buttons of the question it asked before no answer but that it expired', async () => {
    const made = await gymCommandsWith();
    for (const action of ['delete', 'cancel']) {
      const pressed = await made.press(`gym:0123456789abcdef:${action}`);
      expect(said(answerOf(pressed))).toBe(EXPIRED);
    }
    expect(made.gymStore.row(6)).toBeDefined();
  });
});

describe('/gym refresh', () => {
  it('asks nothing at the monthly cap of lookups by hand, and says until when (plan 8Z)', async () => {
    const made = await gymCommandsWith();
    const month = googleMonth(Date.now());
    const cap = made.ctx.config.settings.googleByHandPerMonth;
    for (let n = 0; n < cap; n += 1) await made.googleUse.use(month.today, 'hand');
    made.geo.asked.length = 0;
    const answer = answerOf(await made.use('refresh', { gym: 'id:2' }));
    expect(said(answer).split('\n')).toEqual([
      '**Old Stone Fountain** (#2):',
      'I did not ask Google: the lookups by hand this server may make this month are used ' +
        `(each server may always make a few of this instance’s ${cap}, and more of what the ` +
        `others leave). They start again <t:${Math.floor(month.nextReset / 1000)}:f>. The gym ` +
        'keeps what it has.',
    ]);
    expect(made.geo.asked).toEqual([]);
  });

  it('counts a lookup by hand against the server whose staff asked (plan 19B-5)', async () => {
    const made = await gymCommandsWith();
    const month = googleMonth(Date.now());
    await made.use('refresh', { gym: 'id:2' });
    const used = await made.googleUse.serversUsedOn(month.days);
    expect([...used.values()].map((counts) => counts.byHand)).toEqual([1]);
  });

  it('says it could not read the count, not that the lookups are used, when that read fails', async () => {
    const made = await gymCommandsWith();
    made.geo.asked.length = 0;
    vi.spyOn(made.googleUse, 'usedOn').mockRejectedValue(new Error('the database is away'));
    const answer = answerOf(await made.use('refresh', { gym: 'id:2' }));
    expect(said(answer).split('\n')).toEqual([
      '**Old Stone Fountain** (#2):',
      'I did not ask Google: I could not read how many lookups by hand this month has used. ' +
        'Try again in a moment. The gym keeps what it has.',
    ]);
    expect(made.geo.asked).toEqual([]);
  });

  it('is held to 10 in 10 minutes per member (plan 8Z)', async () => {
    const made = await gymCommandsWith();
    for (let n = 0; n < 10; n += 1) {
      expect(said(answerOf(await made.use('refresh', { gym: 'id:2' })))).toContain('Old Stone');
    }
    const eleventh = await made.use('refresh', { gym: 'id:2' });
    expect(sent(eleventh.reply).content).toMatch(/^You can use \/gym refresh again in /u);
  });

  it('asks Google again and says what it got', async () => {
    const made = await gymCommandsWith();
    const refreshed = await made.use('refresh', { gym: 'id:2' });
    const answer = answerOf(refreshed);
    expect(said(answer).split('\n')).toEqual([
      '**Old Stone Fountain** (#2):',
      'Its address was fetched anew.',
      'Its nearby places were fetched anew.',
    ]);
    const view = gymViewOf(answer);
    expect(view.facts['Nearby places (from Google)']).toBe('Corner Bakery Maple Dental');
    expect(view.lines[0]).toBe('Test Road, Pinewood');

    expect(
      said(answerOf(await made.use('refresh', { gym: 'id:2' })))
        .split('\n')
        .slice(1),
    ).toEqual([
      'Its address is as before: Google says the same.',
      'Its nearby places are as before: Google says the same.',
    ]);
  });

  it('says that there is no key, and what failed', async () => {
    const made = await gymCommandsWith();
    made.geo.failing = { geocode: 'failed', places: 'denied' };
    expect(
      said(answerOf(await made.use('refresh', { gym: 'id:2' })))
        .split('\n')
        .slice(1),
    ).toEqual([
      'Its address could not be fetched: try again in a moment. It keeps what it had.',
      'Its nearby places could not be fetched: Google refuses the API key for the Places API ' +
        '(New), which has to be enabled for the key’s project. It keeps what it had.',
    ]);
    made.geo.enabled = false;
    expect(
      said(answerOf(await made.use('refresh', { gym: 'id:2' })))
        .split('\n')
        .slice(1),
    ).toEqual(['No Google API key is configured, so there is nothing to fetch.']);
    expect(made.directory.stored(2)?.places).toBe('Riverside Plaza, Cafe Luna');
  });
});

describe('/gym export', () => {
  it('attaches one file with the gyms that lie in a region of this server, by name', async () => {
    const made = await gymCommandsWith();
    await made.admin.edit(3, { name: 'The "Old"\tChurch' }, MODERATOR);
    const exported = await made.use('export');
    const answer = answerOf(exported);
    expect(said(answer)).toBe('The 11 gyms that lie in a region of this server.');
    const [file] = (answer.files ?? []) as { name: string; attachment: Buffer }[];
    expect(file?.name).toBe('gyms.tsv');
    const lines = file?.attachment.toString('utf8').split('\n') ?? [];
    expect(lines[0]).toBe('Gym Name\tLongitude\tLatitude');
    expect(lines.slice(1, 4)).toEqual([
      'Café Élan Fresco\t-79.92\t40.05',
      'Harbor Lighthouse Mural\t-79.99\t40.05',
      'Maple Leaf Mosaic\t-80.03\t40.03',
    ]);
    expect(lines).toContain("The 'Old' Church\t-80.07\t40.07");
    // Gym 10 lies in no region: it is not exported. Eleven gyms, the header, the last line feed.
    expect(lines).toHaveLength(13);
    expect(lines.some((line) => line.startsWith('Lakeview Trailhead'))).toBe(false);
  });

  it('says so when the server has no regions, or no gym in them', async () => {
    const made = await gymCommandsWith();
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]) {
      await made.admin.delete(id, { id: MODERATOR }, STAFF_PLACE);
    }
    expect(said(sent((await made.use('export')).followUp))).toBe(
      'No gym lies in a region of this server.',
    );
    made.regions.rows = [];
    expect(said(sent((await made.use('export')).followUp))).toBe('This server has no regions yet.');
  });
});

describe('/operator clear-image-cache', () => {
  it('deletes the cached map pictures and says how many', async () => {
    const made = await gymCommandsWith();
    let left = 7;
    Object.assign(made.ctx, {
      maps: {
        ...made.ctx.maps,
        clear: () => {
          const deleted = left;
          left = 0;
          return Promise.resolve(deleted);
        },
      },
    });
    const run = async () => {
      const interaction = fakeChatInput({
        commandName: 'operator',
        subcommand: 'clear-image-cache',
        userId: MODERATOR,
        roleNames: ['Bot Developer'],
        displayName: 'Brock',
      });
      await made.router.handle(interaction as never);
      return interaction;
    };
    const first = await run();
    expect(first.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(first.editReply).toHaveBeenCalledWith({ content: 'Deleted 7 cached map pictures.' });
    expect((await run()).editReply).toHaveBeenCalledWith({
      content: 'There were no cached map pictures to delete.',
    });
    // Plan 19B-1: the pictures are every server's; the owner is told of a clear that deleted any.
    const told = (made.ctx.dms as RecordingDms).jobs;
    expect(told.map((job) => textDisplays(job.message).slice(1))).toEqual([
      [
        `**Brock** · ${MODERATOR}\nfrom **Test Server** · ${FAKE_GUILD_ID}`,
        'Cleared the image cache, for every server: deleted 7 cached map pictures.',
      ],
    ]);
  });

  it('is for staff', async () => {
    const made = await gymCommandsWith();
    const interaction = fakeChatInput({
      commandName: 'operator',
      subcommand: 'clear-image-cache',
      userId: MEMBER,
    });
    await made.router.handle(interaction as never);
    expect(said(sent(interaction.reply))).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
  });
});

describe('/gym: what it says fits one message', () => {
  it('holds its questions and answers to 2,000 characters whatever the gyms are called', async () => {
    const made = await gymCommandsWith();
    // Five gyms on one spot, each with the longest name and nickname a row can hold, all of it
    // Markdown that doubles when it is escaped; and a server with many regions.
    const nasty = '*_~`|'.repeat(51);
    const spot = { lat: 40.015, lon: -80.015 };
    for (let n = 0; n < 5; n++) {
      const gym = await made.gymStore.create({ name: nasty, ...spot, nickname: nasty }, 1);
      await made.directory.refreshGym(gym.id);
    }
    const square = made.regions.rows[0]?.bounds ?? null;
    for (let n = 0; n < 60; n++) {
      made.regions.rows.push({
        id: 100 + n,
        guildId: 1,
        channelId: String(200000000000000000n + BigInt(n)),
        description: null,
        bounds: square,
        forumChannelId: null,
        summaryMessageId: null,
      });
    }
    await made.directory.load();

    const name = '*'.repeat(100);
    const add = answerOf(await made.use('add', { location: '40.015, -80.015', name }));
    expect(said(add).length).toBeLessThanOrEqual(LIMITS.content);
    expect(said(add)).toContain('5 other gyms lie within 10 m of that place:');
    expect(said(add)).toContain('- …and 2 more');
    expect(said(add)).toMatch(/…and \d+ more\.\n/);

    const move = answerOf(await made.use('move', { gym: '#13', location: '40.01505, -80.015' }));
    expect(said(move).length).toBeLessThanOrEqual(LIMITS.content);
    // Nothing of it was cut off by the limit: it names the gym by its number, lists three of
    // the gyms beside the new place with theirs, and ends with its last line.
    const lines = said(move).split('\n') ?? [];
    expect(lines[0]).toMatch(
      /, #13\) from \[40\.015, -80\.015\]\(.+\) to \[40\.01505, -80\.015\]\(.+\)\?$/,
    );
    expect(lines.slice(1)).toEqual([
      '4 other gyms lie within 10 m of that place:',
      expect.stringMatching(/, #14\), 6 m away$/) as string,
      expect.stringMatching(/, #15\), 6 m away$/) as string,
      expect.stringMatching(/, #16\), 6 m away$/) as string,
      '- …and 1 more',
    ]);
    expect(buttonsOf(move).map(([label]) => label)).toEqual(['Move anyway', 'Cancel']);

    // The dialog of a deletion holds the 4,000 characters of a text display (`checkModal`).
    const remove = dialogText(shownDialog(await made.use('delete', { gym: '#13' })));
    // The number is what tells such gyms apart: it is never cut away.
    expect(remove).toContain(', #13)? This cannot be undone.');

    const shown = answerOf(await made.use('show', { gym: '#13' }));
    expect(said(shown).length).toBeLessThanOrEqual(LIMITS.content);
    const refused = await made.use('show', { gym: '*_~`|' });
    expect(said(sent(refused.followUp)).length).toBeLessThanOrEqual(LIMITS.content);
  });
});
