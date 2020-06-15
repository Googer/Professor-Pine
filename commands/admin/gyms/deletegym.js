const log = require('loglevel').getLogger('DeleteGymCommand'),
  commando = require('discord.js-commando'),
  oneLine = require('common-tags').oneLine,
  Gym = require('../../../app/gym'),
  he = require('he'),
  Helper = require('../../../app/helper'),
  PartyManager = require('../../../app/party-manager'),
  Region = require('../../../app/region'),
  Utility = require('../../../app/utility'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class DeleteGym extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'delete-gym',
      aliases: ['bye-gym', 'nuke-gym'],
      group: CommandGroup.REGION,
      memberName: 'delete-gym',
      description: 'Delete a gym.',
      details: oneLine`
				This command will find a gym based on your search term and delete it after your confirmation.
			`,
      examples: ['\tbyegym dog stop']
    });

    this.gymCollector = new commando.ArgumentCollector(client, [{
      key: 'gym',
      prompt: 'What gym are you trying to remove? Provide a name or a search term',
      type: 'findgym'
    }], 3);

    this.confirmationCollector = new commando.ArgumentCollector(client, [{
      key: 'confirm',
      prompt: 'Are you sure you want to remove this gym?',
      type: 'boolean'
    }], 3);

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'delete-gym') {
        if (!Helper.isBotManagement(message)) {
          return {
            reason: 'unauthorized',
            response: message.reply('You are not authorized to use this command.')
          };
        }

        if (!Helper.isBotChannel(message) && !Helper.isChannelBounded(message.channel.id, PartyManager.getRaidChannelCache())) {
          return {
            reason: 'invalid-channel',
            response: message.reply('Delete gyms from regional channels or a bot channel.')
          };
        }
      }

      return false;
    });
  }

  cleanup(gymResult, confirmResult, gymMessage) {
    let messagesToDelete = [...gymResult.prompts, ...gymResult.answers];

    if (confirmResult) {
      messagesToDelete = [...messagesToDelete, ...confirmResult.prompts, ...confirmResult.answers];
    }

    if (gymMessage) {
      messagesToDelete = [...messagesToDelete, gymMessage];
    }

    Utility.deleteMessages(messagesToDelete);
  }

  async run(msg, args) {
    const that = this;
    const gymArgs = (args.length > 0) ? [args] : [];

    this.gymCollector.obtain(msg, gymArgs)
      .then(async gymResult => {
        if (!gymResult.cancelled) {
          const gym = gymResult.values['gym'];
          const gymMessage = gym.message;

          that.confirmationCollector.obtain(msg)
            .then(async confirmResult => {
              if (!confirmResult.cancelled) {
                const confirm = confirmResult.values['confirm'];

                if (confirm) {
                  const thinkingReaction = await msg.react('🤔')
                    .catch(err => log.error(err));

                  Region.deleteGym(gym.id, Gym)
                    .then(result => {
                      thinkingReaction.users.remove(msg.client.user.id)
                        .catch(err => log.error(err));

                      if (result) {
                        msg.reply(he.decode(gym.name) + ' was removed successfully.')
                          .catch(err => log.error(err));
                      } else {
                        msg.reply('An error occurred while deleting ' + he.decode(gym.name) + '.')
                          .catch(err => log.error(err));
                      }
                    })
                    .catch(error => false);
                }
              }

              that.cleanup(gymResult, confirmResult, gymMessage);
            });
        } else {
          that.cleanup(gymResult);
        }
      });
  }
};
