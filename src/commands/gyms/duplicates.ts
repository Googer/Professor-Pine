import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { GymView } from '../../services/gym-directory.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { namesakes, sharedNames, shownName } from '../../domain/gyms/shared-names.js';
import { gymWithId } from '../../render/gym-view.js';
import { fitItems, plain, truncate } from '../../render/text.js';
import { staffPlace } from './shared.js';

/** A message's text stays within Discord's 2,000 characters. */
const MESSAGE = 2_000;

/** How much room the namesakes of a note take. */
const NAMESAKES_SHOWN = 250;

/**
 * What staff are told after adding, changing or moving a gym that is now shown by the same name
 * as another gym of a region it lies in (or was given a nickname that is another's shown name):
 * a note, not a refusal. Undefined when there is none. Among the server's gyms and regions
 * (`gyms`, its view): another server's gym of that name is none of its staff's business.
 */
export function namesakeNote(gyms: GymView, gym: Gym): string | undefined {
  const others = new Map<number, Gym>();
  for (const channelId of gyms.regionsOf(gym.id)) {
    for (const other of namesakes(gym, gyms.inRegion(channelId))) others.set(other.id, other);
  }
  if (others.size === 0) return undefined;
  // A note above a view: kept short enough to stand beside what the change did (`fitLines`).
  const named = fitItems([...others.values()].map(gymWithId), NAMESAKES_SHOWN);
  return (
    `Another gym of its region is shown as "${plain(truncate(shownName(gym), 60))}" too: ${named}. Members ` +
    'and screenshots can tell such gyms apart only by a nickname: give one with `/gym edit`.'
  );
}

/** A gym of a group: its number, name, nickname and description. */
function gymLine(gym: Gym): string {
  const description = gym.description?.trim() ? ` — ${plain(truncate(gym.description, 80))}` : '';
  return `- ${gymWithId(gym)}${description}`;
}

/**
 * `/gym duplicates`: per region of this server, the gyms shown by one name (the nickname where
 * there is one), compared as the search compares names, so that staff see which need a
 * nickname.
 */
export const duplicateGyms: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('duplicates')
    .setDescription('List the gyms of a region that are shown by the same name'),
  help: {
    details:
      'Gyms of one region with the same name (several Starbucks) can be told apart only by a ' +
      'nickname: in the menu `/raid` shows, and when a screenshot names one. This lists them, ' +
      'per region of this server, with their numbers and descriptions; give each a nickname ' +
      'with `/gym edit`.\n\nNames are compared by their letters and digits alone (case, accents, ' +
      'spaces and punctuation do not count: "P.N.C. Park" is "PNC Park"); a gym with a ' +
      'nickname of its own is not listed.',
    examples: ['/gym duplicates'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const { guildId } = await staffPlace(interaction, ctx);
    const regions = ctx.regions
      .all()
      .filter((region) => guildId !== undefined && region.guildId === guildId);
    // Each group is an item of its own, with its region: a long list is cut between groups.
    const groups: string[] = [];
    for (const region of regions) {
      for (const group of sharedNames(ctx.gyms.of(guildId).inRegion(region.channelId))) {
        const [first] = group;
        const name = first ? plain(shownName(first)) : '';
        groups.push(
          truncate(
            [`**<#${region.channelId}>** "${name}":`, ...group.map(gymLine)].join('\n'),
            MESSAGE - 200,
          ),
        );
      }
    }
    if (groups.length === 0) {
      await interaction.editReply({
        content: 'No two gyms of a region of this server are shown by the same name.',
      });
      return;
    }
    const head =
      `${groups.length === 1 ? 'One name is' : `${groups.length} names are`} shared by gyms of ` +
      'one region. Give each such gym a nickname with `/gym edit`.';
    const messages = pagedGroups(head, groups);
    const [first, ...more] = messages;
    await interaction.editReply({ content: first ?? head });
    for (const content of more) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    }
  },
};

/** At most this many messages answer `/gym duplicates`. */
export const MAX_DUPLICATE_MESSAGES = 10;

/**
 * The groups in messages of at most `MESSAGE` characters, the first after `head`, at most
 * `MAX_DUPLICATE_MESSAGES` of them; the last says how many groups did not fit.
 */
export function pagedGroups(head: string, groups: readonly string[]): string[] {
  const messages: string[] = [];
  let current = head;
  let shown = 0;
  const room = (text: string) => MESSAGE - 60 - text.length;
  for (const group of groups) {
    if (group.length + 2 > room(current)) {
      if (messages.length + 1 >= MAX_DUPLICATE_MESSAGES) break;
      messages.push(current);
      current = '';
    }
    current = current === '' ? group : `${current}\n\n${group}`;
    shown++;
  }
  const left = groups.length - shown;
  if (left > 0) current += `\n\n… and ${left} more not shown.`;
  messages.push(current);
  return messages;
}
