import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { Guard, SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { channelContext } from '../../discord/channel-context.js';
import { guildIdOf, instanceOf, partyOf, requireGuild } from '../../discord/guards.js';
import { serverValuesOf } from '../../discord/server-values.js';
import { NOT_SET_UP } from '../../discord/set-up.js';
import type { Config } from '../../config/index.js';
import type { ServerValues } from '../../config/server-settings.js';
import { gymRequestWay, type GymRequestWay } from '../../domain/servers/gym-requests.js';
import type { LabPost } from '../../services/moderators-lab.js';
import { memberInfo } from '../../discord/member-info.js';
import type { Throttle } from '../../discord/throttle.js';
import { MAX_NO_GYM } from '../../domain/party/max.js';
import { isMax, isRaid, isTrain, partyWord } from '../../domain/party/party.js';
import { gymIdOf } from '../../domain/party/stops.js';
import { currentStop } from '../../domain/party/train.js';
import { gymRequestIssue, gymRequestPost } from '../../render/gym-request.js';
import { gymWithId } from '../../render/gym-view.js';
import type { IssueOutcome } from '../../services/issue-gateway.js';
import {
  inRegions,
  serverGyms,
  respondWithServerGyms,
  serverGym,
  serverGymOption,
} from './server-gym.js';

/** Spec row 190: three requests in half an hour, as the legacy bot allowed. */
export const REQUEST_THROTTLE: Throttle = { uses: 3, perSeconds: 1_800 };

/** The longest request: GitHub takes far more, but a request is a sentence or two. */
export const MAX_REQUEST = 1_000;

const SAY_WHICH =
  'Say which gym the request is about with the `gym` option, or use this in the post of a ' +
  'raid or train at that gym.';

/** The gym of the party whose post the command is used in: a raid's, or a train's stop. */
async function gymOfPost(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<Gym> {
  const party = partyOf(interaction, ctx);
  if (!party) {
    // A post in a region's forum whose party is not active has ended, unless it is the summary
    // post (the bot makes every other post there).
    const { isThread, baseChannelId, channelId } = channelContext(interaction);
    const region =
      isThread && baseChannelId !== undefined ? ctx.regions.byForum(baseChannelId) : undefined;
    throw new UserError(
      region && region.summaryMessageId !== channelId
        ? 'What this post was for has ended. Say which gym the request is about with the ' +
            '`gym` option.'
        : SAY_WHICH,
    );
  }
  if (isMax(party)) throw new UserError(MAX_NO_GYM);
  const gymId = isRaid(party)
    ? party.gymId
    : isTrain(party)
      ? gymIdOf(currentStop(party))
      : undefined;
  const gyms = await serverGyms(interaction, ctx);
  const gym = gymId === null || gymId === undefined ? undefined : gyms.get(gymId);
  if (!gym || !inRegions(gyms)(gym)) {
    throw new UserError(
      `This ${partyWord(party)} is at no gym right now. Say which gym with the \`gym\` option.`,
    );
  }
  return gym;
}

/** The gym a request is about: the `gym` option, or the gym of the post it is made in. */
async function requestedGym(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Promise<Gym> {
  const typed = interaction.options.getString('gym');
  return typed === null || typed.trim() === ''
    ? gymOfPost(interaction, ctx)
    : serverGym(ctx, interaction, typed);
}

/** The words of the request: something, and not too much. */
function requestText(interaction: ChatInputCommandInteraction): string {
  const text = interaction.options.getString('text', true).trim();
  if (text === '') throw new UserError('Say what should change about the gym.');
  if (text.length > MAX_REQUEST) {
    throw new UserError(`A request has at most ${String(MAX_REQUEST)} characters.`);
  }
  return text;
}

/**
 * What can be known before anything is sent is refused here, so that a request that came to
 * nothing does not count against the three of half an hour.
 */
const requireRequest: Guard = async (interaction, ctx) => {
  if (!interaction.isChatInputCommand()) return;
  requestText(interaction);
  await requestedGym(interaction, ctx);
};

/**
 * What the member is told of a request that was not sent, or may not have been: GitHub may have
 * opened the issue of a request whose answer did not come in time, and sending it again would
 * open a second.
 */
function failureText(outcome: Extract<IssueOutcome, { ok: false }>): string {
  switch (outcome.reason) {
    case 'timeout':
      return (
        'GitHub did not answer in time, so I cannot tell whether your request arrived. Please ' +
        'ask a moderator before you send it again.'
      );
    case 'unreachable':
      return 'Your request could not be sent: GitHub could not be reached. Please try again later.';
    case 'refused':
      return (
        'Your request could not be sent: GitHub refused it. Please tell a moderator, who can ' +
        'look into the log of the bot.'
      );
    case 'disabled':
      return 'Requests are not set up here. Please tell a moderator.';
  }
}

/** What staff are told where a server's gym requests can go nowhere (`setUpIn`, plan 19B-4). */
export const REQUEST_NOT_SET_UP =
  'Staff choose the moderators’ bot lab in /admin settings: gym requests go there.';

/**
 * Where a server's gym requests go (plan 19B-4, `gymRequestWay`): the instance's repository
 * (`GITHUB_TOKEN` and `GITHUB_REPO` set) for a server the instance trusts with what every server
 * shares, else the server's moderators' bot lab, else nowhere.
 */
export function requestWayIn(
  config: Config,
  serverId: string,
  values: Pick<ServerValues, 'channels'>,
): GymRequestWay {
  const repository = config.env.GITHUB_TOKEN !== undefined && config.env.GITHUB_REPO !== undefined;
  return gymRequestWay(
    serverId,
    { ...instanceOf({ config }), repository },
    values.channels['mod-bot-lab'],
  );
}

/** What a member is told of a request the moderators' bot lab did not take; their use goes back. */
function labFailureText(posted: Exclude<LabPost, 'sent'>): string {
  switch (posted) {
    case 'no-lab':
      return NOT_SET_UP;
    case 'not-allowed':
      return (
        'Your request could not be sent: I may not post in this server’s moderators’ bot lab. ' +
        'Please tell a moderator.'
      );
    case 'not-sent':
      return (
        'Your request could not be sent: this server’s moderators’ bot lab took no message. ' +
        'Please tell a moderator.'
      );
  }
}

/** What /request says in rehearsal mode: it would send a real request. */
export const REQUEST_IN_REHEARSAL =
  'Rehearsal mode is on: /request would send a real request (a GitHub issue or a post for the ' +
  'moderators), so it is off for now.';

/**
 * Refuses a request in rehearsal mode, whichever way the server's requests go, before anything
 * is asked of GitHub or posted in the moderators' bot lab.
 */
const refusedInRehearsal: Guard = (_interaction, ctx) => {
  if (ctx.rehearsal) throw new UserError(REQUEST_IN_REHEARSAL);
};

/**
 * `/request` (spec row 190, the legacy `!request`): a change a member asks for about a gym (a
 * wrong name, a gym that is gone, an elite raid gym), sent where the server's requests go (plan
 * 19B-4, `requestWayIn`): as an issue to the instance's GitHub repository of the gym list
 * (`GITHUB_REPO`, with `GITHUB_TOKEN`) for a server the instance trusts with it, else as a post
 * in the server's moderators' bot lab (`gymRequestPost`, pinging nobody); a server with neither
 * has it not set up (`setUpIn`). In the post of a raid or train the gym is that of the party;
 * elsewhere the `gym` option says which. The member is told privately whether it was sent.
 */

export const request: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('request')
    .setDescription('Ask for a change to a gym: a wrong name, a gym that is gone, …')
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('What should change')
        .setRequired(true)
        .setMaxLength(MAX_REQUEST),
    )
    .addStringOption(
      serverGymOption('The gym; in the post of a raid or train, its gym when left out', false),
    ),
  help: {
    category: 'util',
    details:
      'Sends what you write to the people who keep the gym list, as a request about one gym. ' +
      'In the post of a raid or train it is about the gym of that raid or the stop the train ' +
      'is at; elsewhere pick the gym with `gym`.\n\nYour name and the server go with it, nothing ' +
      'else of you. You can send three requests in half an hour.',
    examples: [
      '/request text:This gym was renamed to Town Hall Fountain',
      '/request text:The gym is gone gym:Old Stone Fountain',
    ],
  },
  // Offered everywhere; not set up where a request can go nowhere (plan 19B-4).
  setUpIn: (values, config, serverId) =>
    requestWayIn(config, serverId, values) === 'nowhere' ? REQUEST_NOT_SET_UP : undefined,
  guards: [refusedInRehearsal, requireGuild, requireRequest],
  defer: 'ephemeral',
  throttle: REQUEST_THROTTLE,
  async execute(interaction, ctx) {
    const text = requestText(interaction);
    const gym = await requestedGym(interaction, ctx);
    const serverId = guildIdOf(interaction);
    const memberName = memberInfo(interaction).name ?? interaction.user.username;
    const way = requestWayIn(ctx.config, serverId, serverValuesOf(interaction, ctx));
    if (way === 'nowhere') throw new UserError(NOT_SET_UP, { givesBack: true });
    if (way === 'bot-lab') {
      const posted = await ctx.moderatorsLab.post(
        serverId,
        gymRequestPost({ gym, memberId: interaction.user.id, memberName, text }),
      );
      if (posted !== 'sent') throw new UserError(labFailureText(posted), { givesBack: true });
      ctx.log.info(
        { gym: gym.id, member: interaction.user.id, server: serverId },
        'a member sent a gym request to the moderators’ bot lab',
      );
      await interaction.editReply({
        content: `Thank you: your request about ${gymWithId(gym)} was sent to this server’s moderators.`,
      });
      return;
    }
    const outcome = await ctx.issues.open(
      gymRequestIssue({
        gym,
        memberName,
        serverName: interaction.guild?.name ?? 'a server',
        text,
      }),
    );
    if (!outcome.ok) throw new UserError(failureText(outcome));
    ctx.log.info(
      { gym: gym.id, member: interaction.user.id, issue: outcome.number },
      'a member sent a gym request',
    );
    await interaction.editReply({
      content: `Thank you: your request about ${gymWithId(gym)} was sent to the people who keep the gym list.`,
    });
  },
  autocomplete: respondWithServerGyms,
};
