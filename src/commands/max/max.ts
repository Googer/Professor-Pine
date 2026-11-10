import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import {
  MAX_CHOICE_TEXT,
  type ComponentHandler,
  type Guard,
  type SimpleCommand,
} from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { deferSubmit, pickedOf, readInTime } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import {
  guildIdOf,
  isStaff,
  regionChannelOf,
  requireGuild,
  requireRegion,
} from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
import type { MaxParty, MaxSpot } from '../../domain/party/party.js';
import { endsSoon, nextRotationEnd } from '../../domain/time/max-end.js';
import {
  ENDING_SOON,
  endingSoonDialog,
  MAX_END_INPUT,
  MAX_KIND,
  NEXT_ROTATION,
} from '../../render/max-dialog.js';
import type { Member } from '../../services/attendance-service.js';
import { PendingRequests } from '../../services/pending-requests.js';
import {
  isPinText,
  maxBossOptions,
  maxEndInput,
  readMaxBoss,
  readSpot,
  reportedEnd,
  TIER_CHOICES,
  type ReadMaxBoss,
} from './max-input.js';
import {
  blockedAtPin,
  ENDED_MEANWHILE,
  MAX_BARRED,
  MAX_COMMAND,
  MAX_PIN_BLOCKED,
  MAX_THROTTLE,
  maxBarred,
  maxReportWords,
  otherBoss,
  reportMaxAs,
  takenWords,
  type MaxAccess,
} from './max-report.js';
import { MAX_PLACE_TEXT, nearChoices, regionSpotChoices } from '../place-option.js';
import {
  chooseMaxShotSpot,
  confirmMaxShot,
  reportMaxFromScreenshot,
  requireReadableEnd,
  screenshotOf,
  shotCarriesOn,
} from './max-screenshot.js';
import { MAX_CHOICES } from '../choices.js';

/*
 * `/max` (plan 8X-3; design 3.2): reports a max battle at a power spot, or at a pin, "Unlisted
 * power spot" (Q7). What can be known before the work (the boss, the spot, the end, another boss
 * at the spot, a forum the member is kept out of) is refused by its guard, before the throttle.
 * A battle whose end is less than `ENDING_SOON_MINUTES` away is asked about first, in a dialog
 * (Matt, 2026-10-21), whose Submit reports it; joining the battle at the spot asks nothing.
 */

/** A report as its guard read it: what, where, until when, made where. */
export interface MaxAsk {
  boss: ReadMaxBoss;
  spot: MaxSpot;
  end: number;
  regionChannelId: string;
  /** The battle of this boss at the spot, which the report joins; undefined for a new one. */
  joins: MaxParty | undefined;
  /** The server's row (`ctx.guilds`): a spot holds one battle per server. */
  guild: number | undefined;
  /**
   * Whether `/max` asks first (the ending-soon dialog): a new battle whose end, not typed, is
   * less than `ENDING_SOON_MINUTES` away. Decided once, by the guard, and read by the deferral
   * and the command alike (review B, B1: a clock read twice could cross the mark between them,
   * and a dialog cannot follow a deferral). A typed `end:` is never asked about (B4).
   */
  asks: boolean;
  /** When `/max` counted the use, for a failure that is none of the member's doing. */
  countedAt?: number;
  /** The end one rotation later, which the ending-soon dialog offered first. */
  next?: number;
}

/** What each interaction's guard read: the command takes it (one reading in all). */
const asked = new WeakMap<ChatInputCommandInteraction, MaxAsk>();

/** The reports that wait for the ending-soon dialog's Submit. */
const pending = new PendingRequests<MaxAsk>();

/** The battle that holds the spot now in the member's server (`PartyStore.maxAt`). */
function battleThere(ctx: AppContext, ask: Pick<MaxAsk, 'guild' | 'spot'>, now: number) {
  return ask.guild === undefined ? undefined : ctx.parties.maxAt(ask.guild, ask.spot, now);
}

/** `MaxAccess` on Discord: how a member stands to a forum, through the party service. */
function accessOf(ctx: AppContext): MaxAccess {
  return {
    partyService: ctx.partyService,
    memberAccess: (forumId, memberId) => ctx.partyService.memberAccess(forumId, memberId),
  };
}

/**
 * Refuses a member blocked from meetups a new battle at a pin (`blockedAtPin`); joining the
 * battle there is allowed (fix review 4). No Appeal button: a member appeals the block with
 * `/meetup`, as for meetups.
 */
async function refuseBlockedAtPin(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  ctx: AppContext,
  spot: MaxSpot,
): Promise<void> {
  const staff = isStaff(interaction, ctx);
  if (await blockedAtPin(ctx, guildIdOf(interaction), interaction.user.id, staff, spot)) {
    throw new UserError(MAX_PIN_BLOCKED);
  }
}

/**
 * Reads the report (`readMaxBoss`, `readSpot`, `reportedEnd`) and refuses what can be known before
 * the work: another boss at the spot (Q3, the battle there named), a forum the member is kept out
 * of. Before the throttle, so that a refusal does not count.
 */
const requireMaxReport: Guard = async (interaction, ctx) => {
  if (!interaction.isChatInputCommand()) return;
  // With a screenshot, what can be known is known only once it is read (review R1).
  if (screenshotOf(interaction, ctx)) {
    requireReadableEnd(interaction, ctx);
    return;
  }
  const missing = ['boss', 'spot'].filter(
    (name) => (interaction.options.getString(name)?.trim() ?? '') === '',
  );
  if (missing.length > 0) {
    throw new UserError(
      `Give the ${missing.join(' and the ')} of the max battle (or attach a screenshot of it).`,
    );
  }
  const now = Date.now();
  const regionChannelId = regionChannelOf(interaction, ctx);
  if (regionChannelId === undefined) return;
  const boss = readMaxBoss(
    ctx,
    interaction.options.getString('boss', true),
    interaction.options.getString('tier'),
    now,
  );
  const spot = await readSpot(interaction, ctx, interaction.options.getString('spot', true));
  const endText = interaction.options.getString('end');
  const end = reportedEnd(ctx, boss.tier, endText, now);
  const guild = await ctx.guilds.idFor(guildIdOf(interaction));
  const there = battleThere(ctx, { guild, spot }, now);
  if (there && otherBoss(there, boss)) throw new UserError(takenWords(ctx, there, boss.tier));
  // A new battle only: joining the one there is what its Join button does (fix review 4).
  if (there === undefined) await refuseBlockedAtPin(interaction, ctx, spot);
  const typed = endText !== null && endText.trim() !== '';
  const ask: MaxAsk = {
    boss,
    spot,
    end,
    regionChannelId,
    joins: there,
    guild,
    asks: there === undefined && !typed && endsSoon(end, now),
  };
  if (await maxBarred(accessOf(ctx), ask, interaction.user.id)) throw new UserError(MAX_BARRED);
  asked.set(interaction, ask);
};

/**
 * Reports the battle as the member (anonymous when their privacy says so, signed up by their
 * automatic status) and answers with what came of it (`editReply`: the interaction is
 * acknowledged). A pin is said in the log for staff (Q7: "a sign to us we need to re-scrape").
 * No post made, or a battle there that ended twice while it waited, is none of the member's
 * doing: the use goes back (`givesBack`), as for a block at a pin found only by the report (the
 * battle there ended after the guard: `pin-blocked`).
 */
async function report(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  ctx: AppContext,
  ask: MaxAsk,
): Promise<void> {
  const member: Member = { id: interaction.user.id, ...memberInfo(interaction) };
  const { outcome, autoStatus } = await reportMaxAs(ctx, member, guildIdOf(interaction), ask, {
    mayJoin: async (forumId) =>
      (await ctx.partyService.memberAccess(forumId, member.id)) !== 'barred',
    staff: isStaff(interaction, ctx),
  });
  const content = maxReportWords(ctx, outcome, ask, autoStatus);
  await interaction.editReply({ content });
  // Neither is the member's doing: the use goes back. Nor does a block at a pin count, as the
  // guard's refusal (`refuseBlockedAtPin`) does not.
  if (outcome.kind === 'no-post' || outcome.kind === 'ended' || outcome.kind === 'pin-blocked') {
    throw new UserError(content, { givesBack: true, said: true });
  }
}

/** The definition: with the option `screenshot` where screenshots are read (plan 8X-S). */
function maxData(screenshots: boolean) {
  const data = new SlashCommandBuilder()
    .setName('max')
    .setDescription('Report a max battle at a Power Spot')
    .addStringOption((option) =>
      option
        .setName('boss')
        .setDescription('The boss: pick from the list, or type a Pokémon in full')
        .setRequired(!screenshots)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('spot')
        .setDescription('The Power Spot: pick from the list, or paste a maps link or coordinates')
        .setRequired(!screenshots)
        .setMaxLength(MAX_PLACE_TEXT)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('tier')
        .setDescription('Only for a boss on no list: its tier')
        .setMaxLength(MAX_CHOICE_TEXT)
        .addChoices(...TIER_CHOICES),
    )
    .addStringOption((option) =>
      option
        .setName('end')
        .setDescription('When it ends, if not the end of its rotation: 20 (minutes) or 2:30pm')
        .setMaxLength(40),
    );
  if (screenshots) {
    data.addAttachmentOption((option) =>
      option
        .setName('screenshot')
        .setDescription(
          'A screenshot of the max battle screen; I read it. It is kept a while to improve the reader',
        ),
    );
  }
  return data;
}

const DETAILS =
  "Creates a post for a max battle in the raid forum of the spot's region. Pick the boss and " +
  'the Power Spot from the lists that appear while you type (the bosses of an event that is ' +
  'on come first); a Pokémon that can Dynamax may be typed in full, with `tier` when it is on ' +
  'no list.\n\nA Power Spot I do not know can be given as a maps link or coordinates: the ' +
  'battle is then at an unlisted Power Spot.\n\nDuring a short max event (a Max Battle Day) a ' +
  'battle lasts to the next half hour, during an all-day one (a Max Monday) to the next full ' +
  'hour. Outside max events a Gigantamax battle lasts to the next full hour, a Dynamax battle ' +
  "to the day's last battle time or the start of a max event later that day. `end` sets " +
  'another.\n\nIf the Power Spot already has a battle of that boss, you are shown its ' +
  'post instead; when that one ends within five minutes, I ask first.';

const SCREENSHOT_DETAILS =
  'Or attach a screenshot of the max battle instead: I read the Power Spot, the boss, its ' +
  'tier and the time left from it, and ask only when I am not sure which Power Spot it is. ' +
  'What you type beside it counts instead of what I read.\n\nA screenshot newer than the boss of ' +
  'the battle already at the spot changes its boss, unless you typed the Power Spot or a ' +
  'different boss. The screenshot is kept for a while and may be used to improve the reader.';

function maxCommand(screenshots: boolean): SimpleCommand {
  return {
    data: maxData(screenshots),
    help: {
      category: 'raid-crud',
      details: screenshots ? `${DETAILS}\n\n${SCREENSHOT_DETAILS}` : DETAILS,
      examples: [
        '/max boss:machamp spot:Gazebo',
        '/max boss:gigantamax machamp spot:40.4406, -79.9959 end:20',
        ...(screenshots ? ['/max screenshot:(a max battle screenshot)'] : []),
      ],
    },
    guards: [requireRegion, requireMaxReport],
    // The reading of a screenshot may wait in the queue: always deferred (review R1).
    defer: (interaction, ctx) =>
      screenshotOf(interaction, ctx) || !asked.get(interaction)?.asks ? 'ephemeral' : undefined,
    throttle: MAX_THROTTLE,

    async execute(interaction, ctx) {
      const attachment = screenshotOf(interaction, ctx);
      if (attachment) {
        await reportMaxFromScreenshot(interaction, ctx, attachment);
        return;
      }
      const ask = asked.get(interaction);
      if (!ask) throw new UserError('Use `/max` again.');
      if (!ask.asks) {
        await report(interaction, ctx, ask);
        return;
      }
      const now = Date.now();
      // Nothing is read for the dialog, but the guard's reads must have left Discord's three
      // seconds for it (the slow-read rule): past them no dialog opens.
      await readInTime(ctx.log, interaction, () => Promise.resolve());
      const next = nextRotationEnd(ask.end, maxEndInput(ctx, ask.boss.tier, now));
      const token = pending.put(interaction.user.id, {
        ...ask,
        countedAt: whenCounted(interaction) ?? now,
        ...(next === undefined ? {} : { next }),
      });
      const { settings } = ctx.config;
      await interaction.showModal(
        endingSoonDialog({
          customId: encodeCustomId({ kind: MAX_KIND, id: token, action: 'report', args: [] }),
          end: ask.end,
          next,
          now,
          zone: settings.timezone,
        }),
      );
    },

    async autocomplete(interaction, ctx) {
      const focused = interaction.options.getFocused(true);
      if (focused.name === 'boss') {
        await interaction.respond(maxBossOptions(ctx, focused.value, Date.now()));
        return;
      }
      if (focused.name === 'spot' && focused.value.trim() === '') {
        // Nothing typed: the region's power spots by name (plan 8X-F), as a max train's route.
        await interaction.respond(
          regionSpotChoices(ctx, regionChannelOf(interaction, ctx)).slice(0, MAX_CHOICES),
        );
        return;
      }
      if (focused.name === 'spot' && !isPinText(focused.value)) {
        await interaction.respond(
          await nearChoices(interaction, ctx, focused.value, ['powerspot']),
        );
        return;
      }
      await interaction.respond([]);
    },
  };
}

const withScreenshots = maxCommand(true);
const withoutScreenshots = maxCommand(false);

/**
 * `/max`: as an installation that reads screenshots offers it (`ocr.enabled`), with the option
 * `screenshot` and the boss and the spot optional; otherwise without it, both required.
 */
export const max: SimpleCommand = {
  ...withScreenshots,
  forConfig: (config) => (config.settings.ocr.enabled ? withScreenshots : withoutScreenshots),
};

/**
 * The Submit of the ending-soon dialog (`max:<token>:report`): acknowledged privately, the
 * report decided again as things are then (another boss at the spot, a forum the member is kept
 * out of, the end chosen passed: refused), then made as `/max` makes it. It goes on with the use
 * `/max` counted (`carriesOn`): a post not made gives it back there.
 */
export const maxControls: ComponentHandler = {
  kind: MAX_KIND,
  // A command's guards do not cover its controls: a Submit is of a server too (review B, B5).
  guards: [requireGuild],
  carriesOn: (interaction, id) => {
    if (id.action !== 'report') return shotCarriesOn(interaction.user.id, id.id);
    const waiting = pending.peek(id.id, interaction.user.id);
    return typeof waiting === 'object' && waiting.value.countedAt !== undefined
      ? { ...MAX_THROTTLE, as: MAX_COMMAND, countedAt: waiting.value.countedAt }
      : undefined;
  },

  /** The Power Spot menu of `/max screenshot:` (plan 8X-S, review R7). */
  async select(interaction, id, ctx) {
    if (id.action !== 'spot' || !interaction.isStringSelectMenu()) {
      throw new UserError(STALE_COMPONENT);
    }
    await chooseMaxShotSpot(interaction, id.id, ctx);
  },

  /** "Report it there" and "Cancel" of `/max screenshot:`'s other region and menu. */
  async button(interaction, id, ctx) {
    if (id.action !== 'yes' && id.action !== 'no') throw new UserError(STALE_COMPONENT);
    await confirmMaxShot(interaction, id.id, id.action, ctx);
  },

  async modal(interaction, id, ctx) {
    if (id.action !== 'report') throw new UserError('That question has expired. Use `/max` again.');
    const taken = pending.take(id.id, interaction.user.id);
    if (taken === 'not-yours') throw new UserError('That is somebody else’s report.');
    if (taken === 'expired') throw new UserError('That question has expired. Use `/max` again.');
    const ask = taken.value;
    const choice = pickedOf(interaction, MAX_END_INPUT, [NEXT_ROTATION, ENDING_SOON] as const);
    // A dialog that offered a choice and comes back without one is none Pine showed (B5).
    if (ask.next !== undefined && choice === undefined) throw new UserError(STALE_COMPONENT);
    await deferSubmit(interaction);
    const now = Date.now();
    const end = choice === NEXT_ROTATION && ask.next !== undefined ? ask.next : ask.end;
    if (end <= now) throw new UserError(ENDED_MEANWHILE);
    const there = battleThere(ctx, ask, now);
    if (there && otherBoss(there, ask.boss)) {
      throw new UserError(takenWords(ctx, there, ask.boss.tier));
    }
    // A block that came while the dialog was open (G1), unless the report now joins a battle.
    if (there === undefined) await refuseBlockedAtPin(interaction, ctx, ask.spot);
    const decided: MaxAsk = { ...ask, end, joins: there };
    if (await maxBarred(accessOf(ctx), decided, interaction.user.id))
      throw new UserError(MAX_BARRED);
    await report(interaction, ctx, decided);
  },
};
