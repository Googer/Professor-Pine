import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { NOTHING_HELD } from '../../test/support/member-data.js';
import { textDisplays, textOf } from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import type { MemberHoldings } from '../db/repositories/member-data-repository.js';
import type { MemberLook } from '../services/member-removal.js';
import { FORGET_TEXT_BUDGET, forgetLookMessage, forgetOutcomeMessage } from './member-removal.js';
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
  savedParties: 0,
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
        history: { optIns: 0, boards: 1, fillIns: 2, named: 1, words: 1 },
        meetups: { blocks: 2, open: 2, unmade: 1, live: 0, over: 1 },
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
      '- The name and description of 1 train or meetup they made, in the history',
      '- 2 requests to add their old-bot history',
      '- Their Discord id and name on 1 meetup request, appeal or place ask that is decided ' +
        'and over',
      '**It leaves:**',
      '- 2 meetup blocks, lifted or not: the moderators need them for the safety of others.',
      '- 2 reports to the moderators about them: the moderators’ record.',
      '- The words of 1 meetup request, appeal or place ask of theirs (a meetup’s name, ' +
        'information and place; an appeal’s or ask’s text) stay, without their name or Discord ' +
        'id: the moderators’ record.',
      '- 2 meetup requests, appeals and place asks of theirs are still open and keep their ' +
        'Discord id and name: have the moderators decide them, then run this again.',
      // No moderator can decide an approval again: the bot makes the meetup.
      '- 1 meetup request of theirs approved and about to be made keeps their Discord id and ' +
        'name: run this again once the meetup is made.',
      '- 1 entry of the staff’s log of who did what that names them: it ages out after 30 days.',
      '- Counts without a name: the history’s entries and the activity.',
      '- Wild spawns they reported name them for about half an hour (the region’s message, the ' +
        'map), and the database holds no id of theirs; the direct messages others got of them ' +
        'keep the name they had.',
      '**Left for you to do by hand:**',
      '- Backups made before the removal hold this data until they age out ' +
        '(`BACKUP_KEEP_DAYS`: 90 days unless you changed it).',
      '- The bot’s logs can hold their Discord id (a command they used, an error); they roll ' +
        'over by themselves.',
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

  it('says what is live and ends by itself apart from what staff saved, and the old bot’s folder', () => {
    const lines = textOf(
      forgetLookMessage(
        ASH,
        look(
          { sessions: 1, stopReports: 1, stopConfirms: 2, accessGrants: 1 },
          { liveParties: 1, savedParties: 2 },
        ),
        CONTROLS,
        { legacyParties: true },
      ),
    ).split('\n');
    // Their settings go at once: those parties treat them as a new member (pings, DMs).
    expect(lines).toContain(
      '- What is live ends by itself: 1 party they made or signed up for (their settings go at ' +
        'once: until it ends, Pine treats them in it as a new member), 1 report at a stop, ' +
        '2 confirmations of others’ reports at stops, 1 forum they were let into for a party.',
    );
    expect(lines).toContain(
      '- 2 parties they made or signed up for that staff saved (`/admin save-party`): they ' +
        'end when staff let them go.',
    );
    expect(lines).toContain(
      '- The old bot’s own `parties/` folder on the host (`LEGACY_PARTIES_DIR`) holds their ' +
        'Discord id in the files of the parties they made or joined, as that bot wrote them; I ' +
        'can only read it: edit those files there.',
    );
    // A saved party alone is not live in the words of the line before.
    const savedOnly = linesOf({ sessions: 1 }, { savedParties: 1 });
    expect(savedOnly.some((line) => line.startsWith('- What is live'))).toBe(false);
    expect(savedOnly).toContain(
      '- 1 party they made or signed up for that staff saved (`/admin save-party`): it ends ' +
        'when staff let it go.',
    );
    expect(savedOnly.join('\n')).not.toContain('LEGACY_PARTIES_DIR');
  });

  it('says an approval whose meetup is still going on stays, until the meetup has ended', () => {
    const meetups = { ...NOTHING_HELD.meetups, live: 1, over: 1 };
    expect(linesOf({ meetups })).toContain(
      '- 1 meetup request of theirs approved, whose meetup is still going on, keeps their ' +
        'Discord id and name (the moderators are told of the meetup’s changes): run this again ' +
        'once the meetup has ended.',
    );
    // In the answer of a removal too, from the look after it.
    const lines = textOf(
      forgetOutcomeMessage(ASH, {
        removed: {
          user: undefined,
          newTrains: 0,
          unownGifts: 0,
          history: NOTHING_HELD.history,
          sessions: [],
          toolAccess: false,
          reportReasons: 0,
          meetupRecords: 1,
        },
        screenshots: { removed: 0, feedback: 0, failed: 0 },
        after: look({ meetups: { ...NOTHING_HELD.meetups, live: 2 } }),
      }),
    ).split('\n');
    expect(lines).toContain(
      '- 2 meetup requests of theirs approved, whose meetups are still going on, keep their ' +
        'Discord id and name (the moderators are told of the meetups’ changes): run this again ' +
        'once the meetups have ended.',
    );
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
      history: { optIns: 999, boards: 999, fillIns: 999, named: 9_999_999, words: 99_999 },
      sessions: 10,
      toolAccess: true,
      reports: { reasons: 99_999, about: 99_999 },
      meetups: { blocks: 999, open: 99_999, unmade: 99_999, live: 99_999, over: 99_999 },
      audit: 99_999,
      stopReports: 99_999,
      stopConfirms: 99_999,
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

  it('keeps the look and the outcome within its budget with every line there, folding the rest', () => {
    const many = 9_999_999;
    const everything: MemberHoldings = {
      user: {
        friendCode: true,
        inGameName: true,
        pokebattlerId: true,
        wants: many,
        targetWants: many,
        gymTargets: many,
        savedRoutes: many,
      },
      newTrains: many,
      unownGifts: many,
      history: { optIns: many, boards: many, fillIns: many, named: many, words: many },
      sessions: many,
      toolAccess: true,
      reports: { reasons: many, about: many },
      meetups: { blocks: many, open: many, unmade: many, live: many, over: many },
      audit: many,
      stopReports: many,
      stopConfirms: many,
      accessGrants: many,
      staffActs: many,
    };
    const full = look(everything, {
      screenshots: { sent: many, feedback: many },
      liveParties: many,
      savedParties: many,
      legacyFiles: Array.from({ length: 400 }, (_unused, n) =>
        String(412345678901234500n + BigInt(n)),
      ),
    });
    // The longest name Discord gives, all of it escaped; the longest repository GitHub takes.
    const member = { id: ASH.id, name: '*_'.repeat(16) };
    const byHand = { requestsRepo: `${'o'.repeat(39)}/${'r'.repeat(100)}`, legacyParties: true };
    const length = (message: ReturnType<typeof forgetLookMessage>) =>
      textDisplays(message).reduce((sum, text) => sum + text.length, 0);
    const shown = forgetLookMessage(member, full, CONTROLS, byHand);
    const outcome = forgetOutcomeMessage(
      member,
      {
        removed: {
          user: everything.user,
          newTrains: many,
          unownGifts: many,
          history: everything.history,
          sessions: Array.from({ length: 10 }, (_unused, n) => String(n)),
          toolAccess: true,
          reportReasons: many,
          meetupRecords: many,
        },
        screenshots: { removed: many, feedback: many, failed: many },
        after: full,
      },
      byHand,
    );
    for (const message of [shown, outcome]) {
      expect(length(message)).toBeLessThanOrEqual(FORGET_TEXT_BUDGET);
      expectV2Sendable(message);
    }
    // What is taken is said whole; the rest is folded, and says that it is.
    expect(textOf(shown)).toContain('- Their access to the Wayfarer export tool');
    expect(textOf(shown)).toContain('Remove…, within 10 minutes');
    expect(FORGET_TEXT_BUDGET).toBeLessThanOrEqual(3_500);
    for (const message of [shown, outcome]) {
      const lines = textOf(message).split('\n');
      // The hand-work whole, what stays folded where it ran out of room.
      expect(lines).toContain('- Posts on Discord that name them are not edited.');
      expect(
        lines.some((line) => /^- …and [\d,]+ more lines? that do(es)? not fit/.test(line)),
      ).toBe(true);
    }
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
