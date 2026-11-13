import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { asV2, sent } from '../../../test/support/fake-interactions.js';
import { textDisplays } from '../../../test/support/messages.js';
import { ANSWERED_BELOW } from '../../discord/late-reply.js';
import { answerOf, buttonId, buttonsOf } from '../../../test/support/gym-commands.js';
import {
  EAST_CHANNEL,
  TEST_GUILD_ROW,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { testRaid } from '../../../test/support/parties.js';
import {
  SOUTH_CHANNEL,
  SOUTH_RING,
  squareRing,
  TOWN_CATEGORY,
  WEST_HALF_RING,
  WEST_RING,
} from '../../../test/support/region-admin.js';
import {
  MEMBER,
  MODERATOR,
  regionCommandsWith,
  regionListed,
  regionSaid,
} from '../../../test/support/region-commands.js';
import type { SentPayload } from '../../../test/support/fake-interactions.js';
import { writeKml } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { MAX_KML_BYTES } from './import.js';
import { Rehearsal } from '../../services/rehearsal.js';
import { PENDING_MINUTES, pendingRegions, REHEARSAL_CHANNELS } from './shared.js';
import { changeServers } from '../../../test/support/server-values.js';
import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';

type Made = Awaited<ReturnType<typeof regionCommandsWith>>;

const area = (name: string, outline: LatLon[], description: string | null = null) => ({
  name,
  description,
  outline,
});

/** Uses `/region import` with a file of these areas (or this text), and gives the answer. */
async function importing(
  made: Made,
  file: Parameters<typeof writeKml>[0] | string | Uint8Array,
  more: { channel?: string; name?: string; size?: number } = {},
) {
  const fileContent =
    typeof file === 'string' || file instanceof Uint8Array ? file : writeKml(file);
  const used = await made.use(
    'import',
    {},
    {
      resolved: {
        file: made.file(more.name ?? 'regions.kml', fileContent, more.size),
        ...(more.channel === undefined ? {} : { channel: { id: more.channel } }),
      },
    },
  );
  return { used, answer: answerOf(used) };
}

/** The custom id of the first button under an answer: Import, whatever it creates. */
const importButton = (answer: SentPayload): string => buttonsOf(answer)[0]?.[1] ?? '';

const listed = regionListed;

describe('/region import: the preview', () => {
  it('shows what would be imported and changes nothing until Import is pressed', async () => {
    const made = await regionCommandsWith([
      // A raid at the Bridge (gym 4), which the new outline of West leaves outside.
      { ...testRaid({ gymId: 4 }), forumChannelId: WEST_FORUM, forumPostId: '900000000000001234' },
    ]);
    const before = JSON.stringify(made.regions.rows);
    const { used, answer } = await importing(made, [
      area('West', WEST_HALF_RING),
      area('South', SOUTH_RING),
    ]);
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(regionSaid(answer).split('\n')).toEqual([
      'This file would give 1 new region and 1 new outline. Nothing is changed yet.',
      'Regions that are not in this file stay as they are.',
      'I would **create 1 forum**, one for each region that has none.',
      '3 gyms would then lie in no region of this server any more: no raid can be reported there.',
      '1 active raid is at a gym that would lie outside its region. It stays in its post.',
    ]);
    expect(listed(answer, 'Would be imported')).toEqual([
      `- West → <#${WEST_CHANNEL}> · new outline · 5 gyms (8 before) · 3 gyms would lie in no region of this server any more`,
      `- South → <#${SOUTH_CHANNEL}> · new region · 0 gyms · gets a forum`,
    ]);
    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
      'Import and create 1 forum',
      'Cancel',
    ]);
    expect(JSON.stringify(made.regions.rows)).toBe(before);
    expect(made.gateway.calls).toEqual([]);
    // The file was asked for with its limits.
    expect(made.attachments.asked).toEqual([
      { url: expect.any(String) as string, limits: { maxBytes: 1_000_000, timeoutMs: 10_000 } },
    ]);
  });

  it('names every channel and category it would create, and says so on the button', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [
      area('River Side', SOUTH_RING, 'River Towns'),
      area('Hill Top', squareRing(41, -81, 41.1, -80.9), 'river towns'),
      area('Old Town', squareRing(42, -81, 42.1, -80.9), 'Town'),
      area('Lonely', squareRing(43, -81, 43.1, -80.9)),
    ]);
    expect(regionSaid(answer).split('\n')).toEqual([
      'This file would give 4 new regions. Nothing is changed yet.',
      'Regions that are not in this file stay as they are.',
      'I would **create 4 channels**: `#river-side`, `#hill-top`, `#old-town`, `#lonely`. Check the ' +
        'names: a typo in the file makes a channel of that name.',
      'I would **create 2 categories**: `River Towns`, `Lonely`.',
      'I would **create 4 forums**, one for each region that has none.',
    ]);
    expect(listed(answer, 'Would be imported')).toEqual([
      '- River Side → **new channel** `#river-side` in the new category `River Towns` · 0 gyms · gets a forum',
      '- Hill Top → **new channel** `#hill-top` in the new category `River Towns` · 0 gyms · gets a forum',
      '- Old Town → **new channel** `#old-town` in the category `Town` · 0 gyms · gets a forum',
      '- Lonely → **new channel** `#lonely` in the new category `Lonely` · 0 gyms · gets a forum',
    ]);
    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
      'Import and create 4 channels, 2 categories, 4 forums',
      'Cancel',
    ]);
    expect(made.gateway.createdChannels).toEqual([]);
  });

  it('refuses in rehearsal mode a file that would create channels, and takes outlines alone', async () => {
    const rehearsal = new Rehearsal({ allowlist: [MODERATOR], regions: ['west'], staffRoles: [] });
    const made = await regionCommandsWith([], { rehearsal });
    const { answer } = await importing(made, [
      area('West', WEST_HALF_RING),
      area('River Side', squareRing(41, -81, 41.1, -80.9)),
    ]);
    expect(regionSaid(answer)).toBe(REHEARSAL_CHANNELS);
    expect(made.gateway.createdChannels).toEqual([]);
    const outlines = await importing(made, [area('West', WEST_HALF_RING)]);
    expect(buttonsOf(outlines.answer).map(([label]) => label)[1]).toBe('Cancel');
  });

  it('offers only what needs no creation where it may not create channels, and says why', async () => {
    const made = await regionCommandsWith();
    made.gateway.noCreating.add(made.gateway.guildId);
    const { answer } = await importing(made, [
      area('South', SOUTH_RING),
      area('River Side', SOUTH_RING),
    ]);
    expect(regionSaid(answer)).toContain('This file would give 1 new region.');
    expect(regionSaid(answer)).toContain(
      'I may not create channels in this server (I lack Manage Channels)',
    );
    expect(listed(answer, 'Left out')).toEqual([
      '- River Side: there is no channel `#river-side`, and I may not create one',
    ]);
    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
      'Import and create 1 forum',
      'Cancel',
    ]);
  });

  it('lists what is left out, each with its reason, and counts what is no area', async () => {
    const made = await regionCommandsWith();
    made.gateway.addChannel('c-a', 'twin');
    made.gateway.addChannel('c-b', 'twin');
    made.gateway.addChannel('v-1', 'lounge', { kind: 'other' });
    const polygon = (coordinates: string) =>
      `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates}</coordinates>` +
      '</LinearRing></outerBoundaryIs></Polygon>';
    const square = '-80.1,39.9 -80.1,40 -79.9,40 -79.9,39.9 -80.1,39.9';
    const placemark = (name: string, geometry: string) =>
      `<Placemark><name>${name}</name>${geometry}</Placemark>`;
    const file =
      '<?xml version="1.0"?><kml><Document>' +
      placemark('South', polygon(square)) +
      placemark('Twin', polygon(square)) +
      placemark('East', polygon(square)) +
      placemark('east', polygon(square)) +
      placemark('Lounge', polygon(square)) +
      placemark('!!!', polygon(square)) +
      placemark('Bow **tie**', polygon('0,0 1,1 0,1 1,0')) +
      placemark('Islands', `<MultiGeometry>${polygon(square)}${polygon(square)}</MultiGeometry>`) +
      placemark('A pin', '<Point><coordinates>-80,40</coordinates></Point>') +
      placemark('A path', '<LineString><coordinates>-80,40 -81,41</coordinates></LineString>') +
      '</Document></kml>';
    const { answer } = await importing(made, file);
    expect(listed(answer, 'Would be imported')).toEqual([
      `- South → <#${SOUTH_CHANNEL}> · new region · 0 gyms · gets a forum`,
    ]);
    expect(listed(answer, 'Left out')).toEqual([
      '- Twin: several channels are called `#twin`',
      '- East: several areas of the file stand for `#east`',
      '- east: several areas of the file stand for `#east`',
      '- Lounge: `#lounge` is not a text channel',
      '- !!!: its name gives no channel name',
      '- Bow \\*\\*tie\\*\\*: its outline crosses or touches itself',
      '- Islands: it has several areas, and a region is one',
    ]);
    expect(regionSaid(answer)).toContain(
      '2 placemarks of the file are no areas (points, lines) and are ignored.',
    );
  });

  it('shows no button when nothing can be imported', async () => {
    const made = await regionCommandsWith();
    const size = made.pending();
    const { answer } = await importing(made, [area('!!!', SOUTH_RING)]);
    expect(regionSaid(answer)).toBe('Nothing in this file can be imported.');
    expect(buttonsOf(answer)).toEqual([]);
    expect(made.pending()).toBe(size);
  });

  it('says that the holes of an area are ignored', async () => {
    const made = await regionCommandsWith();
    const file =
      '<kml><Placemark><name>South</name><Polygon><outerBoundaryIs><LinearRing><coordinates>' +
      '-80.1,39.9 -80.1,40 -79.9,40 -79.9,39.9</coordinates></LinearRing></outerBoundaryIs>' +
      '<innerBoundaryIs><LinearRing><coordinates>-80,39.94 -80,39.96 -79.98,39.96</coordinates>' +
      '</LinearRing></innerBoundaryIs></Polygon></Placemark></kml>';
    const { answer } = await importing(made, file);
    expect(listed(answer, 'Would be imported')).toEqual([
      `- South → <#${SOUTH_CHANNEL}> · new region · 0 gyms · its holes are ignored · gets a forum`,
    ]);
  });

  it('fits Discord’s limits with a file of fifty-six regions, most of them new', async () => {
    const made = await regionCommandsWith();
    const areas = Array.from({ length: 56 }, (_unused, i) =>
      area(
        `A rather long name of a region number ${i} ${'x'.repeat(60)}`,
        squareRing(41 + i * 0.01, -81, 41.005 + i * 0.01, -80.9),
        `A category with a long name, number ${i % 9} ${'y'.repeat(50)}`,
      ),
    );
    const { answer } = await importing(made, areas);
    // The fake gateway refuses what Discord would refuse.
    expectV2Sendable(asV2(answer));
    // One import creates 25 channels; the others wait for the next.
    expect(regionSaid(answer)).toContain('This file would give 25 new regions.');
    expect(regionSaid(answer)).toContain('I would **create 25 channels**');
    expect(regionSaid(answer)).toContain('so 31 areas wait');
    expect(regionSaid(answer)).toMatch(/…and \d+ more/u);
    expect(listed(answer, 'Would be imported').at(-1)).toMatch(/^…and \d+ more$/u);
    expect(buttonsOf(answer)[0]?.[0]).toBe(
      'Import and create 25 channels, 9 categories, 25 forums',
    );
  });
});

describe('/region import: what is no file of regions', () => {
  const refusal = async (file: string | Uint8Array, more: { size?: number } = {}) => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, file, more);
    expect(buttonsOf(answer)).toEqual([]);
    return regionSaid(answer);
  };

  it('says how to get KML when the file is a KMZ', async () => {
    const text = await refusal(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));
    expect(text).toBe(
      'That is a KMZ file (a zipped KML), and I read KML only. In Google My Maps choose ' +
        '"Export to KML/KMZ" and tick "Export as KML instead of KMZ".',
    );
  });

  it.each([
    ['bytes that are no text', new Uint8Array([0x3c, 0xff, 0xfe, 0x3e]), 'saved as UTF-8'],
    ['text that is no XML', 'name,lat,lon\nWest,40,-80', 'not well-formed XML'],
    ['XML that is no KML', '<gpx><trk/></gpx>', 'its outermost element must be `kml`'],
    ['KML without an area', '<kml><Document/></kml>', 'That file has no areas.'],
    ['a document type', '<!DOCTYPE kml [<!ENTITY a "b">]><kml/>', 'DOCTYPE'],
  ])('says what is wrong with %s', async (_what, file, said) => {
    expect(await refusal(file)).toContain(said);
  });

  it('refuses a file that says it is larger than a megabyte, before any download', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, '<kml/>', { size: MAX_KML_BYTES + 1 });
    expect(regionSaid(answer)).toContain(
      'That file is larger than 1 MB. Export only the layer with the regions.',
    );
    expect(made.attachments.asked).toEqual([]);
  });

  it('refuses a file that turns out larger than it said', async () => {
    const text = await refusal(`<kml>${' '.repeat(MAX_KML_BYTES)}</kml>`, { size: 10 });
    expect(text).toContain(
      'That file is larger than 1 MB. Export only the layer with the regions.',
    );
  });

  it('says so when the file cannot be downloaded', async () => {
    const made = await regionCommandsWith();
    made.attachments.failing = true;
    const { answer } = await importing(made, '<kml/>');
    expect(regionSaid(answer)).toBe(
      'I could not download that file from Discord. Try again in a moment.',
    );
  });
});

describe('/region import: for one channel', () => {
  it('gives the channel the one area of the file, whatever its name, and creates nothing', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('Whatever I called it', SOUTH_RING)], {
      channel: SOUTH_CHANNEL,
    });
    expect(listed(answer, 'Would be imported')).toEqual([
      `- Whatever I called it → <#${SOUTH_CHANNEL}> · new region · 0 gyms · gets a forum`,
    ]);
    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
      'Import and create 1 forum',
      'Cancel',
    ]);
    await made.press(importButton(answer));
    expect(made.regions.byChannel(SOUTH_CHANNEL)).toMatchObject({ bounds: SOUTH_RING });
    expect(made.gateway.createdChannels).toEqual([]);
  });

  it('takes the area named after the channel from a file with several', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(
      made,
      [area('East', SOUTH_RING), area('West', WEST_HALF_RING), area('Brand New', SOUTH_RING)],
      { channel: WEST_CHANNEL },
    );
    expect(listed(answer, 'Would be imported')).toEqual([
      `- West → <#${WEST_CHANNEL}> · new outline · 5 gyms (8 before) · 3 gyms would lie in no region of this server any more`,
    ]);
    expect(listed(answer, 'Left out')).toEqual([
      '- East: it stands for another channel',
      '- Brand New: it stands for another channel',
    ]);
    expect(regionSaid(answer)).toContain('(no channel is created)');
    expect(regionSaid(answer)).not.toContain('I would **create');
  });

  it('refuses a file of several areas of which none, or more than one, is the channel’s', async () => {
    const made = await regionCommandsWith();
    const none = await importing(made, [area('A', SOUTH_RING), area('B', SOUTH_RING)], {
      channel: SOUTH_CHANNEL,
    });
    expect(regionSaid(none.answer)).toBe(
      `The file has 2 areas, and none of them is named after <#${SOUTH_CHANNEL}>. Use a file ` +
        'with that area alone, or name exactly one area after the channel.',
    );
    const several = await importing(made, [area('South', SOUTH_RING), area('south', WEST_RING)], {
      channel: SOUTH_CHANNEL,
    });
    expect(regionSaid(several.answer)).toContain('several of them are named after');
    expect(buttonsOf(several.answer)).toEqual([]);
  });

  it('refuses a channel that cannot be a region', async () => {
    const made = await regionCommandsWith();
    for (const channel of [WEST_FORUM, TOWN_CATEGORY, '100000000000009999']) {
      const { answer } = await importing(made, [area('x', SOUTH_RING)], { channel });
      expect(regionSaid(answer)).toBe(
        'Only an ordinary text channel of this server can be a region: not a thread, a ' +
          'forum, a voice or an announcement channel.',
      );
    }
    expect(made.attachments.asked).toEqual([]);
  });
});

describe('/region import: Import and Cancel', () => {
  it('imports on Import: outlines, new channels, forums, and says what it did', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [
      area('West', WEST_HALF_RING),
      area('South', SOUTH_RING),
      area('River Side', squareRing(41, -81, 41.1, -80.9), 'River Towns'),
    ]);
    const pressed = await made.press(importButton(answer));
    expect(pressed.update).toHaveBeenCalled();
    const done = answerOf(pressed);
    const created = made.gateway
      .serverChannels(made.gateway.guildId)
      ?.find((channel) => channel.name === 'river-side');
    expect(regionSaid(done).split('\n')).toEqual([
      'Imported 3 regions, and created 1 channel for them.',
      'Created 1 category: `River Towns`.',
      'If members give themselves a role for a region, add the role of a new region with ' +
        '`/admin self-roles add`.',
    ]);
    expect(listed(done, 'Imported')).toEqual([
      `- <#${SOUTH_CHANNEL}> · new region · 0 gyms · forum created`,
      `- <#${created?.id ?? ''}> · new region · channel created · 0 gyms · forum created`,
      `- <#${WEST_CHANNEL}> · new outline · 5 gyms`,
    ]);
    expect(buttonsOf(done)).toEqual([]);
    expect(made.regions.byChannel(WEST_CHANNEL)?.bounds).toEqual(WEST_HALF_RING);
    expect(made.regions.byChannel(created?.id ?? '')?.forumChannelId).not.toBeNull();
    expect(made.directory.of(TEST_GUILD_ROW).isRegion(SOUTH_CHANNEL)).toBe(true);
  });

  it('says nothing of roles where members do not give themselves any', async () => {
    const made = await regionCommandsWith();
    changeServers(made.ctx, {
      features: { ...made.ctx.servers.of(FAKE_GUILD_ID).features, roles: false },
    });
    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
    const done = answerOf(await made.press(importButton(answer)));
    expect(regionSaid(done)).toBe('Imported 1 region.');
  });

  it('says what could not be done, and names a channel it created for nothing', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [
      area('South', SOUTH_RING),
      area('River Side', squareRing(41, -81, 41.1, -80.9)),
    ]);
    made.gateway.gone.add(SOUTH_CHANNEL);
    made.regions.failing = new Error('connection lost');
    const done = answerOf(await made.press(importButton(answer)));
    made.regions.failing = undefined;
    const [createdId] = made.gateway.createdChannels.slice(-1);
    expect(regionSaid(done)).toContain('Nothing was imported.');
    expect(listed(done, 'Not imported')).toEqual([
      '- South: its channel is gone, or is no text channel any more.',
      `- River Side: the outlines could not be written: try again in a moment. I had created ` +
        `<#${createdId ?? ''}> for it: it exists, but is no region. Import again, or delete it.`,
    ]);
  });

  it('says of a region whose forum could not be made what to do', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
    made.gateway.failing.set('createForum', new Error('Discord is down'));
    const done = answerOf(await made.press(importButton(answer)));
    expect(regionSaid(done)).toContain('run `/admin setup-forums`');
    expect(listed(done, 'Imported')).toEqual([
      `- <#${SOUTH_CHANNEL}> · new region · 0 gyms · **no forum**: something went wrong (see the log)`,
    ]);
  });

  it('imports nothing on Cancel', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
    const pressed = await made.press(buttonId(answer, 'Cancel'));
    expect(regionSaid(sent(pressed.update))).toBe('Nothing was imported.');
    expect(sent(pressed.update).flags).toBe(MessageFlags.IsComponentsV2);
    expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeUndefined();
  });

  it('shows the preview as one container: the sentences, the lists, the buttons inside', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
    const message = asV2(answer);
    expect(textDisplays(message)[0]?.split('\n')[0]).toBe('### Import regions');
    expect(textDisplays(message)[1]).toMatch(/^\*\*Would be imported\*\*\n- South/u);
    expect(buttonsOf(answer).map(([label]) => label)).toEqual([
      'Import and create 1 forum',
      'Cancel',
    ]);
    expectV2Sendable(message);
  });

  it('answers a press on a plain-text preview from before the plan below it', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
    const pressed = await made.press(importButton(answer), { v2Message: false });
    // Working, then closed with a line, in plain text; what was done follows privately.
    expect(sent(pressed.update)).toMatchObject({
      content: 'Importing 1 area… this message changes when it is done.',
    });
    expect(sent(pressed.editReply)).toMatchObject({ content: ANSWERED_BELOW, components: [] });
    const below = sent(pressed.followUp);
    expect(below.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    expect(regionSaid(below)).toMatch(/^Imported 1 region\./u);
    const cancelled = await made.press(
      buttonId((await importing(made, [area('North', SOUTH_RING)])).answer, 'Cancel'),
      { v2Message: false },
    );
    expect(sent(cancelled.update)).toEqual({
      content: 'Nothing was imported.',
      embeds: [],
      components: [],
      attachments: [],
    });
  });

  it('answers a question once: a second press is only acknowledged', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
    const id = importButton(answer);
    await made.press(id);
    const calls = made.gateway.calls.length;
    const again = await made.press(id);
    expect(again.deferUpdate).toHaveBeenCalled();
    expect(again.editReply).not.toHaveBeenCalled();
    expect(again.update).not.toHaveBeenCalled();
    expect(made.gateway.calls).toHaveLength(calls);
  });

  it('lets only the member who asked press, and only staff', async () => {
    const made = await regionCommandsWith();
    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
    const id = importButton(answer);
    const other = await made.press(id, { userId: '200000000000000007' });
    expect(other.reply).toHaveBeenCalledWith({
      content: 'That is somebody else’s question.',
      flags: MessageFlags.Ephemeral,
    });
    const member = await made.press(id, { userId: MEMBER, roleNames: [] });
    expect(member.reply).toHaveBeenCalledWith({
      content: 'Only admins, moderators and bot developers can do that.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeUndefined();
    // The question is still hers to answer.
    await made.press(id);
    expect(made.regions.byChannel(SOUTH_CHANNEL)).toBeDefined();
  });

  it('says that a question has expired that the bot no longer remembers', async () => {
    const made = await regionCommandsWith();
    const pressed = await made.press('region:0123456789abcdef:import');
    expect(regionSaid(sent(pressed.update))).toBe('That has expired. Use the command again.');
    expect(PENDING_MINUTES).toBe(30);
    expect(pendingRegions.size).toBeLessThanOrEqual(50);
  });

  it('keeps another server out of this server’s channels', async () => {
    const made = await regionCommandsWith();
    // East is a channel of the first server: for the second it is no channel at all.
    const used = await made.use(
      'import',
      {},
      {
        userId: '200000000000000007',
        guildId: '412345678901234568',
        resolved: {
          file: made.file('r.kml', writeKml([area('x', SOUTH_RING)])),
          channel: { id: EAST_CHANNEL },
        },
      },
    );
    expect(regionSaid(answerOf(used))).toContain('Only an ordinary text channel of this server');
  });
});
