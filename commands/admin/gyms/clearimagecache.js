"use strict";

const log = require('loglevel').getLogger('ClearImageCacheCommand'),
  commando = require('discord.js-commando'),
  oneLine = require('common-tags').oneLine,
  Helper = require('../../../app/helper'),
  ImageCacher = require('../../../app/imagecacher'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class ClearImageCache extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'clearimagecache',
      aliases: ['clear-image-cache'],
      group: CommandGroup.REGION,
      memberName: 'clearimagecache',
      description: 'Clear local cache of region and gym images.',
      details: oneLine`
				This command will delete all locally saved images for region boundaries and gym pins.
			`,
      examples: ['\tclearimagecache'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'clearimagecache') {
        if (!Helper.isManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
        if (!Helper.isBotChannel(message)) {
          return ['invalid-channel', message.reply('This command must be ran in a bot channel.')]
        }
      }

      return false;
    });
  }

  async run(msg) {
    let images = await ImageCacher.clearCache();
    msg.say(`Deleted ${images} cached images.`)
      .catch(err => log.error(err));
  }
};
