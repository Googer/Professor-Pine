import type { MaxTier } from '../pogo/max-tier.js';
import { sameRaidTier, type RaidTier } from '../pogo/raid-tier.js';
import type { RaidDurationRules } from '../time/raid-durations.js';
import { setMaxBoss } from './max.js';
import {
  isMax,
  isRaid,
  type MaxParty,
  type Party,
  type RaidBossRef,
  type RaidParty,
} from './party.js';
import { blocksNewRaid, setBoss } from './raid.js';

/**
 * A boss that staff moved to another tier by an add (plan 8X-J, Matt's answer 4): the boss as the
 * list has it (its `Boss.key`, and the names the list had for it at the tiers it moved from, by
 * which a party stores a boss the game data lacks; review J6),
 * the tiers the add moved it from (`familyReport`'s `moved`) and the add's tier. Raid tiers move
 * raids, max tiers max battles.
 */
export interface BossTierMove {
  boss: { key: string; names: readonly string[] };
  from: readonly (RaidTier | MaxTier)[];
  to: RaidTier | MaxTier;
}

/** Whether a party's boss is the moved boss: by its key, or by name for one the game data lacks. */
function isMovedBoss(ref: RaidBossRef | null, boss: BossTierMove['boss']): boolean {
  if (ref === null) return false;
  return 'key' in ref ? ref.key === boss.key : boss.names.includes(ref.name);
}

/**
 * A running battle moved with its boss (plan 8X-J): a max battle or a raid of the moved boss, at
 * a tier it moved from, active and with its end still ahead at `now` (a raid: not ended by the
 * clock, `blocksNewRaid`, also without an end time; plan 8E), gets the add's tier and
 * whatever follows from it (its title, post and `/counters` are drawn from the party). A max
 * battle keeps its boss, its end and since when it has the boss (`setMaxBoss`, never between
 * Dynamax and Gigantamax); a raid keeps its boss and moves (`setBoss`, which works its times out
 * again only when the tier is another kind of raid). The very same party otherwise: an egg, a
 * meetup, a train, another boss, another tier, a battle over or ended. Removing the add or its
 * expiry moves nothing back.
 */
export function bossTierMoved(
  party: Party,
  move: BossTierMove,
  rules: RaidDurationRules,
  now: number,
): Party {
  if (isMax(party)) return maxBossTierMoved(party, move, now);
  if (isRaid(party)) return raidBossTierMoved(party, move, rules, now);
  return party;
}

/** Whether a max battle is still on at `now`: active, and its end (if any) ahead. */
function running(party: Party, now: number): boolean {
  return party.status === 'active' && (party.endTime === null || party.endTime > now);
}

/** `bossTierMoved` for a max battle. */
export function maxBossTierMoved(party: MaxParty, move: BossTierMove, now: number): MaxParty {
  const { to } = move;
  if (!running(party, now) || typeof to !== 'string') return party;
  if (!isMovedBoss(party.max.boss, move.boss)) return party;
  if (!move.from.some((tier) => tier === party.max.tier)) return party;
  const set = setMaxBoss(party, party.max.boss, to, party.max.bossSince);
  return set.ok ? set.party : party;
}

/** `bossTierMoved` for a raid (`RaidChangeService.moveBossTier` runs it under a raid's rules). */
export function raidBossTierMoved(
  party: RaidParty,
  move: BossTierMove,
  rules: RaidDurationRules,
  now: number,
): RaidParty {
  const { to } = move;
  // A raid runs while it blocks its gym (review E1 of plan 8E): one over by the clock without an
  // end time (past its last possible time, not yet archived) is not brought back by a move.
  if (!blocksNewRaid(party, now) || typeof to === 'string') return party;
  const { raid } = party;
  if (!isMovedBoss(raid.boss, move.boss)) return party;
  const from = move.from.filter((tier): tier is RaidTier => typeof tier !== 'string');
  if (!from.some((tier) => sameRaidTier(tier, raid.tier))) return party;
  return setBoss(
    party,
    { tier: to, boss: raid.boss, fastMove: raid.fastMove, chargedMove: raid.chargedMove },
    rules,
    now,
  ).party;
}
