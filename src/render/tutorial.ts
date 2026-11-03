import type { V2Message } from '../discord/party-gateway.js';
import {
  leaveIcon,
  meetIcon,
  remoteIcon,
  statusIcon,
  type ControlIcons,
} from './party-controls.js';
import { container, LIST_COLOUR, textDisplay } from './v2.js';

/**
 * The crash course `/admin tutorial` posts (plan 8M-18, design
 * `docs/superpowers/specs/2026-11-02-discord-tutorial-design.md`): a few basics, in the voice and
 * layout of the tutorial of legacy Pine. It explains Pine, not the game (Matt, 2026-11-02): only a
 * raid train and what meetups are for are said. A line about a command is left out where the
 * command is not there, and a block with nothing left in it goes whole.
 */

/**
 * The `id` of each message's container: how a later run knows its own messages. Any other v2
 * message of Pine's in a channel (a request to the moderators with its buttons) is never touched.
 */
export const TUTORIAL_MARK = 7_771_001;

/** What this server has, for what the course may say. */
export interface TutorialFacts {
  /** The names of the commands enabled here (`ctx.commands`). */
  commands: ReadonlySet<string>;
  /** Screenshots are read (`settings.ocr.enabled`). */
  screenshots: boolean;
  /** `/maps` opens the live map (`settings.web`), not only a link to a map of the regions. */
  liveMap: boolean;
  /** The server has PokéStops to report at (`PlaceFinder.hasStops`). */
  hasStops: boolean;
  /** Meetups may wait for a moderator (`settings.channels.moderation`). */
  meetupsChecked: boolean;
  /** The post's buttons' icons, shown as the posts show them. */
  icons: ControlIcons;
}

const ACKNOWLEDGEMENTS =
  'Professor Pine was designed by Googer and coded with help from Claude. The art was drawn by ' +
  'strawbanya. The code is open-source: https://github.com/Googer/Professor-Pine';

function welcome(): string {
  return [
    '__**Meet Professor Pine!**__',
    'Professor Pine is our friendly neighborhood raid bot! Pine has been studying our raid ' +
      'habits and has tools to help us catch our favorite Pokémon. Here are the basics.',
    '',
    ACKNOWLEDGEMENTS,
  ].join('\n');
}

function reporting(facts: TutorialFacts): string {
  return [
    ...(facts.screenshots
      ? [
          '__**Create a Raid via Screenshot**__',
          "Simply post an in-game screenshot in your regional channel and mention @Professor Pine, clearly showing the gym's name, the raid egg or boss and the timer. Professor Pine will read it and create the raid for you! You can also attach one to `/raid`.",
          '',
        ]
      : []),
    '__**Manually Creating a Raid**__',
    'Type `/raid` in your regional channel and pick from the lists as you type:',
    '1⃣ `boss` The boss, or a tier for an egg: `T3`',
    '2⃣ `gym` Part of its name: `Walt`',
    '3⃣ `time` Minutes or an exact time: `14` or `3:32pm` *(only an Elite egg must have one)*',
    "Professor Pine creates a post for the raid in your region's raid forum.",
  ].join('\n');
}

function joining({ icons }: TutorialFacts): string {
  return [
    '__**Finding a Raid**__',
    "Every raid has its own post in your region's raid forum, with all of them listed in the forum's pinned post. You can also type `/status` in your regional channel!",
    '',
    '__**Joining a Raid**__',
    'Press the buttons on its post:',
    `${statusIcon(icons, 'interested')} Interested, but not a commitment`,
    `${statusIcon(icons, 'coming')} Join: you are on your way`,
    `${statusIcon(icons, 'present')} Here: you have arrived`,
    `${statusIcon(icons, 'complete')} Done: you have finished the raid`,
    `${leaveIcon(icons)} Leave if you can no longer make it`,
    '⬆️ ⬇️ Bringing a friend? Change your count.',
    `${remoteIcon(icons)} Raiding remotely? Say so.`,
    `${meetIcon(icons)} Set when your group meets (on a raid with no time yet, Set time… first).`,
    'Group… moves you to another group or starts a new one.',
    '*Your status shows on the post, so everyone can see who has arrived.*',
  ].join('\n');
}

function notifications(facts: TutorialFacts): string | undefined {
  if (!facts.commands.has('want')) return undefined;
  return [
    '__**Get Notified!**__',
    'Professor Pine sends these by DM, so make sure you have those enabled!',
    `🎯 \`/want\` Absol, then tick what for: a DM when one is reported in a region you can see. It also works for raid tiers${facts.hasStops ? ' and research rewards' : ''}.`,
    '⭐ `/target` a gym: a DM when a raid is reported there.',
    '`/wants` and `/targets` list yours; `/unwant` and `/untarget` take one off.',
  ].join('\n');
}

function otherReports(facts: TutorialFacts): string {
  return [
    '__**Other Things to Report**__',
    '`/max` A max battle at a Power Spot',
    ...(facts.hasStops
      ? [
          '`/research report` A field research task at a PokéStop',
          '`/rocket report` Team GO Rocket at a PokéStop',
        ]
      : []),
    '`/wild` A rare spawn: say where in `details`',
  ].join('\n');
}

function trainsAndMeetups(facts: TutorialFacts): string {
  const check = facts.meetupsChecked ? ' *The moderators may check the place first.*' : '';
  return [
    '__**Raid Trains**__',
    'A raid train is a group raiding gym after gym along a route. `/train` in your regional channel creates its post; in that post, `/route add` adds the stops. Join with the same buttons!',
    '',
    '__**Meetups**__',
    `For trades, lure parties or playing as a group: \`/meetup\` in your regional channel asks for the details and creates its post.${check}`,
  ].join('\n');
}

function moreHelp(facts: TutorialFacts): string {
  const map = !facts.commands.has('maps')
    ? []
    : facts.liveMap
      ? ['`/maps` opens the live map, where you can report and join too!']
      : ['`/maps` shows the map of all regions.'];
  return [
    '__**For More Help**__',
    ...map,
    '`/help` shows every command, or ask a Mod for assistance.',
  ].join('\n');
}

/** The course, one message per block, in order. */
export function tutorialMessages(facts: TutorialFacts): V2Message[] {
  return [
    welcome(),
    reporting(facts),
    joining(facts),
    notifications(facts),
    otherReports(facts),
    trainsAndMeetups(facts),
    moreHelp(facts),
  ]
    .filter((text): text is string => text !== undefined)
    .map((text) => ({
      v2: true,
      components: [{ ...container(LIST_COLOUR, [textDisplay(text)]), id: TUTORIAL_MARK }],
    }));
}

/** What a run does: which messages it edits with which block, how many it adds, which it deletes. */
export interface TutorialPlan {
  edits: ReadonlyArray<{ id: string; block: number }>;
  posts: readonly number[];
  deletes: readonly string[];
}

/** What is to be done to the course's messages (`own`, oldest first) for `blocks` blocks. */
export function tutorialPlan(own: readonly string[], blocks: number): TutorialPlan {
  const every = Array.from({ length: blocks }, (_, block) => block);
  return {
    edits: own.slice(0, blocks).map((id, block) => ({ id, block })),
    posts: every.slice(own.length),
    deletes: own.slice(blocks),
  };
}

/** Whether a message of the channel is one of the course's: Pine's own, and marked. */
export function isTutorialMessage(
  message: { author: { id: string }; components: ReadonlyArray<{ id?: number }> },
  botId: string,
): boolean {
  return (
    message.author.id === botId &&
    message.components.some((component) => component.id === TUTORIAL_MARK)
  );
}
