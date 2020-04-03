"use strict";

const log = require('loglevel').getLogger('SilphCardCommand'),
  Commando = require('discord.js-commando'),
  {MessageEmbed} = require('discord.js'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Pokemon = require('../../app/pokemon'),
  settings = require('../../data/settings'),
  moment = require('moment'),
  User = require('../../app/user'),
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
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'silph-card' && !Helper.isBotChannel(message)) {
        return {
          reason: 'invalid-channel',
          response: message.reply(`Get a user's Silph Card in #${settings.channels["bot-lab"]}!`)
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const username = args['username'],
      url = `sil.ph`,
      colors = {
        instinct: '#FFFF00',
        mystic: '#0000FF',
        valor: '#FF0000'
      },
      path = `/${username}`;

      let silphPath = null;

      if (username.indexOf('<@') !== -1) {
        const memberId = username.replace(/[^\d]/g, ''),
          silphName = await User.getSilphUsername(memberId);

        silphPath = `/${silphName}`;
      }

      let arenaCard;

      const req = https.request({
        hostname: url,
        path: silphPath || path,
        method: 'GET'
      }, res => {
        let responseString = '';

        // save all the data from response
        res.on('data', data => responseString += data);

        res.on('end', () => {
          const userCardData = responseString.match(/\/card\/userNetworkData\.json\?user_id=[\d]*/g);
          let userId = userCardData !== null ? userCardData[0].split('=').pop() : null;

          if (userId === null) {
            const msg = username.indexOf('<@') !== -1 ?
              'has not registered their Silph Card username.' :
              'does not have a Traveler\'s Card.';
            message.reply(`${username} ${msg}`)
              .catch(err => log.error(err));
          } else {
            const req2 = https.request({
              hostname: url,
              path: '/card/cardData.json?user_id=' + userId,
              method: 'GET'
            }, res => {
              let responseString2 = '';

              res.on('data', data => responseString2 += data);

              res.on('end', () => {
                const body = JSON.parse(responseString2);

                arenaCard = body.data;

                const req3 = https.request({
                  hostname: url,
                  path: silphPath ? (silphPath + '.json') : (path + '.json'),
                  method: 'GET'
                }, res3 => {
                  let responseString3 = '';

                  res3.on('data', data => responseString3 += data);

                  res3.on('end', () => {
                    const checkinBody = JSON.parse(responseString3),
                      card = checkinBody.data;

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

                    if (arenaCard.arenaTotalRankedMatchups !== '--') {
                      let rank = arenaCard.arenaGlobalRank.split('>').pop();
                      embed.addField('**Arena Tier**', arenaCard.arenaPlayerTier);
                      embed.addField('**Arena Global Rank**', `#${rank} (Top ${arenaCard.arenaGlobalRankPercentile})`, true);
                      embed.addField('**Arena Record**',
                        `${arenaCard.arenaUniqueWins} / ${arenaCard.arenaTotalRankedMatchups} (${arenaCard.arenaWL}%)`, true);

                    }

                    if (card.home_region) {
                      embed.addField('**Active Around**', card.home_region, true);
                    }
                    const topSix = [];
                    for (let i = 0; i < card.top_6_pokemon.length; i++) {
                      const mon = Pokemon.search([card.top_6_pokemon[i] + ''], true);

                      if (!!mon && mon.length > 0) {
                        topSix.push(mon[0].name.charAt(0).toLocaleUpperCase() + mon[0].name.substr(1));
                      }
                    }

                    if (topSix.length) {
                      embed.addField('**Top 6**', topSix.join(', '));
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
                        const checkinNamed = [];
                        for (let i = 0; i < 4; i++) {
                          const checkin = card.checkins.pop();
                          checkinNamed.push(checkin.name);
                        }

                        checkinNamed.push('and ' + card.checkins.length + ' others!');
                        checkins = checkinNamed.join(', ');
                      } else {
                        const checkinNamed = [];
                        for (let i = 0; i < card.checkins.length; i++) {
                          const checkin = card.checkins.pop();
                          checkinNamed.push(checkin.name);
                        }

                        checkinNamed.push('and ' + card.checkins.length + ' others!');
                        checkins = checkinNamed.join(', ');
                      }
                    } else {
                      checkins = `${card.title} ${card.in_game_username} has no check ins!`
                    }
                    embed.addField('**Check Ins**', checkins);

                    const joined = moment(card.joined).format('MMMM Do YYYY');
                    embed.setFooter(`This traveler's card was created ${joined} and last edited ${card.modified}.`);
                    embed.setThumbnail(card.avatar);

                    message.channel.send(embed)
                      .catch(err => log.error(err));
                  })
                });

                req3.on('error', err => log.error(err));

                req3.end();
              });
            });

            req2.on('error', err => log.error(err));

            req2.end();
          };
        });
      });

    req.on('error', err => log.error(err));

    req.end();
  }
}

module.exports = SilphCardCommand;
