import {
  isCostumedTarget,
  sameTargetWant,
  withCostume,
  type TargetWant,
} from '../notify/target-wants.js';
import {
  sameNotificationTarget,
  type NotificationScope,
  type Want,
} from './notification-target.js';
import {
  baseTarget,
  heldBoxes,
  shadowTarget,
  subjectOfTarget,
  targetWantsOf,
  type BoxSubject,
  type WantBox,
} from './want-boxes.js';

/*
 * One answer per species (plan 8R-4; design `2026-10-22-costume-form-wants-design.md`, section
 * 3): `/want`'s dialog writes the boxes and Costumed to every form ticked and takes the species'
 * other rows away, in both tables. Pure: `WantBoxRepository` and its twin `MemoryWantBoxes` read
 * the rows and carry out the plan.
 */

/**
 * The most forms the Which field of the dialog holds (a string select of 25). A species with more
 * (Unown, 29) has no Which field: its species row and each form are answers of their own.
 */
export const WHICH_CAP = 25;

/**
 * The rows one answer covers: `wide`, every row of the subject's Pokédex number (a species, its
 * forms, its megas, in both tables); otherwise the subject's own rows alone (a tier, Unown's
 * species row, one Unown letter).
 */
export interface AnswerScope {
  subject: BoxSubject;
  wide: boolean;
}

/**
 * The scope of a subject: a species is wide unless it has more entries than the Which field
 * holds (`entries`, its number in the catalogue); a form of such a species, and a tier, are not.
 */
export function answerScopeOf(subject: BoxSubject, entries: number): AnswerScope {
  const wide = subject.kind === 'pokemon' && subject.form === undefined && entries <= WHICH_CAP;
  return { subject, wide };
}

/**
 * The subject whose dialog Manage… opens for a want of a subject (plan 8R-4): a form's species
 * where the species has a Which field (`entries`, its number in the catalogue, `WHICH_CAP` at
 * most), else the subject itself (a tier, a species, an Unown letter).
 */
export function changeSubject(subject: BoxSubject, entries: number): BoxSubject {
  if (subject.kind !== 'pokemon' || subject.form === undefined) return subject;
  return entries > 1 && entries <= WHICH_CAP ? { kind: 'pokemon', dex: subject.dex } : subject;
}

/**
 * One row of a scope as the dialog reads it: its form (absent: the subject's own row, of a wide
 * scope the species row, which is every form), its boxes, and whether it is costumed only (every
 * row of that form in both tables is).
 */
export interface HeldRow {
  form?: string;
  boxes: Set<WantBox>;
  costumed: boolean;
}

/** The boxes of rows together: what a box of the dialog is ticked by (any row has it). */
export function boxesOf(rows: readonly HeldRow[]): Set<WantBox> {
  return new Set(rows.flatMap((row) => [...row.boxes]));
}

/** The subject of a row of a scope. */
function rowSubject(scope: AnswerScope, form: string | undefined): BoxSubject {
  const { subject } = scope;
  if (!scope.wide || subject.kind === 'tier') return subject;
  return form === undefined
    ? { kind: 'pokemon', dex: subject.dex }
    : { kind: 'pokemon', dex: subject.dex, form };
}

/**
 * The rows a member holds of a scope, from their wants of both tables (`readWants`' wants, the
 * targets of `TargetWant`): of a wide scope every form that has a row, the species row first,
 * the others in the order of their rows; of any other the subject's own, if it has a box.
 */
export function heldRows(
  scope: AnswerScope,
  wants: readonly Want[],
  targets: readonly TargetWant[],
): HeldRow[] {
  const forms: (string | undefined)[] = [];
  const { subject } = scope;
  if (scope.wide && subject.kind === 'pokemon') {
    const add = (form: string | undefined): void => {
      if (!forms.includes(form)) forms.push(form);
    };
    for (const want of wants) {
      if (want.target.kind === 'pokemon' && want.target.dex === subject.dex) add(want.target.form);
    }
    for (const target of targets) {
      const of = subjectOfTarget(target);
      if (of?.kind === 'pokemon' && of.dex === subject.dex) add(of.form);
    }
    // The species row first (`sort` would put `undefined` last whatever it is told).
    if (forms.includes(undefined)) {
      forms.splice(forms.indexOf(undefined), 1);
      forms.unshift(undefined);
    }
  } else {
    forms.push(undefined);
  }
  return forms.flatMap((form) => {
    const of = rowSubject(scope, form);
    const boxes = heldBoxes(of, wants, targets);
    if (boxes.size === 0) return [];
    const shadow = shadowTarget(of);
    const own = wants.filter(
      (want) =>
        sameNotificationTarget(want.target, baseTarget(of)) ||
        (shadow !== undefined && sameNotificationTarget(want.target, shadow)),
    );
    const tokens = targetWantsOf(of).map(([, target]) => target);
    const ownTargets = targets.filter((target) =>
      tokens.some((token) => sameTargetWant(token, target)),
    );
    const costumed =
      own.every((want) => want.costumed === true) && ownTargets.every(isCostumedTarget);
    return [{ ...(form === undefined ? {} : { form }), boxes, costumed }];
  });
}

/** What a Submit of the dialog says (`planAnswer`). */
export interface BoxAnswer {
  scope: AnswerScope;
  /**
   * The rows that stand after it: `undefined` the subject's own (of a wide scope the species row:
   * every form ticked, forms added later included), a key each form ticked. None takes the scope
   * off.
   */
  forms: readonly (string | undefined)[];
  /** The boxes ticked, of those `shown`. */
  ticked: ReadonlySet<WantBox>;
  /** The boxes the dialog showed: the others stay as each row had them. */
  shown: readonly WantBox[];
  /**
   * Costumed ticked; undefined where the dialog did not show Costumes: each row keeps its own (a
   * form without a row: costumed where every row held is). A mega is always plain (A-D3).
   */
  costumed: boolean | undefined;
  /** Remove was ticked: every row of the scope goes, whatever else is ticked. */
  remove: boolean;
}

/** The answer that takes every row of a scope away (Remove, `/unwant`, a list's Remove). */
export function removalAnswer(scope: AnswerScope): BoxAnswer {
  return { scope, forms: [], ticked: new Set(), shown: [], costumed: false, remove: true };
}

/** What a row of a subject becomes. */
export interface RowPlan {
  subject: BoxSubject;
  /** The scope of its own row; null for none (the row goes). */
  base: NotificationScope | null;
  /** Whether its shadow row stands. */
  shadow: boolean;
  /** The `TargetWant` rows to write (every box that stands, with its costume) and to take away. */
  targets: { add: TargetWant[]; remove: TargetWant[] };
  costumed: boolean;
}

/** What a Submit makes of the rows of its scope. */
export interface AnswerPlan {
  /** The rows after it. */
  after: HeldRow[];
  /** Every row held before or standing after, in that order, as it is to be written. */
  rows: RowPlan[];
}

/** The plan of one row from what it held and what it holds after. */
function rowPlan(
  scope: AnswerScope,
  form: string | undefined,
  before: HeldRow | undefined,
  after: HeldRow | undefined,
): RowPlan {
  const subject = rowSubject(scope, form);
  const boxes = after?.boxes ?? new Set<WantBox>();
  const costumed = after?.costumed ?? false;
  const raids = boxes.has('raids');
  const spawns = boxes.has('spawns');
  const base: NotificationScope | null =
    raids && spawns ? 'both' : raids ? 'raid' : spawns ? 'spawn' : null;
  const add: TargetWant[] = [];
  const remove: TargetWant[] = [];
  for (const [box, want] of targetWantsOf(subject)) {
    if (boxes.has(box)) add.push(withCostume(want, costumed));
    else if (before?.boxes.has(box) === true) remove.push(want);
  }
  return {
    subject,
    base,
    shadow: boxes.has(subject.kind === 'tier' ? 'shadow-raids' : 'shadow'),
    targets: { add, remove },
    costumed,
  };
}

/**
 * Whether rows are costumed together (design 3, review R6): every row but the megas is, and there
 * is one. A mega row is always plain (A-D3), so it counts for neither.
 */
export function allCostumed(rows: readonly HeldRow[], isMega: (form: string) => boolean): boolean {
  const own = rows.filter((row) => row.form === undefined || !isMega(row.form));
  return own.length > 0 && own.every((row) => row.costumed);
}

/**
 * What a Submit makes of a scope's rows (design 3, "One answer per species"): Remove, no form, or
 * no box shown ticked takes every row away, the boxes it did not show included (A2, Q1);
 * otherwise every form ticked gets the boxes ticked of those shown and keeps the others as its
 * row had them (a form without a row: as the scope's rows had them together), all with the
 * answer's costume (Costumes not shown: each row its own, A1); a mega (`isMega`, by its key)
 * Raids only and plain, and nothing without Raids (review R4c); every other row goes.
 */
export function planAnswer(
  scope: AnswerScope,
  held: readonly HeldRow[],
  answer: BoxAnswer,
  isMega: (form: string) => boolean,
): AnswerPlan {
  const after: HeldRow[] = [];
  const anyTicked = answer.shown.some((box) => answer.ticked.has(box));
  if (!answer.remove && anyTicked) {
    const together = boxesOf(held);
    const costumedTogether = allCostumed(held, isMega);
    const forms = [...new Set(answer.forms)];
    for (const form of forms) {
      const own = held.find((row) => row.form === form);
      const had = own?.boxes ?? together;
      const boxes = new Set<WantBox>([
        ...[...had].filter((box) => !answer.shown.includes(box)),
        ...answer.shown.filter((box) => answer.ticked.has(box)),
      ]);
      const mega = form !== undefined && isMega(form);
      if (mega) {
        for (const box of [...boxes]) if (box !== 'raids') boxes.delete(box);
      }
      const costumed = mega ? false : (answer.costumed ?? own?.costumed ?? costumedTogether);
      if (boxes.size > 0) {
        after.push({ ...(form === undefined ? {} : { form }), boxes, costumed });
      }
    }
  }
  const forms = [...held.map((row) => row.form)];
  for (const row of after) if (!forms.includes(row.form)) forms.push(row.form);
  return {
    after,
    rows: forms.map((form) =>
      rowPlan(
        scope,
        form,
        held.find((row) => row.form === form),
        after.find((row) => row.form === form),
      ),
    ),
  };
}
