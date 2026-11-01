import {
  ComponentType,
  type APIModalInteractionResponseCallbackData,
  type ModalSubmitInteraction,
} from 'discord.js';
import { encodeCustomId, type CustomId } from '../../discord/custom-id.js';
import { openToken, withoutOpenToken } from '../../discord/dialog.js';
import { isSnowflake } from '../../db/snowflake.js';
import { isFormKey, isPokedexNumber } from '../../domain/pogo/notification-target.js';
import { isRaidLevel } from '../../domain/pogo/raid-tier.js';
import { NO_WHICH } from '../../domain/short-hash.js';
import {
  BOX_DESCRIPTIONS,
  BOX_WORDS,
  type BoxSubject,
  type PokemonBox,
  type WantBox,
} from '../../domain/pogo/want-boxes.js';
import { plain, truncate } from '../../render/text.js';
import { textDisplay } from '../../render/v2.js';
import { allBoxes } from './want-boxes.js';

/*
 * `/want`'s dialog (plan 8R-4): its custom id (F6), what a Submit needs to know of the dialog it
 * comes from, and nothing kept anywhere else; the dialog itself; and how a Submit is read.
 */

export { NO_WHICH };

/**
 * The custom-id kind of `/want`'s dialog: `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>]
 * [:<form>][:l<page>]:~<token>` for a Pokémon, `wantbox:t<level>:set2:…` for a tier
 * (`wantDialogId`); the token is `openToken` of when it opened (plan 8X-F, "For 8R-4").
 */
export const WANT_BOX_KIND = 'wantbox';

/**
 * The action of the dialog's Submit: `set2` since plan 8R-4, the version of its arguments. An
 * id of before (`set`) or of any other shape, also one without its token, is out of date
 * (`STALE_COMPONENT`).
 */
export const WANT_BOX_ACTION = 'set2';

/** What the custom id of a dialog says. */
export interface WantDialogId {
  /** A species (no form), one form beyond the Which field (an Unown letter), or a tier. */
  subject: BoxSubject;
  /** The boxes the dialog showed (review B3): the Submit writes those and no others. */
  shown: WantBox[];
  /** Whether the dialog showed the Costumes field and the Remove field. */
  costumes: boolean;
  remove: boolean;
  /** `whichHash` of the keys its Which field showed (review R5), `NO_WHICH` for none. */
  which: string;
  /** The server it is about, when it was opened from a DM, which has none (Manage…, plan 8R-4). */
  server?: string;
  /** The page of `/wants` it was opened from, shown again after the Submit. */
  page?: number;
}

const COSTUMES_FLAG = 1;
const REMOVE_FLAG = 2;

/** The boxes shown as a bit per box of `allBoxes`, in base 36. */
function maskOf(subject: BoxSubject, shown: readonly WantBox[]): string {
  return allBoxes(subject)
    .reduce((bits, box, index) => (shown.includes(box) ? bits | (1 << index) : bits), 0)
    .toString(36);
}

/** The boxes a mask names; undefined for one that names none or too many. */
function boxesOfMask(subject: BoxSubject, mask: string | undefined): WantBox[] | undefined {
  if (mask === undefined || !/^[0-9a-z]{1,3}$/.test(mask)) return undefined;
  const bits = parseInt(mask, 36);
  const all = allBoxes(subject);
  if (bits === 0 || bits >= 1 << all.length) return undefined;
  return all.filter((_box, index) => (bits & (1 << index)) !== 0);
}

/**
 * The custom id of a dialog's Submit, opened at `opened`: it ends in a per-open token
 * (`openToken`, plan 8X-F), since Discord's client shows what was last submitted under an id in
 * place of what the dialog ticks; a Submit leaves it out.
 */
export function wantDialogId(dialog: WantDialogId, opened: number): string {
  const { subject } = dialog;
  const flags = (dialog.costumes ? COSTUMES_FLAG : 0) | (dialog.remove ? REMOVE_FLAG : 0);
  const id: CustomId = {
    kind: WANT_BOX_KIND,
    id: subject.kind === 'tier' ? `t${subject.level}` : `p${String(subject.dex)}`,
    action: WANT_BOX_ACTION,
    args: [
      maskOf(subject, dialog.shown),
      flags.toString(36),
      dialog.which,
      ...(dialog.server === undefined ? [] : [dialog.server]),
      ...(subject.kind === 'pokemon' && subject.form !== undefined ? [subject.form] : []),
      ...(dialog.page === undefined ? [] : [`l${String(dialog.page)}`]),
      openToken(opened),
    ],
  };
  return encodeCustomId(id);
}

/**
 * What a custom id of the dialog says (`wantDialogId`), its token left out; undefined for any
 * other shape, also one without a token: no dialog of `set2` was ever drawn without one.
 */
export function readWantDialogId(id: CustomId): WantDialogId | undefined {
  if (id.kind !== WANT_BOX_KIND || id.action !== WANT_BOX_ACTION) return undefined;
  const args = withoutOpenToken(id.args);
  if (args.length === id.args.length) return undefined;
  const [mask, flagText, which, ...rest] = args;
  if (flagText === undefined || which === undefined) return undefined;
  if (!/^[0-3]$/.test(flagText) || !/^[0-9a-z]{1,7}$/.test(which)) return undefined;
  let subject: BoxSubject;
  if (id.id.startsWith('t')) {
    const level = id.id.slice(1);
    if (!isRaidLevel(level)) return undefined;
    subject = { kind: 'tier', level };
  } else {
    const dex = /^p([1-9]\d*)$/.exec(id.id)?.[1];
    if (dex === undefined || !isPokedexNumber(Number(dex))) return undefined;
    subject = { kind: 'pokemon', dex: Number(dex) };
  }
  // The optional parts in their order: the server, the form, the page.
  let server: string | undefined;
  let page: number | undefined;
  let at = 0;
  if (rest[at] !== undefined && isSnowflake(rest[at] ?? '')) server = rest[at++];
  const form = rest[at];
  if (form !== undefined && !/^l\d{1,3}$/.test(form)) {
    if (subject.kind === 'tier' || !isFormKey(form) || isSnowflake(form)) return undefined;
    subject = { kind: 'pokemon', dex: subject.dex, form };
    at += 1;
  }
  const pageText = rest[at];
  if (pageText !== undefined) {
    const read = /^l(\d{1,3})$/.exec(pageText)?.[1];
    if (read === undefined) return undefined;
    page = Number(read);
    at += 1;
  }
  if (at !== rest.length) return undefined;
  const shown = boxesOfMask(subject, mask);
  if (!shown) return undefined;
  const flags = Number(flagText);
  return {
    subject,
    shown,
    costumes: (flags & COSTUMES_FLAG) !== 0,
    remove: (flags & REMOVE_FLAG) !== 0,
    which,
    ...(server === undefined ? {} : { server }),
    ...(page === undefined ? {} : { page }),
  };
}

/** The inputs of the dialog: its boxes, its Which field, Costumes and Remove. */
export const BOXES_INPUT = 'boxes';
export const FORMS_INPUT = 'forms';
export const COSTUMED_INPUT = 'costumed';
export const REMOVE_INPUT = 'remove';

/** The most choices a checkbox group holds: a Which field of more is a dropdown (to 25). */
const GROUP_MOST = 10;

/** What the dialog of a subject shows and how it is ticked when it opens. */
export interface WantDialogView {
  /** The subject of the Submit: a species, an Unown letter, a tier. */
  subject: BoxSubject;
  /** The name in its title and texts: the species' (`Corsola`), a letter's, a tier's. */
  name: string;
  /** The boxes it shows; with one only there is no Tell me about field (it is told for that). */
  shown: WantBox[];
  /** The forms of the Which field, in their order (none: no field). */
  which: { key: string; name: string }[];
  /** `whichHash` of the Which field's keys, `NO_WHICH` for none. */
  whichHash: string;
  /** Whether it shows Costumes, and Remove (the member holds a want of it). */
  costumes: boolean;
  remove: boolean;
  /** What is ticked when it opens. */
  ticks: { boxes: ReadonlySet<WantBox>; forms: ReadonlySet<string>; costumed: boolean };
  /** The member's rows of it differ by form (a Submit sets them alike). */
  differ: boolean;
  /** Opened from a DM: the server it is about, named in its text (`plain`, F14). */
  server?: { id: string; name: string };
  /** Opened from `/wants`: the page it shows again. */
  page?: number;
  /** When it opened: the per-open token of its id (`openToken`, plan 8X-F). */
  openedAt: number;
}

/** What a tier's boxes say under their names. */
function tierDescription(level: string, box: WantBox): string {
  return box === 'shadow-raids'
    ? `Shadow ${level} raids and their eggs`
    : `${level} raids and their eggs`;
}

/** The one text of the dialog: what to do, then what else there is to know, in one display. */
function dialogText(view: WantDialogView): string {
  const name = plain(view.name);
  const megas = view.which.some((form) => /^Mega |^Primal /.test(form.name));
  const opened = view.server !== undefined || view.page !== undefined;
  const sentences: string[] = [];
  if (opened && view.remove) {
    const where = view.server === undefined ? '' : ` in ${plain(view.server.name)}`;
    sentences.push(
      `Your ${name} want${where}. Change what you want a DM about, or tick Remove to stop them all.`,
    );
  } else if (view.shown.length === 1 && view.subject.kind === 'pokemon') {
    const box = view.shown[0] ?? 'raids';
    const what = box === 'raids' ? 'raids' : BOX_WORDS[box].toLowerCase();
    sentences.push(
      `${name} is told for ${what}, in the regions you can see.` +
        (view.which.length > 0 ? ' Pick the forms you want.' : ''),
    );
  } else {
    // A first want cannot be submitted with nothing ticked (R-M2), a want held can and goes (Q1).
    sentences.push('Tick what you want a DM about, in the regions you can see.');
  }
  if (megas) sentences.push('A mega is told for raids only.');
  if (view.differ) sentences.push(`Your ${name} wants differ by form; Submit sets them alike.`);
  return sentences.join(' ');
}

/**
 * The dialog of `/want` and of Manage… (design 3, plan 8R-4; the mockups of 2026-10-22): "Pikachu:
 * what for?", one text, then at most four fields, since a dialog holds five components at most
 * (Discord's limit; every other sentence goes into the one text): Tell me about (the boxes, two
 * or more; their descriptions only where there is no Which field), Which <species> (a checkbox
 * group up to ten forms, a dropdown to 25), Costumes (one Checkbox) and Remove (one Checkbox,
 * where the member holds a want of it). Its Submit is `wantbox:…:set2` (`wantDialogId`).
 */
export function wantDialog(view: WantDialogView): APIModalInteractionResponseCallbackData {
  const { subject, shown, which, ticks } = view;
  // A label shows no markdown (A10): the name as it is.
  const { name } = view;
  // A first want lets no Submit through till a box and a form are ticked (Matt's R-M2); a want
  // held may be submitted with nothing, which takes it off (Q1).
  const pick = view.remove ? { required: false, min_values: 0 } : { required: true, min_values: 1 };
  const components: APIModalInteractionResponseCallbackData['components'] = [
    textDisplay(dialogText(view)),
  ];
  const describe = (box: WantBox): string | undefined => {
    if (subject.kind === 'tier') return tierDescription(view.name, box);
    if (which.length > 0) return undefined;
    return BOX_DESCRIPTIONS[box as PokemonBox].replace('{name}', view.name);
  };
  if (shown.length > 1) {
    components.push({
      type: ComponentType.Label,
      label: 'Tell me about',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: BOXES_INPUT,
        ...pick,
        max_values: shown.length,
        options: shown.map((box) => {
          const description = describe(box);
          return {
            label: BOX_WORDS[box],
            value: box,
            ...(description === undefined ? {} : { description: truncate(description, 100) }),
            ...(ticks.boxes.has(box) ? { default: true } : {}),
          };
        }),
      },
    });
  }
  if (which.length > 0) {
    const options = which.map((form) => ({
      label: truncate(form.name, 100),
      value: form.key,
      ...(ticks.forms.has(form.key) ? { default: true } : {}),
    }));
    components.push({
      type: ComponentType.Label,
      label: truncate(`Which ${name}`, 45),
      component:
        which.length <= GROUP_MOST
          ? {
              type: ComponentType.CheckboxGroup,
              custom_id: FORMS_INPUT,
              ...pick,
              max_values: which.length,
              options,
            }
          : {
              type: ComponentType.StringSelect,
              custom_id: FORMS_INPUT,
              ...pick,
              max_values: which.length,
              options,
            },
    });
  }
  if (view.costumes) {
    components.push({
      type: ComponentType.Label,
      label: truncate(which.length > 0 ? 'Only costumed ones' : `Only costumed ${name}`, 45),
      description:
        which.length > 0
          ? 'Of the forms ticked, any costume, now or later.'
          : 'Any costume, now or later. Unticked, costumed ones come too.',
      component: {
        type: ComponentType.Checkbox,
        custom_id: COSTUMED_INPUT,
        ...(ticks.costumed ? { default: true } : {}),
      },
    });
  }
  if (view.remove) {
    components.push({
      type: ComponentType.Label,
      label: truncate(`Remove ${name} from my list`, 45),
      description: 'Ticked, Submit removes it, whatever else is ticked.',
      component: { type: ComponentType.Checkbox, custom_id: REMOVE_INPUT },
    });
  }
  return {
    custom_id: wantDialogId(
      {
        subject,
        shown,
        costumes: view.costumes,
        remove: view.remove,
        which: view.whichHash,
        ...(view.server === undefined ? {} : { server: view.server.id }),
        ...(view.page === undefined ? {} : { page: view.page }),
      },
      view.openedAt,
    ),
    title: truncate(`${view.name}: what for?`, 45),
    components,
  };
}

/** What a Submit of the dialog says, read by what its id says it showed. */
export interface WantSubmit {
  /** The boxes ticked, of those shown. */
  ticked: Set<WantBox>;
  /** The forms ticked in the Which field; undefined where it showed none. */
  forms: string[] | undefined;
  /** Costumed ticked; undefined where the dialog did not show Costumes. */
  costumed: boolean | undefined;
  remove: boolean;
}

/**
 * The fields of a Submit as its id says the dialog showed them; a form of another shape (a field
 * missing) is out of date: undefined. One box shown is no group, and that box is ticked (S1).
 */
export function readWantSubmit(
  interaction: Pick<ModalSubmitInteraction, 'fields'>,
  id: WantDialogId,
): WantSubmit | undefined {
  const { fields } = interaction;
  try {
    const ticked = new Set<WantBox>(
      id.shown.length === 1
        ? id.shown
        : fields
            .getCheckboxGroup(BOXES_INPUT)
            .filter((box): box is WantBox => (id.shown as string[]).includes(box)),
    );
    let forms: string[] | undefined;
    if (id.which !== NO_WHICH) {
      const field = fields.fields.get(FORMS_INPUT);
      forms = [
        ...(field?.type === ComponentType.StringSelect
          ? fields.getStringSelectValues(FORMS_INPUT)
          : fields.getCheckboxGroup(FORMS_INPUT)),
      ];
    }
    return {
      ticked,
      forms,
      // Costumes not shown: each row keeps its own (A1).
      costumed: id.costumes ? fields.getCheckbox(COSTUMED_INPUT) : undefined,
      remove: id.remove && fields.getCheckbox(REMOVE_INPUT),
    };
  } catch {
    return undefined;
  }
}

/*
 * The Team GO Rocket dialog (plan 8R-4, design 4b, S12): one dialog for every Rocket want, its
 * options fixed (all 18 grunt types, the untyped grunts, the decoy, the leaders, any leader,
 * Giovanni) whatever today's rotation, so its id has a version and no hash of the lineups.
 */

/**
 * The id of the Rocket dialog's Submit (`wantbox:r:rset1:<flags>[:<server>][:l<page>]:~<token>`,
 * the token `openToken` of when it opened, plan 8X-F).
 */
export const ROCKET_DIALOG_ID = 'r';
export const ROCKET_ACTION = 'rset1';
export const GRUNTS_INPUT = 'grunts';
export const LEADERS_INPUT = 'leaders';

/** What the id of the Rocket dialog says: Remove shown, and where it was opened from. */
export interface RocketDialogId {
  remove: boolean;
  server?: string;
  page?: number;
}

/** The custom id of the Rocket dialog's Submit, opened at `opened` (its per-open token). */
export function rocketDialogId(dialog: RocketDialogId, opened: number): string {
  return encodeCustomId({
    kind: WANT_BOX_KIND,
    id: ROCKET_DIALOG_ID,
    action: ROCKET_ACTION,
    args: [
      (dialog.remove ? REMOVE_FLAG : 0).toString(36),
      ...(dialog.server === undefined ? [] : [dialog.server]),
      ...(dialog.page === undefined ? [] : [`l${String(dialog.page)}`]),
      openToken(opened),
    ],
  });
}

/**
 * What a custom id of the Rocket dialog says, its token left out; undefined for any other, also
 * one without a token (no `rset1` dialog was drawn without one).
 */
export function readRocketDialogId(id: CustomId): RocketDialogId | undefined {
  if (id.kind !== WANT_BOX_KIND || id.id !== ROCKET_DIALOG_ID || id.action !== ROCKET_ACTION) {
    return undefined;
  }
  const args = withoutOpenToken(id.args);
  if (args.length === id.args.length) return undefined;
  const [flags, ...rest] = args;
  if (flags !== '0' && flags !== String(REMOVE_FLAG)) return undefined;
  let at = 0;
  const server = rest[at] !== undefined && isSnowflake(rest[at] ?? '') ? rest[at++] : undefined;
  const pageText = rest[at];
  let page: number | undefined;
  if (pageText !== undefined) {
    const read = /^l(\d{1,3})$/.exec(pageText)?.[1];
    if (read === undefined) return undefined;
    page = Number(read);
    at += 1;
  }
  if (at !== rest.length) return undefined;
  return {
    remove: flags === String(REMOVE_FLAG),
    ...(server === undefined ? {} : { server }),
    ...(page === undefined ? {} : { page }),
  };
}

/** One option of the Rocket dialog: its target's `who`, its label, a description where it has one. */
export interface RocketOption {
  who: string;
  label: string;
  description?: string;
}

/** What the Rocket dialog shows and has ticked when it opens. */
export interface RocketDialogView {
  grunts: readonly RocketOption[];
  leaders: readonly RocketOption[];
  /** The `who` ticked: the member's Rocket wants, and a target picked. */
  ticked: ReadonlySet<string>;
  /** The member holds a Rocket want: Remove shows. */
  remove: boolean;
  server?: { id: string; name: string };
  page?: number;
  /** When it opened: the per-open token of its id (`openToken`, plan 8X-F). */
  openedAt: number;
}

/**
 * The Team GO Rocket dialog (mockup 8): "Team GO Rocket: what for?", the text, Grunts (a dropdown
 * of the twenty grunts, `min_values` 0), Leaders (a checkbox group of five) and Remove where the
 * member holds a Rocket want. Its Submit is `wantbox:r:rset1`.
 */
export function rocketDialog(view: RocketDialogView): APIModalInteractionResponseCallbackData {
  const option = (one: RocketOption) => ({
    label: one.label,
    value: one.who,
    ...(one.description === undefined ? {} : { description: one.description }),
    ...(view.ticked.has(one.who) ? { default: true } : {}),
  });
  const opened = view.server !== undefined || view.page !== undefined;
  const where = view.server === undefined ? '' : ` in ${plain(view.server.name)}`;
  const text =
    opened && view.remove
      ? `Your Team GO Rocket wants${where}. Change what you want a DM about, or tick Remove to ` +
        'stop them all.'
      : 'Pick what you want a DM about, in the regions you can see. A grunt type is told at most ' +
        'once an hour.';
  const components: APIModalInteractionResponseCallbackData['components'] = [
    textDisplay(text),
    {
      type: ComponentType.Label,
      label: 'Grunts',
      description:
        'By type, whatever their lineup. For one Pokémon they give, tick Shadow in its own /want.',
      component: {
        type: ComponentType.StringSelect,
        custom_id: GRUNTS_INPUT,
        required: false,
        min_values: 0,
        max_values: view.grunts.length,
        options: view.grunts.map(option),
      },
    },
    {
      type: ComponentType.Label,
      label: 'Leaders',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: LEADERS_INPUT,
        required: false,
        min_values: 0,
        max_values: view.leaders.length,
        options: view.leaders.map(option),
      },
    },
  ];
  if (view.remove) {
    components.push({
      type: ComponentType.Label,
      label: 'Remove all my Team GO Rocket wants',
      description: 'Ticked, Submit removes them, whatever else is picked.',
      component: { type: ComponentType.Checkbox, custom_id: REMOVE_INPUT },
    });
  }
  return {
    custom_id: rocketDialogId(
      {
        remove: view.remove,
        ...(view.server === undefined ? {} : { server: view.server.id }),
        ...(view.page === undefined ? {} : { page: view.page }),
      },
      view.openedAt,
    ),
    title: 'Team GO Rocket: what for?',
    components,
  };
}

/** What a Submit of the Rocket dialog picked; undefined for a form of another shape. */
export function readRocketSubmit(
  interaction: Pick<ModalSubmitInteraction, 'fields'>,
  id: RocketDialogId,
): { picked: string[]; remove: boolean } | undefined {
  try {
    const { fields } = interaction;
    return {
      picked: [
        ...fields.getStringSelectValues(GRUNTS_INPUT),
        ...fields.getCheckboxGroup(LEADERS_INPUT),
      ],
      remove: id.remove && fields.getCheckbox(REMOVE_INPUT),
    };
  } catch {
    return undefined;
  }
}
