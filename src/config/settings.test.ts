import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError } from './errors.js';
import {
  channelNamesOf,
  isOpenInstance,
  listedServers,
  loadSettings,
  RETIRED_SETTINGS,
  withoutRetiredSettings,
} from './settings.js';

const REPO_SETTINGS = 'data/settings.json';

function writeSettings(mutate: (s: Record<string, unknown>) => void): string {
  const settings = JSON.parse(readFileSync(REPO_SETTINGS, 'utf8')) as Record<string, unknown>;
  mutate(settings);
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'pine-settings-')), 'settings.json');
  writeFileSync(file, JSON.stringify(settings));
  return file;
}

describe('loadSettings', () => {
  it('accepts the committed data/settings.json', () => {
    const settings = loadSettings(REPO_SETTINGS);
    expect(settings.cleanupInterval).toBe(60000);
    expect(settings.ocr).toEqual({
      enabled: true,
      passive: false,
      debug: false,
      device: 'cpu',
      threads: 0,
      priority: 'low',
      queue: 10,
      timeoutSeconds: 60,
      modelsUrl: 'https://cdn.jsdelivr.net/npm/@gutenye/ocr-models@1.4.2/assets/',
      headIconUrl:
        'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Raids/ic_raid_small.png',
      reviewDays: 30,
      keepMegabytes: 4096,
      reviewPerDay: 50,
    });
    expect(settings.autoAssignRole).toBe(false);
    expect(settings.helpGroups).not.toContain('silph');
  });

  it('has no rehearsal unless the file sets one, and takes one with its members and regions', () => {
    expect(loadSettings(REPO_SETTINGS).rehearsal).toBeUndefined();
    const rehearsal = loadSettings(
      writeSettings((s) => {
        s.rehearsal = { allowlist: ['412345678901234567'], regions: ['squirrelbreeze'] };
      }),
    ).rehearsal;
    expect(rehearsal).toEqual({
      allowlist: ['412345678901234567'],
      regions: ['squirrelbreeze'],
      staffRoles: [],
    });
    for (const wrong of [
      { allowlist: [], regions: ['squirrelbreeze'] },
      { allowlist: ['matt'], regions: ['squirrelbreeze'] },
      { allowlist: ['412345678901234567'], regions: [] },
      // A channel's name as written, never as a mention.
      { allowlist: ['412345678901234567'], regions: ['#squirrelbreeze'] },
      { allowlist: ['412345678901234567'], regions: ['x'], everyone: true },
    ]) {
      expect(() =>
        loadSettings(
          writeSettings((s) => {
            s.rehearsal = wrong;
          }),
        ),
      ).toThrow(ConfigError);
    }
  });

  it('has no operators and no list of servers unless the file names them (plan 19B-1)', () => {
    const plain = loadSettings(REPO_SETTINGS);
    expect(plain.operators).toEqual([]);
    expect(plain.servers).toBeUndefined();
    expect(isOpenInstance(plain)).toBe(false);
    const listed = loadSettings(
      writeSettings((s) => {
        s.operators = ['412345678901234567'];
        s.servers = ['512345678901234567', '612345678901234567'];
      }),
    );
    expect(listed.operators).toEqual(['412345678901234567']);
    expect(listed.servers).toEqual(['512345678901234567', '612345678901234567']);
    expect(isOpenInstance(listed)).toBe(false);
    expect(listedServers(listed)).toEqual(['512345678901234567', '612345678901234567']);
    expect(listedServers(plain)).toBeUndefined();
    // An empty list is as none.
    expect(listedServers({ servers: [] })).toBeUndefined();
    expect(listedServers({ servers: 'open' })).toBeUndefined();
    const open = loadSettings(
      writeSettings((s) => {
        s.servers = 'open';
      }),
    );
    expect(open.servers).toBe('open');
    expect(isOpenInstance(open)).toBe(true);
    for (const [key, wrong] of [
      ['operators', ['matt']],
      ['operators', '412345678901234567'],
      ['servers', ['512345678901234567', 'pittsburgh']],
      ['servers', 'closed'],
      ['servers', 'OPEN'],
    ] as const) {
      expect(
        () =>
          loadSettings(
            writeSettings((s) => {
              s[key] = wrong;
            }),
          ),
        `${key}: ${JSON.stringify(wrong)}`,
      ).toThrow(ConfigError);
    }
  });

  it('caps first direct messages per server only beyond what the queue sends at all, unless set (plan 19B-5)', () => {
    expect(loadSettings(REPO_SETTINGS).dms).toEqual({
      firstContactsPerWindow: 6_000,
      firstContactWindowMinutes: 10,
    });
    const dms = (more: Record<string, unknown>) =>
      writeSettings((s) => {
        s.dms = more;
      });
    expect(loadSettings(dms({ firstContactsPerWindow: 200 })).dms).toEqual({
      firstContactsPerWindow: 200,
      firstContactWindowMinutes: 10,
    });
    for (const wrong of [
      { firstContactsPerWindow: 0 },
      { firstContactWindowMinutes: 0 },
      { firstContactWindowMinutes: 1.5 },
      { perServer: 3 },
    ]) {
      expect(() => loadSettings(dms(wrong))).toThrow(ConfigError);
    }
  });

  it('takes the reader settings it knows and refuses others', () => {
    const ocr = (more: Record<string, unknown>) =>
      writeSettings((s) => {
        s.ocr = { passive: false, debug: false, ...more };
      });
    const read = loadSettings(ocr({ device: 'directml', threads: 2, priority: 'normal' })).ocr;
    expect(read).toMatchObject({ device: 'directml', threads: 2, priority: 'normal' });
    // A server's share of the queue is the whole queue unless set (plan 19B-5): a Pine of one
    // server notices nothing; a public instance sets it.
    expect(read.queuePerServer).toBeUndefined();
    expect(loadSettings(ocr({ queuePerServer: 3 })).ocr.queuePerServer).toBe(3);
    for (const wrong of [
      { device: 'gpu' },
      { threads: -1 },
      { priority: 'idle' },
      { timeoutSeconds: 1 },
      { modelsUrl: 'http://models.example.test/' },
      { modelsUrl: 'https://models.example.test/assets' },
      { workers: 2 },
      { reviewDays: 0 },
      { keepMegabytes: 1 },
      { reviewPerDay: -1 },
      { queuePerServer: -1 },
      { enabled: 'yes' },
    ]) {
      expect(() => loadSettings(ocr(wrong))).toThrow(ConfigError);
    }
  });

  it('rejects a leftover legacy key and names it', () => {
    const file = writeSettings((s) => {
      s.commandPrefix = '!';
    });
    expect(() => loadSettings(file)).toThrow(ConfigError);
    expect(() => loadSettings(file)).toThrow(/commandPrefix/);
  });

  it('reads a blank or missing regionMapLink as unset, and refuses one that is no address', () => {
    expect(loadSettings(REPO_SETTINGS).regionMapLink).toBeUndefined();
    for (const blank of ['', '   ']) {
      const file = writeSettings((s) => {
        s.regionMapLink = blank;
      });
      expect(loadSettings(file).regionMapLink).toBeUndefined();
    }
    const set = writeSettings((s) => {
      s.regionMapLink = ' https://maps.example.test/regions ';
    });
    expect(loadSettings(set).regionMapLink).toBe('https://maps.example.test/regions');
    const wrong = writeSettings((s) => {
      s.regionMapLink = 'no address';
    });
    expect(() => loadSettings(wrong)).toThrow(/regionMapLink/);
  });

  it('names where the Wayfarer export tool is asked for, profpine.com unless set', () => {
    expect(loadSettings(REPO_SETTINGS).wayspotTool).toBe('https://profpine.com/userscript');
    const unset = writeSettings((s) => {
      delete s.wayspotTool;
    });
    expect(loadSettings(unset).wayspotTool).toBe('https://profpine.com/userscript');
    const own = writeSettings((s) => {
      s.wayspotTool = 'https://pine.example.test/userscript';
    });
    expect(loadSettings(own).wayspotTool).toBe('https://pine.example.test/userscript');
    for (const wrong of ['no address', 'ftp://pine.example.test/userscript']) {
      const file = writeSettings((s) => {
        s.wayspotTool = wrong;
      });
      expect(() => loadSettings(file)).toThrow(/wayspotTool/);
    }
  });

  it('takes a monthly budget for Google, 4,500 places, a reserve of 500 and 9,000 geocodes unless set', () => {
    const settings = loadSettings(REPO_SETTINGS);
    expect(settings.googleLookupsPerMonth).toBe(4_500);
    expect(settings.googleLookupsReserve).toBe(500);
    expect(settings.googleGeocodesPerMonth).toBe(9_000);
    expect(settings.googleGeocodesReserve).toBe(500);
    expect(settings.googleByHandPerMonth).toBe(500);
    const own = writeSettings((s) => {
      s.googleLookupsPerMonth = 1_000;
      s.googleLookupsReserve = 100;
      s.googleGeocodesPerMonth = 0;
      s.googleByHandPerMonth = 20;
    });
    expect(loadSettings(own)).toMatchObject({
      googleLookupsPerMonth: 1_000,
      googleLookupsReserve: 100,
      googleGeocodesPerMonth: 0,
      googleGeocodesReserve: 0,
      googleByHandPerMonth: 20,
    });
    // A budget of nothing, with nothing kept back: the line is stopped.
    const stopped = writeSettings((s) => {
      s.googleLookupsPerMonth = 0;
      s.googleLookupsReserve = 0;
    });
    expect(loadSettings(stopped).googleLookupsPerMonth).toBe(0);
    // The reserve must stay below the budget, and no budget is below nothing.
    const reserved = writeSettings((s) => {
      s.googleLookupsPerMonth = 500;
    });
    expect(() => loadSettings(reserved)).toThrow(/googleLookupsReserve/);
    const negative = writeSettings((s) => {
      s.googleGeocodesPerMonth = -1;
    });
    expect(() => loadSettings(negative)).toThrow(/googleGeocodesPerMonth/);
    // The geocodes kept back for gyms from Power Spots' addresses are within the month's.
    const dev = writeSettings((s) => {
      s.googleGeocodesPerMonth = 50;
      s.googleGeocodesReserve = 10;
    });
    expect(loadSettings(dev).googleGeocodesReserve).toBe(10);
    // Unset, it is 500 or the whole month where that is less: a month of 50 keeps all 50 for
    // gyms, so no Power Spot's address is looked up, and the bot starts.
    const small = writeSettings((s) => {
      s.googleGeocodesPerMonth = 50;
    });
    expect(loadSettings(small).googleGeocodesReserve).toBe(50);
    // Set above the month's geocodes, it is refused.
    const over = writeSettings((s) => {
      s.googleGeocodesPerMonth = 50;
      s.googleGeocodesReserve = 51;
    });
    expect(() => loadSettings(over)).toThrow(/googleGeocodesReserve/);
    // The daily limit before plan 8W-6 is gone: a file that still names it is refused.
    const old = writeSettings((s) => {
      s.googleLookupsPerDay = 100;
    });
    expect(() => loadSettings(old)).toThrow(/googleLookupsPerDay/);
  });

  it('words distances in imperial units unless the file says metric (task 7)', () => {
    expect(loadSettings(REPO_SETTINGS).distanceUnits).toBe('imperial');
    const metric = writeSettings((s) => {
      s.distanceUnits = 'metric';
    });
    expect(loadSettings(metric).distanceUnits).toBe('metric');
    const wrong = writeSettings((s) => {
      s.distanceUnits = 'furlongs';
    });
    expect(() => loadSettings(wrong)).toThrow(/distanceUnits/);
  });

  it('has no web server unless the file asks for one', () => {
    expect(loadSettings(REPO_SETTINGS).web).toBeUndefined();
  });

  it('reads the web server with its defaults, the public address without its slash', () => {
    const file = writeSettings((s) => {
      s.web = { port: 8080, publicUrl: 'https://map.example.test/' };
    });
    expect(loadSettings(file).web).toEqual({
      port: 8080,
      host: '127.0.0.1',
      publicUrl: 'https://map.example.test',
      trustProxy: false,
      // Stadia Maps' tiles by default (plan 8M-7), OpenStreetMap's when Stadia refuses.
      tiles: 'stadia',
    });
    const osm = writeSettings((s) => {
      s.web = { port: 8080, publicUrl: 'https://map.example.test', tiles: 'osm' };
    });
    expect(loadSettings(osm).web?.tiles).toBe('osm');
    const all = writeSettings((s) => {
      s.web = {
        port: 3000,
        host: '0.0.0.0',
        publicUrl: 'https://map.example.test:8443',
        trustProxy: true,
        tiles: 'google',
      };
    });
    expect(loadSettings(all).web).toEqual({
      port: 3000,
      host: '0.0.0.0',
      publicUrl: 'https://map.example.test:8443',
      trustProxy: true,
      tiles: 'google',
    });
  });

  it('loads a file whose words gym search ignores hold a blank one, which is none (plan 19B-2)', () => {
    const loaded = loadSettings(
      writeSettings((s) => {
        s.blacklistWords = ['gym', '', ' raid '];
      }),
    );
    expect(loaded.blacklistWords).toEqual(['gym', 'raid']);
    expect(() =>
      loadSettings(
        writeSettings((s) => {
          s.blacklistWords = ['x'.repeat(101)];
        }),
      ),
    ).toThrow(/blacklistWords/);
  });

  it('has no moderators’ channel and no flagged words unless the file names them', () => {
    const settings = loadSettings(REPO_SETTINGS);
    expect(settings.channels.moderation).toBeUndefined();
    expect(settings.meetupSafety).toBeUndefined();
    const named = loadSettings(
      writeSettings((s) => {
        s.channels = { ...(s.channels as object), moderation: ' meetup-review ' };
        s.meetupSafety = { flaggedWords: ['duplex'] };
      }),
    );
    expect(named.channels.moderation).toBe('meetup-review');
    expect(named.meetupSafety).toEqual({ flaggedWords: ['duplex'] });
    const blank = loadSettings(
      writeSettings((s) => {
        s.channels = { ...(s.channels as object), moderation: '  ' };
        s.meetupSafety = {};
      }),
    );
    expect(blank.channels.moderation).toBeUndefined();
    expect(blank.meetupSafety).toEqual({ flaggedWords: [] });
    expect(() =>
      loadSettings(
        writeSettings((s) => {
          s.meetupSafety = { flaggedWords: [''] };
        }),
      ),
    ).toThrow(/flaggedWords/);
    expect(() =>
      loadSettings(
        writeSettings((s) => {
          s.channels = { ...(s.channels as object), moderation: '#mods' };
        }),
      ),
    ).toThrow(/moderation/);
  });

  it('refuses a moderators’ channel that is another channel of the settings', () => {
    // The public bot updates channel (or any other the bot posts in) would show the requests.
    for (const other of ['bot-updates', 'pvp'] as const) {
      expect(() =>
        loadSettings(
          writeSettings((s) => {
            const channels = s.channels as Record<string, string>;
            s.channels = { ...channels, moderation: channels[other] };
          }),
        ),
      ).toThrow(/moderation/);
    }
  });

  it('lets the moderators’ channel be their bot channel, which only staff see (Matt, 2026-11-02)', () => {
    const settings = loadSettings(
      writeSettings((s) => {
        const channels = s.channels as Record<string, string>;
        s.channels = { ...channels, moderation: channels['mod-bot-lab'] };
      }),
    );
    expect(settings.channels.moderation).toBe(settings.channels['mod-bot-lab']);
  });

  // Plan 8V-1: the events forum, by name; blank is unset (no events forum).
  it('has no events forum unless the file names one, by its name without #', () => {
    const settings = loadSettings(REPO_SETTINGS);
    expect(settings.channels.events).toBeUndefined();
    const named = loadSettings(
      writeSettings((s) => {
        s.channels = { ...(s.channels as object), events: ' events ' };
      }),
    );
    expect(named.channels.events).toBe('events');
    const blank = loadSettings(
      writeSettings((s) => {
        s.channels = { ...(s.channels as object), events: '' };
      }),
    );
    expect(blank.channels.events).toBeUndefined();
    expect(() =>
      loadSettings(
        writeSettings((s) => {
          s.channels = { ...(s.channels as object), events: '#events' };
        }),
      ),
    ).toThrow(/events/);
  });

  it('refuses a moderators’ channel that is the events forum (R13)', () => {
    expect(() =>
      loadSettings(
        writeSettings((s) => {
          s.channels = { ...(s.channels as object), events: 'Events', moderation: 'events' };
        }),
      ),
    ).toThrow(/not the events channel.*channels.moderation/su);
  });

  it('opens event posts 14 days ahead and lists 35, unless set, never posts beyond the listing', () => {
    expect(loadSettings(REPO_SETTINGS).eventsForum).toEqual({
      horizonDays: 35,
      postDaysAhead: 14,
      onThisDay: 3,
    });
    const set = loadSettings(
      writeSettings((s) => {
        s.eventsForum = { horizonDays: 21, postDaysAhead: 7 };
      }),
    );
    expect(set.eventsForum).toEqual({ horizonDays: 21, postDaysAhead: 7, onThisDay: 3 });
    expect(() =>
      loadSettings(
        writeSettings((s) => {
          s.eventsForum = { horizonDays: 10, postDaysAhead: 14 };
        }),
      ),
    ).toThrow(/postDaysAhead/);
  });

  it('recalls each year’s top three big days on their day, unless set: 0 to 10, 0 off (plan 8H-8)', () => {
    for (const onThisDay of [0, 1, 10]) {
      const set = loadSettings(
        writeSettings((s) => {
          s.eventsForum = { onThisDay };
        }),
      );
      expect(set.eventsForum.onThisDay).toBe(onThisDay);
    }
    for (const onThisDay of [-1, 11, 2.5, '3']) {
      expect(() =>
        loadSettings(
          writeSettings((s) => {
            s.eventsForum = { onThisDay };
          }),
        ),
      ).toThrow(/onThisDay/);
    }
  });

  it('names the channels the settings name, an unset moderators’ channel not among them', () => {
    const settings = loadSettings(REPO_SETTINGS);
    const names = channelNamesOf(settings);
    expect(names).toContain(settings.channels['bot-updates']);
    expect(names).not.toContain(undefined);
    expect(names).toContain(settings.channels.pvp);
    const named = loadSettings(
      writeSettings((s) => {
        s.channels = { ...(s.channels as object), moderation: 'meetup-review' };
      }),
    );
    expect(channelNamesOf(named)).toContain('meetup-review');
  });

  it("reads the map's member role by name, blank as unset", () => {
    const web = (memberRole: unknown) =>
      loadSettings(
        writeSettings((s) => {
          s.web = { port: 8080, publicUrl: 'https://map.example.test', memberRole };
        }),
      ).web;
    expect(web(' Verified ')?.memberRole).toBe('Verified');
    expect(web('  ')?.memberRole).toBeUndefined();
    expect(web(undefined)?.memberRole).toBeUndefined();
    expect(() => web(7)).toThrow(/memberRole/);
    expect(() => web(['Verified'])).toThrow(/memberRole/);
  });

  // Plan 8M-11B: an invite for a visitor who is not in the server, per server, chosen by its admin.
  it("reads each server's invite to the map's visitors, blank as none, and refuses anything else", () => {
    const web = (invites: unknown) =>
      loadSettings(
        writeSettings((s) => {
          s.web = { port: 8080, publicUrl: 'https://map.example.test', invites };
        }),
      ).web;
    expect(
      web({
        '412345678901234567': ' https://discord.gg/abc123XY ',
        '412345678901234568': 'https://discord.com/invite/pokemon-go-pgh',
        '412345678901234569': '  ',
      })?.invites,
    ).toEqual({
      '412345678901234567': 'https://discord.gg/abc123XY',
      '412345678901234568': 'https://discord.com/invite/pokemon-go-pgh',
    });
    expect(web(undefined)?.invites).toBeUndefined();
    for (const wrong of [
      { '412345678901234567': 'https://discord.gg/' },
      { '412345678901234567': 'http://discord.gg/abc123' },
      { '412345678901234567': 'https://discord.gg/abc123?event=1' },
      { '412345678901234567': 'https://example.com/invite/abc123' },
      { '412345678901234567': 'https://discord.com/channels/1/2' },
      { '412345678901234567': 'discord.gg/abc123' },
      { 'not-a-server': 'https://discord.gg/abc123' },
      { '412345678901234567': 7 },
      ['https://discord.gg/abc123'],
    ]) {
      expect(() => web(wrong), JSON.stringify(wrong)).toThrow(/invites/);
    }
    expect(() => web({ '412345678901234567': 'https://discord.gg/' })).toThrow(
      /https:\/\/discord\.gg\/<code> or https:\/\/discord\.com\/invite\/<code>/,
    );
  });

  it('takes a plain http address only for this machine', () => {
    for (const local of ['http://localhost:8080', 'http://127.0.0.1:8080/', 'http://[::1]:8080']) {
      const file = writeSettings((s) => {
        s.web = { port: 8080, publicUrl: local };
      });
      expect(loadSettings(file).web?.publicUrl, local).toBe(local.replace(/\/$/, ''));
    }
    const file = writeSettings((s) => {
      s.web = { port: 8080, publicUrl: 'http://map.example.test' };
    });
    expect(() => loadSettings(file)).toThrow(/publicUrl/);
    expect(() => loadSettings(file)).toThrow(/https/);
  });

  it('refuses a web server it could not run as written', () => {
    const wrong: Record<string, unknown>[] = [
      { publicUrl: 'https://map.example.test' },
      { port: 0, publicUrl: 'https://map.example.test' },
      { port: 65536, publicUrl: 'https://map.example.test' },
      { port: 80.5, publicUrl: 'https://map.example.test' },
      { port: 8080 },
      { port: 8080, publicUrl: 'map.example.test' },
      { port: 8080, publicUrl: 'ftp://map.example.test' },
      { port: 8080, publicUrl: 'https://example.test/pine' },
      { port: 8080, publicUrl: 'https://map.example.test/?a=1' },
      { port: 8080, publicUrl: 'https://map.example.test/#map' },
      { port: 8080, publicUrl: 'https://user:pw@map.example.test' },
      { port: 8080, publicUrl: 'https://map.example.test', tiles: 'bing' },
      { port: 8080, publicUrl: 'https://map.example.test', trustProxy: 'yes' },
      { port: 8080, publicUrl: 'https://map.example.test', host: '' },
      { port: 8080, publicUrl: 'https://map.example.test', listen: '0.0.0.0' },
    ];
    for (const web of wrong) {
      const file = writeSettings((s) => {
        s.web = web;
      });
      expect(() => loadSettings(file), JSON.stringify(web)).toThrow(/web/);
    }
  });

  it('starts with a file from before the EX tier went, whose durations it no longer reads', () => {
    expect(RETIRED_SETTINGS).toEqual([
      'exclusiveRaidIncubateDuration',
      'exclusiveRaidHatchedDuration',
      'raidEggPicturesUrl',
      'messageCleanupDelaySuccess',
      'messageCleanupDelayStatus',
      'databaseRaids',
      'updater',
      'archiveRetentionDays',
      'emoji.thumbsUp',
      'emoji.thumbsDown',
    ]);
    const current = JSON.parse(readFileSync(REPO_SETTINGS, 'utf8')) as Record<string, unknown>;
    for (const key of RETIRED_SETTINGS) expect(current, key).not.toHaveProperty(key.split('.'));
    const old = writeSettings((s) => {
      s.exclusiveRaidIncubateDuration = 20160;
      s.exclusiveRaidHatchedDuration = 45;
    });
    const settings = loadSettings(old);
    expect(settings).toEqual(loadSettings(REPO_SETTINGS));
    for (const key of RETIRED_SETTINGS) expect(settings, key).not.toHaveProperty(key);
    // Whatever they hold: they are not read, so they are not checked either.
    const odd = writeSettings((s) => {
      s.exclusiveRaidIncubateDuration = 'two weeks';
      // The eggs' folder went with plan 8D-F: the bot carries its own pictures.
      s.raidEggPicturesUrl = 'not even an address';
    });
    expect(loadSettings(odd)).toEqual(loadSettings(REPO_SETTINGS));
  });

  it('starts with a legacy file that still has the keys nothing reads, and keeps none of them', () => {
    const legacy = writeSettings((s) => {
      s.messageCleanupDelaySuccess = 5000;
      s.messageCleanupDelayStatus = 60000;
      s.databaseRaids = true;
      s.updater = {
        channelIndexUpdateIntervalSeconds: 60,
        gymPlacesIndexUpdateIntervalSeconds: 60,
      };
      s.archiveRetentionDays = null;
      const emoji = s.emoji as Record<string, unknown>;
      emoji.thumbsUp = 'pinethumbsup';
      emoji.thumbsDown = 'pinethumbsdown';
    });
    const settings = loadSettings(legacy);
    expect(settings).toEqual(loadSettings(REPO_SETTINGS));
    expect(settings).not.toHaveProperty('updater');
    expect(settings.emoji).not.toHaveProperty('thumbsUp');
    // The one of the cleanup delays that is read stays: a screenshot's reply goes after it.
    expect(settings.messageCleanupDelayError).toBe(30000);
  });

  it('takes only those keys out, and only at the top of the file', () => {
    expect(
      withoutRetiredSettings({ exclusiveRaidHatchedDuration: 45, cleanupInterval: 1, other: 2 }),
    ).toEqual({ cleanupInterval: 1, other: 2 });
    for (const raw of [null, 'text', 7, [{ exclusiveRaidHatchedDuration: 45 }]]) {
      expect(withoutRetiredSettings(raw)).toBe(raw);
    }
    // The same name further down is a key nobody knows: refused like any other.
    const nested = writeSettings((s) => {
      (s.gameData as Record<string, unknown>).exclusiveRaidHatchedDuration = 45;
    });
    expect(() => loadSettings(nested)).toThrow(/exclusiveRaidHatchedDuration/);
    // And a key that only looks alike is still refused.
    const alike = writeSettings((s) => {
      s.exclusiveRaidDuration = 45;
    });
    expect(() => loadSettings(alike)).toThrow(/exclusiveRaidDuration/);
  });

  it('names the species that spawn although they have a class, by default the lake trio', () => {
    expect(loadSettings(REPO_SETTINGS).wildSpawnExceptions).toEqual(['Uxie', 'Mesprit', 'Azelf']);
    // A file from before the setting starts, with the default.
    const without = writeSettings((s) => {
      delete s.wildSpawnExceptions;
    });
    expect(loadSettings(without).wildSpawnExceptions).toEqual(['Uxie', 'Mesprit', 'Azelf']);
    const own = writeSettings((s) => {
      s.wildSpawnExceptions = ['articuno_galarian'];
    });
    expect(loadSettings(own).wildSpawnExceptions).toEqual(['articuno_galarian']);
    const none = writeSettings((s) => {
      s.wildSpawnExceptions = [];
    });
    expect(loadSettings(none).wildSpawnExceptions).toEqual([]);
    const bad = writeSettings((s) => {
      s.wildSpawnExceptions = ['Uxie', ''];
    });
    expect(() => loadSettings(bad)).toThrow(/wildSpawnExceptions/);
  });

  it('rejects an unknown time zone', () => {
    const file = writeSettings((s) => {
      s.timezone = 'Mars/Olympus_Mons';
    });
    expect(() => loadSettings(file)).toThrow(/timezone/);
  });

  it('rejects a game data refresh interval above a week', () => {
    const file = writeSettings((s) => {
      (s.gameData as Record<string, unknown>).refreshHours = 169;
    });
    expect(() => loadSettings(file)).toThrow(/refreshHours/);
  });

  it('rejects a game data address that is not http or https', () => {
    for (const key of ['gameMasterUrl', 'textUrl', 'iconsUrl']) {
      const file = writeSettings((s) => {
        (s.gameData as Record<string, unknown>)[key] = 'file:///etc/passwd';
      });
      expect(() => loadSettings(file), key).toThrow(new RegExp(key));
    }
  });

  it('requires the address of the list of Pokémon icons', () => {
    expect(loadSettings(writeSettings(() => undefined)).gameData.iconsUrl).toMatch(/^https:/);
    const file = writeSettings((s) => {
      delete (s.gameData as Record<string, unknown>).iconsUrl;
    });
    expect(() => loadSettings(file)).toThrow(/iconsUrl/);
  });

  it('knows where the megas’ portraits are listed without being told, and takes another', () => {
    expect(loadSettings(writeSettings(() => undefined)).gameData.megaPortraitsUrl).toBe(
      'https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master:Images/Mega%20Portraits%20512x512',
    );
    const other = writeSettings((s) => {
      (s.gameData as Record<string, unknown>).megaPortraitsUrl = 'https://example.test/portraits';
    });
    expect(loadSettings(other).gameData.megaPortraitsUrl).toBe('https://example.test/portraits');
    const bad = writeSettings((s) => {
      (s.gameData as Record<string, unknown>).megaPortraitsUrl = 'file:///etc/passwd';
    });
    expect(() => loadSettings(bad)).toThrow(/megaPortraitsUrl/);
  });

  it('reads the raid boss settings, Leek Duck’s raid manifest without being told', () => {
    expect(loadSettings(writeSettings(() => undefined)).raidBosses).toEqual({
      url: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.min.json',
      manifestUrl: 'https://leekduck.com/raids/manifest.json',
      refreshMinutes: 60,
      staleAfterHours: 48,
      announceChanges: false,
    });
  });

  it('takes another address of the raid manifest', () => {
    const file = writeSettings((s) => {
      (s.raidBosses as Record<string, unknown>).manifestUrl = 'https://example.test/manifest.json';
    });
    expect(loadSettings(file).raidBosses.manifestUrl).toBe('https://example.test/manifest.json');
  });

  it('rejects raid boss settings that are missing or out of range', () => {
    const cases: [string, unknown][] = [
      ['url', 'file:///etc/passwd'],
      ['url', 'raidboss.json'],
      ['manifestUrl', 'file:///etc/passwd'],
      ['manifestUrl', 'manifest.json'],
      ['refreshMinutes', 4],
      ['refreshMinutes', 1441],
      ['refreshMinutes', 7.5],
      ['staleAfterHours', 0],
      ['staleAfterHours', 721],
      ['announceChanges', 'yes'],
    ];
    for (const [key, value] of cases) {
      const file = writeSettings((s) => {
        (s.raidBosses as Record<string, unknown>)[key] = value;
      });
      expect(() => loadSettings(file), `${key} = ${String(value)}`).toThrow(new RegExp(key));
    }
    const without = writeSettings((s) => {
      delete s.raidBosses;
    });
    expect(() => loadSettings(without)).toThrow(/raidBosses/);
    const extra = writeSettings((s) => {
      (s.raidBosses as Record<string, unknown>).fallbackUrl = 'https://example.test';
    });
    expect(() => loadSettings(extra)).toThrow(/fallbackUrl/);
  });

  it('rejects a stale limit that does not cover two refresh intervals', () => {
    const set = (staleAfterHours: number) =>
      writeSettings((s) => {
        Object.assign(s.raidBosses as Record<string, unknown>, {
          refreshMinutes: 1440,
          staleAfterHours,
        });
      });
    expect(() => loadSettings(set(47))).toThrow(/staleAfterHours/);
    expect(loadSettings(set(48)).raidBosses.staleAfterHours).toBe(48);
  });

  it('refuses a weekly Raid Hour that ends after the day it starts', () => {
    const set = (minutes: number) =>
      writeSettings((s) => {
        (s.raidEvents as Record<string, unknown>).weeklyRaidHour = {
          weekday: 3,
          hour: 23,
          minutes,
        };
      });
    expect(() => loadSettings(set(120))).toThrow(/must end on the day it starts/);
    expect(loadSettings(set(60)).raidEvents.weeklyRaidHour).toEqual({
      weekday: 3,
      hour: 23,
      minutes: 60,
    });
  });

  it('names a region’s forum its board by default (plan 8R-9), as the repository’s file does', () => {
    expect(loadSettings(REPO_SETTINGS).regionForumSuffix).toBe('-board');
    const without = writeSettings((s) => {
      delete s.regionForumSuffix;
    });
    expect(loadSettings(without).regionForumSuffix).toBe('-board');
  });

  it('takes the lobby sizes, each with its default, and all of them for a file without any', () => {
    const defaults = { raid: 20, dynamax: 4, gigantamax: 100 };
    expect(loadSettings(REPO_SETTINGS).lobbies).toEqual(defaults);
    expect(loadSettings('test/fixtures/settings.json').lobbies).toEqual(defaults);
    const without = writeSettings((s) => {
      delete s.lobbies;
    });
    expect(loadSettings(without).lobbies).toEqual(defaults);
    const some = writeSettings((s) => {
      s.lobbies = { dynamax: 6 };
    });
    expect(loadSettings(some).lobbies).toEqual({ ...defaults, dynamax: 6 });
    const edges = writeSettings((s) => {
      s.lobbies = { raid: 1, dynamax: 100, gigantamax: 50 };
    });
    expect(loadSettings(edges).lobbies).toEqual({ raid: 1, dynamax: 100, gigantamax: 50 });
  });

  it('refuses a lobby size that is no whole number from 1 to 100, or a kind it does not know', () => {
    for (const value of [0, 101, 4.5, '4', null]) {
      const file = writeSettings((s) => {
        s.lobbies = { dynamax: value };
      });
      expect(() => loadSettings(file), `dynamax = ${String(value)}`).toThrow(/dynamax/);
    }
    const unknown = writeSettings((s) => {
      s.lobbies = { mega: 10 };
    });
    expect(() => loadSettings(unknown)).toThrow(/mega/);
  });

  it('has max battles on without a maxBattles block, with every default (Matt, 2026-10-21)', () => {
    const defaults = {
      url: 'https://fight.pokebattler.com/raids',
      refreshMinutes: 360,
      firstBattle: '06:00',
      lastBattle: '21:00',
    };
    expect(loadSettings(REPO_SETTINGS).maxBattles).toEqual(defaults);
    expect(loadSettings('test/fixtures/settings.json').maxBattles).toEqual(defaults);
    const empty = writeSettings((s) => {
      s.maxBattles = {};
    });
    expect(loadSettings(empty).maxBattles).toEqual(defaults);
  });

  it('has Team GO Rocket on without a rocket block, with every default (plan 8R-2)', () => {
    const defaults = {
      url: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.min.json',
      refreshHours: 6,
      staleAfterHours: 24,
      gruntMinutes: 30,
      throttle: { uses: 10, minutes: 30 },
    };
    expect(loadSettings(REPO_SETTINGS).rocket).toEqual(defaults);
    expect(loadSettings('test/fixtures/settings.json').rocket).toEqual(defaults);
    const partly = writeSettings((s) => {
      s.rocket = { gruntMinutes: 25, throttle: { minutes: 15 } };
    });
    expect(loadSettings(partly).rocket).toEqual({
      ...defaults,
      gruntMinutes: 25,
      throttle: { uses: 10, minutes: 15 },
    });
    const tooSoon = writeSettings((s) => {
      s.rocket = { refreshHours: 12, staleAfterHours: 20 };
    });
    expect(() => loadSettings(tooSoon)).toThrow(/staleAfterHours/);
  });

  it('has field research on without a research block, with every default (plan 8R-1)', () => {
    const defaults = {
      url: 'https://leekduck.com/research/',
      refreshHours: 1,
      staleAfterHours: 6,
      throttle: { uses: 10, minutes: 30 },
    };
    expect(loadSettings(REPO_SETTINGS).research).toEqual(defaults);
    expect(loadSettings('test/fixtures/settings.json').research).toEqual(defaults);
    const partly = writeSettings((s) => {
      s.research = { refreshHours: 2, throttle: { uses: 5 } };
    });
    expect(loadSettings(partly).research).toEqual({
      ...defaults,
      refreshHours: 2,
      throttle: { uses: 5, minutes: 30 },
    });
    const tooSoon = writeSettings((s) => {
      s.research = { refreshHours: 4, staleAfterHours: 6 };
    });
    expect(() => loadSettings(tooSoon)).toThrow(/staleAfterHours/);
  });

  it('takes maxBattles with its defaults: the feed read every 6 hours, battles 06:00 to 21:00', () => {
    const url = 'https://example.test/raids';
    const file = writeSettings((s) => {
      s.maxBattles = { url };
    });
    expect(loadSettings(file).maxBattles).toEqual({
      url,
      refreshMinutes: 360,
      firstBattle: '06:00',
      lastBattle: '21:00',
    });
    const own = writeSettings((s) => {
      s.maxBattles = { url, refreshMinutes: 60, firstBattle: '7:30', lastBattle: '23:59' };
    });
    expect(loadSettings(own).maxBattles).toMatchObject({
      refreshMinutes: 60,
      firstBattle: '07:30',
      lastBattle: '23:59',
    });
  });

  it('refuses a maxBattles block it cannot use', () => {
    const url = 'https://fight.pokebattler.com/raids';
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ url: 'ftp://example.test/raids' }, /url/],
      [{ url, refreshMinutes: 4 }, /refreshMinutes/],
      [{ url, refreshMinutes: 1441 }, /refreshMinutes/],
      [{ url, firstBattle: '24:00' }, /firstBattle/],
      [{ url, lastBattle: '9pm' }, /lastBattle/],
      [{ url, firstBattle: '21:00', lastBattle: '06:00' }, /lastBattle/],
      [{ url, firstBattle: '06:00', lastBattle: '06:00' }, /lastBattle/],
      [{ url, staleAfterHours: 48 }, /staleAfterHours/],
    ];
    for (const [block, error] of cases) {
      const file = writeSettings((s) => {
        s.maxBattles = block;
      });
      expect(() => loadSettings(file), JSON.stringify(block)).toThrow(error);
    }
  });

  it('rejects a missing required key', () => {
    const file = writeSettings((s) => {
      delete s.cleanupInterval;
    });
    expect(() => loadSettings(file)).toThrow(/cleanupInterval/);
  });

  it('reports invalid JSON with the file path', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'pine-settings-')), 'broken.json');
    writeFileSync(file, '{ not json');
    expect(() => loadSettings(file)).toThrow(/broken\.json is not valid JSON/);
  });
});
