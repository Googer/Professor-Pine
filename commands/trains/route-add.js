"use strict";

const log = require('loglevel').getLogger('RouteAddCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Gym = require('../../app/gym'),
  Utility = require('../../app/utility');

class SetRouteAddCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'route-add',
      group: CommandGroup.TRAIN,
      memberName: 'route-add',
      aliases: ['add-route', 'add-gym', 'add-location', 'gym-add', 'location-add'],
      description: 'Adds a gym to a train\'s route.\n',
      details: 'Use this command to add a location to a train\'s route.  This command is channel sensitive, meaning it only finds gyms associated with the enclosing region.',
      examples: ['\t!route-add Unicorn', '\t!route-add \'Bellevue Park\'', '\t!route-add squirrel'],
      args: [
        {
          key: 'gymId',
          label: 'gym',
          prompt: 'Where is the raid taking place?\nExample: `manor theater`\n',
          type: 'gym',
          wait: 60
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'route-add' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID_TRAIN])) {
          return ['invalid-channel', message.reply('To add to a route, you must be in a train\'s channel!')];
      }

      return false;
    });
  }

  async run(message, args) {
    const gymId = args['gymId'],
      gym = Gym.getGym(gymId),
      party = PartyManager.getParty(message.channel.id);

    if (!!message.adjacent) {
      // Found gym is in an adjacent region
      const confirmationCollector = new Commando.ArgumentCollector(message.client, [
          {
            key: 'confirm',
            label: 'confirmation',
            prompt: `${message.adjacent.gymName} was found in ${message.adjacent.channel.toString()}!  Should this gym be added to this route?\n`,
            type: 'boolean'
          }
        ], 3),
        confirmationResult = await confirmationCollector.obtain(message);

      let confirmation = false;
      Utility.cleanCollector(confirmationResult);

      if (!confirmationResult.cancelled) {
        confirmation = confirmationResult.values['confirm'];
      }

      if (!confirmation) {
        return;
      }
    }

    let route = await party.addRouteGym(gymId);

    if (!route) {
      let gymName = !!gym.nickname ? gym.nickname : gym.gymName;
      message.channel.send(`${message.author}, ${gymName} is already apart of this route.`);
    }

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    party.refreshStatusMessages();
  }
}

module.exports = SetRouteAddCommand;
