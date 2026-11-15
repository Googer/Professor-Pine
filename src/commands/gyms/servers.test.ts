import { shownDialog } from '../../../test/support/dialogs.js';
import { describe, expect, it } from 'vitest';
import { sent } from '../../../test/support/fake-interactions.js';
import { STAFF_PLACE, withOtherServer } from '../../../test/support/gym-admin.js';
import {
  answerOf,
  buttonId,
  gymCommandsWith,
  gymOf,
  gymViewOf,
  OTHER_SERVER,
  said,
} from '../../../test/support/gym-commands.js';
import { northRegion, OTHER_GUILD_ROW } from '../../../test/support/gyms.js';

type Made = Awaited<ReturnType<typeof gymCommandsWith>>;

/** `/gym` in two servers: the usual one with West and East, and a second with North and gym 13. */
async function twoServers() {
  const made = await gymCommandsWith();
  const north = await withOtherServer(made);
  return { ...made, north };
}

const names = (interaction: { respond: { mock: { calls: unknown[][] } } }): string[] =>
  (interaction.respond.mock.calls[0]?.[0] as { name: string }[]).map((choice) => choice.name);

/** What a command that was deferred answered a refusal with. */
const refusal = async (used: Promise<Awaited<ReturnType<Made['use']>>>): Promise<string> =>
  said(sent((await used).followUp)) ?? '';

const footer = (used: Awaited<ReturnType<Made['use']>>): string => gymOf(answerOf(used)) ?? '';

/** Gives a gym to the second server too, as the upgrade links a gym in regions of both. */
async function share(made: Made, gymId: number): Promise<void> {
  made.gymStore.link(gymId, OTHER_GUILD_ROW);
  await made.directory.refreshGym(gymId);
}

/** A region of the second server around a place in no region (41.0, -80.0). */
async function farRegionOfTheOther(made: Made): Promise<void> {
  made.regions.rows.push({
    ...northRegion(),
    id: 5,
    channelId: '100000000000000005',
    bounds: [
      { lat: 40.9, lon: -80.1 },
      { lat: 41.1, lon: -80.1 },
      { lat: 41.1, lon: -79.9 },
      { lat: 40.9, lon: -79.9 },
      { lat: 40.9, lon: -80.1 },
    ],
  });
  await made.directory.load();
}

describe('/gym: the gyms of another server (plan 19B-2: the gyms linked to the server)', () => {
  it('offers a server only its own gyms, wherever they lie', async () => {
    const made = await twoServers();
    // Nothing typed: the gyms of the region the command is used in.
    expect(names(await made.typing('show', '', OTHER_SERVER))).toEqual(['Northgate Clock · #13']);
    expect(names(await made.typing('show', ''))).not.toContain('Northgate Clock · #13');
    // By name.
    expect(names(await made.typing('show', 'northgate'))).toEqual([]);
    expect(names(await made.typing('show', 'northgate', OTHER_SERVER))).toEqual([
      'Northgate Clock · #13',
    ]);
    expect(names(await made.typing('show', 'library', OTHER_SERVER))).toEqual([]);
    expect(names(await made.typing('show', 'library'))).toEqual([
      'Pinewood Public Library · The Stacks · #1',
    ]);
    // By number (the search also finds a gym by the beginning of its number).
    expect(names(await made.typing('show', '13'))).toEqual([]);
    expect(names(await made.typing('show', '#1', OTHER_SERVER))).toEqual(['Northgate Clock · #13']);
    // Gym 10 lies in no region: the first server's, as the upgrade linked it, nobody else's.
    expect(names(await made.typing('show', 'trailhead'))).toEqual(['Lakeview Trailhead · #10']);
    expect(names(await made.typing('show', 'trailhead', OTHER_SERVER))).toEqual([]);
  });

  it('refuses the number of another server’s gym as if there were no such gym', async () => {
    const made = await twoServers();
    await expect(refusal(made.use('show', { gym: '#13' }))).resolves.toBe('There is no gym #13.');
    await expect(refusal(made.use('show', { gym: 'id:13' }))).resolves.toBe('There is no gym #13.');
    await expect(refusal(made.use('show', { gym: '13' }))).resolves.toMatch(
      /^I found no gym for "13"\./,
    );
    await expect(refusal(made.use('show', { gym: '#1' }, OTHER_SERVER))).resolves.toBe(
      'There is no gym #1.',
    );
    await expect(refusal(made.use('show', { gym: '#10' }, OTHER_SERVER))).resolves.toBe(
      'There is no gym #10.',
    );
    // Its own by number.
    expect(footer(await made.use('show', { gym: '#13' }, OTHER_SERVER))).toMatch(/^Gym #13 /);
    expect(footer(await made.use('show', { gym: '13' }, OTHER_SERVER))).toMatch(/^Gym #13 /);
    expect(footer(await made.use('show', { gym: '10' }))).toMatch(/^Gym #10 /);
  });

  it('refuses the name of another server’s gym as a name that finds nothing', async () => {
    const made = await twoServers();
    await expect(refusal(made.use('show', { gym: 'northgate clock' }))).resolves.toMatch(
      /^I found no gym for "northgate clock"\./,
    );
    await expect(
      refusal(made.use('show', { gym: 'pinewood public library' }, OTHER_SERVER)),
    ).resolves.toMatch(/^I found no gym for "pinewood public library"\./);
    expect(footer(await made.use('show', { gym: 'northgate clock' }, OTHER_SERVER))).toMatch(
      /^Gym #13 /,
    );
    // A name both servers have a gym of means, for each, its own.
    await made.gymStore.update(13, { name: 'Starbucks' });
    await made.directory.refreshGym(13);
    expect(footer(await made.use('show', { gym: 'starbucks' }, OTHER_SERVER))).toMatch(/^Gym #13 /);
    await expect(refusal(made.use('show', { gym: 'starbucks' }))).resolves.not.toContain('#13');
  });

  it('refuses every subcommand that takes a gym the same way, and changes nothing', async () => {
    const made = await twoServers();
    made.gymStore.writes.length = 0;
    const none = 'There is no gym #13.';
    await expect(refusal(made.use('elite', { gym: '#13', eligible: true }))).resolves.toBe(none);
    // The dialog of a deletion is not deferred: its refusal is the reply.
    const deleting = await made.use('delete', { gym: '#13' });
    expect(deleting.showModal).not.toHaveBeenCalled();
    expect(said(sent(deleting.reply))).toBe(none);
    await expect(refusal(made.use('refresh', { gym: '#13' }))).resolves.toBe(none);
    await expect(
      refusal(made.use('move', { gym: '#13', location: '40.2501, -80.05' })),
    ).resolves.toBe(none);
    // The form of an edit is not deferred: its refusal is the reply.
    const edit = await made.use('edit', { gym: '#13' });
    expect(edit.showModal).not.toHaveBeenCalled();
    expect(said(sent(edit.reply))).toBe(none);
    expect(made.gymStore.writes).toEqual([]);
    expect(made.geo.asked).toEqual([]);
  });

  it('lets both servers touch a gym linked to both, and neither by its regions alone', async () => {
    const made = await twoServers();
    // A region of the second server that covers the Library (gym 1) and the Fountain (gym 2).
    made.regions.rows.push({
      ...northRegion(),
      id: 5,
      channelId: '100000000000000005',
      bounds: [
        { lat: 40.04, lon: -80.07 },
        { lat: 40.07, lon: -80.07 },
        { lat: 40.07, lon: -80.04 },
        { lat: 40.04, lon: -80.04 },
        { lat: 40.04, lon: -80.07 },
      ],
    });
    await made.directory.load();
    await expect(refusal(made.use('show', { gym: '#1' }, OTHER_SERVER))).resolves.toBe(
      'There is no gym #1.',
    );
    await share(made, 1);
    expect(footer(await made.use('show', { gym: '#1' }))).toMatch(/^Gym #1 /);
    expect(footer(await made.use('show', { gym: '#1' }, OTHER_SERVER))).toMatch(/^Gym #1 /);
    await expect(refusal(made.use('show', { gym: '#2' }, OTHER_SERVER))).resolves.toBe(
      'There is no gym #2.',
    );
    // A change by one is the other's too: one row, one text.
    const edited = await made.ctx.gymAdmin.edit(1, { notice: 'Closed on Sundays' }, 'staff');
    expect(edited?.notice).toBe('Closed on Sundays');
    expect(
      gymViewOf(answerOf(await made.use('show', { gym: '#1' }, OTHER_SERVER))).facts.Notice,
    ).toBe('Closed on Sundays');
  });

  it('refuses a question and a form about a gym this server deleted since, its sharer keeping it', async () => {
    const made = await twoServers();
    await share(made, 6);
    const deleting = shownDialog(await made.use('delete', { gym: '#6' }));
    const moving = answerOf(await made.use('move', { gym: '#6', location: '40.05, -79.95' }));
    const used = await made.use('edit', { gym: '#6' });
    const form = used.showModal.mock.calls[0]?.[0] as {
      custom_id: string;
      components: { components: { custom_id: string; value?: string }[] }[];
    };
    const fields = Object.fromEntries(
      form.components.map((row) => [
        row.components[0]?.custom_id ?? '',
        row.components[0]?.value ?? '',
      ]),
    );
    await made.admin.delete(6, { id: 'staff' }, STAFF_PLACE);
    made.gymStore.writes.length = 0;

    expect(said(answerOf(await made.submit(deleting.custom_id, {})))).toBe(
      'That gym no longer exists.',
    );
    expect(said(answerOf(await made.press(buttonId(moving, 'Move anyway'))))).toBe(
      'That gym no longer exists.',
    );
    const submitted = await made.submit(
      form.custom_id,
      { ...fields, nickname: 'Ours' },
      { modalFromCommand: true },
    );
    expect(said(sent(submitted.followUp))).toBe('That gym no longer exists.');
    expect(made.gymStore.writes).toEqual([]);
    // The second server's still.
    expect(footer(await made.use('show', { gym: '#6' }, OTHER_SERVER))).toMatch(/^Gym #6 /);
  });
});

describe('/gym add and /gym move: anywhere, also in another server’s regions', () => {
  it('adds a gym in a region of another server as a gym of its own', async () => {
    const made = await twoServers();
    const question = answerOf(
      await made.use('add', { location: '40.26, -80.05', name: 'North Fountain' }),
    );
    await made.press(buttonId(question, 'Add'));
    expect(made.gymStore.row(14)?.name).toBe('North Fountain');
    expect(made.directory.serversOf(14)).toEqual([1]);
    await expect(refusal(made.use('show', { gym: '#14' }, OTHER_SERVER))).resolves.toBe(
      'There is no gym #14.',
    );
    expect(footer(await made.use('show', { gym: '#14' }))).toMatch(/^Gym #14 /);
  });

  it('counts only gyms of its own server as near a place or nearest to a gym', async () => {
    const made = await twoServers();
    // The place below is 9 meters from Northgate Clock (13), the second server's.
    await made.gymStore.update(13, { lat: 40.20004, lon: -80.05 });
    await made.directory.refreshGym(13);
    const place = { location: '40.19996, -80.05', name: 'Border Bench' };
    const question = said(answerOf(await made.use('add', place)));
    expect(question).not.toContain('Northgate');
    expect(question).not.toContain('within');
    // The other server, whose gym it is, is asked about it.
    expect(said(answerOf(await made.use('add', place, OTHER_SERVER)))).toContain(
      'Another gym lies within 10 m of that place:\n- **Northgate Clock** (#13), 9 m away',
    );
    const added = answerOf(await made.use('add', place));
    await made.press(buttonId(added, 'Add'));
    // Its nearest gym is of its own server's (plan 19B-3), not the other server's 9 m off.
    expect(made.gymStore.row(14)).toMatchObject({ name: 'Border Bench', nearestGym: 11 });
    await made.directory.refreshGym(14);
    // This server is shown its own nearest.
    expect(
      gymViewOf(answerOf(await made.use('show', { gym: '#14' }))).facts['Nearest gym'],
    ).toMatch(/^\*\*Riverside Park Gazebo\*\* \(#11\), /);
  });

  it('adds at the press where the place became another server’s region since the question', async () => {
    const made = await twoServers();
    const question = answerOf(
      await made.use('add', { location: '41.001, -80.001', name: 'Far Away' }),
    );
    await farRegionOfTheOther(made);
    await made.press(buttonId(question, 'Add'));
    expect(made.gymStore.row(14)?.name).toBe('Far Away');
    expect(made.directory.serversOf(14)).toEqual([1]);
  });

  it('moves a gym of its own into another server’s region, where it stays its own', async () => {
    const made = await twoServers();
    const question = answerOf(await made.use('move', { gym: '#6', location: '40.26, -80.06' }));
    await made.press(buttonId(question, 'Move anyway'));
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.26, lon: -80.06 });
    expect(made.admin.mayTouch(6, 1)).toBe(true);
    expect(made.admin.mayTouch(6, OTHER_GUILD_ROW)).toBe(false);
    // Nor may the other server take it from there.
    await expect(
      refusal(made.use('move', { gym: '#6', location: '40.261, -80.06' }, OTHER_SERVER)),
    ).resolves.toBe('There is no gym #6.');
  });
});
