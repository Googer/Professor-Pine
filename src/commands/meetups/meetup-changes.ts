import type { AppContext } from '../../app-context.js';
import type { Guard } from '../../discord/command.js';
import { readInTime } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, isStaff, partyOf } from '../../discord/guards.js';
import { mayEditMeetup } from '../../domain/party/meetup.js';
import { isMeetup, type MeetupParty } from '../../domain/party/party.js';
import { NOT_YOUR_MEETUP } from '../../render/activity.js';
import { blockedAnswer } from '../../render/meetup-safety.js';

export { MEETUP_NOT_YOURS } from '../../domain/web/meetup-data.js';
// What a member is told who is neither a meetup's maker nor staff.
export { NOT_YOUR_MEETUP };

/** What a member blocked from meetups in the server is told who made this one. */
export const BLOCKED_FROM_CHANGING =
  "You are blocked from meetups on this server, so you can't change this one.";

/**
 * Why a member may not change a meetup: its name or information (plan 8Z, item 1) or its start
 * or end (plan 8Z-2, M1); the same on Discord (the commands, Manage…) and on the map:
 * `not-yours`, for anybody but its maker and staff (`mayEditMeetup`, which the domain asks again
 * inside the store for the times, `timesRefusal`); `blocked`, for a maker a moderator blocked
 * from meetups. Undefined when they may. The block is read only where it could decide
 * (`MeetupSafety.blocked`: never for staff, nothing while the safety is off); being a read, it
 * is asked here, before the write, by every surface.
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
 * The guard of `/name`, `/info`, `/meet`, `/cancel-meet` and `/end` in the post of a meetup,
 * after the guard of the kind of post: `meetupChangeRefusal`, read within a dialog's time (`/info`
 * opens one, and the others answer at once). A blocked maker is told with Appeal…. In any other
 * post it passes: a train's `/name` and times are left as they are.
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
