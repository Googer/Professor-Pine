import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { answerOf } from '../../../test/support/gym-commands.js';
import { asV2 } from '../../../test/support/fake-interactions.js';
import { galleryOf, textDisplays, textOf as textOfV2 } from '../../../test/support/messages.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { withOtherServer } from '../../../test/support/gym-admin.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { testRaid } from '../../../test/support/parties.js';
import {
  kmlArea,
  REGION_STAFF,
  SOUTH_CHANNEL,
  SOUTH_RING,
  WEST_RING,
} from '../../../test/support/region-admin.js';
import {
  attachedText,
  MEMBER,
  OTHER_SERVER,
  regionCommandsWith,
  regionSaid,
} from '../../../test/support/region-commands.js';
import { readKml } from '@pine/wayspot-core/kml';
import type { Region } from '../../db/repositories/region-repository.js';
import { bounds } from './bounds.js';
import { region } from './index.js';

const choices = (interaction: { respond: { mock: { calls: unknown[][] } } }) =>
  interaction.respond.mock.calls[0]?.[0] as { name: string; value: string }[];

const textOf = (interaction: Parameters<typeof answerOf>[0]): string =>
  regionSaid(answerOf(interaction));

/** Every text a command answered with, the follow-ups too, in order. */
function allTexts(interaction: Awaited<ReturnType<typeof regionCommandsWith>>['staff'] & object) {
  const fake = interaction as unknown as {
    editReply: { mock: { calls: [{ content?: string }][] } };
    followUp: { mock: { calls: [{ content?: string }][] } };
  };
  return [...fake.editReply.mock.calls, ...fake.followUp.mock.calls].map(
    ([payload]) => payload.content ?? '',
  );
}

describe('/region: who may use it', () => {
  it('is shown to staff only, tied to no channel, and has its subcommands', () => {
    const json = region.data.toJSON();
    expect(json.default_member_permissions).toBe('32');
    expect(region.guards).toHaveLength(1);
    // `edit` only where the web pages are on (edit.test.ts).
    expect([...region.subcommands.keys()]).toEqual(['import', 'edit', 'list', 'export', 'remove']);
  });

  it('refuses a member who is not staff, whatever Discord let through', async () => {
    const made = await regionCommandsWith();
    const used = await made.use('list', {}, { userId: MEMBER, roleNames: [] });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'Only admins, moderators and bot developers can do that.',
      flags: MessageFlags.Ephemeral,
    });
    const typed = await made.typing('export', 'w', { userId: MEMBER, roleNames: [] });
    expect(choices(typed)).toEqual([]);
  });
});

describe('/region: the region option', () => {
  it('offers the regions of this server by the names of their channels', async () => {
    const made = await regionCommandsWith();
    await withOtherServer(made);
    expect(choices(await made.typing('export', ''))).toEqual([
      { name: 'All regions', value: 'all' },
      { name: '#east', value: 'id:2' },
      { name: '#unbounded', value: 'id:3' },
      { name: '#west', value: 'id:1' },
    ]);
    expect(choices(await made.typing('export', 'ES'))).toEqual([{ name: '#west', value: 'id:1' }]);
    expect(choices(await made.typing('export', '#un'))).toEqual([
      { name: '#unbounded', value: 'id:3' },
    ]);
    // The other server is offered its own region only.
    made.gateway.addChannel('100000000000000004', 'north', { guildId: OTHER_SERVER.guildId ?? '' });
    expect(choices(await made.typing('export', '', OTHER_SERVER))).toEqual([
      { name: 'All regions', value: 'all' },
      { name: '#north', value: 'id:4' },
    ]);
  });

  it('offers a region whose channel is gone as a deleted channel, so that it can be picked', async () => {
    const made = await regionCommandsWith();
    made.gateway.gone.add(EAST_CHANNEL);
    expect(choices(await made.typing('export', 'deleted'))).toEqual([
      { name: `deleted channel ${EAST_CHANNEL}`, value: 'id:2' },
    ]);
  });

  it.each([
    ['a choice of the list', 'id:2'],
    ['a mention of its channel', `<#${EAST_CHANNEL}>`],
    ['the id of its channel', EAST_CHANNEL],
    ['the name of its channel', 'east'],
    ['the name with its sign, in any case', '#EAST'],
  ])('takes %s', async (_what, typed) => {
    const made = await regionCommandsWith();
    const used = await made.use('export', { region: typed });
    expect(textOf(used)).toBe(`The outline of <#${EAST_CHANNEL}>.`);
  });

  it('refuses what names no region of this server, and says where to look', async () => {
    const made = await regionCommandsWith();
    await withOtherServer(made);
    for (const typed of [
      'id:99',
      'id:4',
      '<#100000000000000004>',
      'nowhere',
      'eas',
      SOUTH_CHANNEL,
    ]) {
      const used = await made.use('export', { region: typed });
      expect(textOf(used)).toContain('is no region of this server');
      expect(textOf(used)).toContain('`/region list`');
    }
    // What is typed is shown as text, whatever it holds.
    const used = await made.use('export', { region: '**@everyone**' });
    expect(textOf(used)).toContain('"\\*\\*@');
    expect(textOf(used)).not.toContain('@everyone');
  });

  it('takes the region of the channel, of its forum or of a post in it when none is named', async () => {
    const made = await regionCommandsWith();
    expect(textOf(await made.use('export', {}, { channelId: EAST_CHANNEL }))).toBe(
      `The outline of <#${EAST_CHANNEL}>.`,
    );
    expect(textOf(await made.use('export', {}, { channelId: EAST_FORUM }))).toBe(
      `The outline of <#${EAST_CHANNEL}>.`,
    );
    const inPost = await made.use(
      'export',
      {},
      { channelId: '900000000000009999', thread: { parentId: WEST_FORUM } },
    );
    expect(textOf(inPost)).toBe(`The outline of <#${WEST_CHANNEL}>.`);
  });
});

describe('/region list', () => {
  it('lists every region with its gyms, its parties and what is wrong with it', async () => {
    const made = await regionCommandsWith([
      { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: '900000000000001234' },
    ]);
    await made.admin.setElite(2, true, REGION_STAFF.staffId);
    made.gateway.gone.add(EAST_FORUM);
    const used = await made.use('list');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(textOf(used).split('\n')).toEqual([
      '**3 regions**',
      `- <#${WEST_CHANNEL}> · 8 gyms (1 elite raid gym) · 1 active raid, max battle, train or meetup`,
      `- <#${EAST_CHANNEL}> · 3 gyms · **its forum is gone**`,
      `- <#${UNBOUNDED_CHANNEL}> · 0 gyms · **no outline, no forum yet**`,
      '`/admin setup-forums` gives 2 regions the forum they lack.',
      '1 gym lies in no region of any server.',
    ]);
  });

  it('names a region whose channel is gone by the id of the channel', async () => {
    const made = await regionCommandsWith();
    made.gateway.gone.add(WEST_CHANNEL);
    const used = await made.use('list');
    expect(textOf(used)).toContain(
      `- deleted channel ${WEST_CHANNEL} · 8 gyms · **its channel is gone**`,
    );
  });

  it('names the forums whose region is gone', async () => {
    const made = await regionCommandsWith([
      { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: '900000000000001234' },
    ]);
    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    await made.settle();
    const used = await made.use('list');
    expect(textOf(used)).toContain(
      `Forums whose region is gone: <#${WEST_FORUM}>. They are kept as history`,
    );
    expect(textOf(used)).toContain('**2 regions**');
  });

  it('says so when the server has no regions', async () => {
    const made = await regionCommandsWith();
    const used = await made.use('list', {}, OTHER_SERVER);
    expect(textOf(used)).toContain('This server has no regions yet.');
  });

  it('fits Discord’s limits with sixty regions', async () => {
    const made = await regionCommandsWith();
    for (let i = 0; i < 57; i++) {
      const channelId = `10000000000000${String(1000 + i)}`;
      made.gateway.addChannel(channelId, `a-rather-long-region-channel-name-number-${i}`);
      made.regions.rows.push({
        id: 100 + i,
        guildId: 1,
        channelId,
        description: null,
        bounds: null,
        forumChannelId: null,
        summaryMessageId: null,
      } satisfies Region);
    }
    await made.directory.load();
    const used = await made.use('list');
    const texts = allTexts(used as never);
    expect(texts.length).toBeGreaterThan(1);
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(2000);
    const lines = texts.join('\n').split('\n');
    expect(lines[0]).toBe('**60 regions**');
    expect(lines.filter((line) => line.startsWith('- '))).toHaveLength(60);
    // Every further message is for the staff member alone too.
    for (const [payload] of used.followUp.mock.calls) {
      expect(payload.flags).toBe(MessageFlags.Ephemeral);
    }
  });
});

describe('/region export', () => {
  it('attaches the outline of one region as a file that reads back to it', async () => {
    const made = await regionCommandsWith();
    const used = await made.use('export', { region: 'id:1' });
    const reading = readKml(attachedText(answerOf(used), 'west.kml'));
    expect(reading).toMatchObject({
      ok: true,
      areas: [{ name: 'west', description: 'Town', outline: WEST_RING, holes: false }],
    });
  });

  it('says of a region without an outline that there is nothing to export', async () => {
    const made = await regionCommandsWith();
    const used = await made.use('export', { region: 'id:3' });
    expect(textOf(used)).toBe(
      `<#${UNBOUNDED_CHANNEL}> has no outline yet, so there is nothing to export.`,
    );
    expect(answerOf(used).files ?? []).toEqual([]);
  });

  it('gives all regions of the server in one file outside a region, which imports again as it is', async () => {
    const made = await regionCommandsWith();
    const used = await made.use('export', {}, { channelId: SOUTH_CHANNEL });
    expect(textOf(used)).toBe(
      'The outlines of 2 regions of this server. 1 region without an outline or without a ' +
        'channel is left out (`/region list` shows which).',
    );
    const reading = readKml(attachedText(answerOf(used), 'regions.kml'));
    if (!reading.ok) throw new Error(reading.reason);
    expect(reading.areas.map((area) => [area.name, area.description])).toEqual([
      ['west', 'Town'],
      ['east', 'Town'],
    ]);
    const preview = made.regionAdmin.preview(REGION_STAFF, reading.areas);
    expect(preview.imports.map((one) => [one.regionId, one.gyms, one.gymsBefore])).toEqual([
      [1, 8, 8],
      [2, 3, 3],
    ]);
    expect(preview.leftOut).toEqual([]);
    expect(preview.newChannels).toEqual([]);
  });

  it('exports an outline that was imported, corner for corner', async () => {
    const made = await regionCommandsWith();
    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('South', SOUTH_RING)]);
    await made.regionAdmin.import(REGION_STAFF, preview.imports);
    const used = await made.use('export', { region: 'south' });
    const reading = readKml(attachedText(answerOf(used), 'south.kml'));
    expect(reading).toMatchObject({ ok: true, areas: [{ name: 'south', outline: SOUTH_RING }] });
  });

  it('says so when the server has nothing to export', async () => {
    const made = await regionCommandsWith();
    const used = await made.use('export', {}, OTHER_SERVER);
    expect(textOf(used)).toBe('This server has no regions yet.');
  });
});

describe('/bounds', () => {
  it('is a command for every member, in servers', () => {
    const json = bounds.data.toJSON();
    expect(json.default_member_permissions).toBeUndefined();
    expect(json.options ?? []).toEqual([]);
    expect(bounds.help.category).toBe('util');
    expect(bounds.throttle).toEqual({ uses: 5, perSeconds: 60 });
  });

  it('shows a member the area of the region they are in, for them alone', async () => {
    const made = await regionCommandsWith([], {
      maps: {
        enabled: true,
        gym: () => Promise.resolve(undefined),
        region: (asked) => Promise.resolve(`var/images/regions/${asked.id}-abc.png`),
        place: () => Promise.resolve(undefined),
        clear: () => Promise.resolve(0),
      },
    });
    const used = await made.run('bounds', { userId: MEMBER, roleNames: [] });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const answer = answerOf(used);
    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
    const message = asV2(answer);
    expect(textDisplays(message)).toEqual([
      `### The area of <#${WEST_CHANNEL}>\nThere are 8 gyms within this region.`,
    ]);
    expect(galleryOf(message)).toEqual(['attachment://1-abc.png']);
    expect(answer.files).toEqual(['var/images/regions/1-abc.png']);
    expectV2Sendable(message);
  });

  it('answers without a picture when there is none, or the picture fails', async () => {
    const made = await regionCommandsWith();
    const used = await made.run('bounds', { userId: MEMBER, roleNames: [], channelId: EAST_FORUM });
    expect(textDisplays(asV2(answerOf(used)))).toEqual([
      `### The area of <#${EAST_CHANNEL}>\nThere are 3 gyms within this region.`,
    ]);
    expect(answerOf(used).files).toBeUndefined();

    const failing = await regionCommandsWith([], {
      maps: {
        enabled: true,
        gym: () => Promise.resolve(undefined),
        region: () => Promise.reject(new Error('disk full')),
        place: () => Promise.resolve(undefined),
        clear: () => Promise.resolve(0),
      },
    });
    const again = await failing.run('bounds', { userId: MEMBER, roleNames: [] });
    expect(galleryOf(asV2(answerOf(again)))).toEqual([]);
  });

  it('works in a post of the region’s forum', async () => {
    const made = await regionCommandsWith();
    const used = await made.run('bounds', {
      userId: MEMBER,
      roleNames: [],
      channelId: '900000000000009999',
      thread: { parentId: WEST_FORUM },
    });
    expect(textOfV2(asV2(answerOf(used)))).toContain(`<#${WEST_CHANNEL}>`);
  });

  it('says where there is no region, and of a region without an outline that it has none', async () => {
    const made = await regionCommandsWith();
    const elsewhere = await made.run('bounds', {
      userId: MEMBER,
      roleNames: [],
      channelId: SOUTH_CHANNEL,
    });
    expect(textOf(elsewhere)).toBe(
      'This channel is not a region. Use /bounds in the channel of a region, in its forum or ' +
        'in a post there.',
    );
    const unbounded = await made.run('bounds', {
      userId: MEMBER,
      roleNames: [],
      channelId: UNBOUNDED_CHANNEL,
    });
    expect(textOf(unbounded)).toBe('This region has no outline yet.');
  });

  it('words the number of gyms as the legacy bot did', async () => {
    const { gymCountSentence } = await import('./bounds.js');
    expect(gymCountSentence(0)).toBe('There are currently no gyms within this region.');
    expect(gymCountSentence(1)).toBe('There is 1 gym within this region.');
    expect(gymCountSentence(12)).toBe('There are 12 gyms within this region.');
  });
});
