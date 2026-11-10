import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

/** The run's temporary files in one folder of its own, removed at the end. */
const TEMP_FOLDER = 'test/support/temp-folder-setup.ts';

/** `@pine/wayspot-core` read from its TypeScript sources (tsconfig.json, `customConditions`). */
const SOURCE_CONDITION = 'pine-source';

export default defineConfig({
  ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
  test: {
    // Half the machine: a suite leaves room for the rest of the work (and other agents) on it,
    // and its tests are not starved past their time limits (CLAUDE.md, the suite lock).
    maxWorkers: '50%',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'src/**/*.test.ts',
            'test/**/*.test.ts',
            'scripts/**/*.test.ts',
            'packages/*/src/**/*.test.ts',
          ],
          exclude: ['**/*.db.test.ts', '**/*.sh.test.ts', '**/*.isolated.test.ts'],
          globalSetup: [TEMP_FOLDER],
          // A worker runs its files one after another in one module graph: importing the code
          // again for each of 340 files was more than half of the suite's time. A file that
          // mocks a module (`vi.mock`) cannot share it and is `*.isolated.test.ts` (lint).
          isolate: false,
          // The database suite running beside it makes the default 5 s measure the machine.
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'isolated',
          include: ['src/**/*.isolated.test.ts', 'test/**/*.isolated.test.ts'],
          exclude: ['**/*.db.test.ts', '**/*.sh.test.ts'],
          globalSetup: [TEMP_FOLDER],
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'shell',
          include: ['src/**/*.sh.test.ts'],
          globalSetup: [TEMP_FOLDER],
          // Each test spawns a shell (Git Bash on Windows): seconds apiece when the machine is busy.
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['src/**/*.db.test.ts', 'test/**/*.db.test.ts'],
          // One MySQL container for the run; every startDatabase makes its own database in it,
          // so files run side by side, and share a module graph per worker as the unit tests do.
          globalSetup: [TEMP_FOLDER, 'test/support/mysql-global-setup.ts'],
          isolate: false,
          // A migrator test builds whole schemas: about 20 s alone, past two minutes on this
          // machine while other suites run beside it.
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
