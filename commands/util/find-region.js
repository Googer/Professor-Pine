"use strict";

const log = require('loglevel').getLogger('FindRegion'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Map = require('../../app/map'),
	{MessageAttachment, MessageEmbed} = require('discord.js');

class FindRegionsCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'find',
			group: CommandGroup.UTIL,
			memberName: 'find',
			aliases: ['find-regions', 'regions'],
			description: 'Searches for regions that contain an entered location.',
			details: 'Use this command to find which regions (channels) contain a location.  Search powered by OpenStreetMap Nominatum service under ODbL license.\n\n© OpenStreetMap contributors.',
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
			if (!!message.command && message.command.name === 'find' && !Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('find.warning', message))];
			}
			return false;
		});
	}

	async run(message, args) {
		const location = args['location'],
			results = await Map.getRegions(location),
			image = results.feature !== null ?
				await Map.getMapImage(results.feature) :
				null,
			embed = new MessageEmbed();

		embed.setImage('attachment://map.png');
		embed.setColor(image ?
			'GREEN' :
			'RED')
		embed.setFooter('© OpenStreetMap contributors');

		let text;

		if (results.regions.length > 0) {
			const channels = results.regions
				.map(region => region.match(/^#?(.*)$/)[1])
				.map(region => message.guild.channels
					.find(channel => channel.name === region))
				.map(channel => channel.toString())
				.join('\n');

			text = `The following regions contain **${location}**:\n\n${channels}`;
		} else {
			text = `No matching regions found for **${location}**.`;
			embed.setDescription(text);
		}

		if (image) {
			message.channel.send(text,
				{
					files: [new MessageAttachment(image, 'map.png')],
					embed
				})
				.catch(err => log.error(err));
		} else {
			message.channel.send(embed)
				.catch(err => log.error(err));
		}
	}
}

module.exports = FindRegionsCommand;
