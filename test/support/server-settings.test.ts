import { describe } from 'vitest';
import { serverSettingsCases } from './server-settings-cases.js';
import { MemoryServerSettings } from './server-settings.js';

describe('MemoryServerSettings', () => {
  serverSettingsCases(() => Promise.resolve(new MemoryServerSettings()));
});
