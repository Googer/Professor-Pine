import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { NOTHING_HELD } from '../../test/support/member-data.js';
import { textOf } from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import type { MemberHoldings } from '../db/repositories/member-data-repository.js';
import type { MemberLook } from '../services/member-removal.js';
import { forgetLookMessage, forgetOutcomeMessage } from './member-removal.js';
import { plainNoLinks } from './text.js';

const ASH = { id: '300000000000000001', name: 'Ash' };
const CONTROLS = {
  remove: new ButtonBuilder()
    .setCustomId('forget:0123456789abcdef:ask')
    .setLabel('Remove…')
    .setStyle(ButtonStyle.Danger)
    .toJSON(),
  minutes: 10,
};

const look = (held: Partial<MemberHoldings>, more: Partial<MemberLook> = {}): MemberLook => ({
  memberId: ASH.id,
  held: { ...NOTHING_HELD, ...held },
  screenshots: { sent: 0, feedback: 0 },
  liveParties: 0,
  legacyFiles: [],
  ...more,
});
const linesOf = (held: Partial<MemberHoldings>, more: Partial<MemberLook> = {}) =>
  textOf(forgetLookMessage(ASH, look(held, more), CONTROLS)).split('\n');

describe('the look and the outcome of `/admin forget` in words (plan 8G)', () => {
  it('says one of a thing as one, and each kind by itself', () => {
    expect(
      linesOf({
        user: {
          friendCode: false,
          inGameName: false,
          pokebattlerId: true,
          wants: 0,
          targetWants: 1,
          gymTargets: 0,
          savedRoutes: 0,
        },
        history: { optIns: 0, boards: 1, fillIns: 2, named: 1 },
        meetups: { blocks: 2, open: 2, over: 1 },
        reports: { reasons: 0, about: 2 },
        audit: 1,
      }),
    ).toEqual([
      '### What Pine holds of **Ash** (<@300000000000000001>)',
      'Across every server.',
      '**Remove… takes away, for good:**',
      '- Their settings, with their Pokebattler id',
      '- 1 want',
      // A place on the boards that outlived its history switch is named with its servers.
      '- Their place on the boards in 1 server',
      '- Their Discord id on 1 history entry (the entries stay and count, without it)',
      '- 2 requests to add their old-bot history',
      '- Their Discord id and name on 1 meetup request, appeal or place ask that is decided ' +
        'and over',
      '**It leaves:**',
      '- 2 meetup blocks, lifted or not: the moderators need them for the safety of others.',
      '- 2 reports to the moderators about them: the moderators’ record.',
      '- 2 meetup requests, appeals and place asks of theirs are still open and keep their ' +
        'Discord id and name: have the moderators decide them, then run this again.',
      '- 1 entry of the staff’s log of who did what: it ages out after 30 days.',
      '- Counts without a name: the history’s entries and the activity.',
      '**Left for you to do by hand:**',
      '- Backups made before the removal hold this data until they age out ' +
        '(`BACKUP_KEEP_DAYS`: 90 days unless you changed it).',
      '- Posts on Discord that name them are not edited.',
      '-# Only you can press Remove…, within 10 minutes. Nothing is sent to them.',
    ]);
    // Feedback alone, on others' screenshots; a row of settings with nothing set.
    const feedback = linesOf({ user: { ...EMPTY_ROW } }, { screenshots: { sent: 0, feedback: 2 } });
    expect(feedback.slice(2, 5)).toEqual([
      '**Remove… takes away, for good:**',
      '- Their settings',
      '- Their feedback on 2 others',
    ]);
  });

  it('shows a name that is Markdown as plain text without a working link or ping', () => {
    const name = '**@everyone** [x](https://a.example)';
    const message = forgetLookMessage({ id: ASH.id, name }, look({ sessions: 1 }), CONTROLS);
    const [title] = textOf(message).split('\n');
    // As every member's name is shown (`memberText`): escaped, its address and ping broken.
    expect(title).toBe(`### What Pine holds of **${plainNoLinks(name)}** (<@300000000000000001>)`);
    expect(title).toContain('\\*\\*');
    expect(title).not.toContain('@everyone');
    expect(title).not.toContain('https://');
  });

  it('stays a message Discord takes with everything there is, in many servers', () => {
    const everything: MemberHoldings = {
      user: {
        friendCode: true,
        inGameName: true,
        pokebattlerId: true,
        wants: 99_999,
        targetWants: 99_999,
        gymTargets: 99_999,
        savedRoutes: 99_999,
      },
      newTrains: 999,
      unownGifts: 999,
      history: { optIns: 999, boards: 999, fillIns: 999, named: 9_999_999 },
      sessions: 10,
      toolAccess: true,
      reports: { reasons: 99_999, about: 99_999 },
      meetups: { blocks: 999, open: 99_999, over: 99_999 },
      audit: 99_999,
      stopReports: 99_999,
      accessGrants: 99_999,
      staffActs: 99_999,
    };
    const full = look(everything, {
      screenshots: { sent: 99_999, feedback: 99_999 },
      liveParties: 999,
      // A file of theirs in the index of forty servers.
      legacyFiles: Array.from({ length: 40 }, (_unused, n) =>
        String(412345678901234500n + BigInt(n)),
      ),
    });
    const byHand = { requestsRepo: `${'o'.repeat(39)}/${'r'.repeat(100)}` };
    const shown = forgetLookMessage(ASH, full, CONTROLS, byHand);
    expectV2Sendable(shown);
    // The first six files by their paths; the rest are the same file name in more folders.
    const paths = [0, 1, 2, 3, 4, 5].map((n) => `\`41234567890123450${String(n)}/${ASH.id}.json\``);
    expect(
      textOf(shown)
        .split('\n')
        .find((line) => line.includes('old-bot history on the host')),
    ).toBe(
      '- Their old-bot history on the host, which I can only read: delete ' +
        `${paths.slice(0, 5).join(', ')} and ${paths[5] ?? ''} in the member index folder ` +
        '(`LEGACY_INDEX_DIR`), and the file of that name in 34 more server folders there.',
    );
    expectV2Sendable(
      forgetOutcomeMessage(
        ASH,
        {
          removed: {
            user: everything.user,
            newTrains: 999,
            unownGifts: 999,
            history: everything.history,
            sessions: Array.from({ length: 10 }, (_unused, n) => String(n)),
            toolAccess: true,
            reportReasons: 99_999,
            meetupRecords: 99_999,
          },
          screenshots: { removed: 99_999, feedback: 99_999, failed: 99_999 },
          after: full,
        },
        byHand,
      ),
    );
  });
});

const EMPTY_ROW = {
  friendCode: false,
  inGameName: false,
  pokebattlerId: false,
  wants: 0,
  targetWants: 0,
  gymTargets: 0,
  savedRoutes: 0,
};
