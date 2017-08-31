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
					key: 'gym',
					prompt: 'Where is the raid taking place?\nExample: `manor theater`',
					type: 'gym'
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'set-location' && !Raid.validRaid(message.channel)) {
				message.reply('Set the location of a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	run(message, args) {
		const gym = args['gym'],
			info = Raid.setRaidLocation(message.channel, gym);

		message.react('👍')
			.catch(err => console.log(err));

		Utility.cleanConversation(message);

		// post a new raid message and replace/forget old bot message
		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = SetLocationCommand;
