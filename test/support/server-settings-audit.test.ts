import { describe } from 'vitest';
import { serverSettingsAuditCases } from './server-settings-audit-cases.js';
import { MemoryServerSettingsAudit } from './server-settings-audit.js';

describe('MemoryServerSettingsAudit', () => {
  serverSettingsAuditCases(() => Promise.resolve(new MemoryServerSettingsAudit()));
});
