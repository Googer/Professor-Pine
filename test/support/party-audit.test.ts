import { describe, expect, it } from 'vitest';
import { partyAuditCases } from './party-audit-cases.js';
import { MemoryPartyAudit } from './party-audit.js';

describe('MemoryPartyAudit', () => {
  partyAuditCases(() => Promise.resolve(new MemoryPartyAudit()));

  it('fails a method it is told to fail by rejecting its promise', async () => {
    const store = new MemoryPartyAudit();
    const down = new Error('database down');
    store.failing.set('insert', down);
    await expect(store.insert([])).rejects.toBe(down);
  });
});
