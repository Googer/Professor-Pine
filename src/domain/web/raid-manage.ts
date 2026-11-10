/**
 * What Manage… of a raid asks for, the one rule of the map's form and the post's dialog (plan
 * 8M-21; Matt, 2026-11-07: "the UI is 100% consistent there between Discord and web"): which
 * changes a Submit makes of what was filled in, in which order, and what it answers when nothing
 * was. Pure, and free of the server's code: the page's bundle takes it.
 */

/** What a Submit answers when nothing in its form was changed, as Manage… of a train does. */
export const NOTHING_CHANGED = 'Nothing changed.';

/** Said where a boss is picked with moves: the moves on the form are the old boss's. */
export const MOVES_LATER = "The new boss's moves are set in Manage… afterwards.";

/** A change of a raid a Submit asks for, as its command takes it (`/boss`, `/hatch`, `/end`, `/moveset`). */
export type RaidChangeAsked =
  | { change: 'boss'; boss: string }
  | { change: 'hatch' | 'end'; time: string }
  | { change: 'moves'; quick: string | null; charge: string | null };

/** What the form holds, by the names of its fields: `hatch`, `end`, `boss`, `quick`, `charge`. */
export type RaidManageFields = Readonly<Record<string, string | undefined>>;

/**
 * The changes a Submit asks for, from what was filled in (trimmed; empty is no change), in the
 * order they are made: the boss, the hatch time, the end time, the moves. Never the moves with a
 * boss, for the moves on the form are the old boss's (`movesLeft` says whether some were picked).
 */
export function raidChangesAsked(fields: RaidManageFields): RaidChangeAsked[] {
  const field = (name: string): string => (fields[name] ?? '').trim();
  const asked: RaidChangeAsked[] = [];
  const boss = field('boss');
  if (boss !== '') asked.push({ change: 'boss', boss });
  for (const change of ['hatch', 'end'] as const) {
    const time = field(change);
    if (time !== '') asked.push({ change, time });
  }
  const quick = field('quick');
  const charge = field('charge');
  if (boss === '' && (quick !== '' || charge !== '')) {
    asked.push({
      change: 'moves',
      quick: quick === '' ? null : quick,
      charge: charge === '' ? null : charge,
    });
  }
  return asked;
}

/** Whether moves were picked beside a new boss, and so left for later (`MOVES_LATER`). */
export function movesLeft(fields: RaidManageFields): boolean {
  const field = (name: string): string => (fields[name] ?? '').trim();
  return field('boss') !== '' && (field('quick') !== '' || field('charge') !== '');
}

/**
 * The answer of a Submit from the words of each change made, in turn: the words joined, a
 * refusal's after what went through before it; `NOTHING_CHANGED` when nothing was asked.
 */
export function manageWords(said: readonly string[]): string {
  return said.length === 0 ? NOTHING_CHANGED : said.join(' ');
}
