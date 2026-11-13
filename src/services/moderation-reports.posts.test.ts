import { describe, expect, it } from 'vitest';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { LIBRARY } from '../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { ALICE, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
import { reportsWith } from '../../test/support/reports-service.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import { partySubject, newReport, reason } from '../../test/support/report-cases.js';

const SERVER = '412345678901234567';
const DAVE = '200000000000000005';

/** Alice's meetup at the Little Free Library, and a report of it by a member. */
async function setup() {
  const made = await reportsWith();
  const outcome = await made.service.createMeetup({
    name: 'Book swap',
    creatorId: ALICE,
    creator: { name: 'Alice' },
    regionChannelId: WEST_CHANNEL,
    place: LIBRARY,
    startTime: PARTY_NOW + 24 * 3_600_000,
    description: 'Bring a book.',
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  const party = outcome.party;
  const report = (reporterId: string, name: string, text = 'A home.') =>
    made.reports.reportParty({
      serverId: SERVER,
      partyId: party.id,
      reporter: { id: reporterId, name },
      reason: text,
    });
  const post = () => made.gateway.messagesIn(MOD_CHANNEL)[0]?.message;
  /** Holds the gateway's next call of `method` into the moderators' channel until released. */
  const hold = (method: 'sendMessage' | 'editMessage') => {
    const original = made.gateway[method].bind(made.gateway) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached = (): void => undefined;
    const isReached = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let held = false;
    (made.gateway as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
      if (!held && args[0] === MOD_CHANNEL) {
        held = true;
        reached();
        await released;
      }
      return original(...args);
    };
    return { release, reached: isReached };
  };
  return { ...made, party, report, post, hold };
}

const reasonsShown = (message: OutgoingMessage | undefined) =>
  /\*\*Reasons\*\* \((\d+)\)/.exec(textOf(message))?.[1];

describe('ModerationReports: the report’s post as it is now', () => {
  it('shows every reason, whatever order the edits of two reasons arrive in', async () => {
    const made = await setup();
    await made.report(BOB, 'Bob');
    const first = made.hold('editMessage');
    const carol = made.report(CAROL, 'Carol');
    await first.reached;
    const dave = made.report(DAVE, 'Dave');
    first.release();
    await Promise.all([carol, dave]);
    expect(reasonsShown(made.post())).toBe('3');
  });

  it('shows a report ended while its post was on its way as ended, without buttons', async () => {
    const made = await setup();
    const sending = made.hold('sendMessage');
    const reported = made.report(BOB, 'Bob');
    await sending.reached;
    await made.service.end(made.party.id);
    await made.reports.flush();
    sending.release();
    expect((await reported).kind).toBe('sent');
    await made.reports.flush();
    expect(textOf(made.post())).toContain('**Ended**');
    expect(buttonsOf(made.post()).map((button) => button.label)).toEqual(['Go to post']);
  });

  it('shows the reasons that joined while the post was on its way', async () => {
    const made = await setup();
    const sending = made.hold('sendMessage');
    const bob = made.report(BOB, 'Bob');
    await sending.reached;
    await made.report(CAROL, 'Carol');
    sending.release();
    await bob;
    expect(reasonsShown(made.post())).toBe('2');
  });

  it('names the place once: in Where, with the brief’s line of it left out', async () => {
    const made = await setup();
    await made.report(BOB, 'Bob');
    expect(textOf(made.post()).split('Little Free Library')).toHaveLength(2);
  });
});

describe('ModerationReports: the sweep', () => {
  it('ends the open reports of parties that are over, and forgets reports never posted', async () => {
    const made = await setup();
    await made.report(BOB, 'Bob');
    // The bot stopped before the listener could end the report of a party that ended.
    const ended = partySubject({ partyId: '00000000-0000-4000-8000-0000000000ee' });
    await made.reportStore.addReport(newReport(1, ended), reason(CAROL));
    await made.reportStore.setReportPost(newReport(1).id, MOD_CHANNEL, '600000000000000099');
    // And before the post of another was sent.
    const unposted = partySubject({ partyId: '00000000-0000-4000-8000-0000000000ef' });
    await made.reportStore.addReport(
      newReport(2, unposted, { createdAt: PARTY_NOW - 10 * 60_000 }),
      reason(DAVE),
    );
    await made.reports.sweep();
    expect((await made.reportStore.report(newReport(1).id))?.status).toBe('ended');
    expect(await made.reportStore.report(newReport(2).id)).toBeUndefined();
    // The report of the meetup still going stays open.
    expect(
      [...made.reportStore.reports.values()].filter((one) => one.status === 'open'),
    ).toHaveLength(1);
  });

  it('carries the reasons of a report left without its post over to the one opened anew', async () => {
    const made = await setup();
    await made.reportStore.addReport(
      {
        id: '00000000-0000-4000-8000-000000000099',
        serverId: SERVER,
        subject: made.reports.subjectOf(made.party),
        createdAt: PARTY_NOW - 10 * 60_000,
      },
      { reporterId: CAROL, reporterName: 'Carol', text: 'Old.', at: PARTY_NOW - 10 * 60_000 },
    );
    expect((await made.report(BOB, 'Bob')).kind).toBe('sent');
    expect(reasonsShown(made.post())).toBe('2');
    expect(textOf(made.post())).toContain('Old.');
  });

  it('drops the held reasons of a member who was forgotten, and keeps the others’ (plan 8G)', async () => {
    const made = await setup();
    const subject = made.reports.subjectOf(made.party);
    // A report of the meetup never posted: the sweep forgets it and holds its two reasons.
    const stranded = newReport(3, subject, { createdAt: PARTY_NOW - 10 * 60_000 });
    await made.reportStore.addReport(stranded, reason(CAROL));
    await made.reportStore.addReport(stranded, reason(DAVE));
    await made.reports.sweep();
    expect(made.reportStore.reports.size).toBe(0);
    // Carol is forgotten (`/operator forget`) before the next report of the meetup.
    made.reports.forgetReporter(CAROL);
    expect((await made.report(BOB, 'Bob')).kind).toBe('sent');
    const [report] = made.reportStore.reports.values();
    expect(report?.reasons.map((one) => one.reporterId).sort()).toEqual([BOB, DAVE].sort());
    expect(JSON.stringify([...made.reportStore.reports.values()])).not.toContain(CAROL);
  });
});
