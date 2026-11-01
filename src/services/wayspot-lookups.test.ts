import { describe } from 'vitest';
import { wayspotLookupCases } from '../../test/support/wayspot-lookup-cases.js';
import { MemoryWayspotLookups } from './wayspot-lookups.js';

describe('MemoryWayspotLookups', () => {
  wayspotLookupCases(() => Promise.resolve(new MemoryWayspotLookups()));
});
