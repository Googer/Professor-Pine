const commando = require('discord.js-commando'),
  Discord = require('discord.js'),
  oneLine = require('common-tags').oneLine,
  Region = require('../../../app/region'),
  Helper = require('../../../app/helper'),
  GymCache = require('../../../app/gym'),
  Meta = require('../../../app/geocode'),
  PartyManager = require('../../../app/party-manager'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class GymPlaces extends commando.Command {
	constructor(client) {
		super(client, {
			name: 'gymplaces',
			aliases: ['gym-places'],
			group: CommandGroup.REGION,
			memberName: 'gymplaces',
			description: 'Updates nearby places for a gym.',
			details: oneLine `
				This command will get nearby places for a gym and update them, and queue it to be reindexed for search.
			`,
			examples: ['\tgymplaces #6368'],
			args: [{
				key: 'term',
				prompt: 'Provide a id, name or search phrase for the gym you are looking for...',
				type: 'string'
			}]
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'gymplaces') {
				if (!Helper.isManagement(message)) {
					return ['unauthorized', message.reply('You are not authorized to use this command.')];
				}
        if(!Helper.isBotChannel(message)) {
          return ['invalid-channel', message.reply('This command must be ran in a bot channel.')]
        }
			}

			return false;
		});
	}

  async run(msg, args) {
    let gym;
	  let isID = false;
	  let isModLab = msg.channel.name === "mod-bot-lab";

		if (this.getValue(args.term) > -1) {
			isID = true;
			gym = await Region.getGym(this.getValue(args.term)).catch(error => msg.say(error));
		} else {
			gym = await Region.findGym(isModLab ? null : msg.channel.id, args.term).catch(error => msg.say(error));
		}

		if (gym !== undefined && gym["name"]) {

      Meta.updatePlacesForGyms([gym["id"]],GymCache,Region);
      msg.reply(`Places updating and associated channels queued for reindexing for ${gym['name']}`);

		} else {
			if (isID) {
				msg.reply("No gym found in this region with ID " + args.term)
			}
		}
	}

	getValue(value) {
		const first = value.substring(0, 1);
		if (first === "#") {
			const integer = value.substring(1, value.length);
			if (Number(integer)) {
				return Number(integer)
			}
		}

		return -1
	}
};
