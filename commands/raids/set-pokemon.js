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
			aliases: ['set-pokemon', 'set-pokémon', 'set-poke', 'pokemon', 'pokémon', 'poke', 'poké', 'set-boss', 'against'],
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
			raid = Raid.getRaid(message.channel.id),
			info = Raid.setRaidPokemon(message.channel.id, pokemon);

		message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
			.then(async result => {
				if (pokemon.name) {
					const raid_channel = await Raid.getChannel(raid.channel_id),
						channel_string = raid_channel.toString();

					Notify.getMembers(message.guild, pokemon)
						.then(members => {
							members
								.filter(member_id => member_id !== message.member.id)
								.filter(member_id => raid_channel.permissionsFor(member_id).has('VIEW_CHANNEL'))
								.map(member_id => message.guild.members.get(member_id))
								.forEach(member => {
									const pokemon_name = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1);

									member.send(`A raid for ${pokemon_name} has been announced! - ${channel_string}`)
										.catch(err => log.error(err));
								});
						})
						.catch(err => log.error(err));
				}

				return true;
			})
			.catch(err => log.error(err));

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = SetPokemonCommand;
