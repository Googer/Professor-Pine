import type { V2Message } from '../discord/party-gateway.js';
import type { AuditRecord } from '../db/repositories/party-audit-repository.js';
import type { AuditEntry } from '../domain/party/audit.js';
import { partyWord, type PartyType } from '../domain/party/party.js';
import { TRAIN_KIND_WORDS } from '../domain/web/party-data.js';
import { clockOrDate, fitItems, memberText, plain, type NamedMember } from './text.js';
import { LIST_COLOUR, textMessage } from './v2.js';

/** At most this many entries are shown (Matt, 2026-11-07); the older are counted. */
export const AUDIT_LINES = 25;

/** Room for the lines of one answer, under the 4,000 of a message's text. */
const LINES_ROOM = 3_500;

export const NOTHING_LOGGED = 'Nothing is logged for this post.';
export const AUDIT_WHERE = "Use `/audit` in a party's post, or give `member`.";

/** A name the log kept, in bold; what stands for a name it did not know. */
function named(name: string | null | undefined, unknown: string): string {
  return name === null || name === undefined ? unknown : `**${plain(name)}**`;
}

function channel(id: string | null | undefined): string {
  return id === null || id === undefined ? '' : ` in <#${id}>`;
}

/** `(was 7:30 PM)`, `(was **The Stacks**)`; nothing where there was nothing. */
function was(text: string | undefined): string {
  return text === undefined ? '' : ` (was ${text})`;
}

/** How long the stops of one change of a route may run in its line. */
const STOPS_ROOM = 300;

/**
 * `added the stop **A**`, `removed 2 stops: **B**, **C**`, `added 30 stops: …, …and 22 more`;
 * undefined for none.
 */
function stopsWords(did: string, stops: readonly (string | null)[]): string | undefined {
  const [only] = stops;
  if (stops.length === 0) return undefined;
  const name = (stop: string | null) => (stop === null ? undefined : `**${plain(stop)}**`);
  if (stops.length === 1) {
    const one = name(only ?? null);
    return one === undefined ? `${did} a stop Pine no longer knows` : `${did} the stop ${one}`;
  }
  const names = stops.map((stop) => name(stop) ?? 'a stop Pine no longer knows');
  return `${did} ${String(stops.length)} stops: ${fitItems(names, STOPS_ROOM)}`;
}

/** What an entry says was done, after who did it, at `now`. */
export function auditWords(entry: AuditEntry, now: number): string {
  const time = (ms: number) => clockOrDate(ms, now);
  const setTime = (what: string, from: number | null, to: number | null): string =>
    to === null
      ? `took away the ${what}${was(from === null ? undefined : time(from))}`
      : `set the ${what}: ${time(to)}${was(from === null ? undefined : time(from))}`;
  switch (entry.action) {
    case 'created': {
      const times = [
        entry.hatch === null ? undefined : `hatches ${time(entry.hatch)}`,
        entry.start === null ? undefined : `starts ${time(entry.start)}`,
        entry.end === null ? undefined : `ends ${time(entry.end)}`,
      ].filter((text) => text !== undefined);
      const anonymous = entry.anonymous ? ' (anonymous in the post)' : '';
      const place = entry.place === null ? '' : ` at **${plain(entry.place)}**`;
      const after = `${place}${times.length === 0 ? '' : `, ${times.join(', ')}`}`;
      if (entry.kind === 'raid' || entry.kind === 'max') {
        const boss =
          entry.boss === null || entry.boss === undefined
            ? entry.kind !== 'raid'
              ? ''
              : entry.hatched === true
                ? ' (hatched, boss unknown)'
                : ' (egg)'
            : ` against ${plain(entry.boss)}`;
        return `reported it${anonymous}: ${entry.what ?? partyWord({ type: entry.kind })}${boss}${after}`;
      }
      return `made it${anonymous}: **${plain(entry.name ?? partyWord({ type: entry.kind }))}**${after}`;
    }
    case 'moved':
      return `moved it here from ${named(entry.fromPlace, 'another place')}${channel(entry.fromChannel)}`;
    case 'boss':
      return `set the boss: ${plain(entry.to)}${was(plain(entry.from))}`;
    case 'moves':
      return `set the moves: ${plain(entry.to)}${was(plain(entry.from))}`;
    case 'place':
      return `moved it to ${named(entry.to, 'a place Pine no longer knows')}${was(
        entry.from === null ? undefined : named(entry.from, ''),
      )}`;
    case 'hatch':
      return setTime('hatch time', entry.from, entry.to);
    case 'start':
      return setTime('start time', entry.from, entry.to);
    case 'end':
      return setTime('end time', entry.from, entry.to);
    case 'name':
      return `renamed it: **${plain(entry.to)}**${was(`**${plain(entry.from)}**`)}`;
    case 'info':
      return 'changed the information';
    case 'route':
      return [stopsWords('added', entry.added), stopsWords('removed', entry.removed)]
        .filter((words) => words !== undefined)
        .join(' and ');
    case 'kind':
      return `made it a ${TRAIN_KIND_WORDS[entry.to]}${was(`a ${TRAIN_KIND_WORDS[entry.from]}`)}`;
    case 'route-cleared':
      return 'cleared the route';
    case 'conductor':
      return entry.to === null
        ? 'left it without a conductor'
        : `made ${memberText(entry.to)} the conductor`;
    case 'saved':
      return entry.saved
        ? 'kept its post open (`/admin save-party`)'
        : 'let its post be archived as usual (`/admin save-party`)';
    case 'ended': {
      const post =
        entry.removal === undefined
          ? ''
          : entry.removal === 'delete'
            ? ' (deleted the post)'
            : ' (archived the post)';
      switch (entry.how) {
        case 'clock':
          return 'ended it: its time was up';
        case 'failed':
          return 'ended it: its post could not be made';
        case 'moved':
          return `moved it to ${named(entry.toPlace, 'another place')}${channel(entry.toChannel)}`;
        case 'closed':
          return entry.by === 'moderators'
            ? `closed it for a report to the moderators${post}`
            : `closed it${post}`;
      }
    }
  }
}

/** Who did it: a member by name and mention (staff read it privately), or Pine. */
function actorOf(record: AuditRecord): string {
  return record.actor === null ? '**Pine**' : memberText(record.actor);
}

/** One line of the log: `<t:…:t> **Ash** (<@id>) set the boss: Yveltal (T5) (was T5 egg)`. */
export function auditLine(record: AuditRecord, now: number): string {
  const { entry } = record;
  if (entry.action === 'ended' && entry.how === 'clock' && record.actor === null) {
    return `${clockOrDate(record.at, now)} The clock ended it.`;
  }
  // Staff's closing that names nobody (a deletion redone by the upkeep): staff's all the same.
  if (
    entry.action === 'ended' &&
    entry.how === 'closed' &&
    entry.by === 'staff' &&
    record.actor === null
  ) {
    const post =
      entry.removal === 'delete'
        ? 'staff deleted its post'
        : entry.removal === 'archive'
          ? 'staff archived its post'
          : 'staff closed it';
    return `${clockOrDate(record.at, now)} **Pine** closed it: ${post}.`;
  }
  return `${clockOrDate(record.at, now)} ${actorOf(record)} ${auditWords(entry, now)}.`;
}

/** The newest of `lines` that fit `room` and `AUDIT_LINES`, oldest first, and how many did not. */
function fitted(lines: readonly string[], room: number): { kept: string[]; dropped: number } {
  const kept: string[] = [];
  let left = room;
  for (const line of [...lines].reverse()) {
    if (kept.length === AUDIT_LINES || line.length + 1 > left) break;
    kept.unshift(line);
    left -= line.length + 1;
  }
  return { kept, dropped: lines.length - kept.length };
}

/**
 * The one line that says what is not shown: `-# …and 3 earlier changes`; with `more` (there are
 * older ones than were read) `-# …and more than 3 earlier changes`, or `-# …and earlier changes`.
 */
function earlierLine(dropped: number, more = false): string | undefined {
  if (more) {
    return dropped === 0
      ? '-# …and earlier changes'
      : `-# …and more than ${String(dropped)} earlier changes`;
  }
  if (dropped === 0) return undefined;
  return `-# …and ${String(dropped)} earlier ${dropped === 1 ? 'change' : 'changes'}`;
}

/** The kind of party a post's log is of: that of its newest creation or move. */
function kindOf(records: readonly AuditRecord[]): PartyType | undefined {
  for (const { entry } of [...records].reverse()) {
    if (entry.action === 'created' || entry.action === 'moved') return entry.kind;
  }
  return undefined;
}

/**
 * `/audit` in a post: `### Log of this raid`, a line per entry, oldest first. How the party was
 * made (its newest creation or move here) always stands first, outside the `AUDIT_LINES`.
 */
export function postAuditMessage(records: readonly AuditRecord[], now: number): V2Message {
  const kind = kindOf(records);
  const heading = `### Log of this ${kind === undefined ? 'post' : partyWord({ type: kind })}`;
  if (records.length === 0) return textMessage(LIST_COLOUR, [heading, NOTHING_LOGGED]);
  const made = records.findLastIndex(
    ({ entry }) => entry.action === 'created' || entry.action === 'moved',
  );
  const first = made === -1 ? undefined : records[made];
  const rest = records.filter((_record, n) => n !== made);
  const top = first === undefined ? undefined : auditLine(first, now);
  const lines = rest.map((record) => auditLine(record, now));
  const { kept, dropped } = fitted(lines, LINES_ROOM - (top === undefined ? 0 : top.length + 1));
  const shown = [top, earlierLine(dropped), ...kept].filter((line) => line !== undefined);
  return textMessage(LIST_COLOUR, [heading, shown.join('\n')]);
}

/** `/audit member:`: the member's newest entries in this server, each with its post. */
export function memberAuditMessage(
  member: NamedMember,
  records: readonly AuditRecord[],
  now: number,
  more: boolean,
): V2Message {
  const heading = `### Changes by ${memberText(member)}`;
  if (records.length === 0) {
    return textMessage(LIST_COLOUR, [heading, 'Nothing is logged for this member.']);
  }
  const lines = records.map((record) => {
    const where = record.postId === null ? '' : ` in <#${record.postId}>`;
    return `${clockOrDate(record.at, now)}${where}: ${auditWords(record.entry, now)}.`;
  });
  const { kept, dropped } = fitted(lines, LINES_ROOM);
  const shown = [earlierLine(dropped, more), ...kept].filter((line) => line !== undefined);
  return textMessage(LIST_COLOUR, [heading, shown.join('\n')]);
}
