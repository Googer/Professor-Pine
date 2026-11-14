import type { PageNode } from './popup.js';

/** Who is asking, as `/s/<guild>/api/me` answers. */
export type Me =
  | { loggedIn: false }
  | {
      loggedIn: true;
      name: string;
      /**
       * The member's id (plan 8M-11C, S31): whose staged region edits the browser keeps, which
       * "Edit regions" counts. Absent from a server before it, where nothing is counted.
       */
      userId?: string;
      csrf: string;
      member: boolean;
      readOnly: boolean;
      /**
       * For one in the server who lacks the map's member role (the server's `roles.mapMember`, plan 19A-1): the
       * role's name, which they need to join and report on the map.
       */
      missingRole?: string;
      /**
       * Whether "Edit regions" is offered (plan 8M-10): a hint by what Pine knows of the member;
       * the editor's data asks Discord and decides.
       */
      mayEditRegions?: boolean;
      /**
       * For one logged in who is not in the server (plan 8M-11B): the server's invite, as its
       * staff set it in `/admin settings` (its `invite`, plan 19A-1); absent where it has none.
       */
      invite?: string;
      /**
       * The server is in setup (plan 19C-2, S11): only its region editor and the map it draws on
       * are there, for its staff, and the page starts no live layer (`startsLiveLayers`).
       */
      inSetup?: boolean;
    };

/** How long the notice band shows a line (plan 8M-11A): a new line starts the time again. */
export const NOTICE_MS = 10_000;

/** The notice band's parts on the page: the band, and its text beside its ×. */
export interface NoticeParts {
  band: { hidden: boolean | string };
  text: { textContent: string | null };
}

/** Timers, the browser's by default. */
export interface NoticeTimers {
  set(run: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

/**
 * The notice band (`#notice`, plan 8M-11A): the moment's news that belongs to no party (a report
 * form's answer, the tiles, a login), over the top of the map rather than pushing it down
 * (`map.css`). A line goes away by itself after `NOTICE_MS`, a new line starting the time again;
 * its × hides it at once. A lasting state (`lasting`: the map that did not load, the editor
 * read-only, the browser's storage; review fix F1) has no timer: it stays until its × or the page
 * hides it. The answers of presses go to their post's answer line instead.
 */
export class NoticeBand {
  private timer: unknown;
  /**
   * The lasting line said last (review fix R2): a timed line over it gives it back when its time
   * is over; the × and the page's hiding forget it.
   */
  private lasting: string | undefined;

  constructor(
    private readonly parts: () => NoticeParts | undefined,
    private readonly timers: NoticeTimers = {
      set: (run, ms) => globalThis.setTimeout(run, ms),
      clear: (id) => {
        globalThis.clearTimeout(id as ReturnType<typeof setTimeout> | undefined);
      },
    },
  ) {}

  say(text: string, options: { lasting?: boolean } = {}): void {
    const parts = this.parts();
    if (!parts) return;
    parts.text.textContent = text;
    parts.band.hidden = false;
    this.timers.clear(this.timer);
    this.timer = undefined;
    if (options.lasting === true) {
      this.lasting = text;
      return;
    }
    this.timer = this.timers.set(() => {
      this.timedOut();
    }, NOTICE_MS);
  }

  hide(): void {
    this.lasting = undefined;
    this.timers.clear(this.timer);
    this.timer = undefined;
    const parts = this.parts();
    if (!parts) return;
    parts.band.hidden = true;
    parts.text.textContent = '';
  }

  /** A timed line ran out: the lasting line back where there is one, else the band hidden. */
  private timedOut(): void {
    this.timer = undefined;
    const { lasting } = this;
    if (lasting === undefined) {
      this.hide();
      return;
    }
    this.say(lasting, { lasting: true });
  }
}

/** What `?login=` may say; a `Map`, so that no name of `Object.prototype` is one of them. */
const NOTICES: ReadonlyMap<string, string> = new Map([
  ['failed', 'Login failed.'],
  ['expired', 'This login link has expired. Ask for a new one with /maps.'],
]);

/**
 * Why a login did not happen (`?login=failed|expired`, set by the server's redirect), said
 * once (to somebody logged out, `loginNoticeFor`): the text, and the query without it for
 * `history.replaceState`.
 */
export function loginNotice(search: string): { text: string; search: string } | undefined {
  const query = new URLSearchParams(search);
  const text = NOTICES.get(query.get('login') ?? '');
  if (text === undefined) return undefined;
  query.delete('login');
  const rest = query.toString();
  return { text, search: rest === '' ? '' : `?${rest}` };
}

/**
 * What the page says of `?login=` once `/api/me` answered: only to somebody logged out (review
 * fix 5). Back after a link login, or an old link opened while logged in, lands on
 * `?login=expired` with the member logged in, whose name the header shows: nothing to say.
 */
export function loginNoticeFor(notice: { text: string } | undefined, me: Me): string | undefined {
  return notice !== undefined && !me.loggedIn ? notice.text : undefined;
}

/** Which of the web pages a header is of: the live map, the region editor or the history page. */
export type WebPage = 'map' | 'editor' | 'history';

/** What the page says of somebody who is not in the server. */
export const NOT_A_MEMBER = 'You are not a member of this server.';

/**
 * What the page's header says: "Log in with Discord" (only where it is offered) or how else to
 * log in, or the member's name with what keeps them from more than the public map: Discord away,
 * the map's member role they lack (only on the map: the editor is for staff, whom the role does
 * not concern), or not being in the server, with the server's invite under it where `/api/me`
 * gives one (`invite`, plan 8M-11B).
 */
export function headerLines(
  me: Me,
  login: 'discord' | 'links',
  page: WebPage,
): { login: boolean; name?: string; lines: string[]; invite?: string } {
  if (!me.loggedIn) {
    return login === 'discord'
      ? { login: true, lines: [] }
      : { login: false, lines: ['Use /maps in Discord to log in.'] };
  }
  const lines = me.readOnly
    ? [
        page === 'history'
          ? 'Discord cannot be reached just now.'
          : 'Discord cannot be reached just now, so the map is read-only.',
      ]
    : me.member
      ? []
      : me.missingRole === undefined
        ? [NOT_A_MEMBER]
        : page === 'editor'
          ? []
          : page === 'history'
            ? [`To see this server's history, you need the ${me.missingRole} role in this server.`]
            : [
                'You can look around the map. To join or report here, you need the ' +
                  `${me.missingRole} role in this server.`,
              ];
  const invite = lines.length === 1 && lines[0] === NOT_A_MEMBER ? me.invite : undefined;
  return { login: false, name: me.name, lines, ...(invite === undefined ? {} : { invite }) };
}

/**
 * "History" in the map's account menu (plan 8H-5): the server's history page, for members only,
 * whose data it shows (`historyOffered`); the page leads back to the map from its header.
 */
export function historyItemNode(guild: string): PageNode {
  return {
    tag: 'a',
    className: 'history-link',
    text: 'History',
    attributes: { href: `/s/${guild}/history` },
  };
}

/**
 * "Your history" in the map's account menu (plan 8H-6): the member's own numbers, offered beside
 * "History" (`historyOffered`), its look the same.
 */
export function meItemNode(guild: string): PageNode {
  return {
    tag: 'a',
    className: 'history-link',
    text: 'Your history',
    attributes: { href: `/s/${guild}/me` },
  };
}

/**
 * Whether the map's account menu offers "History": to a member of the server, but in a server in
 * setup, which has none yet (plan 19C-2).
 */
export function historyOffered(me: Me): boolean {
  return me.loggedIn && me.member && me.inSetup !== true;
}

/**
 * Whether the map starts its live layers (the parties and their stream, the stops and Power
 * Spots, the activity): not in a server in setup (plan 19C-2, S11), whose answers are not there;
 * the regions and gyms the region editor draws on are.
 */
export function startsLiveLayers(me: Me): boolean {
  return !(me.loggedIn && me.inSetup === true);
}

/**
 * The server's invite under "You are not a member of this server." (plan 8M-11B): Discord's page
 * in a new tab, which cannot reach back into the map (`noopener`). After joining, a reload makes
 * them a member within the directory's minute.
 */
export function inviteNode(invite: string): PageNode {
  return {
    tag: 'a',
    className: 'invite',
    text: 'Join the server on Discord',
    attributes: { href: invite, target: '_blank', rel: 'noopener' },
  };
}
