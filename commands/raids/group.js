"use strict";

const log = require('loglevel').getLogger('GroupCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid');

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
			args: [
				{
					key: 'group',
					label: 'group',
					prompt: 'Which group do you wish to join for this raid?\nExample: `B`\n',
					type: 'raid-group'
				}
			],
			argsPromptLimit: 3,
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
		const group_id = args['group'],
			info = Raid.setMemberGroup(message.channel.id, message.member.id, group_id);

		if (!info.error) {
			message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
				.catch(err => log.error(err));

			Raid.refreshStatusMessages(info.raid);
		} else {
			message.reply(info.error)
				.catch(err => log.error(err));
		}
	}
}

module.exports = GroupCommand;
