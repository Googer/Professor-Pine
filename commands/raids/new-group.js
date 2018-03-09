"use strict";

const log = require('loglevel').getLogger('NewGroupCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup, RaidStatus} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid');

class NewGroupCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'new',
			group: CommandGroup.BASIC_RAID,
			memberName: 'new',
			aliases: ['new-group', 'create-group'],
			description: 'Creates a new group for a raid and sets your group to it.\n',
			details: 'Use this command to create a new group for a raid.',
			examples: ['\t!new'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'new' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Create a new raid group for a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const info = Raid.createGroup(message.channel.id, message.member.id);

		if (!info.error) {
			message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
				.catch(err => log.error(err));

			// notify all attendees of new group
			const attendees = Object.entries(info.raid.attendees)
				.filter(([attendee, attendee_status]) => attendee !== message.member.id &&
					attendee_status.status !== RaidStatus.COMPLETE)
				.map(([attendee, attendee_status]) => attendee);

			if (attendees.length > 0) {
				const members = await Promise.all(attendees
						.map(async attendee_id => await Raid.getMember(message.channel.id, attendee_id)))
						.catch(err => log.error(err)),
					members_string = members
						.map(member => `**${member.displayName}**`)
						.reduce((prev, next) => prev + ', ' + next);

				message.channel.send(`${members_string}: A new group has been created; if you wish to join it, type \`${this.client.commandPrefix}group ${info.group}\` !`)
					.catch(err => log.error(err));
			}

			Raid.refreshStatusMessages(info.raid);
		} else {
			message.reply(info.error)
				.catch(err => log.error(err));
		}
	}
}

module.exports = NewGroupCommand;
