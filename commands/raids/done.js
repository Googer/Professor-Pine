"use strict";

const log = require('loglevel').getLogger('DoneCommand'),
	Commando = require('discord.js-commando'),
	Gym = require('../../app/gym'),
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
			args: [
				{
					key: 'raid_id',
					label: 'raid id',
					prompt: 'What is the ID of the raid you wish say you have completed?',
					type: 'raid'
				}
			],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'done' && !Gym.isValidChannel(message.channel.id)) {
				message.reply('Say you have completed a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const raid_id = args['raid_id'];

		Raid.setPresentAttendeesToComplete(raid_id, message.member.id)
			.catch(err => log.error(err));

    message.react('👍')
			.catch(err => log.error(err));

		Utility.cleanConversation(message);
	}
}

module.exports = DoneCommand;
