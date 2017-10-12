"use strict";

const log = require('loglevel').getLogger('TimeLeftCommand'),
	Commando = require('discord.js-commando'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class TimeRemainingCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'left',
			group: 'raid-crud',
			memberName: 'left',
			aliases: ['time-left', 'time-remaining', 'remaining', 'time-remain', 'remain', 'end-time', 'end'],
			description: 'Sets the time an existing raid remains (also works to set hatch time for an egg).',
			details: 'Use this command to set remaining time on a raid timer (if it has not yet begun), or to set its remaining time if it has.',
			examples: ['\t!left 45', '\t!remain 50'],
			args: [
				{
					key: 'time-left',
					label: 'time left',
					prompt: 'How much time is remaining (in minutes) until the raid ends (if it is an active raid) or hatches (if it is currently an unhatched egg)?\nExample: `43`\n\n*or*\n\nWhen does this raid end or hatch?\nExample: `6:12`\n',
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
		const time = args['time-left'],
			info = Raid.setRaidEndTime(message.channel.id, time);

		message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
			.catch(err => log.error(err));

		Utility.cleanConversation(message);

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = TimeRemainingCommand;
