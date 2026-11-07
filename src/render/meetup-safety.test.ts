import { ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  LIBRARY,
  newAppeal,
  newRequest,
  requestId,
  SAFETY_NOW,
  SAFETY_PIN,
} from '../../test/support/meetup-safety-cases.js';
import {
  accentOf,
  buttonsOf,
  textDisplays,
  textOf,
  thumbnailOf,
} from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import {
  MAX_APPEAL,
  type MeetupAppeal,
  type MeetupRequestRecord,
} from '../domain/meetups/records.js';
import { MAX_MEETUP_DESCRIPTION, MAX_PARTY_NAME } from '../domain/party/party.js';
import {
  appealMessage,
  PENDING_ACCENT,
  requestMessage,
  requestOutcomeDm,
} from './meetup-safety.js';
import { plainLines } from './text.js';

function pending(overrides: Partial<MeetupRequestRecord> = {}): MeetupRequestRecord {
  return {
    ...newRequest(1),
    status: 'pending',
    decision: null,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    partyId: null,
    failure: null,
    ...overrides,
  };
}

describe('requestMessage', () => {
  it('shows the moderators who asked, where, the name, the start and the information', () => {
    const message = requestMessage(pending());
    expect(accentOf(message)).toBe(PENDING_ACCENT);
    expect(textDisplays(message)[0]).toMatch(/^### Meetup waiting for approval\n/);
    const text = textOf(message);
    expect(text).toContain('**Book swap**');
    expect(text).toContain(`Starts <t:${String((SAFETY_NOW + 24 * 3_600_000) / 1000)}:F>`);
    expect(text).toContain(`Asked by **Alice** (<@200000000000000002>) in <#100000000000000001>`);
    expect(text).toContain(
      '**Where**\nNear **Little Free Library** (PokéStop) · 12 Market Street · [Map](<',
    );
    expect(text).toContain('**Information**\nBring a book.\n\nTake a book.');
    expect(text).toContain(`Expires <t:${String((SAFETY_NOW + 23 * 3_600_000) / 1000)}:R>`);
    // The Wayspot's picture beside where it is.
    expect(thumbnailOf(message)).toBe(LIBRARY.image);
    expect(
      buttonsOf(message).map(({ label, customId, style }) => [label, customId, style]),
    ).toEqual([
      ['Approve', `msafety:${requestId(1)}:approve`, ButtonStyle.Success],
      ['Approve once', `msafety:${requestId(1)}:approve-once`, ButtonStyle.Primary],
      ['Refuse', `msafety:${requestId(1)}:refuse`, ButtonStyle.Secondary],
      ['Refuse from now on', `msafety:${requestId(1)}:refuse-forever`, ButtonStyle.Danger],
      ['Block member', `msafety:${requestId(1)}:block`, ButtonStyle.Danger],
    ]);
    expectV2Sendable(message);
  });

  it('says a place has no address where its picture stands beside it, and not without one', () => {
    const library = pending().place;
    if (library.kind === 'pin') throw new Error('the request is at a PokéStop');
    const pictured = textOf(requestMessage(pending({ place: { ...library, address: null } })));
    expect(pictured).toContain(
      'Near **Little Free Library** (PokéStop) · (no address available) · [Map](<',
    );
    const bare = textOf(
      requestMessage(pending({ place: { ...library, address: null, image: null } })),
    );
    expect(bare).toContain('Near **Little Free Library** (PokéStop) · [Map](<');
  });

  it('says that a meetup was asked for on the live map, before and after it is decided', () => {
    const asked = `Asked by **Alice** (<@200000000000000002>) on the map in <#100000000000000001>`;
    expect(textOf(requestMessage(pending({ source: 'map' })))).toContain(asked);
    const decided = pending({
      source: 'map',
      status: 'refused',
      decision: 'refuse',
      decidedBy: '200000000000000009',
      decidedAt: SAFETY_NOW,
    });
    expect(textOf(requestMessage(decided))).toContain(asked);
    expect(textOf(requestMessage(pending()))).not.toContain('on the map');
  });

  it('offers no ruling for a pin: Approve once, Refuse and Block member', () => {
    const message = requestMessage(pending({ place: SAFETY_PIN }));
    expect(textOf(message)).toContain(
      '**Where**\n📍 Near **Fountain Square** (PokéStop) · [Map](<',
    );
    expect(textOf(message)).toContain('A pin is approved for this meetup alone.');
    expect(thumbnailOf(message)).toBeUndefined();
    expect(buttonsOf(message).map((button) => button.label)).toEqual([
      'Approve once',
      'Refuse',
      'Block member',
    ]);
  });

  it('shows what members wrote as text, never as markdown, mentions or links', () => {
    const message = requestMessage(
      pending({
        name: '**Big** @everyone',
        description: '# Heading\n<@1234> [click](https://evil.example)',
        makerName: '__Alice__',
      }),
    );
    const text = textOf(message);
    expect(text).not.toContain('**Big**');
    expect(text).not.toMatch(/^# Heading/m);
    expect(text).not.toContain('[click](');
    expect(text).not.toContain('__Alice__');
  });

  it('names why an approved meetup could not be made, as kept with the request', () => {
    const failed = (failure: MeetupRequestRecord['failure']) =>
      textOf(
        requestMessage(
          pending({
            status: 'failed',
            decision: 'approve',
            decidedBy: '200000000000000009',
            decidedByName: 'Mod',
            decidedAt: SAFETY_NOW,
            failure,
          }),
        ),
      );
    const by = `by **Mod** (<@200000000000000009>) <t:${String(SAFETY_NOW / 1000)}:R>`;
    expect(
      failed({ kind: 'posts-refused', forumId: '300000000000000001', missing: ['Manage Posts'] }),
    ).toContain(
      `**Approved** ${by}, but the meetup could not be made: I am not allowed to make posts ` +
        "in <#300000000000000001> (the server's staff must give me Manage Posts there). Its " +
        'maker was told.',
    );
    expect(failed({ kind: 'posts-refused', forumId: '300000000000000001', missing: [] })).toContain(
      ', but the meetup could not be made: Discord does not let me make posts in ' +
        "<#300000000000000001> (the server's staff must check that I have View Channel, Create " +
        'Posts, Send Messages in Posts and Manage Posts there). Its maker was told.',
    );
    expect(failed({ kind: 'no-forum' })).toContain(
      ', but the meetup could not be made: its region has no forum. Its maker was told.',
    );
    expect(failed({ kind: 'bad-name' })).toContain(
      ', but the meetup could not be made: its name is empty or too long. Its maker was told.',
    );
    expect(failed({ kind: 'error' })).toContain(
      ', but the meetup could not be made: something went wrong. Its maker was told.',
    );
    // A request failed before the reason was kept says what it always said.
    expect(failed(null)).toContain(
      `**Approved** ${by}, but the meetup could not be made. Its maker was told.`,
    );
  });

  it('tells the maker of a failed approval what to change when the name or information is at fault', () => {
    const dm = (failure: MeetupRequestRecord['failure']) =>
      textOf(requestOutcomeDm(pending({ status: 'failed', decision: 'approve', failure })));
    const head = 'A moderator approved your meetup **Book swap**, but I could not make it: ';
    expect(dm({ kind: 'bad-name' })).toBe(
      `${head}its name is empty or too long. Use \`/meetup\` again with a shorter name.`,
    );
    expect(dm({ kind: 'bad-description' })).toBe(
      `${head}its information is too long. Use \`/meetup\` again with shorter information.`,
    );
    expect(dm({ kind: 'no-forum' })).toBe(
      `${head}its region has no forum. Use \`/meetup\` again later.`,
    );
  });

  it('fits the longest name, title and information with every character escaped', () => {
    const message = requestMessage(
      pending({
        name: '*'.repeat(MAX_PARTY_NAME),
        makerName: '_'.repeat(100),
        description: '*'.repeat(MAX_MEETUP_DESCRIPTION),
        place: { ...LIBRARY, title: '_'.repeat(255), address: '*'.repeat(500) },
      }),
    );
    expectV2Sendable(message);
    // The information is never cut.
    expect(textOf(message)).toContain(plainLines('*'.repeat(MAX_MEETUP_DESCRIPTION)));
  });
});

describe('appealMessage', () => {
  const appeal: MeetupAppeal = {
    ...newAppeal(1),
    status: 'open',
    channelId: null,
    messageId: null,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
  };
  const block = {
    serverId: appeal.serverId,
    memberId: appeal.memberId,
    memberName: 'Alice',
    blockedBy: '200000000000000009',
    blockedByName: 'Mod',
    blockedAt: SAFETY_NOW,
  };

  it('fits the longest words and names with every character escaped, never cutting the words', () => {
    const message = appealMessage(
      { ...appeal, memberName: '_'.repeat(100), text: '*'.repeat(MAX_APPEAL) },
      { ...block, blockedByName: '_'.repeat(100) },
    );
    expectV2Sendable(message);
    expect(textOf(message)).toContain(plainLines('*'.repeat(MAX_APPEAL)));
  });

  it('shows the outcome without buttons once decided', () => {
    const kept = appealMessage(
      {
        ...appeal,
        status: 'kept',
        decidedBy: '200000000000000009',
        decidedByName: 'Mod',
        decidedAt: SAFETY_NOW,
      },
      block,
    );
    expect(buttonsOf(kept)).toEqual([]);
    expect(textOf(kept)).toContain(
      `**Kept** by **Mod** (<@200000000000000009>) <t:${String(SAFETY_NOW / 1000)}:R>: they can appeal again <t:${String((SAFETY_NOW + 7 * 86_400_000) / 1000)}:R>.`,
    );
  });
});
