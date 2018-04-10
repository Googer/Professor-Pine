"use strict";

const log = require('loglevel').getLogger('SubmitRequestCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Gym = require('../../app/gym'),
	Helper = require('../../app/helper'),
	https = require('https'),
	private_settings = require('../../data/private-settings'),
	Raid = require('../../app/raid'),
	settings = require('../../data/settings');

class SubmitRequestCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'request',
			group: CommandGroup.RAID_CRUD,
			memberName: 'request',
			aliases: ['submit-request'],
			description: 'Submits a change request for a gym in the master database to development.',
			details: 'Use this command submit a change request to a gym, such as a nickname, additional search terms for it, additional information that should be displayed with its raid status messages, etc.',
			examples: ['\t!request',
				'\t!request Everyone local knows this gym as \'red door church\'.  Can you add this as a nickname for it?',
				'\t!request The owner of the store that this gym is at gets annoyed if players stand in front of the door to his shop\'s entrance.'],
			throttling: {
				usages: 3,
				duration: 1800
			},
			args: [
				{
					key: 'reason',
					prompt: 'What information do you want to be added or changed for this gym?\n',
					type: 'string',
					wait: 120,
					infinite: true
				}
			],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'request' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Make gym change requests from a raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const reason = `Request from ${message.member.displayName}:\n\n` + args['reason']
				.map(reason => reason.trim())
				.join(' '),
			raid = Raid.getRaid(message.channel.id),
			gym_id = raid.gym_id,
			gym = Gym.getGym(gym_id),
			post_data = JSON.stringify({
				title: `Gym request: '${gym.gymName}' (id ${gym_id})`,
				body: reason,
				labels: [`${gym_id}`]
			}),
			post_options = {
				hostname: 'api.github.com',
				path: `/repos/${private_settings.github_repo}/issues`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(post_data),
					'User-Agent': 'Mozilla/5.0'
				},
				auth: `${private_settings.github_user}:${private_settings.github_password}`
			},
			post_request = https.request(post_options, result => {
				result.setEncoding('utf8');
				result
					.on('data', chunk => log.debug('Response: ' + chunk))
					.on('error', err => log.error(err))
					.on('end', () => {
						message.react(Helper.getEmoji(settings.emoji.thumbs_up) || '👍')
							.catch(err => log.error(err));
					});
			});

		post_request.on('error', err => log.error(err));

		// post the data
		post_request.write(post_data);
		post_request.end();
	}
}

module.exports = SubmitRequestCommand;
