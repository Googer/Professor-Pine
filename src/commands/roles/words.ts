import type {
  RoleProblem,
  RosterEntry,
  ServerRole,
  Skipped,
} from '../../domain/roles/self-roles.js';
import { NO_MANAGE_ROLES } from '../../render/role-menus.js';
import { plain } from '../../render/text.js';
import type { RoleChangeOutcome, RoleFailure } from '../../services/self-role-service.js';
import { listed, ROLES_UNAVAILABLE, roleText } from './shared.js';

/**
 * Why a role cannot be handed out, as the rest of a sentence about it ("**North** cannot be
 * given: …") for staff, who can mend it.
 */
export function whyNot(problem: RoleProblem, role: ServerRole | undefined): string {
  switch (problem) {
    case 'gone':
      return 'its Discord role no longer exists';
    case 'ambiguous':
      return (
        'several roles of this server have its name; say which one is meant by adding it ' +
        'with `/admin self-roles add`'
      );
    case 'duplicate':
      return 'another entry already stands for the role of this name; remove this one';
    case 'everyone':
      return 'it is the role every member has';
    case 'managed':
      return 'it is managed by an integration (a bot role or the booster role)';
    case 'moderation':
      return role ? whyModeration(role) : 'it grants a permission of moderation';
    case 'above-bot':
      return 'it is not below my highest role in the list of roles';
    case 'no-manage-roles':
      return 'I lack the Manage Roles permission';
  }
}

/**
 * What makes a role one of moderation, as the rest of a sentence about it: the permissions it
 * grants, those a channel grants it, and a name that makes its holder staff of this bot.
 */
export function whyModeration(
  role: Pick<ServerRole, 'moderation' | 'channelModeration' | 'staffName'>,
): string {
  return [
    ...(role.moderation.length > 0 ? [`it grants ${listed(role.moderation)}`] : []),
    ...(role.channelModeration.length > 0
      ? [`a channel grants it ${listed(role.channelModeration)}`]
      : []),
    ...(role.staffName ? ['its name makes its holder staff of this bot'] : []),
  ].join(', and ');
}

/**
 * Why a member did not get a role, or did not lose one, as a sentence that says what a
 * moderator has to mend: never an error with a reference. `name` is the role's name as shown
 * (in bold already); `skip` says why, with the group of a role of which only one can be held
 * and, for `stuck`, the role that is in the way.
 */
export function memberProblem(
  name: string,
  skip: Pick<Skipped, 'reason'> & Partial<Pick<Skipped, 'entry' | 'blocker'>>,
): string {
  const group = skip.entry?.group;
  const ofGroup = group ? `the group ${plain(group.name)}` : 'its group';
  const mend = 'A moderator can mend that with `/admin self-roles`.';
  switch (skip.reason) {
    case 'gone':
      return (
        `${name} is not available at the moment: the role behind it is missing on this ` +
        `server. ${mend}`
      );
    case 'ambiguous':
      return (
        `${name} is not available at the moment: several roles of this server have its name, ` +
        `and I cannot tell which one is meant. ${mend}`
      );
    case 'duplicate':
      return (
        `${name} is not available at the moment: another entry of the list already stands ` +
        `for the role of that name. ${mend}`
      );
    case 'not-offered':
      return `${name} is no longer a role you can give yourself.`;
    case 'everyone':
    case 'managed':
      return `${name} can no longer be handed out. A moderator has to take it off the list.`;
    case 'moderation':
      return (
        `${name} is not handed out any more: the role was changed since it was put on the ` +
        'list, and it now grants more than a self-assigned role may. A moderator has to change ' +
        'the role back or take it off the list.'
      );
    case 'above-bot':
      return (
        `I cannot give or take ${name}: it is not below my own role in the list of roles of ` +
        'this server. A moderator has to move my role above it.'
      );
    case 'no-manage-roles':
      return NO_MANAGE_ROLES;
    case 'pick-one':
      return `${name} was not given: only one role of ${ofGroup} can be held at a time.`;
    case 'stuck': {
      const other = skip.blocker ? roleText(skip.blocker.name) : 'another role';
      const holding = `${name} was not given: you hold ${other} of ${ofGroup}, of which only one can be held, and I`;
      if (skip.blocker?.problem === 'moderation') {
        return (
          `${holding} do not take that one away unasked: it grants more than a self-assigned ` +
          'role may by now. Give it back with `/iamnot` first.'
        );
      }
      const held = `${holding} cannot take that one away`;
      return skip.blocker?.problem === 'managed' || skip.blocker?.problem === 'everyone'
        ? `${held}: it is managed by an integration now. A moderator has to take it off the list.`
        : `${held}: it is not below my own role. A moderator has to move my role above it.`;
    }
  }
}

/**
 * What somebody is told who typed a name that several listed roles have at present
 * (`entriesCalled`): the list of the option tells them apart.
 */
export function calledAlike(entries: readonly Pick<RosterEntry, 'name'>[]): string {
  const number = entries.length === 2 ? 'Two' : String(entries.length);
  return `${number} roles are called ${roleText(entries[0]?.name ?? '')}. Pick one from the list.`;
}

/** The names of entries in a sentence: "**A**, **B** and **C**". */
export function namesOf(entries: readonly Pick<RosterEntry, 'name'>[], and = 'and'): string {
  return listed(
    entries.map((entry) => roleText(entry.name)),
    and,
  );
}

/** Why Discord did not carry out a step, as the rest of a sentence after a colon. */
function whyFailed(reason: Exclude<RoleFailure['reason'], 'withdrawn'>): string {
  switch (reason) {
    case 'no-permission':
      return (
        'Discord did not let me. A moderator should check that my role has the Manage Roles ' +
        'permission and stands above the roles I hand out.'
      );
    case 'no-role':
      return 'the role was deleted a moment ago.';
    case 'no-member':
      return 'Discord says you are no longer a member of this server.';
    case 'two-factor':
      return (
        "this server requires two-factor authentication for moderation, and the bot's owner " +
        'has none.'
      );
    case 'error':
      // It may have been the database as well as Discord: the sentence claims neither.
      return 'something went wrong. Try again in a moment.';
  }
}

/**
 * A step that was not sent because the list or the server changed while the steps before it
 * were on their way, as a sentence: a role that has a problem now gets the sentence of that
 * problem, as if it had been asked for a moment later.
 */
function withdrawnSentence(failed: Extract<RoleFailure, { reason: 'withdrawn' }>): string {
  const name = roleText(failed.entry.name);
  const not = failed.action === 'give' ? `${name} was not given` : `${name} was not taken away`;
  if (failed.why === 'not-offered') return `${not}: it is no longer on the list.`;
  if (failed.why === 'unavailable') return `${not}: ${ROLES_UNAVAILABLE}`;
  // Nobody holds a role that does not exist, and no moderator has anything to mend for it.
  if (failed.action === 'take' && failed.why === 'gone')
    return `${not}: the role no longer exists.`;
  if (failed.action === 'take' && failed.why === 'moderation') {
    // Only a take nobody asked for is withdrawn for this (`displaceable`).
    return (
      `${not}: it grants more than a self-assigned role may by now, and I take such a role ` +
      'away only when you give it back yourself with `/iamnot`.'
    );
  }
  return memberProblem(name, { reason: failed.why, entry: failed.entry });
}

/** A change of one role that was begun (`done` or `partial`). */
type Begun = Extract<RoleChangeOutcome, { kind: 'done' | 'partial' }>;

/**
 * What a change that was to give a member one role did, as `/iam` says it (and the web map's
 * "Your regions…", plan 8M-20): `refused` with the sentence of the role where it was skipped,
 * else what was really done first and what Discord stopped after it. `name` is the role's name
 * as shown (in bold already), `group` the name of its group.
 */
export function gaveWords(
  name: string,
  group: string | undefined,
  outcome: Begun,
): { refused: boolean; text: string } {
  const [skipped] = outcome.plan.skipped;
  if (skipped) return { refused: true, text: memberProblem(name, skipped) };
  const sentences: string[] = [];
  if (outcome.given.length > 0) sentences.push(`You have ${name} now.`);
  else if (outcome.kind === 'done') sentences.push(`You have ${name} already.`);
  if (outcome.taken.length > 0) {
    sentences.push(
      `I took ${namesOf(outcome.taken)} away: only one role of the group ` +
        `${plain(group ?? '')} can be held at a time.`,
    );
  }
  if (outcome.kind === 'partial') sentences.push(...failureSentences(outcome));
  return { refused: false, text: sentences.join(' ') };
}

/**
 * What a change that was to take one role away did, as `/iamnot` says it (and "Your regions…"):
 * `refused` with the sentence of the role where it was skipped.
 */
export function tookWords(name: string, outcome: Begun): { refused: boolean; text: string } {
  const [skipped] = outcome.plan.skipped;
  if (skipped) return { refused: true, text: memberProblem(name, skipped) };
  return {
    refused: false,
    text:
      outcome.kind === 'partial'
        ? failureSentences(outcome).join(' ')
        : outcome.taken.length === 0
          ? `You do not have ${name}.`
          : `You no longer have ${name}.`,
  };
}

/**
 * What a change that stopped half-way did not do, as sentences: the step that failed with the
 * reason, what was not tried after it, and "Nothing was changed." when nothing was done before
 * it either. What was done before it the caller says in its own words.
 */
export function failureSentences(
  outcome: Extract<RoleChangeOutcome, { kind: 'partial' }>,
): string[] {
  const { failed, untried } = outcome;
  const name = roleText(failed.entry.name);
  const sentences = [
    failed.reason === 'withdrawn'
      ? withdrawnSentence(failed)
      : failed.action === 'give'
        ? `I could not give you ${name}: ${whyFailed(failed.reason)}`
        : `I could not take ${name} away: ${whyFailed(failed.reason)}`,
  ];
  const giving = untried.filter((step) => step.action === 'give').map((step) => step.entry);
  const taking = untried.filter((step) => step.action === 'take').map((step) => step.entry);
  const rest = [
    ...(giving.length > 0 ? [`give you ${namesOf(giving)}`] : []),
    ...(taking.length > 0 ? [`take ${namesOf(taking)} away`] : []),
  ];
  if (rest.length > 0) sentences.push(`After that I did not try to ${rest.join(' or to ')}.`);
  if (outcome.given.length + outcome.taken.length === 0) sentences.push('Nothing was changed.');
  return sentences;
}
