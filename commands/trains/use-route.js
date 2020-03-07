"use strict";

const log = require('loglevel').getLogger('UseRouteCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  Discord = require('discord.js'),
  settings = require('../../data/settings'),
  Gym = require('../../app/gym'),
  Utility = require('../../app/utility');

class UseRouteCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'use-route',
      group: CommandGroup.TRAIN,
      memberName: 'use-route',
      aliases: ['saved-route'],
      description: 'Use a saved route to set up a train\'s route.\n',
      details: 'Use this command to use a saved route to set up a train\'s route.',
      examples: ['\t!use-route'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'use-route' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID_TRAIN])) {
        return {
          reason: 'invalid-channel',
          response: message.reply('To use a saved route, you must be in a train\'s channel!')
        };
      }

      return false;
    });
  }

  async run(message, args) {
    const party = PartyManager.getParty(message.channel.id),
      routes = await party.getSavedRoutes(message);
    let embed = new Discord.MessageEmbed(),
      description = '',
      validInputs = [];
    if (routes) {
      for (let i = 0; i < routes.length; i++) {
        validInputs.push((i + 1) + '');

        description += (i + 1) + '. ' + routes[i].name + '\n';
      }
      embed.setDescription(description);
    } else {
      embed.setDescription('No Saved Routes');
    }
    embed.setColor('GREEN');


    message.channel.send(`${message.author}, these are your saved routes:`, embed)
      .then(routeMessage => {
        setTimeout(() => {
          routeMessage.delete();
        }, 30000);
      })
      .catch(err => log.error(err));

    const routeCollector = new Commando.ArgumentCollector(message.client, [
        {
          key: 'routeId',
          label: 'routeId',
          prompt: `Which route number would you like to use?`,
          type: 'string',
          oneOf: validInputs
        }
      ], 3),
      routePromise = await routeCollector.obtain(message)
        .then(async collectionResult => {
          Utility.cleanCollector(collectionResult);

          if (!collectionResult.cancelled) {
            let routeId = collectionResult.values.routeId;

            await party.setRoute(routes[Number.parseInt(routeId) - 1].gyms.split(','));
          }
        });

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    message.delete({timeout: 30000})
      .catch(err => log.error(err));

    party.refreshStatusMessages()
      .catch(err => log.error(err));
  }
}

module.exports = UseRouteCommand;
