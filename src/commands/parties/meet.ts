import { SlashCommandBuilder } from 'discord.js';
import {
  DATE_EXAMPLE,
  type ControlThrottle,
  type Guard,
  type SimpleCommand,
} from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { isStaff, notARaid, partyOf, requireParty } from '../../discord/guards.js';
import {
  groupOf,
  isMax,
  isRaid,
  isTimed,
  membersWhere,
  partyWord,
  type GroupId,
  type Party,
} from '../../domain/party/party.js';
import { timesRefusal } from '../../domain/party/timed.js';
import { problemText } from '../../render/activity.js';
import { groupWords } from '../../render/party-controls.js';
import { timestamp } from '../../render/text.js';
import { typedPartyTime } from '../raids/raid-input.js';
import { typedMaxTime } from '../max/max-input.js';
import { requireMeetupChanger } from '../meetups/meetup-changes.js';
import { variedThrottleKey } from '../../discord/router.js';
import type { Throttle } from '../../discord/throttle.js';
import { actingMember, answerOutcome, commandParty } from './reply.js';
import { changeStart, START_THROTTLE, typedTimedTime } from './timed.js';

/**
 * Tighter than the other attendance commands: every change of a meeting time is a message that
 * pings the group.
 */
export const MEET_THROTTLE: Throttle = { uses: 3, perSeconds: 60 };

/**
 * The window `/meet` counts its uses in a raid (its throttle varies with the party:
 * `variedThrottleKey`), which Meet…'s dialog counts in too (plan 8X-1B): one budget for both.
 */
export const MEET_WINDOW: ControlThrottle = {
  ...MEET_THROTTLE,
  as: variedThrottleKey('meet', MEET_THROTTLE),
};

/**
 * The window `/meet` counts its uses in a timed party, which a start set in a train's Manage…
 * counts in too: telling of a start pings everybody.
 */
export const START_WINDOW: ControlThrottle = {
  ...START_THROTTLE,
  as: variedThrottleKey('meet', START_THROTTLE),
};

/**
 * The limit of `/meet` and `/cancel-meet` where they are used: in a timed party the start is
 * for everybody, and telling of it pings everybody (`START_THROTTLE`, as for a shout).
 */
const meetThrottle: NonNullable<SimpleCommand['throttle']> = (interaction, ctx) => {
  const party = partyOf(interaction, ctx);
  return party && isTimed(party) ? START_THROTTLE : MEET_THROTTLE;
};

/**
 * For `/meet` and `/cancel-meet` in a timed party: what can be known before the start is
 * changed is refused here, so that a use that changed nothing does not count towards the three
 * a member has in three minutes: who may not (`timesRefusal`: of a train a member who is not
 * signed up and did not make it; a meetup's start is its maker's and staff's, which
 * `requireMeetupChanger` has said before this guard, with the block), a text that is no time, a
 * time the party cannot have. The handler reads the time again, and the service decides again.
 */
const requireStartChange: Guard = (interaction, ctx) => {
  const party = partyOf(interaction, ctx);
  if (!party || !isTimed(party) || !interaction.isChatInputCommand()) return;
  const asker = { id: interaction.user.id, staff: isStaff(interaction, ctx) };
  const refusal = timesRefusal(party, asker, 'start');
  if (refusal) {
    throw new UserError(problemText(refusal.reason, ctx.attendance.limits(), partyWord(party)));
  }
  const text = interaction.options.getString('time');
  if (text !== null) typedTimedTime(ctx, party, 'meet', text, Date.now());
};

/**
 * `/meet`. In a raid it is the meeting time of the member's group. A train or a meetup starts
 * for everybody at once: there it sets the start of the party (`changeStart`).
 */
export const meet: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('meet')
    .setDescription(
      'Set when your group meets for this raid or max battle, or when this train or meetup starts',
    )
    .addStringOption((option) =>
      option
        .setName('time')
        .setDescription(
          'Raid: 20 (minutes), 6:15pm, "hatch"; max battle: 20, 6:15pm. Train, meetup: 6:15pm, in 30',
        )
        .setRequired(true)
        .setMaxLength(40),
    ),
  help: {
    category: 'basic-raid',
    alsoIn: ['train', 'meetup'],
    details:
      'In the post of a raid: sets when the group you are in meets, and tells the others of ' +
      'the group. The time lies between now (or the hatch) and the end of the raid: minutes ' +
      'from now (`20`), a clock time, or `hatch`; `cancel` removes it. A while after it, those ' +
      'who are here are asked whether they are done.\n\nIn the post of a max battle: the same, ' +
      'up to the end of the battle (there is no `hatch`).\n\nOn the post, the button with the ' +
      "game's Select Time icon offers the times to pick from: the game's own RSVP times for a " +
      'raid, every five minutes of the next hour for a max battle.\n\nIn the post of a train ' +
      'or meetup: sets when it starts, for everybody, and tells the others who are signed up. ' +
      'Give a clock time (`noon` and `midnight` too), a date and a time, or `in 30` for ' +
      'minutes from now (a number alone, such as `7`, is a clock hour); `cancel` removes the ' +
      'start.\n\nA time without a date is on the day it starts, or else the day it ends, ' +
      'while that day is still to come, and otherwise today; `tomorrow 6pm` is tomorrow. A ' +
      `date comes first, month-day (\`${DATE_EXAMPLE} 6pm\`).\n\n` +
      'You must be signed up for a raid, max battle or train. Only its maker or a moderator ' +
      'can set when a meetup starts.',
    examples: ['/meet time:6:15pm', '/meet time:hatch', `/meet time:${DATE_EXAMPLE} 6:15pm`],
  },
  guards: [requireParty, requireMeetupChanger, requireStartChange],
  throttle: meetThrottle,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const text = interaction.options.getString('time', true);
    if (isTimed(party)) {
      const start = typedTimedTime(ctx, party, 'meet', text, Date.now());
      await changeStart(interaction, ctx, party, start === 'unset' ? null : start.at);
      return;
    }
    // A max battle's meeting time lies between now and its end (plan 8X-3).
    const typed = isMax(party)
      ? typedMaxTime(ctx, 'meet', text, Date.now(), party)
      : isRaid(party)
        ? typedPartyTime(ctx, party, 'meet', text, Date.now())
        : undefined;
    if (typed === undefined) throw new UserError(notARaid(party));
    const outcome = await ctx.attendance.setMeetingTime(
      party.id,
      actingMember(interaction),
      typed === 'unset' ? null : typed.at,
    );
    await answerOutcome(interaction, ctx, party, outcome, (ok) =>
      meetingWords(ok, interaction.user.id),
    );
  },
};

/**
 * What a member is told of the meeting time of their group they set or removed, by `/meet` and by
 * Meet…'s dialog alike (plan 8X-1B): the time, and that the others were told.
 */
export function meetingWords(
  ok: { party: Party; group: GroupId; acted: boolean },
  memberId: string,
): string {
  const group = groupOf(ok.party, ok.group);
  const whose = ok.party.groups.length > 1 ? groupWords(group ?? { id: ok.group }) : 'your group';
  if (group?.startTime === undefined) {
    return ok.acted ? `The meeting time of ${whose} is canceled.` : 'There was no meeting time.';
  }
  const when = `${timestamp(group.startTime)} (${timestamp(group.startTime, 'R')})`;
  const others = membersWhere(ok.party, (attendee) => attendee.group === ok.group).some(
    (id) => id !== memberId,
  );
  return ok.acted
    ? `The meeting time of ${whose} is ${when}.${others ? ' I have told the others.' : ''}`
    : `The meeting time of ${whose} was ${when} already.`;
}

export const cancelMeet: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('cancel-meet')
    .setDescription(
      'Remove the meeting time of your group, or the start time of this train or meetup',
    ),
  help: {
    category: 'basic-raid',
    alsoIn: ['train', 'meetup'],
    details:
      'In the post of a raid or a max battle: removes the meeting time of the group you are in ' +
      'and tells the others. In the post of a train or meetup: removes its start time.\n\n' +
      'You must be signed up for a raid, max battle or train. Only its maker or a moderator ' +
      "can remove a meetup's start time.",
  },
  guards: [requireParty, requireMeetupChanger, requireStartChange],
  throttle: meetThrottle,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    if (isTimed(party)) {
      await changeStart(interaction, ctx, party, null);
      return;
    }
    const outcome = await ctx.attendance.setMeetingTime(party.id, actingMember(interaction), null);
    await answerOutcome(interaction, ctx, party, outcome, (ok) =>
      ok.acted ? 'The meeting time is canceled.' : 'There was no meeting time.',
    );
  },
};
