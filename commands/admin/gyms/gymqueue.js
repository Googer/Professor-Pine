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
        if (!Helper.isBotManagement(message)) {
          return {
            reason: 'unauthorized',
            response: message.reply('You are not authorized to use this command.')
          };
        }
        if (!Helper.isBotChannel(message)) {
          return {
            reason: 'invalid-channel',
            response: message.reply('This command must be run in a bot channel.')
          };
        }
      }
      return false;
    });
  }

  async run(msg) {
    let message = "Gyms waiting for places updates:\n`";
    if (Gym.getPlacesQueue().length > 0) {
      const gyms = await Promise.all(Gym.getPlacesQueue()
        .map(gymId => Gym.getGym(gymId)));

      message += gyms
        .filter(gym => !!gym)
        .map(gym => gym.name)
        .join("`\n`");
    } else {
      message += "None";
    }
    message += "`\n\n";

    message += "Channels waiting to be reindexed:\n";
    if (Gym.getIndexQueue().length > 0) {
      message += "<#";
      message += Gym.getIndexQueue().join(">\n<#");
      message += ">"
    } else {
      message += "`None`";
    }

    msg.say(message, {
      split: {
        char: '\n'
      }
    })
      .catch(err => log.error(err));
  }
};
