"use strict";

const log = require('loglevel').getLogger('CreateGymCommand'),
  Commando = require('discord.js-commando'),
  Discord = require('discord.js'),
  Gym = require('../../../app/gym'),
  Helper = require('../../../app/helper'),
  oneLine = require('common-tags').oneLine,
  PartyManager = require('../../../app/party-manager'),
  Region = require('../../../app/region'),
  Utility = require('../../../app/utility'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class CreateGym extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'create-gym',
      aliases: ['new-gym'],
      group: CommandGroup.REGION,
      memberName: 'create-gym',
      description: 'Create a new gym.',
      details: oneLine`
				This command will get a link and image of the bounding area the channel encompasses.
			`,
      examples: ['creategym']
    });

    this.locationCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'location',
        prompt: 'What is the latitude & longitude location of this gym? You can provide a link to pin, or the raw latitude and longitude numbers.',
        type: 'coords',
        wait: 60
      }
    ], 3);

    this.nameCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'name',
        prompt: 'What is the in-game name of this gym? (ex: Starbucks)',
        type: 'string',
        wait: 60
      }
    ], 3);

    this.nicknameCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'nickname',
        prompt: 'Provide a nickname for this gym? (ex: Starbucks Green Tree) Type `skip` or `n` to ignore.',
        type: 'string',
        wait: 60
      },
    ], 3);

    this.descriptionCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'description',
        prompt: 'Provide a description for this gym? Type `skip` or `n` to ignore.',
        type: 'string',
        wait: 120
      }
    ], 3);

    this.confirmationCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'confirm',
        prompt: 'An existing gym sits in close proximity to the point you are trying to add one too. If the gym shown above is the one you are attempting to add, type `yes` to cancel this command or `no` to continue adding a new gym.',
        type: 'string',
        validate: value => {
          const v = value.toLowerCase();
          const first = v.substring(0, 1);
          if (first === "y" || first === "n") {
            return true;
          } else {
            return "Please provide a `yes` or `no` response."
          }
        }
      }
    ], 3);

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'create-gym') {
        if (!Helper.isManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
        if (!Helper.isBotChannel(message)) {
          return ['invalid-channel', message.reply('This command must be run in a bot channel.')]
        }
      }

      return false;
    });
  }

  showSimilarGym(gym, msg) {
    let title = gym["name"];
    if (gym["nickname"]) {
      title += " (" + gym["nickname"] + ")";
    }
    const embed = new Discord.MessageEmbed()
      .setTitle(title)
      .setDescription("Another gym found in close proximity to the provided location.")
      .setURL(Region.googlePinLinkForPoint(gym["lat"] + "," + gym["lon"]));

    const that = this;
    msg.channel.send({embed})
      .then(message => that.similarMessage = message)
      .catch(err => log.error(err));
  }

  cleanup(msg, locationResult, nameResult, nicknameResult, descriptionResult) {
    let messagesToDelete = [msg, ...locationResult.prompts, ...locationResult.answers];

    if (nameResult) {
      messagesToDelete = [...messagesToDelete, ...nameResult.prompts, ...nameResult.answers];
    }

    if (nicknameResult) {
      messagesToDelete = [...messagesToDelete, ...nicknameResult.prompts, ...nicknameResult.answers];
    }

    if (descriptionResult) {
      messagesToDelete = [...messagesToDelete, ...descriptionResult.prompts, ...descriptionResult.answers];
    }

    Utility.deleteMessages(messagesToDelete);
  }

  async finishCollection(msg, locationResult) {
    const that = this;
    this.nameCollector.obtain(msg)
      .then(async nameResult => {
        if (!nameResult.cancelled) {
          const name = nameResult.values["name"];
          that.nicknameCollector.obtain(msg)
            .then(async nicknameResult => {
              if (!nicknameResult.cancelled) {
                const nickname = nicknameResult.values["nickname"];
                that.descriptionCollector.obtain(msg)
                  .then(async descriptionResult => {
                    if (!descriptionResult.cancelled) {
                      const thinkingReaction = await msg.react('🤔')
                        .catch(err => log.error(err));

                      const description = descriptionResult.values["description"];
                      const details = {
                        "location": locationResult.values["location"],
                        "name": name,
                        "nickname": nickname,
                        "description": description
                      };
                      const gym = await Region.addGym(details, Gym)
                        .catch(error => msg.say(error)
                          .catch(err => log.error(err)))
                        .then(async finalGym => {
                          thinkingReaction.users.remove(msg.client.user.id)
                            .catch(err => log.error(err));

                          let channels = await Region.getChannelsForGym(finalGym, msg.channel.guild.id);
                          await Region.showGymDetail(msg, finalGym, "New Gym Added", null, false);
                          const channelStrings = [];
                          for (let i = 0; i < channels.length; i++) {
                            let channel = await PartyManager.getChannel(channels[i].channelId);
                            channelStrings.push(channel.channel.toString());
                          }

                          let affectedChannels = await Region.findAffectedChannels(finalGym["id"]);
                          if (channelStrings.length > 0) {
                            msg.say("This gym is in " + channelStrings.join(", ") + ".")
                              .catch(err => log.error(err));
                          } else {
                            msg.say("This gym is not located in any region channels.")
                              .catch(err => log.error(err));
                          }

                          that.cleanup(msg, locationResult, nameResult, nicknameResult, descriptionResult);
                        });
                    } else {
                      that.cleanup(msg, locationResult, nameResult, nicknameResult, descriptionResult);
                    }
                  })
              } else {
                that.cleanup(msg, locationResult, nameResult, nicknameResult);
              }
            })
        } else {
          that.cleanup(msg, locationResult, nameResult);
        }
      })
  }

  async run(msg, args) {
    const that = this;
    const locationArgs = (args.length > 0) ? [args] : [];
    this.locationCollector.obtain(msg, locationArgs)
      .then(async locationResult => {
        if (!locationResult.cancelled) {

          const location = locationResult.values["location"];
          // var region = await Region.getRegionsRaw(msg.channel.id)
          // var gyms = await Region.getGyms(region).catch(error => [])
          const gyms = await Region.getAllGyms();
          const coords = await Region.coordStringFromText(location);

          //Check for gym in close proximity
          if (gyms.length > 0 && Region.findSimilarGymByLocation(gyms, coords)) {
            const similar = Region.findSimilarGymByLocation(gyms, coords);
            that.showSimilarGym(similar, msg);

            //Offer the user the ability to cancel if they realize the gym they are trying to add already exists
            that.confirmationCollector.obtain(msg)
              .then(async confirmResult => {
                if (!confirmResult.cancelled) {
                  const result = confirmResult.values["confirm"].toLowerCase();
                  const first = result.substring(0, 1);
                  if (first === "n") {
                    that.finishCollection(msg, locationResult);
                  } else {
                    that.cleanup(msg, locationResult)
                  }
                }

                Utility.deleteMessages([that.similarMessage, ...confirmResult.prompts, ...confirmResult.answers]);
              })
          } else {
            that.finishCollection(msg, locationResult);
          }
        } else {
          that.cleanup(msg, locationResult);
        }
      })
  }
};
