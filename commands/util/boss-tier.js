"use strict";

const log = require('loglevel').getLogger('BossTierCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class BossTierCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'boss-tier',
      group: CommandGroup.UTIL,
      memberName: 'boss-tier',
      aliases: ['bosstier', 'boss-level'],
      description: 'Looks up the tier for a particular pokémon.',
      details: 'Use this command to look up the tier for a specific pokémon.',
      examples: ['\t!boss-tier deoxys', '\t!boss-level mawile'],
      args: [
        {
          key: 'pokemon',
          prompt: 'What pokémon are you attempting to look up?\nExample: `lugia`\n',
          type: 'pokemon',
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'boss-tier' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('bosstier.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    const pokemon = args['pokemon'];

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .then(result => {
        console.log(pokemon);

        let name = (pokemon.name || pokemon.tier + '').split('');
        name[0] = name[0].toUpperCase();
        name = name.join('');
        let tier = ' tier ' + pokemon.tier + '';
        if (pokemon.exclusive) {
          tier = 'n exclusive';
        }
        message.channel.send(name + ' is a' + tier + ' raid boss.');

        return true;
      })
      .catch(err => log.error(err));
  }
}

module.exports = BossTierCommand;
