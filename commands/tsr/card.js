"use strict";

const log = require('loglevel').getLogger('SilphCardCommand'),
  Commando = require('discord.js-commando'),
  {MessageEmbed} = require('discord.js'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Pokemon = require('../../app/pokemon'),
  settings = require('../../data/settings'),
  moment = require('moment'),
  https = require('https');

class SilphCardCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'silph-card',
      group: CommandGroup.SILPH,
      memberName: 'silphcard',
      aliases: ['tsr-card'],
      description: 'View a Silph Road card for an individual user.',
      details: 'Use this command to view the Silph Road Card Traveler\'s Card for a specific user..',
      examples: ['\t!silph-card kingkovifor', '\t!silph-card melgood711'],
      args: [
        {
          key: 'username',
          label: 'username',
          prompt: 'What is the username of the card you wish to view?\nExample: `kingkovifor`\n',
          type: 'string'
        }
      ],
      argsPromptLimit: 0,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'silph-card' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(`Get a user's Silph Card in #${settings.channels["bot-lab"]}!`)];
      }
      return false;
    });
  }

  async run(message, args) {
    let username = args['username'],
      url = `sil.ph`,
      path = `/${username}.json`,
      colors = {
        instinct: '#FFFF00',
        mystic: '#0000FF',
        valor: '#FF0000'
      };

    var req = https.request({
      hostname: url,
      path: path,
      method: 'GET'
    }, res => {
      let responseString = '';

      res.on('data', function (data) {
        responseString += data;
        // save all the data from response
      });

      res.on('end', function () {
        let body = JSON.parse(responseString);
        let card = body.data;

        if (body.error) {
          message.reply(`${username} does not have a Traveler's Card.`);
        } else {
          const embed = new MessageEmbed();
          embed.setColor(colors[card.team.toLowerCase()]);
          embed.setTitle(`${card.title} ${card.in_game_username}`);
          embed.setURL(`https://sil.ph/${username}`);
          embed.setDescription(card.goal);

          const experience = Number(card.xp).toLocaleString();

          embed.addField('**Level**', `${card.trainer_level} (${experience})`, true);
          embed.addField('**Team**', card.team, true);
          embed.addField('**Pokédex Entries**', card.pokedex_count, true);
          embed.addField('**Nest Reports**', card.nest_migrations + ' Migrations', true);
          embed.addField('**Handshakes**', card.handshakes, true);
          embed.addField('**Raid Average**', card.raid_average + ' per week', true);
          embed.addField('**Active Around**', card.home_region, true);

          let topsix = [];
          for (let i = 0; i < card.top_6_pokemon.length; i++) {
            const mon = Pokemon.search([card.top_6_pokemon[i] + ''], true);

            if (!!mon && mon.length > 0) {
              topsix.push(mon[0].name.charAt(0).toLocaleUpperCase() + mon[0].name.substr(1));
            }
          }

          if (topsix.length) {
            embed.addField('**Top 6**', topsix.join(', '));
          }

          let badges = '';
          if (card.badges.length) {
            if (card.badges.length > 4) {
              let badgesNamed = [];
              for (let i = 0; i < 4; i++) {
                const badge = card.badges.pop();
                badgesNamed.push(badge.Badge.name);
              }

              badgesNamed.push('and ' + card.badges.length + ' others!');
              badges = badgesNamed.join(', ');
            } else {
              let badgesNamed = [];
              for (let i = 0; i < card.badges.length; i++) {
                const badge = card.badges.pop();
                badgesNamed.push(badge.Badge.name);
              }

              badges = badgesNamed.join(', ');
            }
          } else {
            badges = `${card.title} ${card.in_game_username} has no badges!`;
          }

          embed.addField('**Badges**', badges);

          let checkins = '';
          if (card.checkins.length) {
            if (card.checkins.length > 4) {
              let checkinNamed = [];
              for (let i = 0; i < 4; i++) {
                let checkin = card.checkins.pop();
                checkinNamed.push(checkin.name);
              }

              checkinNamed.push('and ' + card.checkins.length + ' others!');
              checkins = checkinNamed.join(', ');
            } else {
              let checkinNamed = [];
              for (let i = 0; i < card.checkins.length; i++) {
                let checkin = card.checkins.pop();
                checkinNamed.push(checkin.name);
              }

              checkinNamed.push('and ' + card.checkins.length + ' others!');
              checkins = checkinNamed.join(', ');
            }
          } else {
            checkins = `${card.title} ${card.in_game_username} has no check ins!`
          }
          embed.addField('**Check Ins**', checkins);

          let joined = moment(card.joined).format('MMMM Do YYYY')
          embed.setFooter(`This traveler's card was created ${joined} and last edited ${card.modified}.`)
          embed.setThumbnail(card.avatar);

          message.channel.send('', {embed});
        }
      });
    });

    req.end();
  }
}

module.exports = SilphCardCommand;
