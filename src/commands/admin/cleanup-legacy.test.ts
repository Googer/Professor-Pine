import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_BOT_ID,
  FakeDiscordApi,
  type FakeApiChannel,
} from '../../../test/support/fake-discord-api.js';
import {
  asV2,
  FAKE_GUILD_ID,
  fakeButton,
  fakeChatInput,
  sent,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { buttonLabels, customIdsOf, textOf } from '../../../test/support/messages.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { InteractionRouter } from '../../discord/router.js';
import { LegacyCleanup } from '../../services/legacy-cleanup.js';
import { Rehearsal } from '../../services/rehearsal.js';
import { cleanupControls, CLEANUP_MINUTES, CLEANUP_PER_RUN } from './cleanup-legacy.js';
import { admin } from './index.js';

const STAFF = '700000000000000001';
const OTHER_STAFF = '700000000000000002';
const MEMBER = '412345678901234599';

/** A legacy `parties` folder whose `active/` holds these parties (ids and names made up). */
function partiesFolder(parties: readonly Record<string, unknown>[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pine-parties-'));
  mkdirSync(path.join(root, 'active'));
  parties.forEach((value, i) => {
    writeFileSync(path.join(root, 'active', `file${i}`), JSON.stringify({ key: `k${i}`, value }));
  });
  return root;
}

interface Shape {
  /** A legacy train's channel: it stays. */
  train: FakeApiChannel;
  /** A legacy raid's channel that a file names. */
  raid: FakeApiChannel;
  orphan: FakeApiChannel;
  odd: FakeApiChannel;
}

function setup(
  options: {
    rehearsal?: Rehearsal;
    partiesDir?: string | null;
    more?: number;
    category?: string;
  } = {},
) {
  const api = new FakeDiscordApi();
  const guild = api.addGuild('Pittsburgh', { id: FAKE_GUILD_ID });
  const east = api.addChannel(guild, options.category ?? 'EAST', {
    type: ChannelType.GuildCategory,
  });
  api.addChannel(guild, 'west', { id: WEST_CHANNEL, parentId: east.id, messages: [FAKE_BOT_ID] });
  const shape: Shape = {
    train: api.addChannel(guild, 'train-made-up-loop', { parentId: east.id, messages: [MEMBER] }),
    raid: api.addChannel(guild, 'boss-5-made-up-gym', { parentId: east.id, messages: [MEMBER] }),
    orphan: api.addChannel(guild, 'egg-5-the-stacks', {
      parentId: east.id,
      messages: [FAKE_BOT_ID],
    }),
    odd: api.addChannel(guild, 'meetup-picnic', { parentId: east.id, messages: [] }),
  };
  for (let i = 0; i < (options.more ?? 0); i++) {
    api.addChannel(guild, `expired-${i}-a-gym-with-a-rather-long-name-for-the-list`, {
      parentId: east.id,
      messages: [FAKE_BOT_ID],
    });
  }
  const { log, entries } = createTestLogger();
  const partiesDir =
    options.partiesDir === null
      ? undefined
      : (options.partiesDir ??
        partiesFolder([
          {
            type: 'raid train',
            channelId: shape.train.id,
            trainName: 'Made-up *loop*',
            creationTime: Date.UTC(2019, 5, 8),
            attendees: { [MEMBER]: { number: 1, status: 1 }, [STAFF]: { number: 2, status: 0 } },
          },
          { type: 'raid', channelId: shape.raid.id },
        ]));
  /** The pauses between two deletions, which pass at once. */
  const waits: number[] = [];
  const cleanup = new LegacyCleanup({
    rest: () => api,
    botId: () => FAKE_BOT_ID,
    partiesDir,
    settingsChannelNames: [],
    pauseMs: 1_000,
    wait: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    log,
  });
  const { ctx } = createTestContext({
    legacyCleanup: cleanup,
    ...(options.rehearsal ? { rehearsal: options.rehearsal } : {}),
  });
  const router = new InteractionRouter(ctx, [admin], [cleanupControls]);
  /** By staff who may manage the server's channels, unless `permissions` says what they may. */
  const ask = async (permissions = PermissionFlagsBits.ManageChannels) => {
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommand: 'cleanup-legacy',
      roleNames: ['Admin'],
      userId: STAFF,
      permissions,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const press = async (
    customId: string,
    userId = STAFF,
    permissions = PermissionFlagsBits.ManageChannels,
  ) => {
    const interaction = fakeButton({
      customId,
      userId,
      roleNames: ['Admin'],
      permissions,
      askedBy: STAFF,
      ephemeralMessage: true,
      v2Message: true,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { api, shape, ask, press, entries, waits };
}

/** The answer of the command as a message. */
const answerOf = (interaction: { editReply: Parameters<typeof sent>[0] }) =>
  asV2(sent(interaction.editReply));

describe('/admin cleanup-legacy', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists what it would delete and what it leaves to a person, and deletes nothing yet', async () => {
    const { api, shape, ask } = setup();
    const interaction = await ask();
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const answer = answerOf(interaction);
    const text = textOf(answer);
    expect(text).toContain('I read 2 legacy files.');
    expect(text).toContain('**To delete (2):**');
    expect(text).toContain(
      `- <#${shape.raid.id}> \`boss-5-made-up-gym\` in EAST: a legacy file names it`,
    );
    expect(text).toContain(
      `- <#${shape.orphan.id}> \`egg-5-the-stacks\` in EAST: named like a legacy raid channel, and its first message is the bot’s`,
    );
    expect(text).toContain('**Not deleted (1)');
    expect(text).toContain(
      `- <#${shape.odd.id}> \`meetup-picnic\` in EAST: named like a legacy meetup channel, but it has no messages`,
    );
    expect(buttonLabels(answer)).toEqual(['Delete these 2 channels', 'Cancel']);
    expect(api.onlyRead()).toBe(true);
  });

  it('leaves legacy trains, meetups and saved parties, with their name, age and sign-ups', async () => {
    const { api, shape, ask, press } = setup();
    const answer = answerOf(await ask());
    const text = textOf(answer);
    expect(text).toContain(
      '**Not deleted (1): legacy trains, meetups and saved parties, which stay as plain ' +
        'channels; delete by hand the ones that are dead:**\n' +
        `- <#${shape.train.id}> \`train-made-up-loop\` in EAST: a legacy train “Made-up \\*loop\\*”, ` +
        'made 2019-06-08, 2 signed up',
    );
    const [remove] = customIdsOf(answer);
    await press(remove ?? '');
    expect(api.deleted).not.toContain(shape.train.id);
  });

  it('deletes the listed channels when the one who asked confirms, and says what it did', async () => {
    const { api, shape, ask, press, entries } = setup();
    const [remove] = customIdsOf(answerOf(await ask()));
    const pressed = await press(remove ?? '');
    expect(sent(pressed.update)).toBeDefined();
    expect(api.deleted).toEqual([shape.raid.id, shape.orphan.id]);
    expect(textOf(asV2(sent(pressed.editReply)))).toBe('Deleted 2 legacy party channels.');
    expect(entries.filter((entry) => entry.msg === 'legacy channel deleted')).toHaveLength(2);
  });

  it('waits between two deletions, and shows how far it is every ten channels', async () => {
    const { api, ask, press, waits } = setup({ more: 25 });
    const [remove] = customIdsOf(answerOf(await ask()));
    const pressed = await press(remove ?? '');
    expect(api.deleted).toHaveLength(27);
    expect(waits).toEqual(Array.from({ length: 26 }, () => 1_000));
    const texts = pressed.editReply.mock.calls.map((call) => textOf(asV2(call[0] as never)));
    expect(texts).toEqual([
      'Deleting 27 channels, one at a time: 10 done so far.',
      'Deleting 27 channels, one at a time: 20 done so far.',
      'Deleted 27 legacy party channels.',
    ]);
  });

  it('leaves "Deleting…" in place when the button is pressed again meanwhile', async () => {
    const { ask, press } = setup();
    const [remove] = customIdsOf(answerOf(await ask()));
    await press(remove ?? '');
    const again = await press(remove ?? '');
    expect(again.deferUpdate).toHaveBeenCalled();
    expect(again.update).not.toHaveBeenCalled();
  });

  it('shows a category name as plain text', async () => {
    const { ask } = setup({ category: 'EAST **side**' });
    expect(textOf(answerOf(await ask()))).toContain('in EAST \\*\\*side\\*\\*:');
  });

  it('skips a channel deleted between the list and the press, and says so', async () => {
    const { api, shape, ask, press } = setup();
    const [remove] = customIdsOf(answerOf(await ask()));
    await api.delete(`/channels/${shape.orphan.id}`);
    const pressed = await press(remove ?? '');
    expect(textOf(asV2(sent(pressed.editReply)))).toBe(
      'Deleted 1 legacy party channel. 1 was gone already.',
    );
  });

  it('refuses the buttons to anybody but the one who asked', async () => {
    const { api, ask, press } = setup();
    const [remove] = customIdsOf(answerOf(await ask()));
    const pressed = await press(remove ?? '', OTHER_STAFF);
    expect(sent(pressed.reply).content).toBe('That is somebody else’s question.');
    expect(api.deleted).toEqual([]);
  });

  // The audit of 2026-11-10 (L-D3): the bot deleted channels for staff who could not delete one
  // by hand. As `/region remove`: what deleting by hand takes, read of the server.
  it('only lists for staff without Manage Channels, saying what deleting takes', async () => {
    const { api, ask } = setup();
    const answer = answerOf(await ask(PermissionFlagsBits.ManageMessages));
    expect(textOf(answer)).toContain('**To delete (2):**');
    expect(buttonLabels(answer)).toEqual([]);
    expect(textOf(answer)).toContain(
      'Deleting these channels takes the Manage Channels permission, which you lack: nothing can be deleted from here.',
    );
    expect(api.onlyRead()).toBe(true);
  });

  it('deletes nothing at the press of staff who lack Manage Channels by then, and says so', async () => {
    const { api, ask, press } = setup();
    const [remove] = customIdsOf(answerOf(await ask()));
    const pressed = await press(remove ?? '', STAFF, 0n);
    expect(sent(pressed.reply).content).toBe(
      'Deleting channels takes the Manage Channels permission, which you lack. Nothing was deleted.',
    );
    expect(api.deleted).toEqual([]);
    // The question stands: with the permission back, the same press deletes.
    await press(remove ?? '');
    expect(api.deleted).toHaveLength(2);
  });

  it('deletes nothing once its time is up, nor on Cancel', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { api, ask, press } = setup();
    const [remove] = customIdsOf(answerOf(await ask()));
    vi.setSystemTime(Date.now() + CLEANUP_MINUTES * 60_000 + 1);
    const late = await press(remove ?? '');
    expect(textOf(asV2(sent(late.update)))).toBe('That has expired. Use the command again.');

    const [, cancel] = customIdsOf(answerOf(await ask()));
    const cancelled = await press(cancel ?? '');
    expect(textOf(asV2(sent(cancelled.update)))).toBe('Nothing was deleted.');
    expect(api.deleted).toEqual([]);
  });

  it('lists only, in rehearsal mode', async () => {
    const rehearsal = new Rehearsal({ allowlist: [STAFF], regions: ['west'], staffRoles: [] });
    const { ask } = setup({ rehearsal });
    const answer = answerOf(await ask());
    expect(buttonLabels(answer)).toEqual([]);
    expect(textOf(answer)).toContain('Rehearsal mode: nothing is deleted');
  });

  it('lists the orphans alone where no legacy folder is mounted', async () => {
    const { shape, ask } = setup({ partiesDir: null });
    const text = textOf(answerOf(await ask()));
    expect(text).toContain('LEGACY_PARTIES_DIR is not set');
    expect(text).toContain('**To delete (1):**');
    // Named like a train, but a member wrote first: without its file it is left to a person.
    expect(text).toContain('**Not deleted (3)');
    expect(text).toContain(
      `<#${shape.train.id}> \`train-made-up-loop\` in EAST: named like a legacy train channel`,
    );
  });

  it('deletes no more in one run than it can report on within the press, and says to run again', async () => {
    const { api, ask, press } = setup({ more: CLEANUP_PER_RUN });
    const answer = answerOf(await ask());
    const all = CLEANUP_PER_RUN + 2;
    expect(buttonLabels(answer)).toEqual([`Delete ${CLEANUP_PER_RUN} of these ${all}`, 'Cancel']);
    expect(textOf(answer)).toContain(
      `This run deletes ${CLEANUP_PER_RUN} of them; run /admin cleanup-legacy again for the rest.`,
    );
    const [remove] = customIdsOf(answer);
    const pressed = await press(remove ?? '');
    expect(api.deleted).toHaveLength(CLEANUP_PER_RUN);
    expect(textOf(asV2(pressed.editReply.mock.calls.at(-1)?.[0] as never))).toBe(
      `Deleted ${CLEANUP_PER_RUN} legacy party channels. 2 are left: run /admin cleanup-legacy again for them.`,
    );
  });

  it('lists the channels it could not delete by whole lines, and counts the rest', async () => {
    const { api, ask, press } = setup({ more: 60, category: 'EAST \\ *SIDE*' });
    const [remove] = customIdsOf(answerOf(await ask()));
    api.failWith = new Error('Missing Permissions');
    const pressed = await press(remove ?? '');
    const text = textOf(asV2(pressed.editReply.mock.calls.at(-1)?.[0] as never));
    const lines = text.split('\n');
    expect(lines[0]).toBe('Deleted 0 legacy party channels.');
    expect(lines[1]).toBe('62 channels could not be deleted (see the log):');
    const listed = lines.slice(2, -1);
    expect(listed.length).toBeGreaterThan(0);
    for (const line of listed) {
      expect(line).toMatch(/^- <#\d+> `[^`]+` in EAST \\\\ \\\*SIDE\\\*: .+ \(.+\)$/u);
    }
    expect(lines.at(-1)).toBe(`…and ${62 - listed.length} more.`);
  });

  it('attaches the list as a file when it does not fit', async () => {
    const { ask } = setup({ more: 60 });
    const answer = answerOf(await ask());
    expect(textOf(answer)).toContain(
      '62 channels to delete, 1 not deleted (they look like party channels, but I am not ' +
        'sure), 1 legacy train, meetup or saved party left as a plain channel. The whole list ' +
        'is in the attached legacy-cleanup.txt.',
    );
    expect(answer.files).toEqual(['legacy-cleanup.txt']);
    expect(buttonLabels(answer)).toEqual(['Delete these 62 channels', 'Cancel']);
  });
});
