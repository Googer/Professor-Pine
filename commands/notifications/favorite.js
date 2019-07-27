"use strict";

const log = require('loglevel').getLogger('FavoriteCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, GymParameter, PartyType} = require('../../app/constants'),
  {MessageEmbed} = require('discord.js'),
  Gym = require('../../app/gym'),
  Helper = require('../../app/helper'),
  Notify = require('../../app/notify'),
  PartyManager = require('../../app/party-manager'),
  Region = require('../../app/region'),
  settings = require('../../data/settings'),
  Utility = require('../../app/utility');

class FavoriteCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'target',
      group: CommandGroup.NOTIFICATIONS,
      memberName: 'target',
      aliases: ['fave', 'favorite'],
      description: 'Adds notifications for a specific gym.',
      details: 'Use this command to request notifications for a specific gym.  Use this command in a region or active raid channel.',
      examples: ['\t!target blackhoof', '\t!target'],
      args: [
        {
          key: GymParameter.FAVORITE,
          label: 'gym',
          prompt: 'What gym do you wish to be notified for?\nExample: `blackhoof`\n',
          type: 'gym',
          default: (message, argument) => {
            const raid = PartyManager.getParty(message.channel.id);

            return raid ?
              raid.gymId :
              null;
          }
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'target' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID]) &&
        !Gym.isValidChannel(message.channel.id)) {
        return ['invalid-channel', message.reply(Helper.getText('favorite.warning', message))];
      }
      return false;
    });

    this.confirmationCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'confirm',
        label: 'confirmation',
        prompt: 'Are you sure you want to mark this gym as a favorite?\n',
        type: 'boolean'
      }
    ], 3);
  }

  async run(message, args) {
    const gymId = args['favorite'],
      inRaidChannel = PartyManager.validParty(message.channel.id, [PartyType.RAID]);

    let confirmationResponse;

    if (inRaidChannel) {
      message.deleteOriginal = true;
    }

    if (!inRaidChannel || PartyManager.getParty(message.channel.id).gymId !== gymId) {
      const gym = Gym.getGym(gymId);

      let matchedGymMessage;

      confirmationResponse = Region.showGymDetail(message, gym, 'Found Gym', null, false)
        .then(msg => {
          matchedGymMessage = msg;
          return this.confirmationCollector.obtain(message);
        })
        .then(collectionResult => {
          collectionResult.prompts.push(matchedGymMessage);
          Utility.cleanCollector(collectionResult);

          if (!collectionResult.cancelled) {
            return collectionResult.values['confirm'];
          } else {
            return false;
          }
        })
        .catch(err => log.error(err));
    } else {
      confirmationResponse = Promise.resolve(true);
    }

    confirmationResponse
      .then(confirm => {
        if (confirm) {
          Notify.assignGymNotification(message.member, gymId)
            .then(result => {
              if (message.channel.messages.has(message.id)) {
                message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
              }
            })
            .catch(err => log.error(err));
        }
      });
  }
}

module.exports = FavoriteCommand;
