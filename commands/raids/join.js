"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class JoinCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'join',
			group: 'raids',
			memberName: 'join',
			aliases: ['attend', 'omw'],
			description: 'Join a raid!',
			details: 'Use this command to join a raid.  If a time has yet to be determined, then when a time is determined, everyone who has joined will be notified of the official raid start time.',
			examples: ['\t!join', '\t!join 3', '\t!attend', '\t!attend 2'],
			args: [
				{
					key: 'additional_attendees',
					label: 'additional attendees',
					prompt: 'How many additional people will be coming with you?\nExample: `1`',
					type: 'integer',
					default: 0,
					min: 0
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'join' && !Raid.validRaid(message.channel)) {
				message.reply('Join a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	run(message, args) {
		const additional_attendees = args['additional_attendees'],
			info = Raid.addAttendee(message.channel, message.member, additional_attendees),
			total_attendees = Raid.getAttendeeCount({raid: info.raid});

		message.react('👍')
			.catch(err => console.log(err));

		Utility.cleanConversation(message);

		message.member.send(`You signed up for raid **${info.raid.id}**. There are now **${total_attendees}** potential Trainer(s) so far!`)
			.catch(err => console.log(err));

		// get previous bot message & update
		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = JoinCommand;
