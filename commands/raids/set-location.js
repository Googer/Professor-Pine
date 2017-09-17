"use strict";

const log = require('loglevel').getLogger('LocationCommand'),
	Commando = require('discord.js-commando'),
	Gym = require('../../app/gym'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class SetLocationCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'set-location',
			group: 'raids',
			memberName: 'set-location',
			aliases: ['location', 'set-gym', 'gym'],
			description: 'Set a location for a specific raid.  This is a smart search on gym names and their locations.',
			details: 'Use this command to set the location of a raid.  This command is channel sensitive, meaning it only finds gyms associated with the proper channel.',
			examples: ['\t!set-location Unicorn', '\t!location \'Bellevue Park\'', '\t!location squirrel'],
			args: [
				{
					key: 'raid_id',
					label: 'raid id',
					prompt: 'What is the ID of the raid you wish to set the location for?',
					type: 'raid'
				},
				{
					key: 'gym_id',
					label: 'gym',
					prompt: 'Where is the raid taking place?\nExample: `manor theater`',
					type: 'gym',
					wait: 60
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'set-location' && !Gym.isValidChannel(message.channel.name)) {
				message.reply('Set the location of a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const raid_id = args['raid_id'],
			gym_id = args['gym_id'],
			info = Raid.setRaidLocation(raid_id, gym_id);

		message.react('👍')
			.catch(err => log.error(err));

		Utility.cleanConversation(message);

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = SetLocationCommand;
