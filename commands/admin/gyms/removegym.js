const commando = require('discord.js-commando'),
  Discord = require('discord.js'),
  oneLine = require('common-tags').oneLine,
  Gym = require('../../../app/gym'),
  Region = require('../../../app/region'),
  Helper = require('../../../app/helper'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class DeleteGym extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'removegym',
      aliases: ['remove-gym', 'byegym', 'nukegym'],
      group: CommandGroup.REGION,
      memberName: 'removegym',
      description: 'Remove a gym.',
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
      if (!!message.command && message.command.name === 'removegym') {
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
    if (gymMessage) {
      gymMessage.delete();
    }

    gymResult.prompts.forEach(message => {
      message.delete();
    });

    gymResult.answers.forEach(message => {
      message.delete();
    });

    if (confirmResult) {
      confirmResult.prompts.forEach(message => {
        message.delete();
      });

      confirmResult.answers.forEach(message => {
        message.delete();
      });
    }
  }

  async run(msg, args) {
    const that = this;
    const gymArgs = (args.length > 0) ? [args] : [];

    this.gymCollector.obtain(msg, gymArgs)
      .then(async function (gymResult) {
      if (!gymResult.cancelled) {
        const gym = gymResult.values['gym'];
        const gymMessage = gym.message;

        that.confirmationCollector.obtain(msg)
          .then(async function (confirmResult) {
          if (!confirmResult.cancelled) {
            const confirm = confirmResult.values['confirm'].substring(0, 1);
            that.cleanup(gymResult, confirmResult, gymMessage);

            if (confirm === 'y' || confirm === 'yes') {
              Region.deleteGym(gym.id, Gym).then(result => {
                if (result) {
                  msg.reply(gym.name + ' was removed successfully.');
                } else {
                  msg.reply('An error occurred while deleting ' + gym.name);
                }
              }).catch(error => false)
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
