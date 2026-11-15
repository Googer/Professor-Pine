import { serverGyms } from '../util/server-gym.js';
import { SlashCommandBuilder } from 'discord.js';
import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { channelInDialog, deferSubmit, dialog, readInTime } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import {
  partyOfServer,
  raidOf,
  regionChannelOf,
  requireGuild,
  requireRaid,
} from '../../discord/guards.js';
import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
import { blocksNewRaid } from '../../domain/party/raid.js';
import { problemText } from '../../render/activity.js';
import { endSentence, plain, truncate } from '../../render/text.js';
import { commandRaid, partyOver } from '../parties/reply.js';
import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
import { raidRefusalText } from './raid-changes.js';
import { gymChoices, reportedGym } from './raid-input.js';

/**
 * The custom-id kind of the dialog `/location` opens before a move to another region (plan 8Q):
 * `location:<party id>:move:<gym id>:<counted at>`, the last when the router counted the use of
 * `/location` that opened it (`whenCounted`): a move refused for none of the member's doing gives
 * that use back to its window (`carriesOn`, plan 8S-4).
 */
const KIND = 'location';
/** The name of the command, as the router counts its uses. */
const LOCATION = 'location';
const MOVE_FORM = 'move';
const NOT_MOVED = 'Nothing was moved.';

/**
 * `/location`: moves the raid to another gym. The legacy command was `!gym`; the name `/gym`
 * belongs to the gym administration (`/gym add`, …), and one command cannot be both.
 *
 * A gym of the raid's own region is taken at once. A gym of another region means a new post in
 * that region's forum and the end of this one (spec 5.2), so the member is asked first, in a
 * dialog (plan 8Q) whose Submit moves it. Such a move has no limit of its own: the one of every
 * change of a raid applies (Matt, 2026-10-11), to the command and to the Submit.
 */
export const location: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName(LOCATION)
    .setDescription('Move this raid to another gym, when it was reported at the wrong one')
    .addStringOption((option) =>
      option
        .setName('gym')
        .setDescription('The gym: type part of its name and pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'raid-crud',
    details:
      'The gym must not have a raid already. For a gym of another region I ask first, in a ' +
      'dialog: the raid then gets a new post in the raid forum of that region, with everybody ' +
      `who is signed up, and this post is closed with a link to it. ${IN_A_RAID_POST}`,
    examples: ['/location gym:Big Fountain'],
  },
  guards: [requireRaid],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandRaid(interaction, ctx);
    const typed = interaction.options.getString('gym', true);
    const answer = reportedGym(
      await serverGyms(interaction, ctx),
      regionChannelOf(interaction, ctx),
      typed,
    );
    if (answer.kind === 'none') {
      throw new UserError(
        `I found no gym for "${plain(truncate(typed, 80))}". Type part of its name and pick it from the list.`,
      );
    }
    if (answer.kind === 'several') {
      const names = answer.gyms.slice(0, 3).map((gym) => plain(gym.name));
      throw new UserError(
        `Several gyms fit "${plain(truncate(typed, 80))}" (${names.join(', ')}…). Pick one from the list.`,
      );
    }
    const { gym } = answer;
    const name = plain(gym.nickname || gym.name);
    // Where the raid would go; the service decides again when it moves, and refuses what cannot be.
    const move = ctx.raids.gymMove(party, gym);
    if (move.kind !== 'region') {
      const outcome = await ctx.raids.setGym(party.id, changingMember(interaction), gym.id);
      await answerRaidChange(
        interaction,
        ctx,
        outcome,
        () => endSentence(`This raid is now at ${name}`),
        `This raid is at ${name} already.`,
      );
      return;
    }
    // A gym that has a raid, of any kind (plan 8E), is refused here already, not only after the
    // question (the service decides again when the raid moves).
    const now = Date.now();
    const other = blocksNewRaid(party, now)
      ? ctx.parties.raidAt(party.guildId, gym.id, now)
      : undefined;
    if (other && other.id !== party.id) {
      const post = other.forumPostId;
      throw new UserError(
        problemText('gym-taken', ctx.attendance.limits(), 'raid') +
          (post ? ` Its post is <#${post}>.` : ''),
      );
    }
    // Nor is a member asked who is kept out of that region's forum (plan 8Z-2): read within a
    // dialog's time, and asked again when the raid moves.
    const kept = await readInTime(ctx.log, interaction, () =>
      ctx.raids.moveRefusal(move.region, interaction.user.id),
    );
    if (kept !== undefined) {
      throw new UserError(problemText(kept, ctx.attendance.limits(), 'raid'));
    }
    // The region's channel by its name: a dialog shows no mention (design 8Q).
    const where = channelInDialog(
      interaction.guild?.channels.cache.get(move.region.channelId)?.name,
    );
    await interaction.showModal(
      dialog({
        customId: encodeCustomId({
          kind: KIND,
          id: party.id,
          action: MOVE_FORM,
          args: [String(gym.id), String(whenCounted(interaction) ?? Date.now())],
        }),
        title: 'Move the raid to another region',
        text:
          `${name} is in ${where}, not in this region. Moving the raid there gives it a new ` +
          'post in the raid forum of that region, with everybody who is signed up, and closes ' +
          'this one. Move it?\n\nSubmit moves it.',
      }),
    );
  },
  async autocomplete(interaction, ctx) {
    const regionName = (channelId: string): string | undefined =>
      interaction.guild?.channels.cache.get(channelId)?.name;
    const gyms = await serverGyms(interaction, ctx);
    const choices = gymChoices(
      gyms,
      regionChannelOf(interaction, ctx),
      interaction.options.getFocused(),
      regionName,
    );
    // Not the gyms the raid cannot move to (in no region of this server that has a forum).
    const party = raidOf(interaction, ctx);
    const reachable = (value: string): boolean => {
      const gym = gyms.get(Number(value.slice(2)));
      return !party || (gym !== undefined && ctx.raids.gymMove(party, gym).kind !== 'nowhere');
    };
    await interaction.respond(choices.filter((choice) => reachable(choice.value)));
  },
};

/**
 * The Submit of the dialog of `/location` (`location:<party id>:move:<gym id>:<counted at>`), in
 * a server, with the limit of every change of a raid (refused as over unless the party it names
 * is the raid of the post it is submitted in, `raidOf`: a custom id could name any party, and
 * the old question's token held the one `/location` had checked): acknowledged privately (the
 * new post takes a moment to make), then the raid is moved as the service decides now, and the
 * answer is given before the old post is closed. A refusal that is none of the member's doing (no post in the other forum) gives back
 * both the Submit and the use of `/location` that opened the dialog (`carriesOn`: that use did
 * nothing either). Once the move was answered, a later failure (closing the old post) is only
 * logged: the move stands and its uses stay counted. The buttons of the question this dialog
 * replaced (`location:<token>:yes|no`) get the router's stale answer.
 */
export const locationControls: ComponentHandler = {
  kind: KIND,
  guards: [requireGuild],
  throttle: CHANGE_THROTTLE,
  carriesOn: (_interaction, id) => {
    const countedAt = id.action === MOVE_FORM ? Number(id.args[1]) : Number.NaN;
    return Number.isSafeInteger(countedAt)
      ? { ...CHANGE_THROTTLE, as: LOCATION, countedAt }
      : undefined;
  },

  async modal(interaction, id, ctx) {
    const [gymArg] = id.args;
    const gymId = gymArg !== undefined && /^\d{1,9}$/.test(gymArg) ? Number(gymArg) : undefined;
    if (id.action !== MOVE_FORM || gymId === undefined) throw new UserError(STALE_COMPONENT);
    const partyId = id.id;
    await deferSubmit(interaction);
    // Only a raid of this server (`partyOfServer`), and only the raid of the post it is submitted
    // in: the custom id could name any party.
    const named = partyOfServer(interaction, ctx, partyId);
    if (named === undefined || raidOf(interaction, ctx)?.id !== named.id) {
      await interaction.editReply({ content: partyOver({ type: 'raid' }) });
      return;
    }
    const gym = (await serverGyms(interaction, ctx)).get(gymId);
    let answered = false;
    const say = async (content: string): Promise<void> => {
      answered = true;
      await interaction.editReply({ content });
    };
    if (!gym) {
      await say('That gym no longer exists.');
      return;
    }
    const name = plain(gym.nickname || gym.name);
    let outcome;
    try {
      // The answer is given before the old post is closed.
      outcome = await ctx.raids.setGym(partyId, changingMember(interaction), gymId, (party) =>
        say(
          endSentence(`This raid is now at ${name}`) +
            (party.forumPostId === null ? '' : ` Its new post is <#${party.forumPostId}>.`),
        ),
      );
    } catch (err) {
      // The raid moved, and the member was told so, before a later step failed (closing the
      // old post): the move stands and its use stays counted, so the failure is only logged.
      if (answered) {
        ctx.log.error({ err, party: partyId }, 'a raid moved, but a step after it failed');
        return;
      }
      try {
        await say(NOT_MOVED);
      } catch {
        // The answer may be gone; the error below is what matters.
      }
      throw err;
    }
    if (answered) return;
    if (outcome.kind === 'gone') {
      await say(partyOver({ type: 'raid' }));
    } else if (outcome.kind === 'refused') {
      const post = outcome.other?.forumPostId;
      const text =
        `${NOT_MOVED} ${raidRefusalText(outcome, ctx.attendance.limits())}` +
        (post ? ` Its post is <#${post}>.` : '');
      await say(text);
      // No post in the other forum (refused, or lost while it was made): none of the member's
      // doing, so the Submit goes back.
      if (outcome.reason === 'posts-refused' || outcome.reason === 'post-not-made') {
        throw new UserError(text, { givesBack: true, said: true });
      }
    } else {
      // The gym lies in the raid's own region by now (somebody moved the raid meanwhile).
      await say(
        outcome.changed
          ? endSentence(`This raid is now at ${name}`)
          : `This raid is at ${name} already.`,
      );
    }
  },
};
