const log = require('loglevel').getLogger('Silph'),
  Commando = require('discord.js-commando'),
  {MessageEmbed} = require('discord.js'),
  {CommandGroup} = require('../../app/constants'),
  fetch = require('node-fetch'),
  cheerio = require('cheerio'),
  Party = require('../../app/party'),
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

  titleCase(str) {
    return str.toLowerCase().split(' ').map(function (word) {
      return word.replace(word[0], word[0].toUpperCase());
    }).join(' ');
  }

  parseCounterType(val, message, arg, type) {
    let isValid = message.client.registry.types.get(type).validate(val, message, arg);
    if (isValid === true) {
      return message.client.registry.types.get(type).parse(val, message, arg);
    } else {
      return false;
    }
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

  async run(message, args) {
    let partyPresets = Party.parsePartyDetails(message),
      boss = !!partyPresets.boss ? this.parseCounterType(partyPresets.boss, message, args, 'counterpokemontype') : '';

    if (!boss) boss = this.parseCounterType(message.argString.trim(), message, args, 'counterpokemontype');
    if (!boss) boss = await this.collectParameter(message, 'what raid boss would you like to battle against?\n', 'counterpokemontype');
    if (!boss) return;

    let bossName = this.titleCase(boss.pbName.replace(/_/g, ' '));

    let bossUrl = 'https://thesilphroad.com/raid-bosses';

    let $ = await fetch(bossUrl)
      .then(res => res.text())
      .then(body => cheerio.load(body))
      .catch(err => log.error(err));

    let silphBoss,
      silphStyle,
      silphSlug,
      silphPokemon,
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

    let that = this;
    $('.raid-boss-tiers-wrap').children().each(function () {
      $(this).find('.raid-boss-tier').each(function () {
        silphBoss = $(this).find('.pokemonOption');
        silphStyle = silphBoss.attr('style');
        if (!!silphStyle) {
          silphSlug = silphBoss.attr('data-pokemon-slug');
          silphPokemon = that.parseCounterType(silphSlug.replace(/-/g, ' '), message, '', 'counterpokemontype');
          if (!!silphPokemon && silphPokemon.pbName === boss.pbName) {
            $(this).find('.hexagons').children().each(function () {
              howManyArr.push(parseInt($(this).attr('class').match(/difficulty(\d+)/)[1]));
            });
          }
        }
      })
    });

    if (!howManyArr.length) {
      let response = message.channel.send(`${message.author}, ${bossName} is not an active raid boss.`)
        .catch(err => log.error(err));
      response.preserve = true;
      return;
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
    let difficultySpread = [...new Set(howManyData.filter(x => x.difficultyNumber > 0).map(x => x.difficultyNumber))];
    // let recommendedTrainers = Math.min(...howManyData.filter(x => x.difficultyNumber == 5).map(x => x.trainers));

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

      minTrainers = Math.min(...howManyData.filter(x => x.difficultyNumber === difficultyNumber).map(x => x.trainers)).toString();
      maxTrainers = Math.max(...howManyData.filter(x => x.difficultyNumber === difficultyNumber).map(x => x.trainers)).toString();

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
      .setAuthor('Data provided by The Silph Road')
      .setURL('https://thesilphroad.com/research-tasks')
      .setColor('#43B581')
      .addField(`In order to beat ${bossName}, you need the following # of trainers:`, content)
      .setThumbnail(boss.imageURL);

    if (message.channel.type !== 'dm') {
      embed.setFooter(`Requested by ${message.member.displayName}`, message.author.displayAvatarURL());
    }

    await message.channel.send(`\`${message.client.commandPrefix}howmany\ ${bossName}\``, embed)
      .catch(err => log.error(err));
  }

}

module.exports = HowManyCommand;