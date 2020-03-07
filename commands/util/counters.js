const log = require('loglevel').getLogger('CountersCommand'),
  Commando = require('discord.js-commando'),
  {MessageEmbed} = require('discord.js'),
  {CommandGroup} = require('../../app/constants'),
  fetch = require('node-fetch'),
  db = require('../../app/db'),
  Party = require('../../app/party'),
  Utility = require('../../app/utility');

class CountersCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'counters',
      group: CommandGroup.UTIL,
      memberName: 'counters',
      aliases: ['counter', 'fight', 'pokebattler', 'battle', 'battles'],
      description: 'Retrieves data from Pokebattler for the best counters for a raid boss.',
      details: 'This command requires user-provided data to query Pokebattler.\n\n' +
        'The command will read what it can from a raid channel (tier and/or boss). ' +
        'You may provide data in the initial command, comma-separating each piece:\n\n' +
        '`boss` - the name of the raid boss\n' +
        '`tier` - the raid tier (number of skulls)\n' +
        '`attacker` -\n' +
        `• Pokémon level (enter 20, 25, 30, 35, or 40)\n` +
        `• Your saved Pokebattler ID (enter 'yes')\n` +
        `• Pokebattler ID, located in the upper right after logging in (enter the digits)\n` +
        '`weather` - the current weather in-game\n' +
        '`friendship` - your highest friend level with another trainer in the raid\n' +
        '`grouped` - *optional* type "grouped" to only show the top moveset for each unique Pokémon\n\n' +
        'Otherwise, the command will prompt you for any missing data not provided in the initial command.',
      examples: ['!counters Mewtwo, Tier 5, Level 30, No Weather, Best Friends'],
      guarded: false,
      argsPromptLimit: 3,
    });

    this.protect = false;
  }

  titleCase(str) {
    return str.toLowerCase().split(' ').map(function (word) {
      return word.replace(word[0], word[0].toUpperCase());
    }).join(' ');
  }

  async fetchPokebattlerId(message) {
    return db.DB('User')
      .where('userSnowflake', message.author.id)
      .first()
      .catch(err => log.error(err));
  }

  async parseCounterType(val, message, arg, type) {
    let isValid = await message.client.registry.types.get(type).validate(val, message, arg);
    if (isValid === true) {
      return await message.client.registry.types.get(type).parse(val, message, arg);
    } else {
      return false;
    }
  }

  parseGrouped(val) {
    return val.toLowerCase() === 'grouped';
  }

  async collectParameter(message, prompt, type, tries = 3) {
    let collector = new Commando.ArgumentCollector(message.client, [
      {
        key: 'parameter',
        prompt: prompt,
        type: type
      }
    ], tries);
    let parameter;
    await collector.obtain(message)
      .then(collectionResult => {
        if (!collectionResult.cancelled) {
          parameter = collectionResult.values.parameter;
        } else {
          Utility.cleanCollector(collectionResult);
        }
      })
      .catch(err => log.error(err));
    return parameter;
  }

  async queryApi({raidBossName, tierName, attackerType, attackerName, weatherName, friendshipName}) {
    let pokebattlerUrl =
      `https://fight.pokebattler.com/raids/defenders/${raidBossName}` +
      `/levels/RAID_LEVEL_${tierName}` +
      `/attackers/${attackerType.toLowerCase()}/${attackerName}` +
      `/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC` +
      `?sort=TIME` +
      `&weatherCondition=${weatherName}` +
      `&dodgeStrategy=DODGE_REACTION_TIME` +
      `&aggregation=AVERAGE` +
      `&randomAssistants=-1` +
      `&friendLevel=FRIENDSHIP_LEVEL_${friendshipName}`;

    let data = await fetch(pokebattlerUrl)
      .then(res => {
        if (!res.ok) {
          return {error: res.statusText};
        } else {
          return res.json();
        }
      });

    if (!!data.error) {
      log.error(`${data.error}: ${pokebattlerUrl}`);
    } else {
      log.info(pokebattlerUrl);
    }

    return {
      counters: data,
      url: pokebattlerUrl.replace('https://fight.pokebattler.com/', 'https://www.pokebattler.com/')
    };
  }

  async selectMoveset(message, counters) {
    let moveSelector = ['`0` Unknown Moveset (results based on averaged data of all movesets)'],
      moveArr = [{move1: '', move2: ''}],
      moveSelectorIdx = 0;
    for (let moveset of counters.attackers[0].byMove) {
      moveSelectorIdx += 1;
      moveSelector.push(
        `\`${moveSelectorIdx}\` ` +
        `${this.titleCase(moveset.move1.replace('_FAST', '').replace(/_/g, ' '))}/` +
        `${this.titleCase(moveset.move2.replace(/_/g, ' '))}`
      );
      moveArr.push({move1: moveset.move1, move2: moveset.move2});
    }

    let movesetUnknownCollector = new Commando.ArgumentCollector(message.client, [{
      key: 'movesetIdx',
      prompt: `please select the **number** of the moveset you wish to battle against.\n\n${moveSelector.join('\n')}\n`,
      type: 'integer',
      min: 0,
      max: moveSelectorIdx
    }], 3);
    let movesetIdx = 0;
    await movesetUnknownCollector.obtain(message)
      .then(collectionResult => {
        if (!collectionResult.cancelled) {
          movesetIdx = collectionResult.values.movesetIdx;
        } else {
          Utility.cleanCollector(collectionResult);
        }
      })
      .catch(err => log.error(err));

    if (movesetIdx === 0) return {move: counters.attackers[0].randomMove, randomMove: true, moveset: moveArr[0]};
    return {move: counters.attackers[0].byMove[movesetIdx - 1], randomMove: false, moveset: moveArr[movesetIdx]};
  }

  sortResults({data, sortBy, limit = 12, grouped = true, randomMove = true}) {
    let attackers = data.defenders;

    // Transform
    let attackerArr = [];
    for (let attacker of attackers) {
      for (let attackerMove of attacker.byMove) {
        attackerArr.push({
          pokemonName: this.titleCase(attacker.pokemonId.replace(/_/g, ' ')),
          pokemonNickname: attacker.name,
          pokemonCp: attacker.cp,
          isUser: !!attacker.userId,
          fastMove: this.titleCase(attackerMove.move1.replace('_FAST', '').replace(/_/g, ' ')),
          chargeMove: this.titleCase(attackerMove.move2.replace('_FAST', '').replace(/_/g, ' ')),
          thirdMove: !!attackerMove.move3 ? this.titleCase(attackerMove.move3.replace('_FAST', '').replace(/_/g, ' ')) : attackerMove.move3,
          ttw: attackerMove.result.effectiveCombatTime / 1000,
          tdo: attackerMove.result.tdo,
          deaths: !!attackerMove.result.effectiveDeaths ? attackerMove.result.effectiveDeaths : 0,
          trainers: attackerMove.result.estimator,
          legacyDate: attackerMove.legacyDate
        });
      }
    }

    // Sort
    if (['ttw', 'deaths'].includes(sortBy.toLowerCase())) {
      attackerArr.sort(function (a, b) {
        if (a[sortBy] < b[sortBy]) return -1;
        if (a[sortBy] > b[sortBy]) return 1;
        return 0;
      })
    } else if (sortBy.toLowerCase() === 'tdo') {
      attackerArr.sort(function (a, b) {
        if (a[sortBy] < b[sortBy]) return 1;
        if (a[sortBy] > b[sortBy]) return -1;
        return 0;
      })
    }

    // Grouping
    let returnArr;
    if (grouped) {
      let uniquePokemon = [...new Set(attackerArr.map(x => x.pokemonName))];
      let uniqueArr = [];
      uniquePokemon.forEach(pokemon => {
        uniqueArr.push(attackerArr.find(x => x.pokemonName === pokemon));
      });
      returnArr = uniqueArr.slice(0, limit <= uniqueArr.length ? limit : uniqueArr.length);
    } else {
      returnArr = attackerArr.slice(0, limit <= attackerArr.length ? limit : attackerArr.length);
    }

    return {data: returnArr, randomMove: randomMove};
  }

  buildCountersContent(sortedData, moveset) {
    let pokemonDisplayName,
      pokemonEmbedName,
      legacyFlag = false,
      fastMoveDisplayName,
      chargeMoveDisplayName,
      thirdMoveDisplayName,
      moveEmbedName,
      contentArr = [`__Metrics__: Time to Win | # Deaths | # Trainers\n`];

    for (let [idx, pokemon] of sortedData.data.entries()) {
      pokemonDisplayName = pokemon.pokemonName;
      pokemonEmbedName = !!pokemon.isUser
        ? (!!pokemon.pokemonNickname ? pokemon.pokemonNickname : pokemonDisplayName) + ` (CP ${pokemon.pokemonCp})`
        : pokemonDisplayName;

      legacyFlag = !!pokemon.legacyDate ? true : legacyFlag;

      fastMoveDisplayName = pokemon.fastMove;
      chargeMoveDisplayName = pokemon.chargeMove;
      thirdMoveDisplayName = !!pokemon.thirdMove ? pokemon.thirdMove : '';

      moveEmbedName = `${fastMoveDisplayName}/${chargeMoveDisplayName}` + (!!pokemon.thirdMove ? `/${thirdMoveDisplayName}` : '');

      contentArr.push(
        `${'`#' + (idx + 1).toLocaleString('en-US', {minimumIntegerDigits: 2}) + '`'} **${pokemonEmbedName}**: ` +
        `${Math.round(pokemon.ttw)}s | ${pokemon.deaths.toFixed(1)} | ${Math.ceil(pokemon.trainers * 10) / 10}\n` +
        `*${moveEmbedName}` +
        `${!!pokemon.legacyDate ? ' †' : ''}*`
      );
    }

    // Footnotes
    let legacyMessage = legacyFlag ? '*† - indicates legacy move*' : '';
    let randomMessage = sortedData.randomMove ? '*†† - results based on averaged data of all movesets*' : '';

    contentArr.push(''); // newline
    !!legacyMessage ? contentArr.push(legacyMessage) : '';
    !!randomMessage
      ? contentArr.push(randomMessage)
      : contentArr.push(`*Moveset: ${this.titleCase(moveset.move1.replace('_FAST', '').replace(/_/g, ' '))}/${this.titleCase(moveset.move2.replace(/_/g, ' '))}*`);

    return contentArr;
  }

  async savePokebattlerId(userSnowflake, pokebattlerId) {
    let user = await db.DB('User')
      .where('userSnowflake', userSnowflake)
      .first()
      .catch(err => log.error(err));

    if (!!user) {
      await db.DB('User')
        .where('userSnowflake', userSnowflake)
        .update('pokebattlerId', pokebattlerId)
        .catch(err => log.error(err));
    } else {
      await db.DB('User')
        .insert({
          userSnowflake: userSnowflake,
          pokebattlerId: pokebattlerId
        })
        .catch(err => log.error(err));
    }
  }

  async run(message, args) {
    let dbPokebattlerId = await this.fetchPokebattlerId(message);

    // Replace '/' with ',' to support entering moveset like 'Thunder Shock/Thunderbolt'
    let argArr = message.argString.replace('/', ',').split(',').filter(arg => !!arg).map(arg => arg.trim()),
      boss,
      tier,
      attacker,
      weather,
      friendship,
      grouped = false;

    let partyPresets = Party.parsePartyDetails(message);
    boss = !!partyPresets.boss ? await this.parseCounterType(partyPresets.boss, message, args, 'counterpokemontype') : boss;
    tier = !!partyPresets.tier ? await this.parseCounterType(partyPresets.tier, message, args, 'countertiertype') : tier;

    let match;
    for (let arg of argArr) {
      match = false;
      if (!boss && !match) {
        boss = await this.parseCounterType(arg, message, args, 'counterpokemontype');
        match = !!boss;
      }
      if (!tier && !match) {
        tier = await this.parseCounterType(arg, message, args, 'countertiertype');
        match = !!tier;
      }
      if (!attacker && !match) {
        attacker = await this.parseCounterType(arg, message, args, 'counterleveltype');
        match = !!attacker;
      }
      if (!weather && !match) {
        weather = await this.parseCounterType(arg, message, args, 'counterweathertype');
        match = !!weather;
      }
      if (!friendship && !match) {
        friendship = await this.parseCounterType(arg, message, args, 'counterfriendshiptype');
        match = !!friendship;
      }
      if (!grouped && !match) {
        grouped = this.parseGrouped(arg);
        match = !!grouped;
      }
    }

    // Prompt all unset, mandatory parameters

    boss = !boss ? await this.collectParameter(
      message,
      'what raid boss would you like to battle against?\n',
      'counterpokemontype') : boss;
    if (!boss) {
      await message.delete().catch(err => log.error(err));
      return;
    }

    tier = !tier ? await this.collectParameter(message, 'what raid tier would you like to battle at?\n', 'countertiertype') : tier;
    if (!tier) {
      await message.delete().catch(err => log.error(err));
      return;
    }

    // Determine attacker messaging...
    let pokebattlerMessage = !!dbPokebattlerId && !!dbPokebattlerId.pokebattler_id
      ? `\n\nIf you wish to use your saved Pokébox (#${dbPokebattlerId.pokebattler_id}), respond 'Yes', or enter a different Pokebattler ID.\n`
      : `\n\nAlternatively you may provide your Pokebattler ID, which is located on the upper right once you log in.\n`;

    attacker = !attacker ? await this.collectParameter(
      message,
      `what level are your Pokémon you will be raiding with (20, 25, 30, 35, or 40)?${pokebattlerMessage}`,
      'counterleveltype') : attacker;
    if (!attacker) {
      await message.delete().catch(err => log.error(err));
      return;
    }

    let attackerType = !!attacker.type && attacker.type === 'userId' ? 'users' : 'levels';

    weather = !weather ? await this.collectParameter(message, 'what is the current weather for your raid?\n', 'counterweathertype') : weather;
    if (!weather) {
      await message.delete().catch(err => log.error(err));
      return;
    }

    friendship = !friendship ? await this.collectParameter(
      message,
      'what is the maximum friendship level you have with another trainer for this raid?\n',
      'counterfriendshiptype') : friendship;
    if (!friendship) {
      await message.delete().catch(err => log.error(err));
      return;
    }

    let countersData = await this.queryApi({
      raidBossName: boss.pbName,
      tierName: tier.pbName,
      attackerType: attackerType,
      attackerName: attacker.pbName,
      weatherName: weather.pbName,
      friendshipName: friendship.pbName
    });

    if (!!countersData.counters.error) {
      message.reply(`there was an issue communicating with Pokebattler, please try again later.`);
      return;
    }

    let setMove,
      data;
    if (!!partyPresets.boss && !!partyPresets.boss.quickMove && !!partyPresets.boss.cinematicMove) {
      setMove = countersData.counters.attackers[0].byMove.filter(
        moveset => moveset.move1 === partyPresets.boss.quickMove && moveset.move2 === partyPresets.boss.cinematicMove
      );
      if (!!setMove) data = setMove;
    }
    if (!data) {
      data = await this.selectMoveset(message, countersData.counters);
    }

    let moveset = {
      move1: !!setMove ? partyPresets.boss.quickMove : data.moveset.move1,
      move2: !!setMove ? partyPresets.boss.cinematicMove : data.moveset.move2
    };

    let sortedData = this.sortResults({
      data: data.move,
      sortBy: 'ttw',
      limit: 12,
      grouped: grouped,
      randomMove: !setMove && data.randomMove
    });

    let content = this.buildCountersContent(sortedData, moveset);

    let commandMessage = `\`${message.client.commandPrefix}counters ${this.titleCase(boss.pbName.replace(/_/g, ' '))}, ` +
      `${tier.name}, ` +
      `${attacker.pbName}, ` +
      `${weather.name}, ` +
      `${friendship.name}` +
      `${grouped ? ', Grouped' : ''}\``;

    const embed = new MessageEmbed()
      .setAuthor('Data provided by Pokebattler', 'https://www.pokebattler.com/favicon-32x32.png')
      .setColor('#43B581')
      .setTitle(`Click here for full results`)
      .setURL(countersData.url)
      .setThumbnail(boss.imageURL)
      .setDescription(content);

    if (message.channel.type !== 'dm') embed.setFooter(`Requested by ${message.member.displayName}`, message.author.displayAvatarURL());

    if (attackerType === 'users') {
      let dmResponse = await message.reply(`I am sending you a DM with the \`${message.client.commandPrefix}counters\` results for your Pokebattler Pokebox.`).catch(err => log.error(err));
      dmResponse.preserve = true;
      await message.author.send(commandMessage, embed).catch(err => log.error(err));
    } else {
      await message.channel.send(commandMessage, embed).catch(err => log.error(err));
    }

    // Optionally prompt to save Pokebattler ID if it is new
    if (attackerType === 'users' && (!dbPokebattlerId || (!!dbPokebattlerId && attacker.pbName !== dbPokebattlerId.pokebattlerId))) {
      let shouldIStayOrShouldIGo = await this.collectParameter(message, `would you like to save your new Pokebattler ID (${attacker.pbName}) for future use?\n`, 'boolean');
      if (shouldIStayOrShouldIGo) await this.savePokebattlerId(message.author.id, attacker.pbName);
    }
  }
}

module.exports = CountersCommand;
