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

  cleanup(gym_result, confirm_result, gym_message) {
    if (gym_message) {
      gym_message.delete();
    }

    gym_result.prompts.forEach(message => {
      message.delete();
    });

    gym_result.answers.forEach(message => {
      message.delete();
    });

    if (confirm_result) {
      confirm_result.prompts.forEach(message => {
        message.delete();
      });

      confirm_result.answers.forEach(message => {
        message.delete();
      });
    }
  }

  async run(msg, args) {
    const that = this;
    const gym_args = (args.length > 0) ? [args] : [];

    this.gymCollector.obtain(msg, gym_args).then(async function (gym_result) {
      if (!gym_result.cancelled) {
        const gym = gym_result.values['gym'];
        const gym_msg = gym.message;

        that.confirmationCollector.obtain(msg).then(async function (confirm_result) {
          if (!confirm_result.cancelled) {
            const confirm = confirm_result.values['confirm'].substring(0, 1);
            that.cleanup(gym_result, confirm_result, gym_msg);

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
            that.cleanup(gym_result, confirm_result, gym_msg);
          }
        });
      } else {
        that.cleanup(gym_result);
      }
    });
  }
};
