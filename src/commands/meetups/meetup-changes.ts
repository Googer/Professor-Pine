import type { AppContext } from '../../app-context.js';
import type { Guard } from '../../discord/command.js';
import { readInTime } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, isStaff, partyOf } from '../../discord/guards.js';
import { mayEditMeetup } from '../../domain/party/meetup.js';
import { isMeetup, type MeetupParty } from '../../domain/party/party.js';
import { blockedAnswer } from '../../render/meetup-safety.js';

/** What a member is told who is neither a meetup's maker nor staff. */
export const NOT_YOUR_MEETUP =
  "Only its maker and moderators can change this meetup's name and information.";

/** What a member blocked from meetups in the server is told who made this one. */
export const BLOCKED_FROM_CHANGING =
  "You are blocked from meetups on this server, so you can't change this one.";

/**
 * Why a member may not change a meetup's name or information (plan 8Z, item 1; the same on
 * Discord and on the map): `not-yours`, for anybody but its maker and staff (`mayEditMeetup`);
 * `blocked`, for a maker a moderator blocked from meetups. Undefined when they may. The block is
 * read only where it could decide (`MeetupSafety.blocked`: never for staff, nothing while the
 * safety is off).
 */
export async function meetupChangeRefusal(
  ctx: Pick<AppContext, 'meetupSafety'>,
  serverId: string,
  party: Pick<MeetupParty, 'createdById'>,
  memberId: string,
  staff: boolean,
): Promise<'not-yours' | 'blocked' | undefined> {
  if (!mayEditMeetup(party, memberId, staff)) return 'not-yours';
  return (await ctx.meetupSafety.blocked(serverId, memberId, staff)) ? 'blocked' : undefined;
}

/**
 * The guard of `/name` and `/info` in the post of a meetup, after the guard of the kind of post:
 * `meetupChangeRefusal`, read within a dialog's time (`/info` opens one, and `/name` answers at
 * once). A blocked maker is told with Appeal…. A train's `/name` is left as it is.
 */
export const requireMeetupChanger: Guard = async (interaction, ctx) => {
  const party = partyOf(interaction, ctx);
  if (!party || !isMeetup(party)) return;
  const serverId = guildIdOf(interaction);
  const refusal = await readInTime(ctx.log, interaction, () =>
    meetupChangeRefusal(ctx, serverId, party, interaction.user.id, isStaff(interaction, ctx)),
  );
  if (refusal === 'not-yours') throw new UserError(NOT_YOUR_MEETUP);
  if (refusal === 'blocked') {
    throw new UserError(BLOCKED_FROM_CHANGING, {
      answer: blockedAnswer(BLOCKED_FROM_CHANGING, serverId),
    });
  }
};
