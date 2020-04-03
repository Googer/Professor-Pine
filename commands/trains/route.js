"use strict";

const log = require('loglevel').getLogger('RouteCommand'),
  {MessageEmbed} = require('discord.js'),
  Commando = require('discord.js-commando'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  {CommandGroup, PartyStatus, PartyType} = require('../../app/constants'),
  PartyManager = require('../../app/party-manager');

class RouteCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'route',
      group: CommandGroup.TRAIN,
      memberName: 'route',
      aliases: ['view-route'],
      description: 'View the train\'s route.',
      details: 'Use this command to view the route of a raid train.',
      examples: ['\t!route'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'route' &&
        !PartyManager.validParty(message.channel.id, PartyType.RAID_TRAIN)) {
        return {
          reason: 'invalid-channel',
          response: message.reply('You can only view a route from a train channel!')
        };
      }
      return false;
    });
  }

  async run(message) {
    const train = PartyManager.getParty(message.channel.id),
      route = train.route ?
        train.route[0] !== '' ?
          train.route :
          [] :
        [],
      current = train.currentGym || 0;

    let embed = await train.getRouteEmbed();

    message.channel.send(`${message.author}, here is the route information:`, embed)
      .then(routeMessage => {
        routeMessage.channel.send(`To edit this route, use the \`${message.client.commandPrefix}route-add\`, \`${message.client.commandPrefix}route-remove\`, and \`${message.client.commandPrefix}route-edit\` commands.`)
          .then(routeSecondMessage => {
            train.removeLastRouteMessage(routeMessage, routeSecondMessage);

            message.delete()
              .catch(err => log.error(err));
          });
      })
      .catch(err => log.error(err));
  }
}

module.exports = RouteCommand;
