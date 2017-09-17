"use strict";

const log = require('loglevel').getLogger('CreateCommand'),
	Commando = require('discord.js-commando'),
	Gym = require('../../app/gym'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility'),
	TimeType = require('../../types/time');

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
			throttling: {
				usages: 5,
				duration: 300
			},
			args: [
				{
					key: 'pokemon',
					prompt: 'What Pokemon (or tier if unhatched) is this raid?\nExample: `lugia`',
					type: 'pokemon',
				},
				{
					key: 'gym_id',
					label: 'gym',
					prompt: 'Where is this raid taking place?\nExample: `manor theater`',
					type: 'gym',
					wait: 60
				},
				{
					key: 'time',
					label: 'time left',
					prompt: 'How much time is remaining on the raid (use h:mm or mm format)?\nExample: `1:43`',
					type: 'time',
					min: 'relative',
					default: TimeType.UNDEFINED_END_TIME
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!message.command) {
				return true;
			}

			if (message.command.name !== 'raid') {
				return false;
			}

			if (Raid.validRaid(message.channel.id) || !Gym.isValidChannel(message.channel.name)) {
				message.reply('Create raids from region channels!');
				return true;
			}

			return false;
		});

	}

	async run(message, args) {
		const pokemon = args['pokemon'],
			gym_id = args['gym_id'],
			time = args['time'];

		let raid;

		Raid.createRaid(message.channel.id, message.member.id, pokemon, gym_id, time)
			.then(async info => {
				Utility.cleanConversation(message, true);

				raid = info.raid;
				const raid_channel_message = await Raid.getRaidChannelMessage(raid),
					formatted_message = await Raid.getFormattedMessage(raid);
				return message.channel.send(raid_channel_message, formatted_message);
			})
			.then(announcement_message => {
				return Raid.setAnnouncementMessage(raid.channel_id, announcement_message);
			})
			.then(async bot_message => {
				const raid_source_channel_message = await Raid.getRaidSourceChannelMessage(raid),
					formatted_message = await Raid.getFormattedMessage(raid);
				return Raid.getChannel(raid.channel_id)
					.then(channel => channel.send(raid_source_channel_message, formatted_message))
					.catch(err => log.error(err));
			})
			.then(channel_raid_message => {
				Raid.addMessage(raid.channel_id, channel_raid_message, true);
			})
			.catch(err => log.error(err))
	}
}

module.exports = RaidCommand;
