"use strict";

const log = require('loglevel').getLogger('Role'),
  DB = require('../app/db'),
  Helper = require('../app/helper');

class Role {
  constructor() {
  }

  initialize() {
    Helper.client.on('guildMemberAdd', member => {
      this.autoAssignRole(member);
    });

    Helper.client.on('raidRegionChanged', (raid, channel, isInitial) => {
      // Go through party members and check their permissions on the raid's channel,
      // adding permission if necessary and informing via DM that they didn't and they
      // probably want to go to the bot lab to fix this...
      Object.entries(raid.attendees)
        .map(([attendee, attendeeStatus]) => attendee)
        .filter(memberId => !(channel.permissionsFor(memberId).has('VIEW_CHANNEL')))
        .forEach(memberWithoutAccess => {
          channel.updateOverwrite(memberWithoutAccess,
            {
              VIEW_CHANNEL: true
            })
            .then(channel => Helper.sendNotificationMessages([{
              userId: memberWithoutAccess,
              message: `${channel.toString()} has been ${isInitial ? 'created in' : 'moved to'} **${channel.parent.name}**, which you do not have access to!\n\n` +
                `You have been granted permission to view this channel but you may want to revisit your region roles and correct them in ${Helper.getBotChannel(channel)}.`
            }]))
            .catch(err => log.error(err))
        });
    });

    Helper.client.on('partyChannelReaction', (raid, channel, memberId) => {
      // Go through party members and check their permissions on the raid's channel,
      // adding permission if necessary and informing via DM that they didn't and they
      // probably want to go to the bot lab to fix this...
      if (!channel.permissionsFor(memberId).has('VIEW_CHANNEL')) {
        channel.updateOverwrite(memberId,
          {
            VIEW_CHANNEL: true
          })
          .catch(err => log.error(err));
      }
    });
  }

  // update or insert roles
  upsertRoles(guild, roles) {
    return DB.DB('Guild')
      .where('snowflake', guild.id)
      .pluck('id')
      .first()
      .then(guildDbId => new Promise((resolve, reject) => {
        const promises = [];

        // create role objects for each role given
        for (let i = 0; i < roles.length; i++) {
          const roleName = roles[i].name,
            roleDescription = roles[i].description || '',
            aliases = roles[i].aliases.map(val => val.toLowerCase()) || [],
            role = Helper.guild.get(guild.id).roles.get(roleName.toLowerCase());

          if (!roleName) {
            reject({error: `Please enter a role when using this command.`});
            return;
          }

          if (!role) {
            reject({error: `Role "**${roleName}**" was not found.`});
            return;
          }

          promises.push(this.roleExists(guild, roleName)
            .then(existingRoles => {
              return new Promise((resolve, reject) => {
                if (!existingRoles.length) {
                  promises.push(DB.DB.transaction(transaction => {
                    // insert new role
                    DB.DB('Role').transacting(transaction)
                      .returning('id')
                      .insert(Object.assign({}, {
                        roleName: roles[i].name,
                        roleDescription: roles[i].description,
                        guildId: guildDbId.id
                      }))
                      .then(roleId =>
                        DB.DB('Alias').transacting(transaction)
                          .insert(aliases.map(alias => Object.assign({}, {
                            aliasName: alias,
                            roleId: roleId
                          })))
                      )
                      .then(transaction.commit)
                      .catch(err => {
                        transaction.rollback();
                        reject(err);
                      });
                  }));
                } else {
                  promises.push(DB.DB.transaction(transaction => {
                    // update role since it already exists
                    let roleDbId;

                    DB.DB('Role').transacting(transaction)
                      .pluck('id')
                      .where('guildId', guildDbId.id)
                      .andWhere('roleName', roleName)
                      .first()
                      .then(roleId => {
                        roleDbId = roleId.id;

                        return DB.DB('Role').transacting(transaction)
                          .where('guildId', guildDbId.id)
                          .andWhere('Role.roleName', roleName)
                          .update(Object.assign({}, {
                            roleDescription: roleDescription
                          }));
                      })
                      .then(result => {
                        // Replace any existing aliases for this role with new ones
                        return DB.DB('Alias').transacting(transaction)
                          .where('roleId', roleDbId)
                          .del();
                      })
                      .then(result =>
                        DB.DB('Alias').transacting(transaction)
                          .insert(aliases.map(alias => Object.assign({}, {
                            aliasName: alias,
                            roleId: roleDbId
                          }))))
                      .then(transaction.commit)
                      .catch(err => {
                        transaction.rollback();
                        reject(err);
                      });
                  }));
                }

                resolve();
              });
            }));
        }

        // once all roles have been proven that they exist, attempt to add them to DB
        Promise.all(promises)
          .then(info => resolve())
          .catch(err => reject(err));
      }));
  }

  removeOldRoles(guild, roles) {
    // remove all matching role objects for each role given
    return new Promise((resolve, reject) => {
      DB.DB('Guild')
        .where('snowflake', guild.id)
        .pluck('id')
        .first()
        .then(guildId => {
          DB.DB('Role')
            .whereIn('roleName', roles)
            .andWhere('guildId', guildId.id)
            .del()
            .then(result => resolve(result))
            .catch(err => reject(err));
        });
    });
  }

  getRoles(guild) {
    return new Promise((resolve, reject) => {
      DB.DB('Role')
        .select(['Guild.id', 'Role.roleName', 'Role.roleDescription', 'Role.guildId', 'Alias.aliasName', 'Role.id as roleId', 'Guild.snowflake'])
        .leftJoin('Alias', {'Alias.roleId': 'Role.id'})
        .innerJoin('Guild', {'Role.guildId': 'Guild.id'})
        .where('Guild.snowflake', guild.id)
        .then(roles => resolve(roles))
        .catch(err => reject(err));
    });
  }

  // give role to user if it exists
  assignRole(member, role) {
    return this.adjustUserRole(member.guild, member, role);
  }

  // remove role from user if they have it
  removeRole(member, role) {
    return this.adjustUserRole(member.guild, member, role, true);
  }

  // add or remove roles from user
  adjustUserRole(guild, member, roleOrAlias, remove = false) {
    return new Promise(async (resolve, reject) => {
      let roles = await this.roleExists(member.guild, roleOrAlias);

      // first look for a matching name in DB, then check for aliases if a match was not found
      if (roles.length > 0) {
        const roleIds = roles
          .map(role => Helper.guild.get(guild.id).roles.get(role.roleName.toLowerCase()).id)
          .filter(roleId => {
            const exists = !!roleId;

            if (!exists) {
              log.warn(`Role '${roles[i].roleName}' may not longer be available in the guild.`);
            }

            return exists;
          });

        if (roleIds.length > 0) {
          if (remove) {
            member.roles.remove(roleIds)
              .catch(err => log.error(err));
          } else {
            member.roles.add(roleIds)
              .catch(err => log.error(err));
          }

          resolve();
        } else {
          reject({error: `Role "**${roleOrAlias}**" was not found.  Use \`${guild.client.commandPrefix}iam\` to see a list of self-assignable roles. If you are attempting to reduce notifications, please see  \`${guild.client.commandPrefix}help\` for use of the \`${guild.client.commandPrefix}unwant\` and \`${guild.client.commandPrefix}untarget\` commands.`});
        }
      } else {
        roles = await this.roleExists(guild, roleOrAlias, true);

        const roleIds = roles
          .map(role => Helper.guild.get(guild.id).roles.get(role.roleName.toLowerCase()).id)
          .filter(roleId => {
            const exists = !!roleId;

            if (!exists) {
              log.warn(`Role '${roles[i].roleName}' may not longer be available in the guild.`);
            }

            return exists;
          });

        if (roleIds.length > 0) {
          if (remove) {
            member.roles.remove(roleIds)
              .catch(err => log.error(err));
          } else {
            member.roles.add(roleIds)
              .catch(err => log.error(err));
          }

          resolve();
        } else {
          reject({error: `Role or alias "**${roleOrAlias}**" was not found.  Use \`!iam\` to see a list of self-assignable roles.`});
        }
      }
    });
  }

  roleExists(guild, role, isAlias = false) {
    role = role.toLowerCase();

    return new Promise((resolve, reject) => {
      let query;

      if (isAlias) {
        query = DB.DB('Alias')
          .select(['Alias.id', 'Role.roleName', 'Role.guildId'])
          .innerJoin('Role', {'Alias.roleId': 'Role.id'})
          .innerJoin('Guild', {'Guild.id': 'Role.guildId'})
          .where('aliasName', role)
          .andWhere('Guild.snowflake', guild.id);
      } else {
        query = DB.DB('Role')
          .select(['Role.id', 'Role.roleName', 'Role.guildId'])
          .innerJoin('Guild', {'Role.guildId': 'Guild.id'})
          .where('roleName', role)
          .andWhere('Guild.snowflake', guild.id);
      }

      query
        .then(results => resolve(results))
        .catch(err => reject(err));
    });
  }

  async setAutoAssignRole(guild, role) {
    role = role.toLowerCase();

    let roles = await this.roleExists(guild, role);

    if (roles.length > 0) {
      return DB.DB.transaction(transaction =>
        DB.DB('AutoAssignRole').transacting(transaction)
          .where('guildId', roles[0].guildId)
          .del()
          .then(result => DB.DB('AutoAssignRole').transacting(transaction)
            .returning('id')
            .insert(Object.assign({}, {
              guildId: roles[0].guildId,
              roleId: roles[0].id
            })))
          .then(transaction.commit)
          .catch(err => {
            transaction.rollback();
            log.error(err);
          }));
    } else {
      roles = await this.roleExists(guild, role, true);

      if (roles.length > 0) {
        return DB.DB.transaction(transaction =>
          DB.DB('AutoAssignRole').transacting(transaction)
            .where('guildId', roles[0].guildId)
            .del()
            .then(result => DB.DB('AutoAssignRole').transacting(transaction)
              .returning('id')
              .insert(Object.assign({}, {
                guildId: roles[0].guildId,
                aliasId: roles[0].id
              })))
            .then(transaction.commit)
            .catch(err => {
              transaction.rollback();
              log.error(err);
            }));
      }
    }

    return Promise.reject({error: 'No self-assignable role or alias found!'});
  }

  autoAssignRole(member) {
    DB.DB('Guild')
      .where('snowflake', member.guild.id)
      .pluck('id')
      .first()
      .then(guildDbId => DB.DB('AutoAssignRole')
        .where('guildId', guildDbId.id)
        .first())
      .then(autoAssignRoleOrAlias =>
        autoAssignRoleOrAlias ?
          DB.DB(autoAssignRoleOrAlias.roleId ?
            'Role' :
            'Alias')
            .where('id', autoAssignRoleOrAlias.roleId ?
              autoAssignRoleOrAlias.roleId :
              autoAssignRoleOrAlias.aliasId)
            .first() :
          undefined)
      .then(roleOrAlias => {
        if (roleOrAlias) {
          const roleOrAliasName = roleOrAlias.aliasName || roleOrAlias.roleName;

          this.adjustUserRole(member.guild, member, roleOrAliasName);
        }
      })
      .catch(err => log.error(err));
  }
}

module.exports = new Role();
