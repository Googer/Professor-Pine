const commando = require('discord.js-commando'),
  Discord = require('discord.js'),
  oneLine = require('common-tags').oneLine,
  Region = require('../../../app/region'),
  Meta = require('../../../app/geocode'),
  {CommandGroup} = require('../../../app/constants'),
  Helper = require('../../../app/helper');

module.exports = class GeocodeGym extends commando.Command {
	constructor(client) {
		super(client, {
			name: 'geocode',
			aliases: ['geo'],
			group: CommandGroup.REGION,
			memberName: 'geocode',
			description: 'Geocodes all gyms.',
			details: oneLine `
				This command will pull geocode information for each gym from google maps.
			`,
			examples: ['\tgeocode dog stop'],
			guildOnly: true,
			args: [{
				key: 'term',
				prompt: 'Provide a name , #id or search phrase for the gym you are looking for...',
				type: 'string'
			}]
		});

    client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'geocode') {
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

	async run(msg,args) {

    let gym;
		let isID = false;
		if (this.getValue(args.term) > -1) {
			isID = true;
			gym = await Region.getGym(this.getValue(args.term)).catch(error => msg.say(error));
		} else {
			gym = await Region.findGym(msg.channel.id, args.term).catch(error => msg.say(error));
		}

		if (gym !== undefined && gym["name"]) {
			const phrase = isID ? "Gym found with ID " + args.term : "Gym found with term '" + args.term + "'";

			Meta.geocodeGym(gym).then(gym => {
				if (gym) {
					let message = "Successfully updated geocode information for " + gym.name + " (Gym #" + gym.id + ")```";
					const geo = JSON.parse(gym.geodata);
					for (const [key, value] of Object.entries(geo["addressComponents"])) {
						message += key + ": " + value + "\n";
					}
					message += "```";
					msg.say(message)

				} else {
					msg.say("No geocode data found")
				}
			}).catch(error => {
				console.log(error);
				msg.say("Damn");
			})

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
