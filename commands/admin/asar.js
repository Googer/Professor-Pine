"use strict";

const log = require('loglevel').getLogger('AsarCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Role = require('../../app/role'),
  settings = require('../../data/settings');

class AsarCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'asar',
      group: CommandGroup.ADMIN,
      memberName: 'asar',
      description: 'Add new self assignable role.',
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'asar') {
        if (!Helper.isManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
      }

      return false;
    });
  }

  async run(message, args) {
    // split text by comma "," into an array, and split those strings by "-" for an array of arrays.
    //		Additionally look for aliases contained within brackets [] and don't split those until later
    //		NOTE:  Spaces are required for "-" separation as roles could be "foo-bar"
    args = args
      .split(/(?![^)(]*\([^)(]*?\)\)),(?![^\[]*\])/g)
      .map(arg => {
        let [name, description] = arg.trim().split(/\s-\s/);
        let aliases = [];

        if (name.search(/[\[\],]/g) > 0) {
          const match = name.match(/\[.*\]/g);

          if (match && match[0].length) {
            aliases = match[0].replace(/[\[\]]/g, '').trim().split(/\s?,\s?/g);
          }
        }

        // remove aliases from name string
        name = name.replace(/\[.*\]/g, '').trim();

        return {name, aliases, description};
      });


    Role.upsertRoles(message.guild, args)
      .then(() => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => {
        if (err && err.error) {
          message.reply(err.error)
            .catch(err => log.error(err));
        } else {
          log.error(err);
        }
      });
  }
}

module.exports = AsarCommand;
