const commando = require('discord.js-commando'),
  log = require('loglevel').getLogger('AddGymCommand'),
  Discord = require('discord.js'),
  oneLine = require('common-tags').oneLine,
  Region = require('../../../app/region'),
  Helper = require('../../../app/helper'),
  Gym = require('../../../app/gym'),
  PartyManager = require('../../../app/party-manager'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class AddGym extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'addgym',
      aliases: ['add-gym', 'newgym', 'newgym'],
      group: CommandGroup.REGION,
      memberName: 'addgym',
      description: 'Add a new gym.',
      details: oneLine`
				This command will get a link and image of the bounding area the channel encompasses.
			`,
      examples: ['addgym']
    });

    this.locationCollector = new commando.ArgumentCollector(client, [
      {
        key: 'location',
        prompt: 'What is the latitude & longitude location of this gym? You can provide a link to pin, or the raw latitude and longitude numbers.',
        type: 'coords'
      }
    ], 3);

    this.nameCollector = new commando.ArgumentCollector(client, [
      {
        key: 'name',
        prompt: 'What is the in-game name of this gym? (ex: Starbucks)',
        type: 'string'
      }
    ], 3);

    this.nicknameCollector = new commando.ArgumentCollector(client, [
      {
        key: 'nickname',
        prompt: 'Provide a nickname for this gym? (ex: Starbucks Green Tree) Type `skip` or `n` to ignore.',
        type: 'string'
      },
    ], 3);

    this.descriptionCollector = new commando.ArgumentCollector(client, [
      {
        key: 'description',
        prompt: 'Provide a description for this gym? Type `skip` or `n` to ignore.',
        type: 'string'
      }
    ], 3);

    this.confirmationCollector = new commando.ArgumentCollector(client, [
      {
        key: 'confirm',
        prompt: 'An existing gym sits in close proximity to the point you are trying to add one too. If the gym shown above is the one you are attempting to add, type `yes` to cancel this command or `no` to continue adding a new gym.',
        type: 'string',
        validate: value => {
          const v = value.toLowerCase();
          const first = value.substring(0, 1);
          if (first === "y" || first === "n") {
            return true;
          } else {
            return "Please provide a `yes` or `no` response."
          }
        }
      }
    ], 3);

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'addgym') {
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
    msg.channel.send({embed}).then(message => {
      that.similarMessage = message;
    });
  }

  cleanup(msg, locationResult, nameResult, nicknameResult, descriptionResult) {
    msg.delete();

    locationResult.prompts.forEach(message => {
      message.delete()
    });

    locationResult.answers.forEach(message => {
      message.delete()
    });

    if (nameResult) {
      nameResult.prompts.forEach(message => {
        message.delete()
      });

      nameResult.answers.forEach(message => {
        message.delete()
      })
    }

    if (nicknameResult) {
      nicknameResult.prompts.forEach(message => {
        message.delete()
      });

      nicknameResult.answers.forEach(message => {
        message.delete()
      })
    }

    if (descriptionResult) {
      descriptionResult.prompts.forEach(message => {
        message.delete()
      });

      descriptionResult.answers.forEach(message => {
        message.delete()
      })
    }
  }

  async finishCollection(msg, locationResult) {
    const that = this;
    this.nameCollector.obtain(msg).then(async function (nameResult) {
      if (!nameResult.cancelled) {
        const name = nameResult.values["name"];
        that.nicknameCollector.obtain(msg).then(async function (nicknameResult) {
          if (!nicknameResult.cancelled) {
            const nickname = nicknameResult.values["nickname"];
            that.descriptionCollector.obtain(msg).then(async function (descriptionResult) {
              if (!descriptionResult.cancelled) {
                const description = descriptionResult.values["description"];
                const details = {
                  "location": locationResult.values["location"],
                  "name": name,
                  "nickname": nickname,
                  "description": description
                };
                const gym = await Region.addGym(details, Gym).catch(error => msg.say(error)).then(async function (finalGym) {

                  let channels = await Region.getChannelsForGym(finalGym);
                  await Region.showGymDetail(msg, finalGym, "New Gym Added", null, false);
                  const channelStrings = [];
                  for (let i = 0; i < channels.length; i++) {
                    let channel = await PartyManager.getChannel(channels[i].channelId);
                    channelStrings.push(channel.channel.toString());
                  }

                  let affectedChannels = await Region.findAffectedChannels(finalGym["id"]);
                  if (channelStrings.length > 0) {
                    msg.say("This gym is in " + channelStrings.join(", "));
                  } else {
                    msg.say("This gym is not located in any region channels");
                  }

                  that.cleanup(msg, locationResult, nameResult, nicknameResult, descriptionResult)
                });

              } else {
                that.cleanup(msg, locationResult, nameResult, nicknameResult, descriptionResult)
              }
            })
          } else {
            that.cleanup(msg, locationResult, nameResult, nicknameResult)
          }
        })

      } else {
        that.cleanup(msg, locationResult, nameResult)
      }
    })
  }

  async run(msg, args) {
    const that = this;
    const locationArgs = (args.length > 0) ? [args] : [];
    this.locationCollector.obtain(msg, locationArgs).then(async function (locationResult) {
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
          that.confirmationCollector.obtain(msg).then(async function (confirmResult) {
            if (!confirmResult.cancelled) {
              const result = confirmResult.values["confirm"].toLowerCase();
              const first = result.substring(0, 1);
              if (first === "n") {
                that.finishCollection(msg, locationResult)
              } else {
                that.cleanup(msg, locationResult)
              }
            }

            that.similarMessage.delete();

            confirmResult.prompts.forEach(message => {
              message.delete()
            });

            confirmResult.answers.forEach(message => {
              message.delete()
            })
          })
        } else {
          that.finishCollection(msg, locationResult)
        }

      } else {
        that.cleanup(msg, locationResult)
      }
    })
  }
};
