import {
  ACTION_THROTTLE,
  actingMember,
  answerClick,
  partyOver,
  pressStatus,
  remoteWords,
  type PressAnswerer,
} from '../commands/parties/reply.js';
import { changeTime, timesAlready } from '../commands/raids/change.js';
import { showScreenshot } from '../commands/screenshots/feedback.js';
import { submitPartyReport } from '../commands/parties/report.js';
import { openManage, openMove, submitManage, submitMove } from '../commands/trains/move.js';
import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
import { showWholeRoute } from '../commands/trains/route.js';
import { openSplit, submitSplit } from '../commands/trains/split.js';
import { MEET_WINDOW } from '../commands/parties/meet.js';
import { openMeet } from '../commands/parties/meet-dialog.js';
import type { ComponentHandler } from '../discord/command.js';
import { UserError } from '../discord/errors.js';
import { notARaid, requireGuild } from '../discord/guards.js';
import { STALE_COMPONENT } from '../discord/router.js';
import { isGroupId, isRaid } from '../domain/party/party.js';
import { raidStage } from '../domain/party/raid.js';
import { isPartyAction, PARTY_KIND, TIME_INPUT, timeForm } from '../render/party-controls.js';
import { MANAGE_FORM, MOVE_FORM } from '../render/train-dialogs.js';
import { SPLIT_FORM } from '../render/train-split.js';
import { GROUP_MENU_FORM, WHICH_GROUP_FORM } from '../render/group-dialogs.js';
import {
  asksWhichGroup,
  openGroupMenu,
  openWhichGroup,
  submitGroupMenu,
  submitWhichGroup,
} from '../commands/parties/group-dialogs.js';

/**
 * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
 * question, the "Set time…" button of a raid without times with the form it opens, and the
 * buttons "Move…" and "Manage…" of a train with the dialogs they open (plan 8X-G,
 * `commands/trains/move.ts`), "Route" of a train, which shows the route privately as
 * `/route show` does (`commands/trains/route.ts`), and "Split…" of a train with the dialog it
 * opens (`commands/trains/split.ts`).
 * The party is named by the custom id, not by the channel, so the same controls work on a copy of the
 * message in another channel. Every click is answered privately, a burst of clicks by one
 * member with one answer (`answerClick`); what it changed is said in the post by the attendance
 * service.
 *
 * The throttle is one budget for all of them: generous for somebody adjusting a head count,
 * tight for somebody leaning on a button. It also holds back an answer to the completion
 * question from a member who has just used it up.
 */
export const partyButtons: ComponentHandler = {
  kind: PARTY_KIND,
  guards: [requireGuild],
  throttle: ACTION_THROTTLE,
  // Meet… opens a dialog whose Submit counts in `/meet`'s window: refused while it is full.
  checks: (_interaction, id) => (id.action === 'meet' ? MEET_WINDOW : undefined),

  async button(interaction, id, ctx) {
    const { attendance } = ctx;
    const member = actingMember(interaction);
    const partyId = id.id;
    if (!isPartyAction(id.action)) throw new UserError(STALE_COMPONENT);
    // The buttons the live map has too go one way for both (`pressStatus`).
    const click: PressAnswerer<void> = (outcome, words) =>
      answerClick(interaction, ctx, partyId, outcome, words);
    switch (id.action) {
      case 'maybe':
      case 'join':
      case 'here': {
        // A newcomer to a post of several groups is asked which group (plan 8X-1B).
        const party = ctx.parties.get(partyId);
        if (asksWhichGroup(party, member.id)) {
          return openWhichGroup(interaction, ctx, party, id.action);
        }
        return pressStatus(attendance, partyId, member, { action: id.action }, click);
      }
      case 'done':
      case 'leave':
      case 'less':
      case 'more':
        // +1 and −1 go the map's way too (plan 8M-8B).
        return pressStatus(attendance, partyId, member, { action: id.action }, click);
      case 'remote':
        return answerClick(
          interaction,
          ctx,
          partyId,
          await attendance.setRemote(partyId, member, 'toggle'),
          remoteWords,
        );
      case 'group': {
        const [group] = id.args;
        if (group === undefined || !isGroupId(group)) throw new UserError(STALE_COMPONENT);
        return pressStatus(attendance, partyId, member, { action: 'group', group }, click);
      }
      case 'time': {
        const party = ctx.parties.get(partyId);
        // Only the post of a raid has this button.
        if (!party) throw new UserError(partyOver({ type: 'raid' }));
        if (!isRaid(party)) throw new UserError(notARaid(party));
        if (party.hatchTime !== null) throw new UserError(timesAlready(party));
        if (raidStage(party, Date.now()) === 'ended') throw new UserError(RAID_IS_OVER);
        await interaction.showModal(
          timeForm(partyId, raidStage(party, Date.now()) === 'egg' ? 'hatch' : 'end'),
        );
        return;
      }
      case 'shot': {
        // "Screenshot feedback": the screenshot the raid was reported from, privately.
        const party = ctx.parties.get(partyId);
        if (!party) throw new UserError(partyOver({ type: 'raid' }));
        const shown = isRaid(party) ? party.raid.screenshot?.id : undefined;
        if (!shown) throw new UserError(STALE_COMPONENT);
        return showScreenshot(interaction, ctx, shown);
      }
      case 'delete':
        // Only the form of `/delete` has this action.
        throw new UserError(STALE_COMPONENT);
      case 'move':
        // Move… of a train's post (plan 8X-G), and "Manage train…" of a post drawn before it.
        return openMove(interaction, ctx, partyId);
      case 'moveform':
        // Only Move…'s dialog has this action.
        throw new UserError(STALE_COMPONENT);
      case 'manage':
        // Manage… of a train's post (plan 8X-G): its route, mode and kind, in a dialog.
        return openManage(interaction, ctx, partyId);
      case 'manageform':
        // Only Manage…'s dialog has this action.
        throw new UserError(STALE_COMPONENT);
      case 'next':
      case 'previous':
      case 'skip':
      case 'finish':
      case 'reverse':
      case 'atend':
      case 'kind':
        // The controls of the Manage train panel before plan 8X-G (review R16): a panel still
        // open in a client is stale; Move… and Manage… took its place.
        throw new UserError(STALE_COMPONENT);
      case 'route':
        // "Route" of a train's post: the route privately, as `/route show` answers it.
        return showWholeRoute(interaction, ctx, partyId);
      case 'split':
        // "Split…" of a train's post: the dialog of the split (plans 8T, 8T-H).
        return openSplit(interaction, ctx, partyId);
      case 'splitform':
      case 'joinform':
        // Only those dialogs have these actions.
        throw new UserError(STALE_COMPONENT);
      case 'regroup':
        // "Group…" (plan 8X-1B): move to another group or open one, in a dialog.
        return openGroupMenu(interaction, ctx, partyId);
      case 'regroupform':
        // Only Group…'s dialog has this action.
        throw new UserError(STALE_COMPONENT);
      case 'meet':
        // "Meet…" (plan 8X-1B): the meeting time of the member's group, in a dialog.
        return openMeet(interaction, ctx, partyId);
      case 'answer': {
        const [answer] = id.args;
        if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
        const yes = answer === 'yes';
        return pressStatus(attendance, partyId, member, { action: 'answer', yes }, click);
      }
    }
  },

  /**
   * The post has no menu: those of the Manage train panel before plan 8X-G ("At the end of the
   * route", the kind) are stale.
   */
  select() {
    throw new UserError(STALE_COMPONENT);
  },

  /**
   * The "Set time" form: what was typed is the hatch or the end time, as the form asked. The
   * form of a member's `/delete` opened before it was for staff only (plan 8S-2) is a report.
   * The dialog of a split (plan 8T-H) splits the group off.
   */
  async modal(interaction, id, ctx) {
    if (id.action === 'delete') return submitPartyReport(interaction, ctx, id.id);
    if (id.action === SPLIT_FORM) return submitSplit(interaction, ctx, id.id, id.args);
    if (id.action === MOVE_FORM) return submitMove(interaction, ctx, id.id, id.args);
    if (id.action === MANAGE_FORM) return submitManage(interaction, ctx, id.id, id.args);
    if (id.action === GROUP_MENU_FORM) return submitGroupMenu(interaction, ctx, id.id, id.args);
    if (id.action === WHICH_GROUP_FORM) {
      return submitWhichGroup(interaction, ctx, id.id, id.args);
    }
    const [parameter] = id.args;
    if (id.action !== 'time' || (parameter !== 'hatch' && parameter !== 'end')) {
      throw new UserError(STALE_COMPONENT);
    }
    const party = ctx.parties.get(id.id);
    if (!party) throw new UserError(partyOver({ type: 'raid' }));
    if (!isRaid(party)) throw new UserError(notARaid(party));
    // Somebody else set the time while the form was open: theirs stands, corrections are
    // deliberate (`/hatch`, `/end`).
    if (party.hatchTime !== null) throw new UserError(timesAlready(party));
    const text = interaction.fields.getTextInputValue(TIME_INPUT);
    await changeTime(interaction, ctx, party, parameter, text);
  },
};
