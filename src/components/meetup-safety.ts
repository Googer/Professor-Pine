import { MessageFlags } from 'discord.js';
import type { ComponentHandler } from '../discord/command.js';
import { UserError } from '../discord/errors.js';
import { guildIdOf, requireGuild, requireManagement } from '../discord/guards.js';
import { memberInfo } from '../discord/member-info.js';
import { STALE_COMPONENT } from '../discord/router.js';
import type { Throttle } from '../discord/throttle.js';
import { REQUEST_DECISIONS, type MeetupRequestRecord } from '../domain/meetups/records.js';
import { SAFETY_KIND } from '../render/meetup-safety.js';
import { count, memberText, timestamp } from '../render/text.js';
import type { DecideOutcome } from '../services/meetup-safety.js';

/** How often one moderator may press the buttons of the moderators' posts. */
export const SAFETY_THROTTLE: Throttle = { uses: 20, perSeconds: 60 };

/** What a request's decision was, for a press that came second. */
function decidedAs(request: MeetupRequestRecord): string {
  switch (request.status) {
    case 'approved':
      return request.decision === 'approve' ? 'approved' : 'approved once';
    case 'failed':
      return 'approved, but the meetup could not be made';
    case 'refused':
      return request.decision === 'refuse-forever'
        ? 'refused from now on'
        : request.decision === 'block'
          ? 'refused, and its maker blocked'
          : 'refused';
    case 'withdrawn':
      return request.decision === 'approve' || request.decision === 'approve-once'
        ? 'approved, but its maker was blocked meanwhile: no meetup'
        : 'refused: its maker was blocked';
    case 'expired':
    case 'pending':
      return 'expired';
  }
}

/** What the moderator who pressed is told, privately. */
export function decisionWords(outcome: DecideOutcome): string {
  switch (outcome.kind) {
    case 'gone':
      return STALE_COMPONENT;
    case 'blocked-later': {
      const maker = memberText({
        id: outcome.request.makerId,
        name: outcome.request.makerName ?? undefined,
      });
      if (!outcome.newBlock) return `${maker} is blocked already.`;
      const meetups = outcome.closed === 0 ? 'no meetup' : count(outcome.closed, 'meetup');
      const requests = outcome.withdrawn === 0 ? 'no request' : count(outcome.withdrawn, 'request');
      return (
        `${maker} is blocked from creating meetups here (${requests} withdrawn, ${meetups} ` +
        'closed). They are told, and may appeal.'
      );
    }
    case 'maker-forgotten':
      return 'Its maker’s data was removed on request: there is nobody to block.';
    case 'not-for-a-pin':
      return 'A pin has no ruling: approve it or refuse it for this meetup alone.';
    case 'unchecked':
      return (
        'I could not check with Discord just now whether its maker may post in the forum, so ' +
        `nothing is decided yet. Press **${outcome.decision === 'approve' ? 'Approve' : 'Approve once'}** again in a moment.`
      );
    case 'expired':
      return 'This request has expired: nobody decided in time.';
    case 'decided-before': {
      const { request } = outcome;
      if (request.status === 'expired') {
        return `This request expired ${timestamp(request.expiresAt, 'R')}: nobody decided in time.`;
      }
      const who =
        request.decidedBy === null
          ? 'A moderator'
          : memberText({ id: request.decidedBy, name: request.decidedByName ?? undefined });
      const when = request.decidedAt === null ? '' : ` ${timestamp(request.decidedAt, 'R')}`;
      return `${who} decided this already${when}: ${decidedAs(request)}.`;
    }
    case 'done': {
      const { request, postId, failure } = outcome;
      const post = postId === undefined ? '' : ` (<#${postId}>)`;
      if (request.status === 'withdrawn') {
        return 'Its maker was blocked from making meetups here meanwhile, so no meetup is posted.';
      }
      if (failure !== undefined) {
        return `Approved, but the meetup could not be made: ${failure}. Its maker is told.`;
      }
      switch (request.decision) {
        case 'approve':
          return `Approved: the meetup is posted${post}, and the place is allowed from now on. Its maker is told.`;
        case 'approve-once':
          return `Approved once: the meetup is posted${post}. Its maker is told.`;
        case 'refuse-forever':
          return 'Refused, and no meetup can be held at this place from now on. Its maker is told.';
        case 'block': {
          const maker = memberText({ id: request.makerId, name: request.makerName ?? undefined });
          const withdrawn = outcome.withdrawn ?? 0;
          const closed = outcome.closed ?? 0;
          const others =
            withdrawn === 0 ? 'no other request' : `${count(withdrawn, 'other request')}`;
          const meetups = closed === 0 ? 'no meetup' : count(closed, 'meetup');
          return (
            `Refused, and ${maker} is blocked from creating meetups here (${others} withdrawn, ` +
            `${meetups} closed). They are told, and may appeal.`
          );
        }
        default:
          return 'Refused. Its maker is told.';
      }
    }
  }
}

/**
 * The buttons of a moderators' post of a meetup request (plan 8S-1; custom-id kind `msafety`):
 * `msafety:<request id>:approve|approve-once|refuse|refuse-forever|block`. Only staff may press
 * them (admins, moderators and the owner, as for `/delete`); anybody else is refused privately,
 * uncounted. The request is read from the database, so a post from before a restart works; the
 * decision is the service's (`MeetupSafety.decide`), which edits the post for everybody, and the
 * presser is told privately what came of it.
 */
export const meetupSafetyControls: ComponentHandler = {
  kind: SAFETY_KIND,
  guards: [requireGuild, requireManagement],
  throttle: SAFETY_THROTTLE,

  async button(interaction, id, ctx) {
    const decision = REQUEST_DECISIONS.find((one) => one === id.action);
    if (decision === undefined) throw new UserError(STALE_COMPONENT);
    // Making the meetup takes longer than Discord waits for an answer.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const outcome = await ctx.meetupSafety.decide(
      id.id,
      decision,
      { id: interaction.user.id, name: memberInfo(interaction).name },
      guildIdOf(interaction),
      interaction.guild?.name,
    );
    await interaction.editReply({ content: decisionWords(outcome) });
  },
};
