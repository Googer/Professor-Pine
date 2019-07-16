const log = require('loglevel').getLogger('Counters'),
  Commando = require('discord.js-commando'),
  {MessageEmbed} = require('discord.js'),
  {CommandGroup} = require('../../app/constants'),
  fetch = require('node-fetch'),
  cheerio = require('cheerio'),
  Utility = require('../../app/utility');

class PvPRankingData {
  constructor(pokemon, league, atk, def, sta, filter){
    this.inputPokemon = pokemon;
    this.inputLeague = league;
    this.inputATKiv = atk;
    this.inputDEFiv = def;
    this.inputSTAiv = sta;
    if(typeof(filter) == 'undefined'){
      this.inputFilter = "0";
    }
    else{
      this.inputFilter = filter;
    }
  }

  async scrape(){
    String.prototype.titleCase = function () {
      return this.replace(/\w\S*/g, function(str) {return str.charAt(0).toUpperCase() + str.substr(1).toLowerCase();});
    };
    this.cpLeague;
    let ivFilter;
    if(this.inputLeague == 'ultra'){
      this.cpLeague = "2500";
    }
    else {
      this.cpLeague = "1500";
    }
    if(this.inputFilter != "10"){
     ivFilter = "0"
    }
    this.url =
    `https://gostadium.club/pvp/iv?pokemon=${this.inputPokemon}` +
    `&max_cp=${this.cpLeague}` +
    `&min_iv=${ivFilter}` +
    `&att_iv=${this.inputATKiv}` +
    `&def_iv=${this.inputDEFiv}` +
    `&sta_iv=${this.inputSTAiv}`;

    let $ = await fetch(this.url)
      .then(res => res.text())
      .then(body => cheerio.load(body))
      .catch(err => log.error(err));
    let ivScrapeData = [];
    let siteData;
    $("tr[class^=\"table-\"]").children().each(function(){
      siteData = $(this).text();
      ivScrapeData.push(siteData);
      //console.log(typeof(siteData), siteData)
    })
    console.log(typeof(this.inputPokemon), this.inputPokemon.pbName),
    this.name = this.inputPokemon.titleCase();
    this.rank = ivScrapeData[0];
    this.level = ivScrapeData[1];
    this.cp = ivScrapeData[3];
    this.atk = ivScrapeData[4];
    this.def = ivScrapeData[5];
    this.sta = ivScrapeData[6];
    this.statproduct = ivScrapeData[8];
  }

  async displayInfo(message,args,command){
    String.prototype.titleCase = function () {
      return this.replace(/\w\S*/g, function(str) {return str.charAt(0).toUpperCase() + str.substr(1).toLowerCase();});
    };

    let league = '';
    if(command == 'rank'){
      league = 'GREAT';
    }
    else{
      league = command.toUpperCase();
    }
    let requestInfo = `\n**${league} LEAGUE\nRank**: ${this.rank} (${this.statproduct})\n` +
    `**CP**: ${this.cp} @ Level ${this.level}\n`;
    let nameField = `**${args['pvp_pokemon'].pbName.titleCase()}**  ${this.inputATKiv}/${this.inputDEFiv}/${this.inputSTAiv}\n`; 
    const embed = new MessageEmbed()
    .setColor('#43B581')
    .addField(nameField, requestInfo)
    .setThumbnail(args['pvp_pokemon'].imageURL)
    .setFooter(`${message.author.username} || Data retrieved from https://gostadium.club`);

    let userCommand = `${message.client.commandPrefix}${command}`; //Grabs the !great, !ultra or w/e from user inputs.
    let userPokemon = `${args['pvp_pokemon'].pbName.titleCase()}`; //Grabs the accepted pokemon name.
    let userIVString = `${this.inputATKiv} ${this.inputDEFiv} ${this.inputSTAiv}`; //Grabs the accepted IV sets (0-15 for ATK,DEF,STA)
    let responseCommand = `${message.author}, here are your \`${userCommand} ${userPokemon} ${userIVString}\` results:`; //Combined the above into the whole accepted command.
    let response = await message.channel.send(responseCommand, embed);
    response.preserve = true;
  }
}
  class RankCommand extends Commando.Command {
    constructor(client) {
    super(client, {
      name: 'rank',
      group: CommandGroup.UTIL,
      memberName: 'rank',
      aliases: [/*'pvp-rank', 'pvp-iv', */'great', 'ultra'], //Aliases are other user commands that call this command file
      description: 'Provides PvP data based on a pokemon species\'s IVs, including rank and CP.', //Help info
      details: 'Use this command in #rank-checker to obtain information on the PvP ranking of a specific IV combination for a specific species of pokemon.' +
          '\n!great - This command restricts results to **Great League**\n!ultra - This command restricts results to **Ultra League**', //Help info
      examples: ['!<league> <pokemon> <Attack IV> <Defense IV> <Stamina IV>\n!great altaria 4 1 2\n!ultra blastoise 10 14 15\n'], //Help info
      guarded: false, //????
      args: [
        {
          key: 'pvp_pokemon', //Variable pokemon is the first entry in the command
          prompt: 'Which species of pokemon would you like to evaluate a specific IV combination PvP rank for?',
          type: 'counterpokemontype', //Ensures that the entered information is a pokemon name.
        },
        {
          key: 'ATK_IV',
          prompt: 'Attack IV?',
          type: 'integer',
          min: 0,
          max: 15,
        },
        {
          key: 'DEF_IV',
          prompt: 'Defense IV?',
          type: 'integer',
          min: 0,
          max: 15,
        },
        {
          key: 'STA_IV',
          prompt: 'Stamina IV?',
          type: 'integer',
          min: 0,
          max: 15, //Can we add additional args for optional additional parameters for specific searches? For example, minimum IV
        },],
      argsPromptLimit: 3, //What is this?
    });
  }

  async run(message, args) {

    String.prototype.titleCase = function () {
      return this.replace(/\w\S*/g, function(str) {return str.charAt(0).toUpperCase() + str.substr(1).toLowerCase();});
    };

    let userCommand = message.content.match(RegExp(`^\\s*${message.client.commandPrefix}\\s*(\\S+)\\s*`))[1].toLowerCase();
    if(userCommand == 'great' || userCommand == 'rank'){
      let greatRank = new PvPRankingData(args['pvp_pokemon'].pbName,'great',args['ATK_IV'],args['DEF_IV'],args['STA_IV']);
      await greatRank.scrape();
      await greatRank.displayInfo(message,args,userCommand);
    }
    else if(userCommand == 'ultra'){
      let ultraRank = new PvPRankingData(args['pvp_pokemon'].pbName,'ultra',args['ATK_IV'],args['DEF_IV'],args['STA_IV']);
      await ultraRank.scrape();
      await ultraRank.displayInfo(message,args,userCommand);
    }
  }
}

module.exports = RankCommand;