import { distanceWords, type DistanceUnits } from '../../render/distance-words.js';
import {
  ButtonStyle,
  ComponentType,
  SlashCommandSubcommandBuilder,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIComponentInContainer,
} from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { discordPayload, type V2Message } from '../../discord/party-gateway.js';
import { UserError } from '../../discord/errors.js';
import { tidyLine } from '../../domain/gyms/gym-text.js';
import type { WayspotKind } from '@pine/wayspot-core/export-file';
import { CANDIDATE_METRES } from '../../domain/wayspots/match.js';
import type { ReviewCandidate } from '../../domain/wayspots/review.js';
import { isWayfarerId } from '@pine/wayspot-core/export-file';
import { looksSponsored } from '../../domain/wayspots/sponsors.js';
import type { ReviewCounts } from '../../db/repositories/wayfarer-repository.js';
import { GYM_COLOUR, gymLabel, gymWithId, regionsSentence } from '../../render/gym-view.js';
import { gymMapsUrl } from '../../render/raid-post.js';
import { plain, truncate } from '../../render/text.js';
import { actionRow, container, separator, textDisplay } from '../../render/v2.js';
import {
  gymCandidates,
  type ReviewAction,
  type ReviewOutcome,
  type ReviewNone,
  type ReviewShown,
} from '../../services/wayfarer-review-service.js';
import { deletedLines, goesWith, raidThere } from './delete.js';
import { GYM_GONE, nearLines, pointLink, staffPlace } from './shared.js';
import { serverValuesOf } from '../../discord/server-values.js';

/** The custom-id kind of the buttons of `/gym review` (documented in `custom-id.ts`). */
export const GYM_REVIEW_KIND = 'gymreview';

/** What Discord shows of a button's label at most. */
const LABEL = 80;
/** How much of a Wayspot's title a line shows. */
const TITLE_SHOWN = 80;

/** What the queue holds no more of. */
export const NOTHING_LEFT = 'Nothing left to review.';

const KIND_WORDS: Readonly<Record<WayspotKind, string>> = {
  gym: 'a gym',
  stop: 'a PokéStop',
  powerspot: 'a Power Spot',
};

/** A Wayspot's title as a button shows it: tidied, never empty. */
function labelTitle(title: string): string {
  const tidy = tidyLine(title);
  return tidy === '' ? '(no title)' : tidy;
}

/** A Wayspot's title as a line shows it: plain, cut, never empty. */
function lineTitle(title: string): string {
  const shown = plain(truncate(tidyLine(title), TITLE_SHOWN));
  return shown === '' ? '(no title)' : shown;
}

/**
 * A button that names a candidate: `<prefix><title> (<distance>)`, the title cut so that the
 * whole fits a label; the distance tells two Wayspots of one title apart.
 */
function candidateLabel(prefix: string, candidate: ReviewCandidate, units: DistanceUnits): string {
  const tail = ` (${distanceWords(candidate.metres, units)})`;
  return `${prefix}${truncate(labelTitle(candidate.title), LABEL - prefix.length - tail.length)}${tail}`;
}

/** A button under an item: `gymreview:<review id>:<action>[:<Wayfarer id>]`. */
function reviewButton(
  reviewId: number,
  action: ReviewAction,
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Danger,
  wayspotId?: string,
): APIButtonComponent {
  return {
    type: ComponentType.Button,
    custom_id: encodeCustomId({
      kind: GYM_REVIEW_KIND,
      id: String(reviewId),
      action,
      args: wayspotId === undefined ? [] : [wayspotId],
    }),
    label,
    style,
  };
}

/**
 * The open items by kind as words: "2 to match, 1 missing from Wayfarer.", and how many of them
 * wait for the next import (`waiting`).
 */
function leftWords(left: ReviewCounts, waiting: number): string {
  const all = left.match + left.missing + left.unknown;
  const parts = [
    ...(left.match > 0 ? [`${left.match} to match`] : []),
    ...(left.missing > 0 ? [`${left.missing} missing from Wayfarer`] : []),
    ...(left.unknown > 0 ? [`${left.unknown} never found in Wayfarer`] : []),
  ];
  const wait =
    waiting === 0
      ? ''
      : ` ${waiting} of them ${waiting === 1 ? 'waits' : 'wait'} for the next import of this server.`;
  return `${all} in the queue, this one included: ${parts.join(', ')}.${wait}`;
}

/** What the message says when no item can be shown: nothing left, or what waits and for what. */
function noneLine(none: ReviewNone | undefined): string {
  const waiting = none?.waiting ?? 0;
  if (waiting === 0) return NOTHING_LEFT;
  return waiting === 1
    ? 'Nothing to review now: 1 question waits for the next import of this server (its gym ' +
        'became another Wayspot since it was queued).'
    : `Nothing to review now: ${waiting} questions wait for the next import of this server ` +
        '(their gyms became other Wayspots since they were queued).';
}

/**
 * The gym's own Wayspot among the candidates: the one the import marked (`own`), or for an item
 * stored before that, the one its Wayfarer id names.
 */
function ownOf(shown: ReviewShown): ReviewCandidate | undefined {
  const { item, gym } = shown;
  return (
    item.candidates.find((candidate) => candidate.own === true) ??
    item.candidates.find((candidate) => candidate.id === gym.pogoId)
  );
}

/**
 * The gym's own Wayspot when it lies beyond `CANDIDATE_METRES`: a Wayfarer gym its id names that
 * the import did not move it to.
 */
function farOwnOf(shown: ReviewShown): ReviewCandidate | undefined {
  const own = ownOf(shown);
  // One a nearer gym holds is said so (`sharedWords`), however far.
  return own && own.kind === 'gym' && own.heldBy === undefined && own.metres > CANDIDATE_METRES
    ? own
    : undefined;
}

/**
 * What a gym whose own Wayspot a nearer gym holds shares, after "<gym> shares" or "It shares":
 * "its Wayspot **T** with <holder>, which lies nearer to it: that gym is the Wayspot now.", or
 * for a Wayspot that is a PokéStop or power spot now "its Wayspot **T**, a PokéStop now, with
 * <holder>, which lies nearer to it and holds it too."; undefined for any other gym.
 */
function sharedWords(shown: ReviewShown): string | undefined {
  const own = ownOf(shown);
  if (own?.heldBy === undefined) return undefined;
  const holder = shown.holder ? gymWithId(shown.holder) : 'another gym';
  const title = `**${lineTitle(own.title)}**`;
  return own.kind === 'gym'
    ? `its Wayspot ${title} with ${holder}, which lies nearer to it: that gym is the Wayspot now.`
    : `its Wayspot ${title}, ${KIND_WORDS[own.kind]} now, with ${holder}, which lies nearer to ` +
        'it and holds it too.';
}

/** What became of the Wayspot of a gym that had one, as a sentence; undefined when nothing did. */
function ownWayspotLine(shown: ReviewShown, units: DistanceUnits): string | undefined {
  const own = ownOf(shown);
  const shared = sharedWords(shown);
  if (shared !== undefined) return `It shares ${shared}`;
  if (own && own.kind !== 'gym') return `Its Wayspot is ${KIND_WORDS[own.kind]} now.`;
  if (own) {
    return (
      `Its Wayfarer id names **${lineTitle(own.title)}**, ${distanceWords(own.metres, units)} away: it ` +
      'was not moved there without asking.'
    );
  }
  const { pogoId } = shown.gym;
  return pogoId !== null && isWayfarerId(pogoId)
    ? 'Its Wayspot was not found where the scan covered its place.'
    : undefined;
}

/** The question an item asks, in words. */
function questionLines(shown: ReviewShown, units: DistanceUnits): string[] {
  const { item, gym } = shown;
  const named = gymWithId(gym);
  const others = item.candidates.length - gymCandidates(item).length;
  const onlyGyms =
    'Only a Wayfarer gym can be a gym or become one: a PokéStop or a Power Spot is listed for ' +
    'what is there.';
  switch (item.kind) {
    case 'match': {
      const far = farOwnOf(shown);
      if (far) {
        return [
          `Which Wayspot is ${named}? The Wayspot its Wayfarer id names lies ` +
            `${distanceWords(far.metres, units)} away: it was not moved there without asking.`,
          ...(others > 0 ? [onlyGyms] : []),
        ];
      }
      const own = ownWayspotLine(shown, units);
      return [
        `Which Wayspot is ${named}? None within ${distanceWords(CANDIDATE_METRES, units)} is certainly it.`,
        ...(own === undefined ? [] : [own]),
        ...(others > 0 ? [onlyGyms] : []),
      ];
    }
    case 'missing': {
      const own = ownOf(shown);
      const shared = sharedWords(shown);
      if (shared !== undefined) {
        return [
          `${named} shares ${shared}`,
          'Delete this one if it is a duplicate of that gym; keep it if it is another gym that is ' +
            'still in the game.',
          ...(gymCandidates(item).length > 0
            ? ['If a Wayfarer gym below is it (under a new id), press Same as.']
            : []),
        ];
      }
      return [
        own && own.kind !== 'gym'
          ? `${named} is no gym in Wayfarer any more: its Wayspot is ${KIND_WORDS[own.kind]} now.`
          : `${named} is missing from Wayfarer: its Wayspot was not found where the scan ` +
            'covered its place.',
        'Delete it if it is gone from the game; keep it if it is still there.',
        ...(gymCandidates(item).length > 0
          ? ['If a Wayfarer gym below is it (under a new id), press Same as.']
          : []),
      ];
    }
    case 'unknown': {
      const sponsored = gym.sponsor !== null && gym.sponsor !== 0;
      return [
        item.candidates.length === 0
          ? `${named} was never found in Wayfarer, and the scan found no Wayspot within ${distanceWords(CANDIDATE_METRES, units)} of it.`
          : `${named} was never found in Wayfarer, and no Wayfarer gym lies within ${distanceWords(CANDIDATE_METRES, units)} of it.`,
        ...(sponsored || looksSponsored(gym.name)
          ? ['Its name looks like a sponsored location: those are not in Wayfarer.']
          : []),
        'Delete it if it is gone from the game. If it is still there, Wayfarer does not have it ' +
          '(a sponsored gym): mark it so, and imports leave it alone.',
      ];
    }
  }
}

/** A candidate as a line: its title, kind, distance and a link to the map. */
const candidateLine = (candidate: ReviewCandidate, units: DistanceUnits): string =>
  `**${lineTitle(candidate.title)}**, ${KIND_WORDS[candidate.kind]}, ` +
  `${distanceWords(candidate.metres, units)} away: [map](<${gymMapsUrl(candidate)}>)`;

/**
 * The candidates of an item as lines, numbered, nearest first; the gym's own Wayspot far away
 * (`farOwnOf`) apart, after them.
 */
function candidateLines(shown: ReviewShown, units: DistanceUnits): string[] {
  const far = farOwnOf(shown);
  const near = shown.item.candidates.filter((candidate) => candidate !== far);
  return [
    ...(near.length === 0 ? [] : [`Wayspots within ${distanceWords(CANDIDATE_METRES, units)}:`]),
    ...near.map((candidate, i) => `${i + 1}. ${candidateLine(candidate, units)}`),
    ...(far ? ['The Wayspot its Wayfarer id names:', candidateLine(far, units)] : []),
  ];
}

/** The buttons an item offers, by its question; "Skip for now" always. */
function reviewButtons(
  shown: ReviewShown,
  units: DistanceUnits,
): APIActionRowComponent<APIButtonComponent>[] {
  const { item } = shown;
  const row = (...buttons: APIButtonComponent[]) => actionRow(buttons);
  const skip = reviewButton(item.id, 'skip', 'Skip for now', ButtonStyle.Secondary);
  const remove = reviewButton(item.id, 'delete', 'Delete', ButtonStyle.Danger);
  // At most five candidates (`MAX_CANDIDATES`), so each row of them fits.
  const gyms = gymCandidates(item);
  const sameRow =
    gyms.length === 0
      ? []
      : [
          row(
            ...gyms.map((candidate) =>
              reviewButton(
                item.id,
                'same',
                candidateLabel('Same as ', candidate, units),
                ButtonStyle.Primary,
                candidate.id,
              ),
            ),
          ),
        ];
  // The gym's own Wayspot is the gym: it cannot become another.
  const others = gyms.filter((candidate) => candidate.own !== true);
  switch (item.kind) {
    case 'match': {
      return [
        ...sameRow,
        ...(others.length === 0
          ? []
          : [
              row(
                ...others.map((candidate) =>
                  reviewButton(
                    item.id,
                    'new',
                    candidateLabel('New gym: ', candidate, units),
                    ButtonStyle.Secondary,
                    candidate.id,
                  ),
                ),
              ),
            ]),
        row(reviewButton(item.id, 'none', 'None of these', ButtonStyle.Secondary), remove, skip),
      ];
    }
    case 'missing':
      return [
        ...sameRow,
        row(remove, reviewButton(item.id, 'keep', 'Keep', ButtonStyle.Secondary), skip),
      ];
    case 'unknown':
      return [
        row(
          reviewButton(item.id, 'unlisted', 'Not in Wayfarer', ButtonStyle.Primary),
          remove,
          skip,
        ),
      ];
  }
}

/** How much of the message's text each of its parts may take (4,000 in all). */
const TEXT_PARTS = { said: 1_200, question: 1_200, candidates: 1_300, left: 200 } as const;

/** Lines as one text display, cut to `limit`. */
const shownText = (lines: readonly string[], limit: number): APIComponentInContainer =>
  textDisplay(truncate(lines.join('\n'), limit));

/**
 * The message of `/gym review`, components v2 (Matt, 2026-10-15: no embeds, ephemeral answers
 * too): one container with what was just done (`said`), then the item at the head of the
 * queue: the question about the gym and where it lies, the candidates, how many items are
 * left, and the buttons in rows; or that none is left, or how many wait and for what.
 */
export function reviewMessage(
  shown: ReviewShown | ReviewNone | undefined,
  units: DistanceUnits,
  said: readonly string[] = [],
): V2Message {
  const done = said.length === 0 ? [] : [shownText(said, TEXT_PARTS.said), separator()];
  if (shown?.item === undefined) {
    return {
      v2: true,
      components: [container(GYM_COLOUR, [...done, textDisplay(noneLine(shown))])],
    };
  }
  const { gym, regions, left, waiting } = shown;
  const candidates = candidateLines(shown, units);
  return {
    v2: true,
    components: [
      container(GYM_COLOUR, [
        ...done,
        shownText(
          [
            ...questionLines(shown, units),
            `${regionsSentence(regions)} Its place: ${pointLink(gym)}.`,
          ],
          TEXT_PARTS.question,
        ),
        ...(candidates.length === 0 ? [] : [shownText(candidates, TEXT_PARTS.candidates)]),
        shownText([leftWords(left, waiting)], TEXT_PARTS.left),
        ...reviewButtons(shown, units),
      ]),
    ],
  };
}

/** The message of `reviewMessage` as an interaction sends or edits it, with the v2 flag. */
export function reviewPayload(
  shown: ReviewShown | ReviewNone | undefined,
  units: DistanceUnits,
  said: readonly string[] = [],
): ReturnType<typeof discordPayload> {
  return discordPayload(reviewMessage(shown, units, said));
}

/**
 * The question before a deletion from the queue, as `/gym delete` asks it: what goes with the
 * gym, and Delete or Back (to the item).
 */
export function confirmPayload(
  reviewId: number,
  outcome: Extract<ReviewOutcome, { kind: 'asking' }>,
): ReturnType<typeof discordPayload> {
  const going = goesWith(outcome.references, 'With it go:');
  return discordPayload({
    v2: true,
    components: [
      container(GYM_COLOUR, [
        shownText(
          [`Delete ${gymWithId(outcome.gym)}? This cannot be undone.`, ...going],
          TEXT_PARTS.question,
        ),
        actionRow([
          reviewButton(reviewId, 'confirm', 'Delete', ButtonStyle.Danger),
          reviewButton(reviewId, 'back', 'Back', ButtonStyle.Secondary),
        ]),
      ]),
    ],
  });
}

/** What "None of these", "Keep" and "Not in Wayfarer" did. */
function decidedLine(outcome: Extract<ReviewOutcome, { kind: 'decided' }>): string {
  const named = gymWithId(outcome.gym);
  // Both answers stand until Wayfarer changes (Matt, 2026-10-15; `stillAnswered`).
  const until = 'Imports ask about it again only when the Wayspots near it change.';
  switch (outcome.decision) {
    case 'none-of-these':
      // The Wayfarer gyms it listed are other gyms: the next import adds them
      // (wayfarer-import-service.test.ts).
      return (
        `${named} stays as it is, and the next import adds each Wayfarer gym listed for it as a ` +
        `gym of its own. ${until} (Skip for now is for when you are not sure.)`
      );
    case 'keep':
      return `Kept ${named}. ${until}`;
    case 'not-in-wayfarer':
      return `Marked ${named} as not in Wayfarer: imports leave it alone from now on.`;
  }
}

/** Why "New gym" added nothing. */
function notAddedLines(
  outcome: Extract<ReviewOutcome, { kind: 'not-added' }>,
  units: DistanceUnits,
): string[] {
  switch (outcome.why) {
    case 'untitled':
      return ['Nothing was added: that Wayspot has no title to name a gym by.'];
    case 'near':
      return ['Nothing was added.', ...nearLines(outcome.near, units)];
  }
}

/** What an answer did, as the lines above the next item. */
export function outcomeLines(outcome: ReviewOutcome, units: DistanceUnits): string[] {
  switch (outcome.kind) {
    case 'stale':
      return ['That one was already decided.'];
    case 'changed':
      return outcome.waits
        ? [
            'Nothing was done: the gym became another Wayspot since that was queued. It waits ' +
              'for the next import of this server.',
          ]
        : ['That one changed since it was shown (a newer import), so nothing was done.'];
    case 'back':
      return outcome.waits
        ? [
            'That question waits now: the gym became another Wayspot since it was queued, so it ' +
              'waits for the next import of this server.',
          ]
        : [];
    case 'asking':
      return [];
    case 'gone':
      return [`${GYM_GONE} Its question is closed.`];
    case 'skipped':
      return [`Skipped ${gymWithId(outcome.gym)}: it comes again after the others.`];
    case 'decided':
      return [decidedLine(outcome)];
    case 'matched': {
      const { change } = outcome;
      const parts = [
        ...(change.rename !== null ? [`renamed **${gymLabel({ name: change.rename })}**`] : []),
        ...(change.titleProblem === 'too-long'
          ? ['its name stays: the Wayspot’s title is too long for one']
          : change.titleProblem === 'blank'
            ? ['its name stays: the Wayspot has no title']
            : []),
        ...(change.move ? [`moved ${distanceWords(change.metres, units)}`] : []),
      ];
      return [
        `${gymWithId(outcome.gym)} is that Wayspot now` +
          (parts.length === 0 ? '.' : `: ${parts.join(', ')}.`),
      ];
    }
    case 'taken':
      return [
        `Nothing was changed: that Wayspot is ${
          outcome.other ? gymWithId(outcome.other) : 'a gym of another server'
        } already. Is one of the two a duplicate?`,
      ];
    case 'added':
      return [
        `Added ${gymWithId(outcome.added)} as a new gym; ${gymWithId(outcome.gym)} stays as ` +
          'it is.',
      ];
    case 'not-added':
      return notAddedLines(outcome, units);
    case 'failed':
      return ['I could not save all of that, and the question stays open. Try again in a moment.'];
    case 'raid-there':
      return [raidThere(gymWithId(outcome.gym), outcome.raid, 'is')];
    case 'deleted':
      return deletedLines(outcome);
  }
}

/**
 * `/gym review`: the review queue of the Wayfarer import, one item at a time, oldest first
 * (spec "The review queue"). Each answer edits the message to the next item.
 */
export const reviewGyms: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('review')
    .setDescription('Answer what a Wayfarer import could not decide, one gym at a time'),
  help: {
    details:
      'What `/gym import` could not decide by itself waits here, oldest first: which Wayspot ' +
      'nearby a gym is ("Same as", or "New gym" when the Wayspot is another gym), a gym ' +
      'Wayfarer no longer has (Delete or Keep), a gym Wayfarer never had (Delete, or Not in ' +
      'Wayfarer for a sponsored gym, which imports then leave alone).\n\nEvery gym can be deleted ' +
      'from here (I ask first). "None of these" says the Wayfarer gyms listed are other gyms: ' +
      'the next import adds them. "Keep" and "None of these" stand until the Wayspots near the ' +
      'gym change.\n\nSkip for now (to the end of the queue) is for when you are not sure. Each ' +
      'answer shows the next gym; staff may answer the queue together.',
    examples: ['/gym review'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const place = await staffPlace(interaction, ctx);
    if (place.guildId === undefined) {
      throw new UserError('I do not know this server yet. Try again in a moment.');
    }
    await interaction.editReply(
      reviewPayload(
        await ctx.wayfarerReview.next(place.guildId),
        serverValuesOf(interaction, ctx).distanceUnits,
      ),
    );
  },
};
