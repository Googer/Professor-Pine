"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class RaidCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'raid',
			group: 'raids',
			memberName: 'raid',
			aliases: ['create', 'announce'],
			description: 'Create a new raid group!',
			details: 'Use this command to start organizing a new raid.  For your convenience, this command combines several options such that you can set the pokemon, the location, and the end time of the raid, all at once.',
			examples: ['\t!raid lugia', '\t!raid zapdos 5:30pm', '\t!raid magikarp ending in 2 hours 30 mins', '\t!raid tyranitar 2h 30m'],
			args: [
				{
					key: 'pokemon',
                    prompt: 'What Pokemon (or tier if unhatched) is this raid?',
					type: 'pokemon',
				},
				{
					key: 'gym',
					prompt: 'Where is this raid taking place?',
					type: 'gym'
				},
				{
					key: 'end_time',
					label: 'end time',
					prompt: 'How much time is remaining on this raid (use h:mm or mm format)?',
					type: 'time',
					default: '120'
				}
			],
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
