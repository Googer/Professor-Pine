import type { V2Message } from '../discord/party-gateway.js';
import type { AuditRecord } from '../db/repositories/party-audit-repository.js';
import type { AuditEntry } from '../domain/party/audit.js';
import { partyWord, type PartyType } from '../domain/party/party.js';
import { clockOrDate, memberText, plain, type NamedMember } from './text.js';
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
            ? entry.kind === 'raid'
              ? ' (egg)'
              : ''
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
    case 'stop-added':
    case 'stop-removed': {
      const did = entry.action === 'stop-added' ? 'added' : 'removed';
      return entry.stop === null
        ? `${did} a stop Pine no longer knows`
        : `${did} the stop **${plain(entry.stop)}**`;
    }
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
  return `${clockOrDate(record.at, now)} ${actorOf(record)} ${auditWords(entry, now)}.`;
}

/**
 * The newest of `lines` that fit `LINES_ROOM` and `AUDIT_LINES`, oldest first, then how many
 * older ones were left out (`-# …and 3 earlier changes`).
 */
function fitted(lines: readonly string[]): string[] {
  const kept: string[] = [];
  let room = LINES_ROOM;
  for (const line of [...lines].reverse()) {
    if (kept.length === AUDIT_LINES || line.length + 1 > room) break;
    kept.unshift(line);
    room -= line.length + 1;
  }
  const earlier = lines.length - kept.length;
  if (earlier === 0) return kept;
  return [`-# …and ${String(earlier)} earlier ${earlier === 1 ? 'change' : 'changes'}`, ...kept];
}

/** The kind of party a post's log is of: that of its newest creation or move. */
function kindOf(records: readonly AuditRecord[]): PartyType | undefined {
  for (const { entry } of [...records].reverse()) {
    if (entry.action === 'created' || entry.action === 'moved') return entry.kind;
  }
  return undefined;
}

/** `/audit` in a post: `### Log of this raid`, a line per entry, oldest first. */
export function postAuditMessage(records: readonly AuditRecord[], now: number): V2Message {
  const kind = kindOf(records);
  const heading = `### Log of this ${kind === undefined ? 'post' : partyWord({ type: kind })}`;
  if (records.length === 0) return textMessage(LIST_COLOUR, [heading, NOTHING_LOGGED]);
  const lines = records.map((record) => auditLine(record, now));
  return textMessage(LIST_COLOUR, [heading, fitted(lines).join('\n')]);
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
  const shown = fitted(lines);
  return textMessage(LIST_COLOUR, [
    heading,
    (more && shown.length === lines.length ? ['-# …and earlier changes', ...shown] : shown).join(
      '\n',
    ),
  ]);
}
