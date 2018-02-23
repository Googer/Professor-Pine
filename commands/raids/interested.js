"use strict";

const log = require('loglevel').getLogger('InterestedCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup, RaidStatus} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	moment = require('moment'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility'),
	NaturalArgumentType = require('../../types/natural');

class InterestedCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'maybe',
			group: CommandGroup.BASIC_RAID,
			memberName: 'maybe',
			aliases: ['interested', 'interest', 'hmm'],
			description: 'Expresses interest in an existing raid without committing to it.',
			details: 'Use this command to express interest in a raid.',
			examples: ['\t!maybe', '\t!interested', '\t!hmm'],
			args: [
				{
					key: 'additional_attendees',
					label: 'additional attendees',
					prompt: 'How many additional people would come with you?\nExample: `+1`\n\n*or*\n\nHow many people would come (including yourself)?\nExample: `2`\n',
					type: 'natural',
					default: NaturalArgumentType.UNDEFINED_NUMBER
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'maybe' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Express interest in a raid from its raid channel!')];
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

			let prompt = 'Which group do you wish to show interest in for this raid?\n\n';

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
					return Raid.setMemberStatus(message.channel.id, message.member.id, RaidStatus.INTERESTED, additional_attendees);
				});
		} else {
			status_promise = Promise.resolve(
				Raid.setMemberStatus(message.channel.id, message.member.id, RaidStatus.INTERESTED, additional_attendees));
		}

		status_promise.then(info => {
			if (!info.error) {
				message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
					.catch(err => log.error(err));

				Raid.refreshStatusMessages(info.raid);
			} else {
				message.reply(info.error)
					.catch(err => log.error(err));
			}
		});
	}
}

module.exports = InterestedCommand;
