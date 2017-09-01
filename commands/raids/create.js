"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility'),
	EndTimeType = require('../../types/time');

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
					key: 'time-left',
					label: 'time left',
					prompt: 'How much time is remaining on the raid (use h:mm or mm format)?\nExample: `1:43`',
					type: 'time',
					min: 'relative',
					default: EndTimeType.UNDEFINED_END_TIME
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name !== 'raid') {
				return false;
			}

			// TODO: Make this look at the channel's permissionOverrides to determine if it's a region channel or not
			const channel = message.channel;

			if (Raid.validRaid(message.channel)) {
				message.reply('Create raids from region channels!');
				return true;
			}
			return false;
		});

	}

	run(message, args) {
		const pokemon = args['pokemon'],
			gym = args['gym'],
			time_left = args['time-left'];

		let raid_info;

		Raid.createRaid(message.channel, message.member, {
			pokemon,
			gym,
			// minutes remaining gets turned into actual end time
			end_time: time_left
		}).then(info => {
			raid_info = info;

			Utility.cleanConversation(message, true);

			return message.channel.send(Raid.getRaidChannelMessage(raid_info.raid), Raid.getFormattedMessage(info.raid));
		}).then(announcement_message => {
			return Raid.setAnnouncementMessage(raid_info.raid.channel, announcement_message);
		}).then(bot_message => {
			return raid_info.raid.channel.send(Raid.getRaidSourceChannelMessage(raid_info.raid), Raid.getFormattedMessage(raid_info.raid));
		}).then(channel_raid_message => {
			Raid.addMessage(raid_info.raid.channel, channel_raid_message, true);
		}).catch(err => {
			console.log(err);
		});
	}
}

module.exports = RaidCommand;
