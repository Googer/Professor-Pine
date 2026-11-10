import type {
  EventForumRecord,
  EventForumStorage,
  EventPostChange,
  EventPostRecord,
} from '../../src/db/repositories/event-forum-repository.js';
import type { ListedEventStorage } from '../../src/db/repositories/listed-event-repository.js';
import type { ListedEvent } from '../../src/domain/time/event-listing.js';

/**
 * The events forums and their posts in memory (`EventForumStorage`), the twin of
 * `EventForumRepository`; `failing` per method (a rejected promise, as the repository fails).
 */
export class MemoryEventForums implements EventForumStorage {
  private readonly forumRows = new Map<string, EventForumRecord>();
  private readonly postRows: EventPostRecord[] = [];
  readonly failing = new Map<keyof EventForumStorage, Error>();

  private fails(method: keyof EventForumStorage): Promise<never> | undefined {
    const err = this.failing.get(method);
    return err ? Promise.reject(err) : undefined;
  }

  forums(): Promise<EventForumRecord[]> {
    return (
      this.fails('forums') ??
      Promise.resolve(
        [...this.forumRows.values()]
          .map((row) => ({ ...row }))
          .sort((a, b) => a.serverId.localeCompare(b.serverId)),
      )
    );
  }

  forum(serverId: string): Promise<EventForumRecord | undefined> {
    const row = this.forumRows.get(serverId);
    return this.fails('forum') ?? Promise.resolve(row && { ...row });
  }

  setForum(serverId: string, forumId: string): Promise<void> {
    const failed = this.fails('setForum');
    if (failed) return failed;
    const row = this.forumRows.get(serverId);
    if (row?.forumId !== forumId) {
      // Another forum retires the server's live posts, as the repository does (review V2).
      if (row) {
        const kept = this.postRows.filter((one) => one.serverId !== serverId || one.gone);
        this.postRows.splice(0, this.postRows.length, ...kept);
      }
      this.forumRows.set(serverId, { serverId, forumId, listingPostId: null });
    }
    return Promise.resolve();
  }

  setListing(serverId: string, forumId: string, postId: string | null): Promise<boolean> {
    const failed = this.fails('setListing');
    if (failed) return failed;
    const row = this.forumRows.get(serverId);
    if (row?.forumId !== forumId) return Promise.resolve(false);
    row.listingPostId = postId;
    return Promise.resolve(true);
  }

  posts(serverId: string): Promise<EventPostRecord[]> {
    return (
      this.fails('posts') ??
      Promise.resolve(
        this.postRows
          .filter((row) => row.serverId === serverId)
          .map((row) => ({ ...row }))
          .sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)),
      )
    );
  }

  addPost(record: EventPostRecord): Promise<boolean> {
    const failed = this.fails('addPost');
    if (failed) return failed;
    if (this.find(record.serverId, record.eventId)) return Promise.resolve(false);
    this.postRows.push({ ...record });
    return Promise.resolve(true);
  }

  updatePost(serverId: string, eventId: string, change: EventPostChange): Promise<void> {
    const failed = this.fails('updatePost');
    if (failed) return failed;
    const row = this.find(serverId, eventId);
    if (row) Object.assign(row, change);
    return Promise.resolve();
  }

  movePost(serverId: string, from: string, to: string): Promise<boolean> {
    const failed = this.fails('movePost');
    if (failed) return failed;
    const row = this.find(serverId, from);
    if (!row || this.find(serverId, to)) return Promise.resolve(false);
    row.eventId = to;
    return Promise.resolve(true);
  }

  private find(serverId: string, eventId: string): EventPostRecord | undefined {
    return this.postRows.find((row) => row.serverId === serverId && row.eventId === eventId);
  }
}

/** The listed events in memory (`ListedEventStorage`), the twin of `ListedEventRepository`. */
export class MemoryListedEvents implements ListedEventStorage {
  private kept: ListedEvent[];
  readonly failing = new Map<keyof ListedEventStorage, Error>();

  constructor(kept: readonly ListedEvent[] = []) {
    this.kept = copy(kept);
  }

  all(): Promise<ListedEvent[]> {
    const err = this.failing.get('all');
    return err ? Promise.reject(err) : Promise.resolve(copy(this.kept));
  }

  replace(events: readonly ListedEvent[]): Promise<void> {
    const err = this.failing.get('replace');
    if (err) return Promise.reject(err);
    this.kept = copy(events);
    return Promise.resolve();
  }
}

/** In order of the start, then the name, as the repository gives them; copies. */
function copy(events: readonly ListedEvent[]): ListedEvent[] {
  return events
    .map((event) => ({ ...event, formerIds: [...event.formerIds] }))
    .sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}
