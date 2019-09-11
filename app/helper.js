"use strict";

const log = require('loglevel').getLogger('Helper'),
  text = require('../data/text'),
  {Team} = require('./constants'),
  settings = require('../data/settings');

class Helper {
  constructor() {
    this.text = text;
    this.client = null;
    this.notifyClient = null;

    // cache of emoji ids, populated on client login
    this.emojis = null;
  }

  setClient(client) {
    this.client = client;

    this.emojis = new Map(this.client.emojis.map(emoji => [emoji.name.toLowerCase(), emoji]));

    // map out some shortcuts per connected guild, so that a lengthy "find" is not required constantly
    // TODO:  Some day instead of using a single configurable settings channel name, allow each guild to set a bot channel in DB
    this.guild = new Map(this.client.guilds.map(guild => {
      const roles = new Map(guild.roles.map(role => [role.name.toLowerCase(), role]));

      return [
        guild.id,
        {
          channels: {
            botLab: guild.channels.find(channel => {
              return channel.name === settings.channels["bot-lab"];
            }),
            modBotLab: guild.channels.find(channel => {
              return channel.name === settings.channels["mod-bot-lab"];
            }),
            unown: guild.channels.find(channel => {
              return channel.name === settings.channels.unown;
            }),
            exAnnounceChannel: guild.channels.find(channel => {
              return channel.name === settings.channels["ex-gym-raids"];
            }),
            pvp: guild.channels.find(channel => {
              return channel.name === settings.channels["pvp"];
            }),
          },
          categories: {
            pvp:  guild.channels.find(channel => {
              return channel.name === settings.categories["pvp"] && channel.type === 'category';
            })
          },
          help: null,
          roles,
          emojis: null
        }
      ]
    }));

    this.client.on('message', message => {
      if (message.type === 'PINS_ADD' && message.client.user.bot) {
        message.delete()
          .catch(err => log.error(err));
      }

      if (message.channel.type !== 'dm') {
        const unownChannel = this.guild.get(message.guild.id).channels.unown;

        if (unownChannel && message.channel.id === unownChannel.id && message.mentions.has(this.getRole(message.guild, 'unown'))) {
          message.pin()
            .catch(err => log.error(err));
        }
      }
    });

    this.client.on('guildCreate', guild => {
      // cache this guild's roles
      this.guild.set(guild, [
        guild.id,
        {
          channels: {
            botLab: guild.channels.find(channel => {
              return channel.name === settings.channels["bot-lab"];
            }),
            modBotLab: guild.channels.find(channel => {
              return channel.name === settings.channels["mod-bot-lab"];
            }),
            unown: guild.channels.find(channel => {
              return channel.name === settings.channels.unown;
            }),
            exAnnounceChannel: guild.channels.find(channel => {
              return channel.name === settings.channels["ex-gym-raids"];
            }),
            pvp: guild.channels.find(channel => {
              return channel.name === settings.channels["pvp"];
            }),
            help: null,
          },
          categories: {
            pvp:  guild.channels.find(channel => {
              return channel.name === settings.categories["pvp"];
            })
          },
          roles: new Map(guild.roles.map(role => [role.name.toLowerCase(), role])),
          emojis: null
        }
      ]);
    });

    this.client.on('guildDelete', guild => {
      // remove this guild from cache
      this.guild.delete(guild.id);
    });

    this.client.on('roleCreate', role => {
      // add new role to corresponding cache entry for its guild
      const guildMap = this.guild.get(role.guild.id).roles;

      if (!!guildMap) {
        guildMap.set(role.name.toLowerCase(), role);
      }
    });

    this.client.on('roleDelete', role => {
      // remove role from corresponding cache entry for its guild
      const guildMap = this.guild.get(role.guild.id).roles;

      if (!!guildMap) {
        guildMap.delete(role.name.toLowerCase());
      }
    });

    this.client.on('roleUpdate', (oldRole, newRole) => {
      // remove old role from corresponding cache entry for its guild and
      // add new role to corresponding cache entry for its guild

      // these *should* be the same guild but let's not assume that!
      const oldGuildMap = this.guild.get(oldRole.guild.id).roles,
        newGuildMap = this.guild.get(newRole.guild.id).roles;

      if (!!oldGuildMap) {
        oldGuildMap.delete(oldRole.name.toLowerCase());
      }

      if (!!newGuildMap) {
        newGuildMap.set(newRole.name.toLowerCase(), newRole);
      }
    });

    client.on('emojiCreate', emoji => {
      // add new emoji to emojis cache
      this.emojis.set(emoji.name.toLowerCase(), emoji);
    });

    client.on('emojiDelete', emoji => {
      // delete emoji from emojis cache
      this.emojis.delete(emoji.name.toLowerCase());
    });

    client.on('emojiUpdate', (oldEmoji, newEmoji) => {
      // delete old emoji from emojis cache and add new one to it
      this.emojis.delete(oldEmoji.name.toLowerCase());
      this.emojis.set(newEmoji.name.toLowerCase(), newEmoji);
    });
  }

  setNotifyClient(client) {
    this.notifyClient = client;
  }

  getMemberForNotification(guildId, memberId) {
    return this.notifyClient.guilds.get(guildId).members.get(memberId)
  }

  getExRaidAnnounceChannel(guild) {
    return this.guild.get(guild.id).channels.exAnnounceChannel;
  }

  getUnownChannel(guild) {
    return this.guild.get(guild.id).channels.unown;
  }

  isManagement(message) {
    let isModOrAdmin = false;

    if (message.channel.type !== 'dm') {
      const adminRole = this.getRole(message.guild, 'admin'),
        moderatorRole = this.getRole(message.guild, 'moderator'),

        adminRoleId = adminRole ?
          adminRole.id :
          -1,
        moderatorRoleId = moderatorRole ?
          moderatorRole.id :
          -1;

      isModOrAdmin = message.member.roles.has(adminRoleId) ||
        message.member.roles.has(moderatorRoleId);
    }
    return isModOrAdmin || this.client.isOwner(message.author);
  }

  isBotManagement(message) {
    let isModOrAdmin = this.isManagement(message);
    let isBotMod = false;
    if (message.channel.type !== 'dm') {
      const botModRole = this.getRole(message.guild, 'bot developer'),
        botRoleId = botModRole ?
          botModRole.id :
          -1;

      isBotMod = message.member.roles.has(botRoleId);
    }

    return isModOrAdmin || isBotMod || this.client.isOwner(message.author);
  }

  isBotChannel(message) {
    if (message.channel.type === 'dm') {
      return false;
    }
    const guild = this.guild.get(message.guild.id),
      botLabChannelId = guild.channels.botLab ?
        guild.channels.botLab.id :
        -1,
      modBotLabChannelId = guild.channels.modBotLab ?
        guild.channels.modBotLab.id :
        -1;

    return message.channel.id === botLabChannelId || message.channel.id === modBotLabChannelId;
  }

  isPvPCategory(message) {
    if (message.channel.type === 'dm') {
      return false;
    }
    const guild = this.guild.get(message.guild.id),
      PvPCategoryId = guild.categories.pvp ?
        guild.categories.pvp.id :
        -1;

    return message.channel.parentID === PvPCategoryId;
  }

  getBotChannel(channel) {
    const guild = this.guild.get(channel.guild.id);
    return guild.channels.botLab;
  }

  getPvPCategory(channel){
    const guild = this.guild.get(channel.guild.id);
    return guild.categories.pvp;
  }

  getRole(guild, roleName) {
    const guildMap = this.guild.get(guild.id);

    return guildMap.roles.get(roleName.toLowerCase());
  }

  getEmoji(emojiName) {
    return this.emojis.has(emojiName.toLowerCase()) ?
      this.emojis.get(emojiName.toLowerCase()) :
      '';
  }

  getTeam(member) {
    const roles = this.guild.get(member.guild.id).roles;

    if (roles.has('instinct') && member.roles.has(roles.get('instinct').id)) {
      return Team.INSTINCT;
    }

    if (roles.has('mystic') && member.roles.has(roles.get('mystic').id)) {
      return Team.MYSTIC;
    }

    if (roles.has('valor') && member.roles.has(roles.get('valor').id)) {
      return Team.VALOR;
    }

    return Team.NONE;
  }

  getText(path, message) {
    let text = this.text;
    for (let key of path.split('.')) {
      text = text[key];
    }

    // replace variables in text
    return this.replaceText(text, message);
  }

  replaceText(text, message) {
    // quick search for variables to replace
    if (text.search(/\${.*?}/g) >= 0) {
      // replace guild related variables (if any exist)
      const guildId = message && message.guild && message.guild.id ?
        message.guild.id :
        Array.from(this.client.guilds)
          .find(guild => guild[1].members.has(message.author.id))[0];

        let botChannelString = !!guildId ?
          this.guild.get(guildId).channels.botLab.toString() :
          `#${settings.channels["bot-lab"]}`;
        let pvpChannelString = !!guildId ?
          this.guild.get(guildId).channels.pvp.toString() :
          `#${settings.channels["pvp"]}`;

      text = text.replace(/\${bot-channel}/g, botChannelString);
      text = text.replace(/\${pvp-channel}/g, pvpChannelString);
    }

    return text;
  }

  //check if channel exists by name in a specific gulid
  doesChannelExist(channelName, guildId) {
    const channels = this.client.guilds.get(guildId).channels.array();
    for (let i = 0; i < channels.length; i++) {
      const chan = channels[i];
      if (chan.name === channelName && channels[i].permissionsFor(this.client.user.id).has('VIEW_CHANNEL')) {
        return true;
      }
    }

    return false;
  }

  //check if channel is child of a category
  isChannelChild(channelId) {
    const channel = this.client.channels.get(channelId);
    const channels = this.client.channels.array();
    for (let i = 0; i < channels.length; i++) {
      const check = channels[i];
      if (check.children) {
        const children = check.children.array();
        for (let j = 0; j < children.length; j++) {
          const child = children[j];
          if (child.id === channelId && channels[i].permissionsFor(this.client.user.id).has('VIEW_CHANNEL')) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // Gets channel based on provided name
  getChannelForName(channelName, guildId) {
    const channels = this.client.guilds.get(guildId).channels.array();
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      if (channel.name === channelName && channels[i].permissionsFor(this.client.user.id).has('VIEW_CHANNEL')) {
        return channel;
      }
    }

    return null;
  }

  // Get a channel's category
  getParentChannel(channelId) {
    if (this.isChannelChild(channelId)) {
      const channels = this.client.channels.array();
      for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        if (channel.children) {
          const children = this.childrenForCategory(channel.id);
          for (let j = 0; j < children.length; j++) {
            const child = children[j];
            if (child.id === channelId) {
              return channel;
            }
          }
        }
      }
    }

    return null;
  }

  // Get channels below a specified category
  childrenForCategory(categoryId) {
    const channel = this.client.channels.get(categoryId);
    if (channel.children) {
      return channel.children.array();
    } else {
      return [];
    }
  }

  //is channel child of category and does it have a defined region
  isChannelBounded(channelId, raidChannels) {
    if (this.isChannelChild(channelId)) {
      return raidChannels.indexOf(channelId) > -1;
    } else {
      return false;
    }
  }

  //Get the region defined channel from a specified category
  regionChannelForCategory(categoryId, raidChannels) {
    const children = this.childrenForCategory(categoryId);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      for (let j = 0; j < raidChannels.length; j++) {
        const regionChannel = raidChannels[j];
        if (child.id === regionChannel) {
          return child;
        }
      }
    }
  }
}

module.exports = new Helper();
