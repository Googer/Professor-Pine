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
import { partyOver } from '../parties/reply.js';
import { readTimes, setTimesAs, typedTimedTime, type TimedAnswer } from '../parties/timed.js';
import { countTimes, countUse, meetupChangeWindow } from '../parties/windows.js';
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
    meetupManageDialog({
      party,
      asksStart: mayArrange(party, userId),
      now: Date.now(),
      zone: ctx.config.settings.timezone,
    }),
  );
}

/** A line of the Submit; undefined for one the dialog did not have (the start, unasked). */
function typedLine(interaction: ModalSubmitInteraction, id: string): string | undefined {
  return interaction.fields.fields.has(id) ? interaction.fields.getTextInputValue(id) : undefined;
}

/** A line of the Submit, trimmed; '' for none. */
function typedTime(interaction: ModalSubmitInteraction, id: string): string {
  return (typedLine(interaction, id) ?? '').trim();
}

/**
 * A Submit's times, refused before anything counts, as `/meet`'s guard and the map refuse them: a
 * start of a member who is not signed up or that is no time; both at once read together
 * (`readTimes`, review M2: unreadable or out of order), as the map's `…/times` reads them. An end
 * alone is read as `/end` reads it, after it counted, as on the map.
 */
const requireTimesChange: Guard = (interaction, ctx) => {
  if (!interaction.isModalSubmit()) return;
  const start = typedTime(interaction, MEETUP_START_INPUT);
  const end = typedTime(interaction, MEETUP_END_INPUT);
  const party = ctx.parties.get(decodeCustomId(interaction.customId)?.id ?? '');
  if (start === '' || !party || !isMeetup(party)) return;
  if (!mayArrange(party, interaction.user.id)) {
    throw new UserError(problemText('not-attending', ctx.attendance.limits(), 'meetup'));
  }
  if (end === '') typedTimedTime(ctx, party, 'meet', start, Date.now());
  else readTimes(ctx, party, { start, end }, Date.now());
};

/** Both times typed, each with the value it was drawn from. */
interface TimesTurn {
  start: { drawn: number | null; time: string };
  end: { drawn: number | null; time: string };
}

/**
 * A turn of a Submit: one change, or both times at once (the map's `…/times`); `stale` where a line
 * of it was drawn from what the meetup no longer is, refused at its turn (review M6), as the map
 * refuses that change and keeps what went through before it.
 */
type Turn = ({ one: MeetupChangeInput } | { times: TimesTurn }) & { stale: boolean };

/**
 * What a Submit asks, as the map's editor sends it (`editorTyped`): a line that shows what the
 * meetup has is no change; one that shows what the dialog showed, which somebody changed since,
 * is none either (the member left it); any other line typed in is a change, drawn from what the
 * dialog showed (`stale` where the meetup is another by now). The times: what was typed, both in
 * one turn where both were.
 */
function askedTurns(
  interaction: ModalSubmitInteraction,
  party: MeetupParty,
  marks: readonly string[],
): { turns: Turn[]; info?: string } {
  const [nameMark, infoMark, startMark, endMark] = marks;
  const turns: Turn[] = [];
  /** A line typed in: its text, and whether it was drawn from what the meetup is now. */
  const textLine = (
    id: string,
    now: string,
    mark: string | undefined,
  ): { typed: string; stale: boolean } | undefined => {
    const typed = typedLine(interaction, id);
    if (typed === undefined || oneLineEnding(typed) === oneLineEnding(now)) return undefined;
    if (drawnMark(now) === mark) return { typed, stale: false };
    // What the dialog showed, which somebody changed since: the member left it as it was.
    if (drawnMark(typed) === mark) return undefined;
    return { typed, stale: true };
  };
  const name = textLine(MEETUP_NAME_INPUT, party.timed.name, nameMark);
  if (name) {
    turns.push({
      one: { change: 'name', drawn: party.timed.name, name: name.typed.trim() },
      stale: name.stale,
    });
  }
  const info = textLine(MEETUP_INFO_INPUT, party.meetup.description ?? '', infoMark);
  if (info) {
    turns.push({
      one: { change: 'info', drawn: party.meetup.description, info: info.typed },
      stale: info.stale,
    });
  }
  const timeLine = (id: string, now: number | null, mark: string | undefined) => {
    const typed = typedTime(interaction, id);
    return typed === '' ? undefined : { drawn: now, time: typed, stale: drawnMark(now) !== mark };
  };
  const start = timeLine(MEETUP_START_INPUT, party.timed.startTime, startMark);
  const end = timeLine(MEETUP_END_INPUT, party.endTime, endMark);
  if (start && end) {
    turns.push({
      times: {
        start: { drawn: start.drawn, time: start.time },
        end: { drawn: end.drawn, time: end.time },
      },
      stale: start.stale || end.stale,
    });
  } else if (start) {
    turns.push({
      one: { change: 'start', drawn: start.drawn, time: start.time },
      stale: start.stale,
    });
  } else if (end) {
    turns.push({ one: { change: 'end', drawn: end.drawn, time: end.time }, stale: end.stale });
  }
  return { turns, ...(info ? { info: info.typed } : {}) };
}

/**
 * Submit of a meetup's Manage… (`mmanage:<id>:form:<marks>:~…`): acknowledged privately, then what
 * was changed made as the map's editor makes it, one change after another (its name, its
 * information, then the times, both at once where both were typed): the same checks before
 * anything counts (`meetupChangeCheck`, `meetupTimesCheck`), each change counted in its command's
 * window as the map's routes count it (`meetupChangeWindow`, `countTimes`; review M1: a full one
 * stops there in the command's words, times that came to nothing are given back, as is a use
 * whose work failed for no fault of the member), and the commands' paths (`meetupChangeAs`,
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
  const { turns, info } = askedTurns(interaction, party, marks);
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
  const now = Date.now();
  for (const turn of turns) {
    if (turn.stale) return void (await refused(MEETUP_CHANGED_MEANWHILE));
    // Each on the meetup as the change before left it, as the map asks after each answer.
    const current = ctx.parties.get(partyId);
    if (!current || !isMeetup(current)) return void (await refused(partyOver(A_MEETUP)));
    let answer: TimedAnswer;
    if ('one' in turn) {
      const checked = await meetupChangeCheck(ctx, serverId, current, userId, staff, turn.one, now);
      if ('refused' in checked) {
        if (checked.refused.reason === 'blocked' && said.length === 0) {
          throw new UserError(BLOCKED_FROM_CHANGING, {
            answer: blockedAnswer(BLOCKED_FROM_CHANGING, serverId),
          });
        }
        return void (await refused(refusalWords(checked.refused)));
      }
      const window = meetupChangeWindow(turn.one.change);
      const counted = countUse(ctx.throttles, window, userId, Date.now());
      if ('refusal' in counted) return void (await refused(counted.refusal));
      try {
        answer = await meetupChangeAs(ctx, serverId, current, member, turn.one, checked.start, now);
      } catch (err) {
        if (!(err instanceof UserError) || err.givesBack) counted.giveBack(Date.now());
        if (!(err instanceof UserError)) throw err;
        // `/end`'s reader, after its use counted, as on the map.
        return void (await refused(err.message));
      }
    } else {
      const checked = meetupTimesCheck(ctx, current, userId, staff, turn.times, now);
      if ('refused' in checked) return void (await refused(refusalWords(checked.refused)));
      const counted = countTimes(ctx.throttles, userId, checked.read, Date.now());
      if ('refusal' in counted) return void (await refused(counted.refusal));
      try {
        answer = await setTimesAs(ctx, current, member, checked.read, now, {
          start: turn.times.start.drawn,
          end: turn.times.end.drawn,
        });
      } catch (err) {
        // As the map's: any failure of both times gives their uses back.
        counted.givenBack(Date.now());
        if (!(err instanceof UserError)) throw err;
        return void (await refused(err.message));
      }
      // Times that came to nothing do not count (the map's `givenBack`).
      if (answer.kind === 'refused') counted.givenBack(Date.now(), answer.went);
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
 * The dialog of a meetup's Manage…: counted by no window of its own (review M1): each change it
 * makes counts in its command's window, as the map's routes count it (`submitMeetupManage`). Its
 * times are checked before anything counts (`requireTimesChange`).
 */
export const meetupManageControls: ComponentHandler = {
  kind: MEETUP_MANAGE_KIND,
  guards: [requireGuild, requireTimesChange],
  throttle: () => undefined,
  async modal(interaction, id, ctx) {
    if (id.action !== MEETUP_MANAGE_FORM) throw new UserError(STALE_COMPONENT);
    await submitMeetupManage(interaction, ctx, id.id, id.args);
  },
};
