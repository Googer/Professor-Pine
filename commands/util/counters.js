const log = require('loglevel').getLogger('Counters'),
  Commando = require('discord.js-commando'),
  {MessageEmbed} = require('discord.js'),
  {CommandGroup} = require('../../app/constants'),
  fetch = require('node-fetch'),
  db = require('../../app/db'),
  Party = require('../../app/party-manager'),
  Utility = require('../../app/utility'),
  CountersData = require('../../data/counters');

class CountersCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'counters',
      group: CommandGroup.UTIL,
      memberName: 'counters',
      aliases: ['counter', 'battle', 'battles', 'pokebattler'],
      description: 'Queries Pokebattler API.',
      details: 'Use this command in a raid channel to obtain counters information for the current or potential raid bosses for that channel.  Can simulate hypothetical raids in non-raid channels.',
      examples: ['!counters\n> Raid boss?\nlugia\n> Raid tier?\n5\n> Attacker level?\n25\n> Weather?\nrainy\n> Friendship?\nbest'],
      guarded: false,
      argsPromptLimit: 3,
    });

    this.bossCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'boss',
        prompt: 'what raid boss would you like to battle against?\n',
        type: 'counterpokemontype'
      }
    ], 3);

    this.tierCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'tier',
        prompt: 'what raid tier would you like to battle at?\n',
        type: 'countertiertype'
      }
    ], 3);

    // Can scrape off weather in the future as well
    this.weatherCollector = new Commando.ArgumentCollector(client, [{
      key: 'weather',
      prompt: 'what is the current weather for your raid?\n',
      type: 'counterweathertype'
    }], 3);

    this.friendshipCollector = new Commando.ArgumentCollector(client, [{
      key: 'friendship',
      prompt: 'what is the maximum friendship level you with have with another trainer for this raid?\n',
      type: 'counterfriendshiptype'
    }], 3);

    this.protect = false;
  }

  async setRaidBoss(message, raid) {
    let boss;
    let bossCollector = new Commando.ArgumentCollector(message.client, [
      {
        key: 'raidBoss',
        prompt: 'What pokémon (or tier if unhatched) is this raid?\nExample: `lugia`\n',
        type: 'pokemon'
      }
    ], 3);

    await bossCollector.obtain(message)
      .then(collectionResult => {
        if (!collectionResult.cancelled) {
          boss = collectionResult.values.raidBoss;
        } else {
          Utility.cleanCollector(collectionResult);
        }
      })
      .catch(err => log.error(err));
    if (!boss) {
      return
    }

    await raid.setPokemon(boss);
    await raid.refreshStatusMessages(raid);
  }

  async parseSetEgg(message, raid) {
    // let tier = raid.pokemon.tier;
    // let validBosses = PokemonData.pokemon_data.filter(function(pokemon) {
    //     return pokemon.tier === tier && pokemon.active && !!pokemon.name  // filter to active tier raids and have to ignore the nickname entry
    // })
    // let bossNames = validBosses.map(x => x.name.titleCase());
    // let bossList = bossNames.join('\n');

    // tier = raid.pokemon.tier.toString();
    // let tierIdx = CountersData.tier.findIndex(x => x.aliases.includes(tier));
    // tier = CountersData.tier[tierIdx]

    // let eggBossCollector = new Commando.ArgumentCollector(message.client, [
    //     {
    //         key: 'boss',
    //         prompt: `what current raid boss would you like to battle against?\n\n${bossList}\n`,  // update prompt with list of tier-specific options
    //         type: 'counterpokemontype'
    //     }
    // ], 3);

    // So Pine has no concept of active raid bosses.  It keeps historical record of any boss that has ever been active at that tier.
    // Would require an update to read from pine.pokemon and an active col in that table, but leaving this functionality here.

    let eggBossCollector = new Commando.ArgumentCollector(message.client, [
      {
        key: 'boss',
        prompt: `what raid boss would you like to battle against?`,
        type: 'counterpokemontype'
      }
    ], 3);

    let boss;

    let tier = raid.pokemon.tier;
    tier = raid.pokemon.tier.toString();
    let tierIdx = CountersData.tier.findIndex(x => x.aliases.includes(tier));
    tier = CountersData.tier[tierIdx];

    await eggBossCollector.obtain(message)
      .then(collectionResult => {
        if (!collectionResult.cancelled) {
          boss = collectionResult.values.boss;
        } else {
          Utility.cleanCollector(collectionResult);
        }
      })
      .catch(err => log.error(err));
    if (!boss) {
      return;
    }

    return {boss: boss, tier: tier};
  }

  parseSetBoss(raid) {
    let boss = raid.pokemon.name;
    boss = boss.replace(/[^\w\s]/gi, ' ')
      .replace(/\s{2,}/gi, ' ')
      .toUpperCase();
    let bossIdx = CountersData.pokemon.findIndex(x => x.aliases.includes(boss));
    boss = CountersData.pokemon[bossIdx];

    let tier = raid.pokemon.tier.toString();
    let tierIdx = CountersData.tier.findIndex(x => x.aliases.includes(tier));
    tier = CountersData.tier[tierIdx];

    return {boss: boss, tier: tier};
  }

  async collectNonRaid(message) {
    let boss,
      tier;

    await this.bossCollector.obtain(message)
      .then(collectionResult => {
        if (!collectionResult.cancelled) {
          boss = collectionResult.values.boss;
        } else {
          Utility.cleanCollector(collectionResult);
        }
      })
      .catch(err => log.error(err));
    if (!boss) {
      return;
    }

    await this.tierCollector.obtain(message)
      .then(collectionResult => {
        if (!collectionResult.cancelled) {
          tier = collectionResult.values.tier;
        } else {
          Utility.cleanCollector(collectionResult);
        }
      })
      .catch(err => log.error(err));
    if (!tier) {
      return
    }

    return {boss: boss, tier: tier};
  }

  async run(message, args) {
    let pokebattlerId,
      boss,
      tier,
      level,
      newId,
      weather,
      friendship;

    String.prototype.titleCase = function () {
      return this.replace(/\w\S*/g, function (str) {
        return str.charAt(0).toUpperCase() + str.substr(1).toLowerCase();
      });
    };

    pokebattlerId = await db.DB('User')
      .where('userSnowflake', message.author.id)
      .pluck('pokebattlerId')
      .first()
      .then(res => {
        if (!!res) {
          return res.pokebattlerId;
        } else {
          return false;
        }
      });

    // Only prompt for boss and tier if not in a raid channel
    let raid = Party.getParty(message.channel.id);

    if (!!raid) {
      if (raid.type.toLowerCase() === 'raid') {
        if (raid.isExclusive) {
          // EX raid channels
          let exBoss = this.parseSetBoss(raid);
          boss = exBoss.boss;
          tier = exBoss.tier;
        } else if (!!raid.pokemon.name) {
          // Boss set
          if (raid.pokemon.name === 'pokemon') {
            // OCR unable to read boss/tier
            await this.setRaidBoss(message, raid);

            if (raid.pokemon.name === 'pokemon') {
              // Boss still is not determined, cancel the command
              await message.delete()
                .catch(err => log.error(err));
              return;
            }

            if (!!raid.pokemon.name) {
              // Boss successfully set from unread OCR
              let setBoss = this.parseSetBoss(raid);
              boss = setBoss.boss;
              tier = setBoss.tier;
            } else {
              // Egg - prompt for boss when egg is unset in raid channel
              let setEgg = await this.parseSetEgg(message, raid);
              boss = setEgg.boss;
              tier = setEgg.tier;
              if (!boss) {
                await message.delete()
                  .catch(err => log.error(err));
                return;
              }
            }
          } else {
            // Boss successfully set from raid channel
            let setBoss = this.parseSetBoss(raid);
            boss = setBoss.boss;
            tier = setBoss.tier;
          }
        } else {
          // Egg - prompt for boss when egg is unset in raid channel
          let setEgg = await this.parseSetEgg(message, raid);
          if (!!setEgg) {
            boss = setEgg.boss;
            tier = setEgg.tier;
          } else {
            await message.delete()
              .catch(err => log.error(err));
            return;
          }
        }
      } else {
        // Non-raid channels, but have Parties - so RaidTrain
        let bossAndTier = await this.collectNonRaid(message);
        if (!!bossAndTier) {
          boss = bossAndTier.boss;
          tier = bossAndTier.tier;
        } else {
          await message.delete()
            .catch(err => log.error(err));
          return;
        }
      }
    } else {
      // Non-raid channels
      let bossAndTier = await this.collectNonRaid(message);
      if (!!bossAndTier) {
        boss = bossAndTier.boss;
        tier = bossAndTier.tier;
      } else {
        await message.delete()
          .catch(err => log.error(err));
        return;
      }
    }

    // Prompt the other 3 parameters

    // Determine proper level messaging
    let pokebattlerMessage;
    if (!!pokebattlerId) {
      pokebattlerMessage = `\n\nIf you wish to use your saved Pokébox (#${pokebattlerId}), respond 'Yes', or enter a different Pokebattler ID.\n`;
    } else {
      pokebattlerMessage = `\n\nAlternatively you may provide your Pokebattler ID, which is located on the upper right once you log in.\n`;
    }

    let levelCollector = new Commando.ArgumentCollector(message.client, [
      {
        key: 'level',
        prompt: `what level are your Pokémon you will be raiding with (20, 25, 30, 35, or 40)?${pokebattlerMessage}`,
        type: 'counterleveltype'
      }
    ], 3);

    await levelCollector.obtain(message)
      .then(collectionResult => {
        if (!collectionResult.cancelled) {
          level = collectionResult.values.level;
        } else {
          Utility.cleanCollector(collectionResult);
        }
      })
      .catch(err => log.error(err));
    if (!level) {
      await message.delete()
        .catch(err => log.error(err));
      return;
    }

    // Optionally prompt to save Pokebattler ID if it is new
    if (level.type === 'userId' && level.pbName !== pokebattlerId) {
      let newIdCollector = new Commando.ArgumentCollector(message.client, [
        {
          key: 'newId',
          prompt: `would you like to save your new Pokebattler ID (#${level.pbName}) for future use?\n`,
          type: 'boolean'
        }
      ], 3);

      await newIdCollector.obtain(message)
        .then(collectionResult => {
          if (!collectionResult.cancelled) {
            newId = collectionResult.values.newId;
          } else {
            Utility.cleanCollector(collectionResult);
          }
        })
        .catch(err => log.error(err));
      if (typeof (newId) === 'undefined') {
        // need to use typeof for this check instead of !!newId because newId is already boolean
        await message.delete()
          .catch(err => log.error(err));
        return;
      }
    } else {
      newId = false;
    }

    // Determine if by attacker level or Pokebattler ID, set URL
    let levelURL;
    if (level.type === 'byLevel') {
      levelURL = `levels/${level.pbName}`;
    } else {
      levelURL = `users/${level.pbName}`;
    }

    // this could eventually be part of the raid object
    await this.weatherCollector.obtain(message)
      .then(collectionResult => {
        if (!collectionResult.cancelled) {
          weather = collectionResult.values.weather;
        } else {
          Utility.cleanCollector(collectionResult);
        }
      })
      .catch(err => log.error(err));
    if (!weather) {
      await message.delete()
        .catch(err => log.error(err));
      return;
    }

    await this.friendshipCollector.obtain(message)
      .then(collectionResult => {
        if (!collectionResult.cancelled) {
          friendship = collectionResult.values.friendship;
        } else {
          Utility.cleanCollector(collectionResult);
        }
      })
      .catch(err => log.error(err));
    if (!friendship) {
      await message.delete()
        .catch(err => log.error(err));
      return;
    }

    let pokebattlerUrl =
      `https://fight.pokebattler.com/raids/defenders/${boss.pbName}` +
      `/levels/RAID_LEVEL_${tier.pbName}` +
      `/attackers/${levelURL}` +
      `/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC` +
      `?sort=ESTIMATOR` +
      `&weatherCondition=${weather.pbName}` +
      `&dodgeStrategy=DODGE_REACTION_TIME` +
      `&aggregation=AVERAGE` +
      `&randomAssistants=-1` +
      `&friendLevel=FRIENDSHIP_LEVEL_${friendship.pbName}`;

    let json = await fetch(pokebattlerUrl)
      .then(res => {
        if (!res.ok) {
          message.channel.send(`${message.author}, an error occurred talking to Pokebattler.  Please try again later.`);
          throw Error(res.statusText);
        } else {
          return res.json();
        }
      });
    if (!json) {
      await message.delete()
        .catch(err => log.error(err));
      return;
    }

    if (!json.attackers) {
      // Bad Pokebattler ID
      await message.channel.send(`${message.author}, you provided an invalid Pokebattler ID. It is the number listed on the upper right corner when you log in.  Please try again.`);
      return;
    }

    let bossMoveIdx,
      allMovesets = json.attackers[0].byMove,
      bossMovesetSelector = [],
      selectedMovesetIdx;

    if (!!raid) {
      if (!!raid.quickMove) {
        allMovesets = allMovesets.filter(moveset => moveset.move1 === raid.quickMove);
      }
      if (!!raid.cinematicMove) {
        allMovesets = allMovesets.filter(moveset => moveset.move2 === raid.cinematicMove);
      }
    }

    if (allMovesets.length > 1) {
      for (bossMoveIdx = 0; bossMoveIdx < allMovesets.length; bossMoveIdx++) {
        bossMovesetSelector.push(`**${bossMoveIdx + 1}**. ` +
          `${allMovesets[bossMoveIdx].move1.replace('_FAST', '').replace(/_/g, ' ').titleCase()}` +
          `/` +
          `${allMovesets[bossMoveIdx].move2.replace(/_/g, ' ').titleCase()}`)
      }
      bossMovesetSelector.push(`**${bossMoveIdx + 1}**. Random Moveset`);

      let movesetCollector = new Commando.ArgumentCollector(message.client, [
        {
          key: 'moveset',
          prompt: `please select a moveset by entering a number. If you do not respond, it will default to 'Random Moveset'.\n\n${bossMovesetSelector.join('\n')}\n`,
          type: 'integer'
        }
      ], 3);

      await movesetCollector.obtain(message)
        .then(collectionResult => {
          if (!collectionResult.cancelled) {
            selectedMovesetIdx = parseInt(collectionResult.values.moveset) - 1;
          } else {
            selectedMovesetIdx = allMovesets.length - 1;
          }
        })
        .catch(err => log.error(err));
    } else {
      selectedMovesetIdx = 0;
    }

    let moveset,
      movesetName;
    if (selectedMovesetIdx >= 0 && selectedMovesetIdx < allMovesets.length) {
      moveset = allMovesets[selectedMovesetIdx].defenders;
      movesetName = `${allMovesets[selectedMovesetIdx].move1.replace('_FAST', '').replace(/_/g, ' ').titleCase()}` +
        `/` +
        `${allMovesets[selectedMovesetIdx].move2.replace(/_/g, ' ').titleCase()}`;
    } else {
      moveset = json.attackers[0].randomMove.defenders;
      movesetName = 'Random Moveset';
    }

    let counters = [],
      pokeIdx,
      pokemon,
      pokemonName,
      moveIdx,
      move;
    for (pokeIdx = 0; pokeIdx < moveset.length; pokeIdx++) {
      pokemon = moveset[pokeIdx];
      for (moveIdx = 0; moveIdx < pokemon.byMove.length; moveIdx++) {
        move = pokemon.byMove[moveIdx];
        if (level.type === 'byLevel') {
          pokemonName = pokemon.pokemonId.replace(/_/g, ' ').titleCase();
        } else {
          let nickname = !!pokemon.name ? pokemon.name : `CP ${pokemon.cp}`;
          pokemonName = `${pokemon.pokemonId.replace(/_/g, ' ').titleCase()} (${nickname})`;
        }
        counters.push({
          pokemon: pokemonName,
          fastMove: move.move1.replace('_FAST', '').replace(/_/g, ' ').titleCase(),
          chargeMove: move.move2.replace(/_/g, ' ').titleCase(),
          ttw: Math.round(move.result.effectiveCombatTime / 1000),
          deaths: !!move.result.effectiveDeaths ? move.result.effectiveDeaths.toFixed(1) : 0,
          trainers: Math.ceil(move.result.estimator * 10) / 10,
          legacyFlag: !!move.legacyDate ? '*' : ''
        });
      }
    }

    // sort by TTW, deaths desc
    counters.sort(function (a, b) {
      if (a.ttw < b.ttw) return -1;
      if (a.ttw > b.ttw) return 1;
      if (a.deaths < b.deaths) return -1;
      if (a.deaths > b.deaths) return 1;
      return 0;
    });

    let content = [];
    for (let i = 0; i < counters.length; i++) {
      if (i <= 11) {
        content.push(`**#${(i + 1).toString()}: ${counters[i].pokemon}**: ${counters[i].fastMove}/${counters[i].chargeMove}${counters[i].legacyFlag} - ` +
          `${counters[i].ttw.toString()}s | ${counters[i].deaths.toString()} | ${counters[i].trainers.toString()}`);
      }
      if (i === 5) {
        content.push('');  // separate the top six from the rest
      }
      if (i === counters.length - 1) {
        content.push(`\n\* - *indicates legacy move*`);
      }
    }

    let requestInfo = `**Raid Boss**: ${boss.pbName.replace(/_/g, ' ').titleCase()}\n` +
      `**Raid Tier**: ${tier.name}\n` +
      `**Attackers**: ${level.name}\n` +
      `**Weather Condition**: ${weather.name}\n` +
      `**Friendship Level**: ${friendship.name}\n` +
      `**Moveset**: ${movesetName}`;

    const embed = new MessageEmbed()
      .setColor('#43B581')
      .addField('__Name: Fast Move/Charge Move - TTW | Deaths | # Trainers__', content)
      .addField('__Request Info__', requestInfo)
      .setThumbnail(boss.imageURL)
      .setFooter('Data retrieved from https://www.pokebattler.com.');

    if (level.type === 'byLevel') {
      let levelResponse = await message.channel.send(`${message.author}, here are your \`!counters \` results:`, embed);
      levelResponse.preserve = true;
    } else {
      // DM results if personal Pokebox
      let channelResponse = await message.channel.send(`${message.author}, I sent you a DM with your results.`);
      channelResponse.preserve = true;
      let dmResponse = await message.author.send(embed);
      dmResponse.preserve = true;
    }
    await message.delete();

    // update Pokebattler ID if needed
    if (newId) {
      // check if that user record exists
      let user = await db.DB('User')
        .where('userSnowflake', message.author.id)
        .pluck('id')
        .first()
        .then(res => {
          if (!!res) {
            return res.id;
          } else {
            return false;
          }
        });
      if (!!user) {
        // update
        await db.DB('User')
          .where('userSnowflake', message.author.id)
          .update('pokebattlerId', level.pbName);
      } else {
        // insert
        await db.DB('User')
          .insert({
            userSnowflake: message.author.id,
            pokebattlerId: level.pbName
          });
      }
    }
  }
}

module.exports = CountersCommand;
