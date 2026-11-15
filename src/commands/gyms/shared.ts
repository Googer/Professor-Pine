import {
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type APIButtonComponent,
  type APIModalInteractionResponseCallbackData,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { BoundedMap } from '../../bounded-map.js';
import type { ServerValues } from '../../config/server-settings.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { storedTextLength } from '../../db/repositories/gym-repository.js';
import type { GuardableInteraction, LocatedInteraction } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf } from '../../discord/guards.js';
import {
  answerApart,
  answeredApart,
  sayInPlace,
  showInPlace,
  v2Answer,
} from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { LOCATION_FORMS } from '../../domain/geo/location-input.js';
import {
  gymTextProblems,
  type GymTextField,
  type GymTextProblem,
  type GymTexts,
} from '../../domain/gyms/gym-text.js';
import { searchedWords } from '../../domain/search/gym-index.js';
import { distanceWords, type DistanceUnits } from '../../render/distance-words.js';
import { GYM_COLOUR, gymWithId, renderGymView } from '../../render/gym-view.js';
import { gymMapsUrl } from '../../render/raid-post.js';
import { count, LIMITS, plain, truncate } from '../../render/text.js';
import { actionRow, mapPicture, textMessage } from '../../render/v2.js';
import {
  DUPLICATE_METRES,
  type LocationOutcome,
  type StaffPlace,
} from '../../services/gym-admin-service.js';
import { PendingRequests } from '../../services/pending-requests.js';
import { mapOrNothing } from '../../services/static-maps.js';

/** The custom-id kind of the controls of `/gym` (documented in `custom-id.ts`). */
export const GYM_KIND = 'gym';

/** A place a staff member gave, and whether it was only read from where a map was centred. */
export interface GivenPlace {
  point: LatLon;
  approximate: boolean;
}

/** What a staff member typed into the inputs of a form, as it was typed, by field. */
export type TypedTexts = Partial<Record<GymTextField, string>>;

/** What a question or a form of `/gym` waits with until the staff member answers. */
export type PendingGym =
  /**
   * `/gym add`: the name and the place, read and checked, and the gyms within ten metres that
   * the question named (a gym that appears there afterwards is asked about again). `typed` is
   * what the form behind "Add with details…" was last sent with, as it was typed, when that
   * was refused or the question had to be asked anew.
   */
  | {
      what: 'add';
      name: string;
      point: LatLon;
      approximate: boolean;
      nearIds: readonly number[];
      typed?: TypedTexts | undefined;
    }
  /**
   * `/gym edit`: the gym, the texts the form was filled with first (what is written is what
   * differs from them, however often the form is opened again), the fields it could not show
   * (`gymFormTexts`), and what it was last sent with, when that was refused.
   */
  | {
      what: 'edit';
      gymId: number;
      shown: Partial<GymTexts>;
      tooLong: readonly GymTextField[];
      typed?: TypedTexts | undefined;
      /** The form was opened by Edit of a gym view: its answer is a message of its own. */
      fromView?: boolean | undefined;
    }
  /**
   * `/gym move`: the gym, where it was when the question was asked (`from`) and where it goes,
   * whether that place was only read from the middle of a map, and the gyms within ten metres
   * of it that the question named.
   */
  | {
      what: 'move';
      gymId: number;
      from: LatLon;
      point: LatLon;
      approximate: boolean;
      nearIds: readonly number[];
    };

/**
 * How long a question or a form of `/gym` can be answered. Long: a form that is open while its
 * request is forgotten loses what was typed into it, and staff look things up while they type.
 * The requests are few and small, and their number is bounded.
 */
export const PENDING_HOURS = 6;

/** The questions and forms of `/gym` that wait for their answer, by the token of their controls. */
export const pendingGyms = new PendingRequests<PendingGym>({
  ttlMs: PENDING_HOURS * 3_600_000,
  max: 1_000,
});

/**
 * The tokens of the questions that were answered a while ago. A second press on a button of
 * such a question (a double click, a slow connection) is only acknowledged: it must not write
 * "That has expired" over the answer the first press is showing.
 */
const answered = new BoundedMap<string, true>(1_000);

export function markAnswered(token: string): void {
  answered.set(token, true);
}

export function wasAnswered(token: string): boolean {
  return answered.has(token);
}

/** What a staff member is told whose question or form is no longer known (also after a restart). */
export { EXPIRED, NOT_YOURS } from '../../services/pending-requests.js';
/**
 * Also what is said of a gym that is no longer this server's since the question was asked
 * (another server's staff cannot make it so, but this server's deletion of a gym it shared
 * can): for this server's staff it is a gym that does not exist.
 */
export const GYM_GONE = 'That gym no longer exists.';

/** What runs for a button of a question, by what the question is about and the button. */
export type ButtonAnswer = (
  interaction: ButtonInteraction,
  ctx: AppContext,
  request: PendingGym,
) => Promise<void>;

/** The form a button of a question opens, filled from its request; undefined when it has none. */
export type FormOpener = (
  token: string,
  request: PendingGym,
) => APIModalInteractionResponseCallbackData | undefined;

/** What runs for a form that was sent, by what it is about and its action. */
export type FormAnswer = (
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  token: string,
  request: PendingGym,
) => Promise<void>;

/** A button of a question of `/gym`: `gym:<token>:<action>`. */
export function button(
  token: string,
  action: string,
  label: string,
  style: ButtonStyle,
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(encodeCustomId({ kind: GYM_KIND, id: token, action }))
    .setLabel(label)
    .setStyle(style);
}

/**
 * Where the staff member is (`StaffPlace`): who they are, the row of their server, whose
 * regions an answer names, and the channels by which its channel for bot updates is found: the
 * one the command was used in, then those of the server's regions (a post that is not in the
 * cache is no help).
 */
export async function staffPlace(
  interaction: LocatedInteraction,
  ctx: AppContext,
): Promise<StaffPlace> {
  const guildId = await ctx.guilds.idFor(guildIdOf(interaction));
  const regions = ctx.regions
    .all()
    .filter((region) => guildId !== undefined && region.guildId === guildId)
    .map((region) => region.channelId);
  return {
    staffId: interaction.user.id,
    guildId,
    channelIds: [...(interaction.channelId === null ? [] : [interaction.channelId]), ...regions],
  };
}

/** The place a staff member typed, or the refusal that says what is read. */
export function placeOrRefuse(outcome: LocationOutcome): GivenPlace {
  switch (outcome.kind) {
    case 'point':
      return { point: outcome.point, approximate: outcome.approximate };
    case 'link-failed':
      throw new UserError('I could not follow that link. Paste the coordinates instead.');
    case 'link-nowhere':
      throw new UserError(
        'That link does not say where the place is. Open it, long-press the pin, and paste ' +
          'the coordinates Google shows.',
      );
    case 'out-of-range':
      throw new UserError(
        'Those numbers are no place: a latitude lies between -90 and 90, a longitude between ' +
          `-180 and 180, latitude first. ${LOCATION_FORMS}`,
      );
    case 'unreadable':
      throw new UserError(`I could not read a place from that. ${LOCATION_FORMS}`);
  }
}

/**
 * How staff get the location of a gym (Matt, 2026-10-13): the game itself hands out a link to
 * the exact place. Said in the help of `/gym add` and `/gym move`.
 */
export const HOW_TO_LOCATE =
  'In Pokémon GO open the gym, choose View in map, share the link and paste it here. ' +
  'Coordinates (`40.4406, -79.9959`) work too.';
/** The same in the hundred characters the description of an option has. */
export const LOCATION_OPTION =
  'The link Pokémon GO shares (gym, View in map, share), or coordinates like 40.4406, -79.9959';

/** What a question says of a place that was read from the middle of a map. */
export const APPROXIMATE =
  'I read this from where the map was centered, not from a pin: check the link before you go on.';

/** A place as an answer shows it: the coordinates as a link to Google Maps. */
export function pointLink(point: LatLon): string {
  return `[${point.lat}, ${point.lon}](<${gymMapsUrl(point)}>)`;
}

/** How many of the gyms near a place a question names; the rest are counted. */
const NEAR_SHOWN = 3;

/** The gyms within ten metres of a place, as lines of a question; empty when there are none. */
export function nearLines(
  near: readonly { gym: Pick<Gym, 'id' | 'name' | 'nickname'>; metres: number }[],
  units: DistanceUnits,
): string[] {
  if (near.length === 0) return [];
  const listed = near
    .slice(0, NEAR_SHOWN)
    .map(({ gym, metres }) => `- ${gymWithId(gym)}, ${distanceWords(metres, units)} away`);
  return [
    near.length === 1
      ? `Another gym lies within ${distanceWords(DUPLICATE_METRES, units)} of that place:`
      : `${count(near.length, 'other gym')} lie within ${distanceWords(DUPLICATE_METRES, units)} of that place:`,
    ...listed,
    ...(near.length > NEAR_SHOWN ? [`- …and ${near.length - NEAR_SHOWN} more`] : []),
  ];
}

/** Lines as the text of one message: never longer than Discord takes. */
export function content(lines: readonly (string | undefined)[]): string {
  return truncate(
    lines.filter((line): line is string => line !== undefined).join('\n'),
    LIMITS.content,
  );
}

const FIELD_WORDS: Readonly<Record<GymTextField, string>> = {
  name: 'name',
  nickname: 'nickname',
  description: 'description',
  notice: 'notice',
  keywords: 'keywords',
};

const characters = (n: number): string => count(n, 'character');

/** Why a text cannot be a gym's, as a sentence that says how much too long it is. */
function textProblemText(problem: GymTextProblem): string {
  const field = FIELD_WORDS[problem.field];
  switch (problem.kind) {
    case 'blank':
      return 'A gym needs a name.';
    case 'too-long':
      return `The ${field} is ${characters(problem.by)} too long: it may have ${problem.limit}.`;
    case 'too-long-stored':
      return (
        `The ${field} is too long as I store it, by ${characters(problem.by)}: apostrophes, ` +
        'accents and letters of other alphabets take several characters each. Shorten it.'
      );
    case 'keyword-too-long':
      return (
        `The keyword "${plain(truncate(problem.keyword, 30))}" is ${characters(problem.by)} ` +
        `too long: a keyword may have ${problem.limit}.`
      );
    case 'too-many-keywords':
      return `That is ${count(problem.by, 'keyword')} too many: a gym may have ${problem.limit}.`;
  }
}

/** Why these texts (already tidied) cannot be a gym's, every reason on a line; undefined when they can. */
export function textRefusal(texts: Partial<GymTexts>): string | undefined {
  const problems = gymTextProblems(texts, storedTextLength);
  return problems.length === 0 ? undefined : problems.map(textProblemText).join('\n');
}

/** Refuses texts that cannot be a gym's (already tidied), with every reason in one answer. */
export function assertGymTexts(texts: Partial<GymTexts>): void {
  const refusal = textRefusal(texts);
  if (refusal !== undefined) throw new UserError(refusal);
}

/**
 * Answers a form whose texts cannot be stored: the reasons, a button that opens the form again
 * with what was typed (which the caller has kept in the request), so that a keyword that is too
 * long does not cost a paragraph typed beside it, and one to give up. A form that a button of
 * a message opened is answered in the place of that message, so that no control stays behind
 * that leads nowhere (the question of `/gym add`, an earlier refusal); a form a command opened
 * gets a message of its own.
 */
export async function refuseForm(
  interaction: ModalSubmitInteraction,
  token: string,
  refusal: string,
  apart = false,
): Promise<void> {
  const answer = gymQuestion(
    [content([refusal, 'Nothing was saved. What you typed is kept:'])],
    [
      button(token, 'reopen', 'Open the form again…', ButtonStyle.Primary),
      button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
    ],
  );
  if (apart) await interaction.reply({ ...v2Answer(answer), flags: privateV2 });
  else await showInPlace(interaction, answer);
}

/** The flags of a private components-v2 answer. */
const privateV2 = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

/**
 * A question or an answer of `/gym` as a components-v2 message (plan 8B-4: every message of the
 * `/gym` flows is, since an answer takes the place of its question and a v2 message never
 * becomes classic again): its sentences, and its buttons in a row inside.
 */
export function gymQuestion(
  texts: readonly (string | undefined)[],
  buttons: readonly (ButtonBuilder | APIButtonComponent)[] = [],
): V2Message {
  const row = buttons.map((one) => (one instanceof ButtonBuilder ? one.toJSON() : one));
  return textMessage(GYM_COLOUR, texts, row.length === 0 ? [] : [actionRow(row)]);
}

/**
 * Shows a question or an answer of `/gym`: as the answer of the command (its deferral edited)
 * or of a press answered apart (`answerApart`), or in the place of the message a control is on (`showInPlace`: a question from before plan
 * 8B-4, which is plain text, is closed with a line and the answer follows privately).
 */
export async function answerGym(
  interaction: GuardableInteraction,
  message: V2Message,
): Promise<void> {
  // A command, and a press answered in a private message of its own (Move… and Delete… of the
  // view of `/gym show`), answer apart; a press on a question answers in its place.
  if (interaction.isChatInputCommand() || answeredApart(interaction)) {
    await answerApart(interaction, message);
  } else await showInPlace(interaction, message);
}

/** Says a sentence in the place of the message a control of `/gym` is on (`sayInPlace`). */
export function sayGym(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  text: string,
): Promise<void> {
  return sayInPlace(interaction, text, GYM_COLOUR);
}

/**
 * Does the work of a form that was sent and has been acknowledged. A refusal (the gym is gone)
 * takes the place of the message the form was opened from, when it was opened from one, as it
 * does for a button: the controls of a question or of an earlier refusal must not stay under
 * it, leading nowhere. A form a command opened has no message, and its refusal goes the usual
 * way.
 */
export async function answerForm(
  interaction: ModalSubmitInteraction,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (err) {
    if (!(err instanceof UserError) || !interaction.isFromMessage()) throw err;
    await sayGym(interaction, err.message);
  }
}

/**
 * What staff are told of a gym whose whole name consists of words the search ignores ("The
 * Gym"), the words of the server's search (`blacklistWords` of its values, plan 19B-2): a note,
 * not a refusal. Undefined for any other name.
 */
export function nameNote(
  values: Pick<ServerValues, 'blacklistWords'>,
  gym: Pick<Gym, 'id' | 'name'>,
): string | undefined {
  if (searchedWords(gym.name, values.blacklistWords).length > 0) return undefined;
  return (
    'Its name consists only of words the search ignores, so members will not find it by name: ' +
    `only by its number (#${gym.id}), or by a nickname or keywords you give it.`
  );
}

/** What an answer says of the address and places of a gym that was just added or moved. */
export function fetchNote(ctx: AppContext): string {
  return ctx.gymAdmin.fetches
    ? 'Its address and the places around it are being fetched from Google; `/gym show` has ' +
        'them in a moment.'
    : 'No Google API key is configured, so it has no address and no nearby places.';
}

/**
 * The full view of a gym under these lines: what `/gym show` answers (with its `controls`), and
 * every change of a gym. The map is shown when there is one; the number of members who target
 * the gym is "unknown" when it cannot be read. Neither stands in the way of the answer.
 */
export async function gymViewMessage(
  ctx: AppContext,
  /** The server's units (plan 19A-1). */
  units: DistanceUnits,
  place: StaffPlace,
  gym: Gym,
  lines: readonly (string | undefined)[],
  controls: readonly APIButtonComponent[] = [],
): Promise<V2Message> {
  const [targets, map] = await Promise.all([
    ctx.gymAdmin.targetCount(gym.id, place.guildId).catch((err: unknown) => {
      ctx.log.warn({ err, gym: gym.id }, 'could not count the gym targets of a gym');
      return undefined;
    }),
    mapOrNothing(ctx.maps.gym(gym), ctx.log, 'a gym', { gym: gym.id }),
  ]);
  return renderGymView({
    gym,
    regions: ctx.gymAdmin.regionsOf(gym.id, place.guildId),
    nearest: ctx.gymAdmin.nearestFor(gym, place.guildId),
    units,
    targets,
    map: mapPicture(map, 'Map of the gym'),
    above: lines,
    controls,
  });
}
