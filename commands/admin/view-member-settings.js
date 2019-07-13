"use strict";

const log = require('loglevel').getLogger('ViewMemberSettingsCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Discord = require('discord.js'),
  Helper = require('../../app/helper'),
  User = require('../../app/user');

class ViewMemberSettingsCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'view-member-settings',
      group: CommandGroup.ADMIN,
      memberName: 'view-member-settings',
      description: 'View settings for a sepcific user',
      examples: ['\t!view-member-settings @KingKovifor'],
      aliases: [],
      args: [
        {
          key: 'member',
          prompt: 'What member are you looking for?\nExample: `@KingKovifor`\n',
          type: 'member'
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'find-anonymous-raids') {
        if (!Helper.isBotManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
      }

      return false;
    });
  }

  async run(message, args) {
    const member = args['member'],
          memberId = member.user.id,
          memberSettings = await User.getUserSettings(memberId);

    const embed = new Discord.MessageEmbed();
    embed.setColor('GREEN');
    embed.addField(`Mentions`, memberSettings.mentions ? 'On' : 'Off');
    embed.addField(`Auto Status`, memberSettings.status ? memberSettings.status : 'Do Not Join');
    embed.addField(`Private Raid Reports`, memberSettings.raidPrivacy ? 'On' : 'Off');
    embed.addField(`Shout Mentions`, memberSettings.shouts ? 'On' : 'Off');
    embed.addField(`New Group Mentions`, memberSettings.groups ? 'On' : 'Off');
    if (memberSettings.silph) {
      embed.addField(`Silph Username`, memberSettings.silph);
    }

    if (memberSettings.nickname) {
      embed.addField(`In Game Nickname`,  memberSettings.nickname);
    }

    if (memberSettings.friendcode) {
      embed.addField(`Friend Code`, memberSettings.friendcode);
    }

    message.channel.send('Settings for ' + member.toString(), {embed});
  }
}

module.exports = ViewMemberSettingsCommand;
