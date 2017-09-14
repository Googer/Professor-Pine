"use strict";

const Commando = require('discord.js-commando'),
	Constants = require('../../app/constants'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class CheckOutCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'check-out',
			group: 'raids',
			memberName: 'check-out',
			aliases: ['depart'],
			description: 'Let others know you have gone to the wrong location.',
			details: 'Use this command in case you thought you were at the right location, but were not.',
			examples: ['\t!check-out', '\t!checkout'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'check-out' && !Raid.validRaid(message.channel.id)) {
				message.reply('Check out of a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const info = Raid.setMemberStatus(message.channel.id, message.member.id, Constants.RaidStatus.INTERESTED);

		if (!info.error) {
			message.react('👍')
				.catch(err => console.error(err));

			Utility.cleanConversation(message);

			Raid.refreshStatusMessages(info.raid);
		} else {
			message.reply(info.error)
				.catch(err => console.error(err));
		}
	}
}

module.exports = CheckOutCommand;
