import type { StoredServerRecord } from '../db/repositories/server-record-repository.js';
import { TEXT_BUDGET } from './party-post.js';
import { serverNameShown } from './server-admission.js';
import { count } from './text.js';

/** A server the client knows (`client.guilds.cache`): its name and member count where available. */
export interface KnownServer {
  id: string;
  /** Undefined where Discord says it is unavailable (an outage): its name is not known then. */
  name: string | undefined;
  members: number | undefined;
}

/** What `/operator servers list` shows of one server (plan 19C-1). */
export interface ServerLine {
  id: string;
  name: string | undefined;
  members: number | undefined;
  /** Pine is in it now (the client has it, and it is not marked left). */
  present: boolean;
  /** When its setup was done (`ServerSettings.setUpAt`); null where it is not. */
  setUpAt: number | null;
  /** Since when Pine left it; null where it did not. */
  leftAt: number | null;
  /** Since when it is blocked; null where it is not. */
  blockedAt: number | null;
  /** Allowed by an operator, not by the file nor the record. */
  allowed: boolean;
  /** When its last recorded party was made; undefined where none was. */
  lastParty: number | undefined;
}

/** How many servers one page of the list shows. */
export const SERVERS_PER_PAGE = 20;

/**
 * Every server the instance knows of, in the order the list shows them: those Pine is in by
 * name, then those it left or blocked or allowed and is not in, by id. Never a member.
 */
export function serverLines(
  known: readonly KnownServer[],
  standings: readonly StoredServerRecord[],
  facts: {
    isLeft: (serverId: string) => boolean;
    setUpAt: (serverId: string) => number | null;
    lastParty: ReadonlyMap<string, number>;
  },
): ServerLine[] {
  const byId = new Map(standings.map((row) => [row.serverId, row]));
  const line = (id: string, server: KnownServer | undefined, present: boolean): ServerLine => {
    const row = byId.get(id);
    return {
      id,
      name: server?.name,
      members: server?.members,
      present,
      setUpAt: facts.setUpAt(id),
      leftAt: row?.leftAt ?? null,
      blockedAt: row?.blockedAt ?? null,
      allowed: row?.allowedAt !== null && row?.allowedAt !== undefined,
      lastParty: facts.lastParty.get(id),
    };
  };
  const present = known
    .filter((server) => !facts.isLeft(server.id))
    .map((server) => line(server.id, server, true))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id));
  const inIt = new Set(present.map((server) => server.id));
  const knownById = new Map(known.map((server) => [server.id, server]));
  const others = standings
    .filter(
      (row) =>
        !inIt.has(row.serverId) &&
        (row.leftAt !== null || row.blockedAt !== null || row.allowedAt !== null),
    )
    .map((row) => line(row.serverId, knownById.get(row.serverId), false));
  return [...present, ...others];
}

/**
 * The characters a page's text takes at most (J5): well under Discord's `TEXT_BUDGET`, as
 * `FORGET_TEXT_BUDGET`; a page holds `SERVERS_PER_PAGE` servers at most, fewer where their lines
 * are long.
 */
export const SERVERS_TEXT_BUDGET = TEXT_BUDGET - 500;

/** The room kept on a page for its title and its footer. */
const FRAME_ROOM = 250;

/**
 * One server's line: its name (cut to `SERVER_NAME_CHARS` before it is escaped,
 * `serverNameShown`) and id, members, its state, its last party.
 */
function lineWords(server: ServerLine): string {
  const name =
    server.name === undefined
      ? `\`${server.id}\``
      : `**${serverNameShown(server.name)}** \`${server.id}\``;
  const parts = [name];
  if (server.present && server.members !== undefined) {
    const { members } = server;
    parts.push(`${members.toLocaleString('en-US')} ${members === 1 ? 'member' : 'members'}`);
  }
  if (server.present && server.name === undefined) parts.push('unavailable now');
  if (server.blockedAt !== null) parts.push(`blocked <t:${String(seconds(server.blockedAt))}:R>`);
  if (server.leftAt !== null) parts.push(`left <t:${String(seconds(server.leftAt))}:R>`);
  else if (!server.present && server.allowed) parts.push('allowed, not added yet');
  if (server.present) parts.push(server.setUpAt === null ? 'not set up' : 'set up');
  parts.push(
    server.lastParty === undefined
      ? 'no party yet'
      : `last party <t:${String(seconds(server.lastParty))}:R>`,
  );
  return parts.join(' · ');
}

const seconds = (ms: number): number => Math.floor(ms / 1_000);

/**
 * The servers' lines in pages (J5): each page as many as fit in `SERVERS_TEXT_BUDGET` beside its
 * title and footer, and `SERVERS_PER_PAGE` at most. A line never crosses the budget by itself
 * (its name is cut, its other parts bounded).
 */
function pagesOf(words: readonly string[]): string[][] {
  const pages: string[][] = [];
  let page: string[] = [];
  let used = 0;
  for (const line of words) {
    const fits = used + line.length + 1 <= SERVERS_TEXT_BUDGET - FRAME_ROOM;
    if (page.length > 0 && (page.length >= SERVERS_PER_PAGE || !fits)) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(line);
    used += line.length + 1;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

/**
 * The texts of a page of the list (plan 19C-1): the title, one line per server, and where there
 * are several pages which this is and how to see the next. `page` is 1-based and kept within the
 * pages. Within `SERVERS_TEXT_BUDGET`, however long the servers' names.
 */
export function serverListTexts(lines: readonly ServerLine[], page: number): string[] {
  const pages = pagesOf(lines.map(lineWords));
  const pageCount = Math.max(1, pages.length);
  const shown = Math.min(Math.max(1, page), pageCount);
  const slice = pages[shown - 1] ?? [];
  const inIt = lines.filter((line) => line.present).length;
  const title = `### This Pine’s servers\nIn ${count(inIt, 'server')}${
    lines.length > inIt ? `; ${String(lines.length - inIt)} more left, blocked or allowed` : ''
  }.`;
  const body = slice.length === 0 ? 'No server yet.' : slice.join('\n');
  const footer =
    pageCount > 1
      ? `-# Page ${String(shown)} of ${String(pageCount)}. The next: \`/operator servers list page:${String(
          shown < pageCount ? shown + 1 : 1,
        )}\`.`
      : undefined;
  return [title, body, ...(footer === undefined ? [] : [footer])];
}
