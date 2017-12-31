"use strict";

const log = require('loglevel').getLogger('PokemonCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Notify = require('../../app/notify'),
	Raid = require('../../app/raid');

class SetPokemonCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'boss',
			group: CommandGroup.RAID_CRUD,
			memberName: 'boss',
			aliases: ['set-pokemon', 'set-pokémon', 'set-poke', 'pokemon', 'pokémon', 'poke', 'poké', 'set-boss', 'against', 'tier', 'level'],
			description: 'Changes the pokémon for an existing raid, usually to specify the actual raid boss for a now-hatched egg.',
			details: 'Use this command to set the pokémon of a raid.',
			examples: ['\t!boss lugia', '\t!pokemon molty', '\t!poke zapdos'],
			args: [
				{
					key: 'pokemon',
					prompt: 'What pokémon (or tier if unhatched) is this raid?\nExample: `lugia`\n',
					type: 'pokemon',
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'boss' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Set the pokémon of a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const pokemon = args['pokemon'],
			info = Raid.setRaidPokemon(message.channel.id, pokemon);

		message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
			.then(result => {
				if (pokemon.name) {
					return Notify.notifyMembers(message.channel.id, pokemon, message.member.id);
				}

				return true;
			})
			.catch(err => log.error(err));

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = SetPokemonCommand;
