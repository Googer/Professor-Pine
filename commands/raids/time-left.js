"use strict";

const log = require('loglevel').getLogger('TimeLeftCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup, TimeParameter} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class TimeRemainingCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'left',
			group: CommandGroup.RAID_CRUD,
			memberName: 'left',
			aliases: ['time-left', 'time-remaining', 'remaining', 'time-remain', 'remain', 'end-time', 'end', 'ends', 'ending'],
			description: 'Sets the remaining time for an existing raid.',
			details: 'Use this command to set remaining time on a raid.',
			examples: ['\t!left 45', '\t!remain 50'],
			args: [
				{
					key: TimeParameter.END,
					label: 'time left',
					prompt: 'How much time is remaining (in minutes) until the raid ends?\nExample: `43`\n\n*or*\n\nWhen does this raid end?\nExample: `6:12`\n',
					type: 'time'
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'left' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Set the time remaining for a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const time = args[TimeParameter.END],
			info = Raid.setRaidEndTime(message.channel.id, time);

		message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
			.catch(err => log.error(err));

		Utility.cleanConversation(message);

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = TimeRemainingCommand;
