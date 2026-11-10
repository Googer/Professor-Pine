import { expect, it } from 'vitest';
import {
  reportTargetKey,
  type MessageSubject,
  type NewReport,
  type PartySubject,
  type ReportReason,
  type ReportStore,
} from '../../src/domain/moderation/reports.js';
import {
  LIBRARY,
  MOD,
  OTHER_SERVER,
  requestId,
  SAFETY_NOW,
  SAFETY_SERVER,
} from './meetup-safety-cases.js';

export const REPORTER = '200000000000000011';
export const OTHER_REPORTER = '200000000000000012';
export const REPORTED_PARTY = '00000000-0000-4000-8000-0000000000aa';
const HOUR = 3_600_000;

/** What the moderators' post shows of Alice's book swap at the Little Free Library. */
export function partySubject(overrides: Partial<PartySubject> = {}): PartySubject {
  return {
    kind: 'party',
    partyId: REPORTED_PARTY,
    partyType: 'meetup',
    title: 'Book swap',
    lines: ['**Book swap**', 'Starts <t:1792086400:t>'],
    regionChannelId: '100000000000000001',
    postId: '700000000000000123',
    place: LIBRARY,
    officialName: null,
    makerId: '200000000000000002',
    makerName: 'Alice',
    information: 'Bring a book.',
    ...overrides,
  };
}

/** A message of Bob's in a region channel. */
export function messageSubject(overrides: Partial<MessageSubject> = {}): MessageSubject {
  return {
    kind: 'message',
    channelId: '100000000000000001',
    messageId: '800000000000000001',
    authorId: '200000000000000003',
    authorName: 'Bob',
    sentAt: SAFETY_NOW - HOUR,
    text: 'Zoë 🌲 <b>\nline two',
    attachments: ['map.png'],
    partyTitle: null,
    ...overrides,
  };
}

/** A report numbered `n` of `subject`, made at `SAFETY_NOW`. */
export function newReport(
  n: number,
  subject: PartySubject | MessageSubject = partySubject(),
  overrides: Partial<NewReport> = {},
): NewReport {
  return {
    id: requestId(200 + n),
    serverId: SAFETY_SERVER,
    subject,
    createdAt: SAFETY_NOW,
    ...overrides,
  };
}

export function reason(reporterId = REPORTER, overrides: Partial<ReportReason> = {}): ReportReason {
  return {
    reporterId,
    reporterName: reporterId === REPORTER ? 'Carol' : 'Dave',
    text: 'It is somebody’s front yard.',
    at: SAFETY_NOW,
    ...overrides,
  };
}

/** What is kept of reports, run against the repository and its twin in memory alike. */
export function reportCases(made: () => Promise<ReportStore>): void {
  it('opens a report with its first reason, and keeps its subject as it was given', async () => {
    const store = await made();
    const subject = messageSubject();
    const added = await store.addReport(newReport(1, subject), reason());
    expect(added.kind).toBe('opened');
    expect(await store.report(requestId(201))).toEqual({
      id: requestId(201),
      serverId: SAFETY_SERVER,
      subject,
      createdAt: SAFETY_NOW,
      status: 'open',
      removal: null,
      channelId: null,
      messageId: null,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      reasons: [reason()],
    });
    expect(added.report).toEqual(await store.report(requestId(201)));
    expect(await store.report(requestId(209))).toBeUndefined();
  });

  it('gathers the reasons of one party or message on its open report, one per reporter', async () => {
    const store = await made();
    await store.addReport(newReport(1), reason());
    const second = await store.addReport(
      newReport(2),
      reason(OTHER_REPORTER, { at: SAFETY_NOW + 1, text: 'A home.' }),
    );
    expect(second.kind).toBe('added');
    expect(second.report.id).toBe(requestId(201));
    expect(second.report.reasons.map((one) => one.reporterId)).toEqual([REPORTER, OTHER_REPORTER]);
    const again = await store.addReport(newReport(3), reason(REPORTER, { text: 'Again' }));
    expect(again.kind).toBe('already');
    expect(again.report.reasons).toHaveLength(2);
    expect(await store.report(requestId(202))).toBeUndefined();
    // Another message, another party: reports of their own.
    expect((await store.addReport(newReport(4, messageSubject()), reason())).kind).toBe('opened');
    expect(
      (
        await store.addReport(
          newReport(5, messageSubject({ messageId: '800000000000000002' })),
          reason(),
        )
      ).kind,
    ).toBe('opened');
    expect(
      (await store.addReport(newReport(6, partySubject({ partyId: requestId(77) })), reason()))
        .kind,
    ).toBe('opened');
  });

  it('decides an open report once, and opens a new one of the same party afterwards', async () => {
    const store = await made();
    await store.addReport(newReport(1), reason());
    await store.setReportPost(requestId(201), '600000000000000001', '600000000000000005');
    expect(await store.decideReport(requestId(201), 'closed', 'delete', MOD)).toBe(true);
    expect(await store.decideReport(requestId(201), 'dismissed', null, MOD)).toBe(false);
    expect(await store.report(requestId(201))).toMatchObject({
      status: 'closed',
      removal: 'delete',
      decidedBy: MOD.id,
      decidedByName: 'Mod',
      decidedAt: MOD.at,
      channelId: '600000000000000001',
      messageId: '600000000000000005',
    });
    const anew = await store.addReport(newReport(2), reason());
    expect(anew).toMatchObject({ kind: 'opened', report: { id: requestId(202) } });
    expect(await store.decideReport(requestId(202), 'ended', null, null)).toBe(true);
    expect(await store.report(requestId(202))).toMatchObject({
      status: 'ended',
      decidedBy: null,
      decidedAt: null,
    });
    expect(await store.decideReport(requestId(209), 'dismissed', null, MOD)).toBe(false);
  });

  it('closes a report its party’s end settled as ended, and no other', async () => {
    const store = await made();
    await store.addReport(newReport(1), reason());
    expect(await store.closeEnded(requestId(201), 'delete', MOD)).toBe(false);
    expect((await store.report(requestId(201)))?.status).toBe('open');
    await store.decideReport(requestId(201), 'ended', null, null);
    expect(await store.closeEnded(requestId(201), 'denied', MOD)).toBe(true);
    expect(await store.report(requestId(201))).toMatchObject({
      status: 'closed',
      removal: 'denied',
      decidedBy: MOD.id,
      decidedByName: 'Mod',
      decidedAt: MOD.at,
    });
    expect(await store.closeEnded(requestId(201), 'delete', MOD)).toBe(false);
    expect(await store.closeEnded(requestId(209), 'delete', MOD)).toBe(false);
  });

  it('marks a report decided as deleted gone, and no other', async () => {
    const store = await made();
    await store.addReport(newReport(1, messageSubject()), reason());
    await store.markGone(requestId(201));
    expect((await store.report(requestId(201)))?.status).toBe('open');
    await store.decideReport(requestId(201), 'deleted', null, MOD);
    await store.markGone(requestId(201));
    expect(await store.report(requestId(201))).toMatchObject({ status: 'gone', decidedBy: MOD.id });
  });

  it('opens a decided report again unless another of its subject is open, and keeps its removal', async () => {
    const store = await made();
    await store.addReport(newReport(1), reason());
    await store.decideReport(requestId(201), 'closed', 'delete', MOD);
    await store.setRemoval(requestId(201), 'denied');
    expect(await store.report(requestId(201))).toMatchObject({ removal: 'denied' });
    expect(await store.reopenReport(requestId(201))).toBe(true);
    expect(await store.report(requestId(201))).toMatchObject({
      status: 'open',
      removal: null,
      decidedBy: null,
    });
    // Open again: a reason joins it.
    expect((await store.addReport(newReport(2), reason(OTHER_REPORTER))).kind).toBe('added');
    await store.decideReport(requestId(201), 'dismissed', null, MOD);
    await store.addReport(newReport(3), reason());
    expect(await store.reopenReport(requestId(201))).toBe(false);
    expect((await store.report(requestId(201)))?.status).toBe('dismissed');
  });

  it('finds the open report of a party or a message by its subject, with its reasons', async () => {
    const store = await made();
    const message = messageSubject();
    await store.addReport(newReport(1), reason());
    await store.addReport(newReport(2), reason(OTHER_REPORTER));
    await store.addReport(newReport(3, message), reason());
    expect(await store.openReport(reportTargetKey(partySubject()))).toMatchObject({
      id: requestId(201),
      reasons: [{ reporterId: REPORTER }, { reporterId: OTHER_REPORTER }],
    });
    expect((await store.openReport(reportTargetKey(message)))?.id).toBe(requestId(203));
    expect(
      await store.openReport(reportTargetKey(messageSubject({ messageId: '800000000000000009' }))),
    ).toBeUndefined();
    // Decided, it is no longer the open one; a new report is.
    await store.decideReport(requestId(201), 'dismissed', null, MOD);
    expect(await store.openReport(reportTargetKey(partySubject()))).toBeUndefined();
    await store.addReport(newReport(4), reason(OTHER_REPORTER));
    expect((await store.openReport(reportTargetKey(partySubject())))?.id).toBe(requestId(204));
  });

  it('lists the open reports of a server and of a party, and those never posted', async () => {
    const store = await made();
    await store.addReport(newReport(1, partySubject(), { createdAt: SAFETY_NOW + 2 }), reason());
    await store.addReport(newReport(2, messageSubject(), { createdAt: SAFETY_NOW + 1 }), reason());
    await store.addReport(
      newReport(3, messageSubject({ messageId: '800000000000000003' }), {
        serverId: OTHER_SERVER,
      }),
      reason(),
    );
    await store.addReport(
      newReport(4, messageSubject({ messageId: '800000000000000004' })),
      reason(),
    );
    await store.decideReport(requestId(204), 'dismissed', null, MOD);
    await store.setReportPost(requestId(201), '600000000000000001', '600000000000000005');
    expect((await store.openReports(SAFETY_SERVER)).map((one) => one.id)).toEqual([
      requestId(202),
      requestId(201),
    ]);
    expect((await store.openReportsOfParty(REPORTED_PARTY)).map((one) => one.id)).toEqual([
      requestId(201),
    ]);
    expect((await store.openPartyReports()).map((one) => one.id)).toEqual([requestId(201)]);
    expect((await store.unpostedReports(SAFETY_NOW + 1)).map((one) => one.id)).toEqual([
      requestId(203),
      requestId(202),
    ]);
  });

  it('refuses a subject that would not read back, before keeping anything', async () => {
    const store = await made();
    const bad = messageSubject({ text: 'x'.repeat(5000) });
    await expect(store.addReport(newReport(1, bad), reason())).rejects.toThrow();
    expect(await store.report(requestId(201))).toBeUndefined();
    await store.addReport(newReport(2), reason());
    await expect(
      store.setSubject(requestId(202), partySubject({ title: 'x'.repeat(500) })),
    ).rejects.toThrow();
  });

  it('gives the reasons in the order they came, the reporter breaking a tie', async () => {
    const store = await made();
    await store.addReport(newReport(1), reason(OTHER_REPORTER, { at: SAFETY_NOW + 5 }));
    await store.addReport(newReport(2), reason(REPORTER, { at: SAFETY_NOW + 5 }));
    await store.addReport(newReport(3), reason('200000000000000010', { at: SAFETY_NOW + 1 }));
    expect((await store.report(requestId(201)))?.reasons.map((one) => one.reporterId)).toEqual([
      '200000000000000010',
      REPORTER,
      OTHER_REPORTER,
    ]);
  });

  it('keeps that a reported message is a forward, and was edited after the first report', async () => {
    const store = await made();
    const forward = messageSubject({ forwarded: true });
    await store.addReport(newReport(1, forward), reason());
    expect((await store.report(requestId(201)))?.subject).toEqual(forward);
    const edited = messageSubject({ forwarded: true, edited: true });
    await store.setSubject(requestId(201), edited);
    expect((await store.report(requestId(201)))?.subject).toEqual(edited);
  });

  it('changes what a report shows, and forgets one with its reasons', async () => {
    const store = await made();
    await store.addReport(newReport(1), reason());
    const changed = partySubject({ title: 'Book swap and tea', information: null });
    await store.setSubject(requestId(201), changed);
    expect((await store.report(requestId(201)))?.subject).toEqual(changed);
    await store.discardReport(requestId(201));
    expect(await store.report(requestId(201))).toBeUndefined();
    // Forgotten: the next reason opens a report anew, the same reporter too.
    expect((await store.addReport(newReport(2), reason())).kind).toBe('opened');
    expect((await store.report(requestId(202)))?.reasons).toHaveLength(1);
  });
}
