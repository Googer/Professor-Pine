import { describe, expect, it } from 'vitest';
import {
  headerLines,
  inviteNode,
  loginNotice,
  loginNoticeFor,
  NOTICE_MS,
  NoticeBand,
} from './notice.js';

describe('loginNotice', () => {
  it('says once why a login did not happen, and gives the address without it', () => {
    expect(loginNotice('?login=failed')).toEqual({ text: 'Login failed.', search: '' });
    expect(loginNotice('?login=expired')).toEqual({
      text: 'This login link has expired. Ask for a new one with /maps.',
      search: '',
    });
    expect(loginNotice('?a=1&login=failed')).toEqual({ text: 'Login failed.', search: '?a=1' });
  });

  it('says nothing of anything else', () => {
    expect(loginNotice('')).toBeUndefined();
    expect(loginNotice('?login=other')).toBeUndefined();
    expect(loginNotice('?a=1')).toBeUndefined();
  });

  it('says nothing of the names every object has', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(loginNotice(`?login=${name}`), name).toBeUndefined();
    }
  });
});

describe('loginNoticeFor (review fix 5)', () => {
  const notice = loginNotice('?login=expired');

  it('says why a login did not happen to somebody logged out', () => {
    expect(loginNoticeFor(notice, { loggedIn: false })).toBe(
      'This login link has expired. Ask for a new one with /maps.',
    );
  });

  it('says nothing to somebody logged in: Back after a link login, an old link opened again', () => {
    const me = { loggedIn: true as const, name: 'Ash', csrf: 't', member: true, readOnly: false };
    expect(loginNoticeFor(notice, me)).toBeUndefined();
    expect(loginNoticeFor(loginNotice('?login=failed'), me)).toBeUndefined();
  });

  it('says nothing where the address said nothing', () => {
    expect(loginNoticeFor(undefined, { loggedIn: false })).toBeUndefined();
  });
});

describe('headerLines', () => {
  it('offers the login there is to somebody who is not logged in', () => {
    expect(headerLines({ loggedIn: false }, 'discord', 'map')).toEqual({ login: true, lines: [] });
    expect(headerLines({ loggedIn: false }, 'links', 'map')).toEqual({
      login: false,
      lines: ['Use /maps in Discord to log in.'],
    });
  });

  it('names the member, and says when they belong to no server here or Discord is away', () => {
    const me = { loggedIn: true as const, name: 'Ash', csrf: 't', member: true, readOnly: false };
    expect(headerLines(me, 'discord', 'map')).toEqual({ login: false, name: 'Ash', lines: [] });
    expect(headerLines({ ...me, member: false }, 'discord', 'map')).toEqual({
      login: false,
      name: 'Ash',
      lines: ['You are not a member of this server.'],
    });
    // In the server, without the map's member role: they may browse, and are told what to get.
    expect(
      headerLines({ ...me, member: false, missingRole: 'Verified' }, 'discord', 'map'),
    ).toEqual({
      login: false,
      name: 'Ash',
      lines: [
        'You can look around the map. To join or report here, you need the Verified role in ' +
          'this server.',
      ],
    });
    expect(headerLines({ ...me, member: false, readOnly: true }, 'links', 'map')).toEqual({
      login: false,
      name: 'Ash',
      lines: ['Discord cannot be reached just now, so the map is read-only.'],
    });
  });

  // Plan 8M-11B: a way into the server for somebody logged in who is not in it.
  it('offers the server\'s invite under "You are not a member of this server.", and nowhere else', () => {
    const me = { loggedIn: true as const, name: 'Ash', csrf: 't', member: false, readOnly: false };
    const invite = 'https://discord.gg/pinetest';
    expect(headerLines({ ...me, invite }, 'discord', 'map')).toEqual({
      login: false,
      name: 'Ash',
      lines: ['You are not a member of this server.'],
      invite,
    });
    // Without one in the settings, the page reads as before.
    expect(headerLines(me, 'discord', 'map')).not.toHaveProperty('invite');
    // Only beside that line: a member, or Discord away, gets none whatever the answer holds.
    expect(headerLines({ ...me, member: true, invite }, 'discord', 'map')).not.toHaveProperty(
      'invite',
    );
    expect(headerLines({ ...me, readOnly: true, invite }, 'discord', 'map')).not.toHaveProperty(
      'invite',
    );
  });

  it('opens the invite in a new tab that cannot reach back into the map', () => {
    expect(inviteNode('https://discord.gg/pinetest')).toEqual({
      tag: 'a',
      className: 'invite',
      text: 'Join the server on Discord',
      attributes: { href: 'https://discord.gg/pinetest', target: '_blank', rel: 'noopener' },
    });
  });

  it("tells nobody in the region editor to get the map's member role", () => {
    // A moderator without the role: the editor is theirs as staff, the role is for the map.
    const me = {
      loggedIn: true as const,
      name: 'Brock',
      csrf: 't',
      member: false,
      readOnly: false,
      missingRole: 'Verified',
    };
    expect(headerLines(me, 'discord', 'editor')).toEqual({
      login: false,
      name: 'Brock',
      lines: [],
    });
  });
});

describe('the notice band (plan 8M-11A)', () => {
  /** The band and its text, and timers a test runs by hand. */
  function band() {
    const parts = { band: { hidden: true }, text: { textContent: '' as string | null } };
    const timers: { run: () => void; ms: number; cleared: boolean }[] = [];
    const notice = new NoticeBand(() => parts, {
      set: (run, ms) => {
        timers.push({ run, ms, cleared: false });
        return timers.length - 1;
      },
      clear: (id) => {
        const timer = typeof id === 'number' ? timers[id] : undefined;
        if (timer) timer.cleared = true;
      },
    });
    return { parts, timers, notice };
  }

  it('says a line and hides it by itself after ten seconds', () => {
    const { parts, timers, notice } = band();
    notice.say('Your report is in.');
    expect(parts).toEqual({ band: { hidden: false }, text: { textContent: 'Your report is in.' } });
    expect(timers.map((timer) => timer.ms)).toEqual([NOTICE_MS]);
    timers[0]?.run();
    expect(parts.band.hidden).toBe(true);
  });

  it('starts the ten seconds again with a new line', () => {
    const { parts, timers, notice } = band();
    notice.say('One.');
    notice.say('Two.');
    expect(timers[0]?.cleared).toBe(true);
    expect(parts.text.textContent).toBe('Two.');
    timers[1]?.run();
    expect(parts.band.hidden).toBe(true);
  });

  it('hides at once by its ×', () => {
    const { parts, timers, notice } = band();
    notice.say('One.');
    notice.hide();
    expect(parts.band.hidden).toBe(true);
    expect(timers[0]?.cleared).toBe(true);
  });

  // Review fix F1: a lasting state (the map that did not load, the editor read-only, the
  // browser's storage) stays until the × or the page hides it, never timed out.
  it('keeps a lasting line until its × or the page hides it', () => {
    const { parts, timers, notice } = band();
    notice.say('One.');
    notice.say('The map could not be loaded.', { lasting: true });
    expect(timers[0]?.cleared).toBe(true);
    expect(timers).toHaveLength(1);
    expect(parts).toEqual({
      band: { hidden: false },
      text: { textContent: 'The map could not be loaded.' },
    });
    notice.hide();
    expect(parts.band.hidden).toBe(true);
  });

  // Review fix R2: a timed line over a lasting one gives the lasting one back when its ten seconds
  // are over; the × and the page's hiding forget it.
  it('puts the lasting line back when a timed line over it runs out, until its × hides it', () => {
    const { parts, timers, notice } = band();
    notice.say('The map could not be loaded.', { lasting: true });
    notice.say('Your report is in.');
    expect(parts.text.textContent).toBe('Your report is in.');
    timers[0]?.run();
    expect(parts).toEqual({
      band: { hidden: false },
      text: { textContent: 'The map could not be loaded.' },
    });
    notice.hide();
    expect(parts.band.hidden).toBe(true);
    notice.say('Your report is in.');
    timers[1]?.run();
    expect(parts.band.hidden).toBe(true);
  });
});
