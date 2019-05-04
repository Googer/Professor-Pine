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
			name: 'gymdetail',
			aliases: ['gym-detail'],
			group: CommandGroup.REGION,
			memberName: 'gymdetail',
			description: 'Shows detailed information about a gym.',
			details: oneLine `
				This command will show all stored information about the specified gym including geolocation information and nearby places.
			`,
			examples: ['\tgymdetail 6838'],
			args: [{
				key: 'term',
				prompt: 'Provide the id number of the gym you want details for. If you are unsure what the id number of the gym you want - use the \tfindgym command to find it first.',
				type: 'string'
			}]
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'gymdetail') {
        if (!Helper.isManagement(message)) {
					return ['unauthorized', message.reply('You are not authorized to use this command.')];
				}
			}
			return false;
		});
	}

	async run(msg, args) {
		let gym;
		let isModLab = msg.channel.name === "mod-bot-lab";

		if (this.getValue(args.term) > -1) {
			gym = await Region.getGym(this.getValue(args.term)).catch(error => msg.say(error));

      if (gym !== undefined && gym["name"]) {

        const channels = await Region.getChannelsForGym(gym).catch(error => []);
        const phrase = "Showing details for gym with ID " + args.term;
        await Region.showGymDetail(msg, gym, phrase, null, channels, false);
        const channelStrings = [];
        for(let i=0; i<channels.length; i++) {
          let channel= await PartyManager.getChannel(channels[i].channel_id);
          channelStrings.push(channel.channel.toString());
        }

        if(channelStrings.length > 0) {
          msg.say("This gym is in " + channelStrings.join(", "));
        } else {
          msg.say("This gym is not located in any region channels");
        }
      } else {
        msg.reply("No gym found with ID " + args.term);
      }

		} else {
      msg.reply("You must provide a valid gym id #");
		}
	}

	getValue(value) {
    if (Number(value)) {
      return Number(value)
    }
		return -1
	}

};
