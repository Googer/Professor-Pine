const log = require('loglevel').getLogger('GymQueueCommand'),
  commando = require('discord.js-commando'),
  oneLine = require('common-tags').oneLine,
  Helper = require('../../../app/helper'),
  Gym = require('../../../app/gym'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class CheckGymQueue extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'gym-queue',
      group: CommandGroup.REGION,
      memberName: 'gym-queue',
      description: 'Get current queues waiting for update.',
      details: oneLine`
				This command will identify channels waiting to be reindexed and gyms waiting for places updates.
			`,
      examples: ['\tgymqueue']
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'gym-queue') {
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

  async run(msg) {
    let message = "Gyms waiting for places updates:```";
    if (Gym.getPlacesQueue().length > 0) {
      message += Gym.getPlacesQueue().join(", ");
    } else {
      message += "None";
    }
    message += "```\n";

    message += "Channels waiting to be reindexed:\n";
    if (Gym.getIndexQueue().length > 0) {
      message += "<#";
      message += Gym.getIndexQueue().join(">\n<#");
      message += ">"
    } else {
      message += "```None```";
    }

    // TODO: Use more sophisticated message splitting, but at least this should keep it from breaking if the list of
    // places and/or regions is long
    msg
      .say(message, {
        split: {
          char: ','
        }
      })
      .catch(err => log.error(err));
  }
};
