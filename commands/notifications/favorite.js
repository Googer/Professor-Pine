"use strict";

const log = require('loglevel').getLogger('FavoriteCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, GymParameter} = require('../../app/constants'),
  {MessageEmbed} = require('discord.js'),
  Gym = require('../../app/gym'),
  Helper = require('../../app/helper'),
  Notify = require('../../app/notify'),
  Raid = require('../../app/raid'),
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
            const raid = Raid.getRaid(message.channel.id);

            return raid ?
              raid.gym_id :
              null;
          }
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'target' &&
        !Raid.validRaid(message.channel.id) &&
        !Gym.isValidChannel(message.channel.name)) {
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
    const gym_id = args['favorite'],
      in_raid_channel = Raid.validRaid(message.channel.id);

    let confirmation_response;

    if (in_raid_channel) {
      message.delete_original = true;
    }

    if (!in_raid_channel || Raid.getRaid(message.channel.id).gym_id !== gym_id) {
      const gym = Gym.getGym(gym_id),
        gym_name = !!gym.nickname ?
          gym.nickname :
          gym.gymName,
        embed = new MessageEmbed();

      embed.setTitle(`Map Link: ${gym_name}`);
      embed.setURL(`https://www.google.com/maps/search/?api=1&query=${gym.gymInfo.latitude}%2C${gym.gymInfo.longitude}`);
      embed.setColor('GREEN');
      embed.setImage(`attachment://${gym_id}.png`);

      let matched_gym_message;

      confirmation_response = message.channel.send(
        {
          files: [
            require.resolve(`PgP-Data/data/images/${gym_id}.png`)
          ],
          embed
        })
        .then(msg => {
          matched_gym_message = msg;
          return this.confirmationCollector.obtain(message);
        })
        .then(collection_result => {
          collection_result.prompts.push(matched_gym_message);
          Utility.cleanCollector(collection_result);

          if (!collection_result.cancelled) {
            return collection_result.values['confirm'];
          } else {
            return false;
          }
        })
        .catch(err => log.error(err));
    } else {
      confirmation_response = Promise.resolve(true);
    }

    confirmation_response
      .then(confirm => {
        if (confirm) {
          Notify.assignGymNotification(message.member, gym_id)
            .then(result => {
              if (message.channel.messages.has(message.id)) {
                message.react(Helper.getEmoji(settings.emoji.thumbs_up) || '👍');
              }
            })
            .catch(err => log.error(err));
        }
      });
  }
}

module.exports = FavoriteCommand;
