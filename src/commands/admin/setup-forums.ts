import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { MAX_FORUM_TAGS } from '../../discord/party-gateway.js';
import { count, fitItems, fitMessages, LIMITS, plain } from '../../render/text.js';
import type { ForumSetup } from '../../services/party-service.js';
import type { EventsForumSetup } from '../../services/event-forum.js';

/**
 * A forum that stays hidden though Discord refused the bot's hide, and what the bot lacks there.
 * A new one was made hidden and only the category's permissions were refused; one that was there
 * was hidden by its own overwrites, which Discord checked, so no cause is named.
 */
function keptHidden(refused: readonly string[], created: boolean): string {
  if (created) {
    const lacking =
      refused.length === 0
        ? 'Discord refused to set its permissions once more'
        : `without ${refused.join(', ')} there, which only its category gives me`;
    return `it is hidden from all but staff and the testers (${lacking}; see the log)`;
  }
  const lacking =
    refused.length === 0
      ? 'Discord refused to set its permissions'
      : `Discord refused to set its permissions, so I am without ${refused.join(', ')} there`;
  return `it was already hidden from members (${lacking}; see the log)`;
}

/** How to hide a forum by hand as the rehearsal would (`isHiddenForum` accepts it). */
const HIDE_BY_HAND =
  'Hide it by hand: deny View Channel to @everyone, and allow it only to Professor Pine itself ' +
  '(my member or my own role), the staff roles (those settings.rehearsal.staffRoles names, and ' +
  'every role with Manage Server or Administrator) and the testers.';

/** Why the board could not be pinned or opened: the permission, or the log (review P12). */
function whyNot({ unpinned, closed }: Pick<ForumSetup, 'unpinned' | 'closed'>): string {
  return unpinned === 'refused' || closed === 'refused'
    ? ': give me Manage Posts there'
    : '; see the log';
}

/**
 * A new board (plan 8R-9: the summary post; open to members since plan 8R-9F), and whether it
 * could be pinned and opened (review P12; Discord refuses both without Manage Posts): what was
 * done, then what was not and why.
 */
function summaryWords(result: Pick<ForumSetup, 'unpinned' | 'closed'>): string {
  const { unpinned, closed } = result;
  const didWords = unpinned === undefined ? 'posted and pinned' : 'posted';
  const not = [...(unpinned ? ['pin it'] : []), ...(closed ? ['open it to members'] : [])];
  if (not.length === 0) return `${didWords} the board`;
  return `${didWords} the board (I could not ${not.join(' or ')}${whyNot(result)})`;
}

/**
 * A board that stood and could not be pinned or opened (review W3: a moderator unpinned it; plan
 * 8R-9F, R2: one plan 8R-9 locked), or that a moderator locked after Pine opened it (left so);
 * nothing where it is pinned and open.
 */
function standingBoardWords(result: Pick<ForumSetup, 'unpinned' | 'closed'>): string[] {
  const { unpinned, closed } = result;
  return [
    ...(unpinned ? [`the board is not pinned (I could not pin it${whyNot(result)})`] : []),
    ...(closed === 'locked'
      ? [
          'the board is locked, so members cannot use commands in it (a moderator locked it; ' +
            'unlock it to let them)',
        ]
      : closed
        ? [`the board is not open to members (I could not open it${whyNot(result)})`]
        : []),
  ];
}

/** Where the bot may not delete what members write in the board (plan 8R-9F). */
function cleaningWords({ cleaning }: Pick<ForumSetup, 'cleaning'>): string {
  return cleaning === false
    ? ', but I may not delete what members write in it (give me Manage Messages there)'
    : '';
}

function line(result: ForumSetup): string {
  const { region } = result;
  if (result.forum === 'no-channel') {
    const name =
      region.description === null
        ? `Region channel ${region.channelId}`
        : plain(region.description);
    return `${name}: I cannot see it any more, so it has no forum.`;
  }
  if (result.forum === 'failed') {
    return `<#${region.channelId}>: ${result.reason ?? 'Something went wrong (see the log).'}`;
  }
  const forum = region.forumChannelId === null ? 'its forum' : `<#${region.forumChannelId}>`;
  const what = [
    result.forum === 'created' ? `created ${forum}` : `${forum} is ready`,
    ...(result.tagsAdded > 0
      ? [`added ${result.tagsAdded} ${result.tagsAdded === 1 ? 'tag' : 'tags'}`]
      : []),
    ...(result.tagsRemoved !== undefined
      ? [
          `removed ${result.tagsRemoved} ${result.tagsRemoved === 1 ? 'tag' : 'tags'} it no longer uses`,
        ]
      : []),
    ...(result.tagsMissing === undefined
      ? []
      : [
          `has no room for ${count(result.tagsMissing.length, 'tag')} (Discord allows a forum ` +
            `${String(MAX_FORUM_TAGS)}): ${result.tagsMissing.join(', ')}`,
        ]),
    ...(result.renamed ? ['renamed it'] : []),
    ...(result.posting === 'reserved' ? ['closed it to posts by members'] : []),
    ...(result.summary
      ? [`${summaryWords(result)}${cleaningWords(result)}`]
      : [
          ...standingBoardWords(result),
          ...(result.cleaning === false
            ? [
                'I may not delete what members write in the board (give me Manage Messages ' +
                  'there)',
              ]
            : []),
        ]),
    ...(result.hidden === 'hidden'
      ? [
          result.refused === undefined
            ? 'hid it from all but staff and the testers'
            : keptHidden(result.refused, result.forum === 'created'),
        ]
      : []),
  ];
  const open =
    result.posting === 'not-allowed'
      ? ' I could not close it to posts by members (I need Manage Permissions and Send Messages there; see the log).'
      : '';
  const seen =
    result.hidden === 'not-allowed'
      ? ` I could not hide it from members for the rehearsal (I need Manage Permissions there; see the log). ${HIDE_BY_HAND}`
      : '';
  return `<#${region.channelId}>: ${what.join(', ')}.${open}${seen}`;
}

/** The events forum's line (plan 8V-1): what was done, then what was not and why. */
function eventsLine(result: EventsForumSetup | 'thrown', botUpdates: string): string {
  if (result === 'thrown') return 'Events forum: something went wrong (see the log).';
  if (result.forum === 'no-bot-updates') {
    return (
      `Events forum: this server has no #${botUpdates} to make #${result.name} beside: add that ` +
      `channel, or make the forum #${result.name} by hand, and run this again.`
    );
  }
  if (result.forum === 'failed') return `Events forum (#${result.name}): ${result.reason}`;
  const forum = `<#${result.forumId}>`;
  const what = [
    result.forum === 'created' ? `created ${forum}` : `${forum} is ready`,
    ...(result.posting === 'reserved' ? ['closed it to posts by members'] : []),
    ...(result.listing === 'made' ? ['posted, pinned and locked the listing'] : []),
  ];
  const not = [
    ...(result.posting === 'not-allowed'
      ? [
          ' I could not close it to posts by members (I need Manage Permissions and Send ' +
            'Messages there; see the log).',
        ]
      : []),
    ...(result.managing === 'not-allowed'
      ? [
          ' I could not let myself manage its posts (give me Manage Posts and Manage ' +
            'Permissions there).',
        ]
      : []),
    ...(result.listing === 'failed' ? [' I could not post the listing (see the log).'] : []),
    // Members write in the event posts (branch review BR-7).
    ...(result.replies.length === 0
      ? []
      : [
          ` ${result.replies.join(' and ')} cannot write in its posts (allow ` +
            `${result.replies.length === 1 ? '' : 'them '}Send Messages in Posts there).`,
        ]),
    // Before the events feed is read (review V1), nothing of the listing is known yet.
    ...(result.listing === 'waiting'
      ? [' The listing is posted once the events feed is read.']
      : []),
  ];
  return `Events forum: ${what.join(', ')}.${not.join('')}`;
}

/** The closing line in rehearsal mode: which regions get a forum, and who sees it. */
function rehearsalLine(regions: readonly string[]): string {
  return `Rehearsal mode: only the regions ${regions.join(', ')} get a forum, which only staff and the testers see.`;
}

/** In rehearsal mode: the rehearsed names that no region channel of the server has. */
function unmatchedLine(names: readonly string[]): string {
  const listed = fitItems(
    names.map((name) => plain(name)),
    LIMITS.content - 300,
  );
  return (
    `No region channel of this server is called ${listed}: settings.rehearsal.regions names a ` +
    'region by its channel, as it is written, without #.'
  );
}

/** In rehearsal mode, when the rehearsed names could not be compared with the region channels. */
const UNMATCHED_UNKNOWN =
  'I could not check that every region of settings.rehearsal.regions names a region channel ' +
  'of this server (see the log).';

/**
 * The closing line about the forums whose region is gone (Matt, 2026-10-13: they can be found
 * from the party rows): the command only adds, so they are named and left as they are.
 */
function orphanLine(forumIds: readonly string[]): string {
  const forums = fitItems(
    forumIds.map((id) => `<#${id}>`),
    LIMITS.content - 300,
  );
  return (
    `${forumIds.length === 1 ? 'A forum' : 'Forums'} whose region is gone: ${forums}. I left ` +
    `${forumIds.length === 1 ? 'it' : 'them'} as ${forumIds.length === 1 ? 'it is' : 'they are'}` +
    ' (history); delete by hand what is not wanted.'
  );
}

/** `/admin setup-forums`: every region of this server gets its forum, tags and summary post. */
export const setupForums: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('setup-forums')
    .setDescription(
      'Create the forum, its tags and the board (Today and coming up) for every region',
    ),
  help: {
    details:
      'For each region of this server: creates the forum for its raids, max battles, trains ' +
      "and meetups next to the region's channel if it has none (named after the channel, " +
      '`-board`; a forum of another one-word ending is renamed).\n\nIt adds the tags that are ' +
      'missing, and posts and pins the board ("Today and coming up", with "Today’s Stops" below ' +
      'it). Members can use commands in the board; what they write there is deleted (I need Manage ' +
      'Messages in the forum).\n\nA board that stands is pinned again, and one locked before ' +
      'members could use it is opened once; a lock a moderator sets later stays. Nothing else ' +
      'that is already there changes, so it is safe to run again. A forum whose region is gone ' +
      'is named and left alone.\n\nWhere the settings name an events forum (`channels.events`), ' +
      'it is made too, in the category of bot-updates, with posts made by me alone, and its ' +
      'listing "Events" is posted, pinned and locked.',
    examples: ['/admin setup-forums'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    if (!interaction.inGuild()) throw new UserError('This only works in a server.');
    const guildId = interaction.guildId;
    if (ctx.partyService.setupRunning(guildId)) {
      throw new UserError('A setup is already running for this server.');
    }
    const results = await ctx.partyService.setupForums(guildId);
    const orphans = await ctx.partyService.orphanForums(guildId).catch((err: unknown) => {
      ctx.log.warn({ err }, 'could not list the forums that parties name');
      return [];
    });
    // The forums are set up by now: a failure here is a line of the answer, not the answer.
    const unmatched = await ctx.partyService
      .unmatchedRehearsedRegions(guildId)
      .catch((err: unknown) => {
        ctx.log.warn({ err }, 'could not compare the rehearsed regions with the region channels');
        return undefined;
      });
    // The events forum (plan 8V-1): never in rehearsal mode (R8), whoever made the service.
    const events =
      ctx.rehearsal || !ctx.eventForum
        ? undefined
        : await ctx.eventForum.setup(guildId).catch((err: unknown) => {
            ctx.log.warn({ err }, 'could not set up the events forum');
            // Said, not left out (branch review BR-6).
            return 'thrown' as const;
          });
    const closing = [
      ...(events === undefined
        ? []
        : [eventsLine(events, ctx.config.settings.channels['bot-updates'])]),
      ...(orphans.length === 0 ? [] : [orphanLine(orphans)]),
      ...(ctx.rehearsal ? [rehearsalLine(ctx.rehearsal.settings.regions)] : []),
      ...(unmatched === undefined
        ? [UNMATCHED_UNKNOWN]
        : unmatched.length === 0
          ? []
          : [unmatchedLine(unmatched)]),
    ];
    if (results.length === 0) {
      await interaction.editReply({
        content: [
          // In rehearsal mode the regions may be there and none of them rehearsed.
          ...(ctx.rehearsal ? [] : ['This server has no regions yet.']),
          ...closing,
        ].join('\n'),
      });
      return;
    }
    const [first = '', ...rest] = fitMessages([...results.map(line), ...closing]);
    await interaction.editReply({ content: first });
    for (const content of rest) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    }
  },
};
