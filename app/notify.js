"use strict";

const log = require('loglevel').getLogger('Notify'),
  DB = require('./db'),
  Helper = require('./helper'),
  {MessageEmbed} = require('discord.js'),
  PartyManager = require('./party-manager'),
  settings = require('../data/settings');

class Notify {
  constructor() {
  }

  initialize() {
    Helper.client.on('raidCreated', (raid, memberId) =>
      this.notifyMembersOfRaid(raid, memberId));

    Helper.client.on('raidPokemonSet', (raid, memberId, egg) =>
      this.notifyMembersOfRaid(raid, memberId, egg));

    Helper.client.on('raidGymSet', (raid, memberId) =>
      this.notifyMembersOfRaid(raid, memberId));

    Helper.client.on('trainCreated', (train, memberId) =>
      this.notifyMembersOfTrain(train, memberId));

    Helper.client.on('spawnReported', (pokemon, memberId, location, message, additionalPokemon) =>
      this.notifyMembersOfSpawn(pokemon, memberId, location, message, additionalPokemon));
  }

  static getDbPokemonNumber(pokemon) {
    return Number.parseInt(pokemon.number) || -pokemon.tier;
  }

  // get pokemon that member is interested in
  getPokemonNotifications(member) {
    return DB.DB('PokemonNotification')
      .innerJoin('User', {'PokemonNotification.userId': 'User.id'})
      .innerJoin('Guild', {'PokemonNotification.guildId': 'Guild.id'})
      .where('User.userSnowflake', member.user.id)
      .andWhere('Guild.snowflake', member.guild.id);
  }

  // get gyms that member is interested in
  getGymNotifications(member) {
    return DB.DB('GymNotification')
      .innerJoin('User', {'GymNotification.userId': 'User.id'})
      .innerJoin('Guild', {'GymNotification.guildId': 'Guild.id'})
      .where('User.userSnowflake', member.user.id)
      .andWhere('Guild.snowflake', member.guild.id)
      .pluck('gym');
  }

  async notifyMembersOfTrain(train, reportingMemberId) {
    const trainChannel = (await PartyManager.getChannel(train.channelId)).channel,
      guildId = trainChannel.guild.id;

    let trainMembers = await DB.DB('User')
      .where('User.newTrain', 1)
      .pluck('User.userSnowflake');

    const notificationMessageHeader = await train.getNotificationMessageHeader(reportingMemberId),
      fullStatusMessage = await train.getFullStatusMessage(),
      messagesToSend = [];

    for (const memberId of [...new Set([...trainMembers])]
      .filter(memberId => memberId !== reportingMemberId)
      .filter(memberId => trainChannel.guild.members.has(memberId))
      .filter(memberId => trainChannel.permissionsFor(memberId).has('VIEW_CHANNEL'))) {
      messagesToSend.push({
        userId: memberId,
        message: notificationMessageHeader,
        embed: fullStatusMessage.embed
      });
    }

    Helper.sendNotificationMessages(messagesToSend)
      .catch(err => log.error(err));
  }

  async notifyMembersOfSpawn(pokemon, reportingMemberId, location, message, additionalPokemon = null) {
    const areaChannel = message.channel,
      guildId = message.guild.id,
      number = Notify.getDbPokemonNumber(pokemon),
      additionalNumber = additionalPokemon ? Notify.getDbPokemonNumber(additionalPokemon) : NaN,
      numbers = additionalPokemon ? [number, additionalNumber] : [number],
      dbPokemonNumbers = [...new Set(numbers)]
        .filter(number => !isNaN(number));

    // don't try to look up notifications from screenshot placeholders where
    // a valid pokemon wasn't determined
    let pokemonMembers;

    if (pokemon.placeholder) {
      pokemonMembers = [];
    } else {
      pokemonMembers = await DB.DB('User')
        .innerJoin('PokemonNotification', {'User.id': 'PokemonNotification.userId'})
        .innerJoin('Guild', {'PokemonNotification.guildId': 'Guild.id'})
        .whereIn('PokemonNotification.pokemon', dbPokemonNumbers)
        .whereIn('type', ['spawn', 'both'])
        .andWhere('Guild.snowflake', guildId)
        .pluck('User.userSnowflake');
    }

    const pokemonName = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1)
      + (additionalPokemon ? ' ' + additionalPokemon.name.charAt(0).toUpperCase() + additionalPokemon.name.slice(1) : ''),
      regionChannel = (await PartyManager.getChannel(message.channel.id)).channel,
      reportingMember = (await PartyManager.getMember(regionChannel.id, reportingMemberId)).member,
      shiny = pokemon.shiny || (additionalPokemon && additionalPokemon.shiny) ?
        Helper.getEmoji(settings.emoji.shiny) || '✨' :
        '',
      article = (pokemonName.match(/^[AEIOU]/i) !== null) ? 'An' : 'A',
      header = `${article} ${pokemonName}${shiny} spawn has been reported in #${regionChannel.name} by ${reportingMember.displayName}:`,
      regionHeader = `${article} ${pokemonName}${shiny} spawn has been reported by ${reportingMember.displayName}:`,
      botLabChannel = message.guild.channels.find(channel => channel.name === settings.channels["bot-lab"]),
      embed = new MessageEmbed();
    embed.setColor('GREEN');
    embed.setDescription(location + '\n\n**Warning: Spawns are user-reported. There is no way to know exactly how long a Pokémon will be there. Most spawns are 30 min. Use your discretion when chasing them.**');

    if (pokemon.url && !additionalPokemon) {
      embed.setThumbnail(pokemon.url);
    } else if (additionalPokemon && additionalPokemon.url) {
      embed.setThumbnail(additionalPokemon.url);
    }

    message.channel.send(regionHeader, {embed})
      .then(message => {
        message.delete({timeout: 30 * settings.messageCleanupDelayStatus})
          .catch(err => log.error(err));
        message.channel.send(`To enable or disable notifications for spawns, use the \`${message.client.commandPrefix}want\` command in ${botLabChannel.toString()}. To report a spawn, use the \`${message.client.commandPrefix}spawn\` command in a region channel.`)
          .then(message => message.delete({timeout: 30 * settings.messageCleanupDelayStatus}))
          .catch(err => log.error(err));
      })
      .catch(err => log.error(err));

    const messagesToSend = [];

    for (const memberId of [...new Set(pokemonMembers)]
      .filter(memberId => memberId !== reportingMemberId)
      .filter(memberId => areaChannel.guild.members.has(memberId))
      .filter(memberId => areaChannel.permissionsFor(memberId).has('VIEW_CHANNEL'))) {
      messagesToSend.push({
        userId: memberId,
        message: header,
        embed
      });
    }

    Helper.sendNotificationMessages(messagesToSend)
      .catch(err => log.error(err));
  }

  // notify interested members for the raid associated with the given channel and pokemon (and / or or gym),
  // filtering out the reporting member
  async notifyMembersOfRaid(raid, reportingMemberId, egg = false) {
    // Don't send a notification for EX raids
    if (raid.pokemon.exclusive) {
      return;
    }

    const raidChannel = (await PartyManager.getChannel(raid.channelId)).channel,
      pokemon = raid.pokemon,
      gymId = raid.gymId,
      guildId = raidChannel.guild.id,
      number = Notify.getDbPokemonNumber(pokemon),
      tier = pokemon.tier,
      dbPokemonNumbers = [...new Set([number, -tier])]
        .filter(number => !isNaN(number));

    // don't try to look up notifications from screenshot placeholders where
    // a valid pokemon wasn't determined
    let pokemonMembers;

    if (pokemon.placeholder) {
      pokemonMembers = [];
    } else {
      pokemonMembers = await DB.DB('User')
        .innerJoin('PokemonNotification', {'User.id': 'PokemonNotification.userId'})
        .innerJoin('Guild', {'PokemonNotification.guildId': 'Guild.id'})
        .whereIn('PokemonNotification.pokemon', dbPokemonNumbers)
        .whereIn('type', ['raid', 'both'])
        .andWhere('Guild.snowflake', guildId)
        .pluck('User.userSnowflake');
    }

    const gymMembers = await DB.DB('User')
      .innerJoin('GymNotification', {'User.id': 'GymNotification.userId'})
      .innerJoin('Guild', {'GymNotification.guildId': 'Guild.id'})
      .where('GymNotification.gym', gymId)
      .andWhere('Guild.snowflake', guildId)
      .pluck('User.userSnowflake');


    let attendees = [];

    if (egg) {
      attendees = await DB.DB('User')
        .whereIn('userSnowFlake', Object.keys(raid.attendees || {}))
        .andWhere('raidBoss', true)
        .pluck('userSnowflake');
    }

    const notificationMessageHeader = await raid.getNotificationMessageHeader(reportingMemberId),
      fullStatusMessage = await raid.getFullStatusMessage(),
      messagesToSend = [];

    for (const memberId of [...new Set([...pokemonMembers, ...gymMembers, ...attendees])]
      .filter(memberId => memberId !== reportingMemberId)
      .filter(memberId => raidChannel.guild.members.has(memberId))
      .filter(memberId => raidChannel.permissionsFor(memberId).has('VIEW_CHANNEL'))) {
      messagesToSend.push({
        userId: memberId,
        message: notificationMessageHeader,
        embed: fullStatusMessage.embed
      });
    }

    Helper.sendNotificationMessages(messagesToSend)
      .catch(err => log.error(err));
  }

  // give pokemon notification to user
  assignPokemonNotification(member, pokemon, type) {
    let userDbId;

    // add pokemon notification for member to DB
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => {
        userDbId = userId[0];

        return DB.DB('Guild')
          .where('snowflake', member.guild.id)
          .pluck('id')
          .first();
      })
      .then(guildId => {
        return DB.insertIfAbsent('PokemonNotification', Object.assign({},
          {
            userId: userDbId,
            pokemon: Notify.getDbPokemonNumber(pokemon)
          }))
          .then(notificationId => {
            return DB.DB('PokemonNotification')
              .where('id', notificationId)
              .update({
                pokemon: Notify.getDbPokemonNumber(pokemon),
                guildId: guildId.id,
                userId: userDbId,
                type: type
              });
          });
      });
  }

  // removes all pokemon notifications from user
  removeAllPokemonNotifications(member) {
    let guildDbId;

    return DB.DB('Guild')
      .where('snowflake', member.guild.id)
      .pluck('id')
      .first()
      .then(guildId => {
        guildDbId = guildId.id;

        return DB.DB('User')
          .where('userSnowflake', member.user.id)
          .pluck('id')
          .first();
      })
      .then(userId => DB.DB('PokemonNotification')
        .where('userId', userId.id)
        .andWhere('guildId', guildDbId)
        .del())
  }

  // remove pokemon notification from user if they have it
  removePokemonNotification(member, pokemon) {
    return new Promise((resolve, reject) => {
      this.pokemonNotificationExists(member, pokemon)
        .then(exists => {
          if (exists) {
            let guildDbId;

            DB.DB('Guild')
              .where('snowflake', member.guild.id)
              .pluck('id')
              .first()
              .then(guildId => {
                guildDbId = guildId.id;

                return DB.DB('User')
                  .where('userSnowflake', member.user.id)
                  .pluck('id')
                  .first();
              })
              .then(userId => DB.DB('PokemonNotification')
                .where('pokemon', Notify.getDbPokemonNumber(pokemon))
                .andWhere('userId', userId.id)
                .andWhere('guildId', guildDbId)
                .del())
              .then(result => resolve(result))
              .catch(err => reject(err));
          } else {
            resolve();
          }
        });
    });
  }

  // check if notification exists for member and pokemon combination
  async pokemonNotificationExists(member, pokemon) {
    const result = await DB.DB('PokemonNotification')
      .innerJoin('User', {'User.id': 'PokemonNotification.userId'})
      .innerJoin('Guild', {'Guild.id': 'PokemonNotification.guildId'})
      .where('PokemonNotification.pokemon', Notify.getDbPokemonNumber(pokemon))
      .andWhere('User.userSnowflake', member.user.id)
      .andWhere('Guild.snowflake', member.guild.id)
      .count('* as count')
      .first();

    return Promise.resolve(result.count > 0);
  }

  // give pokemon notification to user
  assignGymNotification(member, gym) {
    return this.gymNotificationExists(member, gym)
      .then(exists => {
        if (!exists) {
          let userDbId;

          // add gym notification for member to DB
          return DB.insertIfAbsent('User', Object.assign({},
            {
              userSnowflake: member.user.id
            }))
            .then(userId => {
              userDbId = userId[0];

              return DB.DB('Guild')
                .where('snowflake', member.guild.id)
                .pluck('id')
                .first();
            })
            .then(guildId => {
              return DB.DB('GymNotification')
                .insert({
                  gym: gym,
                  guildId: guildId.id,
                  userId: userDbId
                })
            });
        } else {
          return exists;
        }
      });
  }

  // removes all gym notifications from user
  removeAllGymNotifications(member) {
    let guildDbId;

    return DB.DB('Guild')
      .where('snowflake', member.guild.id)
      .pluck('id')
      .first()
      .then(guildId => {
        guildDbId = guildId.id;

        return DB.DB('User')
          .where('userSnowflake', member.user.id)
          .pluck('id')
          .first();
      })
      .then(userId => DB.DB('GymNotification')
        .where('userId', userId.id)
        .andWhere('guildId', guildDbId)
        .del())
  }

  // remove gym notification from user if they have it
  removeGymNotification(member, gym) {
    return new Promise((resolve, reject) => {
      this.gymNotificationExists(member, gym)
        .then(exists => {
          if (exists) {
            let guildDbId;

            DB.DB('Guild')
              .where('snowflake', member.guild.id)
              .pluck('id')
              .first()
              .then(guildId => {
                guildDbId = guildId.id;

                return DB.DB('User')
                  .where('userSnowflake', member.user.id)
                  .pluck('id')
                  .first();
              })
              .then(userId => DB.DB('GymNotification')
                .where('gym', gym)
                .andWhere('userId', userId.id)
                .andWhere('guildId', guildDbId)
                .del())
              .then(result => resolve(result))
              .catch(err => reject(err));
          } else {
            resolve();
          }
        });
    });
  }

  // check if notification exists for member and gym combination
  async gymNotificationExists(member, gym) {
    const result = await DB.DB('GymNotification')
      .innerJoin('User', {'User.id': 'GymNotification.userId'})
      .innerJoin('Guild', {'Guild.id': 'GymNotification.guildId'})
      .where('GymNotification.gym', gym)
      .andWhere('User.userSnowflake', member.user.id)
      .andWhere('Guild.snowflake', member.guild.id)
      .count('* as count')
      .first();

    return Promise.resolve(result.count > 0);
  }

  // check is member wants mentions or not; if they're not in the table at all,
  // assume they *do* want them
  async shouldMention(member, type) {
    const result = await DB.DB('User')
      .where('userSnowflake', member.user.id)
      .first();

    return !!result ?
      result.mentions === 1 && result[type] === 1 :
      true;
  }

  // set mention flag for given user to value passed in
  setMention(member, mention) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          mentions: mention
        }))
      .catch(err => log.error(err));
  }

  setMentionShouts(member, mention) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          shouts: mention
        }))
      .catch(err => log.error(err));
  }

  setMentionGroups(member, mention) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          groups: mention
        }))
      .catch(err => log.error(err));
  }

  setMentionTrainGroups(member, mention) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          trainMovement: mention
        }))
      .catch(err => log.error(err));
  }

  async shout(message, members, text, type, fromMember = null) {
    const party = await PartyManager.getParty(message.channel.id),
      membersStrings = await Promise.all(members
        .map(async member => {
          const mention = await this.shouldMention(member, type);

          return mention ?
            member.toString() :
            `**${member.displayName}**`;
        }))
        .catch(err => log.error(err)),
      membersString = membersStrings
        .reduce((prev, next) => prev + ', ' + next),
      botLabChannel = message.guild.channels.find(channel => channel.name === settings.channels["bot-lab"]),
      embed = new MessageEmbed();

    embed.setColor('GREEN');

    if (!!fromMember) {
      embed.setTitle(`Message from **${fromMember.displayName}**`);
    }
    embed.setDescription(text);

    message.channel.send(membersString, embed)
      .then(shoutMessage => {
        message.channel.send(`To enable or disable these notifications, use the \`${message.client.commandPrefix}mentions\`, \`${message.client.commandPrefix}mentions-groups\`, \`${message.client.commandPrefix}mentions-train-stops\` and \`${message.client.commandPrefix}mentions-shouts\` commands in ${botLabChannel.toString()}.`)
          .then(shoutFooterMessage => {
            if (type === 'trainMovement') {
              party.removeLastTrainMovement(shoutMessage, shoutFooterMessage);
            }
          })
      })
      .catch(err => log.error(err));
  }
}

module.exports = new Notify();
