import { describe, expect, it } from 'vitest';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadSettings } from './settings.js';
import {
  ADMINISTRATORS_ONLY,
  fileDefaults,
  mapMemberRole,
  moderatorsNamed,
  parseServerValues,
  serverValuesSchema,
  settingChanges,
} from './server-settings.js';

const settings = loadSettings(TEST_SETTINGS_PATH);
const BOT_LAB = '300000000000000001';
const MOD_LAB = '300000000000000002';

const problems = (raw: unknown): string[] => {
  const result = serverValuesSchema.safeParse(raw);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.')).sort();
};

describe("a server's values", () => {
  it('fills every key it lacks with the code defaults: no channel, role or zone', () => {
    expect(parseServerValues({})).toEqual({
      channels: {},
      categories: {},
      roles: {},
      features: {
        exGymChannel: false,
        remoteRaidChannel: false,
        notifications: true,
        roles: false,
      },
      distanceUnits: 'imperial',
      eventsForum: { horizonDays: 35, postDaysAhead: 14, onThisDay: 3 },
      flaggedWords: [],
      regionForumSuffix: '-board',
      blacklistWords: [],
      postNewGyms: false,
      passiveReading: true,
      autoAssignRole: true,
    });
  });

  it('takes channels, the category and roles by id, never by name', () => {
    expect(problems({ channels: { 'bot-lab': 'the-bot-lab' } })).toEqual(['channels.bot-lab']);
    expect(problems({ categories: { pvp: 'PVP CHAT' } })).toEqual(['categories.pvp']);
    expect(problems({ roles: { unown: 'unown', mapMember: '12' } })).toEqual([
      'roles.mapMember',
      'roles.unown',
    ]);
    expect(problems({ channels: { 'bot-lab': BOT_LAB }, roles: { unown: MOD_LAB } })).toEqual([]);
  });

  it("refuses a moderators' channel that is another of its channels but the moderators' bot lab", () => {
    expect(problems({ channels: { 'bot-lab': BOT_LAB, moderation: BOT_LAB } })).toEqual([
      'channels.moderation',
    ]);
    expect(problems({ channels: { 'mod-bot-lab': MOD_LAB, moderation: MOD_LAB } })).toEqual([]);
  });

  it('names the setting the moderators’ channel would be the same as, for the panel’s words (fix round 3, H2)', () => {
    const result = serverValuesSchema.safeParse({
      channels: { 'bot-lab': BOT_LAB, moderation: BOT_LAB },
    });
    const params = result.success
      ? []
      : result.error.issues.map((issue) => (issue.code === 'custom' ? issue.params : undefined));
    expect(params).toEqual([{ same: 'channels.bot-lab' }]);
  });

  it("checks the keys the file has as strictly as the file's", () => {
    expect(
      problems({
        regionForumSuffix: 'board',
        eventsForum: { horizonDays: 10, postDaysAhead: 11 },
        distanceUnits: 'leagues',
        timezone: 'Mars/Olympus',
        regionMapLink: 'ftp://maps.example.test',
        invite: 'https://example.test/invite',
        flaggedWords: [''],
        unknown: true,
      }),
    ).toEqual(
      [
        'regionForumSuffix',
        'eventsForum.postDaysAhead',
        'distanceUnits',
        'timezone',
        'regionMapLink',
        'invite',
        'flaggedWords.0',
        '',
      ].sort(),
    );
  });
});

describe('the settings the file named and the fill could not find', () => {
  const ROLE = '300000000000000031';

  it('are kept while unset, and forgotten once a value is chosen', () => {
    expect(
      parseServerValues({ unmatched: ['roles.mapMember', 'channels.moderation'] }).unmatched,
    ).toEqual(['roles.mapMember', 'channels.moderation']);
    expect(
      parseServerValues({
        unmatched: ['roles.mapMember', 'channels.moderation'],
        roles: { mapMember: ROLE },
      }).unmatched,
    ).toEqual(['channels.moderation']);
    expect(
      parseServerValues({ unmatched: ['channels.moderation'], channels: { moderation: MOD_LAB } }),
    ).not.toHaveProperty('unmatched');
  });

  it('are only the two whose absence would open what the file kept closed', () => {
    expect(problems({ unmatched: ['channels.bot-lab'] })).toEqual(['unmatched.0']);
  });

  it("keep the map for administrators, and the moderators' channel on but unreachable", () => {
    expect(mapMemberRole(parseServerValues({}))).toBeUndefined();
    expect(mapMemberRole(parseServerValues({ roles: { mapMember: ROLE } }))).toBe(ROLE);
    expect(mapMemberRole(parseServerValues({ unmatched: ['roles.mapMember'] }))).toBe(
      ADMINISTRATORS_ONLY,
    );
    expect(moderatorsNamed(parseServerValues({}))).toBe(false);
    expect(moderatorsNamed(parseServerValues({ channels: { moderation: MOD_LAB } }))).toBe(true);
    expect(moderatorsNamed(parseServerValues({ unmatched: ['channels.moderation'] }))).toBe(true);
  });
});

describe("the file's defaults of a server without a row", () => {
  it("are the file's server keys, with every channel, category and role unset", () => {
    expect(fileDefaults(settings)).toEqual({
      channels: {},
      categories: {},
      roles: {},
      features: settings.features,
      timezone: 'America/New_York',
      distanceUnits: 'metric',
      eventsForum: settings.eventsForum,
      flaggedWords: [],
      regionForumSuffix: '-meetups',
      blacklistWords: settings.blacklistWords,
      postNewGyms: true,
      regionMapLink: 'https://maps.example.test/regions',
      // On: used where the instance allows them.
      passiveReading: true,
      autoAssignRole: true,
    });
  });

  it("keep a server's invite of the file", () => {
    const server = '412345678901234567';
    const invite = 'https://discord.gg/pine';
    const withInvites = {
      ...settings,
      web: { ...TEST_WEB_SETTINGS, invites: { [server]: invite } },
    };
    expect(fileDefaults(withInvites, server).invite).toBe(invite);
    expect(fileDefaults(withInvites, '412345678901234568').invite).toBeUndefined();
  });
});

describe('the changes between two values of a server', () => {
  const before = parseServerValues({
    channels: { 'bot-lab': BOT_LAB, moderation: MOD_LAB },
    flaggedWords: ['garden'],
  });

  it('are none between equal values', () => {
    expect(settingChanges(before, parseServerValues(structuredClone(before)))).toEqual([]);
  });

  it('name each setting that changed by its key, a channel, a feature or a number by itself', () => {
    const after = parseServerValues({
      ...before,
      channels: { 'bot-lab': BOT_LAB, unown: '300000000000000003' },
      features: { ...before.features, roles: true },
      eventsForum: { ...before.eventsForum, onThisDay: 0 },
    });
    expect(settingChanges(before, after)).toEqual([
      { key: 'channels.unown', before: null, after: '300000000000000003' },
      { key: 'channels.moderation', before: MOD_LAB, after: null },
      { key: 'features.roles', before: false, after: true },
      { key: 'eventsForum.onThisDay', before: 3, after: 0 },
    ]);
  });

  it('take a list, a text or a link as one setting, unset as null', () => {
    const after = parseServerValues({
      ...before,
      flaggedWords: ['garden', 'condo'],
      regionMapLink: 'https://maps.example.test/pgh',
      distanceUnits: 'metric',
    });
    expect(settingChanges(before, after)).toEqual([
      { key: 'distanceUnits', before: 'imperial', after: 'metric' },
      { key: 'flaggedWords', before: ['garden'], after: ['garden', 'condo'] },
      { key: 'regionMapLink', before: null, after: 'https://maps.example.test/pgh' },
    ]);
  });
});

const TEST_WEB_SETTINGS = {
  port: 8080,
  host: '127.0.0.1',
  publicUrl: 'https://map.example.test',
  trustProxy: false,
  tiles: 'stadia' as const,
  memberRole: undefined,
};
