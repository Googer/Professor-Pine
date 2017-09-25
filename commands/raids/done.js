"use strict";

const log = require('loglevel').getLogger('DoneCommand'),
	Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class DoneCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'done',
			group: 'basic-raid',
			memberName: 'done',
			aliases: ['complete', 'caught-it'],
			description: 'Lets others know you have completed an existing raid.\n',
			details: 'Use this command to tell everyone you have completed this raid.',
			examples: ['\t!done', '\t!complete', '\t!caught-it'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'done' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Say you have completed a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		Raid.setPresentAttendeesToComplete(message.channel.id, message.member.id)
			.catch(err => log.error(err));

		message.react('👍')
			.catch(err => log.error(err));

		Utility.cleanConversation(message);
	}
}

module.exports = DoneCommand;
