import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { textDisplays } from '../../../test/support/messages.js';
import { ALICE, PARTY_NOW } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { UserError } from '../../discord/errors.js';
import { postLink } from '../../render/notify-dm.js';
import {
  DISCORD_SPAWN_NAMES,
  reportSpawnAs,
  SpawnNotMade,
  type SpawnNames,
} from './spawn-report.js';
import { readSpawn } from './wild.js';

/** How the live map names a report (not at all) and a channel (by its name). */
const MAP_NAMES: SpawnNames = {
  report: () => undefined,
  channel: (channelId) => (channelId === WEST_CHANNEL ? '#west' : '#unknown'),
};

async function setup() {
  const made = await partyServiceWith();
  const { ctx } = createTestContext({
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    spawns: made.spawns,
    wants: made.wants,
  });
  const report = (names: SpawnNames, more: { pin?: boolean } = {}) =>
    reportSpawnAs(
      ctx,
      {
        guildId: made.gateway.guildId,
        regionChannelId: WEST_CHANNEL,
        read: readSpawn(ctx, null, 'dratini', ' by the fountain '),
        iv: 'perfect',
        reporter: { id: ALICE, name: 'Alice' },
        ...(more.pin
          ? { near: { kind: 'pin', lat: 40.02, lon: -80.02, near: null, linkName: null } }
          : {}),
      },
      names,
    );
  return { ...made, ctx, report };
}

describe('the spawn report /wild and the live map share', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the Pokémon and the details as /wild does: trimmed, and refused in its words', async () => {
    const { ctx } = await setup();
    const read = readSpawn(ctx, null, 'Dratini', '  by the fountain ');
    expect(read.entry.key).toBe('dratini');
    expect(read.details).toBe('by the fountain');
    expect(readSpawn(ctx, null, 'dratini', 'x'.repeat(300)).details).toHaveLength(200);
    expect(() => readSpawn(ctx, null, 'mewtwo', 'by the fountain')).toThrow(
      new UserError('**Mewtwo** does not appear in the wild.'),
    );
    expect(() => readSpawn(ctx, null, 'dratini', '   ')).toThrow(
      new UserError('Say in `details` where the Pokémon is: a street corner, a park, a gym.'),
    );
    expect(() => readSpawn(ctx, null, 'dratini', null)).toThrow(UserError);
  });

  it('posts the report and answers with the words of /wild, its link as the caller names it', async () => {
    const made = await setup();
    const words = await made.report(DISCORD_SPAWN_NAMES);
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(textDisplays(posted?.message)[1]).toBe('**Where**\nby the fountain');
    expect(words).toBe(
      'Reported: a wild Dratini with 100% IVs. ' +
        `${postLink(made.gateway.guildId, WEST_CHANNEL, posted?.id ?? '')}\n` +
        'The report is removed in 30 minutes.',
    );
    // The map links no report, and names a pin dropped on it as the member's.
    expect(await made.report(MAP_NAMES, { pin: true })).toBe(
      'Reported: a wild Dratini with 100% IVs at your pin.\nThe report is removed in 30 minutes.',
    );
  });

  it('says "costumed" where an event on lists the Pokémon costumed (plan 8R-4)', async () => {
    const made = await partyServiceWith([], {
      spawnCostumes: { sightingsAt: () => [{ key: 'dratini', dex: 147, costumed: true }] },
    });
    const { ctx } = createTestContext({ spawns: made.spawns, regions: made.regions });
    const words = await reportSpawnAs(
      ctx,
      {
        guildId: made.gateway.guildId,
        regionChannelId: WEST_CHANNEL,
        read: readSpawn(ctx, null, 'dratini', 'by the fountain'),
        reporter: { id: ALICE, name: 'Alice' },
      },
      MAP_NAMES,
    );
    expect(words).toBe('Reported: a wild costumed Dratini.\nThe report is removed in 30 minutes.');
  });

  it('refuses in the words of /wild what came of a report that was not made, a channel as the caller names it', async () => {
    const made = await setup();
    made.gateway.failing.set(
      'sendMessage',
      new DiscordAPIError(
        { code: RESTJSONErrorCodes.MissingPermissions, message: 'Missing Permissions' },
        RESTJSONErrorCodes.MissingPermissions,
        403,
        'POST',
        '/x',
        {},
      ),
    );
    // Each is told apart by its kind, so that the map can answer each as it should; each is a
    // `UserError`, which /wild answers as any.
    await expect(made.report(MAP_NAMES)).rejects.toThrow(
      new SpawnNotMade(
        'I am not allowed to post in #west, so the report was not made. Tell a moderator.',
        'refused',
      ),
    );
    await expect(made.report(DISCORD_SPAWN_NAMES)).rejects.toThrow(
      new SpawnNotMade(
        `I am not allowed to post in <#${WEST_CHANNEL}>, so the report was not made. Tell a moderator.`,
        'refused',
      ),
    );
    made.gateway.failing.delete('sendMessage');
    made.gateway.gone.add(WEST_CHANNEL);
    await expect(made.report(MAP_NAMES)).rejects.toThrow(
      new SpawnNotMade(
        'The channel of this region is gone, so I cannot post the report. Tell a moderator.',
        'no-channel',
      ),
    );
    made.gateway.gone.delete(WEST_CHANNEL);
    await made.spawns.flush();
    await expect(made.report(MAP_NAMES)).rejects.toThrow(
      new SpawnNotMade(
        'I am restarting just now, so the report was not made. Report it again in a minute.',
        'closed',
      ),
    );
    await expect(made.report(MAP_NAMES)).rejects.toBeInstanceOf(UserError);
  });
});
