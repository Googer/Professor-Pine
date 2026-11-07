import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler } from '../../discord/command.js';
import { deferSubmit, withoutOpenToken } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { requireGuild } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import type { AttendanceLimits } from '../../domain/party/attendance.js';
import { meetTimes } from '../../domain/party/meet-times.js';
import { maxEnded } from '../../domain/party/max.js';
import {
  attendeeOf,
  isBattle,
  isGroupId,
  isRaid,
  partyWord,
  type BattleParty,
  type Party,
} from '../../domain/party/party.js';
import { raidStage } from '../../domain/party/raid.js';
import { problemText } from '../../render/activity.js';
import {
  MEET_FORM,
  MEET_INPUT,
  MEET_KIND,
  meetDialog,
  NO_MEETING,
} from '../../render/meet-dialog.js';
import { meetIcon } from '../../render/party-controls.js';
import { RAID_IS_OVER } from '../raids/raid-input.js';
import { MEET_WINDOW, meetingWords } from './meet.js';
import { actingMember, outcomeWords, partyOver } from './reply.js';

/*
 * Meet… of a raid's post on Discord (plan 8X-1B, decision 5): the button `party:<id>:meet` opens
 * the dialog of the meeting time of the member's own group (`meetDialog`); its Submit,
 * `meet:<id>:time:<group>:<stamp>[:~<token>]`, sets it as `/meet` does (`AttendanceService.setMeetingTime`).
 * The press counts as one of the post's (`ACTION_THROTTLE`), and is refused while `/meet`'s
 * window is full (`MEET_WINDOW`, the party controls' `checks`); the Submit counts in that window,
 * so `/meet` and Meet… draw on one budget.
 */

/** Said at a press for a raid without times (Set time shows in Meet…'s place then). */
export const NO_TIMES = 'This raid has no times yet: press "Set time…" to give them.';

/** Said when no time to meet is left before the raid (or max battle) ends. */
export const NO_TIME_LEFT = 'There is no time left to meet before this raid ends.';

/** The same of a max battle (plan 8X-3). */
export const NO_TIME_LEFT_MAX = 'There is no time left to meet before this max battle ends.';

/**
 * Why this member may not set a meeting time of this party now (the rules of `/meet`), or the
 * raid: a party that ended (as a raid's), one that is no raid, a member not signed up, a raid
 * without times or that is over, one with no time to meet left. Meet…'s press and Submit on
 * Discord and its form on the map (plan 8M-8B) decide by it.
 */
export function meetRefusalOf(
  limits: AttendanceLimits,
  party: Party | undefined,
  memberId: string,
  now: number,
): string | BattleParty {
  // Gone, it may have been a raid or a max battle: spoken of without a kind (review B6).
  if (!party) return partyOver();
  // A raid's, and a max battle's (plan 8X-3; design Q10): every battle has Meet….
  if (!isBattle(party)) return STALE_COMPONENT;
  if (!attendeeOf(party, memberId)) {
    return problemText('not-attending', limits, partyWord(party));
  }
  if (!isRaid(party)) {
    if (maxEnded(party, now)) return partyOver(party);
    return meetTimes(party, now).length === 0 ? NO_TIME_LEFT_MAX : party;
  }
  if (party.hatchTime === null) return NO_TIMES;
  if (raidStage(party, now) === 'ended') return RAID_IS_OVER;
  if (meetTimes(party, now).length === 0) return NO_TIME_LEFT;
  return party;
}

/**
 * Meet… of a raid's post: the dialog of the meeting time of the member's own group; refused
 * privately before it opens (8S-3's rule) as `refusalOf` says.
 */
export async function openMeet(
  interaction: ButtonInteraction,
  ctx: AppContext,
  partyId: string,
): Promise<void> {
  const now = Date.now();
  const party = meetRefusalOf(
    ctx.attendance.limits(),
    ctx.parties.get(partyId),
    interaction.user.id,
    now,
  );
  if (typeof party === 'string') throw new UserError(party);
  const groupId = attendeeOf(party, interaction.user.id)?.group ?? party.defaultGroupId;
  await interaction.showModal(
    meetDialog({ party, groupId, zone: ctx.config.settings.timezone, now }),
  );
}

/** The time a Submit chose: a moment, null for "No meeting time"; undefined for none of either. */
function chosenTime(interaction: ModalSubmitInteraction): number | null | undefined {
  if (!interaction.fields.fields.has(MEET_INPUT)) return undefined;
  const [value] = interaction.fields.getStringSelectValues(MEET_INPUT);
  if (value === NO_MEETING) return null;
  const time = Number(value);
  return Number.isInteger(time) ? time : undefined;
}

/**
 * What a Submit of Meet…'s dialog, or the map's form (plan 8M-8B), is told for a refusal decided
 * inside the store; `meet` names Meet… as the member sees it (on Discord by its icon, `meetIcon`,
 * as the post's hints name it; on the map in words). The group the form was drawn for (`group`)
 * changed since: said in the shape of Group…'s (plan 8M-11A, S21), "Group B has changed since:
 * press Meet… again.", and the map's form closes on it.
 */
export function meetSubmitRefusal(reason: string, meet: string, group: string): string | undefined {
  if (reason === 'group-changed') return `Group ${group} has changed since: press ${meet} again.`;
  if (reason !== 'meeting-time-gone') return undefined;
  return `That time is no longer offered: press ${meet} again.`;
}

/**
 * Submit of Meet…'s dialog: acknowledged privately, the checks of the press made again, then set
 * or removed as `/meet` does, in its words (`meetingWords`), decided inside the store for the
 * group the dialog was drawn for (`setMeetingTime` with `drawn`: the member still in that group
 * by its stamp, the time one Meet… offers now), so a move queued before it is seen.
 */
async function submitMeet(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  partyId: string,
  args: readonly string[],
): Promise<void> {
  const [groupId, stamp] = withoutOpenToken(args);
  const time = chosenTime(interaction);
  if (groupId === undefined || !isGroupId(groupId) || stamp === undefined || time === undefined) {
    throw new UserError(STALE_COMPONENT);
  }
  await deferSubmit(interaction);
  const now = Date.now();
  const member = actingMember(interaction);
  const limits = ctx.attendance.limits();
  const party = meetRefusalOf(limits, ctx.parties.get(partyId), member.id, now);
  const say = (content: string) => interaction.editReply({ content });
  if (typeof party === 'string') return void (await say(party));
  const outcome = await ctx.attendance.setMeetingTime(partyId, member, time, {
    group: groupId,
    stamp,
  });
  // Meet… by its icon (the application's, else the plain one), as the post's hints name it.
  const icon = meetIcon({ controlIcon: (name) => ctx.emoji.find(name, null) });
  const refusal =
    outcome.kind === 'refused' ? meetSubmitRefusal(outcome.reason, icon, groupId) : undefined;
  await say(
    refusal ?? outcomeWords(limits, party, outcome, (ok) => meetingWords(ok, member.id)).text,
  );
}

/**
 * The dialog of Meet… (`meet:<party id>:time:<group>:<stamp>[:~<token>]`): a kind of its own, so that its
 * Submit counts in `/meet`'s window (`MEET_WINDOW`; "You can use /meet again in …").
 */
export const meetControls: ComponentHandler = {
  kind: MEET_KIND,
  guards: [requireGuild],
  throttle: MEET_WINDOW,
  async modal(interaction, id, ctx) {
    if (id.action !== MEET_FORM) throw new UserError(STALE_COMPONENT);
    await submitMeet(interaction, ctx, id.id, id.args);
  },
};
