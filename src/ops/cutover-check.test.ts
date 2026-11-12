import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BOT_PERMISSIONS,
  FAKE_APP_ID,
  FAKE_BOT_ID,
  FakeDiscordApi,
  overwrite,
  type FakeApiChannel,
  type FakeApiGuild,
} from '../../test/support/fake-discord-api.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadSettings, type Settings } from '../config/settings.js';
import type { MigrationPlan } from '../db/migrator.js';
import type { CutoverRegion, CutoverSelfRole } from '../db/repositories/cutover-repository.js';
import type { LegacyCommandRoles } from '../db/repositories/role-authorization-repository.js';
import { GAME_ICON_NAMES } from '../domain/pogo/game-icons.js';
import {
  checkFailed,
  cutoverCheck,
  formatCheck,
  parseCheckArgs,
  type CheckLine,
  type CutoverStore,
} from './cutover-check.js';
import type { StoredServer } from '../db/repositories/server-settings-repository.js';

const bits = (...flags: bigint[]): string => String(flags.reduce((all, flag) => all | flag, 0n));

/** What the cutover check reads of the database, in memory. */
class MemoryCutoverStore implements CutoverStore {
  plan: MigrationPlan = {
    kind: 'takeover',
    pending: ['2026_10_09_000_baseline', '2026_10_10_001_raid_bosses'],
  };
  servers: string[] = [];
  regions: CutoverRegion[] = [];
  restrictions: LegacyCommandRoles[] = [];
  roles: CutoverSelfRole[] = [];
  /** The servers' settings of 2.1 (plan 19A-1); none before its first start. */
  stored: StoredServer[] = [];
  /** The sections that fail when read (a table the database lacks). */
  failing = new Set<'plan' | 'servers' | 'restrictions'>();

  migrationPlan(): Promise<MigrationPlan> {
    if (this.failing.has('plan'))
      return Promise.reject(new Error("Table 'kysely_migration' broke"));
    return Promise.resolve(this.plan);
  }
  selfRoles(): Promise<CutoverSelfRole[]> {
    return Promise.resolve(this.roles);
  }
  serverSettings(): Promise<StoredServer[]> {
    return Promise.resolve(this.stored);
  }
  guilds(): Promise<string[]> {
    if (this.failing.has('servers'))
      return Promise.reject(new Error("Table 'Guild' doesn't exist"));
    return Promise.resolve(this.servers);
  }
  regionRows(): Promise<CutoverRegion[]> {
    return Promise.resolve(this.regions);
  }
  legacyRestrictions(): Promise<LegacyCommandRoles[]> {
    if (this.failing.has('restrictions')) {
      return Promise.reject(new Error("Table 'CommandRoles' doesn't exist"));
    }
    return Promise.resolve(this.restrictions);
  }
}

/** The names the test settings give channels, categories and roles. */
const NAMED_CHANNELS = [
  'the-bot-lab',
  'mod-bot-only',
  'unown-sightings',
  'elite-gym-raids',
  'remote-raids',
  'rank-checker',
  'bot-updates',
  'meetup-review',
];

interface Server {
  guild: FakeApiGuild;
  botRole: string;
  category: FakeApiChannel;
  north: FakeApiChannel;
  south: FakeApiChannel;
}

/** A server shaped like Pittsburgh's: two regions in a category, every named channel, the bot set up right. */
function server(api: FakeDiscordApi, store: MemoryCutoverStore): Server {
  const guild = api.addGuild('Pittsburgh');
  const everyone = guild.roles[0];
  if (everyone) everyone.permissions = bits(P.ViewChannel, P.SendMessages);
  const botRole = api.addRole(guild, 'Professor Pine', ...BOT_PERMISSIONS);
  guild.members.set(FAKE_BOT_ID, [botRole]);
  const category = api.addChannel(guild, 'EAST', { type: ChannelType.GuildCategory });
  const north = api.addChannel(guild, 'north', { parentId: category.id });
  const south = api.addChannel(guild, 'south', { parentId: category.id });
  for (const name of NAMED_CHANNELS) api.addChannel(guild, name);
  // The moderators' channel of meetup safety is seen by staff (and the bot) alone.
  const review = guild.channels.find((one) => one.name === 'meetup-review');
  if (review) {
    review.overwrites = [
      overwrite(guild.id, [], [P.ViewChannel]),
      overwrite(botRole, [P.ViewChannel]),
    ];
  }
  api.addChannel(guild, 'PVP CHAT AND TOURNAMENTS', { type: ChannelType.GuildCategory });
  api.addRole(guild, 'unown');
  api.emoji = [...GAME_ICON_NAMES];
  store.servers = [guild.id];
  store.regions = [
    { guild: guild.id, channelId: north.id, forumChannelId: null, summaryMessageId: null },
    { guild: guild.id, channelId: south.id, forumChannelId: null, summaryMessageId: null },
  ];
  return { guild, botRole, category, north, south };
}

describe('cutoverCheck', () => {
  let api: FakeDiscordApi;
  let store: MemoryCutoverStore;
  let settings: Settings;
  let shape: Server;

  beforeEach(() => {
    api = new FakeDiscordApi();
    store = new MemoryCutoverStore();
    // The test settings have no moderators' channel: a server set up right has one.
    const loaded = loadSettings(TEST_SETTINGS_PATH);
    settings = { ...loaded, channels: { ...loaded.channels, moderation: 'meetup-review' } };
    shape = server(api, store);
  });

  const check = () => cutoverCheck({ store, discord: api, appId: FAKE_APP_ID, settings });
  const line = (lines: CheckLine[], what: CheckLine['what']) => {
    const found = lines.filter((one) => one.what === what);
    if (found.length !== 1) throw new Error(`${found.length} lines of ${what}`);
    return found[0] as CheckLine;
  };

  it('passes a server set up right, apart from the forums still to make, and only reads', async () => {
    const lines = await check();
    expect(lines.filter((one) => one.status !== 'pass').map((one) => one.what)).toEqual(['forums']);
    expect(checkFailed(lines)).toBe(false);
    expect(api.onlyRead()).toBe(true);
    expect(line(lines, 'database').text).toBe(
      'database: a legacy Professor Pine database, which the migrator takes over; 2 migrations will run',
    );
    expect(line(lines, 'server').text).toBe(
      'server Pittsburgh: the bot (Professor Pine) has the roles Professor Pine, and every permission it needs',
    );
    expect(lines.filter((one) => one.what === 'region').map((one) => one.text)).toEqual([
      'region #north: the bot has what it needs in the channel and in the category EAST',
      'region #south: the bot has what it needs in the channel and in the category EAST',
    ]);
  });

  // Off behind the tunnel every member is one address, so one rate limit for the whole server.
  describe('the web pages', () => {
    const web = (trustProxy: boolean) => ({
      port: 8080,
      host: '0.0.0.0',
      publicUrl: 'https://map.example.test',
      trustProxy,
      tiles: 'stadia' as const,
    });

    it('warns of a public address without trustProxy', async () => {
      settings = { ...settings, web: web(false) };
      expect(line(await check(), 'web')).toMatchObject({
        status: 'warn',
        text: expect.stringContaining('trustProxy') as string,
      });
    });

    it('passes with it, and says nothing without web pages', async () => {
      settings = { ...settings, web: web(true) };
      expect(line(await check(), 'web')).toMatchObject({ status: 'pass' });
      settings = { ...settings, web: undefined };
      expect((await check()).some((one) => one.what === 'web')).toBe(false);
    });
  });

  describe('the database', () => {
    it('fails a database the migrator would refuse, saying why', async () => {
      store.plan = { kind: 'refused', reason: 'The tables guild have lower-case names.' };
      const lines = await check();
      expect(line(lines, 'database')).toMatchObject({
        status: 'fail',
        text: 'database: the migrator would refuse it: The tables guild have lower-case names.',
      });
      expect(checkFailed(lines)).toBe(true);
    });

    it('warns of an empty database: a new install, so the dump was not restored', async () => {
      store.plan = { kind: 'new-install', pending: ['2026_10_09_000_baseline'] };
      expect(line(await check(), 'database').status).toBe('warn');
    });

    it('names the migrations a Pine database still lacks', async () => {
      store.plan = { kind: 'pine', pending: ['2026_10_16_014_gym_lookups'] };
      expect(line(await check(), 'database')).toMatchObject({
        status: 'pass',
        text: 'database: a Professor Pine database; 1 migration will run',
        detail: ['2026_10_16_014_gym_lookups'],
      });
    });
  });

  describe('the application', () => {
    it('fails when DISCORD_APP_ID is not the application of the token', async () => {
      api.application.id = '400823744760905730';
      expect(line(await check(), 'application')).toMatchObject({ status: 'fail' });
    });

    it('warns while anybody can add the bot to a server', async () => {
      expect((await check()).some((one) => one.what === 'public-bot')).toBe(false);
      api.application.bot_public = true;
      expect(line(await check(), 'public-bot')).toMatchObject({ status: 'warn' });
    });

    it('fails once when Discord cannot be read, and still checks the database', async () => {
      api.failWith = new Error('401: Unauthorized');
      const lines = await check();
      expect(lines.map((one) => [one.what, one.status])).toEqual([
        ['database', 'pass'],
        ['application', 'fail'],
        ['restrictions', 'pass'],
      ]);
      expect(line(lines, 'application').text).toBe(
        'application: Discord could not be read with DISCORD_TOKEN: 401: Unauthorized',
      );
    });

    it('fails once when Discord stops answering half-way, and still checks the legacy tables', async () => {
      api.refused.set('/users/@me/guilds', new Error('503: Service Unavailable'));
      const lines = await check();
      expect(line(lines, 'discord')).toMatchObject({
        status: 'fail',
        text: 'discord: the check stopped reading Discord: 503: Service Unavailable',
      });
      expect(lines.at(-1)?.what).toBe('restrictions');
      expect(checkFailed(lines)).toBe(true);
    });

    it('passes settings that ask for no privileged intent, whatever the application has', async () => {
      api.application.flags = 1 << 19;
      expect(line(await check(), 'intents')).toMatchObject({
        status: 'pass',
        text: 'intents: the settings ask for no privileged intent (the application has Message Content)',
      });
    });

    it('warns of settings that ask for a privileged intent the application lacks', async () => {
      settings = { ...settings, ocr: { ...settings.ocr, passive: true } };
      expect(line(await check(), 'intents')).toMatchObject({
        status: 'warn',
        text: expect.stringContaining('Message Content') as string,
      });
    });

    it('warns of game icons the application lacks as emoji', async () => {
      api.emoji = ['rock'];
      expect(line(await check(), 'emoji')).toMatchObject({
        status: 'warn',
        text: `emoji: ${GAME_ICON_NAMES.length - 1} of the game's icons are not the application's emoji yet: './pine emoji-upload --apply' uploads them`,
      });
    });
  });

  describe('what the database cannot give', () => {
    it('says each section it could not read as a failure, and goes on with the others', async () => {
      store.failing = new Set(['plan', 'servers', 'restrictions']);
      const lines = await check();
      expect(line(lines, 'database')).toMatchObject({
        status: 'fail',
        text: "database: it could not be read: Table 'kysely_migration' broke",
      });
      expect(line(lines, 'servers')).toMatchObject({
        status: 'fail',
        text: "servers: the servers and regions of the database could not be read: Table 'Guild' doesn't exist",
      });
      expect(line(lines, 'restrictions')).toMatchObject({ status: 'fail' });
      expect(line(lines, 'application').status).toBe('pass');
    });
  });

  // Plan 8V-1: the events forum, where the settings name one.
  describe('the events forum', () => {
    const named = () => {
      settings = { ...settings, channels: { ...settings.channels, events: 'events' } };
    };

    // Review V7 (ruling R4): found by its name as Discord stores it.
    it('finds a forum named with capitals and spaces as Discord stores it', async () => {
      settings = { ...settings, channels: { ...settings.channels, events: 'Game Events' } };
      api.addChannel(shape.guild, 'game-events', {
        type: ChannelType.GuildForum,
        overwrites: [overwrite(shape.guild.id, [P.SendMessagesInThreads])],
      });
      expect(line(await check(), 'events')).toMatchObject({ status: 'pass' });
    });

    // Branch review BR-7: members must be able to write in the event posts.
    it('warns where @everyone or the member role cannot write in the posts', async () => {
      named();
      api.addChannel(shape.guild, 'events', { type: ChannelType.GuildForum });
      expect(line(await check(), 'events')).toEqual({
        what: 'events',
        status: 'warn',
        text:
          'events: in Pittsburgh @everyone cannot write in the posts of #events: allow Send ' +
          'Messages in Posts there',
      });
      const member = api.addRole(shape.guild, 'Member');
      settings = {
        ...settings,
        web: {
          port: 8080,
          host: '127.0.0.1',
          publicUrl: 'https://map.example.test',
          trustProxy: false,
          tiles: 'stadia',
          memberRole: 'Member',
        },
      };
      const forum = shape.guild.channels.find((one) => one.name === 'events');
      if (forum) {
        forum.overwrites = [
          overwrite(shape.guild.id, [P.SendMessagesInThreads]),
          overwrite(member, [], [P.SendMessagesInThreads]),
        ];
      }
      expect(line(await check(), 'events')).toMatchObject({
        status: 'warn',
        text:
          'events: in Pittsburgh Member cannot write in the posts of #events: allow Send ' +
          'Messages in Posts there',
      });
    });

    // Re-review RR-4: a role that cannot see the forum is no role kept from writing in it.
    it('says nothing of @everyone where it cannot see the forum, and checks the member role', async () => {
      named();
      const member = api.addRole(shape.guild, 'Member');
      settings = {
        ...settings,
        web: {
          port: 8080,
          host: '127.0.0.1',
          publicUrl: 'https://map.example.test',
          trustProxy: false,
          tiles: 'stadia',
          memberRole: 'Member',
        },
      };
      const forum = api.addChannel(shape.guild, 'events', {
        type: ChannelType.GuildForum,
        overwrites: [
          overwrite(shape.guild.id, [], [P.ViewChannel]),
          overwrite(shape.botRole, [P.ViewChannel]),
          overwrite(member, [P.ViewChannel, P.SendMessagesInThreads]),
        ],
      });
      expect(line(await check(), 'events')).toMatchObject({ status: 'pass' });
      forum.overwrites = [
        overwrite(shape.guild.id, [], [P.ViewChannel]),
        overwrite(shape.botRole, [P.ViewChannel]),
        overwrite(member, [P.ViewChannel], [P.SendMessagesInThreads]),
      ];
      expect(line(await check(), 'events')).toMatchObject({
        status: 'warn',
        text:
          'events: in Pittsburgh Member cannot write in the posts of #events: allow Send ' +
          'Messages in Posts there',
      });
    });

    it('says nothing of it while the settings name none', async () => {
      expect((await check()).filter((one) => one.what === 'events')).toEqual([]);
    });

    it('warns of a named forum the server lacks: /admin setup-forums makes it', async () => {
      named();
      expect(line(await check(), 'events')).toEqual({
        what: 'events',
        status: 'warn',
        text: 'events: Pittsburgh has no forum #events: /admin setup-forums makes it',
      });
    });

    it('passes a forum the bot may post, manage and write in, and warns of what it lacks', async () => {
      named();
      // Members may write in the posts (BR-7).
      const forum = api.addChannel(shape.guild, 'events', {
        type: ChannelType.GuildForum,
        overwrites: [overwrite(shape.guild.id, [P.SendMessagesInThreads])],
      });
      expect(line(await check(), 'events')).toEqual({
        what: 'events',
        status: 'pass',
        text: 'events: in Pittsburgh the events are listed in #events',
      });
      forum.overwrites = [overwrite(shape.botRole, [], [P.ManageThreads, P.SendMessages])];
      expect(line(await check(), 'events')).toEqual({
        what: 'events',
        status: 'warn',
        text:
          'events: in Pittsburgh the bot lacks Create Posts (Send Messages), Manage Posts ' +
          '(Manage Threads) in #events: the listing and the event posts cannot be kept there',
      });
    });
  });

  // Plan 19A-1: after the first start of 2.1 each server has its row, by ids, whatever the file.
  describe("a server's row", () => {
    const idOf = (name: string) => shape.guild.channels.find((one) => one.name === name)?.id;
    const rowWith = (channels: Record<string, string | undefined>) => {
      store.stored = [
        {
          serverId: shape.guild.id,
          settings: { channels },
          setUpAt: 1,
          updatedAt: 1,
          updatedBy: null,
        },
      ];
    };

    it('reads the channels its row sets, by id, not the names of the file', async () => {
      rowWith({ 'bot-updates': idOf('bot-updates'), moderation: idOf('meetup-review') });
      settings = { ...settings, channels: { ...settings.channels, moderation: 'renamed' } };
      const lines = await check();
      expect(line(lines, 'names')).toMatchObject({
        status: 'pass',
        text: 'names: Pittsburgh has every channel, category and role its settings set',
      });
      expect(line(lines, 'moderation').text).toBe(
        'moderation: in Pittsburgh meetups that need approval go to #meetup-review',
      );
    });

    it('warns of what its row sets that the server no longer has', async () => {
      rowWith({ 'bot-lab': '512345678901234599', moderation: '512345678901234598' });
      const lines = await check();
      expect(line(lines, 'names')).toMatchObject({
        status: 'warn',
        text:
          'names: Pittsburgh no longer has the bot-lab channel, the moderation channel of its ' +
          'settings: set them again with /admin settings',
      });
      expect(line(lines, 'moderation').text).toBe(
        "moderation: the moderators' channel of Pittsburgh is gone: a meetup that needs " +
          'approval cannot be made there',
      );
    });
  });

  describe('meetup safety', () => {
    it("passes a moderators' channel the bot may post in", async () => {
      expect(line(await check(), 'moderation')).toEqual({
        what: 'moderation',
        status: 'pass',
        text: 'moderation: in Pittsburgh meetups that need approval go to #meetup-review',
      });
    });

    it('warns that meetup safety is off without the setting', async () => {
      const { moderation: _unset, ...channels } = settings.channels;
      settings = { ...settings, channels };
      expect(line(await check(), 'moderation')).toEqual({
        what: 'moderation',
        status: 'warn',
        text:
          "moderation: Pittsburgh has no moderators' channel set, so meetup safety is off " +
          'there: every meetup is posted at once, wherever it is',
      });
    });

    it("warns of a moderators' channel the server lacks, or where the bot may not post", async () => {
      settings = { ...settings, channels: { ...settings.channels, moderation: 'mods-only' } };
      expect(line(await check(), 'moderation')).toMatchObject({
        status: 'warn',
        text:
          'moderation: Pittsburgh has no channel #mods-only: a meetup that needs approval ' +
          'cannot be made there',
      });
      settings = { ...settings, channels: { ...settings.channels, moderation: 'meetup-review' } };
      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
      if (review) {
        review.overwrites = [
          overwrite(shape.guild.id, [], [P.ViewChannel]),
          overwrite(shape.botRole, [P.ViewChannel], [P.SendMessages, P.EmbedLinks]),
        ];
      }
      expect(line(await check(), 'moderation')).toMatchObject({
        status: 'warn',
        text:
          'moderation: in Pittsburgh the bot lacks Send Messages, Embed Links in #meetup-review: ' +
          'a meetup that needs approval cannot be made there',
      });
    });

    it("needs no more than to see, send and embed in the moderators' channel", async () => {
      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
      if (review) {
        review.overwrites = [
          overwrite(shape.guild.id, [], [P.ViewChannel]),
          overwrite(shape.botRole, [P.ViewChannel], [P.AttachFiles]),
        ];
      }
      expect(line(await check(), 'moderation')).toMatchObject({ status: 'pass' });
    });

    it('warns where the bot could not delete a reported message or post, with the channel set', async () => {
      expect(line(await check(), 'reports')).toEqual({
        what: 'reports',
        status: 'pass',
        text: 'reports: in Pittsburgh the bot may delete reported messages and posts in every region',
      });
      shape.north.overwrites = [overwrite(shape.botRole, [], [P.ManageMessages])];
      expect(line(await check(), 'reports')).toEqual({
        what: 'reports',
        status: 'warn',
        text:
          'reports: in Pittsburgh the bot lacks Manage Messages in #north: the moderators delete ' +
          'reported messages and posts there themselves',
      });
      const { moderation: _unset, ...channels } = settings.channels;
      settings = { ...settings, channels };
      expect((await check()).filter((one) => one.what === 'reports')).toEqual([]);
    });

    it("takes a text channel alone as the moderators' channel", async () => {
      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
      if (review) review.type = ChannelType.GuildAnnouncement;
      expect(line(await check(), 'moderation')).toMatchObject({
        status: 'warn',
        text:
          'moderation: Pittsburgh has no channel #meetup-review: a meetup that needs approval ' +
          'cannot be made there',
      });
    });

    it("warns of a moderators' channel everybody can see", async () => {
      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
      if (review) review.overwrites = [];
      expect(line(await check(), 'moderation')).toEqual({
        what: 'moderation',
        status: 'warn',
        text:
          'moderation: in Pittsburgh everyone can see #meetup-review: its posts name members ' +
          'and where they meet; make it staff-only',
      });
    });

    it("warns of a moderators' channel that roles of members who are not staff can see", async () => {
      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
      const trainers = api.addRole(shape.guild, 'Trainers');
      const mystic = api.addRole(shape.guild, 'Mystic');
      const moderators = api.addRole(shape.guild, 'Moderator');
      const managers = api.addRole(shape.guild, 'Server managers', P.ManageGuild);
      if (review) {
        review.overwrites = [
          overwrite(shape.guild.id, [], [P.ViewChannel]),
          overwrite(shape.botRole, [P.ViewChannel]),
          overwrite(trainers, [P.ViewChannel]),
          overwrite(mystic, [P.ViewChannel]),
          overwrite(moderators, [P.ViewChannel]),
          overwrite(managers, [P.ViewChannel]),
        ];
      }
      expect(line(await check(), 'moderation')).toEqual({
        what: 'moderation',
        status: 'warn',
        text:
          'moderation: in Pittsburgh the roles Trainers, Mystic can see #meetup-review and are ' +
          'no staff roles: its posts name members and where they meet; make it staff-only',
      });
      // Staff (by the role's name, or Manage Server) and the bot may see it.
      if (review)
        review.overwrites = review.overwrites.slice(0, 2).concat(review.overwrites.slice(4));
      expect(line(await check(), 'moderation')).toMatchObject({ status: 'pass' });
    });
  });

  describe("the moderators' channel and the staff roles", () => {
    it("warns of a staff role that cannot see the moderators' channel, by the bot's staff role names", async () => {
      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
      const admins = api.addRole(shape.guild, 'Admin');
      api.addRole(shape.guild, 'moderator');
      api.addRole(shape.guild, 'Bot Developer');
      if (review) review.overwrites = [...review.overwrites, overwrite(admins, [P.ViewChannel])];
      expect(line(await check(), 'moderation')).toEqual({
        what: 'moderation',
        status: 'warn',
        text:
          'moderation: in Pittsburgh the role moderator cannot see #meetup-review: the links of ' +
          '/places and of the reports there do not open for its members; let every staff role ' +
          'see it',
      });
    });

    it('says in one warning both that members can see it and that a staff role cannot', async () => {
      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
      const trainers = api.addRole(shape.guild, 'Trainers');
      api.addRole(shape.guild, 'Moderator');
      if (review) review.overwrites = [...review.overwrites, overwrite(trainers, [P.ViewChannel])];
      expect(line(await check(), 'moderation')).toEqual({
        what: 'moderation',
        status: 'warn',
        text:
          'moderation: in Pittsburgh the role Trainers can see #meetup-review and is no staff ' +
          'role: its posts name members and where they meet; make it staff-only. And the role ' +
          'Moderator cannot see #meetup-review: the links of /places and of the reports there ' +
          'do not open for its members; let every staff role see it',
      });
    });

    it('passes where every staff role sees it, by an overwrite or by Administrator', async () => {
      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
      const moderators = api.addRole(shape.guild, 'Moderator');
      api.addRole(shape.guild, 'Admin', P.Administrator);
      if (review)
        review.overwrites = [...review.overwrites, overwrite(moderators, [P.ViewChannel])];
      expect(line(await check(), 'moderation')).toMatchObject({ status: 'pass' });
    });
  });

  describe('the global commands', () => {
    it('warns in rehearsal mode of commands every member would see', async () => {
      api.globalCommands = ['raid', 'help'];
      expect((await check()).some((one) => one.what === 'commands')).toBe(false);
      settings = {
        ...settings,
        rehearsal: { allowlist: ['412345678901234501'], regions: ['north'], staffRoles: [] },
      };
      expect(line(await check(), 'commands')).toMatchObject({
        status: 'warn',
        text: 'commands: the application has 2 commands for every server (raid, help): every member sees them during the rehearsal; take them away before it',
      });
      api.globalCommands = [];
      expect(line(await check(), 'commands')).toMatchObject({
        status: 'pass',
        text: 'commands: the application has no commands for every server',
      });
      expect(api.onlyRead()).toBe(true);
    });

    it('warns when they cannot be read, and checks the rest', async () => {
      settings = {
        ...settings,
        rehearsal: { allowlist: ['412345678901234501'], regions: ['north'], staffRoles: [] },
      };
      api.refused.set(
        `/applications/${FAKE_APP_ID}/commands`,
        new Error('503: Service Unavailable'),
      );
      const lines = await check();
      expect(line(lines, 'commands')).toMatchObject({
        status: 'warn',
        text: 'commands: the global commands could not be read: 503: Service Unavailable',
      });
      expect(line(lines, 'server').status).toBe('pass');
      expect(line(lines, 'forums').status).toBe('warn');
      expect(lines.some((one) => one.what === 'discord')).toBe(false);
    });
  });

  describe('rehearsal mode', () => {
    it("fails a bot whose own roles lack Manage Roles, whatever a category's overwrite gives it", async () => {
      settings = {
        ...settings,
        rehearsal: { allowlist: ['412345678901234501'], regions: ['north'], staffRoles: [] },
      };
      const role = shape.guild.roles.find((one) => one.id === shape.botRole);
      if (role)
        role.permissions = bits(...BOT_PERMISSIONS.filter((flag) => flag !== P.ManageRoles));
      shape.category.overwrites = [overwrite(shape.botRole, [P.ManageRoles], [])];
      const servers = (await check()).filter((one) => one.what === 'server');
      expect(servers).toContainEqual({
        what: 'server',
        status: 'fail',
        text:
          "server Pittsburgh: in rehearsal mode the bot's own roles must give it Manage Roles: " +
          'a hidden forum is made with what the bot has in the server, and an overwrite of a ' +
          'category does not count',
      });
    });

    it('fails a bot whose own roles lack Add Reactions, which the testers get in a hidden forum', async () => {
      settings = {
        ...settings,
        rehearsal: { allowlist: ['412345678901234501'], regions: ['north'], staffRoles: [] },
      };
      const role = shape.guild.roles.find((one) => one.id === shape.botRole);
      if (role)
        role.permissions = bits(...BOT_PERMISSIONS.filter((flag) => flag !== P.AddReactions));
      const servers = (await check()).filter((one) => one.what === 'server');
      // One problem, one line: the warning of an optional permission gives way to the failure.
      expect(servers.map((one) => [one.status, one.text])).toEqual([
        [
          'fail',
          "server Pittsburgh: in rehearsal mode the bot's own roles must give it Add Reactions: " +
            'a hidden forum is made with what the bot has in the server, and an overwrite of a ' +
            'category does not count',
        ],
      ]);
    });
  });

  describe('the servers', () => {
    it('fails a server it cannot read, and goes on with the next one and the forums', async () => {
      const other = api.addGuild('Away');
      other.members.set(FAKE_BOT_ID, []);
      store.servers = [other.id, shape.guild.id];
      api.refused.set(`/guilds/${other.id}/channels`, new Error('503: Service Unavailable'));
      const lines = await check();
      expect(
        lines.filter((one) => one.what === 'server').map((one) => [one.status, one.text]),
      ).toEqual([
        ['fail', 'server Away: it could not be read: 503: Service Unavailable'],
        [
          'pass',
          'server Pittsburgh: the bot (Professor Pine) has the roles Professor Pine, and every permission it needs',
        ],
      ]);
      expect(line(lines, 'forums').status).toBe('warn');
      expect(lines.some((one) => one.what === 'discord')).toBe(false);
    });

    it('wants Manage Messages in a region channel, to take a read screenshot away', async () => {
      shape.north.overwrites = [overwrite(shape.botRole, [], [P.ManageMessages])];
      expect((await check()).find((one) => one.what === 'region')).toMatchObject({
        status: 'warn',
        text: 'region #north: the bot could use Manage Messages in the channel',
      });
    });

    it('no longer asks Pin Messages in a region channel: nothing is pinned there (plan 8R-9)', async () => {
      shape.north.overwrites = [overwrite(shape.botRole, [], [P.PinMessages])];
      expect((await check()).find((one) => one.what === 'region')?.status).toBe('pass');
    });

    it('names only what a missing View Channels or Send Messages leaves out', async () => {
      shape.north.overwrites = [overwrite(shape.guild.id, [], [P.ViewChannel])];
      expect((await check()).find((one) => one.what === 'region')?.text).toBe(
        'region #north: the bot lacks View Channels in the channel',
      );
      shape.north.overwrites = [overwrite(shape.guild.id, [], [P.SendMessages])];
      expect((await check()).find((one) => one.what === 'region')?.text).toBe(
        'region #north: the bot lacks Send Messages in the channel',
      );
    });

    it('warns of a channel the bot announces in where it may not post', async () => {
      const updates = shape.guild.channels.find((one) => one.name === 'bot-updates');
      if (updates) updates.overwrites = [overwrite(shape.guild.id, [], [P.SendMessages])];
      expect(line(await check(), 'announcements')).toMatchObject({
        status: 'warn',
        text: 'announcements: in Pittsburgh the bot lacks Send Messages in #bot-updates',
      });
    });

    it('passes where, of two channels by the name, the bot may post in one (as sends pick it)', async () => {
      const updates = shape.guild.channels.find((one) => one.name === 'bot-updates');
      if (updates) updates.overwrites = [overwrite(shape.guild.id, [], [P.ViewChannel])];
      api.addChannel(shape.guild, 'bot-updates');
      expect(line(await check(), 'announcements')).toMatchObject({ status: 'pass' });
    });

    it("warns of a self-assigned role above the bot's highest, which it cannot give", async () => {
      const high = api.addRole(shape.guild, 'Mystic');
      // Found by its name (a legacy row has no snowflake), and below the bot's role.
      const low = shape.guild.roles.find((one) => one.name === 'unown');
      if (low) low.position = 0;
      store.roles = [
        { guild: shape.guild.id, roleId: high, name: 'Mystic' },
        { guild: shape.guild.id, roleId: null, name: 'unown' },
      ];
      expect(line(await check(), 'roles')).toMatchObject({
        status: 'warn',
        text: "roles: in Pittsburgh the self-assigned role Mystic is above the bot's highest role (Professor Pine): the bot cannot give it",
      });
    });

    it('fails a server where the bot lacks a permission it needs, and warns of one it can do without', async () => {
      const role = shape.guild.roles.find((one) => one.id === shape.botRole);
      if (role)
        role.permissions = bits(...BOT_PERMISSIONS.filter((flag) => flag !== P.ManageThreads));
      const failed = line(await check(), 'server');
      expect(failed.status).toBe('fail');
      expect(failed.text).toContain('lacks Manage Threads');

      if (role)
        role.permissions = bits(...BOT_PERMISSIONS.filter((flag) => flag !== P.AddReactions));
      const warned = line(await check(), 'server');
      expect(warned.status).toBe('warn');
      expect(warned.text).toContain('could use Add Reactions');
    });

    it('fails a region whose category keeps the bot from making the forum', async () => {
      shape.category.overwrites = [overwrite(shape.botRole, [], [P.ManageChannels])];
      const regions = (await check()).filter((one) => one.what === 'region');
      expect(regions.map((one) => one.status)).toEqual(['fail', 'fail']);
      expect(regions[0]?.text).toBe(
        'region #north: the bot lacks Manage Channels in the category EAST',
      );
    });

    it('fails a region channel the bot may not post in', async () => {
      shape.north.overwrites = [overwrite(shape.guild.id, [], [P.SendMessages])];
      expect((await check()).find((one) => one.what === 'region')).toMatchObject({
        status: 'fail',
        text: 'region #north: the bot lacks Send Messages in the channel',
      });
    });

    it('warns of a region whose channel is gone', async () => {
      shape.guild.channels = shape.guild.channels.filter((one) => one.id !== shape.south.id);
      const regions = (await check()).filter((one) => one.what === 'region');
      expect(regions[1]).toMatchObject({ status: 'warn' });
      expect(regions[1]?.text).toContain(shape.south.id);
    });

    it('checks a forum a region has, and passes the forums once every region has one', async () => {
      const forum = api.addChannel(shape.guild, 'north-meetups', {
        type: ChannelType.GuildForum,
        parentId: shape.category.id,
        overwrites: [overwrite(shape.botRole, [], [P.ManageThreads])],
      });
      const other = api.addChannel(shape.guild, 'south-meetups', {
        type: ChannelType.GuildForum,
        parentId: shape.category.id,
      });
      store.regions = [
        {
          guild: shape.guild.id,
          channelId: shape.north.id,
          forumChannelId: forum.id,
          summaryMessageId: '900000000000000001',
        },
        {
          guild: shape.guild.id,
          channelId: shape.south.id,
          forumChannelId: other.id,
          summaryMessageId: '900000000000000002',
        },
      ];
      const lines = await check();
      expect(line(lines, 'forums')).toMatchObject({ status: 'pass' });
      expect(lines.find((one) => one.what === 'boards')).toBeUndefined();
      expect(lines.find((one) => one.what === 'region')).toMatchObject({
        status: 'fail',
        text: 'region #north: the bot lacks Manage Posts (Manage Threads) in the forum #north-meetups',
      });
      // In a forum Discord names it Manage Posts: the line names it so.
      expect(line(lines, 'reports').text).toContain(
        'Manage Posts (Manage Threads) in the forum #north-meetups',
      );
    });

    it('warns where the bot may not delete what members write in the board (plan 8R-9F, R3)', async () => {
      const forum = api.addChannel(shape.guild, 'north-board', {
        type: ChannelType.GuildForum,
        parentId: shape.category.id,
        overwrites: [overwrite(shape.botRole, [], [P.ManageMessages])],
      });
      store.regions = [
        {
          guild: shape.guild.id,
          channelId: shape.north.id,
          forumChannelId: forum.id,
          summaryMessageId: '900000000000000001',
        },
      ];
      expect((await check()).find((one) => one.what === 'region')).toMatchObject({
        status: 'warn',
        text: 'region #north: the bot could use Manage Messages in the forum #north-board',
      });
    });

    it('warns, from the database, of the regions with a forum but no board (plan 8R-9, P11)', async () => {
      store.regions = [
        {
          guild: shape.guild.id,
          channelId: shape.north.id,
          forumChannelId: '800000000000000001',
          summaryMessageId: null,
        },
        {
          guild: shape.guild.id,
          channelId: shape.south.id,
          forumChannelId: '800000000000000002',
          summaryMessageId: null,
        },
      ];
      expect(line(await check(), 'boards')).toMatchObject({
        status: 'warn',
        text:
          'boards: 2 of 2 regions with a forum have no board yet (#north, #south): ' +
          "'/admin setup-forums' makes it",
      });
    });

    it('warns of the regions without a forum, by name', async () => {
      expect(line(await check(), 'forums')).toMatchObject({
        status: 'warn',
        text: "forums: 2 of 2 regions have no forum yet (#north, #south): '/admin setup-forums' makes them",
      });
    });

    it('warns of a server the database has and the bot is not in', async () => {
      store.servers = [...store.servers, '412345678901234599'];
      expect(line(await check(), 'servers')).toMatchObject({ status: 'warn' });
    });

    it('fails when the bot is in none of the servers of the database: nothing was checked', async () => {
      store.servers = ['412345678901234599'];
      const lines = await check();
      expect(line(lines, 'servers')).toMatchObject({
        status: 'fail',
        text: 'servers: the bot is in none of the servers of the database (412345678901234599): none of them was checked',
      });
      expect(checkFailed(lines)).toBe(true);
    });

    it('fails a copy of production that names no server, or has no regions', async () => {
      for (const kind of ['takeover', 'pine'] as const) {
        store.plan = { kind, pending: [] };
        store.servers = [];
        store.regions = [];
        const lines = await check();
        expect(line(lines, 'servers')).toMatchObject({
          status: 'fail',
          text: 'servers: the database names no server: is it the right copy?',
        });
        expect(line(lines, 'forums')).toMatchObject({
          status: 'fail',
          text: 'forums: the database has no regions: is it the right copy?',
        });
      }
      store.servers = [shape.guild.id];
      expect(line(await check(), 'forums').status).toBe('fail');
      // A new install has none yet, as it should.
      store.plan = { kind: 'new-install', pending: [] };
      store.servers = [];
      expect(line(await check(), 'servers').status).toBe('warn');
      expect(line(await check(), 'forums').status).toBe('warn');
    });

    it('warns of the channels, categories and roles the settings name that the server lacks', async () => {
      shape.guild.channels = shape.guild.channels.filter((one) => one.name !== 'unown-sightings');
      shape.guild.roles = shape.guild.roles.filter((one) => one.name !== 'unown');
      expect(line(await check(), 'names')).toMatchObject({
        status: 'warn',
        text: 'names: Pittsburgh lacks what the settings name: channels.unown (#unown-sightings), roles.unown (unown)',
      });
    });

    it('reads role names as the bot does, and asks for no PvP channel, which nothing reads', async () => {
      const unown = shape.guild.roles.find((one) => one.name === 'unown');
      if (unown) unown.name = ' Unown ';
      shape.guild.channels = shape.guild.channels.filter((one) => one.name !== 'rank-checker');
      expect(line(await check(), 'names').status).toBe('pass');
    });

    it('does not ask for a channel whose feature is off', async () => {
      shape.guild.channels = shape.guild.channels.filter((one) => one.name !== 'remote-raids');
      settings = { ...settings, features: { ...settings.features, remoteRaidChannel: false } };
      expect(line(await check(), 'names').status).toBe('pass');
    });
  });

  describe('the legacy restrictions', () => {
    it('passes empty tables and warns of rows, listed as the export lists them', async () => {
      expect(line(await check(), 'restrictions')).toMatchObject({ status: 'pass' });
      store.restrictions = [
        {
          guild: shape.guild.id,
          command: 'raid',
          roleRequired: true,
          roleIds: ['512345678901234567'],
        },
      ];
      const warned = line(await check(), 'restrictions');
      expect(warned.status).toBe('warn');
      expect(warned.detail?.join('\n')).toContain(
        'raid: required, roles 512345678901234567 -> /raid',
      );
    });
  });

  describe('the legacy cleanup', () => {
    /** A legacy `parties` folder naming these channels (made-up ids), raids unless typed. */
    function partiesFolder(channels: readonly (string | { channelId: string; type: string })[]) {
      const root = mkdtempSync(path.join(tmpdir(), 'pine-parties-'));
      mkdirSync(path.join(root, 'active'));
      channels.forEach((channel, i) => {
        const value = typeof channel === 'string' ? { type: 'raid', channelId: channel } : channel;
        writeFileSync(path.join(root, 'active', `f${i}`), JSON.stringify({ key: `k${i}`, value }));
      });
      return root;
    }

    it('counts what the cleanup would delete, without deleting, only when given the folder', async () => {
      expect((await check()).some((one) => one.what === 'cleanup')).toBe(false);
      const named = api.addChannel(shape.guild, 'egg-5-the-pier', {
        parentId: shape.category.id,
        messages: ['412345678901234567'],
      });
      const meetup = api.addChannel(shape.guild, 'meetup-walk', {
        parentId: shape.category.id,
        messages: [FAKE_BOT_ID],
      });
      api.addChannel(shape.guild, 'egg-5-the-stacks', {
        parentId: shape.category.id,
        messages: [FAKE_BOT_ID],
      });
      const legacyParties = partiesFolder([
        named.id,
        { channelId: meetup.id, type: 'meet-up' },
        '512345678901234599',
      ]);
      const lines = await cutoverCheck({
        store,
        discord: api,
        appId: FAKE_APP_ID,
        settings,
        legacyParties,
      });
      expect(line(lines, 'cleanup')).toMatchObject({
        status: 'pass',
        text:
          'cleanup: Pittsburgh: 2 legacy party channels to delete with /admin cleanup-legacy ' +
          '(1 named by the legacy files, 1 found by name and first message); 1 legacy train, ' +
          'meetup or saved party stays as a plain channel; 1 channel the files name is gone',
      });
      expect(api.onlyRead()).toBe(true);
    });

    it('warns of what a person has to judge, and of a folder it cannot read', async () => {
      api.addChannel(shape.guild, 'train-loop', { parentId: shape.category.id, messages: [] });
      const lines = await cutoverCheck({
        store,
        discord: api,
        appId: FAKE_APP_ID,
        settings,
        legacyParties: partiesFolder([]),
      });
      expect(line(lines, 'cleanup')).toMatchObject({
        status: 'warn',
        detail: ['#train-loop in EAST: named like a legacy train channel, but it has no messages'],
      });
      const unreadable = await cutoverCheck({
        store,
        discord: api,
        appId: FAKE_APP_ID,
        settings,
        legacyParties: mkdtempSync(path.join(tmpdir(), 'pine-empty-')),
      });
      expect(line(unreadable, 'cleanup').status).toBe('warn');
      expect(line(unreadable, 'cleanup').text).toMatch(/has no folder active/);
    });
  });

  it('formats a line by its status, its detail indented', () => {
    expect(
      formatCheck([
        { what: 'database', status: 'pass', text: 'database: fine' },
        { what: 'forums', status: 'warn', text: 'forums: none', detail: ['north'] },
        { what: 'server', status: 'fail', text: 'server: no' },
      ]),
    ).toBe('PASS  database: fine\nWARN  forums: none\n        north\nFAIL  server: no\n');
  });
});

describe('parseCheckArgs', () => {
  it('takes no argument, or the legacy parties folder', () => {
    expect(parseCheckArgs([])).toEqual({});
    expect(parseCheckArgs(['--legacy-parties', '/legacy-parties'])).toEqual({
      legacyParties: '/legacy-parties',
    });
  });

  it('refuses a missing folder and anything else', () => {
    expect(parseCheckArgs(['--legacy-parties'])).toBeUndefined();
    expect(parseCheckArgs(['--legacy-parties', '--json'])).toBeUndefined();
    expect(parseCheckArgs(['--json'])).toBeUndefined();
    expect(parseCheckArgs(['--legacy-parties', 'a', 'b'])).toBeUndefined();
  });
});
