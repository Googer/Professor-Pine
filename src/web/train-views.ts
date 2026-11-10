import type { AppContext } from '../app-context.js';
import { trainRefusal } from '../commands/trains/train-changes.js';
import type { DialogChoice } from '../discord/dialog.js';
import type { TrainParty } from '../domain/party/party.js';
import type { MapMoveRefusal, MapMoves } from '../domain/web/party-data.js';
import type { MapFormChoice } from '../domain/web/train-data.js';
import { moveForm } from '../render/train-dialogs.js';
import { aheadText } from '../render/train-post.js';
import type { StopLookup } from '../render/train-stops.js';
import { UNREACHABLE } from './acting.js';

/*
 * A train's post's dialogs as the live map shows them (plan 8M-8C): made by the dialogs' own
 * builders (`moveForm`, `manageForm`, `splitForm` of `src/render/`) and words, only put into the
 * map's data here, their markdown made text of the page by the caller's `words` (`pageWords`).
 */

/** Move… of a train as the post's dialog draws it now, in the map's data (`MapMoves`). */
export function movesOnTheMap(
  stops: StopLookup,
  party: TrainParty,
  words: (text: string) => string,
): MapMoves {
  const form = moveForm({ party, stop: stops });
  return {
    title: form.title,
    place: form.place,
    text: words(form.text),
    label: form.label,
    moves: form.moves.map((offered) => ({
      move: offered.move,
      target: offered.target,
      label: offered.label,
      ...(offered.description === undefined ? {} : { line: offered.description }),
    })),
  };
}

/**
 * Why a member may not move a train on the map, in the words Discord says before Move… and
 * Manage… open (`manageRefusal`: `trainRefusal` of `mayNotMove`'s reason; review C1), also for a
 * train without a route (`no-route`); while read-only what a write answers then (`UNREACHABLE`).
 */
export function refusalOnTheMap(
  ctx: { attendance: Pick<AppContext['attendance'], 'limits'> },
  reason: MapMoveRefusal,
  words: (text: string) => string,
): string {
  return words(reason === 'read-only' ? UNREACHABLE : trainRefusal(ctx, reason));
}

/** What lies ahead of a train as its post's small print says it (`aheadText`), in the map's words. */
export function aheadOnTheMap(
  stops: StopLookup,
  party: TrainParty,
  words: (text: string) => string,
): string | undefined {
  const ahead = aheadText({ party, stop: stops });
  return ahead === undefined ? undefined : words(ahead);
}

/** A choice of a dialog as the map's form shows it: its options' descriptions as their lines. */
export function formChoice(choice: DialogChoice): MapFormChoice {
  return {
    label: choice.label,
    options: choice.options.map((option) => ({
      value: option.value,
      label: option.label,
      ...(option.description === undefined ? {} : { line: option.description }),
      ...(option.emoji === undefined ? {} : { emoji: option.emoji }),
    })),
    ...(choice.picked === undefined ? {} : { picked: choice.picked }),
  };
}
