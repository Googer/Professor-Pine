import { describe, expect, it } from 'vitest';
import { topAnswer, type Membership, type TopFacts } from './top-answer.js';

const PINEWOOD = { id: '410000000000000001', name: 'Pinewood' };
const OAKVALE = { id: '410000000000000002', name: 'Oakvale' };
const ELMHURST = { id: '410000000000000003', name: 'Elmhurst' };
const OAK_INVITE = 'https://discord.gg/oakvale';
const ELM_INVITE = 'https://discord.com/invite/elmhurst';

/** The facts of a request: two servers with a map, logged out, Discord's login on. */
function facts(change: Partial<TopFacts> = {}): TopFacts {
  return {
    servers: [PINEWOOD, OAKVALE],
    unavailable: [],
    visitor: undefined,
    discordLogin: true,
    memberships: new Map(),
    invites: undefined,
    loginFailed: false,
    ...change,
  };
}

/** Logged in as Ash, with these answers of the member directory. */
const ash = (memberships: Record<string, Membership>, change: Partial<TopFacts> = {}) =>
  facts({ visitor: { name: 'Ash' }, memberships: new Map(Object.entries(memberships)), ...change });

describe('topAnswer', () => {
  it('says there is no map here yet while no server has one, logged in or not (rule 2)', () => {
    expect(topAnswer(facts({ servers: [] }))).toEqual({ kind: 'no-map' });
    expect(topAnswer(ash({}, { servers: [] }))).toEqual({ kind: 'no-map' });
    expect(topAnswer(facts({ servers: [], loginFailed: true }))).toEqual({ kind: 'no-map' });
  });

  it('offers the login to a visitor not logged in, whatever the number of servers (rules 3, 5)', () => {
    const one = topAnswer(facts({ servers: [PINEWOOD] }));
    const several = topAnswer(facts({ servers: [PINEWOOD, OAKVALE, ELMHURST] }));
    expect(one).toEqual({ kind: 'login', discord: true, failed: false });
    // A visitor logged out cannot tell one server from several, nor see any invite.
    expect(several).toEqual(one);
    expect(topAnswer(facts({ invites: { [OAKVALE.id]: OAK_INVITE } }))).toEqual(one);
  });

  it('says only /maps without the client secret, and that a login failed after one did (rule 3)', () => {
    expect(topAnswer(facts({ discordLogin: false }))).toEqual({
      kind: 'login',
      discord: false,
      failed: false,
    });
    expect(topAnswer(facts({ loginFailed: true }))).toEqual({
      kind: 'login',
      discord: true,
      failed: true,
    });
    // Without the client secret there was no login with Discord to fail.
    expect(topAnswer(facts({ discordLogin: false, loginFailed: true }))).toEqual({
      kind: 'login',
      discord: false,
      failed: false,
    });
  });

  it('leads straight to the map of the one server of theirs, with none to join and every answer in (rule 4)', () => {
    expect(topAnswer(ash({ [PINEWOOD.id]: 'member', [OAKVALE.id]: 'not' }))).toEqual({
      kind: 'redirect',
      to: `/s/${PINEWOOD.id}/map`,
    });
    // Logged in by a link of /maps, without the client secret: the same.
    expect(
      topAnswer(ash({ [PINEWOOD.id]: 'member', [OAKVALE.id]: 'not' }, { discordLogin: false })),
    ).toEqual({ kind: 'redirect', to: `/s/${PINEWOOD.id}/map` });
  });

  it('never redirects to anything but a page of a server here', () => {
    const odd = { id: '//evil.example.test', name: 'Odd' };
    expect(topAnswer(ash({ [odd.id]: 'member' }, { servers: [odd] }))).toMatchObject({
      kind: 'servers',
      yours: [odd],
    });
  });

  it('lists the servers of theirs by name when there are several, without a redirect (rule 4)', () => {
    const lower = { id: '410000000000000004', name: 'oakvale annex' };
    const accented = { id: '410000000000000005', name: 'Ébène' };
    const answer = topAnswer(
      ash(
        {
          [PINEWOOD.id]: 'member',
          [OAKVALE.id]: 'member',
          [lower.id]: 'member',
          [accented.id]: 'member',
        },
        { servers: [PINEWOOD, OAKVALE, lower, accented] },
      ),
    );
    expect(answer).toEqual({
      kind: 'servers',
      visitor: 'Ash',
      yours: [accented, OAKVALE, lower, PINEWOOD],
      toJoin: [],
      notIn: false,
      partial: false,
    });
  });

  it('lists the one server of theirs when a server could be joined, with the invite under it (rule 4)', () => {
    expect(
      topAnswer(
        ash(
          { [PINEWOOD.id]: 'member', [OAKVALE.id]: 'not', [ELMHURST.id]: 'not' },
          {
            servers: [PINEWOOD, OAKVALE, ELMHURST],
            invites: { [OAKVALE.id]: OAK_INVITE, [ELMHURST.id]: ELM_INVITE },
          },
        ),
      ),
    ).toEqual({
      kind: 'servers',
      visitor: 'Ash',
      yours: [PINEWOOD],
      toJoin: [
        { ...ELMHURST, invite: ELM_INVITE },
        { ...OAKVALE, invite: OAK_INVITE },
      ],
      notIn: false,
      partial: false,
    });
  });

  it('says they are in no server here, with the servers they could join (rule 4)', () => {
    expect(
      topAnswer(
        ash(
          { [PINEWOOD.id]: 'not', [OAKVALE.id]: 'not' },
          { invites: { [OAKVALE.id]: OAK_INVITE } },
        ),
      ),
    ).toEqual({
      kind: 'servers',
      visitor: 'Ash',
      yours: [],
      toJoin: [{ ...OAKVALE, invite: OAK_INVITE }],
      notIn: true,
      partial: false,
    });
  });

  it('names no server they are not in that has no invite (rule 5)', () => {
    const answer = topAnswer(
      ash(
        { [PINEWOOD.id]: 'not', [OAKVALE.id]: 'not' },
        // An invite of a server without a map, or of one the bot is not in, is not offered.
        { invites: { [ELMHURST.id]: ELM_INVITE } },
      ),
    );
    expect(answer).toEqual({
      kind: 'servers',
      visitor: 'Ash',
      yours: [],
      toJoin: [],
      notIn: true,
      partial: false,
    });
  });

  it('never redirects while a lookup failed, and lists what was found (rule 4)', () => {
    expect(topAnswer(ash({ [PINEWOOD.id]: 'member', [OAKVALE.id]: 'unknown' }))).toEqual({
      kind: 'servers',
      visitor: 'Ash',
      yours: [PINEWOOD],
      toJoin: [],
      notIn: false,
      partial: true,
    });
    // Nothing found and not every answer in: not "you are in no server".
    expect(
      topAnswer(
        ash(
          { [PINEWOOD.id]: 'unknown', [OAKVALE.id]: 'not' },
          { invites: { [OAKVALE.id]: OAK_INVITE } },
        ),
      ),
    ).toEqual({
      kind: 'servers',
      visitor: 'Ash',
      yours: [],
      // A server Discord could not say of is never offered to join: they may be in it.
      toJoin: [{ ...OAKVALE, invite: OAK_INVITE }],
      notIn: false,
      partial: true,
    });
  });

  it('counts a server it has no answer for as a failed lookup', () => {
    expect(topAnswer(ash({ [PINEWOOD.id]: 'member' }))).toMatchObject({
      kind: 'servers',
      yours: [PINEWOOD],
      partial: true,
    });
  });

  it('never says there is no map while a server with one is unavailable: the login logged out (F1)', () => {
    const only = { servers: [], unavailable: [OAKVALE.id] };
    expect(topAnswer(facts(only))).toEqual({ kind: 'login', discord: true, failed: false });
    // Logged out, the page is the same as with every server available.
    expect(topAnswer(facts(only))).toEqual(topAnswer(facts()));
  });

  it('counts a server unavailable as one Discord did not answer for, logged in (F1)', () => {
    // Nothing else: not "no map", not "not in", and nothing named.
    expect(topAnswer(ash({}, { servers: [], unavailable: [OAKVALE.id] }))).toEqual({
      kind: 'servers',
      visitor: 'Ash',
      yours: [],
      toJoin: [],
      notIn: false,
      partial: true,
    });
    // One server of theirs beside it: no redirect, which the unavailable one might have changed.
    expect(
      topAnswer(
        ash(
          { [PINEWOOD.id]: 'member' },
          {
            servers: [PINEWOOD],
            unavailable: [OAKVALE.id],
            invites: { [OAKVALE.id]: OAK_INVITE },
          },
        ),
      ),
    ).toEqual({
      kind: 'servers',
      visitor: 'Ash',
      // Its invite is not offered: it is not named, and they may be in it.
      yours: [PINEWOOD],
      toJoin: [],
      notIn: false,
      partial: true,
    });
  });

  it('shows the failed login only to a visitor who is not logged in', () => {
    expect(
      topAnswer(ash({ [PINEWOOD.id]: 'member', [OAKVALE.id]: 'not' }, { loginFailed: true })),
    ).toEqual({
      kind: 'redirect',
      to: `/s/${PINEWOOD.id}/map`,
    });
  });
});
