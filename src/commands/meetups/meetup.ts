import {
  MessageFlags,
  SlashCommandBuilder,
  type APIModalInteractionResponseCallbackData,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { readInTime } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, isStaff, regionChannelOf, requireGuild } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
import type { Throttle } from '../../discord/throttle.js';
import { CAMPFIRE_DISCOVER_URL } from '../../domain/campfire.js';
import type { Place } from '../../domain/geo/place.js';
import { mayRequestReview, type MeetupVerdict } from '../../domain/meetups/safety.js';
import { tidyDescription } from '../../domain/party/meetup.js';
import { MAX_OPEN_PARTIES } from '../../domain/party/open-parties.js';
import { MAX_PARTY_NAME, type MeetupParty } from '../../domain/party/party.js';
import { noPostWords, problemText } from '../../render/activity.js';
import { blockedAnswer } from '../../render/meetup-safety.js';
import type { MakeAsk } from '../../services/meetup-safety.js';
import { EXPIRED, PendingRequests } from '../../services/pending-requests.js';
import {
  newPartyTimes,
  noForumWords,
  requirePlaceForNew,
  timedTimeHint,
  typedNewEnd,
  typedTimedTime,
} from '../parties/timed.js';
import { MAX_PLACE_TEXT, namedPlace, nearChoices, type PlaceKindsOnly } from '../place-option.js';
import { MEETUP_PLACE_KINDS } from '../../services/place-finder.js';
import { OPEN_PARTIES_FULL, openPartiesFull } from '../parties/open-parties.js';
import { DISCORD_NAMES, type ReportNames } from '../raids/report.js';
import { INFO_INPUT, infoInput, refusedWithText } from './info.js';
import { placeRefusal } from './place-ask.js';

/** Where `/meetup` works, said wherever it does not. */
export const FROM_A_REGION = 'Create a meetup from a region channel.';

/** As the legacy bot allowed: a meetup is a post that stays for days. */
export const MEETUP_THROTTLE: Throttle = { uses: 2, perSeconds: 900 };

/** What a refusal of a place nobody can find offers instead (`near` is required). */
const OR_A_PIN = 'or paste a maps link or coordinates';

/** Said of a power spot picked for a meetup. */
export const NO_POWER_SPOT =
  "A meetup can't be at a Power Spot. Pick a gym or PokéStop, or paste a maps link or coordinates.";

/** A meetup is near a gym or a PokéStop, or at a pin; never a power spot (Matt, 2026-10-17). */
const MEETUP_PLACES: PlaceKindsOnly = { kinds: MEETUP_PLACE_KINDS, refusal: NO_POWER_SPOT };

/** Said of a place a moderator refused for good (plan 8S-1; the design's words). */
export const NO_MEETUP_HERE = "A meetup can't be held there.";

/** Said on the live map of a refused place members may ask the moderators about (plan 8S-2). */
export const ASK_ON_DISCORD =
  'You can ask the moderators about it with /meetup on Discord: its answer has "Ask the moderators…".';

/** Said to a member blocked from making meetups in the server (the design's words). */
export const NO_MEETUPS_FOR_YOU = "You can't create meetups on this server.";

/** Said of a meetup held for a moderator: nothing is posted, and the member is never told why. */
export const MEETUP_HELD =
  "Your meetup needs a moderator's approval before it is posted. I will tell you by direct " +
  'message once a moderator has decided.';

/** Said when the moderators could not be asked (no channel, Discord refused): nothing is kept. */
export const MEETUP_NOT_SENT =
  "Your meetup needs a moderator's approval, but I could not send it to the moderators. Try " +
  'again later.';

/** Said of a start too soon for the moderators to look at the meetup first. */
export const MEETUP_TOO_SOON =
  "A meetup there needs a moderator's approval, which takes time: pick a start at least two " +
  'hours from now.';

/** Said of information of nothing but white space: a meetup made by `/meetup` has some. */
export const NO_INFORMATION =
  'Say what there is to know about the meetup: where to meet, what to bring.';

/** Said of a start that has passed while the form was open. */
const START_PASSED = 'That start has passed meanwhile. Use `/meetup` again with a later one.';

/** The custom-id kind of the form `/meetup` opens (`meetup:<token>:form`). */
export const MEETUP_KIND = 'meetup';

/** The name of `/meetup`, in whose window its form's use is counted (`meetupFormControls`). */
const MEETUP_NAME = 'meetup';

/** How long the form of `/meetup` may stay open: what it was opened with is kept that long. */
const FORM_MS = 30 * 60_000;

/** What `/meetup` was used with, kept between the command and its form. */
interface PendingMeetup {
  serverId: string;
  regionChannelId: string;
  name: string;
  place: Place;
  startTime: number;
  /** When it ends (`end`); undefined: no end. */
  endTime: number | undefined;
  /**
   * When `/meetup` counted the use that opened the form (`whenCounted`): a failure gives it back
   * to that window.
   */
  openedAt: number;
}

const pending = new PendingRequests<PendingMeetup>({ ttlMs: FORM_MS });

/**
 * `/meetup` is used in the text channel of a region, or in a post of its forum that is no
 * party, and the meetup then belongs to that region (`requirePlaceForNew`).
 */
const requireMeetupPlace = requirePlaceForNew('meetup', FROM_A_REGION);

/** What `/meetup` was asked: the place, the start and end, and what the check of the place says. */
interface Asked {
  place: Place;
  startTime: number;
  endTime: number | undefined;
  verdict: MeetupVerdict;
}

/**
 * The refusal of a verdict (a block is asked first, `MeetupSafety.blocked`, and refused with
 * `blockedRefusal`), or nothing when the meetup may go on (posted or held).
 */
export function refusalOf(
  verdict: MeetupVerdict,
  startTime: number,
  now: number,
): string | undefined {
  if (verdict === 'refused') return NO_MEETUP_HERE;
  if (verdict === 'review' && !mayRequestReview(now, startTime)) return MEETUP_TOO_SOON;
  return undefined;
}

/**
 * The refusal of a member blocked from making meetups in the server, wherever `/meetup` finds
 * it (before the form, on its submit, after the meetup was made): with Appeal, by which the
 * member may ask the moderators to lift the block.
 */
function blockedRefusal(serverId: string): UserError {
  return new UserError(NO_MEETUPS_FOR_YOU, {
    answer: blockedAnswer(NO_MEETUPS_FOR_YOU, serverId),
  });
}

/**
 * Reads what `/meetup` was used with: whether the member is blocked (first: a blocked member
 * hears of the block, not of a place or start it cannot read), the place (`namedPlace`: a gym,
 * PokéStop, or a pin; never a power spot), the start (`typedTimedTime` for a meetup about to be made),
 * and the check of the place. Throws a `UserError` for what cannot be: the guard reads it (and
 * `execute` takes what it read), so that a refusal does not count against the limit.
 */
async function readAsked(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  now: number,
): Promise<Asked> {
  const serverId = guildIdOf(interaction);
  const makerId = interaction.user.id;
  const staff = isStaff(interaction, ctx);
  if (await ctx.meetupSafety.blocked(serverId, makerId, staff)) throw blockedRefusal(serverId);
  if (await openPartiesFull(ctx, serverId, makerId, staff)) throw new UserError(OPEN_PARTIES_FULL);
  const place = await namedPlace(
    interaction,
    ctx,
    interaction.options.getString('near'),
    OR_A_PIN,
    MEETUP_PLACES,
  );
  if (place === undefined) throw new UserError('Say where it is with `near`.');
  const typed = typedTimedTime(
    ctx,
    newPartyTimes('meetup', now),
    'meet',
    interaction.options.getString('start') ?? '',
    now,
  );
  if (typed === 'unset') {
    throw new UserError(
      `Give the time the meetup starts. ${timedTimeHint(now, ctx.config.settings.timezone)}`,
    );
  }
  const endTime = typedNewEnd(ctx, 'meetup', typed.at, interaction.options.getString('end'), now);
  // The block is read above: not again.
  const verdict = await ctx.meetupSafety.verdict({
    serverId,
    place,
    makerId,
    staff,
    blocked: false,
  });
  const refusal = refusalOf(verdict, typed.at, now);
  if (refusal === NO_MEETUP_HERE && place.kind !== 'pin') {
    // With Ask the moderators once the refusal is old enough (plan 8S-2).
    throw await placeRefusal(ctx, serverId, place, makerId, NO_MEETUP_HERE);
  }
  if (refusal !== undefined) throw new UserError(refusal);
  return { place, startTime: typed.at, endTime, verdict };
}

/**
 * What the guard read of a use of `/meetup`, for its `execute` (no second search and check
 * before the form, which must open within three seconds).
 */
const readings = new WeakMap<ChatInputCommandInteraction, Asked>();

/**
 * Everything that can be known before the form: a `near` that names no place it can take, a
 * start it cannot read or that has passed, a place refused for good, a member blocked from
 * making meetups, a start too soon for the moderators. Refused here, so that it does not count;
 * what it read is kept for `execute`. Read within a dialog's time (`readInTime`), since the form
 * must open within Discord's three seconds: past it the member is told `SLOW_READ`, uncounted.
 */
const requireMeetupAsked: Guard = async (interaction, ctx) => {
  if (!interaction.isChatInputCommand()) return;
  const asked = await readInTime(ctx.log, interaction, () =>
    readAsked(interaction, ctx, Date.now()),
  );
  readings.set(interaction, asked);
};

/** The form `/meetup` opens: the meetup's information, required (plan 8S-1). */
export function meetupForm(token: string): APIModalInteractionResponseCallbackData {
  return {
    custom_id: encodeCustomId({ kind: MEETUP_KIND, id: token, action: 'form' }),
    title: 'About this meetup',
    components: [
      infoInput({ required: true, placeholder: 'Where to meet, what to bring, how long it goes.' }),
    ],
  };
}

/**
 * `/meetup` (spec 4.2; plan 8S-1): a meetup with a post of its own in the forum of the region it
 * is made in. It asks every time for the name, the place (`near`: a gym or PokéStop,
 * or a pin from a maps link or coordinates; Matt, 2026-10-17), set once and never changed
 * afterwards, the start, and in a form the information. A place that might be private (a pin, a
 * Wayspot whose title looks like a front-yard feature) waits for a moderator's approval
 * (`ctx.meetupSafety`): nothing is posted, and the member is told by DM what was decided. Who
 * makes it is signed up as interested, and named.
 */
export const meetup: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName(MEETUP_NAME)
    .setDescription('Create a meetup in this region, with a post of its own')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('What to call it, such as "Community Day picnic"')
        .setRequired(true)
        .setMaxLength(MAX_PARTY_NAME),
    )
    .addStringOption((option) =>
      option
        .setName('near')
        .setDescription('A gym or PokéStop it is near (pick from the list), or a maps link')
        .setRequired(true)
        .setMaxLength(MAX_PLACE_TEXT)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('start')
        .setDescription('When it starts, such as 6:30pm, or a month-day and time')
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName('end')
        .setDescription('When it ends, if you know: such as 8pm, a month-day and time, or in 90')
        .setMaxLength(100),
    ),
  help: {
    category: 'meetup',
    details:
      'Makes a meetup, for anything that is not a raid at one gym: a Community Day in the ' +
      'park, a trade evening. Use it in the channel of a region; the meetup gets a post in the ' +
      'forum of that region, and you are marked as interested.\n\n`near` is the gym or ' +
      'PokéStop it is near (pick one from the list that appears while you type), or a place ' +
      'you paste as a link from a maps app or as coordinates. The post shows the place with a ' +
      'map link, and it cannot be changed afterwards.\n\n`start` is when it starts: a clock ' +
      'time (`6:30pm`, `noon`, `midnight`), `tomorrow 11am`, or a date first, month-day, and ' +
      'a time; `end`, if you give it, is when it ends, read as `/end` reads it. A form then ' +
      'asks what there is to know: where exactly to meet, what to bring.\n\nA meetup at a pin, or at a place ' +
      "that might be somebody's home, needs a moderator's approval before it is posted: you " +
      'are told by direct message once they have decided (so give a start at least two hours ' +
      'ahead).\n\nIn the post, change when it starts with `/meet`, set when it ends with `/end`, ' +
      'change the information with `/info`, and rename it with `/name`. Members sign up with ' +
      `the buttons, as for a raid.\n\nYou may have ${MAX_OPEN_PARTIES} open trains and meetups ` +
      'at a time, here and on the map; meetups waiting for a moderator count.\n\nA meetup is ' +
      'archived an hour after it is over: after its end, or without one a day after its start. ' +
      'One without any time is archived a day after it was made, or after its last time was ' +
      'removed; its post says when.\n\nOfficial meetups ' +
      `by Community Ambassadors are on Campfire: ${CAMPFIRE_DISCOVER_URL}`,
    examples: [
      '/meetup name:Community Day picnic near:Riverside Park start:2pm',
      '/meetup name:Trade evening near:Fountain Square start:6:30pm',
    ],
  },
  guards: [requireGuild, requireMeetupPlace, requireMeetupAsked],
  throttle: MEETUP_THROTTLE,
  async execute(interaction, ctx) {
    const regionChannelId = regionChannelOf(interaction, ctx);
    if (regionChannelId === undefined) throw new UserError(FROM_A_REGION);
    const asked = readings.get(interaction) ?? (await readAsked(interaction, ctx, Date.now()));
    readings.delete(interaction);
    const token = pending.put(interaction.user.id, {
      serverId: guildIdOf(interaction),
      regionChannelId,
      name: interaction.options.getString('name', true),
      place: asked.place,
      startTime: asked.startTime,
      endTime: asked.endTime,
      // When the router counted the use (its clock), not a reading of another.
      openedAt: whenCounted(interaction) ?? Date.now(),
    });
    await interaction.showModal(meetupForm(token));
  },
  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused(true);
    await interaction.respond(
      focused.name === 'near'
        ? await nearChoices(interaction, ctx, focused.value, MEETUP_PLACE_KINDS)
        : [],
    );
  },
};

/**
 * The form of `/meetup`. It has no limit of its own: every form was opened by a use of
 * `/meetup`, which has the limit, and counted there; a form whose work fails unexpectedly (the
 * post Discord refused) gives that use back (`carriesOn`, plan 8S-3).
 */
export const meetupFormControls: ComponentHandler = {
  kind: MEETUP_KIND,
  guards: [requireGuild],
  carriesOn: (interaction, id) => {
    const asked = pending.peek(id.id, interaction.user.id);
    return typeof asked === 'object'
      ? { ...MEETUP_THROTTLE, as: MEETUP_NAME, countedAt: asked.value.openedAt }
      : undefined;
  },

  async modal(interaction, id, ctx) {
    if (id.action !== 'form') throw new UserError(STALE_COMPONENT);
    const text = interaction.fields.getTextInputValue(INFO_INPUT);
    const taken = pending.take(id.id, interaction.user.id);
    if (taken === 'expired' || taken === 'not-yours') {
      throw new UserError(refusedWithText(EXPIRED, text));
    }
    await submitted(interaction, ctx, taken.value, text);
  },
};

/**
 * What the form of `/meetup` does with the information: `MeetupSafety.make` asks the check
 * again (a ruling or a block may have come meanwhile) and makes the meetup, or asks the
 * moderators; the member is told what came of it.
 */
async function submitted(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  asked: PendingMeetup,
  text: string,
): Promise<void> {
  const refuse = (refusal: string, givesBack = false): UserError =>
    new UserError(refusedWithText(refusal, text), { givesBack });
  if (tidyDescription(text) === null) throw refuse(NO_INFORMATION);
  if (asked.startTime <= Date.now()) throw refuse(START_PASSED);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const staff = isStaff(interaction, ctx);
  // One made or asked for with the form open: `/meetup`'s guard asked before it opened.
  if (await openPartiesFull(ctx, asked.serverId, interaction.user.id, staff)) {
    throw refuse(OPEN_PARTIES_FULL);
  }
  const answer = await makeMeetupAs(
    ctx,
    {
      serverId: asked.serverId,
      regionChannelId: asked.regionChannelId,
      maker: { id: interaction.user.id, ...memberInfo(interaction) },
      place: asked.place,
      name: asked.name,
      startTime: asked.startTime,
      ...(asked.endTime === undefined ? {} : { endTime: asked.endTime }),
      description: text,
      staff,
    },
    DISCORD_NAMES,
  );
  // The guard has looked at most of these; what follows is for what changed in between.
  switch (answer.kind) {
    case 'blocked':
      throw blockedRefusal(asked.serverId);
    case 'refused':
      throw refuse(answer.text, answer.givesBack === true);
    case 'held':
      await interaction.editReply({ content: answer.text });
      return;
    case 'posted':
      await interaction.editReply({
        content:
          `${answer.text} There, \`/meet\` changes when it starts, \`/end\` sets when it ends, ` +
          'and `/info` changes what it says.',
      });
  }
}

/**
 * What came of a meetup its maker asked to make (`makeMeetupAs`), in `/meetup`'s words: posted
 * (with the meetup), held for the moderators (`MEETUP_HELD`), the maker blocked
 * (`NO_MEETUPS_FOR_YOU`: on Discord with Appeal), or refused.
 */
export type MeetupMadeAnswer =
  | { kind: 'posted'; party: MeetupParty; text: string }
  | { kind: 'held'; text: string }
  | { kind: 'blocked'; text: string }
  /**
   * `givesBack`: none of the maker's doing (the post could not be made, the moderators could not
   * be asked): the use is given back (plan 8S-3).
   */
  | { kind: 'refused'; text: string; givesBack?: true };

/**
 * Makes a meetup as its maker asked, as the form of `/meetup` does (the live map calls it too,
 * plan 8M-5M): `MeetupSafety.make` (the check of the place, the meetup or the moderators'
 * request), its outcome in `/meetup`'s words. `names` says how the answer names the post and a
 * region's channel (mentions on Discord; on the map no post and a channel by its name). The
 * caller has counted the use against `MEETUP_THROTTLE`, and says what to do next.
 */
export async function makeMeetupAs(
  ctx: Pick<AppContext, 'meetupSafety' | 'attendance'>,
  ask: MakeAsk,
  names: ReportNames,
): Promise<MeetupMadeAnswer> {
  const outcome = await ctx.meetupSafety.make(ask);
  const refused = (text: string): MeetupMadeAnswer => ({ kind: 'refused', text });
  switch (outcome.kind) {
    case 'blocked':
      return { kind: 'blocked', text: NO_MEETUPS_FOR_YOU };
    case 'refused':
      return refused(NO_MEETUP_HERE);
    case 'power-spot':
      return refused(NO_POWER_SPOT);
    case 'too-soon':
      return refused(MEETUP_TOO_SOON);
    case 'not-sent':
      return { kind: 'refused', text: MEETUP_NOT_SENT, givesBack: true };
    case 'bad-name':
      return refused(problemText('bad-name', ctx.attendance.limits(), 'meetup'));
    case 'bad-description':
      return refused(problemText('description-too-long', ctx.attendance.limits(), 'meetup'));
    case 'cannot-make':
      return refused(problemText(outcome.reason, ctx.attendance.limits(), 'meetup'));
    case 'no-region':
      return refused(FROM_A_REGION);
    case 'no-forum':
      return refused(noForumWords(names.channel(outcome.region.channelId)));
    case 'no-post':
      return {
        kind: 'refused',
        text: noPostWords(outcome.refused, (id) => names.channel(id)),
        givesBack: true,
      };
    case 'held':
      return { kind: 'held', text: MEETUP_HELD };
    case 'posted': {
      const post = outcome.party.forumPostId;
      const named = post === null ? undefined : names.post(post);
      return {
        kind: 'posted',
        party: outcome.party,
        text: `Your meetup is made.${named === undefined ? '' : ` Its post is ${named}.`}`,
      };
    }
  }
}
