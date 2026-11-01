import { shownDialog } from '../../../test/support/dialogs.js';
import { describe, expect, it } from 'vitest';
import { sent } from '../../../test/support/fake-interactions.js';
import { withOtherServer } from '../../../test/support/gym-admin.js';
import {
  answerOf,
  buttonId,
  buttonsOf,
  gymCommandsWith,
  gymOf,
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

/** Puts gym 6 (Maple Leaf Mosaic, of West) into North: it now lies in the other server's region. */
async function handOver(made: Made, gymId = 6): Promise<void> {
  await made.gymStore.update(gymId, { lat: 40.26, lon: -80.06 });
  await made.directory.refreshGym(gymId);
}

const FOREIGN_ADD =
  'That place belongs to another server’s regions: I cannot add a gym there from here.';
const FOREIGN_MOVE =
  'That place belongs to another server’s regions: I cannot move a gym there from here.';

describe('/gym: the gyms of another server', () => {
  it('offers a server only its own gyms, and those in no region to both', async () => {
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
    // By number.
    expect(names(await made.typing('show', '13'))).toEqual([]);
    // (The search also finds a gym by the beginning of its number: 10 and 13 for a 1.)
    expect(names(await made.typing('show', '#1', OTHER_SERVER)).sort()).toEqual([
      'Lakeview Trailhead · #10',
      'Northgate Clock · #13',
    ]);
    expect(names(await made.typing('show', '#13', OTHER_SERVER))).toEqual([
      'Northgate Clock · #13',
    ]);
    // Gym 10 lies in no region of any server.
    expect(names(await made.typing('show', 'trailhead'))).toEqual(['Lakeview Trailhead · #10']);
    expect(names(await made.typing('show', 'trailhead', OTHER_SERVER))).toEqual([
      'Lakeview Trailhead · #10',
    ]);
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
    await expect(refusal(made.use('show', { gym: '1' }, OTHER_SERVER))).resolves.toMatch(
      /^I found no gym for "1"\./,
    );
    // Its own, and the one in no region, by number.
    expect(footer(await made.use('show', { gym: '#13' }, OTHER_SERVER))).toMatch(/^Gym #13 /);
    expect(footer(await made.use('show', { gym: '13' }, OTHER_SERVER))).toMatch(/^Gym #13 /);
    expect(footer(await made.use('show', { gym: '#10' }, OTHER_SERVER))).toMatch(/^Gym #10 /);
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

  it('lets both servers touch a gym that lies in regions of both', async () => {
    const made = await twoServers();
    // A region of the second server that covers the Library (gym 1) too.
    made.regions.rows.push({
      ...northRegion(),
      id: 5,
      channelId: '100000000000000005',
      bounds: [
        { lat: 40.04, lon: -80.06 },
        { lat: 40.06, lon: -80.06 },
        { lat: 40.06, lon: -80.04 },
        { lat: 40.04, lon: -80.04 },
        { lat: 40.04, lon: -80.06 },
      ],
    });
    await made.directory.load();
    expect(footer(await made.use('show', { gym: '#1' }))).toMatch(/^Gym #1 /);
    expect(footer(await made.use('show', { gym: '#1' }, OTHER_SERVER))).toMatch(/^Gym #1 /);
    await expect(refusal(made.use('show', { gym: '#2' }, OTHER_SERVER))).resolves.toBe(
      'There is no gym #2.',
    );
  });

  it('refuses a press on a question about a gym that changed hands since', async () => {
    const made = await twoServers();
    const deleting = shownDialog(await made.use('delete', { gym: '#6' }));
    const moving = answerOf(await made.use('move', { gym: '#6', location: '40.05, -79.95' }));
    await handOver(made);
    made.gymStore.writes.length = 0;

    const deleted = answerOf(await made.submit(deleting.custom_id, {}));
    const moved = answerOf(await made.press(buttonId(moving, 'Move anyway')));
    for (const gone of [deleted, moved]) {
      expect(said(gone)).toBe('That gym no longer exists.');
      expect(buttonsOf(gone)).toEqual([]);
    }
    expect(made.gymStore.writes).toEqual([]);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.26, lon: -80.06 });
    // It is the other server's now.
    expect(footer(await made.use('show', { gym: '#6' }, OTHER_SERVER))).toMatch(/^Gym #6 /);
  });

  it('refuses the form of an edit that is sent after the gym changed hands', async () => {
    const made = await twoServers();
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
    await handOver(made);
    made.gymStore.writes.length = 0;
    const submitted = await made.submit(
      form.custom_id,
      { ...fields, nickname: 'Ours' },
      { modalFromCommand: true },
    );
    expect(said(sent(submitted.followUp))).toBe('That gym no longer exists.');
    expect(made.gymStore.writes).toEqual([]);
  });
});

describe('/gym add and /gym move: a place in another server’s regions', () => {
  it('adds no gym in a region of another server, and says why', async () => {
    const made = await twoServers();
    const refused = await made.use('add', { location: '40.26, -80.05', name: 'Intruder' });
    expect(said(sent(refused.followUp))).toBe(FOREIGN_ADD);
    expect(sent(refused.followUp).components ?? []).toEqual([]);
    // The server whose region it is adds it as ever; and so does anybody in no region.
    const own = answerOf(
      await made.use('add', { location: '40.26, -80.05', name: 'North Fountain' }, OTHER_SERVER),
    );
    await made.press(buttonId(own, 'Add'), OTHER_SERVER);
    expect(made.gymStore.row(14)?.name).toBe('North Fountain');
    const nowhere = answerOf(
      await made.use('add', { location: '41.001, -80.001', name: 'Far Away' }),
    );
    await made.press(buttonId(nowhere, 'Add'));
    expect(made.gymStore.row(15)?.name).toBe('Far Away');
  });

  it('adds nothing at the press when the place became another server’s since the question', async () => {
    const made = await twoServers();
    const question = answerOf(
      await made.use('add', { location: '41.001, -80.001', name: 'Far Away' }),
    );
    const withForm = answerOf(
      await made.use('add', { location: '41.002, -80.002', name: 'Further' }),
    );
    // The second server gets a region around that place.
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

    const pressed = await made.press(buttonId(question, 'Add'));
    expect(said(answerOf(pressed))).toBe(FOREIGN_ADD);
    expect(buttonsOf(answerOf(pressed))).toEqual([]);
    // The same through the form for the details.
    const opened = await made.press(buttonId(withForm, 'Add with details…'));
    const form = opened.showModal.mock.calls[0]?.[0] as { custom_id: string };
    const submitted = await made.submit(form.custom_id, { nickname: 'Far' });
    expect(said(answerOf(submitted))).toBe(FOREIGN_ADD);
    expect(buttonsOf(answerOf(submitted))).toEqual([]);
    expect(made.gymStore.row(14)).toBeUndefined();
  });

  it('moves no gym into a region of another server, at the command or at the press', async () => {
    const made = await twoServers();
    const refused = await made.use('move', { gym: '#6', location: '40.26, -80.05' });
    expect(said(sent(refused.followUp))).toBe(FOREIGN_MOVE);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.03, lon: -80.03 });

    // Asked about a far place in no region, which is the other server's by the press.
    const question = answerOf(await made.use('move', { gym: '#6', location: '41.001, -80.001' }));
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
    const pressed = await made.press(buttonId(question, 'Move anyway'));
    expect(said(answerOf(pressed))).toBe(FOREIGN_MOVE);
    expect(buttonsOf(answerOf(pressed))).toEqual([]);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.03, lon: -80.03 });
  });

  it('moves a gym within its server, out of every region, and a gym of no region into its own', async () => {
    const made = await twoServers();
    // Out of the server's regions, to where no server has one.
    const out = answerOf(await made.use('move', { gym: '#6', location: '41.001, -80.001' }));
    await made.press(buttonId(out, 'Move anyway'));
    expect(made.gymStore.row(6)).toMatchObject({ lat: 41.001, lon: -80.001 });
    // From there the other server may take it into its region.
    const taken = answerOf(
      await made.use('move', { gym: '#6', location: '40.26, -80.06' }, OTHER_SERVER),
    );
    await made.press(buttonId(taken, 'Move anyway'), OTHER_SERVER);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.26, lon: -80.06 });
    expect(made.directory.regionsOf(6)).toEqual([northRegion().channelId]);
    expect(made.admin.mayTouch(6, 1)).toBe(false);
    expect(made.admin.mayTouch(6, OTHER_GUILD_ROW)).toBe(true);
  });
});
