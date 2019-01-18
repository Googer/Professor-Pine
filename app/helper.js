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
            help: null,
          },
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
            help: null,
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

  getBotChannel(channel) {
    const guild = this.guild.get(channel.guild.id);
    return guild.channels.botLab;
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
    if (text.search(/\$\{.*?\}/g) >= 0) {
      // replace guild related variables (if any exist)
      if (message && message.guild && message.guild.id) {
        const guild = this.guild.get(message.guild.id);
        text = text.replace(/\$\{bot-channel\}/g, guild.channels.botLab.toString());
      }
    }

    return text;
  }
}

module.exports = new Helper();
