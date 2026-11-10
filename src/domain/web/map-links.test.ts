import { describe, expect, it } from 'vitest';
import { mapLink } from './map-links.js';

const ORIGIN = 'https://map.example.test';
const GUILD = '412345678901234567';
const OTHER = '412345678901234999';
const link = (url: string) => mapLink(url, GUILD, ORIGIN);

describe('mapLink', () => {
  it('links Google Maps and this server on Discord, by https alone', () => {
    const maps = 'https://www.google.com/maps/search/?api=1&query=1%2C2';
    expect(link(maps)).toBe(maps);
    expect(link(`https://discord.com/channels/${GUILD}/123`)).toBe(
      `https://discord.com/channels/${GUILD}/123`,
    );
    for (const url of [
      'http://www.google.com/maps/x',
      'https://www.google.com/search?q=x',
      'https://www.google.com/mapsx/evil',
      `https://discord.com/channels/${OTHER}/123`,
      'https://user@www.google.com/maps/x',
      'https://www.google.com:8443/maps/x',
      'javascript:alert(1)',
      'https://evil.example/maps',
      'not an address',
      '',
    ]) {
      expect(link(url), url).toBeUndefined();
    }
  });

  it('links Pine’s own pages only under this server’s addresses (plan 8Z-2)', () => {
    expect(link(`${ORIGIN}/s/${GUILD}/map`)).toBe(`${ORIGIN}/s/${GUILD}/map`);
    expect(link(`${ORIGIN}/s/${GUILD}/map?train=12`)).toBe(`${ORIGIN}/s/${GUILD}/map?train=12`);
    expect(link(`${ORIGIN}/s/${GUILD}/history`)).toBe(`${ORIGIN}/s/${GUILD}/history`);
    for (const url of [
      // A login link pasted into a meetup's information logs in whoever follows it.
      `${ORIGIN}/auth/link/${GUILD}/${'A'.repeat(43)}`,
      `${ORIGIN}/auth/link/${GUILD}/${'A'.repeat(43)}/edit`,
      `${ORIGIN}/auth/login?next=/`,
      `${ORIGIN}/auth/callback?code=x&state=y`,
      // Another server's pages, the top page, the tool, the bundle.
      `${ORIGIN}/s/${OTHER}/map`,
      `${ORIGIN}/`,
      ORIGIN,
      `${ORIGIN}/userscript`,
      `${ORIGIN}/assets/map.js`,
      // The server's folder itself, and a server whose id only starts alike.
      `${ORIGIN}/s/${GUILD}`,
      `${ORIGIN}/s/${GUILD}9/map`,
    ]) {
      expect(link(url), url).toBeUndefined();
    }
  });

  it('judges the address as the browser resolves it, and gives that address', () => {
    // Dot segments, plain or encoded, and a backslash lead out of the server's addresses.
    for (const url of [
      `${ORIGIN}/s/${GUILD}/../../auth/link/${GUILD}/x`,
      `${ORIGIN}/s/${GUILD}/%2e%2e/%2E%2E/auth/link/${GUILD}/x`,
      `${ORIGIN}/s/${GUILD}/..\\..\\auth/link/${GUILD}/x`,
      `${ORIGIN}//evil.example/s/${GUILD}/map`,
      `https://map.example.test.evil.example/s/${GUILD}/map`,
      `https://map.example.test@evil.example/s/${GUILD}/map`,
    ]) {
      expect(link(url), url).toBeUndefined();
    }
    // Inside them, the resolved address is the link.
    expect(link(`${ORIGIN}/s/${GUILD}/x/../map`)).toBe(`${ORIGIN}/s/${GUILD}/map`);
    expect(link(`HTTPS://MAP.EXAMPLE.TEST/s/${GUILD}/map`)).toBe(`${ORIGIN}/s/${GUILD}/map`);
  });

  it('knows Pine’s own origin as the caller gives it, plain http of this machine too', () => {
    expect(mapLink('http://localhost:8787/s/1/map', '1', 'http://localhost:8787')).toBe(
      'http://localhost:8787/s/1/map',
    );
    expect(
      mapLink('http://localhost:8787/auth/link/1/x', '1', 'http://localhost:8787'),
    ).toBeUndefined();
    // Another port is another origin, and no https.
    expect(mapLink('http://localhost:9999/s/1/map', '1', 'http://localhost:8787')).toBeUndefined();
  });
});
