"use strict";

const log = require('loglevel').getLogger('FindRegion'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Map = require('../../app/map'),
	{MessageEmbed} = require('discord.js'),
	Role = require('../../app/role');

class FindRegionsCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'find',
			group: CommandGroup.UTIL,
			memberName: 'find',
			aliases: ['find-regions', 'regions'],
			description: 'Searches for regions that contain an entered location.',
			details: 'Use this command to find which regions (channels) contain a location.',
			examples: ['\t!find McMurray'],
			args: [
				{
					key: 'location',
					prompt: 'What location do you wish to search for?\n',
					type: 'string',
					wait: 60
				}
			],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'find' && !Role.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('find.warning', message))];
			}
			return false;
		});
	}

	async run(message, args) {
		const location = args['location'],
			regions = await Map.getRegions(location),
			embed = new MessageEmbed();

		if (regions.length > 0) {
			const channels = regions
				.map(region => region.match(/^#?(.*)$/)[1])
				.map(region => message.guild.channels
					.find(channel => channel.name === region))
				.map(channel => channel.toString())
				.join('\n');

			embed.setTitle(`The following regions contain '${location}':`);
			embed.setDescription(channels);
			embed.setColor('GREEN');
		} else {
			embed.setTitle('No matching regions found.');
			embed.setColor('RED');
		}

		message.channel.send(embed)
			.catch(err => log.error(err));
	}
}

module.exports = FindRegionsCommand;
