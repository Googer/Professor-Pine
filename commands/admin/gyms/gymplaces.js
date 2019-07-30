const log = require('loglevel').getLogger('GymPlacesCommand'),
  commando = require('discord.js-commando'),
  oneLine = require('common-tags').oneLine,
  GymCache = require('../../../app/gym'),
  Helper = require('../../../app/helper'),
  Meta = require('../../../app/geocode'),
  Region = require('../../../app/region'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class GymPlaces extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'gym-places',
      group: CommandGroup.REGION,
      memberName: 'gym-places',
      description: 'Updates nearby places for a gym.',
      details: oneLine`
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
      if (!!message.command && message.command.name === 'gym-places') {
        if (!Helper.isManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
        if (!Helper.isBotChannel(message)) {
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
      gym = await Region.getGym(this.getValue(args.term))
        .catch(error => msg.say(error)
          .catch(err => log.error(err)));
    } else {
      gym = await Region.findGym(isModLab ?
        null :
        msg.channel.id, args.term)
        .catch(error => msg.say(error)
          .catch(err => log.error(err)));
    }

    if (gym !== undefined && gym["name"]) {
      Meta.updatePlacesForGyms([gym["id"]], GymCache, Region)
        .then(() => msg.reply(`Places updating and associated channels queued for reindexing for ${gym['name']}`))
        .catch(err => log.error(err));
    } else {
      if (isID) {
        msg.reply("No gym found in this region with ID " + args.term)
          .catch(err => log.error(err));
      }
    }
  }

  getValue(value) {
    const first = value.substring(0, 1);
    if (first === "#") {
      const integer = value.substring(1, value.length);
      if (Number(integer)) {
        return Number(integer);
      }
    }

    return -1;
  }
};
