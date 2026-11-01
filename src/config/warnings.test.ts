import { describe, expect, it } from 'vitest';
import { loadSettings } from './settings.js';
import { configWarnings } from './warnings.js';

describe('configWarnings', () => {
  it('warns of REGION_MAP_LINK in the environment while the setting regionMapLink is unset', () => {
    const warnings = configWarnings(
      { REGION_MAP_LINK: 'https://maps.example.test/regions' },
      { regionMapLink: undefined },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/REGION_MAP_LINK/);
    expect(warnings[0]).toMatch(/regionMapLink/);
    expect(warnings[0]).not.toContain('maps.example.test');
    expect(warnings[0]).toMatch(/\/maps is not offered/);
  });

  it('does not say /maps is missing where the web pages give it', () => {
    const web = {
      port: 8080,
      host: '127.0.0.1',
      publicUrl: 'https://map.example.test',
      trustProxy: true,
      tiles: 'osm' as const,
    };
    const [warning, ...more] = configWarnings(
      { REGION_MAP_LINK: 'https://maps.example.test/regions', DISCORD_CLIENT_SECRET: 'secret' },
      { regionMapLink: undefined, web },
    );
    expect(more).toEqual([]);
    expect(warning).toMatch(/REGION_MAP_LINK/);
    expect(warning).not.toMatch(/not offered/);
  });

  it('says nothing when the setting is set, or the variable is unset or blank', () => {
    expect(
      configWarnings(
        { REGION_MAP_LINK: 'https://a.test' },
        { regionMapLink: 'https://maps.example.test/regions' },
      ),
    ).toEqual([]);
    expect(configWarnings({}, { regionMapLink: undefined })).toEqual([]);
    expect(configWarnings({ REGION_MAP_LINK: '  ' }, { regionMapLink: undefined })).toEqual([]);
  });

  it('warns when the screenshots that may wait could not all be read within twelve minutes', () => {
    const ocr = (queue: number, timeoutSeconds: number) =>
      configWarnings(
        {},
        {
          regionMapLink: undefined,
          ocr: {
            queue,
            timeoutSeconds,
            enabled: true,
            reviewPerDay: 200,
            reviewDays: 30,
            keepMegabytes: 20_000,
          },
        },
      );
    expect(ocr(10, 60)).toEqual([]);
    const [warning] = ocr(15, 60);
    expect(warning).toMatch(/ocr\.queue/);
    expect(warning).toMatch(/ocr\.timeoutSeconds/);
    expect(
      configWarnings(
        {},
        {
          regionMapLink: undefined,
          ocr: {
            queue: 50,
            timeoutSeconds: 600,
            enabled: false,
            reviewPerDay: 200,
            reviewDays: 30,
            keepMegabytes: 20_000,
          },
        },
      ),
    ).toEqual([]);
  });

  it('warns when the screenshots kept for review could fill the space of the kept screenshots', () => {
    const ocr = (keepMegabytes: number) =>
      configWarnings(
        {},
        {
          regionMapLink: undefined,
          ocr: {
            queue: 10,
            timeoutSeconds: 60,
            enabled: true,
            reviewPerDay: 200,
            reviewDays: 30,
            keepMegabytes,
          },
        },
      );
    expect(ocr(12_000)).toEqual([]);
    const [warning] = ocr(2_048);
    expect(warning).toMatch(/ocr\.reviewPerDay/);
    expect(warning).toMatch(/ocr\.keepMegabytes/);
  });

  it('warns of a web server without the client secret: no login with Discord', () => {
    const web = {
      port: 8080,
      host: '127.0.0.1',
      publicUrl: 'https://map.example.test',
      trustProxy: true,
      tiles: 'osm' as const,
    };
    const [warning, ...more] = configWarnings({}, { regionMapLink: undefined, web });
    expect(more).toEqual([]);
    expect(warning).toMatch(/DISCORD_CLIENT_SECRET/);
    expect(warning).toMatch(/Log in with Discord/);
    expect(warning).toMatch(/\/maps/);
    expect(
      configWarnings({ DISCORD_CLIENT_SECRET: 'secret' }, { regionMapLink: undefined, web }),
    ).toEqual([]);
    expect(
      configWarnings({ DISCORD_CLIENT_SECRET: '  ' }, { regionMapLink: undefined, web }),
    ).toHaveLength(1);
    // Without a web server the secret is not missed.
    expect(configWarnings({}, { regionMapLink: undefined })).toEqual([]);
  });

  it("warns of Google tiles without the browser key: Stadia Maps' are shown", () => {
    const web = {
      port: 8080,
      host: '127.0.0.1',
      publicUrl: 'https://map.example.test',
      trustProxy: true,
      tiles: 'google' as const,
    };
    const raw = { DISCORD_CLIENT_SECRET: 'secret' };
    const [warning, ...more] = configWarnings(raw, { regionMapLink: undefined, web });
    expect(more).toEqual([]);
    expect(warning).toMatch(/GOOGLE_MAPS_BROWSER_KEY/);
    expect(warning).toMatch(/Stadia Maps/);
    expect(
      configWarnings(
        { ...raw, GOOGLE_MAPS_BROWSER_KEY: 'browser-key' },
        { regionMapLink: undefined, web },
      ),
    ).toEqual([]);
    expect(
      configWarnings(raw, { regionMapLink: undefined, web: { ...web, tiles: 'osm' } }),
    ).toEqual([]);
    // Stadia's tiles need no key (Stadia checks the page's domain).
    expect(
      configWarnings(raw, { regionMapLink: undefined, web: { ...web, tiles: 'stadia' } }),
    ).toEqual([]);
  });

  it('says that the web pages stay off in rehearsal mode', () => {
    const web = {
      port: 8080,
      host: '0.0.0.0',
      publicUrl: 'https://map.example.test',
      trustProxy: true,
      tiles: 'osm' as const,
    };
    const raw = { DISCORD_CLIENT_SECRET: 'secret' };
    const rehearsal = { allowlist: ['412345678901234501'], regions: ['west'], staffRoles: [] };
    expect(configWarnings(raw, { regionMapLink: undefined, web, rehearsal })).toEqual([
      'settings.web is set in rehearsal mode: the web pages stay off until the rehearsal is ' +
        'over. Take web out of the rehearsal settings, and COMPOSE_PROFILES=tunnel out of its .env',
    ]);
    expect(configWarnings(raw, { regionMapLink: undefined, web })).toEqual([]);
  });

  // Off behind a tunnel every visitor is one address, so one limit: the map breaks for everybody.
  it('warns of a public address without trustProxy, and not of this machine', () => {
    const web = (publicUrl: string, trustProxy: boolean) => ({
      port: 8080,
      host: '127.0.0.1',
      publicUrl,
      trustProxy,
      tiles: 'osm' as const,
    });
    const raw = { DISCORD_CLIENT_SECRET: 'secret' };
    const warned = (one: ReturnType<typeof web>) =>
      configWarnings(raw, { regionMapLink: undefined, web: one });
    const [warning, ...more] = warned(web('https://map.example.test', false));
    expect(more).toEqual([]);
    expect(warning).toMatch(/trustProxy/);
    expect(warned(web('https://map.example.test', true))).toEqual([]);
    expect(warned(web('http://localhost:8080', false))).toEqual([]);
    expect(warned(web('http://127.0.0.1:8080', false))).toEqual([]);
  });

  it('says nothing about the default settings', () => {
    expect(configWarnings({}, loadSettings('data/settings.json'))).toEqual([]);
  });
});
