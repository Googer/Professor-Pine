"use strict";

const log = require('loglevel').getLogger('RemoveRouteCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Gym = require('../../app/gym'),
  Utility = require('../../app/utility');

class RemoveRouteCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'route-remove',
      group: CommandGroup.TRAIN,
      memberName: 'route-remove',
      aliases: ['remove-route', 'remove-gym', 'remove-location', 'gym-remove', 'location-remove'],
      description: 'Removes a gym from a train\'s route.',
      details: 'Use this command to remove a location from a train\'s route.  This command is channel sensitive, meaning it only finds gyms associated with the enclosing region.',
      examples: ['\t!route-remove'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'route-remove' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID_TRAIN])) {
        return ['invalid-channel', message.reply('To remove a route location, you must be in a train\'s channel!')];
      }

      return false;
    });
  }

  async run(message, args) {
    const party = PartyManager.getParty(message.channel.id);
    let validInputs = [];
    if (party.route) {
      for (let i = 0; i < party.route.length; i++) {
        validInputs.push((i + 1) + '');
      }
    }

    message.channel.send(`${message.author}, this is the train's route:`, party.getRouteEmbed())
      .then(routeMessage => {
        setTimeout(() => {
          routeMessage.delete();
        }, 30000);
      })
      .catch(err => log.error(err));

    const gymCollector = new Commando.ArgumentCollector(message.client, [
        {
          key: 'gymId',
          label: 'gymId',
          prompt: `Which gym number would you like to remove?`,
          type: 'string',
          oneOf: validInputs
        }
      ], 3),
      gymResults = await gymCollector.obtain(message),
      gymToRemove = gymResults.values.gymId;

    Utility.cleanCollector(gymResults);

    let route = await party.removeRouteGym(Number.parseInt(gymToRemove) - 1);

    if (!route) {
      let gymName = !!gym.nickname ? gym.nickname : gym.gymName;
      message.channel.send(`${message.author}, ${gymName} is already a part of this route.`)
        .catch(err => log.error(err));
    }

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    party.refreshStatusMessages();
  }
}

module.exports = RemoveRouteCommand;
