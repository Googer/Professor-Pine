"use strict";

const log = require('loglevel').getLogger('PokemonCommand'),
	Commando = require('discord.js-commando'),
	Gym = require('../../app/gym'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class SetPokemonCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'set-pokemon',
			group: 'raids',
			memberName: 'set-pokemon',
			aliases: ['set-poke', 'pokemon', 'poke', 'set-boss', 'boss'],
			description: 'Set a pokemon for a specific raid.',
			details: 'Use this command to set the pokemon of a raid.',
			examples: ['\t!set-pokemon lugia', '\t!pokemon molty', '\t!poke zapdos'],
			args: [
				{
					key: 'raid_id',
					label: 'raid id',
					prompt: 'What is the ID of the raid you wish to set the pokemon for?',
					type: 'raid'
				},
				{
					key: 'pokemon',
					prompt: 'What Pokemon (or tier if unhatched) is this raid?\nExample: `lugia`',
					type: 'pokemon',
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'set-pokemon' && !Gym.isValidChannel(message.channel.name)) {
				message.reply('Set the pokemon of a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const raid_id = args['raid_id'],
			pokemon = args['pokemon'],
			info = Raid.setRaidPokemon(raid_id, pokemon);

		message.react('👍')
			.catch(err => log.error(err));

		Utility.cleanConversation(message);

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = SetPokemonCommand;
