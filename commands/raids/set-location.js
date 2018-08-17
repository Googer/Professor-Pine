"use strict";

const log = require('loglevel').getLogger('LocationCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

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
      raid = PartyManager.getParty(message.channel.id),
      info = raid.setRaidLocation(gymId);

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .then(result => {
        Helper.client.emit('raidGymSet', raid, message.member.id);

        return true;
      })
      .catch(err => log.error(err));

    raid.refreshStatusMessages();
  }
}

module.exports = SetLocationCommand;
