import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverwriteType } from 'discord.js';
import {
  fakeButton,
  asV2,
  fakeMessage,
  sent,
  type SentPayload,
} from '../../../test/support/fake-interactions.js';
import { answerOf, buttonId, buttonsOf } from '../../../test/support/gym-commands.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { UNBOUNDED_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { testRaid } from '../../../test/support/parties.js';
import {
  REGION_STAFF,
  SOUTH_CHANNEL,
  SOUTH_RING,
  squareRing,
  TOWN_CATEGORY,
  WEST_RING,
} from '../../../test/support/region-admin.js';
import {
  attachedText,
  regionCommandsWith,
  regionListed,
  regionSaid,
} from '../../../test/support/region-commands.js';
import { writeKml } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { MAX_KML_CORNERS } from '@pine/wayspot-core/kml';
import { MAX_NEW_CHANNELS } from '../../domain/regions/region-import.js';
import { ANSWERED_BELOW } from '../../discord/late-reply.js';
import type { ImportOutcome } from '../../services/region-admin-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { textDisplays } from '../../../test/support/messages.js';
import { renderOutcome } from './import.js';

type Made = Awaited<ReturnType<typeof regionCommandsWith>>;

const area = (name: string, outline: LatLon[], description: string | null = null) => ({
  name,
  description,
  outline,
});

async function importing(
  made: Made,
  file: Parameters<typeof writeKml>[0] | string,
  more: { channel?: string } = {},
) {
  const used = await made.use(
    'import',
    {},
    {
      resolved: {
        file: made.file('regions.kml', typeof file === 'string' ? file : writeKml(file)),
        ...(more.channel === undefined ? {} : { channel: { id: more.channel } }),
      },
    },
  );
  return { used, answer: answerOf(used) };
}

const listed = regionListed;

/** The custom id of the first button under an answer: Import, whatever it creates. */
const importButton = (answer: SentPayload): string => buttonsOf(answer)[0]?.[1] ?? '';

const far = (i: number) => squareRing(41 + i * 0.01, -81, 41.005 + i * 0.01, -80.9);

describe('/region import: the preview, as review B asked', () => {
  it('names the forums it makes, and counts everything it creates on the button', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [
      area('South', SOUTH_RING),
      area('River Side', far(1), 'River Towns'),
    ]);
    expect(listed(answer, 'Would be imported')).toEqual([
      '- River Side → **new channel** `#river-side` in the new category `River Towns` · 0 gyms · gets a forum',
      `- South → <#${SOUTH_CHANNEL}> · new region · 0 gyms · gets a forum`,
    ]);
    expect(regionSaid(answer)).toContain(
      'I would **create 2 forums**, one for each region that has none.',
    );
    expect(buttonsOf(answer)[0]?.[0]).toBe('Import and create 1 channel, 1 category, 2 forums');
  });

  it('says on the button how many things it creates when the list is too long for it', async () => {
    const made = await regionCommandsWith();
    const areas = Array.from({ length: 30 }, (_unused, i) =>
      area(`Place ${String.fromCharCode(97 + (i % 26))}${i}`, far(i), `Cat ${i}`),
    );
    const { answer } = await importing(made, areas);
    // 25 channels (the most one import creates), 25 categories and 25 forums: the label fits.
    const label = buttonsOf(answer)[0]?.[0] ?? '';
    expect(label.length).toBeLessThanOrEqual(80);
    expect(label).toBe('Import and create 25 channels, 25 categories, 25 forums');
  });

  it('flags a new channel whose name is close to another, and puts the risky lines first', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [
      area('West', WEST_RING),
      area('Eastt', far(1)),
      area('Brand New', far(2)),
    ]);
    expect(listed(answer, 'Would be imported')).toEqual([
      '- Eastt → **new channel** `#eastt` in the new category `Eastt` · 0 gyms · gets a forum · **did you mean `#east`?**',
      '- Brand New → **new channel** `#brand-new` in the new category `Brand New` · 0 gyms · gets a forum',
      `- West → <#${WEST_CHANNEL}> · outline unchanged · 8 gyms`,
    ]);
    expect(regionSaid(answer)).toContain(
      '**1 new channel has a name close to another**: is it a typo in the file?',
    );
  });

  it('marks and counts outlines that stay as they are, and says that other regions stay', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('West', WEST_RING), area('South', SOUTH_RING)]);
    expect(regionSaid(answer).split('\n').slice(0, 2)).toEqual([
      'This file would give 1 new region and leave 1 outline as it is. Nothing is changed yet.',
      'Regions that are not in this file stay as they are.',
    ]);
  });

  it('says for one channel that no channel is created', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('x', SOUTH_RING)], { channel: SOUTH_CHANNEL });
    expect(regionSaid(answer)?.split('\n')[0]).toBe(
      'This file would give 1 new region. Nothing is changed yet (no channel is created).',
    );
    expect(regionSaid(answer)).not.toContain('Regions that are not in this file');
  });

  it('says which new channels go into the next category, and why, when theirs has no room', async () => {
    const made = await regionCommandsWith();
    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
    for (let i = 0; i < 47; i++)
      made.gateway.addChannel(`full${i}`, `full-${i}`, { categoryId: 'k9' });
    const { answer } = await importing(made, [
      area('One More', far(1), 'Full'),
      area('Two More', far(2), 'Full'),
      area('Three More', far(3), 'Full'),
    ]);
    expect(regionSaid(answer).split('\n').slice(3)).toEqual([
      'I would **create 1 category**: `Full 2`.',
      'I would **create 3 forums**, one for each region that has none.',
      'The category `Full` has room for 3 more channels (Discord allows 50 in a category, and ' +
        'forums count), and a new region takes two, its channel and its forum: so 2 new ' +
        'channels go into `Full 2`, a new category with the permissions of `Full`, right after it.',
    ]);
    expect(listed(answer, 'Would be imported')).toEqual([
      '- One More → **new channel** `#one-more` in the category `Full` · 0 gyms · gets a forum',
      '- Two More → **new channel** `#two-more` in the new category `Full 2` · 0 gyms · gets a forum',
      '- Three More → **new channel** `#three-more` in the new category `Full 2` · 0 gyms · gets a forum',
    ]);
    expect(buttonsOf(answer)[0]?.[0]).toBe('Import and create 3 channels, 1 category, 3 forums');
  });

  it('imports a region whose full category has no room for its forum, and says it keeps none', async () => {
    const made = await regionCommandsWith();
    // Town holds West, East and the region without an outline, and the forums of West and East.
    const inTown = (made.gateway.serverChannels(made.gateway.guildId) ?? []).filter(
      (channel) => channel.categoryId === TOWN_CATEGORY,
    ).length;
    for (let i = inTown; i < 50; i++)
      made.gateway.addChannel(`town${i}`, `town-${i}`, { categoryId: TOWN_CATEGORY });
    const { answer } = await importing(made, [area('Unbounded', far(1))]);
    expect(listed(answer, 'Would be imported')).toEqual([
      `- Unbounded → <#${UNBOUNDED_CHANNEL}> · new outline · 0 gyms · **keeps no forum**: its ` +
        'category `Town` is full',
    ]);
    expect(regionSaid(answer)).toContain(
      '1 region keeps no forum for now (under "Would be imported"): its category is full, and ' +
        'Discord allows 50 channels in a category, forums included. Move some channels out of ' +
        'it, then run `/admin setup-forums`.',
    );
    expect(regionSaid(answer)).not.toContain('create 1 forum');
    expect(buttonsOf(answer)[0]?.[0]).toBe('Import');
  });

  it('says that the one place left goes to the forum of a region that has none', async () => {
    const made = await regionCommandsWith();
    const inTown = (made.gateway.serverChannels(made.gateway.guildId) ?? []).filter(
      (channel) => channel.categoryId === TOWN_CATEGORY,
    ).length;
    for (let i = inTown; i < 49; i++)
      made.gateway.addChannel(`town${i}`, `town-${i}`, { categoryId: TOWN_CATEGORY });
    const { answer } = await importing(made, [
      area('Unbounded', far(1)),
      area('River Side', far(2), 'Town'),
    ]);
    expect(regionSaid(answer)).toContain(
      'The category `Town` has room for 1 more channel (Discord allows 50 in a category, and ' +
        'forums count), and the forum of a region that has none takes it: so 1 new channel ' +
        'goes into `Town 2`, a new category with the permissions of `Town`, right after it.',
    );
  });

  it('says plainly what a full category or server leaves out', async () => {
    const made = await regionCommandsWith();
    // South's channel in a category filled to the last place: its forum has none.
    made.gateway.addChannel('k8', 'Packed', { kind: 'category' });
    made.gateway.addChannel(SOUTH_CHANNEL, 'south', { categoryId: 'k8' });
    for (let i = 0; i < 49; i++)
      made.gateway.addChannel(`packed${i}`, `packed-${i}`, { categoryId: 'k8' });
    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
    expect(listed(answer, 'Left out')).toEqual([
      `- South: \`#south\` would get its forum beside it, and its category \`Packed\` is full`,
    ]);
    expect(regionSaid(answer)).toContain(
      '1 area needs a forum in a full category (under "Left out"): Discord allows 50 channels ' +
        'in a category, and forums count. Move some channels out of that category, or move ' +
        'the region’s channel into one with room, and import again.',
    );
    expect(buttonsOf(answer)).toEqual([]);

    for (let i = 0; i < 500; i++) made.gateway.addChannel(`many${i}`, `many-${i}`);
    const crowded = await importing(made, [area('River Side', far(1))]);
    expect(listed(crowded.answer, 'Left out')).toEqual([
      '- River Side: the server has no room for what it needs',
    ]);
    expect(regionSaid(crowded.answer)).toContain(
      'The server has no room for 1 area (under "Left out"): Discord allows 500 channels in a ' +
        'server, and forums and categories count. Delete channels nobody uses, and import again.',
    );
  });

  it('attaches every line as a file when a list had to be cut', async () => {
    const made = await regionCommandsWith();
    const areas = Array.from({ length: 56 }, (_unused, i) =>
      area(`A rather long name of a region number ${i} ${'x'.repeat(60)}`, far(i), 'Cat'),
    );
    const { answer } = await importing(made, areas);
    expect(listed(answer, 'Would be imported').at(-1)).toMatch(/^…and \d+ more$/u);
    const text = attachedText(answer, 'preview.txt');
    expect(text.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(56);
    expect(regionSaid(answer)).toContain('Every line is in the attached file.');
    // The file is for reading: channels by their names, no Markdown.
    expect(text).not.toContain('**');
    expect(text).not.toMatch(/<#\d+>/u);
    const withWest = await importing(made, [area('West', WEST_RING), ...areas]);
    const westLine = attachedText(withWest.answer, 'preview.txt')
      .split('\n')
      .find((line) => line.startsWith('- West'));
    expect(westLine).toBe('- West → #west · outline unchanged · 8 gyms');
    // The file is shown as a file of the preview, which carries it.
    expect(JSON.stringify(answer.components)).toContain('attachment://preview.txt');
    expectV2Sendable(asV2(answer));
    // A preview that fits has no file.
    const small = await importing(made, [area('South', SOUTH_RING)]);
    expect(small.answer.files ?? []).toEqual([]);
    expect(JSON.stringify(small.answer.components)).not.toContain('attachment://');
  });

  it('takes the file away with the preview, whatever is pressed', async () => {
    const made = await regionCommandsWith();
    const areas = Array.from({ length: 56 }, (_unused, i) =>
      area(`A rather long name of a region number ${i} ${'x'.repeat(60)}`, far(i), 'Cat'),
    );
    for (const label of ['Cancel', 'Import']) {
      const { answer } = await importing(made, areas);
      const id =
        label === 'Cancel' ? buttonId(answer, 'Cancel') : (buttonsOf(answer)[0]?.[1] ?? '');
      const message = fakeMessage([], undefined, regionSaid(answer), answer.files ?? []);
      const pressed = await made.press(id, { message });
      expect((await pressed.fetchReply()).attachments).toEqual([]);
    }
    // An answer for an expired question takes it away too.
    const { answer } = await importing(made, areas);
    const expired = await made.press('region:0123456789abcdef:import', {
      message: fakeMessage([], undefined, regionSaid(answer), answer.files ?? []),
    });
    expect((await expired.fetchReply()).attachments).toEqual([]);
  });

  it('takes the file away from a plain-text preview from before, and shows the outcome below', async () => {
    const made = await regionCommandsWith();
    const areas = Array.from({ length: 56 }, (_unused, i) =>
      area(`A rather long name of a region number ${i} ${'x'.repeat(60)}`, far(i), 'Cat'),
    );
    const { answer } = await importing(made, areas);
    const message = fakeMessage([], undefined, 'An old preview', answer.files ?? []);
    const pressed = await made.press(buttonsOf(answer)[0]?.[1] ?? '', {
      message,
      v2Message: false,
    });
    expect((await pressed.fetchReply()).attachments).toEqual([]);
    expect(sent(pressed.editReply)).toMatchObject({ content: ANSWERED_BELOW, attachments: [] });
    expect(regionSaid(sent(pressed.followUp))).toMatch(/^Imported \d+ regions/u);
  });

  it('attaches every line of an outcome whose lists had to be cut, and fits Discord', () => {
    const { ctx } = createTestContext();
    const hostile = ['@everyone', '**bold** `code`', '[link](https://example.com)', '<#1>'];
    const outcome: ImportOutcome = {
      imported: Array.from({ length: 200 }, (_unused, i) => ({
        name: `${hostile[i % hostile.length] ?? ''} ${i}`,
        channelId: String(100000000000000000n + BigInt(i)),
        regionId: i + 1,
        newRegion: true,
        unchanged: false,
        channelCreated: i % 2 === 0,
        gyms: i,
        forum: 'none' as const,
        forumReason: `${hostile[(i + 1) % hostile.length] ?? ''} ${'y'.repeat(200)}`,
      })),
      notImported: Array.from({ length: 100 }, (_unused, i) => ({
        name: `${hostile[i % hostile.length] ?? ''} ${'z'.repeat(80)} ${i}`,
        channelName: `channel-${i}`,
        reason: 'failed' as const,
      })),
      categoriesCreated: Array.from(
        { length: 30 },
        (_unused, i) => `Category ${'c'.repeat(90)} ${i}`,
      ),
      reloaded: false,
    };
    const message = renderOutcome(ctx, outcome);
    expectV2Sendable(message);
    expect(JSON.stringify(message.components)).toContain('attachment://outcome.txt');
    const file = (message.files ?? []).find(
      (one): one is { attachment: Buffer; name: string } =>
        typeof one !== 'string' && one.name === 'outcome.txt',
    );
    const lines = file?.attachment.toString('utf8').split('\n') ?? [];
    expect(lines.filter((line) => line.startsWith('- '))).toHaveLength(300);
    expect(file?.attachment.toString('utf8')).not.toContain('**');
    expect(textDisplays(message)[0]).toContain('Every line is in the attached file.');
    // What was not imported has the larger room: it is what staff have to put right.
    const [, imported = '', notImported = ''] = textDisplays(message);
    expect(notImported.length).toBeGreaterThan(imported.length);
  });

  it('fits Discord with a hostile file of 200 areas', async () => {
    const made = await regionCommandsWith();
    const hostile = [
      '@everyone',
      '<@123456789012345678>',
      '**bold** __under__ `code`',
      '[link](https://example.com)',
      '# heading',
      'x'.repeat(250),
      '<#123456789012345678>',
      '\u202Eevil',
    ];
    const areas = Array.from({ length: 200 }, (_unused, i) =>
      area(
        `${hostile[i % hostile.length] ?? ''} ${i}`,
        far(i % 50),
        hostile[(i + 3) % hostile.length] ?? null,
      ),
    );
    const { answer } = await importing(made, areas);
    expectV2Sendable(asV2(answer));
    expect(regionSaid(answer)).not.toContain('@everyone');
    expect(buttonsOf(answer).length).toBe(2);
  });

  it('refuses a file with too many corners in all, with a sentence', async () => {
    const made = await regionCommandsWith();
    const corners = MAX_KML_CORNERS / 4;
    const ring = (lat: number) => {
      const points = Array.from({ length: corners }, (_unused, i) => ({
        lat: lat + 0.1 * Math.sin((2 * Math.PI * i) / corners),
        lon: -80 + 0.1 * Math.cos((2 * Math.PI * i) / corners),
      }));
      return [...points, points[0] ?? { lat: 0, lon: 0 }];
    };
    const { answer } = await importing(
      made,
      Array.from({ length: 5 }, (_unused, i) => area(`R${i}`, ring(40 + i))),
    );
    expect(regionSaid(answer)).toBe(
      `The outlines of that file have more than ${MAX_KML_CORNERS} corners in all. Import ` +
        'the regions in several files, or simplify the shapes.',
    );
  });
});

describe('/region import: pressing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows at once that it is working, then what it did, forum-less regions first', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [
      area('West', squareRing(40.0, -80.1, 40.1, -80.05)),
      area('South', SOUTH_RING),
      area('River Side', far(1)),
    ]);
    made.gateway.failing.set('createForum', new Error('Discord is down'));
    const pressed = await made.press(
      buttonId(answer, 'Import and create 1 channel, 1 category, 2 forums'),
    );
    expect(regionSaid(sent(pressed.update))).toBe(
      'Importing 3 areas… this message changes when it is done.',
    );
    const done = answerOf(pressed);
    expect(regionSaid(done)).toContain(
      '2 of them have no forum, so nothing can be reported there yet:',
    );
    const lines = listed(done, 'Imported');
    expect(lines[0]).toContain('**no forum**: something went wrong (see the log)');
    expect(lines[1]).toContain('**no forum**: something went wrong (see the log)');
    expect(lines[2]).toBe(`- <#${WEST_CHANNEL}> · new outline · 4 gyms`);
  });

  it('says that an outline stayed as it was, as the preview did', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('West', WEST_RING), area('South', SOUTH_RING)]);
    const done = answerOf(await made.press(buttonId(answer, 'Import and create 1 forum')));
    expect(listed(done, 'Imported')).toContain(`- <#${WEST_CHANNEL}> · outline unchanged · 8 gyms`);
  });

  it('says when the regions could not be loaded again', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
    made.directory.load = () => Promise.reject(new Error('connection lost'));
    const done = answerOf(await made.press(buttonId(answer, 'Import and create 1 forum')));
    expect(regionSaid(done)).toContain(
      'The outlines are stored, but I could not load them again: members see them after the ' +
        'next restart.',
    );
  });

  it('forgets a question after half an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
    vi.setSystemTime(Date.now() + 31 * 60_000);
    const pressed = await made.press(buttonId(answer, 'Import and create 1 forum'));
    expect(regionSaid(sent(pressed.update))).toBe('That has expired. Use the command again.');
    expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeUndefined();
  });

  it('forgets the oldest question when fifty more are waiting', async () => {
    const made = await regionCommandsWith();
    const first = await importing(made, [area('South', SOUTH_RING)]);
    for (let i = 0; i < 50; i++) await importing(made, [area('South', SOUTH_RING)]);
    const pressed = await made.press(buttonId(first.answer, 'Import and create 1 forum'));
    expect(regionSaid(sent(pressed.update))).toBe('That has expired. Use the command again.');
  });
});

describe('/region import: a big import', () => {
  it('creates at most 25 channels, and says to import the same file again for the rest', async () => {
    const made = await regionCommandsWith();
    const areas = Array.from({ length: MAX_NEW_CHANNELS + 2 }, (_unused, i) =>
      area(`Place ${String.fromCharCode(97 + (i % 26))}${i}`, far(i), 'Cat'),
    );
    const { answer } = await importing(made, areas);
    expect(regionSaid(answer)).toContain(
      `I create at most ${MAX_NEW_CHANNELS} channels in one import, so 2 areas wait (under ` +
        '"Left out"): once this import is done, import the same file again. What is imported ' +
        'already comes out unchanged.',
    );
    expect(listed(answer, 'Left out')).toEqual([
      `- Place z25: \`#place-z25\` waits for the next import`,
      `- Place a26: \`#place-a26\` waits for the next import`,
    ]);
    expect(buttonsOf(answer)[0]?.[0]).toBe(
      `Import and create ${MAX_NEW_CHANNELS} channels, 1 category, ${MAX_NEW_CHANNELS} forums`,
    );
  });

  it('logs what an import did, and logs it with the failure when the answer cannot be shown', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('South', SOUTH_RING), area('River', far(1))]);
    const pressed = fakeButton({ customId: importButton(answer), ...made.staff });
    // The interaction can no longer be answered (its quarter of an hour is over).
    pressed.editReply = vi.fn(() => Promise.reject(new Error('Unknown Webhook')));
    await made.router.handle(pressed as never);
    const south = made.regions.byChannel(SOUTH_CHANNEL);
    expect(south).toBeDefined();
    // The service's log, and the command's.
    const done = made.entries.filter((entry) => entry.msg === 'a region import is done');
    expect(done).toEqual([
      expect.objectContaining({
        level: 30,
        staff: made.staff.userId,
        imported: 2,
        regions: [south?.id, made.regions.byChannel(made.gateway.createdChannels[1] ?? '')?.id],
        newRegions: 2,
        channelsCreated: 1,
        categoriesCreated: 1,
        forumsCreated: 2,
        withoutForum: 0,
        notImported: {},
        reloaded: true,
      }),
    ]);
    const failed = made.logged.filter(
      (entry) => entry.msg === 'could not show the outcome of a region import',
    );
    expect(failed).toEqual([
      expect.objectContaining({ level: 50, imported: 2, err: expect.anything() as unknown }),
    ]);
    // Nothing of the file is in the log.
    expect(JSON.stringify([...made.entries, ...made.logged])).not.toContain('River');
  });
});

describe('/region import: full categories, pressed', () => {
  /** The category of a channel the fake server has. */
  const categoryOf = (made: Made, channelId: string) =>
    made.gateway.serverChannels(made.gateway.guildId)?.find((one) => one.id === channelId)
      ?.categoryId;
  const nameOf = (made: Made, channelId: string | null | undefined) =>
    made.gateway.serverChannels(made.gateway.guildId)?.find((one) => one.id === channelId)?.name;
  /** The id of the channel or category of this name the fake server has. */
  const channelNamed = (made: Made, name: string): string =>
    made.gateway.serverChannels(made.gateway.guildId)?.find((one) => one.name === name)?.id ?? '';

  it('imports the rest of a file into the next category once the first is full', async () => {
    const made = await regionCommandsWith();
    const areas = Array.from({ length: MAX_NEW_CHANNELS + 3 }, (_unused, i) =>
      area(`Place ${String.fromCharCode(97 + (i % 26))}${i}`, far(i), 'Pittsburgh staging'),
    );
    const first = await importing(made, areas);
    await made.press(importButton(first.answer));
    await made.settle();
    // The category keeps its members out: the one that continues it must too.
    const base = channelNamed(made, 'Pittsburgh staging');
    const keptOut = [
      { id: made.gateway.guildId, type: OverwriteType.Role, allow: '0', deny: '1024' },
    ];
    made.gateway.categoryOverwrites.set(base, keptOut);
    // 25 channels and their 25 forums fill the category: the next import goes on in another.
    const second = await importing(made, areas);
    expect(regionSaid(second.answer)).toContain(
      'The category `Pittsburgh staging` is full (Discord allows 50 channels in a category, ' +
        'and forums count), so 3 new channels go into `Pittsburgh staging 2`, a new category ' +
        'with the permissions of `Pittsburgh staging`, right after it.',
    );
    const done = answerOf(await made.press(importButton(second.answer)));
    await made.settle();
    expect(regionSaid(done).split('\n').slice(0, 3)).toEqual([
      'Imported 28 regions, and created 3 channels for them.',
      'Every line is in the attached file.',
      'Created 1 category: `Pittsburgh staging 2`.',
    ]);
    const created = made.gateway.createdChannels.slice(-3);
    expect(created.map((id) => nameOf(made, categoryOf(made, id)))).toEqual([
      'Pittsburgh staging 2',
      'Pittsburgh staging 2',
      'Pittsburgh staging 2',
    ]);
    expect(listed(done, 'Imported').slice(0, 3)).toEqual(
      created.map((id) => `- <#${id}> · new region · channel created · 0 gyms · forum created`),
    );
    // Made with the permissions of the category it continues, and placed right after it.
    const overflow = channelNamed(made, 'Pittsburgh staging 2');
    expect(made.gateway.categoryOverwrites.get(overflow)).toEqual(keptOut);
    expect(made.gateway.placedAfter.get(overflow)).toBe(base);
  });

  it('says so when the new category cannot be given the permissions of the one it continues', async () => {
    const made = await regionCommandsWith();
    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
    for (let i = 0; i < 50; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
    made.gateway.refuseCopies = true;
    const { answer } = await importing(made, [
      area('One More', far(1), 'Full'),
      area('Two More', far(2), 'Full'),
    ]);
    const done = answerOf(await made.press(importButton(answer)));
    const refused = (name: string, channel: string) =>
      `- ${name}: \`#${channel}\` could not be created: I may not make the new category ` +
      '`Full 2` with the permissions of `Full` (that takes Manage Channels and Manage Roles, ' +
      'and every permission those overwrites give). Give them to me, or make `Full 2` ' +
      'yourself with those permissions, and try again.';
    // The second is not asked of Discord again: the same refusal stands for it.
    expect(listed(done, 'Not imported')).toEqual([
      refused('One More', 'one-more'),
      refused('Two More', 'two-more'),
    ]);
    expect(made.gateway.calls.filter((call) => call.startsWith('createCategory'))).toHaveLength(1);
    expect(made.gateway.createdChannels).toEqual([]);
  });

  it('says that it may not create channels, not that it could not copy, without Manage Channels', async () => {
    const made = await regionCommandsWith();
    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
    for (let i = 0; i < 50; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
    const { answer } = await importing(made, [area('One More', far(1), 'Full')]);
    made.gateway.noCreating.add(made.gateway.guildId);
    const done = answerOf(await made.press(importButton(answer)));
    expect(listed(done, 'Not imported')).toEqual([
      '- One More: I may not create `#one-more` (I lack Manage Channels).',
    ]);
  });

  it('makes an overflow category deleted meanwhile again with the permissions of the full one', async () => {
    const made = await regionCommandsWith();
    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
    for (let i = 0; i < 50; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
    const keptOut = [
      { id: made.gateway.guildId, type: OverwriteType.Role, allow: '0', deny: '1024' },
    ];
    made.gateway.categoryOverwrites.set('k9', keptOut);
    made.gateway.addChannel('k10', 'Full 2', { kind: 'category' });
    const { answer } = await importing(made, [area('One More', far(1), 'Full')]);
    expect(listed(answer, 'Would be imported')[0]).toContain('in the category `Full 2`');
    // Somebody deletes Full 2 before Import: it is made again, as the full one's continuation.
    made.gateway.gone.add('k10');
    const done = answerOf(await made.press(importButton(answer)));
    expect(regionSaid(done)).toContain('Created 1 category: `Full 2`.');
    const again = channelNamed(made, 'Full 2');
    expect(again).not.toBe('k10');
    expect(made.gateway.categoryOverwrites.get(again)).toEqual(keptOut);
    expect(made.gateway.placedAfter.get(again)).toBe('k9');
  });

  it('makes no overflow category without the permissions of one that was deleted meanwhile', async () => {
    const made = await regionCommandsWith();
    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
    for (let i = 0; i < 50; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
    const { answer } = await importing(made, [area('One More', far(1), 'Full')]);
    made.gateway.gone.add('k9');
    const done = answerOf(await made.press(importButton(answer)));
    expect(listed(done, 'Not imported')).toEqual([
      '- One More: `#one-more` could not be created: the category that the new category ' +
        '`Full 2` was to continue, with its permissions, is gone. Import again.',
    ]);
    expect(made.gateway.createdChannels).toEqual([]);
  });

  it('writes the outline of a region whose forum has no room, and says why it has none', async () => {
    const made = await regionCommandsWith();
    const inTown = (made.gateway.serverChannels(made.gateway.guildId) ?? []).filter(
      (channel) => channel.categoryId === TOWN_CATEGORY,
    ).length;
    for (let i = inTown; i < 50; i++)
      made.gateway.addChannel(`town${i}`, `town-${i}`, { categoryId: TOWN_CATEGORY });
    const { answer } = await importing(made, [area('Unbounded', far(1))]);
    const done = answerOf(await made.press(importButton(answer)));
    await made.settle();
    expect(listed(done, 'Imported')).toEqual([
      `- <#${UNBOUNDED_CHANNEL}> · new outline · 0 gyms · **no forum**: the category \`Town\` ` +
        'is full (Discord allows 50 channels in a category, and forums count): move some ' +
        'channels out of it',
    ]);
    expect(made.regions.byChannel(UNBOUNDED_CHANNEL)?.bounds).toEqual(far(1));
  });

  it('creates the channel in the very category the preview named, of several of one name', async () => {
    const made = await regionCommandsWith();
    made.gateway.addChannel('k1', 'Twin', { kind: 'category' });
    for (let i = 0; i < 50; i++) made.gateway.addChannel(`a${i}`, `a-${i}`, { categoryId: 'k1' });
    made.gateway.addChannel('k2', 'twin', { kind: 'category' });
    const { answer } = await importing(made, [area('River Side', far(1), 'Twin')]);
    expect(listed(answer, 'Would be imported')[0]).toContain('in the category `twin`');
    const done = answerOf(await made.press(importButton(answer)));
    expect(regionSaid(done)).toContain('Imported 1 region, and created 1 channel for them.');
    expect(categoryOf(made, made.gateway.createdChannels.at(-1) ?? '')).toBe('k2');
  });

  it('says which category was full when Discord refused a channel after the preview', async () => {
    const made = await regionCommandsWith();
    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
    for (let i = 0; i < 46; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
    const { answer } = await importing(made, [
      area('One More', far(1), 'Full'),
      area('Two More', far(2), 'Full'),
    ]);
    // Somebody fills the category meanwhile, to the last place but one.
    for (let i = 46; i < 49; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
    const done = answerOf(await made.press(importButton(answer)));
    await made.settle();
    expect(listed(done, 'Not imported')).toEqual([
      '- Two More: `#two-more` could not be created: the category `Full` is full (Discord ' +
        'allows 50 channels in a category, and forums count). Move some channels out of it, ' +
        'and try again.',
    ]);
    // The first got its channel, the last place: its forum found none.
    expect(listed(done, 'Imported')).toEqual([
      expect.stringContaining(
        '**no forum**: the category `Full` is full (Discord allows 50 channels in a category, ' +
          'and forums count)',
      ) as string,
    ]);
  });

  it('says that the server is full when Discord refuses for its 500 channels', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('River Side', far(1), 'Town')]);
    for (let i = 0; i < 500; i++) made.gateway.addChannel(`many${i}`, `many-${i}`);
    const done = answerOf(await made.press(importButton(answer)));
    expect(listed(done, 'Not imported')).toEqual([
      '- River Side: `#river-side` could not be created: the server has as many channels as ' +
        'Discord allows (500, forums and categories count). Delete channels nobody uses, and ' +
        'try again.',
    ]);
  });
});

describe('/region import: the forum of a removed region', () => {
  it('says that a region imported again takes back the forum it kept, and does so', async () => {
    const made = await regionCommandsWith([
      { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: '900000000000001234' },
    ]);
    const forum = made.gateway.forums.get(WEST_FORUM);
    if (!forum) throw new Error('no forum of West');
    forum.name = 'west-meetups';
    forum.categoryId = TOWN_CATEGORY;
    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    await made.settle();
    const { answer } = await importing(made, [area('West', WEST_RING)]);
    expect(listed(answer, 'Would be imported')).toEqual([
      `- West → <#${WEST_CHANNEL}> · new region · 8 gyms · takes back its forum <#${WEST_FORUM}>`,
    ]);
    expect(regionSaid(answer)).not.toContain('forum**');
    const done = answerOf(await made.press(buttonId(answer, 'Import')));
    expect(listed(done, 'Imported')).toEqual([
      `- <#${WEST_CHANNEL}> · new region · 8 gyms · forum <#${WEST_FORUM}> taken back`,
    ]);
    expect(made.regions.byChannel(WEST_CHANNEL)?.forumChannelId).toBe(WEST_FORUM);
  });
});

describe('/region import: staff without Manage Channels', () => {
  it('creates no channel for them, says why, and offers what needs none', async () => {
    const made = await regionCommandsWith();
    const used = await made.use(
      'import',
      {},
      {
        permissions: 0n,
        resolved: {
          file: made.file(
            'regions.kml',
            writeKml([area('South', SOUTH_RING), area('River Side', far(1))]),
          ),
        },
      },
    );
    const answer = answerOf(used);
    expect(regionSaid(answer)).toContain(
      'Creating channels takes the Manage Channels permission, which you lack, so areas ' +
        'without a channel are left out: create their channels yourself, or ask somebody who ' +
        'may.',
    );
    expect(listed(answer, 'Left out')).toEqual([
      '- River Side: there is no channel `#river-side`, and you may not create one',
    ]);
    expect(buttonsOf(answer)[0]?.[0]).toBe('Import and create 1 forum');
  });

  it('creates nothing for them on a press either, and says who created what', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('River Side', far(1), 'River Towns')]);
    // Pressed by a moderator without the permission (the custom id is the same).
    const lacking = answerOf(await made.press(importButton(answer), { permissions: 0n }));
    expect(listed(lacking, 'Not imported')).toEqual([
      '- River Side: you may not create `#river-side` (that takes Manage Channels).',
    ]);
    expect(made.gateway.createdChannels).toEqual([]);
    // Who has it: the audit log of the server names them.
    const again = await importing(made, [area('River Side', far(1), 'River Towns')]);
    await made.press(importButton(again.answer));
    const [category, channel] = made.gateway.createdChannels;
    const reason = `/region import by ${made.staff.userId ?? ''}`;
    expect(made.gateway.auditReasons.get(category ?? '')).toBe(reason);
    expect(made.gateway.auditReasons.get(channel ?? '')).toBe(reason);
  });
});
