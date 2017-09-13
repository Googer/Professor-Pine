"use strict";

const Commando = require('discord.js-commando'),
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
			if (message.command.name === 'set-location' && !Raid.validRaid(message.channel.id)) {
				message.reply('Set the location of a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const gym_id = args['gym_id'],
			info = Raid.setRaidLocation(message.channel.id, gym_id);

		message.react('👍')
			.catch(err => console.error(err));

		Utility.cleanConversation(message);

		// post a new raid message and replace/forget old bot message
		await Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = SetLocationCommand;
