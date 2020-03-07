"use strict";

const log = require('loglevel').getLogger('SaveRouteCommand'),
  {MessageEmbed} = require('discord.js'),
  Commando = require('discord.js-commando'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  {CommandGroup, PartyStatus, PartyType} = require('../../app/constants'),
  PartyManager = require('../../app/party-manager');

class SaveRouteCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'save-route',
      group: CommandGroup.TRAIN,
      memberName: 'save-route',
      aliases: [],
      description: 'Save the train\'s route for future use.',
      details: 'Use this command to save the route of a raid train.',
      examples: ['\t!rsave-route Downtown Starbucks'],
      args: [
        {
          key: 'name',
          label: 'name',
          prompt: 'What do you wish to name this saved route?',
          type: 'string'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'save-route' &&
        !PartyManager.validParty(message.channel.id, PartyType.RAID_TRAIN)) {
        return {
          reason: 'invalid-channel',
          response: message.reply('You can only save a route from a train channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const train = PartyManager.getParty(message.channel.id),
      name = args['name'];

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .then(result => {
        train.saveRoute(name, message);

        return true;
      })
      .catch(err => log.error(err));

    message.delete({timeout: 30000})
      .catch(err => log.error(err));
  }
}

module.exports = SaveRouteCommand;
