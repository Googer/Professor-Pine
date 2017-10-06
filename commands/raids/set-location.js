"use strict";

const log = require('loglevel').getLogger('LocationCommand'),
	Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class SetLocationCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'gym',
			group: 'raid-crud',
			memberName: 'gym',
			aliases: ['set-location', 'set-gym', 'location'],
			description: 'Changes the location for an existing raid.',
			details: 'Use this command to set the location of a raid.  This command is channel sensitive, meaning it only finds gyms associated with the enclosing region.',
			examples: ['\t!gym Unicorn', '\t!location \'Bellevue Park\'', '\t!location squirrel'],
			args: [
				{
					key: 'gym_id',
					label: 'gym',
					prompt: 'Where is the raid taking place?\nExample: `manor theater`\n',
					type: 'gym',
					wait: 60
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'gym' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Set the location of a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const gym_id = args['gym_id'],
			info = Raid.setRaidLocation(message.channel.id, gym_id);

		message.react('👍')
			.catch(err => log.error(err));

		Utility.cleanConversation(message);

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = SetLocationCommand;
