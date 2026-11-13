import { zoneOf } from '../../discord/server-values.js';
import {
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { StoredBoss } from '../../db/repositories/raid-boss-repository.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { bossReport, familyReport, type ReportedOverride } from '../../domain/pogo/boss-report.js';
import { feedLookupOf } from '../../domain/pogo/feed-lookup.js';
import { MAX_OPS, maxBossesAt } from '../../domain/pogo/max-bosses.js';
import {
  MAX_TIERS,
  maxTierLabel,
  type MaxTier,
  maxBossTierLabel,
} from '../../domain/pogo/max-tier.js';
import {
  howIdentified,
  isMegaLevel,
  type Identification,
} from '../../domain/pogo/raid-boss-feed.js';
import {
  autosetBoss,
  feedBossKey,
  overrideKeys,
  type BossOverride,
  type RaidBoss,
} from '../../domain/pogo/raid-bosses.js';
import { raidTierLabel, sameRaidTier, type RaidTier } from '../../domain/pogo/raid-tier.js';
import {
  seenTierChanges,
  tierChangeLine,
  tierChanges,
  type TierChange,
} from '../../render/boss-changes.js';
import { count, fitItems, fitMessages, LIMITS, plain, timestamp } from '../../render/text.js';
import type { FeedChange, SyncFailure, SyncResult } from '../../services/raid-boss-service.js';
import {
  BOSS_GROUP,
  bossTierLabel,
  bossTiersText,
  isMaxBossTier,
  readTier,
  tierOption,
  type BossTier,
} from './boss-input.js';

const IDENTIFIED: Readonly<Record<Identification, string>> = {
  agree: 'found by picture and name',
  'new-form': 'a form of it the game data does not know yet',
  disagree: 'picture and name disagree',
  picture: 'found by its picture',
  name: 'found by its name',
  neither: 'found by neither picture nor name',
};

const OLD_REASONS: Readonly<Record<ReportedOverride['old'][number], string>> = {
  age: 'older than 30 days',
  'feed-lists-it': 'the feed lists it now',
  'feed-dropped-it': 'the feed does not list it',
};

/** How long an override lasts: `until <date>` or `for good`. */
export function lasting(override: Pick<BossOverride, 'expiresAt'>): string {
  return override.expiresAt === null ? 'for good' : `until ${timestamp(override.expiresAt, 'd')}`;
}

/** `added (#3, until …)`, and why it may be time to remove it. */
function overrideText(reported: ReportedOverride<BossTier>): string {
  const { override, old, moved } = reported;
  const tag =
    `${actionText(override)} (#${String(override.id)}, ${lasting(override)})` +
    (moved.length > 0 ? ` · moves it from ${bossTiersText(moved)}` : '');
  return old.length === 0
    ? tag
    : `${tag} · **old?** (${old.map((reason) => OLD_REASONS[reason]).join(', ')})`;
}

/** What an override does to the boss it acts on. */
function actionText(override: BossOverride<BossTier>): string {
  switch (override.action) {
    case 'add':
      return 'added';
    case 'autoset':
      return 'eggs hatch as it';
    case 'shiny':
      return `${override.shiny ? 'can be shiny' : 'never shiny'}${override.tier === null ? ' (any raid tier)' : ''}`;
    case 'hide':
      return 'hidden';
  }
}

/** The ids a boss of the feed has, for one the game master does not know. */
const idsText = (boss: { pokemonId: string; form: string | null }): string =>
  `feed ids \`${boss.pokemonId}\`, ${boss.form === null ? 'no form' : `form \`${boss.form}\``}`;

/** One boss of the list: its name, shiny, where it came from and what acts on it. */
function bossLine(
  ctx: AppContext,
  boss: RaidBoss,
  rows: readonly StoredBoss[],
  overrides: readonly ReportedOverride[],
): string {
  const parts = [`- **${plain(boss.name)}**`];
  if (boss.shiny) parts.push('shiny');
  if (!boss.entry) parts.push(`**not in the game data** (${idsText(boss)})`);
  const [row] = rows;
  if (row) {
    const { how } = howIdentified(row.name, row.image, feedLookupOf(ctx.gameData.catalogue), {
      mega: isMegaLevel(row.tier.level),
    });
    parts.push(`from the feed, ${IDENTIFIED[how]}, since ${timestamp(row.firstSeen, 'd')}`);
  }
  for (const reported of overrides) {
    parts.push(overrideText(reported));
  }
  return parts.join(' · ');
}

/** An override that acts on no boss of the list, or hides one. */
function overrideLine(reported: ReportedOverride<BossTier>): string {
  const { override } = reported;
  const tier = override.tier === null ? 'every raid tier' : bossTierLabel(override.tier);
  return `- ${plain(reported.name)} (${tier}) · ${overrideText(reported)}`;
}

/**
 * What `/operator boss list` says: when the feed was read and what it has that Pine does not know,
 * then the bosses tier by tier as members see them, each with where it came from and what acts
 * on it, then what is hidden and what acts on nothing. With `tier`, that tier only; a max tier
 * shows the max boss list (`maxListLines`), and without a tier it follows the raid bosses.
 */
export function bossListLines(
  ctx: AppContext,
  now: number,
  zone: string,
  tier?: BossTier,
): string[] {
  if (tier !== undefined && isMaxBossTier(tier)) return maxListLines(ctx, now, zone, tier);
  return [
    ...raidListLines(ctx, now, zone, tier),
    ...(tier === undefined ? maxListLines(ctx, now, zone) : []),
  ];
}

function raidListLines(ctx: AppContext, now: number, zone: string, tier?: RaidTier): string[] {
  const admin = ctx.raidBossAdmin;
  const report = bossReport(admin.feedBosses(zone), admin.overrides(), ctx.gameData.catalogue, now);
  const inTier = (other: RaidTier | null): boolean =>
    tier === undefined || other === null || sameRaidTier(other, tier);
  const read = admin.lastSyncedAt;
  const lines = [
    read === undefined
      ? '**Raid bosses** · the feed has not been read yet'
      : `**Raid bosses** · the feed was read ${timestamp(read, 'R')}`,
  ];
  if (admin.unknownLevels.length > 0) {
    lines.push(
      'The feed has headings I do not know, whose bosses are left out: ' +
        `${fitItems(admin.unknownLevels.map(plain), 1000)}.`,
    );
  }
  const shown = report.bosses.filter((one) => inTier(one.boss.tier));
  const all = report.bosses.map((one) => one.boss);
  let previous: RaidTier | undefined;
  for (const { boss, rows, overrides } of shown) {
    if (!previous || !sameRaidTier(previous, boss.tier)) {
      const hatches = autosetBoss(all, boss.tier);
      lines.push(
        `**${raidTierLabel(boss.tier)}**` +
          (hatches ? ` · eggs hatch as ${plain(hatches.name)}` : ''),
      );
      previous = boss.tier;
    }
    lines.push(bossLine(ctx, boss, rows, overrides));
  }
  if (shown.length === 0) {
    lines.push(tier === undefined ? 'There are no raid bosses.' : 'That tier has no bosses.');
  }
  const hidden = report.hidden.filter((one) => inTier(one.override.tier));
  if (hidden.length > 0) lines.push('**Hidden**', ...hidden.map(overrideLine));
  const idle = report.idle.filter((one) => inTier(one.override.tier));
  if (idle.length > 0) {
    lines.push(
      '**Overrides that change nothing now** (their boss is hidden, or is no boss of that tier now)',
      ...idle.map(overrideLine),
    );
  }
  return lines;
}

/**
 * The max boss list (plan 8X-2), said as the raid list is: when the feed was read, the bosses
 * tier by tier from D1 to G with where each came from and what acts on it, the bosses the feed
 * lists ahead of their start (`Coming`, with when they start), then what is hidden and what acts
 * on nothing. With `tier`, that tier only.
 */
function maxListLines(ctx: AppContext, now: number, zone: string, tier?: MaxTier): string[] {
  const admin = ctx.maxBossAdmin;
  const feed = admin.feedBosses(zone);
  const report = familyReport(
    MAX_OPS,
    maxBossesAt,
    feed,
    admin.overrides(),
    ctx.gameData.catalogue,
    now,
  );
  const inTier = (other: MaxTier | null): boolean =>
    tier === undefined || other === null || other === tier;
  const read = admin.lastSyncedAt;
  const lines = [
    read === undefined
      ? '**Max bosses** · the feed has not been read yet'
      : `**Max bosses** · the feed was read ${timestamp(read, 'R')}`,
  ];
  if (admin.unknownLevels.length > 0) {
    lines.push(
      'The feed has tiers I do not know, whose bosses are left out: ' +
        `${fitItems(admin.unknownLevels.map(plain), 1000)}.`,
    );
  }
  const shown = report.bosses.filter((one) => inTier(one.boss.tier));
  for (const shownTier of MAX_TIERS) {
    const ofTier = shown.filter((one) => one.boss.tier === shownTier);
    if (ofTier.length === 0) continue;
    lines.push(`**${maxTierLabel(shownTier)}**`);
    for (const { boss, rows, overrides } of ofTier) {
      const parts = [`- **${plain(boss.name)}**`];
      if (boss.shiny) parts.push('shiny');
      if (!boss.entry) parts.push(`**not in the game data** (${idsText(boss)})`);
      const [row] = rows;
      if (row) parts.push(`from the feed, since ${timestamp(row.firstSeen, 'd')}`);
      for (const reported of overrides) parts.push(overrideText(reported));
      lines.push(parts.join(' · '));
    }
  }
  if (shown.length === 0) {
    lines.push(tier === undefined ? 'There are no max bosses.' : 'That tier has no bosses.');
  }
  // The upcoming bosses as `/max` offers them (`coming`: an add's move and a hide apply), each
  // with the start its feed row holds.
  const coming = ctx.maxBosses.coming(zone).flatMap((boss) => {
    const row = feed.find(
      (one) =>
        one.firstSeen > now &&
        one.tier === boss.tier &&
        one.pokemonId === boss.pokemonId &&
        one.form === boss.form,
    );
    return row && inTier(boss.tier) ? [{ boss, row }] : [];
  });
  if (coming.length > 0) {
    lines.push(
      '**Coming**',
      ...coming.map(
        ({ boss, row }) =>
          `- **${plain(boss.name)}** (${maxBossTierLabel({ key: boss.entry?.key }, boss.tier)}) · from ${timestamp(row.firstSeen, 'f')}`,
      ),
    );
  }
  const hidden = report.hidden.filter((one) => inTier(one.override.tier));
  if (hidden.length > 0) lines.push('**Hidden**', ...hidden.map(overrideLine));
  const idle = report.idle.filter((one) => inTier(one.override.tier));
  if (idle.length > 0) {
    lines.push(
      '**Overrides that change nothing now** (their boss is hidden, or is no boss of that tier now)',
      ...idle.map(overrideLine),
    );
  }
  return lines;
}

/**
 * The lines in blocks: a heading (a line that is no item, `- …`) with the items under it, so
 * that a split between messages does not leave a heading at the end of one and its bosses in the
 * next. A block too long for one message is left as its lines.
 */
export function keptTogether(lines: readonly string[]): string[] {
  const blocks: string[][] = [];
  for (const line of lines) {
    const last = blocks.at(-1);
    if (line.startsWith('- ') && last) last.push(line);
    else blocks.push([line]);
  }
  return blocks.flatMap((block) => {
    const joined = block.join('\n');
    return joined.length <= LIMITS.content ? [joined] : block;
  });
}

/** Sends lines as one answer and as many private follow-ups as they need. */
async function sendLines(
  interaction: ChatInputCommandInteraction,
  lines: readonly string[],
): Promise<void> {
  const [first = '', ...rest] = fitMessages(keptTogether(lines));
  await interaction.editReply({ content: first });
  for (const more of rest) {
    await interaction.followUp({ content: more, flags: MessageFlags.Ephemeral });
  }
}

/** `/operator boss list`. */
export const listBosses: SubcommandPart = {
  group: BOSS_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('list')
    .setDescription('Show the boss lists, where each boss came from, and your overrides')
    .addStringOption(tierOption(false, 'Only this tier')),
  help: {
    details:
      'The bosses tier by tier as members see them. Each says whether it came from the feed ' +
      '(and how the feed entry was identified: by its picture, its name or both) or from an ' +
      'override, and what overrides act on it with their number and expiry; an add that moves ' +
      "a boss from the feed's tier says which.\n\nA boss the game " +
      'data does not know yet is listed by the name the feed gives, with its ids. Hidden ' +
      'bosses and overrides that change nothing are listed apart; an override older than 30 ' +
      'days, or one the feed has made pointless, is marked "old?".\n\nWhere max battles are on, ' +
      "the max bosses follow (Pokebattler's feed), with the bosses it lists ahead of their start " +
      'under Coming; a max battle tier shows that tier only.',
    examples: [
      '/operator boss list',
      '/operator boss list tier:T5',
      '/operator boss list tier:Gigantamax',
    ],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const value = interaction.options.getString('tier');
    const tier = value === null ? undefined : readTier(value);
    await sendLines(interaction, bossListLines(ctx, Date.now(), zoneOf(interaction, ctx), tier));
  },
};

/** Why a read failed, as staff are told it: never the address, never a database message. */
function failureText(kind: SyncFailure, httpStatus: number | undefined): string {
  switch (kind) {
    case 'status':
      return `the feed answered ${String(httpStatus ?? 'with an error')}`;
    case 'timeout':
      return 'the feed did not answer in time';
    case 'unreachable':
      return 'the feed could not be reached';
    case 'unreadable':
      return 'the feed sent something I cannot read';
    case 'storing':
      return 'something went wrong while storing it (see the log)';
    case 'stopped':
      return 'I am shutting down';
  }
}

/** Whether two lists of tier changes name the same bosses per tier, in whatever order. */
function sameTierChanges(a: readonly TierChange[], b: readonly TierChange[]): boolean {
  const key = (changes: readonly TierChange[]): string =>
    changes
      .map(
        (change) =>
          `${raidTierLabel(change.tier)}|${[...change.added].sort().join(',')}|` +
          [...change.removed].sort().join(','),
      )
      .sort()
      .join('\n');
  return key(a) === key(b);
}

/** Whether an override in force acts on a Pokémon that the feed or what members see changed. */
function overrideActsOn(ctx: AppContext, change: FeedChange): boolean {
  const { catalogue } = ctx.gameData;
  const keys = new Set([
    ...[...change.added, ...change.removed].map((boss) => feedBossKey(boss, catalogue).key),
    ...[...change.seen.added, ...change.seen.removed].map((boss) => boss.key),
  ]);
  const keyOf = overrideKeys(ctx.raidBossAdmin.feedBosses(), catalogue);
  return ctx.raidBossAdmin.overrides().some((override) => keys.has(keyOf(override).key));
}

/** What `/operator boss sync` says of a read of the feed. */
export function syncLines(ctx: AppContext, result: SyncResult): string[] {
  const read = ctx.raidBossAdmin.lastSyncedAt;
  if (result.status === 'failed') {
    return [
      `I could not read the raid boss feed: ${failureText(result.kind, result.httpStatus)}.`,
      read === undefined
        ? 'It has never been read; the list has no bosses but your overrides.'
        : `The list stays as it was when the feed was last read, ${timestamp(read, 'R')}.`,
    ];
  }
  const lines: string[] = [];
  if (result.status === 'unchanged') {
    lines.push('The feed lists the same bosses as before.');
  } else {
    const changes = tierChanges(result.change, ctx.gameData.catalogue);
    lines.push(
      changes.length === 0
        ? 'The feed renamed some bosses, but members see the same list.'
        : 'The feed lists other bosses now:',
      ...changes.map((change) => `- ${tierChangeLine(change)}`),
    );
    // What members see is said apart only when it differs (per tier, whatever the order of the
    // names) because an override in force acts on a Pokémon that changed; a difference without
    // one (a costume that stays beside a plain form that went) is told by the feed's lines.
    const seenChanges = seenTierChanges(result.change.seen);
    if (!sameTierChanges(changes, seenChanges) && overrideActsOn(ctx, result.change)) {
      lines.push(
        seenChanges.length === 0
          ? 'Members see no change, with the overrides in force.'
          : 'Members see this, with the overrides in force:',
        ...seenChanges.map((change) => `- ${tierChangeLine(change)}`),
      );
    }
  }
  if (result.unknownLevels) {
    lines.push(
      'The feed has headings I do not know, whose bosses are left out: ' +
        `${fitItems(result.unknownLevels.map(plain), 1000)}. If one is a tier that is missing ` +
        'from the list, add its bosses with `/operator boss add` until I learn the heading.',
    );
  }
  if (result.shrank) {
    lines.push(
      `**The feed lists ${count(result.shrank.after, 'boss', 'bosses')} where it listed ` +
        `${String(result.shrank.before)}.** If that is not the rotation, the feed may be ` +
        'broken; `/operator boss list` shows what is left, and `/operator boss add` puts a boss back.',
    );
  }
  return lines;
}

/**
 * What `/operator boss sync max:True` says of a read of the max boss feed (plan 8X-2): whether it
 * was read, and how many bosses came and went, and the tiers it does not know. `read` is when it
 * was last read before.
 */
export function maxSyncLines(read: number | undefined, result: SyncResult<MaxTier>): string[] {
  if (result.status === 'failed') {
    return [
      `I could not read the max boss feed: ${failureText(result.kind, result.httpStatus)}.`,
      read === undefined
        ? 'It has never been read; the list has no bosses but your overrides.'
        : `The list stays as it was when the feed was last read, ${timestamp(read, 'R')}.`,
    ];
  }
  const lines =
    result.status === 'unchanged'
      ? ['The max boss feed lists the same bosses as before.']
      : [
          'The max boss feed lists other bosses now: ' +
            `${count(result.change.added.length, 'boss', 'bosses')} came, ` +
            `${String(result.change.removed.length)} went. \`/operator boss list\` shows them.`,
        ];
  if (result.unknownLevels) {
    lines.push(
      'The feed has tiers I do not know, whose bosses are left out: ' +
        `${fitItems(result.unknownLevels.map(plain), 1000)}.`,
    );
  }
  return lines;
}

/** `/operator boss sync`. */
export const syncBosses: SubcommandPart = {
  group: BOSS_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('sync')
    .setDescription('Read the raid boss feed now, instead of at the next hourly read')
    .addBooleanOption((option) =>
      option
        .setName('max')
        .setDescription('Read the max boss feed instead (where max battles are on)'),
    ),
  help: {
    details:
      'Reads the feed at once and says what changed. A read that fails leaves the list as it ' +
      'was.\n\nThe game data (names, stats, forms) is not read again by this. With `max:True` it ' +
      "reads the max boss feed (Pokebattler's) instead.",
    examples: ['/operator boss sync', '/operator boss sync max:True'],
  },
  defer: 'ephemeral',
  // A read asks a server of somebody else's; staff need it now and then, not in a loop.
  throttle: { uses: 3, perSeconds: 60 },
  async execute(interaction, ctx) {
    if (interaction.options.getBoolean('max') === true) {
      const admin = ctx.maxBossAdmin;
      await sendLines(interaction, maxSyncLines(admin.lastSyncedAt, await admin.sync()));
      return;
    }
    const result = await ctx.raidBossAdmin.sync();
    await sendLines(interaction, syncLines(ctx, result));
  },
};
