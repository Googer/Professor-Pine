const log = require('loglevel').getLogger('RankCommand'),
  {CommandGroup} = require('../../app/constants'),
  Commando = require('discord.js-commando'),
  Helper = require('../../app/helper'),
  {MessageEmbed} = require('discord.js'),
  Pokemon = require('../../app/pokemon');

class PvPRankingData {
  constructor(command, arg, client) {
    this.arg = arg;
    this.command = command;
    this.pokemonCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'pvpPokemon',
        prompt: 'Which species of Pokémon would you like to evaluate a specific IV combination PvP rank for?',
        type: 'pokemon',
      }
    ], 3);
    this.attackCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'attackIV',
        label: 'Attack IV',
        prompt: 'Please enter the Pokemon\'s Attack IV (Integer between 0 and 15)',
        type: 'integer',
        min: 0,
        max: 15
      }
    ], 3);
    this.defenseCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'defenseIV',
        label: 'Defense IV',
        prompt: 'Please enter the Pokemon\'s Defense IV (Integer between 0 and 15)',
        type: 'integer',
        min: 0,
        max: 15
      }
    ], 3);
    this.staminaCollector = new Commando.ArgumentCollector(client, [
      {
        key: 'staminaIV',
        label: 'Stamina IV',
        prompt: 'Please enter the Pokemon\'s Stamina IV (Integer between 0 and 15)',
        type: 'integer',
        min: 0,
        max: 15
      }
    ], 3);
  }

  //Set IV Filter variables for any instance.
  //This function only exists to avoid reptition for each filter type.
  ivFilterVariablesSet(ivFilter, ivFilterDescription, ivFilterCommand) {
    this.ivFilter = ivFilter;
    this.ivFilterDescription = ivFilterDescription;
    this.ivFilterCommand = ivFilterCommand;
  }

  //Takes the message and parses it and then sets object variables.
  //Includes object variable limitations. If a particular value is not appropriate, prompts the user to try again.
  async getUserRequest(message, userCommand) {
    let inputAttackIV = [''],
      inputDefenseIV = [''],
      inputStaminaIV = [''],
      inputFilter = [''],
      flag = true;

    let pokemonName = [''];
    let stringComponents = this.arg.split(/ |\//); //Separate user string by space characters and / characters.
    for (let i = 0; i < stringComponents.length; i++) {
      if (!Number(stringComponents[i]) && flag === true && stringComponents[i] !== '0') {
        pokemonName[0] += stringComponents[i] + ' ';
      } else {
        flag = false;
      }
      if ((Number(stringComponents[i]) || stringComponents[i] === '0') && !inputAttackIV[0]) {
        inputAttackIV[0] = stringComponents[i];
        if (Number(stringComponents[i + 1]) || stringComponents[i + 1] === '0') {
          inputDefenseIV[0] = stringComponents[i + 1];
        }
        if (Number(stringComponents[i + 2]) || stringComponents[i + 2] === '0') {
          inputStaminaIV[0] = stringComponents[i + 2];
        }
      }
    }
    pokemonName[0] = pokemonName[0].trim().replace('-', ' ');
    inputFilter[0] = stringComponents[stringComponents.length - 1];
    if (Number(inputFilter[0]) || inputFilter[0] === '0') {
      inputFilter[0] = [''];
    }

    switch (this.command) {
      case 'master':
        this.cpLeague = 9001;
        break;
      case 'ultra':
      case 'ultra-evo':
      case 'ultraevo':
        this.cpLeague = 2500;
        break;
      default:
        this.cpLeague = 1500;
    }

    if (typeof (inputFilter[0]) == 'string') {
      inputFilter[0] = inputFilter[0].toLowerCase();
    }
    switch (inputFilter[0]) {
      case 'ultra-friend':
      case 'uf':
        this.ivFilterVariablesSet(3, "Ultra Friend", "uf");
        break;
      case 'best-friend':
      case 'bf':
        this.ivFilterVariablesSet(5, "Best Friend", "bf");
        break;
      case 'boss':
      case 'raid':
        this.ivFilterVariablesSet(10, "Raid", "raid");
        break;
      case 'lucky':
        this.ivFilterVariablesSet(12, "Lucky", "lucky");
        break;
      case 'stat':
      case 'stats':
        this.ivFilterVariablesSet(0, "Stats", "stats");
        break;
      case 'top':
        this.ivFilterVariablesSet(0, "Top", "top");
        break;
      default:
        this.ivFilter = 0;
    }

    this.pokemon = await this.pokemonCollector.obtain(message, pokemonName); //Sees if pokemonName argument was included. If not, it prompts user for one.
    if (!this.pokemon.cancelled) {
      this.pokemon = this.pokemon.values.pvpPokemon;
    } else {
      this.flag = true; //This variable is used to stop the whole process (this function is nested- see displayInfo();)
      return;
    }
    this.inputAttackIV = await this.attackCollector.obtain(message, inputAttackIV); //Sees if Attack IV argument was included. If not, it prompts user for one.
    if (!this.inputAttackIV.cancelled) {
      this.inputAttackIV = this.inputAttackIV.values.attackIV;
    } else {
      this.flag = true;
      return;
    }
    this.inputDefenseIV = await this.defenseCollector.obtain(message, inputDefenseIV); //Sees if Defense IV argument was included. If not, it prompts user for one.
    if (!this.inputDefenseIV.cancelled) {
      this.inputDefenseIV = this.inputDefenseIV.values.defenseIV;
    } else {
      this.flag = true;
      return;
    }
    this.inputStaminaIV = await this.staminaCollector.obtain(message, inputStaminaIV); //Sees if Stamina IV argument was included. If not, it prompts user for one.
    if (!this.inputStaminaIV.cancelled) {
      this.inputStaminaIV = this.inputStaminaIV.values.staminaIV;
    } else {
      this.flag = true;
      return;
    }

    this.commandName = this.pokemon.name;
    if (!this.pokemon.gsName[1]) { //If no more than 1 gsName, use 0 index for commandName.
      this.commandName = this.pokemon.gsName[0].replace(/ /g, '-').replace(/_/g, '-').toLowerCase();
    } else { //If more than 1 gsName, use 1 index for commandName.
      this.commandName = this.pokemon.gsName[1].replace(/ /g, '-').replace(/_/g, '-').toLowerCase();
    }

    let familyList;
    if (this.command === 'great-evo' || this.command === 'greatevo' || this.command === 'ultra-evo' || this.command === 'ultraevo') {
      familyList = Pokemon.getFamily(this.pokemon);
    } else {
      familyList = [this.pokemon];
    }
    this.familyList = familyList;

    if (parseInt(this.inputAttackIV) < this.ivFilter || parseInt(this.inputDefenseIV) < this.ivFilter || parseInt(this.inputStaminaIV) < this.ivFilter) {
      this.embedErrorMessage = `IV outside of filter range. __**Minimum IV: ${this.ivFilter}**__`;
    }
  }

  generateRanks() {
    if (this.flag === true) {
      // If somebody cancels the command in scrape(), we don't want this function running.
      return;
    }

    for (let i = 0; i < this.familyList.length; i++) {
      //GoStadiumName is the variable used in the URLs in hyperlinks. GoStadium has particular naming convention.
      //Some pokemon have gsName[0] cover all instances of their names (simple names like Pikachu).
      //Complicated names have 3 gsName[]s (burmy trash, castform snowy, armored mewtwo, etc.)
      if (!this.familyList[i].gsName[2]) {
        this.familyList[i].goStadiumName = this.familyList[i].gsName[0]; //If there's no gsName[2], it's a simple name. Use the simple name.
      } else {
        this.familyList[i].goStadiumName = this.familyList[i].gsName[2]; //If there is gsName[2], it's a complicated name. Use gsName[2].
      }

      let ivArr = [],
        level,
        cpmMultiplier,
        cp,
        rawAttack,
        rawDefense,
        rawStamina;

      let baseAttack = this.familyList[i].stats.baseAttack,
        baseDefense = this.familyList[i].stats.baseDefense,
        baseStamina = this.familyList[i].stats.baseStamina;
      // insert the cpm data to iterate on
      const cpmData = Pokemon.getCPTable();

      // Iterates through each of the 4096 IV combinations (0-15).
      // Then starting at level 40, calculate the CP of the Pokemon at that IV.
      // If it is larger than the league cap, go down to the next half-level. Repeat until CP is lower than cap.
      // If it is less than the league cap, add to the IV list and stop calculating. Start at level 40 with new IV combination.
      // The best will always be the highest level under the cap for a given IV.
      for (let attackIV = this.ivFilter; attackIV <= 15; attackIV++) {
        for (let defenseIV = this.ivFilter; defenseIV <= 15; defenseIV++) {
          for (let staminaIV = this.ivFilter; staminaIV <= 15; staminaIV++) {
            for (const {level, cpmMultiplier} of cpmData) {
              cp = Pokemon.calculateCP(this.familyList[i], level, attackIV, defenseIV, staminaIV);
              if (cp <= this.cpLeague) {
                rawAttack = (baseAttack + attackIV) * cpmMultiplier;
                rawDefense = (baseDefense + defenseIV) * cpmMultiplier;
                rawStamina = Math.floor((baseStamina + staminaIV) * cpmMultiplier);
                ivArr.push({
                  rawAtk: rawAttack,
                  rawDef: rawDefense,
                  rawSta: rawStamina,
                  atkIv: attackIV,
                  defIv: defenseIV,
                  staIv: staminaIV,
                  ivTotal: attackIV + defenseIV + staminaIV,
                  statProduct: Math.round(rawAttack * rawDefense * rawStamina),
                  rawStatProduct: rawAttack * rawDefense * rawStamina,
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
      ivArr.sort((a, b) => {
        if (a.rawStatProduct > b.rawStatProduct) return -1;
        if (a.rawStatProduct < b.rawStatProduct) return 1;
        if (a.ivTotal > b.ivTotal) return -1;
        if (a.ivTotal < b.ivTotal) return 1;
        if (a.cp > b.cp) return -1;
        if (a.cp < b.cp) return 1;
        return 0;
      });

      // Add rank based on index
      ivArr.forEach((val, idx) => {
        val.rank = idx + 1;
      });

      // Add % max stat product
      ivArr.forEach(val => {
        val.pctMaxStatProduct = (val.rawStatProduct / ivArr[0].rawStatProduct) * 100;
      });

      this.familyList[i].gsUrl = `https://gostadium.club/pvp/iv?pokemon=` +
        `${this.familyList[i].goStadiumName.replaceAll(' ', '+').replaceAll('_', '+')}` +
        `&max_cp=${this.cpLeague}` +
        `&min_iv=${this.ivFilter}` +
        `&att_iv=${this.inputAttackIV}` +
        `&def_iv=${this.inputDefenseIV}` +
        `&sta_iv=${this.inputStaminaIV}`;

      let rankData = ivArr.filter(x => x.atkIv === this.inputAttackIV && x.defIv === this.inputDefenseIV && x.staIv === this.inputStaminaIV)[0];
      if (!rankData) {
        this.embedName = this.pokemon.gsName[0];
        return;
      }

      this.familyList[i].rank = rankData.rank;
      this.familyList[i].level = rankData.level;
      this.familyList[i].cp = rankData.cp;
      this.familyList[i].atk = Math.round(rankData.rawAtk * 10) / 10;
      this.familyList[i].def = Math.round(rankData.rawDef * 10) / 10;
      this.familyList[i].sta = Math.round(rankData.rawSta * 10) / 10;
      this.familyList[i].statproduct = rankData.statProduct;
      this.familyList[i].pctMaxStatProduct = rankData.pctMaxStatProduct;
      this.familyList[i].pctMaxStatProductStr = rankData.pctMaxStatProduct.toFixed(2).toString() + "%";

      //These z-values are the values associated with the Rank 1 IV combination. These 9 values are only ones that matter.
      this.familyList[i].zrank = ivArr[0].rank;
      this.familyList[i].zlevel = ivArr[0].level;
      this.familyList[i].zcp = ivArr[0].cp;
      this.familyList[i].zatk = Math.round(ivArr[0].rawAtk * 10) / 10;
      this.familyList[i].zdef = Math.round(ivArr[0].rawDef * 10) / 10;
      this.familyList[i].zsta = Math.round(ivArr[0].rawSta * 10) / 10;
      this.familyList[i].zatkiv = ivArr[0].atkIv;
      this.familyList[i].zdefiv = ivArr[0].defIv;
      this.familyList[i].zstaiv = ivArr[0].staIv;
    }

    //Sort list of ranked pokemon. Highest rank gets index 0.
    this.familyList.sort((a, b) => {
      if ((b.cp - a.cp) > 300) return 1;
      if ((a.cp - b.cp) > 300) return -1;
      if (a.rank > b.rank) return 1;
      if (a.rank < b.rank) return -1;
      return 0
    });

    this.embedName = this.familyList[0].gsName[0]; //Sets name shown above hyperlink next to IV combination (First line of embed)
  }

  async displayInfo(message, command, isDM) {
    if (this.flag === true) {
      // If somebody cancels the command in scrape(), we don't want this function running.
      return;
    }

    function embedColor(statProductPercent) {
      if (statProductPercent >= 99) {
        return '#ffd700'
      } else if (statProductPercent < 99 && statProductPercent >= 97) {
        return '#c0c0c0'
      } else if (statProductPercent < 97 && statProductPercent >= 95) {
        return '#cd7f32'
      } else {
        return '#30839f'
      }
    }

    let league = '';
    if (command === 'rank' || command === 'great-evo' || command === 'greatevo') {
      league = 'GREAT';
    } else if (command === 'ultra-evo' || command === 'ultraevo') {
      league = 'ULTRA';
    } else {
      league = command.toUpperCase();
    }
    let embed;
    if (!this.embedErrorMessage) { //If no error message was found.
      let rankOutOf = this.ivFilter > 0 ? `/${Math.pow((16 - this.ivFilter), 3).toString()}` : ''; //If there is a filter, then give a Rank/HowMany. Otherwise, blank variable.
      let requestInfo = `\n**[${league} LEAGUE](${this.familyList[0].gsUrl})\nRank**: ${this.familyList[0].rank}${rankOutOf}` +
        ` (${this.familyList[0].pctMaxStatProductStr})\n**CP**: ${this.familyList[0].cp} @ Level ${this.familyList[0].level}\n`;

      let requestInfo2 = ``;
      for (let i = 1; i < this.familyList.length; i++) {
        requestInfo2 += `**[${this.familyList[i].gsName[0].titleCase()}](${this.familyList[i].gsUrl})**` +
          `   Rank: ${this.familyList[i].rank} | ${this.familyList[i].cp}CP @ L${this.familyList[i].level}\n`;
      }

      if (this.ivFilterDescription) { //Add filter line to requestInfo if a filter exists.
        if (this.ivFilter > 0) {
          requestInfo += `**Filter**: ${this.ivFilterDescription}\n`;
        }
        if (this.ivFilterCommand === "stats" && this.familyList.length === 1) {
          requestInfo += `**:crossed_swords: ${this.familyList[0].atk} :shield: ${this.familyList[0].def} :heart: ${this.familyList[0].sta}` +
            `\n\n:trophy: #1:** ${this.familyList[0].zatkiv}/${this.familyList[0].zdefiv}/${this.familyList[0].zstaiv} **|**`;
          requestInfo += ` ${this.familyList[0].zcp}CP @ Level ${this.familyList[0].zlevel}\n**:crossed_swords: ${this.familyList[0].zatk}` +
            ` :shield: ${this.familyList[0].zdef} :heart: ${this.familyList[0].zsta}**\n`
        }
        if (this.ivFilterCommand === "top") {
          requestInfo += `\n:trophy: **#1:** ${this.familyList[0].zatkiv}/${this.familyList[0].zdefiv}/${this.familyList[0].zstaiv} **|** ` +
            `${this.familyList[0].zcp}CP @ Level ${this.familyList[0].zlevel}\n`
        }
      }
      let nameField = `**${this.embedName.replace(/_/g, ' ').titleCase()}**  ${this.inputAttackIV}/${this.inputDefenseIV}/${this.inputStaminaIV}\n`; //nameField is pokemon name & IVs.

      embed = new MessageEmbed()
        .setColor(embedColor(this.familyList[0].pctMaxStatProduct))
        .addField(nameField, requestInfo)
        .setThumbnail(this.familyList[0].url);

      if (!!requestInfo2) {
        embed.addField("\n__**Family Ranks**__", requestInfo2);
      }

      if (!isDM) {
        embed.setFooter(`Requested by ${message.member.displayName}`, message.author.displayAvatarURL());
      }
    } else { //If rank was not found. This is due to an IV request outside of the allowed IVs per the IV filter. (Asking for rank of IV: 5 from a raid boss when minimum is 10)
      let nameField = `**${this.embedName.replace(/_/g, ' ').titleCase()}**  ${this.inputAttackIV}/${this.inputDefenseIV}/${this.inputStaminaIV}\n`; //nameField is pokemon name & IVs.
      let requestInfo = `\n**[${league} LEAGUE](${this.gsUrl})\nRank**:   *Not Found*\n**CP**: *Not Found*\n**Error**: ${this.embedErrorMessage}`;
      embed = new MessageEmbed()
        .setColor('ff0000')
        .addField(nameField, requestInfo)
        .setThumbnail(this.pokemon.url);

      if (!isDM) {
        embed.setFooter(`Requested by ${message.member.displayName}`, message.author.displayAvatarURL());
      }
    }
    let userCommand = `${message.client.commandPrefix}${command}`, //Grabs the !great, !ultra or w/e from user inputs.
      userPokemon = `${this.commandName}`, //Grabs the accepted Pokémon name.
      userIVString = `${this.inputAttackIV} ${this.inputDefenseIV} ${this.inputStaminaIV}`; //Grabs the accepted IV sets (0-15 for ATK,DEF,STA)

    if (this.ivFilterCommand && !(this.ivFilterCommand === "stats" && this.familyList.length > 1)) {
      userIVString += ` ${this.ivFilterCommand}`
    }

    let responseCommand = `\`${userCommand} ${userPokemon} ${userIVString}\` results:`, //Combined the above into the whole accepted command.
      response = await message.channel.send(responseCommand.toLowerCase(), embed)
        .catch(err => log.error(err));
    response.preserve = true;
  }
}

class RankCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'rank',
      group: CommandGroup.UTIL,
      memberName: 'rank',
      aliases: ['great', 'ultra', 'master', `great-evo`, `ultra-evo`],
      description: 'Provides PvP data based on a Pokémon species\'s IVs, including rank and CP.',
      details: '**SYNTAX:** `!<league> <Pokémon> <Attack IV> <Defense IV> <Stamina IV> <Filter (Optional)>`\n' +
        '__League:__\n> `!great` `!ultra` and `!master` provide data on their respective leagues.\n> `!rank` defaults to great league.\n' +
        '> `-evo` can be added to the end of great or ultra (`!great-evo` / `!ultra-evo`) to compare all family members of the input Pokemon species.\n' +
        '__Pokemon:__\n> The name of the pokemon. Examples: Pichu, Alolan Muk, Castform Snowy.\n__IVs:__\n' +
        '> Number between 0 and 15 that represents the IV value for each of the three stats (Attack, Defense, Stamina)\n__Filter:__\n' +
        'Some filters exist to rank Pokemon out of possibilities with a minimum IV requirement.\n`uf` sets the minimum IV to 3.\n`bf` sets the minimum IV to 5.\n' +
        '`raid` sets the minimum  IV to 10.\n`lucky` sets the minimum  IV to 12.\n\nOther filters provide additional information to the bot\'s output.\n' +
        '`stats` provides raw Attack, Defense, and Stamina values of the specific Pokemon.\n' +
        '`top` provides the Rank 1 IV combination in addition for comparison.',//Use this command to obtain information on the PvP ranking of a specific IV combination for a species of Pokémon.' +
      //'\n!great - This command restricts results to **Great League**\n!ultra - This command restricts results to **Ultra League**',
      examples: ['!<league> <Pokémon> <Attack IV> <Defense IV> <Stamina IV> <Filter (Optional)>\n`!great Wigglytuff 10 12 13`\n' +
      '`!ultra Giratina Altered 0 0 1`\n`!master Mewtwo 14 14 10`\n`!great-evo eevee 1 13 14`\n' +
      '`!great Deoxys Defense 10 12 14 raid`\n`!great Altaria 1 10 11 top`'],
      guarded: false,
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'rank' && !Helper.isPvPCategory(message) && message.channel.type !== 'dm') {
        return {
          reason: 'invalid-channel',
          response: message.reply(Helper.getText('pvp-rank.warning', message))
        };
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

    const userCommand = message.content.toLowerCase()
      .match(`\\${message.client.options.commandPrefix}?(\\s+)?(\\S+)`)[2];

    if (userCommand === 'great' || userCommand === 'rank' || userCommand === 'great-evo' || userCommand === 'greatevo') {
      let greatRank = new PvPRankingData(userCommand, args, message.client);
      await greatRank.getUserRequest(message, userCommand);
      await greatRank.generateRanks();
      await greatRank.displayInfo(message, userCommand, message.channel.type === 'dm');
    } else if (userCommand === 'ultra' || userCommand === 'ultra-evo' || userCommand === 'ultraevo' || userCommand === 'master') {
      let ultraRank = new PvPRankingData(userCommand, args, message.client);
      await ultraRank.getUserRequest(message, userCommand);
      await ultraRank.generateRanks();
      await ultraRank.displayInfo(message, userCommand, message.channel.type === 'dm');
    }
  }
}

module.exports = RankCommand;