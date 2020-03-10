"use strict";

const log = require('loglevel').getLogger('DeleteCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  Utility = require('../../app/utility');

class DeleteCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'delete',
      group: CommandGroup.RAID_CRUD,
      memberName: 'delete',
      aliases: ['nuke', 'erase'],
      description: 'Deletes an existing party (usable only by admins and moderators).\n',
      details: 'Use this command to delete a party (usable only by admins and moderators).',
      examples: ['\t!delete', '\t!nuke'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'delete' &&
        !PartyManager.validParty(message.channel.id)) {
        return {
          reason: 'invalid-channel',
          response: message.reply('Delete a party from its raid channel!')
        };
      }
      return false;
    });

    this.deletionReasonCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'reason',
        label: 'reason',
        prompt: 'Only moderators or administrators can actually delete a raid.\n\n' +

          'If this raid only needs correction such as correcting an incorrect raid boss or location, cancel this command ' +
          '(or wait for it to timeout) and make the change(s) using the appropriate command(s).  Lack of interest in a raid ' +
          'is *not* a valid reason for deleting one!\n\n' +

          'If you are sure you wish for this raid to be deleted, enter a reason and a moderator will be called upon.\n',
        type: 'string'
      }
    ]);
  }

  async run(message, args) {
    const hasPermission = Helper.isManagement(message),
      party = PartyManager.getParty(message.channel.id);

    if (hasPermission) {
      message.channel.send(`Deleting this ${party.type} in 15 seconds!`)
        .then(message => Utility.sleep(15000))
        .then(resolve => PartyManager.deleteParty(message.channel.id))
        .catch(err => log.error(err));
    } else {
      this.deletionReasonCollector.obtain(message)
        .then(collectionResult => {
          if (!collectionResult.cancelled) {
            const reason = collectionResult.values['reason'].trim();

            if (reason.length > 0) {
              const adminRole = Helper.getRole(message.guild, 'admin'),
                moderatorRole = Helper.getRole(message.guild, 'moderator');

              return message.channel.send(`${adminRole} / ${moderatorRole}:  Raid deletion requested!`);
            }
          } else {
            Utility.cleanCollector(collectionResult);
          }
        })
        .catch(err => log.error(err));
    }
  }
}

module.exports = DeleteCommand;
