import type {
  StopLineKey,
  StopLineRecord,
  StopLineStorage,
} from '../../src/db/repositories/stop-line-repository.js';

/**
 * The lines of the region channels in memory (`StopLineStorage`, plan 8R-9), the twin of
 * `StopLineRepository`; `rows` by `<server> <channel> <day> <key>`, `failing` per method.
 */
export class MemoryStopLines implements StopLineStorage {
  readonly rows = new Map<string, StopLineRecord>();
  readonly failing = new Map<keyof StopLineStorage, Error>();

  private fail(method: keyof StopLineStorage): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  private static keyOf(line: StopLineKey): string {
    return `${line.serverId} ${line.regionChannelId} ${line.day} ${line.key}`;
  }

  claim(line: StopLineKey & { createdAt: number }): Promise<boolean> {
    this.fail('claim');
    const key = MemoryStopLines.keyOf(line);
    if (this.rows.has(key)) return Promise.resolve(false);
    this.rows.set(key, {
      serverId: line.serverId,
      regionChannelId: line.regionChannelId,
      day: line.day,
      key: line.key,
      messageId: null,
      createdAt: line.createdAt,
    });
    return Promise.resolve(true);
  }

  sent(line: StopLineKey & { createdAt: number }, messageId: string): Promise<void> {
    this.fail('sent');
    const key = MemoryStopLines.keyOf(line);
    const row = this.rows.get(key);
    if (row) row.messageId = messageId;
    else {
      // As the repository's upsert (review W1): a claim forgotten meanwhile is made anew.
      this.rows.set(key, {
        serverId: line.serverId,
        regionChannelId: line.regionChannelId,
        day: line.day,
        key: line.key,
        messageId,
        createdAt: line.createdAt,
      });
    }
    return Promise.resolve();
  }

  forget(line: StopLineKey): Promise<void> {
    this.fail('forget');
    this.rows.delete(MemoryStopLines.keyOf(line));
    return Promise.resolve();
  }

  before(day: string): Promise<StopLineRecord[]> {
    this.fail('before');
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.day < day)
        .sort((a, b) => a.day.localeCompare(b.day) || a.createdAt - b.createdAt)
        .map((row) => ({ ...row })),
    );
  }
}
