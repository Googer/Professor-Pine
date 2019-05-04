const commando = require('discord.js-commando'),
  Discord = require('discord.js'),
  oneLine = require('common-tags').oneLine,
  Region = require('../../app/region'),
  {CommandGroup} = require('../../app/constants'),
  PartyManager = require('../../app/party-manager'),
  Helper = require('../../app/helper');

module.exports = class GetBounds extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'bounds',
      aliases: ['region-bounds'],
      group: CommandGroup.REGION,
      memberName: 'bounds',
      description: 'Gets the bounds the channel encompasses.',
      details: oneLine`
				This command will get a link and image of the bounding area the channel encompasses.
			`,
      examples: ['bounds']
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'bounds') {
        if (PartyManager.validParty(message.channel.id)) {
          const channel = Helper.regionChannelForCategory(Helper.getParentChannel(message.channel.id).id, PartyManager.getRaidChannelCache());
          return ['unauthorized', message.reply("This command is not available in raid channels. Please see " + channel.toString() + " for region info.")]
        }
        if (Helper.isChannelChild(message.channel.id) && PartyManager.categoryHasRegion(Helper.getParentChannel(message.channel.id).id) && !PartyManager.channelCanRaid(message.channel.id)) {
          const channel = Helper.regionChannelForCategory(Helper.getParentChannel(message.channel.id).id, PartyManager.getRaidChannelCache());
          return ['unauthorized', message.reply("No region defined for this channel. Please see " + channel.toString() + " for region info.")];
        }
      }
      return false;
    });
  }

  async run(msg) {
    Region.getRegionEmbed(msg.channel.id).then(embed => {
      if (embed) {
        msg.channel.send({embed});
      } else {
        msg.say("No region defined for this channel.")
      }
    }).catch(error => msg.say("No region defined for this channel."))
  }
};
