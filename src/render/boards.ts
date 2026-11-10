import type { APIComponentInContainer } from 'discord.js';
import {
  boardCountWords,
  boardTitle,
  emptyBoardText,
  wantedDayText,
  type BoardName,
} from '../domain/history/board-words.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { ShownBoard, ViewerPlace } from '../services/boards.js';
import { container, LIST_COLOUR, textDisplay } from './v2.js';
import { IN_SETTINGS } from './settings-words.js';
import { memberName, plain } from './text.js';

/**
 * A board as text (plan 8H-6): its title, then a numbered line per member or thing, a member by
 * their name in the server (`memberName`: never a mention, the board leaves out a member without
 * a name), a thing by the catalogue's or the task list's words (`plain`: a task's words are the
 * feed's); or what it says where it has none.
 */
export function boardText(view: ShownBoard): string {
  const lines =
    view.kind === 'people'
      ? view.rows.map(
          (row) =>
            `${String(row.rank)}. ${memberName({ id: row.memberId, name: row.name })}: ` +
            boardCountWords(view.board, row.count, row.confirmations),
        )
      : view.rows.map(
          (row) =>
            `${String(row.rank)}. ${plain(row.name)}: ${boardCountWords(view.board, row.count)}`,
        );
  const body =
    lines.length > 0
      ? lines
      : [emptyBoardText(view.board, view.period, view.kind === 'things' && view.day !== undefined)];
  return [`### ${boardTitle(view.board, view.period)}`, ...body].join('\n');
}

/** The small print under a board: the day of the most wanted, nothing elsewhere. */
export function boardSmallPrint(view: ShownBoard): string[] {
  return view.kind === 'things' && view.day !== undefined ? [wantedDayText(view.day)] : [];
}

/**
 * Where the viewer stands, under a board that does not show them (Q-H). `settings`: where they
 * turn the boards on, as Discord says it unless a page says it (`IN_SETTINGS_ON_DISCORD`).
 */
export function viewerText(
  board: BoardName,
  place: ViewerPlace,
  settings: string = IN_SETTINGS,
): string {
  const counts = boardCountWords(board, place.count, place.confirmations);
  return place.on
    ? `You are #${String(place.rank)} with ${counts}.`
    : `You would be #${String(place.rank)} with ${counts}. Turn the boards on ${settings} to be ranked.`;
}

/**
 * A board as a components-v2 message of one container: its text, its small print, then `more`
 * (the viewer's place and the controls of the private answer, or the small print of a shared
 * one).
 */
export function boardMessage(
  view: ShownBoard,
  more: readonly APIComponentInContainer[] = [],
): V2Message {
  return {
    v2: true,
    components: [
      container(LIST_COLOUR, [
        textDisplay(boardText(view)),
        ...boardSmallPrint(view).map((text) => textDisplay(`-# ${text}`)),
        ...more,
      ]),
    ],
  };
}
