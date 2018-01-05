"use strict";

const log = require('loglevel').getLogger('CreateCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup, TimeParameter} = require('../../app/constants'),
	Gym = require('../../app/gym'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class RaidCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'raid',
			group: CommandGroup.RAID_CRUD,
			memberName: 'raid',
			aliases: ['create', 'announce'],
			description: 'Announces a new raid.',
			details: 'Use this command to start organizing a new raid.  For your convenience, this command combines several options such that you can set the pokémon and the location of the raid all at once.  ' +
				'Once created, it will further prompt you for the raid\'s hatch or end time.',
			examples: ['\t!raid lugia', '\t!raid zapdos manor theater', '\t!raid magikarp olea', '\t!raid ttar frog fountain'],
			throttling: {
				usages: 5,
				duration: 300
			},
			args: [
				{
					key: 'pokemon',
					prompt: 'What pokémon (or tier if unhatched) is this raid?\nExample: `lugia`\n',
					type: 'pokemon',
				},
				{
					key: 'gym_id',
					label: 'gym',
					prompt: 'Where is this raid taking place?\nExample: `manor theater`\n',
					type: 'gym',
					wait: 60
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		this.hatchTimeCollector = new Commando.ArgumentCollector(client, [
			{
				key: TimeParameter.HATCH,
				label: 'hatch time',
				prompt: 'How much time is remaining (in minutes) until the raid hatches?\nExample: `43`\n\n*or*\n\nWhen does this raid hatch?\nExample: `6:12`\n',
				type: 'time'
			}
		], 3);

		this.endTimeCollector = new Commando.ArgumentCollector(client, [
			{
				key: TimeParameter.END,
				label: 'time left',
				prompt: 'How much time is remaining (in minutes) until the raid ends?\nExample: `43`\n\n*or*\n\nWhen does this raid end?\nExample: `6:12`\n',
				type: 'time'
			}
		], 3);

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'raid' &&
				(Raid.validRaid(message.channel.id) || !Gym.isValidChannel(message.channel.name))) {
				return ['invalid-channel', message.reply('Create raids from region channels!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const pokemon = args['pokemon'],
			gym_id = args['gym_id'];

		let raid;

		Raid.createRaid(message.channel.id, message.member.id, pokemon, gym_id)
			// create and send announcement message to region channel
			.then(async info => {
				raid = info.raid;
				const raid_channel_message = await Raid.getRaidChannelMessage(raid),
					formatted_message = await Raid.getFormattedMessage(raid);

				return message.channel.send(raid_channel_message, formatted_message);
			})
			.then(announcement_message => Raid.addMessage(raid.channel_id, announcement_message))
			// create and send initial status message to raid channel
			.then(async bot_message => {
				const raid_source_channel_message = await Raid.getRaidSourceChannelMessage(raid),
					formatted_message = await Raid.getFormattedMessage(raid);
				return Raid.getChannel(raid.channel_id)
					.then(channel => channel.send(raid_source_channel_message, formatted_message))
					.catch(err => log.error(err));
			})
			.then(channel_raid_message => Raid.addMessage(raid.channel_id, channel_raid_message, true))
			// now ask user about remaining time on this brand-new raid
			.then(result => {
				// somewhat hacky way of letting time type know if this is exclusive or not
				message.is_exclusive = Raid.isExclusive(raid.channel_id);

				if (raid.pokemon.name) {
					return this.endTimeCollector.obtain(message);
				} else {
					return this.hatchTimeCollector.obtain(message);
				}
			})
			.then(collection_result => {
				Utility.cleanCollector(collection_result);

				if (!collection_result.cancelled) {

					if (raid.pokemon.name) {
						Raid.setRaidEndTime(raid.channel_id, collection_result.values[TimeParameter.END]);
					} else {
						Raid.setRaidHatchTime(raid.channel_id, collection_result.values[TimeParameter.HATCH]);
					}

					return Raid.refreshStatusMessages(raid);
				}
			})
			.then(result => {
				Helper.client.emit('raidCreated', raid, message.member.id);

				return true;
			})
			.catch(err => log.error(err));
	}
}

module.exports = RaidCommand;
