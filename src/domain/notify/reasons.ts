import type { PokemonCatalogue } from '../pogo/catalogue.js';
import {
  isFormKey,
  isNotificationTier,
  isPokedexNumber,
  ivCode,
  pokemonTarget,
  tierCode,
  type NotificationTarget,
  type Want,
} from '../pogo/notification-target.js';
import { isRaidLevel, raidTier, sameRaidTier, type RaidTier } from '../pogo/raid-tier.js';
import { costumedByName } from '../pogo/costumes.js';
import { pokemonWantFits, wantToken, type PokemonSighting } from '../pogo/wants.js';
import type { BoxSubject } from '../pogo/want-boxes.js';
import type { TaskReward } from '../research/task.js';
import { typeKeyOf } from '../rocket/lineups.js';
import {
  ANY_LEADER,
  boxTarget,
  isCostumedTarget,
  readTargetWantArgs,
  targetWantArgs,
  targetWantToken,
  type TargetWant,
} from './target-wants.js';

/**
 * Why a member is told about something by direct message: a want of theirs is for it, the gym
 * is one they target, the egg they are signed up for got its boss and they asked to hear that,
 * or a train was made and they asked to hear of new trains. One message may have several.
 */
export type NotifyReason =
  /** `costumed` (plan 8R-4): the want is costumed only, and is named so ("Costumed Pikachu"). */
  | { kind: 'want'; target: NotificationTarget; costumed?: true }
  | { kind: 'gym'; gymId: number }
  | {
      kind: 'boss-set';
      /**
       * The boss it is about (`bossId`), where a reason is remembered: a member is told
       * whenever it is another than the last boss they were told for the raid (Matt,
       * 2026-10-13). Absent where only the setting matters (the button that switches it off).
       */
      boss?: string;
    }
  | { kind: 'new-train' }
  /** A want of `TargetWant` (plan 8R-1): a research reward, a Dynamax or Gigantamax box. */
  | { kind: 'target'; want: TargetWant }
  /**
   * Every box of a Pokémon, a form or a tier (plan 8R-1): what the Remove of a line of `/wants`
   * takes away. No direct message names it.
   */
  | { kind: 'subject'; subject: BoxSubject };

/**
 * A reason as one text, the same for the same reason: what the memory of what was already told
 * goes by. Not for a custom id (`stopArgs` spells a reason for that).
 */
export function reasonKey(reason: NotifyReason): string {
  switch (reason.kind) {
    case 'want':
      return `want:${wantToken(reason.target)}`;
    case 'gym':
      return `gym:${String(reason.gymId)}`;
    case 'boss-set':
      // Per boss: the message for one boss is not the message for another.
      return reason.boss === undefined ? reason.kind : `${reason.kind}:${reason.boss}`;
    case 'new-train':
      return reason.kind;
    case 'target':
      return `target:${targetWantToken(reason.want)}`;
    case 'subject':
      return reason.subject.kind === 'tier'
        ? `subject:tier:${reason.subject.level}`
        : `subject:pokemon:${String(reason.subject.dex)}:${reason.subject.form ?? ''}`;
  }
}

/**
 * A reason as one text as a direct message shows it: `reasonKey`, and costumed where the want is
 * (plan 8R-4: "Costumed Pikachu" is not "Pikachu"), so that members told of one event share a
 * message only where it names their reasons alike.
 */
export function shownReasonKey(reason: NotifyReason): string {
  const costumed =
    (reason.kind === 'want' && reason.costumed === true) ||
    (reason.kind === 'target' && isCostumedTarget(reason.want));
  return costumed ? `${reasonKey(reason)}:costumed` : reasonKey(reason);
}

/** A raid's boss as one text, the same for the same boss: what `boss-set` is remembered as. */
export function bossId(boss: { key: string } | { name: string }): string {
  return 'key' in boss ? `key:${boss.key}` : `name:${boss.name}`;
}

/** A raid as far as wants are matched against it. */
export interface RaidSighting {
  tier: RaidTier;
  /**
   * The catalogue entry of the boss, and whether the list has it costumed (plan 8R-4,
   * `ShownBoss.costumed`). Undefined for an egg, and for a boss the game data does not know:
   * such a raid is for its tier and its gym only.
   */
  boss: (PokemonSighting & { costumed: boolean }) | undefined;
}

/** A want that fired as the reason of a direct message: its target, and costumed if it is. */
export function wantReason(want: Want): NotifyReason {
  return {
    kind: 'want',
    target: want.target,
    ...(want.costumed === true ? { costumed: true as const } : {}),
  };
}

/**
 * The numbers under which a want for this raid may be stored (`PokemonNotification.pokemon`):
 * the boss's Pokédex number and the code of the tier. What `WantStorage.wanting` is asked for;
 * a row found by them is a candidate, which `raidWantsFiring` judges.
 */
export function raidNumbers(raid: RaidSighting): number[] {
  const tier = tierCode(raid.tier);
  return [...(raid.boss ? [raid.boss.dex] : []), ...(tier === undefined ? [] : [tier])];
}

/**
 * Those of a member's wants that are for this raid, in their order, each as the member has it
 * (with its `costumed`):
 *
 * - a want for a Pokémon in raids (scope `raid` or `both`) that fits the boss
 *   (`pokemonWantFits`): the species in any form, the one form, and a want for shadow raids
 *   only when the raid is one; a costumed want only when the list has the boss costumed;
 * - a want for the raid's tier: the very tier, so a want for T5 is for ordinary tier 5 raids
 *   and not for shadow ones, and a want for shadow T5 for those alone (Matt, 2026-10-10). An
 *   egg fires nothing else.
 *
 * Elite raids are raids like any other here.
 */
export function raidWantsFiring(
  catalogue: Pick<PokemonCatalogue, 'byKey'>,
  wants: readonly Want[],
  raid: RaidSighting,
): Want[] {
  return wants.filter((want) => {
    if (want.scope === 'spawn') return false;
    const { target } = want;
    if (target.kind === 'tier') return sameRaidTier(target.tier, raid.tier);
    if (target.kind === 'iv') return false;
    return pokemonWantFits(catalogue, target, raid.boss, raid.tier.shadow, want.costumed === true);
  });
}

/**
 * The targets a want for a max battle's boss may be stored under (`TargetWant`; plan 8R-1,
 * design 2026-10-21-stop-reports-design.md, Matt's answer 9): its Dynamax or Gigantamax box,
 * of the species and of the boss's own entry. What `TargetWantStorage.wanting` is asked for.
 */
export function maxTargets(
  boss: { dex: number; key: string },
  kind: 'dynamax' | 'gigantamax',
): TargetWant[] {
  return [boxTarget(kind, boss.dex), boxTarget(kind, boss.dex, boss.key)];
}

/**
 * Those of a member's targets that are for a max battle's boss (plan 8X-3; changed by plan 8R-1:
 * a species want no longer covers its max battles, Matt's answer 9 of the stop reports design):
 * the Dynamax box (`dynamax:<dex>[:<form>]`) of a Dynamax battle, the Gigantamax box of a
 * Gigantamax one, of the species (every form) or of the boss's own entry (its key as the
 * catalogue resolves it). No tier want fires: every report names its boss. A boss the game data
 * does not know fires nothing. No max boss is costumed so far (Matt, plan 8R-4): a costumed box
 * never fires.
 */
export function maxWantsFiring(
  catalogue: Pick<PokemonCatalogue, 'byKey'>,
  wants: readonly TargetWant[],
  boss: { dex: number; key: string } | undefined,
  kind: 'dynamax' | 'gigantamax',
): TargetWant[] {
  if (!boss) return [];
  return wants.filter(
    (want) =>
      want.kind === kind &&
      pokemonWantFits(
        catalogue,
        pokemonTarget(want.dex, want.form),
        { dex: boss.dex, key: boss.key, costumed: false },
        false,
        isCostumedTarget(want),
      ),
  );
}

/**
 * Whether a research reward is costumed (plan 8R-4, design 5): the costume test of its Leek Duck
 * name and picture, worked out when it is read, so that rewards stored before 8R-4 count too. A
 * reward a member typed (no picture, the game data's name) is not.
 */
export function rewardCostumed(
  catalogue: PokemonCatalogue,
  reward: Extract<TaskReward, { kind: 'encounter' }>,
): boolean {
  return costumedByName(catalogue, reward.name, reward.image ?? undefined);
}

/**
 * The targets a want for a research task's rewards may be stored under (`TargetWant`; plan 8R-1,
 * design 7): each encounter's species and its own entry, each item, each species' Mega Energy.
 * What `TargetWantStorage.wanting` is asked for. A reward the game data does not know has none.
 */
export function researchTargets(rewards: readonly TaskReward[]): TargetWant[] {
  const targets: TargetWant[] = [];
  const add = (want: TargetWant): void => {
    if (!targets.some((known) => targetWantToken(known) === targetWantToken(want)))
      targets.push(want);
  };
  for (const reward of rewards) {
    if (reward.kind === 'encounter' && reward.dex !== null && reward.key !== null) {
      add(boxTarget('research-pokemon', reward.dex));
      add(boxTarget('research-pokemon', reward.dex, reward.key));
    } else if (reward.kind === 'item') {
      add({ kind: 'research-item', item: reward.item });
    } else if (reward.kind === 'energy' && reward.dex !== null) {
      add({ kind: 'research-energy', dex: reward.dex });
    }
  }
  return targets;
}

/**
 * Those of a member's targets a research task may reward (design 7, "Matching"): a Pokémon's
 * Research box that fits one of its encounters (`pokemonWantFits`: the species in any form, the
 * one form; a costumed box only a costumed encounter, `rewardCostumed`), an item it gives
 * (whatever the quantity), the Mega Energy of a species it gives.
 */
export function researchWantsFiring(
  catalogue: PokemonCatalogue,
  wants: readonly TargetWant[],
  rewards: readonly TaskReward[],
): TargetWant[] {
  return wants.filter((want) => {
    switch (want.kind) {
      case 'research-pokemon':
        return rewards.some(
          (reward) =>
            reward.kind === 'encounter' &&
            reward.dex !== null &&
            reward.key !== null &&
            pokemonWantFits(
              catalogue,
              pokemonTarget(want.dex, want.form),
              { dex: reward.dex, key: reward.key, costumed: rewardCostumed(catalogue, reward) },
              false,
              isCostumedTarget(want),
            ),
        );
      case 'research-item':
        return rewards.some((reward) => reward.kind === 'item' && reward.item === want.item);
      case 'research-energy':
        return rewards.some((reward) => reward.kind === 'energy' && reward.dex === want.dex);
      default:
        return false;
    }
  });
}

/**
 * The targets a want for a Rocket report may be stored under (`TargetWant`; plan 8R-2, design
 * 7): its own who (`grunt:water`, `leader:arlo`, `giovanni`, `decoy`; a lineup's report its grunt
 * type's, `typeKeyOf`, plan 8R-4L: wants stay by type), and for a leader any leader too. What
 * `TargetWantStorage.wanting` is asked for.
 */
export function rocketTargets(subjectKey: string): TargetWant[] {
  const own: TargetWant = { kind: 'rocket', who: typeKeyOf(subjectKey) };
  return subjectKey.startsWith('leader:') ? [own, { kind: 'rocket', who: ANY_LEADER }] : [own];
}

/** Those of a member's targets a Rocket report is for (`rocketTargets`). */
export function rocketWantsFiring(wants: readonly TargetWant[], subjectKey: string): TargetWant[] {
  const fired = new Set(rocketTargets(subjectKey).map(targetWantToken));
  return wants.filter((want) => want.kind === 'rocket' && fired.has(targetWantToken(want)));
}

/** A Pokémon that can be caught from a Rocket report, as the game data has it. */
export interface RocketCatchEntry {
  dex: number | null;
  key: string | null;
}

/**
 * The numbers under which a shadow want for a Rocket report's catches may be stored
 * (`PokemonNotification.pokemon`): the catches' Pokédex numbers. What `WantStorage.wanting` is
 * asked for; a row found by them is a candidate, which `rocketShadowFiring` judges.
 */
export function rocketShadowNumbers(catches: readonly RocketCatchEntry[]): number[] {
  return [...new Set(catches.flatMap((one) => (one.dex === null ? [] : [one.dex])))];
}

/**
 * Those of a member's wants a Rocket report fires (design 7, Matt's answer 1): a shadow want
 * (Shadow box: shadow raids and Rocket catches) of a Pokémon it can give, the species in any form
 * or the very form (`pokemonWantFits`, as the shadow row is keyed). Raid and spawn wants are not.
 * No Rocket catch is costumed so far (Matt, plan 8R-4): a costumed shadow want never fires.
 */
export function rocketShadowFiring(
  catalogue: Pick<PokemonCatalogue, 'byKey'>,
  wants: readonly Want[],
  catches: readonly RocketCatchEntry[],
): Want[] {
  return wants.filter(
    ({ target, costumed }) =>
      target.kind === 'pokemon' &&
      target.shadow === true &&
      catches.some(
        (one) =>
          one.dex !== null &&
          one.key !== null &&
          pokemonWantFits(
            catalogue,
            target,
            { dex: one.dex, key: one.key, costumed: false },
            true,
            costumed === true,
          ),
      ),
  );
}

/** A reported wild Pokémon as far as wants are matched against it. */
export interface SpawnSighting {
  /**
   * The catalogue entry that was reported, and whether it is costumed (plan 8R-4: an active
   * event lists it costumed).
   */
  pokemon: PokemonSighting & { costumed: boolean };
  /** Set when the report says its IVs are perfect or zero. */
  iv?: 'perfect' | 'zero' | undefined;
}

/** The numbers under which a want for this spawn may be stored (see `raidNumbers`). */
export function spawnNumbers(spawn: SpawnSighting): number[] {
  return [spawn.pokemon.dex, ...(spawn.iv === undefined ? [] : [ivCode(spawn.iv)])];
}

/**
 * Those of a member's wants that are for this spawn, in their order: a want for the Pokémon in
 * the wild (scope `spawn` or `both`; a want for shadow raids or for a mega is about raids and
 * never fits; a costumed want only for a costumed spawn), and the want for perfect or zero IVs
 * when the report says so.
 */
export function spawnWantsFiring(
  catalogue: Pick<PokemonCatalogue, 'byKey'>,
  wants: readonly Want[],
  spawn: SpawnSighting,
): Want[] {
  return wants.filter((want) => {
    if (want.scope === 'raid') return false;
    const { target } = want;
    if (target.kind === 'iv') return target.iv === spawn.iv;
    if (target.kind === 'tier') return false;
    return pokemonWantFits(catalogue, target, spawn.pokemon, false, want.costumed === true);
  });
}

/**
 * A reason as the arguments of a custom id (`dm:<server>:stop:<these>`): what the button under
 * a direct message carries to stop it. `wantToken` does not fit there: it has `:` in it and an
 * empty part for the shadow raids of a species, and the custom-id codec takes neither. So the
 * kind and the shadow flag are one word, and nothing is ever empty:
 *
 * - `p:<dex>` a species, `p:<dex>:<form>` one form (its catalogue key);
 * - `ps:<dex>` and `ps:<dex>:<form>` the shadow raids of either;
 * - `t:<level>` a raid tier, `ts:<level>` its shadow raids (the level as `RaidLevel` spells it);
 * - `iv:perfect`, `iv:zero`;
 * - `g:<gym id>` a gym target;
 * - `boss` the setting "tell me when my egg gets its boss", `train` the setting for new trains;
 * - a want of `TargetWant` as `targetWantArgs` spells it (`rp:<dex>[:<form>]`, `ri:<item>`,
 *   `re:<dex>`, `dx:<dex>[:<form>]`, `gx:<dex>[:<form>]`; plan 8R-1; and Team GO Rocket's
 *   `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`; plan 8R-2);
 * - `sp:<dex>[:<form>]`, `st:<level>`: every box of a Pokémon or a tier (a line of `/wants`).
 *
 * A form key may be 64 characters, so with the server's snowflake before it an id can pass
 * Discord's 100: whoever builds the button leaves it out then (`encodeCustomIdIfFits`).
 */
export function stopArgs(reason: NotifyReason): string[] {
  switch (reason.kind) {
    case 'gym':
      return ['g', String(reason.gymId)];
    case 'boss-set':
      return ['boss'];
    case 'new-train':
      return ['train'];
    case 'target':
      return targetWantArgs(reason.want);
    case 'subject':
      return reason.subject.kind === 'tier'
        ? ['st', reason.subject.level]
        : [
            'sp',
            String(reason.subject.dex),
            ...(reason.subject.form === undefined ? [] : [reason.subject.form]),
          ];
    case 'want': {
      const { target } = reason;
      if (target.kind === 'iv') return ['iv', target.iv];
      if (target.kind === 'tier') return [target.tier.shadow ? 'ts' : 't', target.tier.level];
      return [
        target.shadow ? 'ps' : 'p',
        String(target.dex),
        ...(target.form === undefined ? [] : [target.form]),
      ];
    }
  }
}

/**
 * The reason that arguments of a custom id spell (`stopArgs`); undefined for anything else,
 * also for a tier that cannot be wanted, a number that is no Pokédex number or gym id, and a
 * form that cannot be a catalogue key. Whether the Pokémon or the gym exists is not asked: the
 * button removes what the member has, whatever the game data says today.
 */
export function parseStopArgs(args: readonly string[]): NotifyReason | undefined {
  const [kind, value, extra, ...more] = args;
  if (more.length > 0) return undefined;
  const target = readTargetWantArgs(args);
  if (target) return { kind: 'target', want: target };
  if (kind === 'st' && value !== undefined && extra === undefined && isRaidLevel(value)) {
    return { kind: 'subject', subject: { kind: 'tier', level: value } };
  }
  if (kind === 'sp' && value !== undefined && /^[1-9]\d*$/.test(value)) {
    if (!isPokedexNumber(Number(value)) || (extra !== undefined && !isFormKey(extra))) {
      return undefined;
    }
    return {
      kind: 'subject',
      subject:
        extra === undefined
          ? { kind: 'pokemon', dex: Number(value) }
          : { kind: 'pokemon', dex: Number(value), form: extra },
    };
  }
  if (kind === 'boss' || kind === 'train') {
    if (value !== undefined) return undefined;
    return { kind: kind === 'boss' ? 'boss-set' : 'new-train' };
  }
  if (value === undefined) return undefined;
  if (kind === 'p' || kind === 'ps') {
    if (!/^[1-9]\d*$/.test(value) || !isPokedexNumber(Number(value))) return undefined;
    if (extra !== undefined && !isFormKey(extra)) return undefined;
    return { kind: 'want', target: pokemonTarget(Number(value), extra, kind === 'ps') };
  }
  if (extra !== undefined) return undefined;
  if (kind === 'g') {
    if (!/^[1-9]\d{0,9}$/.test(value)) return undefined;
    return { kind: 'gym', gymId: Number(value) };
  }
  if (kind === 'iv') {
    return value === 'perfect' || value === 'zero'
      ? { kind: 'want', target: { kind: 'iv', iv: value } }
      : undefined;
  }
  if ((kind === 't' || kind === 'ts') && isRaidLevel(value)) {
    const tier = raidTier(value, kind === 'ts');
    return tier && isNotificationTier(tier)
      ? { kind: 'want', target: { kind: 'tier', tier } }
      : undefined;
  }
  return undefined;
}
