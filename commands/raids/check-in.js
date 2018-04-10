"use strict";

const log = require('loglevel').getLogger('CheckInCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup, RaidStatus} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	moment = require('moment'),
	NaturalArgumentType = require('../../types/natural'),
	Raid = require('../../app/raid'),
	settings = require('../../data/settings'),
	Utility = require('../../app/utility');

class CheckInCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'here',
			group: CommandGroup.BASIC_RAID,
			memberName: 'here',
			aliases: ['arrive', 'arrived', 'present', 'check-in'],
			description: 'Lets others know you have arrived at an active raid.',
			details: 'Use this command to tell everyone you are at the raid location and to ensure that no one is left behind.',
			examples: ['\t!here +1', '\t!arrived', '\t!present'],
			args: [
				{
					key: 'additional_attendees',
					label: 'additional attendees',
					prompt: 'How many additional people are here with you?\nExample: `+1`\n\n*or*\n\nHow many people are here (including yourself)?\nExample: `2`\n',
					type: 'natural',
					default: NaturalArgumentType.UNDEFINED_NUMBER
				}
			],
			commandErrorMessage: (message, provided) =>
				`\`${provided[0]}\` is not a valid number of attendees!  If you intend to join a group, use the \`${client.commandPrefix}group\` command!`,
			argsPromptLimit: 0,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'here' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Check into a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const additional_attendees = args['additional_attendees'],
			current_status = Raid.getMemberStatus(message.channel.id, message.member.id),
			raid = Raid.getRaid(message.channel.id),
			group_count = raid.groups.length;

		let status_promise;

		if (current_status === RaidStatus.NOT_INTERESTED && group_count > 1) {
			const calendar_format = {
				sameDay: 'LT',
				sameElse: 'l LT'
			};

			let prompt = 'Which group do you wish to join for this raid?\n\n';

			raid.groups.forEach(group => {
				const start_time = !!group.start_time ?
					moment(group.start_time) :
					'',
					total_attendees = Raid.getAttendeeCount(raid, group.id);

				let group_label = `**${group.id}**`;

				if (!!group.label) {
					const truncated_label = group.label.length > 150 ?
						group.label.substring(0, 149).concat('…') :
						group.label;

					group_label += ` (${truncated_label})`;
				}

				if (!!group.start_time) {
					group_label += ` :: ${start_time.calendar(null, calendar_format)}`;
				}

				prompt += group_label + ` :: ${total_attendees} possible trainers\n`;
			});

			const group_collector = new Commando.ArgumentCollector(this.client, [
				{
					key: 'group',
					label: 'group',
					prompt: prompt,
					type: 'raid-group'
				}
			], 3);

			let group_id = raid.default_group_id;

			status_promise = group_collector.obtain(message)
				.then(collection_result => {
					Utility.cleanCollector(collection_result);

					if (!collection_result.cancelled) {
						group_id = collection_result.values['group'];
					}

					Raid.setMemberGroup(message.channel.id, message.member.id, group_id);
					return Raid.setMemberStatus(message.channel.id, message.member.id, RaidStatus.PRESENT, additional_attendees);
				});
		} else {
			status_promise = Promise.resolve(
				Raid.setMemberStatus(message.channel.id, message.member.id, RaidStatus.PRESENT, additional_attendees));
		}

		status_promise.then(info => {
			if (!info.error) {
				message.react(Helper.getEmoji(settings.emoji.thumbs_up) || '👍')
					.catch(err => log.error(err));

				Raid.refreshStatusMessages(info.raid);
			} else {
				message.reply(info.error)
					.catch(err => log.error(err));
			}
		});
	}
}

module.exports = CheckInCommand;
