import path from 'node:path';

/** Settings for tests. Deliberately not data/settings.json, which operators customise. */
export const TEST_SETTINGS_PATH = path.resolve(import.meta.dirname, '../fixtures/settings.json');
