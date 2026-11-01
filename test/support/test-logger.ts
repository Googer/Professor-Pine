import { pino, type Logger } from 'pino';

/** A real pino logger that records each entry as a parsed object. */
export function createTestLogger(): { log: Logger; entries: Array<Record<string, unknown>> } {
  const entries: Array<Record<string, unknown>> = [];
  const log = pino(
    { level: 'trace' },
    {
      write(line: string) {
        entries.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  );
  return { log, entries };
}
