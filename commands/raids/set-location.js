"use strict";

const log = require('loglevel').getLogger('LocationCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Utility = require('../../app/utility');

class SetLocationCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'gym',
      group: CommandGroup.RAID_CRUD,
      memberName: 'gym',
      aliases: ['set-location', 'set-gym', 'location'],
      description: 'Changes the location for an existing raid.\n',
      details: 'Use this command to set the location of a raid.  This command is channel sensitive, meaning it only finds gyms associated with the enclosing region.',
      examples: ['\t!gym Unicorn', '\t!location \'Bellevue Park\'', '\t!location squirrel'],
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
      if (!!message.command && message.command.name === 'gym' &&
        !PartyManager.validParty(message.channel.id)) {
        return ['invalid-channel', message.reply('Set the location of a raid from its raid channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const gymId = args['gymId'],
      party = PartyManager.getParty(message.channel.id);

    let channel = undefined;

    if (!!message.adjacent) {
      // Found gym is in an adjacent region
      const confirmationCollector = new Commando.ArgumentCollector(message.client, [
          {
            key: 'confirm',
            label: 'confirmation',
            prompt: `${message.adjacent.gymName} was found in ${message.adjacent.channel.toString()}!  Should this raid be relocated there?\n`,
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

      channel = message.adjacent.channel;
    }

    const info = await party.setRaidLocation(gymId, channel);

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .then(result => {
        Helper.client.emit('raidGymSet', party, message.member.id);

        return true;
      })
      .catch(err => log.error(err));

    party.refreshStatusMessages(!!message.adjacent);
  }
}

module.exports = SetLocationCommand;
