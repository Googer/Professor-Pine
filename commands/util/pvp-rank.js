const log = require('loglevel').getLogger('RankCommand'),
  Commando = require('discord.js-commando'),
  {MessageEmbed} = require('discord.js'),
  {CommandGroup} = require('../../app/constants'),
  CpmData = require('../../data/cpm');
Helper = require('../../app/helper');

class PvPRankingData {
  constructor(command, arg, client) {
    this.arg = arg;
    this.command = command;
    this.pokemon_collector = new Commando.ArgumentCollector(client, [
      {
        key: 'pvp_pokemon',
        prompt: 'Which species of Pokémon would you like to evaluate a specific IV combination PvP rank for?',
        type: 'counterpokemontype',
      }
    ], 3);
    this.atkCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'ATK_IV',
        label: 'Attack IV',
        prompt: 'Please enter the Pokemon\'s Attack IV (Integer between 0 and 15)',
        type: 'integer',
        min: 0,
        max: 15
      }
    ], 3);
    this.defCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'DEF_IV',
        label: 'Defense IV',
        prompt: 'Please enter the Pokemon\'s Defense IV (Integer between 0 and 15)',
        type: 'integer',
        min: 0,
        max: 15
      }
    ], 3);
    this.staCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'STA_IV',
        label: 'Stamina IV',
        prompt: 'Please enter the Pokemon\'s Stamina IV (Integer between 0 and 15)',
        type: 'integer',
        min: 0,
        max: 15
      }
    ], 3);
  }

  async getUserRequest(message) {
    let AttackIV = [''],
      DefenseIV = [''],
      StaminaIV = [''],
      Filter = [''],
      Flag = true;

    let pokemonName = [''];
    let stringComponents = this.arg.split(' ');
    for (let i = 0; i < stringComponents.length; i++) {
      if (!Number(stringComponents[i]) && Flag === true && stringComponents[i] !== '0') {
        pokemonName[0] += stringComponents[i] + ' ';
      } else {
        Flag = false;
      }
      if ((Number(stringComponents[i]) || stringComponents[i] === '0') && !AttackIV[0]) {
        AttackIV[0] = stringComponents[i];
        if (Number(stringComponents[i + 1]) || stringComponents[i + 1] === '0') {
          DefenseIV[0] = stringComponents[i + 1];
        }
        if (Number(stringComponents[i + 2]) || stringComponents[i + 2] === '0') {
          StaminaIV[0] = stringComponents[i + 2];
        }
      }
    }
    pokemonName[0] = pokemonName[0].trim().replace('-', ' ');
    Filter[0] = stringComponents[stringComponents.length - 1];
    if (Number(Filter[0]) || Filter[0] === '0') {
      Filter[0] = [''];
    }

    this.ivFilter;
    this.cpLeague = this.command === 'ultra' ? 2500 : 1500;
    if (Filter[0] === 'raid' || Filter[0] === 'boss') {
      this.ivFilter = 10;
      this.ivFilterText = "Raid";
    } else if (Filter[0] !== "10") {
      this.ivFilter = 0;
    }

    this.pokemon = await this.pokemon_collector.obtain(message, pokemonName); //Sees if pokemonName argument was included. If not, it prompts user for one.
    if (!this.pokemon.cancelled) {
      this.pokemon = this.pokemon.values.pvp_pokemon;
    } else {
      this.flag = true; //This variable is used to stop the whole process (this function is nested- see displayInfo();)
      return;
    }
    this.attackIV = await this.atkCollector.obtain(message, AttackIV); //Sees if Attack IV argument was included. If not, it prompts user for one.
    if (!this.attackIV.cancelled) {
      this.attackIV = this.attackIV.values.ATK_IV;
    } else {
      this.flag = true;
      return;
    }
    this.defenseIV = await this.defCollector.obtain(message, DefenseIV); //Sees if Defense IV argument was included. If not, it prompts user for one.
    if (!this.defenseIV.cancelled) {
      this.defenseIV = this.defenseIV.values.DEF_IV;
    } else {
      this.flag = true;
      return;
    }
    this.staminaIV = await this.staCollector.obtain(message, StaminaIV); //Sees if Stamina IV argument was included. If not, it prompts user for one.
    if (!this.staminaIV.cancelled) {
      this.staminaIV = this.staminaIV.values.STA_IV;
    } else {
      this.flag = true;
      return;
    }

    this.embedName = this.pokemon.gsName[0];
    if (!this.pokemon.gsName[1]) { //If no more than 1 gsName, use 0 index for commandName.
      this.commandName = this.pokemon.gsName[0].replace(/ /g, '-').replace(/_/g, '-').toLowerCase();
      this.goStadiumName = this.pokemon.gsName[0];
    } else { //If more than 1 gsName, use 1 index for commandName.
      this.commandName = this.pokemon.gsName[1].replace(/ /g, '-').replace(/_/g, '-').toLowerCase();
      this.goStadiumName = this.pokemon.gsName[2];
    }

    if (parseInt(this.attackIV) < this.ivFilter || parseInt(this.defenseIV) < this.ivFilter || parseInt(this.staminaIV) < this.ivFilter) {
      this.embedErrorMessage = `IV outside of filter range. __**Minimum IV: ${this.ivFilter}**__`;
    }
  }

  calculateCp(baseAtk, baseDef, baseSta, atkIv, defIv, staIv, cpmMultiplier) {
    let totAtk = baseAtk + atkIv,
      totDef = baseDef + defIv,
      totSta = baseSta + staIv;

    let cp = Math.floor((totAtk * (totDef ** 0.5) * (totSta ** 0.5) * (cpmMultiplier ** 2)) / 10);

    return cp >= 10 ? cp : 10 // min CP is 10
  }

  generateRanks(CpmData) {
    if (this.flag === true) {
      return;
    }
     //If somebody cancels the command in scrape(), we don't want this function running.
	  let ivArr = [],
      level,
      cpmMultiplier,
      cp,
      rawAtk,
      rawDef,
      rawSta;

    let baseAtk = this.pokemon.atk,
      baseDef = this.pokemon.def,
      baseSta = this.pokemon.sta;

    // insert the cpm data to iterate calculating from level 40 down
    let reversedCpmData = CpmData.slice().reverse(); // slice to not mutate original array

    // Iterates through each of the 4096 IV combinations (0-15).
    // Then starting at level 40, calculate the CP of the Pokemon at that IV.
    // If it is less than the league cap, add to the IV list and stop calculating.
    // The best will always be the highest level under the cap for a given IV.
    for (let atkIv = this.ivFilter; atkIv <= 15; atkIv++) {
      for (let defIv = this.ivFilter; defIv <= 15; defIv++) {
        for (let staIv = this.ivFilter; staIv <= 15; staIv++) {
          for (let cpmLevel of reversedCpmData) {
            level = cpmLevel.level,
              cpmMultiplier = cpmLevel.cpmMultiplier;
            cp = this.calculateCp(baseAtk, baseDef, baseSta, atkIv, defIv, staIv, cpmMultiplier);
            if (cp <= this.cpLeague) {
              rawAtk = (baseAtk + atkIv) * cpmMultiplier,
                rawDef = (baseDef + defIv) * cpmMultiplier,
                rawSta = Math.floor((baseSta + staIv) * cpmMultiplier);
              ivArr.push({
                rawAtk: rawAtk,
                rawDef: rawDef,
                rawSta: rawSta,
                atkIv: atkIv,
                defIv: defIv,
                staIv: staIv,
                ivTotal: atkIv + defIv + staIv,
                statProduct: Math.round(rawAtk * rawDef * rawSta),
                rawStatProduct: rawAtk * rawDef * rawSta,
                level: level,
                cp: cp
              });
              break;
            }
          }
        }
      }
    }

    // Sort by raw stat product DESC, iv total DESC, and cp DESC
    ivArr.sort(function (a, b) {
      if (a.rawStatProduct > b.rawStatProduct) return -1;
      if (a.rawStatProduct < b.rawStatProduct) return 1;
      if (a.ivTotal > b.ivTotal) return -1;
      if (a.ivTotal < b.ivTotal) return 1;
      if (a.cp > b.cp) return -1;
      if (a.cp < b.cp) return 1;
      return 0
    });

    // Add rank based on index
    ivArr.forEach(function (val, idx) {
      val.rank = idx + 1;
    });

    // Add % max stat product
    ivArr.forEach(function (val) {
      val.pctMaxStatProduct = (val.rawStatProduct / ivArr[0].rawStatProduct) * 100;
    });

    let rankData = ivArr.filter(x => x.atkIv === this.attackIV && x.defIv === this.defenseIV && x.staIv === this.staminaIV)[0];
    if (!rankData) {
      return;
    }

    this.rank = rankData.rank,
      this.level = rankData.level,
      this.cp = rankData.cp,
      this.atk = rankData.rawAtk,
      this.def = rankData.rawDef,
      this.sta = rankData.rawSta,
      this.statproduct = rankData.statProduct,
      this.pctMaxStatProduct = rankData.pctMaxStatProduct,
      this.pctMaxStatProductStr = rankData.pctMaxStatProduct.toFixed(2).toString() + "%";
  }

  async displayInfo(message, command) {
    if (this.flag === true) {
      return;
    }
     //If somebody cancels the command in scrape(), we don't want this function running.
	  function embedColor(statProductPercent) {
      if (statProductPercent >= 99) {
        return '#ffd700' //'#ffa500';
      } else if (statProductPercent < 99 && statProductPercent >= 97) {
        return '#c0c0c0' //'#ffff00';
      } else if (statProductPercent < 97 && statProductPercent >= 95) {
        return '#cd7f32' //'#228ec3';
      } else {
        return '#30839f' //'#f0f0f0';
      }
    }

    this.url = `https://gostadium.club/pvp/iv?pokemon=` +
      `${this.goStadiumName.replace(' ', '+')}` +
      `&max_cp=${this.cpLeague}` +
      `&min_iv=${this.ivFilter}` +
      `&att_iv=${this.attackIV}` +
      `&def_iv=${this.defenseIV}` +
      `&sta_iv=${this.staminaIV}`;

    let league = '';
    if (command === 'rank') {
      league = 'GREAT';
    } else {
      league = command.toUpperCase();
    }
    let embed;
    if (!this.embedErrorMessage) { //If no error message was found.
      let rankOutOf = this.ivFilterText ? `/${Math.pow((16 - this.ivFilter), 3).toString()}` : ''; //If there is a filter, then give a Rank/HowMany. Otherwise, blank variable.
      let requestInfo = `\n**[${league} LEAGUE](${this.url})\nRank**: ${this.rank}${rankOutOf} (${this.pctMaxStatProductStr})\n` + //requestInfo is League, rank, CP by default.
        `**CP**: ${this.cp} @ Level ${this.level}\n`;
      if (this.ivFilterText) { //Add filter line to requestInfo if a filter exists.
        requestInfo += `**Filter**: ${this.ivFilterText}\n`;
      }
      let nameField = `**${this.embedName.replace(/_/g, ' ').titleCase()}**  ${this.attackIV}/${this.defenseIV}/${this.staminaIV}\n`; //nameField is pokemon name & IVs.

      embed = new MessageEmbed()
        .setColor(embedColor(this.pctMaxStatProduct))
        .addField(nameField, requestInfo)
        .setThumbnail(this.pokemon.imageURL)
        .setFooter(`Requested by ${message.member.displayName}`, message.author.displayAvatarURL());
    } else { //If rank was not found. This is due to an IV request outside of the allowed IVs per the IV filter. (Asking for rank of IV: 5 from a raid boss when minimum is 10)
      let nameField = `**${this.embedName.replace(/_/g, ' ').titleCase()}**  ${this.attackIV}/${this.defenseIV}/${this.staminaIV}\n`; //nameField is pokemon name & IVs.
      let requestInfo = `\n**[${league} LEAGUE](${this.url})\nRank**:   *Not Found*\n**CP**: *Not Found*\n**Error**: ${this.embedErrorMessage}`;
      embed = new MessageEmbed()
        .setColor('ff0000')
        .addField(nameField, requestInfo)
        .setThumbnail(this.pokemon.imageURL)
        .setFooter(`Requested by ${message.member.displayName}`, message.author.displayAvatarURL());
    }
    let userCommand = `${message.client.commandPrefix}${command}`, //Grabs the !great, !ultra or w/e from user inputs.
      userPokemon = `${this.commandName}`, //Grabs the accepted Pokémon name.
      userIVString = `${this.attackIV} ${this.defenseIV} ${this.staminaIV}`; //Grabs the accepted IV sets (0-15 for ATK,DEF,STA)
    if (this.ivFilterText) {
      userIVString += ` ${this.ivFilterText}`
    }
    let responseCommand = `\`${userCommand} ${userPokemon} ${userIVString}\` results:`, //Combined the above into the whole accepted command.
      response = await message.channel.send(responseCommand.toLowerCase(), embed);
    response.preserve = true;
  }
}

class RankCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'rank',
      group: CommandGroup.UTIL,
      memberName: 'rank',
      aliases: ['great', 'ultra'],
      description: 'Provides PvP data based on a Pokémon species\'s IVs, including rank and CP.',
      details: 'Use this command to obtain information on the PvP ranking of a specific IV combination for a specific species of Pokémon.' +
        '\n!great - This command restricts results to **Great League**\n!ultra - This command restricts results to **Ultra League**',
      examples: ['!<league> <Pokémon> <Attack IV> <Defense IV> <Stamina IV>\n!great altaria 4 1 2\n!ultra blastoise 10 14 15\n'],
      guarded: false,
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'rank' && !Helper.isPvPCategory(message)) {
        return ['invalid-channel', message.reply(Helper.getText('pvp-rank.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    String.prototype.titleCase = function () {
      return this.replace(/\w\S*/g, function (str) {
        return str.charAt(0).toUpperCase() + str.substr(1).toLowerCase();
      });
    };

    let userCommand = message.content.substring(1).trim().split(' ').shift().toLowerCase();

    if (userCommand === 'great' || userCommand === 'rank') {
      let greatRank = new PvPRankingData(userCommand, args, message.client);
      await greatRank.getUserRequest(message, CpmData);
      await greatRank.generateRanks(CpmData);
      await greatRank.displayInfo(message, userCommand);
    } else if (userCommand === 'ultra') {
      let ultraRank = new PvPRankingData(userCommand, args, message.client);
      await ultraRank.getUserRequest(message);
      await ultraRank.generateRanks(CpmData);
      await ultraRank.displayInfo(message, userCommand);
    }
  }
}

module.exports = RankCommand;