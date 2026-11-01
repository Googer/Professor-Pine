import { isFormKey, isPokedexNumber } from '../pogo/notification-target.js';
import { isItemKey } from '../research/task.js';
import { LEADERS, parseRocketKey } from '../rocket/lineups.js';
import { POKEMON_TYPES } from '../pogo/types.js';

/*
 * The wants that are no `PokemonNotification` row (plan 8R-1; design 9.1): table `TargetWant`,
 * one row per member, server and target, the target a token. Research rewards (a Pokémon, an
 * item, Mega Energy of a species) and the Dynamax and Gigantamax boxes of `/want`'s dialog;
 * plan 8R-2 adds the Rocket targets.
 */

/**
 * A target of `TargetWant`. A Pokémon is a species (`form` absent: every form) or one form (its
 * catalogue key), as a `PokemonTarget` is; `costumed` (plan 8R-4) is the row's own, never part of
 * its token: costumed only when set.
 */
export type TargetWant =
  | { kind: 'research-pokemon'; dex: number; form?: string; costumed?: true }
  | { kind: 'research-item'; item: string }
  | { kind: 'research-energy'; dex: number }
  | { kind: 'dynamax'; dex: number; form?: string; costumed?: true }
  | { kind: 'gigantamax'; dex: number; form?: string; costumed?: true }
  /**
   * Team GO Rocket (plan 8R-2; design 7, 9.1): who, as its token, `grunt:<type>`, `grunt:none`,
   * `decoy`, `leader:<cliff|arlo|sierra>`, `giovanni` (a `rocketKey`), or `leader:any`.
   */
  | { kind: 'rocket'; who: string };

/** The Rocket target of any leader (design 7: "any leader"). */
export const ANY_LEADER = 'leader:any';

/**
 * Whether a text is a Rocket target's `who`: a `rocketKey`, or any leader. Never a lineup's key
 * (plan 8R-4L, S6): wants stay by grunt type, and a lineup's catch is wanted by its Shadow box.
 */
export function isRocketWho(text: string): boolean {
  if (text === ANY_LEADER) return true;
  const who = parseRocketKey(text);
  return who !== undefined && !(who.kind === 'grunt' && who.lineup !== undefined);
}

/** The kinds of `TargetWant` that are a Pokémon (a box of `/want`'s dialog). */
export type PokemonBoxKind = 'research-pokemon' | 'dynamax' | 'gigantamax';

/** A Pokémon's target of a box: the species, or one form; costumed only when `costumed`. */
export function boxTarget(
  kind: PokemonBoxKind,
  dex: number,
  form?: string,
  costumed = false,
): TargetWant {
  return {
    kind,
    dex,
    ...(form === undefined ? {} : { form }),
    ...(costumed ? { costumed: true as const } : {}),
  };
}

/** Whether a target is a Pokémon's that is costumed only (plan 8R-4). */
export function isCostumedTarget(want: TargetWant): boolean {
  return 'costumed' in want && want.costumed === true;
}

/** A target as costumed or plain: a Pokémon's takes it, any other stays as it is. */
export function withCostume(want: TargetWant, costumed: boolean): TargetWant {
  if (want.kind !== 'research-pokemon' && want.kind !== 'dynamax' && want.kind !== 'gigantamax') {
    return want;
  }
  return boxTarget(want.kind, want.dex, want.form, costumed);
}

const PREFIX: Readonly<Record<Exclude<TargetWant['kind'], 'rocket'>, string>> = {
  'research-pokemon': 'research:pokemon',
  'research-item': 'research:item',
  'research-energy': 'research:energy',
  dynamax: 'dynamax',
  gigantamax: 'gigantamax',
};

/**
 * A target as the column holds it (design 9.1): `research:pokemon:<dex>[:<form>]`,
 * `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`,
 * `gigantamax:<dex>[:<form>]`. At most 88 characters (a form key is 64 at most).
 */
export function targetWantToken(want: TargetWant): string {
  switch (want.kind) {
    case 'rocket':
      return want.who;
    case 'research-item':
      return `${PREFIX[want.kind]}:${want.item}`;
    case 'research-energy':
      return `${PREFIX[want.kind]}:${String(want.dex)}`;
    default:
      return `${PREFIX[want.kind]}:${String(want.dex)}${want.form === undefined ? '' : `:${want.form}`}`;
  }
}

function dexOf(text: string | undefined): number | undefined {
  if (text === undefined || !/^[1-9]\d*$/.test(text)) return undefined;
  const dex = Number(text);
  return isPokedexNumber(dex) ? dex : undefined;
}

/**
 * The target a token names; undefined for any other text (a row of a later version, or a token
 * that cannot be one): such a row is left alone, never deleted on its own.
 */
export function parseTargetWantToken(token: string): TargetWant | undefined {
  if (isRocketWho(token)) return { kind: 'rocket', who: token };
  const parts = token.split(':');
  const [head, second] = parts;
  if (head === 'research') {
    const [, , value, form, ...more] = parts;
    if (more.length > 0) return undefined;
    if (second === 'item') {
      return form === undefined && value !== undefined && isItemKey(value)
        ? { kind: 'research-item', item: value }
        : undefined;
    }
    const dex = dexOf(value);
    if (dex === undefined) return undefined;
    if (second === 'energy')
      return form === undefined ? { kind: 'research-energy', dex } : undefined;
    if (second !== 'pokemon') return undefined;
    if (form !== undefined && !isFormKey(form)) return undefined;
    return boxTarget('research-pokemon', dex, form);
  }
  if (head === 'dynamax' || head === 'gigantamax') {
    const [, , form, ...more] = parts;
    const dex = dexOf(second);
    if (dex === undefined || more.length > 0) return undefined;
    if (form !== undefined && !isFormKey(form)) return undefined;
    return boxTarget(head, dex, form);
  }
  return undefined;
}

/** Whether two targets are the same want. */
export function sameTargetWant(a: TargetWant, b: TargetWant): boolean {
  return targetWantToken(a) === targetWantToken(b);
}

/**
 * A target as the arguments of a custom id (`dm:<server>:stop:<these>`, a list's Remove), as
 * `stopArgs` spells the other reasons: `rp:<dex>[:<form>]`, `ri:<item>`, `re:<dex>`,
 * `dx:<dex>[:<form>]`, `gx:<dex>[:<form>]`.
 */
export function targetWantArgs(want: TargetWant): string[] {
  switch (want.kind) {
    case 'rocket':
      return rocketArgs(want.who);
    case 'research-item':
      return ['ri', want.item];
    case 'research-energy':
      return ['re', String(want.dex)];
    case 'research-pokemon':
      return ['rp', String(want.dex), ...(want.form === undefined ? [] : [want.form])];
    case 'dynamax':
      return ['dx', String(want.dex), ...(want.form === undefined ? [] : [want.form])];
    case 'gigantamax':
      return ['gx', String(want.dex), ...(want.form === undefined ? [] : [want.form])];
  }
}

const ARG_KINDS: Readonly<Record<string, PokemonBoxKind>> = {
  rp: 'research-pokemon',
  dx: 'dynamax',
  gx: 'gigantamax',
};

/**
 * A Rocket target's arguments (plan 8R-2): `rg:<type|none>` a grunt, `rl:<leader|any>` a leader,
 * `rv` Giovanni, `rd` the decoy.
 */
function rocketArgs(who: string): string[] {
  if (who === 'giovanni') return ['rv'];
  if (who === 'decoy') return ['rd'];
  const [head = '', value = ''] = who.split(':');
  return [head === 'grunt' ? 'rg' : 'rl', value];
}

const GRUNT_TYPES: ReadonlySet<string> = new Set([...POKEMON_TYPES, 'none']);
const LEADER_WORDS: ReadonlySet<string> = new Set([...LEADERS, 'any']);

/** The Rocket target a custom id's arguments spell (`rocketArgs`); undefined for any other. */
function readRocketArgs(args: readonly string[]): TargetWant | undefined {
  const [kind, value, ...more] = args;
  if (more.length > 0) return undefined;
  if (kind === 'rv' || kind === 'rd') {
    return value === undefined
      ? { kind: 'rocket', who: kind === 'rv' ? 'giovanni' : 'decoy' }
      : undefined;
  }
  if (value === undefined) return undefined;
  if (kind === 'rg' && GRUNT_TYPES.has(value)) return { kind: 'rocket', who: `grunt:${value}` };
  if (kind === 'rl' && LEADER_WORDS.has(value)) return { kind: 'rocket', who: `leader:${value}` };
  return undefined;
}

/** The target a custom id's arguments spell (`targetWantArgs`); undefined for anything else. */
export function readTargetWantArgs(args: readonly string[]): TargetWant | undefined {
  if (['rg', 'rl', 'rv', 'rd'].includes(args[0] ?? '')) return readRocketArgs(args);
  const [kind, value, form, ...more] = args;
  if (kind === undefined || value === undefined || more.length > 0) return undefined;
  if (kind === 'ri') {
    return form === undefined && isItemKey(value)
      ? { kind: 'research-item', item: value }
      : undefined;
  }
  const dex = dexOf(value);
  if (dex === undefined) return undefined;
  if (kind === 're') return form === undefined ? { kind: 'research-energy', dex } : undefined;
  const box = ARG_KINDS[kind];
  if (box === undefined) return undefined;
  if (form !== undefined && !isFormKey(form)) return undefined;
  return boxTarget(box, dex, form);
}
