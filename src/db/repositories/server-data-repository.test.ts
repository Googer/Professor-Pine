import { describe, expect, it } from 'vitest';
import { TABLE_OWNERS } from '../server-tables.js';
import { DELETION_ORDER } from './server-data-repository.js';

describe('the order of a server’s deletion (plan 19C-3)', () => {
  it('takes every table the server owns once, but its gyms’ links and its Guild row', () => {
    const owned = Object.entries(TABLE_OWNERS)
      .filter(([, owner]) => ['server', 'server-pair', 'guild-row'].includes(owner.kind))
      .map(([table]) => table)
      .filter((table) => table !== 'GymServer' && table !== 'Guild')
      .sort();
    expect([...DELETION_ORDER].sort()).toEqual(owned);
  });

  it('takes a party before its region, a role before its group, a review before its import', () => {
    const at = (table: string) => DELETION_ORDER.indexOf(table);
    expect(at('Party')).toBeLessThan(at('Region'));
    expect(at('Role')).toBeLessThan(at('RoleGroup'));
    expect(at('GymReview')).toBeLessThan(at('WayspotImport'));
  });
});
