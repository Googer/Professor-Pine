import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { UserError } from '../../discord/errors.js';
import { memberInfo } from '../../discord/member-info.js';
import type { MaxParty } from '../../domain/party/party.js';
import { problemText } from '../../render/activity.js';
import { timestamp } from '../../render/text.js';
import type { MaxChangeOutcome } from '../../services/max-change-service.js';
import { partyOver } from '../parties/reply.js';
import { readMaxBoss, typedMaxTime, WHICH_TIER, type ReadMaxBoss } from './max-input.js';

/*
 * `/end` and `/boss` in the post of a max battle (plan 8X-3; design 3.1): read as `/max` reads
 * them, changed through `ctx.maxBattles` (decided inside the store), answered privately.
 */

/** The words of a change that did not land: over, refused (the battle there named), or none. */
function refusal(ctx: AppContext, outcome: MaxChangeOutcome): string | undefined {
  if (outcome.kind === 'gone') return partyOver({ type: 'max' });
  if (outcome.kind !== 'refused') return undefined;
  const text = problemText(outcome.reason, ctx.attendance.limits(), 'max battle');
  const post = outcome.other?.forumPostId;
  return post ? `${text} Its battle is <#${post}>.` : text;
}

async function reply(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  outcome: MaxChangeOutcome,
  said: (party: MaxParty) => string,
  same: string,
): Promise<void> {
  const refused = refusal(ctx, outcome);
  if (refused !== undefined || outcome.kind !== 'ok') throw new UserError(refused ?? partyOver());
  await interaction.reply({
    content: outcome.changed ? said(outcome.party) : same,
    flags: MessageFlags.Ephemeral,
  });
}

/** `/end` in a max battle's post: a time within its day, never past the last battle time. */
export async function changeMaxEnd(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: MaxParty,
  text: string,
): Promise<void> {
  const typed = typedMaxTime(ctx, 'end', text, Date.now(), party);
  // An end cannot be removed (`typedMaxTime` refuses `none`).
  if (typed === 'unset') throw new UserError('A max battle always has an end.');
  const member = { id: interaction.user.id, ...memberInfo(interaction) };
  const outcome = await ctx.maxBattles.setEnd(party.id, member, typed.at);
  const when = (battle: MaxParty): string =>
    battle.endTime === null ? 'no time' : timestamp(battle.endTime);
  await reply(
    interaction,
    ctx,
    outcome,
    (battle) => `This max battle now ends at ${when(battle)}.`,
    `This max battle ends at ${when(party)} already.`,
  );
}

/**
 * `/boss` in a max battle's post: a boss as `/max` reads it (`readMaxBoss`: a listed one, or a
 * Pokémon the game lets battle so, with its tier: `tierText`, `/boss tier:`, asked for a Dynamax
 * boss on no list, plan 8X-F); a change between Dynamax and Gigantamax is refused by the battle
 * (`max-kind-change`).
 */
export async function changeMaxBoss(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: MaxParty,
  text: string,
  tierText: string | null = null,
): Promise<void> {
  let read: ReadMaxBoss;
  try {
    read = readMaxBoss(ctx, text, tierText, Date.now(), party.max.tier);
  } catch (err) {
    // Asked for the tier, nothing was changed: the use is given back (final review of 8X-F, F6).
    if (err instanceof UserError && err.message === WHICH_TIER) {
      throw new UserError(WHICH_TIER, { givesBack: true });
    }
    throw err;
  }
  const member = { id: interaction.user.id, ...memberInfo(interaction) };
  const outcome = await ctx.maxBattles.setBoss(party.id, member, read);
  await reply(
    interaction,
    ctx,
    outcome,
    () => `The boss of this max battle is now ${read.label}.`,
    `The boss of this max battle is ${read.label} already.`,
  );
}
