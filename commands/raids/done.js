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
			description: 'Let others know you have completed the raid so you are no longer available to participate in it again!',
			details: 'Use this command to tell everyone you have completed this raid.',
			examples: ['\t!done', '\t!complete', '\t!caught-it'],
			guildOnly: true,
			args: [
				{
					key: 'all',
					prompt: 'Has everyone present completed this raid?',
					type: 'boolean',
					default: false
				}
			]
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
		const all = args['all'];

		let info;
		if (all) {
			info = Raid.setPresentAttendeesToDone(message.channel.id);
		} else {
			info = Raid.setMemberStatus(message.channel.id, message.member.id, Raid.COMPLETE);
		}

		message.react('👍')
			.catch(err => console.log(err));

		Utility.cleanConversation(message);

		// get previous bot messages & update
		await Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = DoneCommand;
