import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { DATE_EXAMPLE, type SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, isStaff, regionChannelOf, requireGuild } from '../../discord/guards.js';
import type { Throttle } from '../../discord/throttle.js';
import { MAX_OPEN_PARTIES } from '../../domain/party/open-parties.js';
import {
  attendeeOf,
  isTrainAtEnd,
  isTrainKind,
  MAX_PARTY_NAME,
  TRAIN_AT_END,
  TRAIN_KINDS,
} from '../../domain/party/party.js';
import {
  AT_END_LABELS,
  TRAIN_KIND_QUESTION,
  TRAIN_KIND_WORDS,
  trainKindChoice,
} from '../../render/train-words.js';
import { OPEN_PARTIES_FULL, openPartiesFull } from '../parties/open-parties.js';
import { actingMember } from '../parties/reply.js';
import { newPartyTimes, requirePlaceForNew, typedTimedTime } from '../parties/timed.js';
import { DISCORD_NAMES } from '../raids/report.js';
import { notSignedUpWords, startTrainAs, TRAIN_FROM_A_REGION } from './train-changes.js';

export { TRAIN_FROM_A_REGION };

/** The name `/train` is used and counted under, and the map's new trains with it. */
export const TRAIN_COMMAND = 'train';

/** As the legacy bot allowed: a train is a post that stays for hours or days. */
export const TRAIN_THROTTLE: Throttle = { uses: 2, perSeconds: 900 };

/**
 * When a new train starts, from `/train start:` (plan 8X-4; design 6.1: a train planned days or
 * weeks ahead has its time from the start), read as `/meet` reads it for a train about to be made
 * (`typedTimedTime`); undefined without one. Throws a `UserError` for a text that is no time it
 * may have, and for a word that removes a time (`none`: a new train has none to remove). Read
 * once per interaction, by the guard, uncounted, with one `now` (`readStarts`): the command takes
 * what the guard read, so that a start the guard took is never refused, or read as another day,
 * once the use is counted.
 */
function typedStart(interaction: ChatInputCommandInteraction, ctx: AppContext): number | undefined {
  const known = readStarts.get(interaction);
  if (known) return known.at;
  const text = interaction.options.getString('start')?.trim() ?? '';
  const now = Date.now();
  const read =
    text === '' ? undefined : typedTimedTime(ctx, newPartyTimes('train', now), 'meet', text, now);
  if (read === 'unset') throw new UserError(NO_START_TO_REMOVE);
  readStarts.set(interaction, { at: read?.at });
  return read?.at;
}

/** What a new train's start was read as, for as long as the interaction lives (`typedStart`). */
const readStarts = new WeakMap<ChatInputCommandInteraction, { at: number | undefined }>();

/** Said of `/train start:none`: a word that removes a time, of a train that has none yet. */
export const NO_START_TO_REMOVE = 'A new train has no start to remove: leave `start` out.';

/**
 * `/train` (spec 4.2): a raid train with a post of its own in the forum of the region it is
 * made in. It starts with its name and nothing else; its route, its times, its conductor and the
 * boss it is after are set in its post. Who makes it is signed up as their automatic status says
 * and named unless their privacy setting is Anonymous, as for a raid they report (Matt,
 * 2026-10-13); they are not its conductor unless they say so.
 */
export const train: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName(TRAIN_COMMAND)
    .setDescription('Create a train of raids or max battles in this region, with a post of its own')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('What to call it, such as "Saturday legendaries"')
        .setRequired(true)
        .setMaxLength(MAX_PARTY_NAME),
    )
    .addStringOption((option) =>
      option
        .setName('at-end')
        .setDescription('What it does at the last stop: finish (the default), loop, or turn back')
        .addChoices(TRAIN_AT_END.map((atEnd) => ({ name: AT_END_LABELS[atEnd], value: atEnd }))),
    )
    .addStringOption((option) =>
      option
        .setName('kind')
        .setDescription(`${TRAIN_KIND_QUESTION} (its stops can be gyms or Power Spots)`)
        .addChoices(TRAIN_KINDS.map((kind) => ({ name: trainKindChoice(kind), value: kind }))),
    )
    .addStringOption((option) =>
      option
        .setName('start')
        .setDescription('When it starts, as /meet takes it: 6:15pm, month-day and time, in 30')
        .setMaxLength(40),
    ),
  help: {
    category: 'train',
    details:
      'For a group that goes from gym to gym, or Power Spot to Power Spot.\n\nUse it in the channel ' +
      'of a region; the train gets a post in the forum of that region. You are signed up for it ' +
      'as `/settings auto-status` says (interested unless you changed it; coming for Here), and ' +
      'the post names you unless your `/settings privacy` is Anonymous.\n\nIn the post, `/route ' +
      'add` adds the gyms and Power Spots it visits (also of other regions), `/meet` sets when ' +
      'it starts and `/end` when it ends, `/boss` says which Pokémon it is after, and ' +
      '`/conductor set` makes you the one who moves it.\n\nMembers sign up with the buttons, as ' +
      'for a raid, and the button "Move…" or `/next` takes it to its next stop.\n\n`at-end` ' +
      'says what the train does at the last stop: it finishes the route (the default), loops ' +
      'back to the first stop, or turns back and runs the route backwards; the button "Manage…" ' +
      `changes that later, and reverses or finishes the route.\n\n\`kind\` says what the train is mainly for: raids (a ` +
      `${TRAIN_KIND_WORDS.raid}, the default), Dynamax battles (a ${TRAIN_KIND_WORDS.dynamax}: ` +
      `lobbies form on the spot) or Gigantamax battles (a ${TRAIN_KIND_WORDS.gigantamax}: Join ` +
      'fills its groups up to a Gigantamax lobby); "Manage…" changes that later too, ' +
      'also before the train has a stop.\n\n`start` says when it starts, as `/meet` takes it, so ' +
      'that a train planned days ahead says so from the first; its route can wait until the ' +
      'day.\n\nA train is archived an hour after it is over: after its end, or without one a day ' +
      'after its start. One without any time goes a day after it was made; its post says when.' +
      `\n\nYou may have ${MAX_OPEN_PARTIES} open trains and meetups at a time, here and on the map.`,
    examples: [
      '/train name:Saturday legendaries',
      '/train name:Park loop at-end:Loop',
      `/train name:Wild Area kind:${trainKindChoice('gigantamax')} start:${DATE_EXAMPLE} 10am`,
    ],
  },
  guards: [
    requireGuild,
    requirePlaceForNew('train', TRAIN_FROM_A_REGION),
    // A start it cannot read is refused before anything is made, and is not counted.
    (interaction, ctx) => {
      if (interaction.isChatInputCommand()) typedStart(interaction, ctx);
    },
    // As many open trains and meetups as one member may have (plan 8Z): not counted either.
    async (interaction, ctx) => {
      const staff = isStaff(interaction, ctx);
      if (await openPartiesFull(ctx, guildIdOf(interaction), interaction.user.id, staff)) {
        throw new UserError(OPEN_PARTIES_FULL);
      }
    },
  ],
  defer: 'ephemeral',
  throttle: TRAIN_THROTTLE,
  async execute(interaction, ctx) {
    const regionChannelId = regionChannelOf(interaction, ctx);
    if (regionChannelId === undefined) throw new UserError(TRAIN_FROM_A_REGION);
    // A choice of the option; anything else (a client that sends what it was not offered) is the default.
    const atEnd = interaction.options.getString('at-end');
    const kind = interaction.options.getString('kind');
    const start = typedStart(interaction, ctx);
    const answer = await startTrainAs(
      ctx,
      actingMember(interaction),
      {
        name: interaction.options.getString('name', true),
        regionChannelId,
        ...(isTrainAtEnd(atEnd) ? { atEnd } : {}),
        ...(isTrainKind(kind) ? { kind } : {}),
        ...(start === undefined ? {} : { start }),
      },
      DISCORD_NAMES,
    );
    // The guard has looked at all of the refusals; they are for what changed in between.
    if (answer.kind === 'refused') {
      throw new UserError(answer.text, { givesBack: answer.givesBack === true });
    }
    // Who made it may lay its route and set its times without being signed up; moving it and
    // being its conductor take a sign-up.
    const signedUp = attendeeOf(answer.party, interaction.user.id) !== undefined;
    // `/meet` is named only for a train made without its start (plan 8X-G, M1).
    const meet = start === undefined ? '`/meet` sets when it starts' : undefined;
    const then = signedUp
      ? `${meet === undefined ? '' : `, ${meet},`} and \`/conductor set\` makes you its conductor.`
      : `${meet === undefined ? '' : ` and ${meet}`}. ${notSignedUpWords('in the post')}`;
    await interaction.editReply({
      content: `${answer.text} There, \`/route add\` adds its stops${then}`,
    });
  },
};
