import {
  MessageFlags,
  SlashCommandBuilder,
  type APIModalInteractionResponseCallbackData,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { deferSubmit, pickedOf, selectedOf, withoutOpenToken } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { isStaff, requireGuild, requireTrain } from '../../discord/guards.js';
import { isRefusedBody } from '../../discord/party-gateway.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import {
  isTrain,
  mayArrange,
  TRAIN_AT_END,
  TRAIN_KINDS,
  type TrainAtEnd,
  type TrainKind,
  type TrainParty,
} from '../../domain/party/party.js';
import { whereOf, type TrainMove } from '../../domain/party/train.js';
import {
  AT_END_CODES,
  isDialogMove,
  KIND_CODES,
  MANAGE_AT_END_INPUT,
  MANAGE_KIND_INPUT,
  MANAGE_FORM,
  MANAGE_KIND,
  MANAGE_ROUTE_INPUT,
  MANAGE_END_INPUT,
  MANAGE_START_INPUT,
  manageDialog,
  MOVE_INPUT,
  moveDialog,
  NO_FIRST,
  ROUTE_CHOICES,
  type DialogMove,
} from '../../render/train-dialogs.js';
import { ACTION_THROTTLE, actingMember, commandTrain, partyOver } from '../parties/reply.js';
import { CHANGE_THROTTLE } from '../raids/change.js';
import { readTimes, type TimesRead } from '../parties/timed.js';
import { countControl, countTimes } from '../parties/windows.js';
import { PARTY_KIND, type ControlIcons } from '../../render/party-controls.js';
import {
  manageRefusal,
  manageTrainAs,
  trainRefusal,
  movedOn,
  movedOnWords,
  MOVED_BEFORE,
  moveTrainAs,
  trainPlaces,
  type ManagePicked,
  type ManageShown,
  type TrainAnswer,
} from './train-changes.js';

const A_TRAIN = { type: 'train' } as const;

/**
 * `/next`, `/previous`, `/skip` and `/finish`: moves the train of this post along its route and
 * tells the member where it is now. The others are told a moment later, in the post
 * (`TrainService.move`). With a conductor, only they and the staff may; without one, anybody who
 * is signed up.
 */
async function moveByCommand(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  move: TrainMove,
): Promise<void> {
  const party = commandTrain(interaction, ctx);
  // From where the train was when the command came: a second `/previous` that came while the
  // first was on its way does not move it again (follow-ups, From Phase 3C).
  const answer = await moveTrainAs(
    ctx,
    party,
    actingMember(interaction),
    move,
    isStaff(interaction, ctx),
    'command',
    undefined,
    undefined,
    whereOf(party),
  );
  if (answer.kind === 'refused' && movedOn(answer.reason)) {
    // Nothing was changed, and nothing the member did wrong: the use is given back.
    throw new UserError(
      movedOnWords(ctx, party.id, answer.reason, answer.text, 'command', MOVED_BEFORE),
      { givesBack: true },
    );
  }
  if (answer.kind !== 'ok') throw new UserError(answer.text);
  await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
}

/**
 * One of the four commands that move a train. `details` says what the move is; `here` says what
 * becomes of who was here and what the others are told, where that is not the rule of the
 * others. The help names the post's button that does the same (plan 8X-G: Move…, and Manage…
 * for Finish).
 */
function moveCommand(
  name: string,
  move: TrainMove,
  description: string,
  details: string,
  here = 'Everybody who was here is coming again (unless this finishes the route: then they ' +
    'stay here), and the others are told where the train is going, or that the route is finished',
): SimpleCommand {
  const button =
    move === 'finish'
      ? 'The same as "Finish it here" in the dialog of the button "Manage…" on the post, which ' +
        'also reverses the route and sets what the train does at its end and what it is ' +
        'mainly for.'
      : 'The same as the button "Move…" on the post; the button "Manage…" also reverses the ' +
        'route, finishes it and sets what the train does at its end.';
  return {
    data: new SlashCommandBuilder().setName(name).setDescription(description),
    help: {
      category: 'train',
      details:
        `${details}\n\n${here}, with a ping for those who allow it.\n\nWhile the train has a ` +
        'conductor, only they and the moderators can move it; otherwise anybody who is signed ' +
        `up can.\n\n${button} Use it in the post of the train.`,
      examples: [`/${name}`],
    },
    guards: [requireTrain],
    throttle: CHANGE_THROTTLE,
    execute: (interaction, ctx) => moveByCommand(interaction, ctx, move),
  };
}

export const next = moveCommand(
  'next',
  'next',
  'Move this train to its next stop',
  'Takes the train to the next stop of its route. From the last stop it finishes the route, ' +
    'or, as the train is set (`/train at-end`, or Manage… on the post), goes around to the ' +
    'first stop or turns back and runs the route backwards.',
);

export const previous = moveCommand(
  'previous',
  'previous',
  'Move this train back to the stop before',
  'Takes the train one stop back; a train that loops goes from its first stop to its last. ' +
    'From the end of its route it goes back to the stop it was at when the route was ' +
    'finished, which takes a mistaken `/finish` back.',
  'Who was here is coming again, or stays here when a `/finish` is taken back, and the ' +
    'others are told where the train is going',
);

export const skip = moveCommand(
  'skip',
  'skip',
  'Move this train past its next stop, to the one after it',
  'Leaves the next stop out and takes the train to the one after it, also round the end of ' +
    'a route that loops and back along one that turns back.',
);

export const finish = moveCommand(
  'finish',
  'finish',
  'Say that this train has finished its route',
  'Marks the route as finished, whatever the train does at the end of it otherwise. The ' +
    'train itself goes on until its end time: finishing the route does not close its post. ' +
    '`/previous` takes a mistaken finish back.',
  'Who was here stays here (there is no next stop to come to), and the others are told that ' +
    'the route is finished',
);

/** The train of a press, for who may move it (also staff), refused privately otherwise. */
function movableTrain(
  interaction: ButtonInteraction,
  ctx: AppContext,
  partyId: string,
): TrainParty {
  const party = ctx.parties.get(partyId);
  if (!party) throw new UserError(partyOver(A_TRAIN));
  if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
  const refused = manageRefusal(ctx, party, interaction.user.id, isStaff(interaction, ctx));
  if (refused !== undefined) throw new UserError(refused);
  return party;
}

/** The application's own emoji (`ctx.emoji` with no server), for the kinds of Manage…'s menu. */
function appIcons(ctx: AppContext): ControlIcons {
  return { controlIcon: (name) => ctx.emoji.find(name, null) };
}

/**
 * Opens a train's dialog made by `dialogWith` with the application's emoji; where Discord refuses
 * it (Invalid Form Body: an emoji deleted since they were read), once more without them, the
 * emoji read anew (`EmojiFinder.refused`), as `/rank` does. The press is still unanswered then.
 */
async function showTrainDialog(
  interaction: ButtonInteraction,
  ctx: AppContext,
  dialogWith: (icons: ControlIcons) => APIModalInteractionResponseCallbackData,
): Promise<void> {
  const withIcons = dialogWith(appIcons(ctx));
  const plain = dialogWith({});
  try {
    await interaction.showModal(withIcons);
  } catch (err) {
    if (!isRefusedBody(err) || JSON.stringify(withIcons) === JSON.stringify(plain)) throw err;
    ctx.emoji.refused?.();
    ctx.log.warn({ err }, 'Discord refused an emoji of a train’s dialog; it opens without');
    await interaction.showModal(plain);
  }
}

/**
 * Move… of a train's post (plan 8X-G; `party:<id>:move`, also the button "Manage train…" of a
 * post not drawn anew since): for who may move the train (`mayNotMove`, refused privately before
 * it opens), the dialog of the moves that can be made from where it is (`moveDialog`). A train
 * without a route has nothing to move along: the old button opens Manage… there (review R15).
 */
export async function openMove(
  interaction: ButtonInteraction,
  ctx: AppContext,
  partyId: string,
): Promise<void> {
  const party = movableTrain(interaction, ctx, partyId);
  const now = Date.now();
  await showTrainDialog(interaction, ctx, (icons) => {
    const view = { ...trainPlaces(ctx, party), now, icons };
    return party.train.route.length === 0
      ? manageDialog(view, timesAsked(ctx, party, interaction.user.id))
      : moveDialog(view);
  });
}

/**
 * Whether Manage… asks the member the train's start and end (`/meet`'s and `/end`'s, as the map's
 * form asks them of who may arrange the train), in the posts' zone.
 */
function timesAsked(
  ctx: AppContext,
  party: TrainParty,
  memberId: string,
): { zone: string } | undefined {
  return mayArrange(party, memberId) ? { zone: ctx.config.settings.timezone } : undefined;
}

/**
 * Manage… of a train's post (plan 8X-G; `party:<id>:manage`): for who may move the train and
 * staff, the dialog of its route, its mode at the end and its kind (`manageDialog`).
 */
export async function openManage(
  interaction: ButtonInteraction,
  ctx: AppContext,
  partyId: string,
): Promise<void> {
  const party = movableTrain(interaction, ctx, partyId);
  const now = Date.now();
  await showTrainDialog(interaction, ctx, (icons) =>
    manageDialog(
      { ...trainPlaces(ctx, party), now, icons },
      timesAsked(ctx, party, interaction.user.id),
    ),
  );
}

/**
 * The move a Submit of Move… asks for and where it leads: the dialog's id carries them where it
 * had one move left, else the radio choice does (`<move>:<target>`). Undefined for anything
 * else (a dialog of another shape, a forged one).
 */
function askedMove(
  interaction: ModalSubmitInteraction,
  args: readonly string[],
): { from: string; move: DialogMove; target: string } | undefined {
  const [from, fixed, fixedTarget] = withoutOpenToken(args);
  if (from === undefined) return undefined;
  if (fixed !== undefined) {
    return isDialogMove(fixed) && fixedTarget !== undefined
      ? { from, move: fixed, target: fixedTarget }
      : undefined;
  }
  if (!interaction.fields.fields.has(MOVE_INPUT)) return undefined;
  const [move, target] = (interaction.fields.getRadioGroup(MOVE_INPUT) ?? '').split(':');
  return isDialogMove(move) && target !== undefined ? { from, move, target } : undefined;
}

/**
 * Submit of Move… (`party:<id>:moveform:…`): acknowledged privately, then the move made as
 * `/next` and the others make it (`moveTrainAs`, with where the train was when the dialog opened
 * and where the move led then), answered in their words (`whereText`). The store decides: a
 * dialog opened before somebody else moved the train, or edited its route, moves nothing and
 * says where the train is now, so two members who submit Next for the same stop move it once.
 */
export async function submitMove(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  partyId: string,
  args: readonly string[],
): Promise<void> {
  const asked = askedMove(interaction, args);
  if (!asked) throw new UserError(STALE_COMPONENT);
  await deferSubmit(interaction);
  const say = (content: string) => interaction.editReply({ content });
  const party = ctx.parties.get(partyId);
  if (!party) return void (await say(partyOver(A_TRAIN)));
  if (!isTrain(party)) return void (await say(STALE_COMPONENT));
  const answer = await moveTrainAs(
    ctx,
    party,
    actingMember(interaction),
    asked.move,
    isStaff(interaction, ctx),
    'post',
    asked.from,
    asked.target,
  );
  await say(
    answer.kind === 'refused'
      ? movedOnWords(ctx, partyId, answer.reason, answer.text, 'post')
      : answer.text,
  );
}

/** The mode and the kind of a train by the letters Manage…'s custom id gives them. */
const AT_END_OF_CODE = new Map(TRAIN_AT_END.map((atEnd) => [AT_END_CODES[atEnd], atEnd]));
const KIND_OF_CODE = new Map(TRAIN_KINDS.map((kind) => [KIND_CODES[kind], kind]));

/**
 * What a Submit of Manage… showed and picked: where the train was, the stop the route began
 * with, the mode and the kind as the custom id carries them, and what its choices hold (the mode
 * not asked of a train without a route; "The route" left out where only Keep was left).
 * Undefined for a dialog of another shape or a forged one.
 */
function askedManage(
  interaction: ModalSubmitInteraction,
  args: readonly string[],
): { shown: ManageShown; picked: ManagePicked } | undefined {
  const [from, first, shownAtEnd, shownKind] = withoutOpenToken(args);
  const wasAtEnd = AT_END_OF_CODE.get(shownAtEnd ?? '');
  const wasKind = KIND_OF_CODE.get(shownKind ?? '');
  if (from === undefined || first === undefined || !wasAtEnd || !wasKind) return undefined;
  const kind = selectedOf<TrainKind>(interaction, MANAGE_KIND_INPUT, TRAIN_KINDS);
  if (kind === undefined) return undefined;
  const hasRoute = first !== NO_FIRST;
  const atEnd = hasRoute
    ? selectedOf<TrainAtEnd>(interaction, MANAGE_AT_END_INPUT, TRAIN_AT_END)
    : wasAtEnd;
  if (atEnd === undefined) return undefined;
  const route = interaction.fields.fields.has(MANAGE_ROUTE_INPUT)
    ? pickedOf(interaction, MANAGE_ROUTE_INPUT, ROUTE_CHOICES)
    : 'keep';
  if (route === undefined) return undefined;
  return {
    shown: { from, first, atEnd: wasAtEnd, kind: wasKind },
    picked: { kind, route, atEnd },
  };
}

/** What was typed in a line of a Manage… dialog (its start, its end); '' for none. */
function typedLine(interaction: ModalSubmitInteraction, id: string): string {
  return interaction.fields.fields.has(id) ? interaction.fields.getTextInputValue(id).trim() : '';
}

/**
 * A Submit's start and end, refused before the router counts it, as the map refuses them (so that a
 * use that changed nothing does not count towards `/meet`'s or `/end`'s): a member who may not
 * arrange the train, a text that is no time, two that would not lie in order (`readTimes`).
 */
const requireTimesChange: Guard = (interaction, ctx) => {
  if (!interaction.isModalSubmit()) return;
  const party = ctx.parties.get(decodeCustomId(interaction.customId)?.id ?? '');
  if (!party || !isTrain(party)) return;
  askedTimes(interaction, ctx, party);
};

/** The start and end typed in a Submit, read as the map reads them; none for blank lines. */
function askedTimes(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  party: TrainParty,
): TimesRead {
  const start = typedLine(interaction, MANAGE_START_INPUT);
  const end = typedLine(interaction, MANAGE_END_INPUT);
  if (start === '' && end === '') return {};
  if (!mayArrange(party, interaction.user.id)) {
    throw new UserError(trainRefusal(ctx, 'not-attending'));
  }
  return readTimes(
    ctx,
    party,
    { ...(start === '' ? {} : { start }), ...(end === '' ? {} : { end }) },
    Date.now(),
  );
}

/**
 * Submit of Manage… (`tmanage:<id>:manageform:…`; `party:…` of a dialog opened before): acknowledged
 * privately, then what was picked otherwise than shown applied as one change, with the start, and
 * answered as `manageTrainAs` words it (the one code path of the dialog and the map's form, plan
 * 8M-8C).
 */
export async function submitManage(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  partyId: string,
  args: readonly string[],
): Promise<void> {
  const asked = askedManage(interaction, args);
  if (!asked) throw new UserError(STALE_COMPONENT);
  const before = ctx.parties.get(partyId);
  const times = before && isTrain(before) ? askedTimes(interaction, ctx, before) : {};
  const party = ctx.parties.get(partyId);
  const say = (content: string) => interaction.editReply({ content });
  if (!party || !isTrain(party)) {
    await deferSubmit(interaction);
    return void (await say(party ? STALE_COMPONENT : partyOver(A_TRAIN)));
  }
  // Counted as the map's route counts it, before it is acknowledged (a full window is refused as
  // the router refuses one): each time in its command's window (`countTimes`), the Submit in the
  // post's controls' (`countControl`); a full one refuses it with nothing spent.
  const userId = interaction.user.id;
  const counted = countTimes(ctx.throttles, userId, times, Date.now());
  if ('refusal' in counted) throw new UserError(counted.refusal);
  const control = countControl(ctx.throttles, PARTY_KIND, ACTION_THROTTLE, userId, Date.now());
  if ('refusal' in control) {
    counted.givenBack(Date.now());
    throw new UserError(control.refusal);
  }
  await deferSubmit(interaction);
  let answer: TrainAnswer;
  try {
    answer = await manageTrainAs(
      ctx,
      party,
      actingMember(interaction),
      isStaff(interaction, ctx),
      asked.shown,
      { ...asked.picked, ...times },
      'post',
    );
  } catch (err) {
    if (!(err instanceof UserError) || err.givesBack) {
      counted.givenBack(Date.now());
      control.giveBack(Date.now());
    }
    throw err;
  }
  // Times that came to nothing do not count towards their commands' windows.
  if (answer.kind === 'refused') counted.givenBack(Date.now(), answer.went);
  await say(answer.text);
}

/**
 * The dialog of Manage…: counted by no window of its own; its Submit counts as the map's route
 * counts it (`submitManage`): in the post's controls' window, and each time in its command's
 * (`/meet`'s, `/end`'s). Its times are checked before anything counts (`requireTimesChange`).
 */
export const manageControls: ComponentHandler = {
  kind: MANAGE_KIND,
  guards: [requireGuild, requireTimesChange],
  throttle: () => undefined,
  async modal(interaction, id, ctx) {
    if (id.action !== MANAGE_FORM) throw new UserError(STALE_COMPONENT);
    await submitManage(interaction, ctx, id.id, id.args);
  },
};
