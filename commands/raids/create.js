"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility'),
	Constants = require('../../app/constants');

class RaidCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'raid',
			group: 'raids',
			memberName: 'raid',
			aliases: ['create', 'announce'],
			description: 'Create a new raid group!',
			details: 'Use this command to start organizing a new raid.  For your convenience, this command combines several options such that you can set the pokemon, the location, and the end time of the raid, all at once.',
			examples: ['\t!raid lugia', '\t!raid zapdos \'manor theater\' 1:43', '\t!raid magikarp olea', '\t!raid ttar \'frog fountain\''],
			args: [
				{
					key: 'pokemon',
					prompt: 'What Pokemon (or tier if unhatched) is this raid?\nExample: `lugia`',
					type: 'pokemon',
				},
				{
					key: 'gym',
					prompt: 'Where is this raid taking place?\nExample: `manor theater`',
					type: 'gym'
				},
				{
					key: 'end_time',
					label: 'end time',
					prompt: 'How much time is remaining on this raid (use h:mm or mm format)?\n Example: `1:43`',
					type: 'time',
					default: Constants.UNDEFINED_END_TIME
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});
	}

	run(message, args) {
		const pokemon = args['pokemon'],
			gym = args['gym'],
			end_time = args['end_time'],
			info = Raid.createRaid(message.channel, message.member, {
				pokemon,
				gym,
				end_time
			});

		Utility.cleanConversation(message, true);

		message.channel.send(Raid.getFormattedMessage(info.raid)).then((bot_message) => {
			Raid.setMessage(message.channel, message.member, info.raid.id, bot_message);
		});

	}
}

module.exports = RaidCommand;
