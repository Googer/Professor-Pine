/**
 * A server's setup (plan 19C-2, `servers.md`; spec "Joining, the setup state, leaving"): the
 * items of `/admin setup`'s checklist, each done or not by what the server has, and whether the
 * required ones are all done, which takes a server out of setup. Pure: one rule for the checklist,
 * the leaving and anything else that asks.
 */

/** The channels by their role an item reads (`ServerValues.channels`). */
type SetupChannel =
  | 'bot-lab'
  | 'mod-bot-lab'
  | 'moderation'
  | 'events'
  | 'unown'
  | 'elite-gym-raids'
  | 'remote-raids'
  | 'pvp'
  | 'bot-updates';

/** What the items read of a server. */
export interface SetupFacts {
  /** The server's values: its own zone (none until its staff choose one), its channels by role. */
  values: {
    timezone?: string | undefined;
    channels: Partial<Record<SetupChannel, string>>;
  };
  /** How many of its regions have an outline. */
  regions: number;
  /** How many gyms it has. */
  gyms: number;
}

/** The items of the checklist, in its order. */
export const SETUP_ITEMS = [
  'timezone',
  'bot-lab',
  'mod-bot-lab',
  'region',
  'moderation',
  'events',
  'channels',
  'gyms',
] as const;
export type SetupItemKey = (typeof SETUP_ITEMS)[number];

/** Those without which a server stays in setup: time zone, both bot labs, one region. */
export const REQUIRED_ITEMS: ReadonlySet<SetupItemKey> = new Set([
  'timezone',
  'bot-lab',
  'mod-bot-lab',
  'region',
]);

/** The other channels, one item: each is done or not by itself (`otherChannels`). */
export const OTHER_CHANNELS = [
  'unown',
  'elite-gym-raids',
  'remote-raids',
  'pvp',
  'bot-updates',
] as const satisfies readonly SetupChannel[];

export interface SetupItem {
  key: SetupItemKey;
  required: boolean;
  done: boolean;
}

/** The other channels set, of `OTHER_CHANNELS`. */
export function otherChannels(facts: SetupFacts): number {
  return OTHER_CHANNELS.filter((role) => facts.values.channels[role] !== undefined).length;
}

function itemDone(key: SetupItemKey, facts: SetupFacts): boolean {
  const { channels } = facts.values;
  switch (key) {
    case 'timezone':
      return facts.values.timezone !== undefined;
    case 'bot-lab':
    case 'mod-bot-lab':
    case 'moderation':
    case 'events':
      return channels[key] !== undefined;
    case 'region':
      return facts.regions > 0;
    case 'channels':
      return otherChannels(facts) === OTHER_CHANNELS.length;
    case 'gyms':
      return facts.gyms > 0;
  }
}

/** The checklist's items, in its order, each required or not and done or not. */
export function setupItems(facts: SetupFacts): SetupItem[] {
  return SETUP_ITEMS.map((key) => ({
    key,
    required: REQUIRED_ITEMS.has(key),
    done: itemDone(key, facts),
  }));
}

/** Whether every required item is done: the server leaves setup. */
export function setupDone(facts: SetupFacts): boolean {
  return setupItems(facts).every((item) => !item.required || item.done);
}
