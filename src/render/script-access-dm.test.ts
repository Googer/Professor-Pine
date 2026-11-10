import { describe, expect, it } from 'vitest';
import type { ScriptAccess } from '../domain/script-access/access.js';
import { checkDm } from '../../test/support/dms.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import { accessDecidedDm, accessRequestDm } from './script-access-dm.js';

const ASKED_AT = Date.UTC(2026, 9, 19, 12);
/** What breaks an address in text that reaches another member (`plainNoLinks`). */
const ZERO_WIDTH = String.fromCharCode(0x200b);

const request = (overrides: Partial<ScriptAccess> = {}): ScriptAccess => ({
  id: 7,
  userId: '200000000000000021',
  name: 'Ash_K',
  community: 'Pinewood raiders, see https://evil.example.test/join',
  state: 'asked',
  key: null,
  askedAt: ASKED_AT,
  decidedAt: null,
  lastFetchAt: null,
  lastVersion: null,
  ...overrides,
});

describe('the DM of a request for the Wayfarer export tool', () => {
  it('says who asks by name and id, for which community, when, and pings nobody', () => {
    const message = accessRequestDm(request());
    checkDm(message);
    expectV2Sendable(message);
    const text = textOf(message);
    expect(text).toContain('Ash\\_K');
    expect(text).toContain('200000000000000021');
    expect(text).not.toContain('<@');
    // The community line is no link: the address is broken by a zero-width space.
    expect(text).toContain(
      `Community: Pinewood raiders, see https:${ZERO_WIDTH}//evil.example.${ZERO_WIDTH}test/join`,
    );
    expect(text).toContain(`<t:${ASKED_AT / 1000}:f>`);
  });

  it('carries Approve and Refuse for the request as it was asked (its time in base 36)', () => {
    const asked = ASKED_AT.toString(36);
    expect(
      buttonsOf(accessRequestDm(request())).map((button) => [button.label, button.customId]),
    ).toEqual([
      ['Approve', `scriptaccess:7:approve:${asked}`],
      ['Refuse', `scriptaccess:7:refuse:${asked}`],
    ]);
  });

  it('says of a request asked again since its DM that the new asking is decided apart', () => {
    const again = ASKED_AT + 31 * 86_400_000;
    expect(textOf(accessDecidedDm(request({ askedAt: again }), { before: true }))).toContain(
      `Asked again since, <t:${again / 1000}:f>: decide it on its new DM or on the page.`,
    );
  });

  it('redraws a DM of an asking renewed since with its own asking, not the new one’s words', () => {
    const again = ASKED_AT + 31 * 86_400_000;
    const renewed = request({ askedAt: again, community: 'Oakdale trainers' });
    const waiting = textOf(accessDecidedDm(renewed, { before: true, askedAt: ASKED_AT }));
    expect(waiting).toContain(`Asked <t:${ASKED_AT / 1000}:f>.`);
    expect(waiting).not.toContain(`Asked <t:${again / 1000}:f>.`);
    // The DM's own community line is not kept: the newer one is not put in its place.
    expect(waiting).not.toContain('Oakdale');
    expect(waiting).not.toContain('Community:');
    expect(waiting).toContain('Ash\\_K');
    expect(waiting).toContain(
      `Asked again since, <t:${again / 1000}:f>: decide it on its new DM or on the page.`,
    );
    // The new asking decided meanwhile: said as the new asking's decision, not this DM's.
    const decidedAt = again + 60_000;
    const decided = textOf(
      accessDecidedDm(
        { ...renewed, state: 'approved', decidedAt },
        { before: true, askedAt: ASKED_AT },
      ),
    );
    expect(decided).toContain(`Asked <t:${ASKED_AT / 1000}:f>.`);
    expect(decided).not.toContain('Oakdale');
    expect(decided).toContain(
      `Asked again since, <t:${again / 1000}:f>, and decided: **approved** <t:${decidedAt / 1000}:f>.`,
    );
    // The DM of the asking as it stands is drawn as before.
    expect(textOf(accessDecidedDm(renewed, { before: true, askedAt: again }))).toContain(
      'Community: Oakdale trainers',
    );
  });

  it('says what was decided and when, without its buttons', () => {
    const decidedAt = ASKED_AT + 60_000;
    const approved = accessDecidedDm(request({ state: 'approved', decidedAt }));
    checkDm(approved);
    expect(buttonsOf(approved)).toEqual([]);
    expect(textOf(approved)).toContain(`**Approved** <t:${decidedAt / 1000}:f>.`);
    expect(textOf(approved)).toContain('200000000000000021');
    expect(textOf(accessDecidedDm(request({ state: 'refused', decidedAt })))).toContain(
      `**Refused** <t:${decidedAt / 1000}:f>.`,
    );
    expect(
      textOf(accessDecidedDm(request({ state: 'revoked', decidedAt }), { before: true })),
    ).toContain(`Decided already: **revoked** <t:${decidedAt / 1000}:f>.`);
  });
});
