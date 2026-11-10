import { describe, expect, it } from 'vitest';
import { MEGA_PORTRAIT_BASE, POKEMON_ICON_BASE } from '../domain/pogo/pokemon-icons.js';
import { RAID_EGG_PICTURES_URL } from '../domain/pogo/raid-eggs.js';
import { LEADER_PORTRAITS } from '../domain/rocket/portraits.js';
import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
import { contentSecurityPolicy, pictureOrigins, securityHeaders } from './headers.js';

/** The directives of a policy, by name. */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((part) => {
      const [name = '', ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe('contentSecurityPolicy', () => {
  const pictures = ['https://cdn.leekduck.com', 'https://raw.githubusercontent.com'];

  it('lets in scripts and styles from Pine alone, and frames nothing', () => {
    const policy = directives(contentSecurityPolicy({ tiles: 'osm', pictureOrigins: pictures }));
    expect(policy.get('default-src')).toEqual(["'none'"]);
    // Pine's files alone: no inline script on any page but the one that carries it (plan 8Z-2).
    expect(policy.get('script-src')).toEqual(["'self'"]);
    expect(policy.get('style-src')).toEqual(["'self'"]);
    expect(policy.get('font-src')).toEqual(["'self'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'none'"]);
    expect(policy.get('form-action')).toEqual(["'self'"]);
    expect(policy.get('connect-src')).toEqual(["'self'"]);
  });

  it('lets the script of a login link’s page in by its hash, only for an answer that carries it', () => {
    const options = { tiles: 'osm', pictureOrigins: pictures } as const;
    const carrying = directives(contentSecurityPolicy({ ...options, continueScript: true }));
    // The one inline script of Pine's pages (review fix 6), and nothing else of the policy differs.
    expect(carrying.get('script-src')).toEqual([
      "'self'",
      expect.stringMatching(/^'sha256-[A-Za-z0-9+/]{43}='$/),
    ]);
    const plain = directives(contentSecurityPolicy(options));
    expect([...carrying.keys()]).toEqual([...plain.keys()]);
    for (const [name, values] of plain) {
      if (name !== 'script-src') expect(carrying.get(name), name).toEqual(values);
    }
  });

  it("shows OpenStreetMap's tiles and the posts' pictures, and Google's only with Google", () => {
    const osm = directives(contentSecurityPolicy({ tiles: 'osm', pictureOrigins: pictures }));
    expect(osm.get('img-src')).toEqual([
      "'self'",
      'data:',
      'https://tile.openstreetmap.org',
      ...pictures,
    ]);
    const google = directives(contentSecurityPolicy({ tiles: 'google', pictureOrigins: pictures }));
    expect(google.get('img-src')).toContain('https://tile.googleapis.com');
    expect(google.get('img-src')).toContain('https://tile.openstreetmap.org');
    expect(google.get('connect-src')).toEqual(["'self'", 'https://tile.googleapis.com']);
  });

  it("shows Stadia Maps' tiles for 'stadia' and beside Google's, never for 'osm' (plan 8M-7)", () => {
    const stadia = directives(contentSecurityPolicy({ tiles: 'stadia', pictureOrigins: pictures }));
    // OpenStreetMap stays: the page falls back to it when Stadia refuses.
    expect(stadia.get('img-src')).toEqual([
      "'self'",
      'data:',
      'https://tiles.stadiamaps.com',
      'https://tile.openstreetmap.org',
      ...pictures,
    ]);
    expect(stadia.get('connect-src')).toEqual(["'self'"]);
    const google = directives(contentSecurityPolicy({ tiles: 'google', pictureOrigins: pictures }));
    expect(google.get('img-src')).toContain('https://tiles.stadiamaps.com');
    const osm = directives(contentSecurityPolicy({ tiles: 'osm', pictureOrigins: pictures }));
    expect(osm.get('img-src')).not.toContain('https://tiles.stadiamaps.com');
  });
});

describe('pictureOrigins', () => {
  it("names the hosts of the posts' pictures: the icons', the megas' portraits', Pine's own", () => {
    expect(pictureOrigins('https://map.example.test')).toEqual([
      new URL(POKEMON_ICON_BASE).origin,
      new URL(MEGA_PORTRAIT_BASE).origin,
      'https://map.example.test',
    ]);
    // The eggs no longer come from pogo_assets (plan 8D-F); the portraits share that host.
    expect(new URL(RAID_EGG_PICTURES_URL).origin).toBe(new URL(MEGA_PORTRAIT_BASE).origin);
    // The stops' encounter picture may be loaded (plan 8R-6), and the leaders' portraits.
    const origins = pictureOrigins('https://map.example.test');
    expect(origins).toContain(new URL(ENCOUNTER_PICTURE).origin);
    expect(origins).toContain(new URL(LEADER_PORTRAITS.cliff).origin);
  });
});

describe('securityHeaders', () => {
  it('refuses sniffing and frames, and sends only the origin to other sites', () => {
    const headers = securityHeaders({ tiles: 'osm', pictureOrigins: [] });
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['content-security-policy']).toContain("script-src 'self'");
  });
});
