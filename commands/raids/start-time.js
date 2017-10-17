"use strict";

const log = require('loglevel').getLogger('StartTimeCommand'),
	Commando = require('discord.js-commando'),
	Helper = require('../../app/helper'),
	moment = require('moment'),
	Raid = require('../../app/raid'),
	{RaidStatus, TimeParameter} = require('../../app/constants');

class StartTimeCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'start',
			group: 'basic-raid',
			memberName: 'start',
			aliases: ['start-time', 'starts'],
			description: 'Sets the planned starting time for an existing raid.',
			details: 'Use this command to set when a raid group intends to do the raid.  If possible, try to set times 20 minutes out and always try to arrive at least 5 minutes before the start time being set.',
			examples: ['\t!start 2:20pm'],
			args: [
				{
					key: TimeParameter.START,
					label: 'start time',
					prompt: 'When do you wish to begin this raid?\nExamples: `8:43`, `2:20pm`\n\n*or*\n\nIn how long (in minutes) do you wish to begin this raid?\nExample: `15`\n',
					type: 'time'
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'start' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Set the start time of a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const start_time = args[TimeParameter.START],
			info = Raid.setRaidStartTime(message.channel.id, start_time);

		message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
			.catch(err => log.error(err));

		const total_attendees = Raid.getAttendeeCount(info.raid),
			verb = total_attendees === 1 ?
				'is' :
				'are',
			noun = total_attendees === 1 ?
				'trainer' :
				'trainers',
			calendar_format = {
				sameDay: 'LT',
				sameElse: 'l LT'
			},
			formatted_start_time = moment(start_time).calendar(null, calendar_format),
			channel = await Raid.getChannel(info.raid.channel_id)
				.catch(err => log.error(err));

		// notify all attendees that a time has been set
		Object.entries(info.raid.attendees)
			.filter(([attendee, attendee_status]) => attendee !== message.member.id &&
				attendee_status.status !== RaidStatus.COMPLETE)
			.forEach(([attendee, attendee_status]) => {
				Raid.getMember(message.channel.id, attendee)
					.then(member => member.send(
						`A start time of ${formatted_start_time} has been set for ${channel.toString()}. ` +
						`There ${verb} currently **${total_attendees}** ${noun} attending!`))
					.catch(err => log.error(err));
			});

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = StartTimeCommand;
