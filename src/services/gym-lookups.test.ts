import { describe } from 'vitest';
import { gymLookupCases } from '../../test/support/gym-lookup-cases.js';
import { MemoryGymLookups } from './gym-lookups.js';

describe('MemoryGymLookups', () => {
  gymLookupCases(() => Promise.resolve(new MemoryGymLookups()));
});
