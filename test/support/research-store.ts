import type { ResearchEventStorage } from '../../src/db/repositories/research-event-repository.js';
import type {
  KeptTaskList,
  ResearchTaskStorage,
} from '../../src/db/repositories/research-task-repository.js';
import type {
  StopPostRecord,
  StopPostStorage,
} from '../../src/db/repositories/stop-post-repository.js';
import type { ResearchTask } from '../../src/domain/research/task.js';
import type { ResearchEvent } from '../../src/domain/time/research-events.js';

/**
 * The pinned posts in memory (`StopPostStorage`), the twin of `StopPostRepository`; `rows` by
 * `<channel> <day>`, `failing` per method.
 */
export class MemoryStopPosts implements StopPostStorage {
  readonly rows = new Map<string, StopPostRecord>();
  readonly failing = new Map<keyof StopPostStorage, Error>();

  private fail(method: keyof StopPostStorage): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  all(): Promise<StopPostRecord[]> {
    this.fail('all');
    return Promise.resolve(
      [...this.rows.values()]
        .sort((a, b) => a.day.localeCompare(b.day) || a.channelId.localeCompare(b.channelId))
        .map((row) => ({ ...row, messageIds: [...row.messageIds], leftover: [...row.leftover] })),
    );
  }

  save(post: StopPostRecord): Promise<void> {
    this.fail('save');
    this.rows.set(`${post.channelId} ${post.day}`, {
      ...post,
      messageIds: [...post.messageIds],
      leftover: [...post.leftover],
    });
    return Promise.resolve();
  }

  remove(channelId: string, day: string): Promise<void> {
    this.fail('remove');
    this.rows.delete(`${channelId} ${day}`);
    return Promise.resolve();
  }
}

/** The research events in memory (`ResearchEventStorage`), the twin of `ResearchEventRepository`. */
export class MemoryResearchEvents implements ResearchEventStorage {
  readonly rows = new Map<string, ResearchEvent & { firstSeen: number; lastSeen: number }>();
  readonly failing = new Map<keyof ResearchEventStorage, Error>();

  constructor(events: readonly ResearchEvent[] = []) {
    for (const event of events) this.rows.set(event.id, { ...event, firstSeen: 0, lastSeen: 0 });
  }

  private fail(method: keyof ResearchEventStorage): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  all(): Promise<ResearchEvent[]> {
    this.fail('all');
    return Promise.resolve(
      [...this.rows.values()]
        .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
        .map(({ id, name, eventType, start, end }) => ({ id, name, eventType, start, end })),
    );
  }

  saveSeen(events: readonly ResearchEvent[], at: number): Promise<void> {
    this.fail('saveSeen');
    for (const event of events) {
      const firstSeen = this.rows.get(event.id)?.firstSeen ?? at;
      this.rows.set(event.id, { ...event, firstSeen, lastSeen: at });
    }
    return Promise.resolve();
  }

  removeEnded(before: number): Promise<number> {
    this.fail('removeEnded');
    let gone = 0;
    for (const [id, event] of this.rows) {
      if (event.end < before) {
        this.rows.delete(id);
        gone += 1;
      }
    }
    return Promise.resolve(gone);
  }

  removeNotSeen(seen: readonly string[], now: number): Promise<number> {
    this.fail('removeNotSeen');
    const listed = new Set(seen);
    let gone = 0;
    for (const [id, event] of this.rows) {
      if (event.start > now && !listed.has(id)) {
        this.rows.delete(id);
        gone += 1;
      }
    }
    return Promise.resolve(gone);
  }
}

/** The kept task list in memory (`ResearchTaskStorage`), the twin of `ResearchTaskRepository`. */
export class MemoryResearchTasks implements ResearchTaskStorage {
  readonly rows = new Map<
    string,
    { task: ResearchTask; firstSeen: number; lastSeen: number; active: boolean; position: number }
  >();
  readonly failing = new Map<keyof ResearchTaskStorage, Error>();

  private fail(method: keyof ResearchTaskStorage): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  kept(): Promise<KeptTaskList> {
    this.fail('kept');
    const active = [...this.rows.values()]
      .filter((row) => row.active)
      .sort((a, b) => a.position - b.position || a.task.key.localeCompare(b.task.key));
    const readAt = active.length === 0 ? undefined : Math.max(...active.map((row) => row.lastSeen));
    return Promise.resolve({ tasks: active.map((row) => structuredClone(row.task)), readAt });
  }

  replace(tasks: readonly ResearchTask[], at: number): Promise<void> {
    this.fail('replace');
    for (const row of this.rows.values()) row.active = false;
    for (const [position, task] of tasks.entries()) {
      const firstSeen = this.rows.get(task.key)?.firstSeen ?? at;
      this.rows.set(task.key, {
        task: structuredClone(task),
        firstSeen,
        lastSeen: at,
        active: true,
        position,
      });
    }
    return Promise.resolve();
  }
}
