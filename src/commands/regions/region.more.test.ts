import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { answerOf } from '../../../test/support/gym-commands.js';
import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { SOUTH_CHANNEL } from '../../../test/support/region-admin.js';
import {
  attachedText,
  regionCommandsWith,
  regionSaid,
} from '../../../test/support/region-commands.js';
import { MAX_KML_AREAS, MAX_KML_CORNERS, readKml } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { MAX_OUTLINE_CORNERS } from '@pine/wayspot-core/outline';

const choices = (interaction: { respond: { mock: { calls: unknown[][] } } }) =>
  interaction.respond.mock.calls[0]?.[0] as { name: string; value: string }[];

describe('/region export: all regions, by name', () => {
  it('offers all regions as the first choice, and takes "all" typed', async () => {
    const made = await regionCommandsWith();
    expect(choices(await made.typing('export', ''))[0]).toEqual({
      name: 'All regions',
      value: 'all',
    });
    expect(choices(await made.typing('export', 'al'))[0]).toEqual({
      name: 'All regions',
      value: 'all',
    });
    expect(choices(await made.typing('export', 'west'))).toEqual([
      { name: '#west', value: 'id:1' },
    ]);
    // Of the other subcommands it is no choice.
    expect(choices(await made.typing('remove', ''))[0]?.value).not.toBe('all');
    // In the channel of a region, "all" still means all of them.
    for (const typed of ['all', 'ALL']) {
      const used = await made.use('export', { region: typed }, { channelId: WEST_CHANNEL });
      const reading = readKml(attachedText(answerOf(used), 'regions.kml'));
      expect(reading.ok && reading.areas.map((area) => area.name)).toEqual(['west', 'east']);
    }
  });

  it('says how to give the outline of a region whose channel is gone to a channel', async () => {
    const made = await regionCommandsWith();
    made.gateway.gone.add(EAST_CHANNEL);
    const used = await made.use('export', { region: 'id:2' });
    expect(regionSaid(answerOf(used))).toBe(
      `The outline of the region of the deleted channel ${EAST_CHANNEL}. Its channel is gone: ` +
        'to give the outline to another channel, use `/region import` with `channel:`.',
    );
  });
});

type FollowUp = { content?: string; files?: unknown[]; flags?: number };

/** A small square of its own for the `i`th region, away from the others. */
const SQUARE_AT = (i: number): LatLon[] => {
  const lat = 10 + Math.floor(i / 20) * 0.1;
  const lon = 10 + (i % 20) * 0.1;
  return [
    { lat, lon },
    { lat: lat + 0.05, lon },
    { lat: lat + 0.05, lon: lon + 0.05 },
    { lat, lon: lon + 0.05 },
    { lat, lon },
  ];
};

describe('/region export: more than one import takes', () => {
  /** A traced boundary of many corners, as `kml.limits.test.ts` draws one. */
  function traced(corners: number, lat: number): LatLon[] {
    const ring = Array.from({ length: corners }, (_unused, i) => {
      const angle = (2 * Math.PI * i) / corners;
      const radius = 0.2 + 0.01 * Math.sin(angle * 97);
      return { lat: lat + radius * Math.sin(angle), lon: -80 + radius * Math.cos(angle) };
    });
    return [...ring, ring[0] ?? { lat: 0, lon: 0 }];
  }

  /** Gives the server `count` more regions, each with a channel of its own. */
  function moreRegions(
    made: Awaited<ReturnType<typeof regionCommandsWith>>,
    count: number,
    outline: (i: number) => LatLon[],
  ): void {
    for (let i = 0; i < count; i++) {
      const channelId = `7000000000000${String(i).padStart(5, '0')}`;
      made.gateway.addChannel(channelId, `area-${i}`);
      made.regions.rows.push({
        id: 1000 + i,
        guildId: 1,
        channelId,
        description: null,
        bounds: outline(i),
        forumChannelId: null,
        summaryMessageId: null,
      });
    }
  }

  const filesOf = (payload: { files?: readonly unknown[] }) =>
    (payload.files ?? []).map((file) => (file as { name: string }).name);

  it('splits the regions into files that each import again, and says so', async () => {
    const made = await regionCommandsWith();
    moreRegions(made, MAX_KML_AREAS + 5, (i) => SQUARE_AT(i));
    const used = await made.use('export', {}, { channelId: SOUTH_CHANNEL });
    const answer = answerOf(used);
    expect(filesOf(answer)).toEqual(['regions.kml', 'regions-2.kml']);
    expect(regionSaid(answer)).toBe(
      `The outlines of ${MAX_KML_AREAS + 7} regions of this server, in 2 files: ` +
        `\`/region import\` takes at most ${MAX_KML_AREAS} areas and ${MAX_KML_CORNERS} ` +
        'corners from one file, so import them one after the other. 1 region without an ' +
        'outline or without a channel is left out (`/region list` shows which).',
    );
    const names = ['regions.kml', 'regions-2.kml'].flatMap((name) => {
      const reading = readKml(attachedText(answer, name));
      if (!reading.ok) throw new Error(reading.reason);
      return reading.areas.map((area) => area.name);
    });
    expect(names).toHaveLength(MAX_KML_AREAS + 7);
    expect(new Set(names).size).toBe(names.length);
  });

  it('sends more than ten files in follow-ups of ten', async () => {
    const made = await regionCommandsWith();
    // Four of the longest outlines fill a file: 41 of them and West and East make 11 files.
    moreRegions(made, 41, (i) => traced(MAX_OUTLINE_CORNERS, 30 + i));
    const used = await made.use('export', {}, { channelId: SOUTH_CHANNEL });
    const files = filesOf(answerOf(used));
    expect(files).toHaveLength(10);
    expect(files[9]).toBe('regions-10.kml');
    expect(regionSaid(answerOf(used))).toContain('in 11 files');
    const followUps = (used.followUp as unknown as { mock: { calls: [FollowUp][] } }).mock.calls;
    expect(followUps).toHaveLength(1);
    const [[more]] = followUps as [[FollowUp]];
    expect(filesOf(more)).toEqual(['regions-11.kml']);
    expect(more.content).toBe('File 11 of 11 of the export.');
    expect(more.flags).toBe(MessageFlags.Ephemeral);
  });
});

describe('/region list: what it counts', () => {
  it('points to /admin setup-forums only for a region whose channel exists', async () => {
    const made = await regionCommandsWith();
    // East's forum is gone, and so is its channel: setting up a forum cannot help it.
    made.gateway.gone.add(EAST_FORUM);
    made.gateway.gone.add(EAST_CHANNEL);
    made.regions.rows.splice(2, 1);
    const used = await made.use('list');
    expect(regionSaid(answerOf(used))).not.toContain('/admin setup-forums');
    // A region whose channel exists and that has no forum is helped by it.
    const other = await regionCommandsWith();
    expect(answerOf(await other.use('list')).content).toContain(
      '`/admin setup-forums` gives 1 region the forum it lacks.',
    );
  });
});

describe('/bounds elsewhere', () => {
  it('says what to do outside a region', async () => {
    const made = await regionCommandsWith();
    const used = await made.run('bounds', { channelId: SOUTH_CHANNEL });
    expect(regionSaid(answerOf(used))).toBe(
      'This channel is not a region. Use /bounds in the channel of a region, in its forum or ' +
        'in a post there.',
    );
  });
});
