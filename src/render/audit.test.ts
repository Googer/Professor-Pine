import { describe, expect, it } from 'vitest';
import type { AuditRecord } from '../db/repositories/party-audit-repository.js';
import type { AuditEntry } from '../domain/party/audit.js';
import { auditLine, auditWords, memberAuditMessage, postAuditMessage } from './audit.js';
import { textOf } from '../../test/support/messages.js';

const NOW = 1_800_000_000_000;
const ASH = { id: '200000000000000011', name: 'Ash' };

function record(entry: AuditEntry, actor: AuditRecord['actor'] = ASH): AuditRecord {
  return {
    id: '1',
    serverId: '1',
    partyId: 'p',
    postId: '4',
    at: NOW,
    actor,
    entry,
  };
}

describe('the audit log in words', () => {
  it('names who did it, Pine for its own changes, and the clock for an end by time', () => {
    const at = `<t:${String(NOW / 1000)}:t>`;
    expect(auditLine(record({ action: 'info' }), NOW)).toBe(
      `${at} **Ash** (<@${ASH.id}>) changed the information.`,
    );
    expect(
      auditLine(record({ action: 'boss', from: 'T5 egg', to: 'Yveltal (T5)' }, null), NOW),
    ).toBe(`${at} **Pine** set the boss: Yveltal (T5) (was T5 egg).`);
    expect(auditLine(record({ action: 'ended', how: 'clock' }, null), NOW)).toBe(
      `${at} The clock ended it.`,
    );
  });

  it('says how a party was made, moved, and closed', () => {
    expect(
      auditWords(
        {
          action: 'created',
          kind: 'meetup',
          name: 'Picnic',
          place: 'Riverside Park',
          anonymous: false,
          hatch: null,
          end: null,
          start: NOW,
        },
        NOW,
      ),
    ).toBe(`made it: **Picnic** at **Riverside Park**, starts <t:${String(NOW / 1000)}:t>`);
    expect(
      auditWords(
        {
          action: 'moved',
          kind: 'raid',
          fromParty: 'p0',
          fromPlace: 'Old Gym',
          fromChannel: '300',
        },
        NOW,
      ),
    ).toBe('moved it here from **Old Gym** in <#300>');
    expect(
      auditWords({ action: 'ended', how: 'closed', by: 'moderators', removal: 'delete' }, NOW),
    ).toBe('closed it for a report to the moderators (deleted the post)');
    expect(auditWords({ action: 'route', added: [], removed: [null] }, NOW)).toBe(
      'removed a stop Pine no longer knows',
    );
    expect(auditWords({ action: 'conductor', from: null, to: { id: ASH.id } }, NOW)).toBe(
      `made <@${ASH.id}> the conductor`,
    );
  });

  it('makes member text plain: a name or place cannot carry markdown', () => {
    expect(
      auditWords({ action: 'name', from: 'a', to: '**bold** [x](http://e)' }, NOW),
    ).not.toContain('](http');
  });

  it('heads a post with nothing logged as a post', () => {
    expect(textOf(postAuditMessage([], NOW))).toBe(
      '### Log of this post\nNothing is logged for this post.',
    );
  });

  it('words one change of a route, many stops in a bounded length', () => {
    expect(auditWords({ action: 'route', added: ['A'], removed: ['B', 'C'] }, NOW)).toBe(
      'added the stop **A** and removed 2 stops: **B**, **C**',
    );
    const many = Array.from({ length: 30 }, (_, n) => `Gym number ${String(n)} by the long road`);
    const words = auditWords({ action: 'route', added: many, removed: [] }, NOW);
    expect(words.startsWith('added 30 stops: **Gym number 0 by the long road**')).toBe(true);
    expect(words).toMatch(/…and \d+ more$/);
    expect(words.length).toBeLessThan(400);
  });

  it("words a train's boss and its kind", () => {
    expect(auditWords({ action: 'boss', from: 'none', to: 'Yveltal' }, NOW)).toBe(
      'set the boss: Yveltal (was none)',
    );
    expect(auditWords({ action: 'kind', from: 'raid', to: 'dynamax' }, NOW)).toBe(
      'made it a Max Battle Train (was a Raid Train)',
    );
  });

  it('says a raid reported hatched without its boss is hatched', () => {
    expect(
      auditWords(
        {
          action: 'created',
          kind: 'raid',
          what: 'Level 5 raid',
          boss: null,
          hatched: true,
          place: null,
          anonymous: false,
          hatch: null,
          end: null,
          start: null,
        },
        NOW,
      ),
    ).toBe('reported it: Level 5 raid (hatched, boss unknown)');
  });

  it("says staff's closing that nobody is named for as staff's", () => {
    const at = `<t:${String(NOW / 1000)}:t>`;
    expect(
      auditLine(
        record({ action: 'ended', how: 'closed', by: 'staff', removal: 'delete' }, null),
        NOW,
      ),
    ).toBe(`${at} **Pine** closed it: staff deleted its post.`);
  });

  it('keeps the line of how the party was made at the top, outside the 25', () => {
    const made = record({
      action: 'created',
      kind: 'raid',
      what: 'Level 5 raid',
      boss: null,
      place: 'The Stacks',
      anonymous: true,
      hatch: null,
      end: null,
      start: null,
    });
    const later = Array.from({ length: 30 }, () => record({ action: 'info' }));
    const lines = textOf(postAuditMessage([made, ...later], NOW)).split('\n');
    expect(lines[1]).toContain('reported it (anonymous in the post)');
    expect(lines[2]).toBe('-# …and 5 earlier changes');
    expect(lines.filter((line) => line.includes('changed the information'))).toHaveLength(25);
  });

  it("sums up in one line what a member's list leaves out", () => {
    const shown = Array.from({ length: 25 }, () => record({ action: 'info' }));
    const lines = textOf(memberAuditMessage(ASH, shown, NOW, true)).split('\n');
    expect(lines.filter((line) => line.startsWith('-#'))).toEqual(['-# …and earlier changes']);
  });
});
