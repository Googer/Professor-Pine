const commando = require('discord.js-commando'),
  Discord = require('discord.js'),
  oneLine = require('common-tags').oneLine,
  Region = require('../../../app/region'),
  PartyManager = require('../../../app/party-manager'),
  Gym = require('../../../app/gym'),
  Helper = require('../../../app/helper'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class FindGym extends commando.Command {
	constructor(client) {
		super(client, {
			name: 'findgym',
			aliases: ['find-gym', 'fort'],
			group: CommandGroup.REGION,
			memberName: 'gym',
			description: 'Find a gym in the region.',
			details: oneLine `
				This command will find a gym based on your search term within the region defined by this channel.
			`,
			examples: ['\tfindgym dog stop'],
			args: [{
				key: 'term',
				prompt: 'Provide a name or search phrase for the gym you are looking for...',
				type: 'string'
			}]
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'findgym') {
        if(Helper.isBotChannel(message) && Helper.isManagement(message)) {
          return false;
        }

				// if(!Helper.isChannelBounded(message.channel.id,PartyManager.getRaidChannelCache())) {
				// 	return ['unauthorized', message.reply('This command must be ran in a regional channel.')]
				// }

			}
			return false;
		});
	}

	async run(msg, args) {
		var gym;
		var isID = false;
		let isModLab = msg.channel.name === "mod-bot-lab";

		if (this.getValue(args.term) > -1) {
			isID = true;
			gym = await Region.getGym(this.getValue(args.term)).catch(error => msg.say(error));
		} else {
			gym = await Region.findGym(isModLab ? null : msg.channel.id, args.term).catch(error => msg.say(error));
		}

		if (gym != undefined && gym["name"]) {
      Region.getChannelsForGym(gym).then(async function(channels) {
        const phrase = isID ? "Gym found with ID " + args.term : "Gym found with term '" + args.term + "'";
        Region.showGymDetail(msg, gym, phrase, null, channels)

        var channelStrings = [];
        for(var i=0;i<channels.length;i++) {
          let channel= await PartyManager.getChannel(channels[i].channel_id);
          channelStrings.push(channel.channel.toString());
        }
        msg.say("This gym is in " + channelStrings.join(", "))
      }).catch(error => msg.say("An error occurred..."))

		} else {
			if (isID) {
				msg.reply("No gym found in this region with ID " + args.term)
			}
		}
	}

	getValue(value) {
		const first = value.substring(0, 1)
		if (first === "#") {
			const integer = value.substring(1, value.length)
			if (Number(integer)) {
				return Number(integer)
			}
		}

		return -1
	}

};
