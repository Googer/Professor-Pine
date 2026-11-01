import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import type { ServerChannel } from '../../domain/regions/region-import.js';
import { count, fitItems, fitMessages, LIMITS } from '../../render/text.js';
import type { RegionLine } from '../../services/region-admin-service.js';
import { regionLabel, regionStaff } from './shared.js';

/** One region as a line of the list: its channel, what it holds, and what is wrong with it. */
export function regionLine(line: RegionLine, channels: readonly ServerChannel[]): string {
  const { region } = line;
  const holds = [
    line.elite > 0
      ? `${count(line.gyms, 'gym')} (${count(line.elite, 'elite raid gym')})`
      : count(line.gyms, 'gym'),
    ...(line.parties > 0
      ? [
          count(
            line.parties,
            'active raid, max battle, train or meetup',
            'active raids, max battles, trains and meetups',
          ),
        ]
      : []),
  ];
  const wrong = [
    ...(line.channel === 'gone' ? ['its channel is gone'] : []),
    ...(region.bounds === null ? ['no outline'] : []),
    ...(line.forum === 'none' ? ['no forum yet'] : []),
    ...(line.forum === 'gone' ? ['its forum is gone'] : []),
  ];
  const problems = wrong.length === 0 ? '' : ` · **${wrong.join(', ')}**`;
  return `- ${regionLabel(region, channels)} · ${holds.join(' · ')}${problems}`;
}

/**
 * `/region list`: every region of the server on a line, with its gyms, its active parties and
 * what is wrong with it; then the gyms that lie in no region of any server, and the forums
 * that parties name and no region has.
 */
export const listRegions: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('list')
    .setDescription('List the regions of this server, with what is wrong with any of them'),
  help: {
    details:
      'A line per region: its channel, how many gyms lie in it (and how many of them are ' +
      'elite raid gyms), its active raids, max battles, trains and meetups, and what is wrong with it: no ' +
      'outline, a channel or a forum that is gone, no forum yet.\n\nBelow that: how many gyms ' +
      'lie in no region of any server, and the forums whose region is gone. A region whose ' +
      'channel is gone stays until you remove it with `/region remove`.',
    examples: ['/region list'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const staff = await regionStaff(interaction, ctx);
    const channels = ctx.regionAdmin.channelsOf(staff);
    const list = await ctx.regionAdmin.list(staff);
    const lines =
      list.regions.length === 0
        ? ['This server has no regions yet. Give a channel its outline with `/region import`.']
        : [
            `**${count(list.regions.length, 'region')}**`,
            ...list.regions.map((line) => regionLine(line, channels)),
          ];
    // Only a region whose channel exists can be given a forum.
    const needsForums = list.regions.filter(
      (line) => line.forum !== 'there' && line.channel === 'there',
    ).length;
    const closing = [
      ...(needsForums > 0
        ? [
            needsForums === 1
              ? '`/admin setup-forums` gives 1 region the forum it lacks.'
              : `\`/admin setup-forums\` gives ${needsForums} regions the forum they lack.`,
          ]
        : []),
      ...(list.unplacedGyms > 0
        ? [
            list.unplacedGyms === 1
              ? '1 gym lies in no region of any server.'
              : `${list.unplacedGyms} gyms lie in no region of any server.`,
          ]
        : []),
      ...(list.orphanForums.length > 0
        ? [
            `Forums whose region is gone: ${fitItems(
              list.orphanForums.map((id) => `<#${id}>`),
              LIMITS.content - 200,
            )}. They are kept as history; delete one by hand if it is not wanted.`,
          ]
        : []),
    ];
    const [first = '', ...rest] = fitMessages([...lines, ...closing]);
    await interaction.editReply({ content: first });
    for (const more of rest) {
      await interaction.followUp({ content: more, flags: MessageFlags.Ephemeral });
    }
  },
};
