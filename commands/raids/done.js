"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class DoneCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'done',
			group: 'raids',
			memberName: 'done',
			aliases: ['complete', 'caught-it'],
			description: 'Let others know you and your raid group have completed the raid so you are no longer available to participate in it again!',
			details: 'Use this command to tell everyone you have completed this raid.',
			examples: ['\t!done', '\t!complete', '\t!caught-it'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'done' && !Raid.validRaid(message.channel.id)) {
				message.reply('Say you have completed a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		Raid.setPresentAttendeesToComplete(message.channel.id, message.member.id)
			.catch(err => console.log(err));

		message.react('👍')
			.catch(err => console.log(err));

		Utility.cleanConversation(message);
	}
}

module.exports = DoneCommand;
