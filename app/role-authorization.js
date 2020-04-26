"use strict";

const log = require('loglevel').getLogger('RoleAuthorization'),
  DB = require('./db'),
  Helper = require('./helper');

class RoleAuthorization {
  constructor() {
  }

  async initialize(client) {
    client.dispatcher.addInhibitor(message => {
      if (!!message.command && !message.channel.type !== 'dm' && !Helper.isBotManagement(message) &&
        this.isRequired(message.channel.guild, message.command)) {
        // check actual role auth now
        const userRoles = message.member.roles.cache.array()
            .map(role => role.id),
          roles = this.getRoles(message.channel.guild, message.command);

        if (!userRoles.some(role => roles.includes(role))) {
          return {
            reason: 'unauthorized',
            response: message.reply('You are not authorized to use this command.')
          };
        }
      }

      return false;
    });

    // map from guild id to a map of command names that map to an object saying whether or not
    // role authorization is enabled plus an array of roles that enable it
    try {
      this.roleAuthorizations = await this.loadRoleAuthorizations();
    } catch (err) {
      log.error(err);
      this.roleAuthorizations = new Map();
    }
  }

  async loadRoleAuthorizations() {
    const output = new Map();

    const roleAuthorizationCommands = await DB.DB('CommandRoleAuthorization')
        .innerJoin('Guild', {'CommandRoleAuthorization.guildId': 'Guild.id'})
        .select(['Guild.snowflake', 'CommandRoleAuthorization.command', 'CommandRoleAuthorization.roleRequired']),
      requiredRoles = await DB.DB('CommandRoles')
        .innerJoin('Guild', {'CommandRoles.guildId': 'Guild.id'})
        .select(['Guild.snowflake', 'CommandRoles.command', 'CommandRoles.roleSnowflakeId']);

    roleAuthorizationCommands
      .forEach(({snowflake, command, roleRequired}) => {
        let guildMap = output.get(snowflake);
        if (!guildMap) {
          guildMap = new Map();
          output.set(snowflake, guildMap);
        }

        let commandProperties = guildMap.get(command);
        if (!commandProperties) {
          commandProperties = {roleRequired: false, roles: []};
          guildMap.set(command, commandProperties);
        }

        commandProperties.roleRequired = roleRequired;
      });

    requiredRoles
      .forEach(({snowflake, command, roleSnowflakeId}) => {
        let guildMap = output.get(snowflake);
        if (!guildMap) {
          guildMap = new Map();
          output.set(snowflake, guildMap);
        }

        let commandProperties = guildMap.get(command);
        if (!commandProperties) {
          commandProperties = {roleRequired: false, roles: []};
          guildMap.set(command, commandProperties);
        }

        commandProperties.roles.push(roleSnowflakeId);
      });

    return output;
  }

  getAllInformation(guild) {
    const guildMap = this.roleAuthorizations.get(guild.id);

    return !!guildMap ?
      guildMap :
      new Map();
  }

  getAuthorizationInformation(guild, command) {
    if (!guild) {
      return {roleRequired: false, roles: []};
    }

    const guildMap = this.roleAuthorizations.get(guild.id);

    if (guildMap) {
      const commandProperties = guildMap.get(command.name);

      if (commandProperties) {
        return commandProperties;
      }
    }

    return {roleRequired: false, roles: []};
  }

  isRequired(guild, command) {
    return !!this.getAuthorizationInformation(guild, command).roleRequired;
  }

  getRoles(guild, command) {
    return this.getAuthorizationInformation(guild, command).roles;
  }

  setRequired(guild, command, roleRequired) {
    let guildMap = this.roleAuthorizations.get(guild.id);
    if (!guildMap) {
      guildMap = new Map();
      this.roleAuthorizations.set(guild.id, guildMap);
    }

    let commandProperties = guildMap.get(command.name);
    if (!commandProperties) {
      commandProperties = {roleRequired: false, roles: []};
      guildMap.set(command.name, commandProperties);
    }

    commandProperties.roleRequired = roleRequired;

    return DB.DB('Guild')
      .where('snowflake', guild.id)
      .pluck('id')
      .first()
      .then(guild => DB.insertIfAbsent('CommandRoleAuthorization', Object.assign({},
        {
          command: command.name,
          guildId: guild.id
        }))
        .then(commandRoleId => DB.DB('CommandRoleAuthorization')
          .where('id', commandRoleId)
          .update({
            roleRequired
          })))
      .catch(err => log.error(err));
  }

  addRole(guild, command, role) {
    let guildMap = this.roleAuthorizations.get(guild.id);
    if (!guildMap) {
      guildMap = new Map();
      this.roleAuthorizations.set(guild.id, guildMap);
    }

    let commandProperties = guildMap.get(command.name);
    if (!commandProperties) {
      commandProperties = {roleRequired: false, roles: []};
      guildMap.set(command.name, commandProperties);
    }

    commandProperties.roles.push(role.id);

    return DB.DB('Guild')
      .where('snowflake', guild.id)
      .pluck('id')
      .first()
      .then(guild => DB.insertIfAbsent('CommandRoles', Object.assign({},
        {
          command: command.name,
          guildId: guild.id,
          roleSnowflakeId: role.id
        })));
  }

  removeRole(guild, command, role) {
    let guildMap = this.roleAuthorizations.get(guild.id);
    if (!guildMap) {
      guildMap = new Map();
      this.roleAuthorizations.set(guild.id, guildMap);
    }

    let commandProperties = guildMap.get(command.name);
    if (!commandProperties) {
      commandProperties = {roleRequired: false, roles: []};
      guildMap.set(command.name, commandProperties);
    }

    commandProperties.roles = commandProperties.roles
      .filter(r => r !== role.id);

    return DB.DB('Guild')
      .where('snowflake', guild.id)
      .pluck('id')
      .first()
      .then(guild => DB.DB('CommandRoles')
        .where('command', command.name)
        .andWhere('roleSnowflakeId', role.id)
        .andWhere('guildId', guild.id)
        .delete());
  }
}

module.exports = new RoleAuthorization();
