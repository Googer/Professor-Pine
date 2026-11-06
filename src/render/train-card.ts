import type { RaidTally, TrainCard } from '../domain/history/train-card.js';
import { isMaxTier, maxTierLabel } from '../domain/pogo/max-tier.js';
import { isRaidLevel, raidWords } from '../domain/pogo/raid-tier.js';
import { durationWords } from './duration-words.js';
import type { Fit } from './party-post.js';
import { count, fitItems } from './text.js';

/*
 * The card of an ended train in the last showing of its post (plan 8H-7A; design Part F): the
 * facts `trainCard` gives, in words. It names nobody: no conductor, no rider (an anonymous train's
 * card is the same). "Summary" is the region's post ("Today and coming up"): this is the card.
 */

/** The heading of the card. */
export const TRAIN_CARD_HEADING = '**How the train went**';

/** Under the card: what makes it approximate (design Part F). */
export const TRAIN_CARD_NOTE =
  '-# Approximate: a stop made in the game without moving the train in Pine is not counted.';

/** The room the line of regions may take; cut to `fit` when the post is too long. */
const REGIONS_ROOM = 600;

/** The words of the legacy bot's tiers the game dropped, as it said them (`Level 2 raid`). */
const LEGACY_TIER_WORDS: Readonly<Record<string, string>> = {
  T2: 'Level 2',
  T4: 'Level 4',
  EX: 'EX',
};

/**
 * A tier of the raids along the way, with how many, as Pine's posts word it for members (review
 * B1): a raid as its post does (`raidWords`: `3 Level 5 raids`, `1 Shadow Level 3 raid`), a legacy
 * tier the game dropped the same way (`2 Level 2 raids`, `1 EX raid`), a max battle by its tier's
 * words (`maxTierLabel`, as the post's headline says the stars) and Pine's own term (`2 Dynamax
 * 5★ max battles`, `1 Gigantamax max battle`).
 */
export function raidTallyWords(tally: RaidTally): string {
  const { tier, shadow, count: n } = tally;
  if (tier === null) return `${count(n, 'raid')} of a tier not known`;
  if (isMaxTier(tier)) return count(n, `${maxTierLabel(tier)} max battle`);
  const words = isRaidLevel(tier)
    ? raidWords({ level: tier, shadow })
    : `${shadow ? 'Shadow ' : ''}${LEGACY_TIER_WORDS[tier] ?? tier} raid`;
  return count(n, words);
}

/** `Recorded along the way: …`, as many tiers as `room` holds and how many more. */
function raidsLine(raids: readonly RaidTally[], room: number): string {
  const lead = 'Recorded along the way: ';
  return `${lead}${fitItems(raids.map(raidTallyWords), room - lead.length)}`;
}

/**
 * `Through <#a> · <#b>`, as many regions as `room` holds and how many more, in the words of the
 * line of raids (`fitItems`: `· …and N more`, review W2).
 */
function regionsLine(channels: readonly string[], room: number): string {
  const lead = 'Through ';
  return `${lead}${fitItems(
    channels.map((id) => `<#${id}>`),
    room - lead.length,
    ' · ',
  )}`;
}

/**
 * `12 riders, 15 with their +1s; at most 9 riders at once`; `Nobody rode it.` for none. The most
 * at once is left out where it says nothing more: not known, or everybody aboard together
 * (review R2).
 */
function ridersLine(card: TrainCard): string {
  const { members, heads } = card.riders;
  if (members === 0) return 'Nobody rode it.';
  const withGuests = heads === members ? '' : `, ${String(heads)} with their +1s`;
  const { peakRiders } = card;
  const atOnce =
    peakRiders === null || peakRiders >= members
      ? ''
      : `; at most ${count(peakRiders, 'rider')} at once`;
  return `${count(members, 'rider')}${withGuests}${atOnce}`;
}

/**
 * The card's text: its heading, about how many stops in how long, the regions crossed in order
 * (each a channel; a region gone since is left out), the riders and the most at once, and the
 * raids recorded along the way, then the note of what makes it approximate. A train that never
 * left says so and its riders. `channelOf` gives a region's channel by `Region.id`.
 */
export function trainCardText(
  card: TrainCard,
  channelOf: (regionId: number) => string | undefined,
  fit: Fit,
): string {
  if (card.stops === null) {
    const nobody = card.riders.members === 0;
    return [
      TRAIN_CARD_HEADING,
      nobody ? 'It never left: nobody rode it.' : 'It never left.',
      ...(nobody ? [] : [ridersLine(card)]),
    ].join('\n');
  }
  const { count: stops, durationMs } = card.stops;
  const channels = (card.regionIds ?? []).flatMap((id) => {
    const channel = channelOf(id);
    return channel === undefined ? [] : [channel];
  });
  const tallies = card.raids;
  const raids =
    tallies === null
      ? []
      : [
          tallies.length === 0
            ? 'No raids or max battles recorded along the way.'
            : fit.part((room) => raidsLine(tallies, room)),
        ];
  return [
    TRAIN_CARD_HEADING,
    `About ${count(stops, 'stop')} in ${durationWords(durationMs)}`,
    ...(channels.length === 0
      ? []
      : [fit.part((room) => regionsLine(channels, Math.min(room, REGIONS_ROOM)))]),
    ridersLine(card),
    ...raids,
    TRAIN_CARD_NOTE,
  ].join('\n');
}
