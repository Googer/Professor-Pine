const log = require('loglevel').getLogger('DeleteGymCommand'),
  commando = require('discord.js-commando'),
  oneLine = require('common-tags').oneLine,
  Gym = require('../../../app/gym'),
  Helper = require('../../../app/helper'),
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
      prompt: 'Are you sure you want to remove this gym? Reply `(Y)es` or `(N)o`',
      type: 'string',
      validate: value => {
        const v = value.toLowerCase();
        const first = value.substring(0, 1);
        if (v === 'y' || v === 'n' || v === 'yes' || v === 'no') {
          return true;
        } else {
          return 'Please provide a `(Y)es` or `(N)o` response.';
        }
      }
    }], 3);

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'delete-gym') {
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

  cleanup(gymResult, confirmResult, gymMessage) {
    let messagesToDelete = [...gymResult.prompts, ...gymResult.answers];

    if (confirmResult) {
      messagesToDelete = [...messagesToDelete, ...confirmResult.prompts, ...confirmResult.answers];
    }

    if (gymMessage) {
      messagesToDelete = [...messagesToDelete, [gymMessage]];
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
                const confirm = confirmResult.values['confirm'].substring(0, 1);
                that.cleanup(gymResult, confirmResult, gymMessage);

                if (confirm === 'y' || confirm === 'yes') {
                  Region.deleteGym(gym.id, Gym)
                    .then(result => {
                      if (result) {
                        msg.reply(gym.name + ' was removed successfully.')
                          .catch(err => log.error(err));
                      } else {
                        msg.reply('An error occurred while deleting ' + gym.name)
                          .catch(err => log.error(err));
                      }
                    })
                    .catch(error => false);
                }
              } else {
                that.cleanup(gymResult, confirmResult, gymMessage);
              }
            });
        } else {
          that.cleanup(gymResult);
        }
      });
  }
};
