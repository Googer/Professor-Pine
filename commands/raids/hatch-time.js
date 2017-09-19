"use strict";

const log = require('loglevel').getLogger('TimeLeftCommand'),
	Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class HatchTimeCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'hatch-time',
			group: 'raids',
			memberName: 'hatch-time',
			aliases: ['hatch', 'hatches'],
			description: 'Sets the time that a raid hatches.',
			details: 'Use this command to set the hatch time for a raid.',
			examples: ['\t!hatch-time 1:45', '\t!hatch 50', '\t!hatches at 9:45'],
			args: [
				{
					key: 'hatch-time',
					label: 'hatch time',
					prompt: 'How much time is remaining until the raid hatches? (use `h:mm` or `mm` format)?\nExample: `1:43`\n\n*or*\n\nWhen does this raid hatch? (use `at h:mm` format)?',
					type: 'time',
					min: 'relative'
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'hatch-time' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Set the hatch time for a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const time = args['hatch-time'],
			info = Raid.setRaidHatchTime(message.channel.id, time);

		message.react('👍')
			.catch(err => log.error(err));

		Utility.cleanConversation(message);

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = HatchTimeCommand;
