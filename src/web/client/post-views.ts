import type { PostView } from '../../domain/web/party-data.js';

/**
 * The parties whose posts a list asks for ahead (`PostViews.prefetch`), in order: those in view
 * first; on a page's first list those alone (review N6: a household's tabs opening at once share
 * the post route's limit per address), later lists the rest after them.
 */
export function prefetchOrder<P>(
  parties: readonly P[],
  inView: (party: P) => boolean,
  first: boolean,
): P[] {
  const shown = parties.filter(inView);
  return first ? shown : [...shown, ...parties.filter((party) => !inView(party))];
}

/** What the posts need of the page: a post asked for by its key, and who is told it came. */
export interface PostViewsDeps {
  /** `GET /s/<guild>/api/parties/<id>/post?k=<key>`; undefined when it could not be had. */
  load(id: string, key: string): Promise<PostView | undefined>;
  /** A party's post came: a popup that shows the party draws it anew. */
  loaded(id: string): void;
  /** Starts a timer, for the posts asked for ahead after a signal; asked at once without. */
  setTimer?(run: () => void, ms: number): () => void;
  /** From 0 up to 1, as `Math.random`; `Math.random` unless given. */
  random?(): number;
  /** Whether the page is in use when a wait ends (`MapActivity`); it asks nothing if not. */
  active?(): boolean;
}

/** How the posts of a list a live signal caused are asked for ahead: a crowd of maps asks. */
export interface PostSpread {
  ms: number;
  /** Those a popup or card shows now: asked for at once, not left to wait. */
  atOnce(id: string): boolean;
}

/**
 * The parties' posts the page has (plan 8M-8A), by party and key (`MapParty.postKey`): a post is
 * asked for when a popup or card draws its party and the page has not got its key yet, once per
 * key at a time; while it is on its way the post the page had of the party is drawn (it differs
 * only by what changed), or none (the map's own summary). The browser keeps each by its key
 * (`?k=`). A post that comes for a key that is not the last asked of its party is dropped, and
 * so is one that comes with another key than asked (it changed meanwhile: the list's next poll
 * brings its new key; keeping it would ask and draw again and again).
 */
export class PostViews {
  private readonly kept = new Map<string, PostView>();
  /** The key last asked for of each party. */
  private readonly wanted = new Map<string, string>();
  private readonly asking = new Set<Promise<void>>();
  /** The posts that wait their share of a signal's spread (`prefetch`), by party. */
  private readonly later = new Map<string, { key: string; cancel: () => void }>();

  constructor(private readonly deps: PostViewsDeps) {}

  /** The post of a party as the page has it, its key's asked for when it has it not. */
  of(party: { id: string; postKey: string | null }): PostView | undefined {
    const { id, postKey } = party;
    if (postKey === null) return undefined;
    const kept = this.kept.get(id);
    if (kept?.key === postKey) return kept;
    // Drawn now: it does not wait out its share of a spread.
    this.stopWaiting(id);
    if (this.wanted.get(id) !== postKey) this.ask(id, postKey);
    return kept;
  }

  /**
   * Asks ahead for the posts of these parties (review 8A-3: a popup that opens has its post, and
   * does not jump when it comes): of the first `limit` in the order given (the page gives those
   * in view first), those whose key the page has not got and is not asking for, so that a list
   * asks for at most `limit` posts whatever its length, well within the post route's rate limit.
   * With `spread` (a list a live signal caused) each waits a random time inside it, but what a popup
   * shows; a party that waits already keeps its time, with its newest key.
   */
  prefetch(
    parties: readonly { id: string; postKey: string | null }[],
    limit: number,
    spread?: PostSpread,
  ): void {
    const { deps } = this;
    for (const { id, postKey } of parties.slice(0, limit)) {
      if (postKey === null || this.kept.get(id)?.key === postKey) continue;
      if (this.wanted.get(id) === postKey) continue;
      const waiting = this.later.get(id);
      if (waiting) {
        waiting.key = postKey;
        if (!spread?.atOnce(id)) continue;
      }
      if (spread === undefined || deps.setTimer === undefined || spread.atOnce(id)) {
        this.stopWaiting(id);
        this.ask(id, postKey);
        continue;
      }
      const entry = {
        key: postKey,
        cancel: deps.setTimer(
          () => {
            this.later.delete(id);
            // Hidden meanwhile: its next draw asks, if it is still wanted by then.
            if (deps.active?.() === false) return;
            if (this.kept.get(id)?.key !== entry.key && this.wanted.get(id) !== entry.key) {
              this.ask(id, entry.key);
            }
          },
          (deps.random?.() ?? Math.random()) * spread.ms,
        ),
      };
      this.later.set(id, entry);
    }
  }

  private stopWaiting(id: string): void {
    this.later.get(id)?.cancel();
    this.later.delete(id);
  }

  /**
   * Forgets the posts of every party but these (review W-5: the page's list, at each poll), so
   * that a page left open does not keep the post of every party that ever was. A post on its way
   * for a party forgotten is dropped when it comes.
   */
  keepOnly(parties: readonly { id: string }[]): void {
    const listed = new Set(parties.map((party) => party.id));
    for (const id of [...this.kept.keys()]) if (!listed.has(id)) this.kept.delete(id);
    for (const id of [...this.wanted.keys()]) if (!listed.has(id)) this.wanted.delete(id);
    for (const id of [...this.later.keys()]) if (!listed.has(id)) this.stopWaiting(id);
  }

  /** Resolves once no post is on its way (for tests). */
  async idle(): Promise<void> {
    while (this.asking.size > 0) await Promise.all(this.asking);
  }

  private ask(id: string, key: string): void {
    this.wanted.set(id, key);
    const asked = this.deps
      .load(id, key)
      .catch(() => undefined)
      .then((view) => {
        if (this.wanted.get(id) !== key) return;
        // A failed load is asked again the next time the party is drawn.
        this.wanted.delete(id);
        if (view?.key !== key) return;
        this.kept.set(id, view);
        this.deps.loaded(id);
      })
      .finally(() => {
        this.asking.delete(asked);
      });
    this.asking.add(asked);
  }
}
