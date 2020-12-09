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
        type: 'rankpokemon',
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
      case 'master-evo':
      case 'masterevo':
        this.cpLeague = 9001;
        break;
      case 'ultra':
      case 'ultra-evo':
      case 'ultraevo':
        this.cpLeague = 2500;
        break;
      case 'little':
        this.cpLeague = 500;
        break;
      default:
        this.cpLeague = 1500;
    }

    if (typeof (inputFilter[0]) === 'string') {
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

    this.commandName = this.pokemon.name.indexOf(' ') !== -1 ?
      `"${this.pokemon.name}"` :
      this.pokemon.name;

    let familyList;
    if (this.command.endsWith('evo')) {
      familyList = Pokemon.getFamily(this.pokemon)
        .filter(poke => !!poke.stats);
    } else {
      familyList = [this.pokemon];
    }
    this.familyList = familyList;

    if (parseInt(this.inputAttackIV) < this.ivFilter || parseInt(this.inputDefenseIV) < this.ivFilter || parseInt(this.inputStaminaIV) < this.ivFilter) {
      this.embedErrorMessage = `IV outside of filter range. __**Minimum IV: ${this.ivFilter}**__`;
    }
  }

  generateRanks(levelCap) {
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
        cp,
        rawAttack,
        rawDefense,
        rawStamina;

      let baseAttack = this.familyList[i].stats.baseAttack,
        baseDefense = this.familyList[i].stats.baseDefense,
        baseStamina = this.familyList[i].stats.baseStamina;
      // insert the cpm data to iterate on
      const cpmData = Pokemon.getCPTable(levelCap);

      // Iterates through each of the 4096 IV combinations (0-15).
      // Then starting at level 40, calculate the CP of the Pokemon at that IV.
      // If it is larger than the league cap, go down to the next half-level. Repeat until CP is lower than cap.
      // If it is less than the league cap, add to the IV list and stop calculating. Start at level 40 with new IV combination.
      // The best will always bep the highest level under the cap for a given IV.
      for (let attackIV = this.ivFilter; attackIV <= 15; attackIV++) {
        for (let defenseIV = this.ivFilter; defenseIV <= 15; defenseIV++) {
          for (let staminaIV = this.ivFilter; staminaIV <= 15; staminaIV++) {
            for (const {level, cpmMultiplier} of cpmData) {
              cp = Pokemon.calculateCP(this.familyList[i], level, attackIV, defenseIV, staminaIV, true);
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
                  level: parseFloat(level),
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

      const rankData = ivArr
        .filter(x => x.atkIv === this.inputAttackIV && x.defIv === this.inputDefenseIV && x.staIv === this.inputStaminaIV)[0];

      if (!rankData) {
        this.embedName = this.pokemon.gsName[0];
        return;
      }
      ``
      if (!this.familyList[i].data) {
        this.familyList[i].data = Object.create({});
      }

      this.familyList[i].data[`${levelCap}`] = Object.create({});

      this.familyList[i].data[`${levelCap}`].rank = rankData.rank;
      this.familyList[i].data[`${levelCap}`].level = rankData.level;
      this.familyList[i].data[`${levelCap}`].cp = rankData.cp;
      this.familyList[i].data[`${levelCap}`].atk = Math.round(rankData.rawAtk * 10) / 10;
      this.familyList[i].data[`${levelCap}`].def = Math.round(rankData.rawDef * 10) / 10;
      this.familyList[i].data[`${levelCap}`].sta = Math.round(rankData.rawSta * 10) / 10;
      this.familyList[i].data[`${levelCap}`].statproduct = rankData.statProduct;
      this.familyList[i].data[`${levelCap}`].pctMaxStatProduct = rankData.pctMaxStatProduct;
      this.familyList[i].data[`${levelCap}`].pctMaxStatProductStr = rankData.pctMaxStatProduct.toFixed(2).toString() + "%";

      //These z-values are the values associated with the Rank 1 IV combination. These 9 values are only ones that matter.
      this.familyList[i].data[`${levelCap}`].zrank = ivArr[0].rank;
      this.familyList[i].data[`${levelCap}`].zlevel = ivArr[0].level;
      this.familyList[i].data[`${levelCap}`].zcp = ivArr[0].cp;
      this.familyList[i].data[`${levelCap}`].zatk = Math.round(ivArr[0].rawAtk * 10) / 10;
      this.familyList[i].data[`${levelCap}`].zdef = Math.round(ivArr[0].rawDef * 10) / 10;
      this.familyList[i].data[`${levelCap}`].zsta = Math.round(ivArr[0].rawSta * 10) / 10;
      this.familyList[i].data[`${levelCap}`].zatkiv = ivArr[0].atkIv;
      this.familyList[i].data[`${levelCap}`].zdefiv = ivArr[0].defIv;
      this.familyList[i].data[`${levelCap}`].zstaiv = ivArr[0].staIv;
    }

    //Sort list of ranked pokemon. Highest rank gets index 0.
    this.familyList.sort((a, b) => {
      if ((b.data[`${levelCap}`].cp - a.data[`${levelCap}`].cp) > 300) return 1;
      if ((a.data[`${levelCap}`].cp - b.data[`${levelCap}`].cp) > 300) return -1;

      if (a.data[`${levelCap}`].rank > b.data[`${levelCap}`].rank) return 1;
      if (a.data[`${levelCap}`].rank < b.data[`${levelCap}`].rank) return -1;

      return 0;
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
        return '#ffd700';
      } else if (statProductPercent < 99 && statProductPercent >= 97) {
        return '#c0c0c0';
      } else if (statProductPercent < 97 && statProductPercent >= 95) {
        return '#cd7f32';
      } else {
        return '#30839f';
      }
    }

    let league;

    switch (command) {
      case 'rank':
      case 'great':
      case 'great-evo':
      case 'greatevo': {
        league = 'GREAT LEAGUE';
        break;
      }

      case 'ultra':
      case 'ultra-evo':
      case  'ultraevo': {
        league = 'ULTRA LEAGUE';
        break;
      }

      case 'master':
      case 'masterevo':
      case 'master-evo': {
        league = 'MASTER LEAGUE';
        break;
      }

      case 'little': {
        league = 'LITTLE CUP';
        break;
      }

      default: {
        league = command.toUpperCase() + ' LEAGUE';
      }
    }

    let embed;

    if (!this.embedErrorMessage) { //If no error message was found.
      const rankOutOf = this.ivFilter > 0 ? `/${Math.pow((16 - this.ivFilter), 3).toString()}` : ''; //If there is a filter, then give a Rank/HowMany. Otherwise, blank variable.
      const displayBothRanks = this.familyList[0].data['51'].zlevel !== this.familyList[0].data['40'].zlevel ||
        this.familyList[0].data['51'].rank !== this.familyList[0].data['40'].rank;

      let requestInfo = `\n**[${league}](${this.familyList[0].gsUrl})\n` +
        (displayBothRanks ? '__All Levels__\n' : '') +
        `Rank**: ${this.familyList[0].data['51'].rank}${rankOutOf}` +
        ` (${this.familyList[0].data['51'].pctMaxStatProductStr})\n` +
        `**CP**: ${this.familyList[0].data['51'].cp} @ Level ${this.familyList[0].data['51'].level}\n`;

      if (this.ivFilterCommand === "stats" && this.familyList.length === 1) {
        requestInfo += `**:crossed_swords: ${this.familyList[0].data['51'].atk} :shield: ${this.familyList[0].data['51'].def} :heart: ${this.familyList[0].data['51'].sta}**\n`;
        requestInfo += `\n**:trophy: #1:** ${this.familyList[0].data['51'].zatkiv}/${this.familyList[0].data['51'].zdefiv}/${this.familyList[0].data['51'].zstaiv} **|**`;
        requestInfo += ` ${this.familyList[0].data['51'].zcp}CP @ Level ${this.familyList[0].data['51'].zlevel}\n**:crossed_swords: ${this.familyList[0].data['51'].zatk}` +
          ` :shield: ${this.familyList[0].data['51'].zdef} :heart: ${this.familyList[0].data['51'].zsta}**\n`;
      }
      if (this.ivFilterCommand === "top") {
        requestInfo += `\n**:trophy: **#1: ${this.familyList[0].data['51'].zatkiv}/${this.familyList[0].data['51'].zdefiv}/${this.familyList[0].data['51'].zstaiv} **|** ` +
          `${this.familyList[0].data['51'].zcp}CP @ Level ${this.familyList[0].data['51'].zlevel}\n`;
      }

      if (displayBothRanks) {
        requestInfo += '\n**__Level 40 Cap__\n' +
          `Rank**: ${this.familyList[0].data['40'].rank}${rankOutOf}` +
          ` (${this.familyList[0].data['40'].pctMaxStatProductStr})\n` +
          `**CP**: ${this.familyList[0].data['40'].cp} @ Level ${this.familyList[0].data['40'].level}\n`;

        if (this.ivFilterCommand === "stats" && this.familyList.length === 1) {
          requestInfo += `**:crossed_swords: ${this.familyList[0].data['40'].atk} :shield: ${this.familyList[0].data['40'].def} :heart: ${this.familyList[0].data['40'].sta}**`;
          requestInfo += `\n\n**:trophy: #1:** ${this.familyList[0].data['40'].zatkiv}/${this.familyList[0].data['40'].zdefiv}/${this.familyList[0].data['40'].zstaiv} **|**`;
          requestInfo += ` ${this.familyList[0].data['40'].zcp}CP @ Level ${this.familyList[0].data['40'].zlevel}\n**:crossed_swords: ${this.familyList[0].data['40'].zatk}` +
            ` :shield: ${this.familyList[0].data['40'].zdef} :heart: ${this.familyList[0].data['40'].zsta}**\n`;
        }
        if (this.ivFilterCommand === "top") {
          requestInfo += `\n**:trophy: **#1: ${this.familyList[0].data['40'].zatkiv}/${this.familyList[0].data['40'].zdefiv}/${this.familyList[0].data['40'].zstaiv} **|** ` +
            `${this.familyList[0].data['40'].zcp}CP @ Level ${this.familyList[0].data['40'].zlevel}\n`;
        }
      }

      let requestInfo2 = [];
      let requestInfo2Index = 0;
      for (let i = 1; i < this.familyList.length; i++) {
        const displayBothFamilyRanks = (this.familyList[i].data['51'].zlevel !== this.familyList[i].data['40'].zlevel &&
          this.familyList[i].data['51'].rank !== this.familyList[i].data['40'].rank) ||
          this.familyList[i].data['51'].cp !== this.familyList[i].data['40'].cp,
          familyInfoLine = `**[${this.familyList[i].gsName[0].titleCase()}](${this.familyList[i].gsUrl})**` +
            `   Rank: ${this.familyList[i].data['51'].rank} | ${this.familyList[i].data['51'].cp}CP @ L${this.familyList[i].data['51'].level}\n` +
            (displayBothFamilyRanks ?
              `**[${this.familyList[i].gsName[0].titleCase()}](${this.familyList[i].gsUrl})**` +
              `   Rank: ${this.familyList[i].data['40'].rank} | ${this.familyList[i].data['40'].cp}CP @ L${this.familyList[i].data['40'].level}\n` :
              '');
        if (!requestInfo2[requestInfo2Index]) {
          requestInfo2.push('');
        }

        if (requestInfo2[requestInfo2Index].length + familyInfoLine.length > 1024) {
          requestInfo2Index++;
          requestInfo2.push('');
        }

        requestInfo2[requestInfo2Index] += familyInfoLine;
      }

      if (this.ivFilterDescription && this.ivFilter > 0) {
        //Add filter line to requestInfo if a filter exists.
        requestInfo += `**Filter**: ${this.ivFilterDescription}\n`;
      }

      const nameField = `**${this.embedName.replace(/_/g, ' ').titleCase()}**  ${this.inputAttackIV}/${this.inputDefenseIV}/${this.inputStaminaIV}\n`; //nameField is pokemon name & IVs.

      embed = new MessageEmbed()
        .setColor(embedColor(this.familyList[0].data['51'].pctMaxStatProduct))
        .addField(nameField, requestInfo)
        .setThumbnail(this.familyList[0].url);

      if (!!requestInfo2) {
        let first = true;

        for (const requestInfoField of requestInfo2) {
          embed.addField(`${first ? '\n' : ''}__**Family Ranks**__${!first ? ' (continued)' : ''}`, requestInfoField);
          first = false;
        }
      }

      if (!isDM) {
        embed.setFooter(`Requested by ${message.member.displayName}`, message.author.displayAvatarURL());
      }
    } else { //If rank was not found. This is due to an IV request outside of the allowed IVs per the IV filter. (Asking for rank of IV: 5 from a raid boss when minimum is 10)
      const nameField = `**${this.embedName.replace(/_/g, ' ').titleCase()}**  ${this.inputAttackIV}/${this.inputDefenseIV}/${this.inputStaminaIV}\n`; //nameField is pokemon name & IVs.
      const requestInfo = `\n**[${league} LEAGUE](${this.gsUrl})\nRank**:   *Not Found*\n**CP**: *Not Found*\n**Error**: ${this.embedErrorMessage}`;
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
      aliases: ['great', 'ultra', 'master', 'master-evo', `great-evo`, `ultra-evo`, 'little'],
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
        .match(`\\${message.client.options.commandPrefix}?(\\s+)?(\\S+)`)[2],
      rankData = new PvPRankingData(userCommand, args, message.client);
    await rankData.getUserRequest(message, userCommand);
    await rankData.generateRanks(51);
    await rankData.generateRanks(40);
    await rankData.displayInfo(message, userCommand, message.channel.type === 'dm');
  }
}

module.exports = RankCommand;