import { describe, expect, it } from 'vitest';
import type { AuditRecord } from '../db/repositories/party-audit-repository.js';
import type { AuditEntry } from '../domain/party/audit.js';
import { auditLine, auditWords, postAuditMessage } from './audit.js';
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
    expect(auditWords({ action: 'stop-removed', stop: null }, NOW)).toBe(
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
});
