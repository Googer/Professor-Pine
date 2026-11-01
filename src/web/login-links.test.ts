import { describe, expect, it } from 'vitest';
import { LINK_MS, LoginLinks } from './login-links.js';

const GUILD = '412345678901234567';
const ASH = '700000000000000001';

describe('LoginLinks', () => {
  it('gives a link of 256 random bits that logs its member in once', () => {
    const links = new LoginLinks();
    const token = links.issue(GUILD, ASH, 'Ash', 0);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(links.issue(GUILD, ASH, 'Ash', 0)).not.toBe(token);
    expect(links.redeem(token, 1_000)).toEqual({
      guildId: GUILD,
      userId: ASH,
      userName: 'Ash',
      page: 'map',
    });
    expect(links.redeem(token, 1_000)).toBeUndefined();
  });

  it('opens the page it was given for: the map, or the region editor', () => {
    const links = new LoginLinks();
    const token = links.issue(GUILD, ASH, 'Ash', 0, 'regions/edit');
    expect(links.peek(token, 1_000)?.page).toBe('regions/edit');
    expect(links.redeem(token, 1_000)?.page).toBe('regions/edit');
  });

  it('keeps the region of the channel /maps was used in, for the map to open on (plan 8M-7)', () => {
    const links = new LoginLinks();
    const token = links.issue(GUILD, ASH, 'Ash', 0, 'map', 12);
    expect(links.peek(token, 1_000)).toEqual({
      guildId: GUILD,
      userId: ASH,
      userName: 'Ash',
      page: 'map',
      region: 12,
    });
    expect(links.redeem(token, 1_000)?.region).toBe(12);
    expect(links.peek(links.issue(GUILD, ASH, 'Ash', 0), 1_000)).not.toHaveProperty('region');
  });

  it('says whom a link logs in without using it up', () => {
    const links = new LoginLinks();
    const token = links.issue(GUILD, ASH, 'Ash', 0);
    const holder = { guildId: GUILD, userId: ASH, userName: 'Ash', page: 'map' };
    expect(links.peek(token, 1_000)).toEqual(holder);
    expect(links.peek(token, 1_000)).toEqual(holder);
    expect(links.redeem(token, 1_000)).toBeDefined();
    expect(links.peek(token, 1_000)).toBeUndefined();
    const stale = links.issue(GUILD, ASH, 'Ash', 0);
    expect(links.peek(stale, LINK_MS)).toBeUndefined();
    expect(links.peek('', 0)).toBeUndefined();
  });

  it('is good for five minutes', () => {
    const links = new LoginLinks();
    expect(LINK_MS).toBe(5 * 60_000);
    const fresh = links.issue(GUILD, ASH, 'Ash', 0);
    const stale = links.issue(GUILD, ASH, 'Ash', 0);
    expect(links.redeem(fresh, LINK_MS - 1)).toBeDefined();
    expect(links.redeem(stale, LINK_MS)).toBeUndefined();
  });

  it('keeps only the hash of a link, and knows nothing of another token', () => {
    const links = new LoginLinks();
    const token = links.issue(GUILD, ASH, 'Ash', 0);
    const altered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(links.redeem(altered, 0)).toBeUndefined();
    expect(links.redeem('', 0)).toBeUndefined();
    expect(JSON.stringify(links)).not.toContain(token);
  });

  it('remembers a bounded number of links, the oldest going first', () => {
    const links = new LoginLinks(2);
    const first = links.issue(GUILD, ASH, 'Ash', 0);
    const second = links.issue(GUILD, ASH, 'Ash', 0);
    const third = links.issue(GUILD, ASH, 'Ash', 0);
    expect(links.redeem(first, 0)).toBeUndefined();
    expect(links.redeem(second, 0)).toBeDefined();
    expect(links.redeem(third, 0)).toBeDefined();
  });
});
