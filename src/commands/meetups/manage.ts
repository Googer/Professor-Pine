import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard } from '../../discord/command.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { deferSubmit, withoutOpenToken } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, isStaff, requireGuild } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { mayEditMeetup } from '../../domain/party/meetup.js';
import { isMeetup, mayArrange, type MeetupParty } from '../../domain/party/party.js';
import { MEETUP_NOT_YOURS } from '../../domain/web/meetup-data.js';
import { manageWords } from '../../domain/web/raid-manage.js';
import { problemText } from '../../render/activity.js';
import {
  drawnMark,
  MEETUP_END_INPUT,
  MEETUP_INFO_INPUT,
  MEETUP_MANAGE_FORM,
  MEETUP_MANAGE_KIND,
  MEETUP_NAME_INPUT,
  MEETUP_START_INPUT,
  meetupManageDialog,
  oneLineEnding,
} from '../../render/manage-dialogs.js';
import { blockedAnswer } from '../../render/meetup-safety.js';
import { START_WINDOW } from '../parties/meet.js';
import { ACTION_THROTTLE, partyOver } from '../parties/reply.js';
import { setTimesAs, typedTimedTime, type TimedAnswer } from '../parties/timed.js';
import { changingMember } from '../raids/change.js';
import { refusedWithText } from './info.js';
import { BLOCKED_FROM_CHANGING } from './meetup-changes.js';
import {
  meetupChangeAs,
  meetupChangeCheck,
  meetupTimesCheck,
  type MeetupChangeInput,
  type MeetupChangeRefused,
} from './meetup-manage.js';

const A_MEETUP = { type: 'meetup' } as const;

/** What a Submit says of a meetup somebody changed since its dialog opened. */
export const MEETUP_CHANGED_MEANWHILE = 'This meetup changed meanwhile: press Manage… again.';

/**
 * Manage… of a meetup's post (plan 8M-21; `party:<id>:manage`): the map's editor as a dialog
 * (`meetupManageDialog`), for its maker and staff (`mayEditMeetup`, as the map shows its Manage…
 * only to them); anybody else is told privately what the map tells them (`MEETUP_NOT_YOURS`).
 */
export async function openMeetupManage(
  interaction: ButtonInteraction,
  ctx: AppContext,
  partyId: string,
): Promise<void> {
  const party = ctx.parties.get(partyId);
  if (!party) throw new UserError(partyOver(A_MEETUP));
  if (!isMeetup(party)) throw new UserError(STALE_COMPONENT);
  const userId = interaction.user.id;
  if (!mayEditMeetup(party, userId, isStaff(interaction, ctx))) {
    throw new UserError(MEETUP_NOT_YOURS);
  }
  await interaction.showModal(
    meetupManageDialog({ party, asksStart: mayArrange(party, userId), now: Date.now() }),
  );
}

/** A line of the Submit; undefined for one the dialog did not have (the start, unasked). */
function typedLine(interaction: ModalSubmitInteraction, id: string): string | undefined {
  return interaction.fields.fields.has(id) ? interaction.fields.getTextInputValue(id) : undefined;
}

/** The start typed in a Submit; '' for none. */
function typedStart(interaction: ModalSubmitInteraction): string {
  return (typedLine(interaction, MEETUP_START_INPUT) ?? '').trim();
}

/**
 * A Submit's start, refused before it counts, as `/meet`'s guard and the map refuse it: a member
 * who is not signed up, a text that is no time.
 */
const requireStartChange: Guard = (interaction, ctx) => {
  if (!interaction.isModalSubmit()) return;
  const typed = typedStart(interaction);
  const party = ctx.parties.get(decodeCustomId(interaction.customId)?.id ?? '');
  if (typed === '' || !party || !isMeetup(party)) return;
  if (!mayArrange(party, interaction.user.id)) {
    throw new UserError(problemText('not-attending', ctx.attendance.limits(), 'meetup'));
  }
  typedTimedTime(ctx, party, 'meet', typed, Date.now());
};

/** A turn of a Submit: one change, or both times at once (the map's `…/times`). */
type Turn =
  | { one: MeetupChangeInput }
  | {
      times: {
        start: { drawn: number | null; time: string };
        end: { drawn: number | null; time: string };
      };
    };

/**
 * What a Submit asks, as the map's editor sends it (`editorTyped`): a line that shows what the
 * meetup has is no change; one that shows what the dialog showed, which somebody changed since,
 * is none either (the member left it); any other line typed in is a change, drawn from what the
 * dialog showed, which is refused where the meetup is another by now. The times: what was typed,
 * both in one turn where both were. `stale` where a line typed in was drawn from what is gone.
 */
function askedTurns(
  interaction: ModalSubmitInteraction,
  party: MeetupParty,
  marks: readonly string[],
): { turns: Turn[]; stale: boolean; info?: string } {
  const [nameMark, infoMark, startMark, endMark] = marks;
  let stale = false;
  const turns: Turn[] = [];
  /** A line typed in: its text, and whether it was drawn from what the meetup is now. */
  const textLine = (
    id: string,
    now: string,
    mark: string | undefined,
  ): { typed: string; fits: boolean } | undefined => {
    const typed = typedLine(interaction, id);
    if (typed === undefined || oneLineEnding(typed) === oneLineEnding(now)) return undefined;
    if (drawnMark(now) === mark) return { typed, fits: true };
    // What the dialog showed, which somebody changed since: the member left it as it was.
    if (drawnMark(typed) === mark) return undefined;
    stale = true;
    return { typed, fits: false };
  };
  const name = textLine(MEETUP_NAME_INPUT, party.timed.name, nameMark);
  if (name?.fits) {
    turns.push({ one: { change: 'name', drawn: party.timed.name, name: name.typed.trim() } });
  }
  const info = textLine(MEETUP_INFO_INPUT, party.meetup.description ?? '', infoMark);
  if (info?.fits) {
    turns.push({ one: { change: 'info', drawn: party.meetup.description, info: info.typed } });
  }
  const timeLine = (id: string, now: number | null, mark: string | undefined) => {
    const typed = (typedLine(interaction, id) ?? '').trim();
    if (typed === '') return undefined;
    if (drawnMark(now) !== mark) {
      stale = true;
      return undefined;
    }
    return { drawn: now, time: typed };
  };
  const start = timeLine(MEETUP_START_INPUT, party.timed.startTime, startMark);
  const end = timeLine(MEETUP_END_INPUT, party.endTime, endMark);
  if (start && end) turns.push({ times: { start, end } });
  else if (start) turns.push({ one: { change: 'start', ...start } });
  else if (end) turns.push({ one: { change: 'end', ...end } });
  return { turns, stale, ...(info ? { info: info.typed } : {}) };
}

/**
 * Submit of a meetup's Manage… (`mmanage:<id>:form:<marks>:~…`): acknowledged privately, then what
 * was changed made as the map's editor makes it, one change after another (its name, its
 * information, then the times, both at once where both were typed): the same checks
 * (`meetupChangeCheck`, `meetupTimesCheck`) and the commands' paths (`meetupChangeAs`,
 * `setTimesAs`), answered in the commands' words, joined. A refusal stops there, after what went
 * through, and gives back the information typed where it did not go through.
 */
export async function submitMeetupManage(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  partyId: string,
  args: readonly string[],
): Promise<void> {
  const marks = withoutOpenToken(args);
  if (marks.length !== 4) throw new UserError(STALE_COMPONENT);
  await deferSubmit(interaction);
  const say = (content: string) => interaction.editReply({ content });
  const party = ctx.parties.get(partyId);
  if (!party) return void (await say(partyOver(A_MEETUP)));
  if (!isMeetup(party)) return void (await say(STALE_COMPONENT));
  const serverId = guildIdOf(interaction);
  const userId = interaction.user.id;
  const staff = isStaff(interaction, ctx);
  const member = changingMember(interaction);
  const { turns, stale, info } = askedTurns(interaction, party, marks);
  const said: string[] = [];
  let infoWent = false;
  const refused = (text: string) => {
    const words = manageWords([...said, text]);
    return say(info !== undefined && !infoWent ? refusedWithText(words, info) : words);
  };
  const refusalWords = (why: MeetupChangeRefused): string => {
    switch (why.reason) {
      case 'not-yours':
        return MEETUP_NOT_YOURS;
      case 'blocked':
        return BLOCKED_FROM_CHANGING;
      case 'changed-meanwhile':
        return MEETUP_CHANGED_MEANWHILE;
      case 'not-attending':
        return problemText('not-attending', ctx.attendance.limits(), 'meetup');
      case 'unread':
        return why.text;
    }
  };
  if (stale) return void (await refused(MEETUP_CHANGED_MEANWHILE));
  const now = Date.now();
  for (const turn of turns) {
    // Each on the meetup as the change before left it, as the map asks after each answer.
    const current = ctx.parties.get(partyId);
    if (!current || !isMeetup(current)) return void (await refused(partyOver(A_MEETUP)));
    let answer: TimedAnswer;
    try {
      if ('one' in turn) {
        const checked = await meetupChangeCheck(
          ctx,
          serverId,
          current,
          userId,
          staff,
          turn.one,
          now,
        );
        if ('refused' in checked) {
          if (checked.refused.reason === 'blocked' && said.length === 0) {
            throw new UserError(BLOCKED_FROM_CHANGING, {
              answer: blockedAnswer(BLOCKED_FROM_CHANGING, serverId),
            });
          }
          return void (await refused(refusalWords(checked.refused)));
        }
        answer = await meetupChangeAs(ctx, serverId, current, member, turn.one, checked.start, now);
      } else {
        const checked = meetupTimesCheck(ctx, current, userId, staff, turn.times, now);
        if ('refused' in checked) return void (await refused(refusalWords(checked.refused)));
        answer = await setTimesAs(ctx, current, member, checked.read, now, {
          start: turn.times.start.drawn,
          end: turn.times.end.drawn,
        });
      }
    } catch (err) {
      if (!(err instanceof UserError) || err.answer !== undefined) throw err;
      return void (await refused(err.message));
    }
    if (answer.kind !== 'ok') {
      const text =
        answer.kind === 'refused' && answer.reason === 'changed-meanwhile'
          ? MEETUP_CHANGED_MEANWHILE
          : answer.text;
      return void (await refused(text));
    }
    said.push(answer.text);
    if ('one' in turn && turn.one.change === 'info') infoWent = true;
  }
  await say(manageWords(said));
}

/**
 * The dialog of a meetup's Manage…: a Submit with a start counts in `/meet`'s window
 * (`START_WINDOW`), as telling of a start pings everybody; any other as the post's controls, as a
 * train's Manage… counts.
 */
export const meetupManageControls: ComponentHandler = {
  kind: MEETUP_MANAGE_KIND,
  guards: [requireGuild, requireStartChange],
  throttle: (interaction) =>
    interaction.isModalSubmit() && typedStart(interaction) !== '' ? START_WINDOW : ACTION_THROTTLE,
  async modal(interaction, id, ctx) {
    if (id.action !== MEETUP_MANAGE_FORM) throw new UserError(STALE_COMPONENT);
    await submitMeetupManage(interaction, ctx, id.id, id.args);
  },
};
