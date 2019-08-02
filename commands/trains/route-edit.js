"use strict";

const log = require('loglevel').getLogger('EditRouteCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Gym = require('../../app/gym'),
  Utility = require('../../app/utility');

class EditRouteCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'route-edit',
      group: CommandGroup.TRAIN,
      memberName: 'route-edit',
      aliases: ['edit-route', 'edit-location', 'location-edit'],
      description: 'Edit a gym\'s position in a train\'s route.\n',
      details: 'Use this command to edit a location\'s spot in a train\'s route.  This command is channel sensitive, meaning it only finds gyms associated with the enclosing region.',
      examples: ['\t!route-remove'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'route-edit' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID_TRAIN])) {
        return ['invalid-channel', message.reply('To edit a route location, you must be in a train\'s channel!')];
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
          prompt: `Which gym number would you like to move?`,
          type: 'string',
          oneOf: validInputs
        }
      ], 3),
      gymPromise = await gymCollector.obtain(message)
        .then(async collectionResult => {
          Utility.cleanCollector(collectionResult);

          if (!collectionResult.cancelled) {
            let gymToMove = collectionResult.values.gymId;
            let gymId = party.route[Number.parseInt(gymToMove) - 1];
            let gym = Gym.getGym(gymId);
            let gymName = !!gym.nickname ? gym.nickname : gym.name;
            await party.removeRouteGym(Number.parseInt(gymToMove) - 1);

            validInputs = [];
            if (party.route) {
              for (let i = 0; i < party.route.length; i++) {
                validInputs.push((i + 1) + '');
              }
            }

            message.channel.send(`${message.author}, this is the remaining route:`, party.getRouteEmbed())
              .then(routeMessage => {
                setTimeout(() => {
                  routeMessage.delete()
                    .catch(err => log.error(err));
                }, 30000);
              })
              .catch(err => log.error(err));

            const gymCollector2 = new Commando.ArgumentCollector(message.client, [
              {
                key: 'gymId',
                label: 'gymId',
                prompt: `Which gym number would you like ${gymName} to be before?`,
                type: 'string',
                oneOf: validInputs
              }
            ], 3);

            let beforeGym = await gymCollector2.obtain(message),
              beforeIndexValue = !beforeGym.cancelled ? beforeGym.values.gymId : gymToMove,
              beforeIndex = Number.parseInt(beforeIndexValue) - 1;

            Utility.cleanCollector(beforeGym);

            await party.insertRouteGym(beforeIndex, gymId);
          }

          Utility.cleanCollector(collectionResult);
        });

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    party.refreshStatusMessages();
  }
}

module.exports = EditRouteCommand;
