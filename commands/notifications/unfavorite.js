"use strict";

const log = require('loglevel').getLogger('UnfavoriteCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, GymParameter, PartyType} = require('../../app/constants'),
  {MessageEmbed} = require('discord.js'),
  Gym = require('../../app/gym'),
  Helper = require('../../app/helper'),
  Notify = require('../../app/notify'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Utility = require('../../app/utility');

class UnfavoriteCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'untarget',
      group: CommandGroup.NOTIFICATIONS,
      memberName: 'untarget',
      aliases: ['defave', 'defavorite', 'unfave', 'unfavorite', 'detarget'],
      description: 'Removes notifications for a gym.',
      details: 'Use this command to remove notifications for a specific gym.  Use this command in a region or active raid channel.',
      examples: ['\t!untarget blackhoof', '\tdetarget'],
      args: [
        {
          key: GymParameter.FAVORITE,
          label: 'gym',
          prompt: 'What gym do you wish to be no longer be notified for?\nExample: `blackhoof`\n',
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
      if (!!message.command && message.command.name === 'untarget' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID]) &&
        !Gym.isValidChannel(message.channel.name)) {
        return ['invalid-channel', message.reply(Helper.getText('unfavorite.warning', message))];
      }
      return false;
    });

    this.confirmationCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'confirm',
        label: 'confirmation',
        prompt: 'Are you sure you want to unmark this gym as a favorite?\n',
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
      const gym = Gym.getGym(gymId),
        gymName = !!gym.nickname ?
          gym.nickname :
          gym.gymName,
        embed = new MessageEmbed();

      embed.setTitle(`Map Link: ${gymName}`);
      embed.setURL(`https://www.google.com/maps/search/?api=1&query=${gym.gymInfo.latitude}%2C${gym.gymInfo.longitude}`);
      embed.setColor('GREEN');
      embed.setImage(`attachment://${gymId}.png`);

      let matchedGymMessage;

      confirmationResponse = message.channel.send(
        {
          files: [
            require.resolve(`PgP-Data/data/images/${gymId}.png`)
          ],
          embed
        })
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
          Notify.removeGymNotification(message.member, gymId)
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

module.exports = UnfavoriteCommand;
