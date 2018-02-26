"use strict";

const log = require('loglevel').getLogger('GroupCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class GroupCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'group',
			group: CommandGroup.BASIC_RAID,
			memberName: 'group',
			aliases: ['set-group'],
			description: 'Sets your group for a raid.',
			details: 'Use this command to set the group you are joining for a raid.',
			examples: ['\t!group B'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'group' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Set your raid group for a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const raid = Raid.getRaid(message.channel.id),
			calendar_format = {
				sameDay: 'LT',
				sameElse: 'l LT'
			},
			provided = message.constructor.parseArgs(args.trim(), 1, this.argsSingleQuotes);

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

		return group_collector.obtain(message, provided)
			.then(collection_result => {
				Utility.cleanCollector(collection_result);

				if (!collection_result.cancelled) {
					const group_id = collection_result.values['group'],
						info = Raid.setMemberGroup(message.channel.id, message.member.id, group_id);

					if (!info.error) {
						message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
							.catch(err => log.error(err));

						Raid.refreshStatusMessages(info.raid);
					} else {
						return message.reply(info.error)
							.catch(err => log.error(err));
					}
				} else {
					return message.reply('Cancelled command.')
						.catch(err => log.error(err));
				}
			})
			.catch(err => log.error(err));
	}
}

module.exports = GroupCommand;
