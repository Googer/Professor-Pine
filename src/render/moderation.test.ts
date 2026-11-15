import { ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  LIBRARY,
  MOD,
  requestId,
  SAFETY_NOW,
  SAFETY_PIN,
  SAFETY_SERVER,
} from '../../test/support/meetup-safety-cases.js';
import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
import { checkModal } from '../../test/support/fake-interactions.js';
import { accentOf, buttonsOf, linksOf, textDisplays, textOf } from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import {
  messageSubject,
  partySubject,
  reason,
  OTHER_REPORTER,
  REPORTER,
} from '../../test/support/report-cases.js';
import {
  MAX_REPORT_REASON,
  type ModerationReport,
  type ReportSubject,
} from '../domain/moderation/reports.js';
import { PENDING_ACCENT } from './meetup-safety.js';
import { openToken } from '../discord/dialog.js';
import { listTierNote, removalDialog, reportMessage, type ListTierNotice } from './moderation.js';
import { plain, plainLines } from './text.js';

const HOUR = 3_600_000;

function open(subject: ReportSubject = partySubject(), more: Partial<ModerationReport> = {}) {
  return {
    id: requestId(201),
    serverId: SAFETY_SERVER,
    subject,
    createdAt: SAFETY_NOW,
    status: 'open',
    removal: null,
    channelId: '600000000000000777',
    messageId: '600000000000000005',
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    reasons: [reason()],
    ...more,
  } satisfies ModerationReport;
}

const actions = (report: ModerationReport) =>
  buttonsOf(reportMessage(report)).map(({ label, customId, style }) => [label, customId, style]);

describe('reportMessage of a party', () => {
  it('shows the meetup, who made it, where, its information and the reasons with reporters', () => {
    const message = reportMessage(
      open(partySubject(), {
        reasons: [
          reason(REPORTER, { text: 'It is a **home** [x](https://e.vil)' }),
          reason(OTHER_REPORTER, { at: SAFETY_NOW + HOUR, text: 'Private.' }),
        ],
      }),
    );
    expect(accentOf(message)).toBe(PENDING_ACCENT);
    expect(textDisplays(message)[0]).toMatch(/^### Reported meetup\n\*\*Book swap\*\*\n/);
    const text = textOf(message);
    expect(text).toContain('Starts <t:1792086400:t>');
    expect(text).toContain('Created by **Alice** (<@200000000000000002>) in <#100000000000000001>');
    expect(text).toContain(
      '**Where**\nNear **Little Free Library** (PokéStop) · 12 Market Street · [Map](<',
    );
    expect(text).toContain('**Information**\nBring a book.');
    expect(text).toContain(
      '**Reasons** (2)\n' +
        `**Carol** (<@${REPORTER}>) <t:${String(SAFETY_NOW / 1000)}:R>: ` +
        `${plain('It is a **home** [x](https://e.vil)')}\n` +
        `**Dave** (<@${OTHER_REPORTER}>) <t:${String((SAFETY_NOW + HOUR) / 1000)}:R>: Private.`,
    );
    expect(actions(open())).toEqual([
      ['Close…', `mreport:${requestId(201)}:close`, ButtonStyle.Danger],
      ['Refuse place…', `mreport:${requestId(201)}:refuse`, ButtonStyle.Danger],
      ['Block maker…', `mreport:${requestId(201)}:block`, ButtonStyle.Danger],
      ['Dismiss', `mreport:${requestId(201)}:dismiss`, ButtonStyle.Secondary],
      ['Go to post', undefined, ButtonStyle.Link],
    ]);
    expect(linksOf(message)).toEqual([
      `Go to post https://discord.com/channels/${SAFETY_SERVER}/700000000000000123`,
    ]);
  });

  it('offers a raid or train Close… and Dismiss alone, and a meetup at a pin no ruling', () => {
    const raid = open(
      partySubject({ partyType: 'raid', title: 'T5 Yveltal at Frog Fountain', information: null }),
    );
    expect(actions(raid).map(([label]) => label)).toEqual(['Close…', 'Dismiss', 'Go to post']);
    expect(textDisplays(reportMessage(raid))[0]).toMatch(/^### Reported raid\n/);
    expect(textOf(reportMessage(raid))).toContain('Reported by **Alice**');
    const train = open(partySubject({ partyType: 'train', information: null }));
    expect(actions(train).map(([label]) => label)).toEqual(['Close…', 'Dismiss', 'Go to post']);
    const atPin = open(partySubject({ place: SAFETY_PIN }));
    expect(actions(atPin).map(([label]) => label)).toEqual([
      'Close…',
      'Block maker…',
      'Dismiss',
      'Go to post',
    ]);
  });

  it('names a gym’s official name beside the nickname its post shows', () => {
    const gym = { ...LIBRARY, kind: 'gym' as const, id: '7', title: 'Plaza Fountain' };
    const text = textOf(
      reportMessage(open(partySubject({ place: gym, officialName: 'Frog Fountain' }))),
    );
    expect(text).toContain('Near **Plaza Fountain** (gym; officially **Frog Fountain**) ·');
  });

  it('shows what was decided, by whom and when, without buttons but the way to the post', () => {
    const decided = (more: Partial<ModerationReport>) =>
      reportMessage(
        open(partySubject(), {
          decidedBy: MOD.id,
          decidedByName: 'Mod',
          decidedAt: MOD.at,
          ...more,
        }),
      );
    const by = `by **Mod** (<@${MOD.id}>) <t:${String(MOD.at / 1000)}:R>`;
    const closed = decided({ status: 'closed', removal: 'archive' });
    expect(textOf(closed)).toContain(`**Closed** ${by}: its post is archived.`);
    expect(buttonsOf(closed).map((button) => button.label)).toEqual(['Go to post']);
    const deleted = decided({ status: 'closed', removal: 'delete' });
    expect(textOf(deleted)).toContain(`**Closed** ${by}: its post is deleted.`);
    expect(buttonsOf(deleted)).toEqual([]);
    expect(textOf(decided({ status: 'refused', removal: 'archive' }))).toContain(
      `**Place refused** ${by}: no meetup can be held there from now on. The meetup is closed ` +
        'and its post archived.',
    );
    expect(textOf(decided({ status: 'blocked', removal: 'delete' }))).toContain(
      `**Maker blocked** ${by} from creating meetups here. The meetup is closed and its post ` +
        'deleted.',
    );
    expect(textOf(decided({ status: 'dismissed' }))).toContain(`**Dismissed** ${by}.`);
    const ended = reportMessage(open(partySubject(), { status: 'ended' }));
    expect(textOf(ended)).toContain('**Ended**: the meetup was over before a moderator decided.');
    expect(buttonsOf(ended).map((button) => button.label)).toEqual(['Go to post']);
  });

  it('names a reporter whose data was removed on request a former member, the reason kept', () => {
    const text = textOf(
      reportMessage(
        open(partySubject(), {
          status: 'dismissed',
          reasons: [
            reason(REPORTER, { reporterId: null, reporterName: null, text: 'A yard.' }),
            reason(OTHER_REPORTER, { at: SAFETY_NOW + HOUR, text: 'Private.' }),
          ],
        }),
      ),
    );
    expect(text).toContain(
      '**Reasons** (2)\n' +
        `A former member <t:${String(SAFETY_NOW / 1000)}:R>: A yard.\n` +
        `**Dave** (<@${OTHER_REPORTER}>) <t:${String((SAFETY_NOW + HOUR) / 1000)}:R>: Private.`,
    );
    expect(text).not.toContain(REPORTER);
  });

  it('keeps every reason it can within what a message holds, and says how many it left out', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      reason(`2000000000000001${String(i).padStart(2, '0')}`, {
        reporterName: 'Z'.repeat(32),
        text: '_'.repeat(MAX_REPORT_REASON),
        at: SAFETY_NOW + i,
      }),
    );
    const message = reportMessage(
      open(partySubject({ information: '*'.repeat(1000), title: '_'.repeat(100) }), {
        reasons: many,
      }),
    );
    expectV2Sendable(message);
    expect(textOf(message)).toMatch(/…and \d+ more reasons/);
    expect(textOf(message)).toContain('**Reasons** (12)');
  });
});

describe('reportMessage of a message', () => {
  it('shows who wrote it, where and when, a copy of what it said and its attachments', () => {
    const message = reportMessage(open(messageSubject({ attachments: ['map.png', 'b*d.gif'] })));
    expect(textDisplays(message)[0]).toBe(
      '### Reported message\n' +
        `Written by **Bob** (<@200000000000000003>) in <#100000000000000001> ` +
        `<t:${String((SAFETY_NOW - HOUR) / 1000)}:F>`,
    );
    const text = textOf(message);
    expect(text).toContain(`**What it said**\n${plainLines('Zoë 🌲 <b>\nline two')}`);
    expect(text).toContain('**Attachments**: map.png, b\\*d.gif');
    expect(actions(open(messageSubject()))).toEqual([
      ['Delete message', `mreport:${requestId(201)}:delete`, ButtonStyle.Danger],
      ['Dismiss', `mreport:${requestId(201)}:dismiss`, ButtonStyle.Secondary],
      ['Go to message', undefined, ButtonStyle.Link],
    ]);
    expect(linksOf(message)).toEqual([
      `Go to message https://discord.com/channels/${SAFETY_SERVER}/100000000000000001/800000000000000001`,
    ]);
  });

  it('cuts the copy after escaping it, and bounds the attachments, within what a message holds', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      reason(`2000000000000001${String(i).padStart(2, '0')}`, {
        reporterName: 'Z'.repeat(32),
        text: '_'.repeat(MAX_REPORT_REASON),
      }),
    );
    const message = reportMessage(
      open(
        messageSubject({
          text: '_'.repeat(1500),
          attachments: Array.from({ length: 10 }, (_, i) => `${String(i)}${'*'.repeat(254)}`),
          partyTitle: '_'.repeat(200),
        }),
        { reasons: many },
      ),
    );
    expectV2Sendable(message);
    expect(textOf(message)).toContain('…');
  });

  it('names the party whose post it is in once, and says when there was no text', () => {
    const message = reportMessage(
      open(messageSubject({ partyTitle: 'Book swap', text: '', attachments: [] })),
    );
    // The post's title as it was, not its mention beside it: the post is named once.
    expect(textDisplays(message)[0]).toBe(
      '### Reported message\n' +
        'Written by **Bob** (<@200000000000000003>) in the post of **Book swap** ' +
        `<t:${String((SAFETY_NOW - HOUR) / 1000)}:F>`,
    );
    const text = textOf(message);
    expect(text).toContain('**What it said**\n(no text)');
    expect(text).not.toContain('**Attachments**');
  });

  it('shows a deletion and a message gone first', () => {
    const by = `by **Mod** (<@${MOD.id}>) <t:${String(MOD.at / 1000)}:R>`;
    const deleted = reportMessage(
      open(messageSubject(), {
        status: 'deleted',
        decidedBy: MOD.id,
        decidedByName: 'Mod',
        decidedAt: MOD.at,
      }),
    );
    expect(textOf(deleted)).toContain(`**Message deleted** ${by}.`);
    expect(buttonsOf(deleted)).toEqual([]);
    const gone = reportMessage(
      open(messageSubject(), {
        status: 'gone',
        decidedBy: MOD.id,
        decidedByName: 'Mod',
        decidedAt: MOD.at,
      }),
    );
    expect(textOf(gone)).toContain(
      `**Gone**: the message was deleted before a moderator did (found ${by}).`,
    );
  });
});

/** When a removal's dialog opened, for its per-open token. */
const OPENED = 1_800_000_000_000;

describe('removalDialog', () => {
  it('gives every opening a custom id of its own, so that no earlier pick is shown', () => {
    const ids = [OPENED, OPENED + 1].map(
      (opened) =>
        removalDialog({
          customId: (args) => ['x:1:close', ...args].join(':'),
          opened,
          title: 'Close this meetup',
          question: 'Close this meetup?',
          mayDelete: true,
          forum: '#west-meetups',
        }).custom_id,
    );
    expect(new Set(ids).size).toBe(2);
  });

  it('asks whether to archive the post or delete it, with nothing picked', () => {
    const dialog = removalDialog({
      customId: (args) => ['x:1:close', ...args].join(':'),
      opened: OPENED,
      title: 'Close this meetup',
      question: 'Close this meetup?',
      mayDelete: true,
      forum: '#west-meetups',
    });
    checkModal(dialog);
    expect(dialog.custom_id).toBe(`x:1:close:${openToken(OPENED)}`);
    expect(dialog.title).toBe('Close this meetup');
    expect(dialogTexts(dialog)).toEqual(['Close this meetup?']);
    expect(dialogChoices(dialog)).toEqual([
      {
        value: 'archive',
        label: 'Archive post',
        description: 'Keeps it readable and locked.',
        picked: false,
      },
      {
        value: 'delete',
        label: 'Delete post',
        description:
          'Removes it with everything written in it: for what nobody should keep reading, like ' +
          'a home address.',
        picked: false,
      },
    ]);
  });

  it('offers no choice where the bot may not delete the post, and says so', () => {
    const dialog = removalDialog({
      customId: (args) => ['x:1:close', ...args].join(':'),
      opened: OPENED,
      title: 'Close this meetup',
      question: 'Close this meetup?',
      mayDelete: false,
      forum: '#west-meetups',
    });
    checkModal(dialog);
    expect(dialog.custom_id).toBe(`x:1:close:archive:${openToken(OPENED)}`);
    expect(dialogChoices(dialog)).toEqual([]);
    expect(dialogTexts(dialog)).toEqual([
      "Close this meetup?\n\nIts post will be archived (kept readable and locked): I can't " +
        'delete posts in #west-meetups (Manage Threads is missing there), so deleting it is not ' +
        'offered. Delete it yourself if nobody should keep reading it.\n\nSubmit archives its post.',
    ]);
  });
});

describe('listTierNote (plan 8X-J)', () => {
  const max: ListTierNotice = {
    serverId: '400000000000000001',
    channelId: '400000000000000002',
    family: 'max',
    bossKey: 'sneasel',
    name: 'Sneasel',
    pokemon: 'sneasel',
    listTier: 'D1',
    headsTier: 'D2',
    count: 3,
  };

  it('says what the screenshots show and the add that would move the boss, for 7 days', () => {
    expect(listTierNote(max)).toBe(
      'Screenshots show **Dynamax Sneasel** with 2 heads (2★) 3 times since yesterday, but the ' +
        'boss list has it at 1★. If the game has it at 2★, this would move it there: ' +
        '`/operator boss add pokemon:sneasel tier:Dynamax 2★ days:7`',
    );
  });

  it('words a raid alike, a shadow tier by its choice name (review J4), one head as one', () => {
    expect(
      listTierNote({
        ...max,
        family: 'raid',
        name: 'Drapion',
        pokemon: 'drapion',
        listTier: { level: 'T3', shadow: true },
        headsTier: { level: 'T5', shadow: true },
        count: 4,
      }),
    ).toBe(
      'Screenshots show **Drapion** with 5 heads (Shadow T5) 4 times since yesterday, but the ' +
        'boss list has it at Shadow T3. If the game has it at Shadow T5, this would move it ' +
        'there: `/operator boss add pokemon:drapion tier:Shadow T5 days:7`',
    );
    expect(
      listTierNote({
        ...max,
        family: 'raid',
        name: 'Starmie',
        pokemon: 'starmie',
        listTier: { level: 'T3', shadow: false },
        headsTier: { level: 'T1', shadow: false },
      }),
    ).toContain('**Starmie** with 1 head (T1)');
  });

  it('points to the override that puts the boss at the list’s tier instead', () => {
    expect(listTierNote({ ...max, overrideId: 4 })).toBe(
      'Screenshots show **Dynamax Sneasel** with 2 heads (2★) 3 times since yesterday, but the ' +
        'boss list has it at 1★, by override #4. If the game has it at 2★, that override may be ' +
        'wrong: `/operator boss remove override:4`',
    );
  });

  // Plan 19B-1: where the server's staff may not change the list, no command is theirs to run.
  it('says that the operators decide where the staff may not, with no command', () => {
    expect(listTierNote(max, { operatorsDecide: true, operatorsTold: false })).toBe(
      'Screenshots show **Dynamax Sneasel** with 2 heads (2★) 3 times since yesterday, but the ' +
        'boss list has it at 1★. The boss list is the same in every server of this Pine, and ' +
        'its operators decide it.',
    );
    expect(
      listTierNote({ ...max, overrideId: 4 }, { operatorsDecide: true, operatorsTold: true }),
    ).toBe(
      'Screenshots show **Dynamax Sneasel** with 2 heads (2★) 3 times since yesterday, but the ' +
        'boss list has it at 1★, by override #4. The boss list is the same in every server of ' +
        'this Pine, and its operators decide it: they have been told.',
    );
  });

  it('names a boss the game data lacks by its ids and its name made plain', () => {
    const note = listTierNote({ ...max, name: 'New*mon*', pokemon: 'ids:NEWMON' });
    expect(note).toContain(`**Dynamax ${plain('New*mon*')}**`);
    expect(note).toContain('`/operator boss add pokemon:ids:NEWMON tier:Dynamax 2★ days:7`');
  });
});
