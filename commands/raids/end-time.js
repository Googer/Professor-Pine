"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class EndTimeCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'end-time',
			group: 'raids',
			memberName: 'end-time',
			aliases: ['end', 'ends'],
			description: 'Set a time that the raid will no longer exist.',
			details: 'Use this command to set remaining time on a raid.',
			examples: ['\t!end-time 1:45', '\t!end 50'],
			args: [
				{
					key: 'end-time',
					label: 'end time',
					prompt: 'How much time is remaining on the raid (use h:mm or mm format)?\nExample: `1:43`',
					type: 'endtime'
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'end-time' && !Raid.validRaid(message.channel)) {
				message.reply('Set the end time for a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	run(message, args) {
		const time = args['end-time'],
			info = Raid.setRaidEndTime(message.channel, time);

		message.react('👍')
			.catch(err => console.log(err));

		Utility.cleanConversation(message);

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = EndTimeCommand;
