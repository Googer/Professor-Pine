import { describe } from 'vitest';
import { scriptAccessCases } from './script-access-cases.js';
import { MemoryScriptAccess } from './script-access.js';

describe('MemoryScriptAccess', () => {
  scriptAccessCases(() => Promise.resolve(new MemoryScriptAccess()));
});
