import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type APIModalInteractionResponseCallbackData,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type {
  ComponentHandler,
  GuardableInteraction,
  SimpleCommand,
} from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { channelInDialog, deferSubmit } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild, requireManagement, requireParty } from '../../discord/guards.js';
import { v2Answer } from '../../discord/late-reply.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import type { Throttle } from '../../discord/throttle.js';
import type { PostRemoval } from '../../domain/moderation/reports.js';
import { partyWord, type Party } from '../../domain/party/party.js';
import {
  APPROVED_ACCENT,
  EXPIRED_ACCENT,
  PENDING_ACCENT,
  REFUSED_ACCENT,
} from '../../render/meetup-safety.js';
import { removalDialog, removalOf } from '../../render/moderation.js';
import { closeQuestion, closeTitle } from '../../render/removal-words.js';
import { memberText } from '../../render/text.js';
import { textMessage } from '../../render/v2.js';
import type { Member } from '../../services/attendance-service.js';
import { actingMember, commandParty, partyOver } from './reply.js';

/**
 * The custom-id kind of the dialog of `/delete` (plans 8S-2, 8Q): `pclose:<party id>:close`, its
 * radio group `REMOVAL_INPUT`, and `pclose:<party id>:close:archive` where the bot may not
 * delete the post.
 */
export const CLOSE_KIND = 'pclose';

/** How often one member of staff may submit the dialog of `/delete`: a clean-up is many. */
export const CLOSE_THROTTLE: Throttle = { uses: 20, perSeconds: 60 };

/** What a moderator is told of a party they closed, as its post goes. */
export function closedWords(party: Pick<Party, 'type'>, removal: PostRemoval): string {
  const post =
    removal === 'delete' ? 'I am deleting its post.' : 'I am archiving and locking its post.';
  if (party.type === 'raid')
    return `This raid is closed: its gym is free for a new report, and ${post}`;
  // A max battle frees its spot as a raid frees its gym (plan 8X-3).
  if (party.type === 'max') {
    return `This max battle is closed: its spot is free for a new report, and ${post}`;
  }
  return `This ${partyWord(party)} is closed: ${post}`;
}

/** What a moderator is told whose Delete post Discord refused: the post is archived instead. */
export function refusedDeletion(party: Pick<Party, 'type'>): string {
  const archived = 'its post is archived: Discord refused to delete it; delete it yourself.';
  if (party.type === 'raid') {
    return `This raid is closed: its gym is free for a new report, and ${archived}`;
  }
  if (party.type === 'max') {
    return `This max battle is closed: its spot is free for a new report, and ${archived}`;
  }
  return `This ${partyWord(party)} is closed, and ${archived}`;
}

/**
 * Where a deletion failed because Discord did not answer: the post is archived for now and
 * deleted with the hourly upkeep (plan 8X-H, review r1 C1). The report's decision says it too.
 */
export const DELETION_PENDING =
  'Discord did not answer when I tried to delete it. I will try again within the hour; if it ' +
  'is still there after that, delete it yourself';

/** What a moderator is told whose Delete post the network failed: it is deleted later. */
export function pendingDeletion(party: Pick<Party, 'type'>): string {
  const archived = `its post is archived for now: ${DELETION_PENDING}.`;
  if (party.type === 'raid') {
    return `This raid is closed: its gym is free for a new report, and ${archived}`;
  }
  if (party.type === 'max') {
    return `This max battle is closed: its spot is free for a new report, and ${archived}`;
  }
  return `This ${partyWord(party)} is closed, and ${archived}`;
}

/** What a moderator is told who chose to delete a post the bot may not delete. */
export function mayNotDelete(forumId: string | null): string {
  return mayNotDeleteIn(forumId === null ? 'its forum' : `<#${forumId}>`);
}

/**
 * `mayNotDelete` with the forum named by the caller (plan 8M-8B): a mention on Discord, `#name` on
 * the map, which shows no mention.
 */
export function mayNotDeleteIn(where: string): string {
  return (
    `I can't delete posts in ${where} (Manage Threads is missing there). Archive it, or ` +
    'delete it yourself.'
  );
}

/**
 * What came of staff's closing of a party (`closePartyAs`): refused before anything changed for a
 * deletion the bot may not make (`may-not-delete`); over a moment before (`over`), its post
 * deleted all the same where Delete post was chosen (`deleted-over`); closed as chosen
 * (`closed`), or archived where Discord refused the deletion (`refused-deletion`) or did not answer
 * (`deletion-pending`: deleted with the hourly upkeep).
 */
export type CloseOutcome =
  | { kind: 'may-not-delete' }
  | { kind: 'over' }
  | { kind: 'deleted-over' }
  | { kind: 'closed'; removal: PostRemoval }
  | { kind: 'refused-deletion' }
  | { kind: 'deletion-pending' };

/** What closing a party reads and calls: exactly what `/delete`'s dialog uses. */
export type ClosingContext = Pick<AppContext, 'partyService' | 'reports'>;

/**
 * Staff's closing of a party (plan 8M-8B: moved out of the Submit of `/delete`'s dialog, so that
 * the dialog and the map's Delete… go one way): a deletion the bot may not make (by now) is
 * refused before anything ends; else the party ends as `/delete` ended it (`PartyService.endAs`
 * with who closed it as the post's last words, its post archived or deleted, `removal`), `left`
 * told before the post is archived or deleted (the dialog answers there: nothing may follow the
 * archiving); a party over a moment before has its post deleted all the same where Delete post
 * was chosen; its reports to the moderators read closed by this moderator, the post as it really
 * went (`closedByStaff`).
 */
export async function closePartyAs(
  ctx: ClosingContext,
  party: Party,
  moderator: Member,
  removal: PostRemoval,
  left?: () => Promise<unknown>,
): Promise<CloseOutcome> {
  if (removal === 'delete' && !ctx.partyService.mayDeletePost(party.id)) {
    return { kind: 'may-not-delete' };
  }
  const closed = await ctx.partyService.endAs(party.id, undefined, {
    lastWords: `This ${partyWord(party)} was closed by ${memberText(moderator)}.`,
    removal,
    ...(left === undefined ? {} : { left }),
  });
  if (closed === false) {
    // Over a moment before: Delete post deletes the post all the same.
    const postId = party.forumPostId;
    const deleted =
      removal === 'delete' && postId !== null
        ? await ctx.partyService.deletePostOf(postId)
        : undefined;
    return { kind: deleted === 'deleted' ? 'deleted-over' : 'over' };
  }
  // Its reports to the moderators read closed by this moderator, the post as it really went
  // (or will go: a deletion the network failed is redone, review r1 C1).
  const refused = removal === 'delete' && closed === 'archived';
  await ctx.reports.closedByStaff(party.id, refused ? 'denied' : removal, moderator);
  if (refused) return { kind: 'refused-deletion' };
  return closed === 'deleting' ? { kind: 'deletion-pending' } : { kind: 'closed', removal };
}

/**
 * The words of a closing's outcome (`closePartyAs`) and their tone (the accent of the dialog's
 * answer), for the dialog and the map alike; `where` names the forum for `may-not-delete` (a
 * mention on Discord, `#name` on the map).
 */
export function closeWords(
  outcome: CloseOutcome,
  party: Pick<Party, 'type'>,
  where: string,
): { tone: 'approved' | 'refused' | 'pending' | 'expired'; text: string } {
  switch (outcome.kind) {
    case 'may-not-delete':
      return { tone: 'refused', text: mayNotDeleteIn(where) };
    case 'over':
      return { tone: 'expired', text: partyOver(party) };
    case 'deleted-over':
      return {
        tone: 'approved',
        text: `This ${partyWord(party)} was over already; I deleted its post.`,
      };
    case 'closed':
      return { tone: 'approved', text: closedWords(party, outcome.removal) };
    case 'refused-deletion':
      return { tone: 'refused', text: refusedDeletion(party) };
    case 'deletion-pending':
      return { tone: 'pending', text: pendingDeletion(party) };
  }
}

/** The action of the dialog of `/delete`: `pclose:<party id>:close[:archive]`. */
const CLOSE_FORM = 'close';

/** The forum of a party's post as a dialog names it: `#west-raids`. */
export function forumInDialog(interaction: GuardableInteraction, forumId: string | null): string {
  const name = forumId === null ? undefined : interaction.guild?.channels.cache.get(forumId)?.name;
  return channelInDialog(name);
}

/**
 * `/delete` (spec 4.2; plan 8S-2: for staff only, Manage Messages): closes the raid, train or
 * meetup of the post it is used in, after asking in a dialog (plan 8Q, `removalDialog`): archive
 * its post (it stays readable, locked) or delete it with everything in it, or, where the bot may
 * not delete posts there, archive it only (the command has no throttle; the dialog's Submit
 * `CLOSE_THROTTLE`). The post says who closed it (when it is kept), the copies and the link line
 * go, and a raid's gym is free for a new report. It is the tool for what the clock does not tidy
 * up by itself, so it works on any party that is still active and has no throttle. Members
 * report with `/report`; `/help` tells a member who asks for `/delete` so. The dialog is the
 * first answer: the command declares no `defer`.
 */
export const deleteParty: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Close this raid, max battle, train or meetup (moderators)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  help: {
    category: 'admin',
    details:
      'For admins and moderators: closes the raid, max battle, train or meetup of the post you ' +
      'use it in. A dialog asks first whether to archive the post (it stays readable and ' +
      'locked) or to delete it with everything written in it.\n\nMembers tell the moderators with ' +
      '`/report`. Server Settings › Integrations decide who sees it (Manage Messages by default).',
    examples: ['/delete'],
  },
  guards: [requireParty, requireManagement],
  async execute(interaction, ctx) {
    await interaction.showModal(closeDialog(interaction, ctx, commandParty(interaction, ctx)));
  },
};

/**
 * The dialog of `/delete` for a party (plan 8Q): archive its post or delete it, or archive only
 * where the bot may not delete posts there. Its Submit is `closeControls`'; a pin battle's
 * notice opens it too (Delete, `maxPinControls`).
 */
export function closeDialog(
  interaction: GuardableInteraction,
  ctx: AppContext,
  party: Party,
): APIModalInteractionResponseCallbackData {
  const word = partyWord(party);
  const id = (args: string[]) =>
    encodeCustomId({ kind: CLOSE_KIND, id: party.id, action: CLOSE_FORM, args });
  return removalDialog({
    customId: id,
    opened: Date.now(),
    // The map's words too (`removal-words.ts`, plan 8M-8B).
    title: closeTitle(word),
    question: closeQuestion(word),
    mayDelete: ctx.partyService.mayDeletePost(party.id),
    forum: forumInDialog(interaction, party.forumChannelId),
  });
}

/**
 * The Submit of the dialog of `/delete` (kind `pclose`), for staff: acknowledged privately, then
 * the party ends as `/delete` ended it before (`PartyService.end` with who closed it as the
 * post's last words), its post archived or deleted (`removal`, picked or fixed by the dialog); a
 * deletion the bot may not make (by now) is refused before anything ends. The answer is given
 * before anything is done to the post. The buttons of the private question this dialog replaced
 * (`pclose:<party>:archive|delete`) are no control any more: the router's stale answer.
 */
export const closeControls: ComponentHandler = {
  kind: CLOSE_KIND,
  guards: [requireGuild, requireManagement],
  throttle: CLOSE_THROTTLE,
  async modal(interaction, id, ctx) {
    if (id.action !== CLOSE_FORM) throw new UserError(STALE_COMPONENT);
    const removal = removalOf(interaction, id.args);
    if (removal === undefined) throw new UserError(STALE_COMPONENT);
    await deferSubmit(interaction);
    const party = ctx.parties.get(id.id);
    const say = (accent: number, text: string) => v2Answer(textMessage(accent, [text]));
    if (!party) {
      await interaction.editReply(say(EXPIRED_ACCENT, partyOver()));
      return;
    }
    // A custom id can be sent from anywhere: a party of another server is none here.
    if ((await ctx.guilds.idFor(guildIdOf(interaction))) !== party.guildId) {
      throw new UserError(STALE_COMPONENT);
    }
    // The way the map's Delete… goes too (plan 8M-8B).
    const outcome = await closePartyAs(ctx, party, actingMember(interaction), removal, () =>
      // The answer goes out before the post is archived or deleted: nothing may follow that.
      interaction.editReply(say(APPROVED_ACCENT, closedWords(party, removal))),
    );
    // Answered already, before the post was archived or deleted.
    if (outcome.kind === 'closed') return;
    const where = party.forumChannelId === null ? 'its forum' : `<#${party.forumChannelId}>`;
    const { tone, text } = closeWords(outcome, party, where);
    if (outcome.kind === 'may-not-delete') {
      await interaction.editReply(say(TONES[tone], text));
      return;
    }
    // An answer in a private message of its own, which opens no archived post again; one that
    // lived in a post just deleted goes with it.
    await interaction.editReply(say(TONES[tone], text)).catch(() => undefined);
  },
};

/** The accent of each tone of a closing's answer (`closeWords`). */
const TONES = {
  approved: APPROVED_ACCENT,
  refused: REFUSED_ACCENT,
  pending: PENDING_ACCENT,
  expired: EXPIRED_ACCENT,
} as const;
