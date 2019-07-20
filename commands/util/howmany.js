const log = require('loglevel').getLogger('HowManyCommand'),
  Commando = require('discord.js-commando'),
  {MessageEmbed} = require('discord.js'),
  {CommandGroup} = require('../../app/constants'),
  cheerio = require('cheerio'),
  fetch = require('node-fetch'),
  Party = require('../../app/party-manager'),
  Utility = require('../../app/utility');

class HowManyCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'howmany',
      group: CommandGroup.UTIL,
      memberName: 'howmany',
      aliases: ['many', 'how-many'],
      description: 'Scrapes The Silph Road raid bosses page for their Pokebattler estimates per counter tiers.',
      details: 'Use this command to get an estimate of approximately how many trainers you need to defeat a raid boss based on your counter levels.',
      examples: ['!howmany'],
      guarded: false,
      argsPromptLimit: 3,
    });

    this.protect = false;
  }

  async run(message, args) {
    String.prototype.titleCase = function () {
      return this.replace(/\w\S*/g, function (str) {
        return str.charAt(0).toUpperCase() + str.substr(1).toLowerCase();
      });
    };

    if (message.channel.type === 'dm') {
      message.channel.send('This command is not supported in DMs.')
        .catch(err => log.error(err));
      return;
    }

    let raid = Party.getParty(message.channel.id);

    let pokemon;
    if (!!raid && !!raid.pokemon && !!raid.pokemon.name && raid.pokemon.name !== 'pokemon') {
      pokemon = raid.pokemon;
    } else {
      let pokemonCollector = new Commando.ArgumentCollector(message.client, [
        {
          key: 'pokemon',
          prompt: 'What raid boss would you like to battle against?\n',
          type: 'pokemon'
        }
      ], 3);

      await pokemonCollector.obtain(message)
        .then(collectionResult => {
          if (!collectionResult.cancelled) {
            pokemon = collectionResult.values.pokemon;
          } else {
            Utility.cleanCollector(collectionResult);
          }
        })
        .catch(err => log.error(err));
      if (!pokemon) {
        await message.delete();
        return;
      }

      if (!pokemon.name) {
        let response = message.channel.send(`${message.author}, please try again and enter a Pokémon name.`)
          .catch(err => log.error(err));
        response.preserve = true;
        return;
      }
    }

    let pokemonNumber = pokemon.number,
      pokemonName = pokemon.name.toLowerCase().replace(/[^0-9a-z]/gi, '');

    let alolanFlag;
    if (pokemonName.includes('alolan')) {
      alolanFlag = true; // flag because exeggutor and alolan exeggutor have been bosses at the same time
      pokemonName = pokemonName.replace('alolan', '').trim() + 'alola'; // format 'properly' for silph to read
    } else if (pokemonName === 'armoredmewtwo') {
      pokemonName = 'mewtwoarmor' // because override name doesn't match game master
    }


    let url = 'https://thesilphroad.com/raid-bosses';

    let $ = await fetch(url)
      .then(res => res.text())
      .then(body => cheerio.load(body))
      .catch(err => log.error(err));

    let silphBoss,
      silphStyle,
      silphSlug,
      numberMatch,
      silphName,
      silphNumber,
      silphImageUrl,
      howManyArr = [],
      howManyMap = [
        'IMPOSSIBLE - can\'t be done',
        'HARDCORE - technically possible, leave to experts',
        'HARD - any of top 3 counters, Pokémon level 35',
        'MEDIUM - any of top 6 counters, Pokémon level 30',
        'EASY - any of top 12 counters, Pokémon level 25',
        'VERY EASY - any of top 24 counters, Pokémon level 20',
        'SPLIT UP! - too many, split in half'
      ];

    $('.raid-boss-tiers-wrap').children().each(function () {
      $(this).find('.raid-boss-tier').each(function () {
        silphBoss = $(this).find('.pokemonOption');
        silphStyle = silphBoss.attr('style');
        if (!!silphStyle) {
          numberMatch = silphStyle.match(/background-image:url.+\/(\d+)\.png.+/);
          if (!!numberMatch && !alolanFlag) {
            silphNumber = parseInt(numberMatch[1]);
            silphSlug = '';
          } else {
            // fall back to the slug name if there's a non-standard sprite used, like "Armored Mewtwo" or "Deoxys Speed"
            silphNumber = 0;
            silphSlug = silphBoss.attr('data-pokemon-slug');
            if (!!silphSlug) {
              silphSlug = silphSlug.toLowerCase().replace(/[^0-9a-z]/gi, '');
            } else {
              silphSlug = '';
            }
          }

          if (silphNumber === pokemonNumber || silphSlug.includes(pokemonName)) {
            $(this).find('.hexagons').children().each(function () {
              howManyArr.push(parseInt($(this).attr('class').match(/difficulty(\d+)/)[1]));
            });
            silphName = $(this).find('.boss-name').text();
            silphImageUrl = silphStyle.match(/background-image:url\((.+?)\)/)[1];
          }
        }
      })
    });

    if (!howManyArr.length) {
      let response = message.channel.send(`${message.author}, ${pokemon.name.titleCase()} is not an active raid boss.`)
        .catch(err => log.error(err));
      response.preserve = true;
      return
    }

    let howManyData = [
      {trainers: 1},
      {trainers: 2},
      {trainers: 3},
      {trainers: 4},
      {trainers: 5},
      {trainers: 6},
      {trainers: 7},
      {trainers: 8}
    ];

    howManyData.map((val, idx) => {
      val.difficultyNumber = howManyArr[idx];
      val.difficultyName = howManyMap[howManyArr[idx]];
    });

    // min value is 0 (impossible), max value is 6 (split up)
    let difficultySpread = [...new Set(howManyData
      .filter(x => x.difficultyNumber > 0)
      .map(x => x.difficultyNumber))];

    let content = [],
      difficultyNumber,
      difficultyName,
      minTrainers,
      maxTrainers,
      trainerStr,
      contentStr;

    for (let i = 0; i < difficultySpread.length; i++) {
      difficultyNumber = difficultySpread[i];
      difficultyName = howManyData.filter(x => x.difficultyNumber === difficultyNumber)[0].difficultyName;

      minTrainers = Math.min(...howManyData
        .filter(x => x.difficultyNumber === difficultyNumber)
        .map(x => x.trainers)).toString();
      maxTrainers = Math.max(...howManyData
        .filter(x => x.difficultyNumber === difficultyNumber)
        .map(x => x.trainers)).toString();

      if (i + 1 === difficultySpread.length) { // last element
        trainerStr = minTrainers + '+';
      } else if (minTrainers !== maxTrainers) {
        trainerStr = minTrainers + '-' + maxTrainers;
      } else {
        trainerStr = minTrainers;
      }

      contentStr = '**' + trainerStr + '**: ' + difficultyName;
      content.push(contentStr);
    }

    content.push(`\nTo check the top counters, type \`${message.client.commandPrefix}counters\` and follow the prompts.`);

    const embed = new MessageEmbed()
      .setColor('#43B581')
      .addField(`In order to beat ${silphName}, you need the following # of trainers:`, content)
      .setThumbnail(silphImageUrl)
      .setFooter('Data retrieved from https://thesilphroad.com/raid-bosses.');

    let response = await message.channel.send(`${message.author}, here are your \`${message.client.commandPrefix}howmany\` results:`, embed)
      .catch(err => log.error(err));
    response.preserve = true;

    await message.delete()
      .catch(err => log.error(err));
  }

}

module.exports = HowManyCommand;
