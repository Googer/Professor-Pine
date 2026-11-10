import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { readResearchPage } from '../../../test/support/research.js';
import { readEventPage } from '../../../test/support/spawn-events.js';
import {
  eventPageTime,
  htmlText,
  maxHourHeadings,
  parseEventMaxHours,
  parseEventRaidHours,
  parseEventSpawns,
  parseResearchPage,
  raidHourHeadings,
} from './leekduck.js';
import { taskKeyOf } from './task.js';

const ZONE = 'America/New_York';

describe('parseResearchPage', () => {
  const parsed = parseResearchPage(readResearchPage(), catalogueFixture(), ZONE);
  const task = (text: string) => parsed.tasks.find((one) => one.key === taskKeyOf(text));

  it('reads the 58 tasks of the page of 2026-10-21 in its 8 categories, and no breakthrough', () => {
    expect(parsed.tasks).toHaveLength(58);
    expect([...new Set(parsed.tasks.map((one) => one.category))]).toEqual([
      'Catching',
      'Throwing',
      'Battling',
      'Exploring',
      'Training',
      'Buddy & Friendship',
      'Team GO Rocket',
      'Sponsored',
    ]);
    expect(parsed.skipped).toBe(0);
    expect(parsed.tasks.reduce((n, one) => n + one.rewards.length, 0)).toBe(299);
  });

  it('reads an encounter with its catalogue entry, shiny mark and CP range', () => {
    expect(task('Catch 7 Pokémon')?.rewards).toEqual([
      {
        kind: 'encounter',
        name: 'Magikarp',
        key: 'magikarp',
        dex: 129,
        shiny: true,
        cp: { min: 99, max: 117 },
        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png',
      },
      expect.objectContaining({ name: 'Stufful', dex: 759 }),
      expect.objectContaining({ name: 'Wimpod', dex: 767 }),
    ]);
  });

  it('reads items with their quantity and a key, and Mega Energy with its species', () => {
    const dragon = task('Catch a Dragon-type Pokémon');
    expect(dragon?.rewards.map((reward) => reward.name)).toEqual([
      'Dratini',
      'Bagon',
      'Axew',
      'Golden Razz Berry',
      'Rare Candy',
      'Stardust',
      'Ultra Ball',
    ]);
    expect(dragon?.rewards[3]).toEqual({
      kind: 'item',
      item: 'golden-razz-berry',
      name: 'Golden Razz Berry',
      quantity: 2,
      image: 'https://cdn.leekduck.com/assets/img/items/Golden%20Razz%20Berry.png',
    });
    expect(dragon?.rewards[5]).toMatchObject({ item: 'stardust', quantity: 1500 });
    const energy = parsed.tasks
      .flatMap((one) => one.rewards)
      .find((reward) => reward.kind === 'energy' && reward.name === 'Sceptile Mega Energy');
    expect(energy).toEqual({
      kind: 'energy',
      dex: 254,
      name: 'Sceptile Mega Energy',
      quantity: 10,
      image: 'https://cdn.leekduck.com/assets/img/mega_energy/Sceptile%20Mega%20Energy.png',
    });
  });

  it('reads a regional form as its form', () => {
    const alolan = parsed.tasks
      .flatMap((one) => one.rewards)
      .find((reward) => reward.name === 'Alolan Exeggutor');
    expect(alolan).toMatchObject({ key: 'exeggutor_alola', dex: 103 });
  });

  it('names the encounters the game data does not know, and reads them all the same', () => {
    expect(parsed.unknown).toEqual([]);
  });

  it('refuses a page without a task, and makes one task of a text listed twice', () => {
    expect(() => parseResearchPage('<html>Not found</html>', catalogueFixture(), ZONE)).toThrow(
      'The research page lists no task',
    );
    const twice =
      '<div class="task-category"><h2>Catching Tasks</h2><ul class="task-list">' +
      '<li class="task-item"><span class="task-text"><span>Catch 7 Pok&eacute;mon</span></span>' +
      '<ul class="reward-list"><li class="reward" data-reward-type="item"><span class="reward-label">' +
      'Rare Candy <span>×3</span></span></li></ul></li>' +
      '<li class="task-item"><span class="task-text"><span>Catch 7 Pokémon</span></span>' +
      '<ul class="reward-list"><li class="reward" data-reward-type="item"><span class="reward-label">' +
      'Rare Candy <span>×3</span></span></li><li class="reward" data-reward-type="balloon"></li>' +
      '</ul></li></ul></div>';
    const read = parseResearchPage(twice, catalogueFixture(), ZONE);
    expect(read.tasks).toEqual([
      {
        key: taskKeyOf('Catch 7 Pokémon'),
        text: 'Catch 7 Pokémon',
        category: 'Catching',
        rewards: [
          { kind: 'item', item: 'rare-candy', name: 'Rare Candy', quantity: 3, image: null },
        ],
      },
    ]);
    expect(read.skipped).toBe(1);
  });

  // Matt, 2026-10-31. Leek Duck writes an event's end in its own zone's offset, the wall clock being
  // the event's local time: the feed of 2026-10-31 has Halloween Part I end 2026-11-01T10:00:00.000.
  describe("an event's end", () => {
    const task = (text: string) =>
      `<li class="task-item"><span class="task-text"><span>${text}</span></span></li>`;
    const section = (end: string | undefined, heading: string, text: string) =>
      `<div class="task-category event-field-research"${end === undefined ? '' : ` data-event-end="${end}"`}>` +
      `<h2>${heading} Tasks</h2>${task(text)}</div>`;
    const read = (page: string, zone = ZONE) => parseResearchPage(page, catalogueFixture(), zone);
    const NEW_YORK_TEN = Date.UTC(2026, 10, 1, 15);

    it('is read as the wall clock in the server’s zone, whatever offset the page gives', () => {
      const page = section('2026-11-01T10:00:00-0800', 'Halloween', 'Catch 8 Ghost-type Pokémon');
      expect(read(page).tasks[0]?.endsAt).toBe(NEW_YORK_TEN);
      expect(read(page, 'Europe/Warsaw').tasks[0]?.endsAt).toBe(Date.UTC(2026, 10, 1, 9));
      // In summer the page's offset is another; the event's local time is the same.
      const summer = section('2026-07-01T10:00:00-0700', 'Summer', 'Catch 8 Ghost-type Pokémon');
      expect(read(summer).tasks[0]?.endsAt).toBe(Date.UTC(2026, 6, 1, 14));
    });

    it('is that moment where the page says Z, which is no zone of Leek Duck’s', () => {
      const page = section('2026-11-01T18:00:00Z', 'Halloween', 'Catch 8 Ghost-type Pokémon');
      expect(read(page).tasks[0]?.endsAt).toBe(Date.UTC(2026, 10, 1, 18));
    });

    it('is none on a standing section, and no key on the task', () => {
      const [standing] = read(
        `<div class="task-category"><h2>Catching Tasks</h2>${task('Catch 7 Pokémon')}</div>`,
      ).tasks;
      expect(standing).toBeDefined();
      expect(standing).not.toHaveProperty('endsAt');
    });

    it('is none for a task a standing section lists too, either way round: it stays offered', () => {
      const event = section('2026-11-01T10:00:00-0800', 'Halloween', 'Catch 7 Pokémon');
      const standing = `<div class="task-category"><h2>Catching Tasks</h2>${task('Catch 7 Pokémon')}</div>`;
      expect(read(event + standing).tasks[0]).not.toHaveProperty('endsAt');
      expect(read(standing + event).tasks[0]).not.toHaveProperty('endsAt');
    });

    it('is the later one for a task two events list', () => {
      const first = section('2026-11-01T10:00:00-0800', 'Part I', 'Catch 7 Pokémon');
      const second = section('2026-11-05T20:00:00-0800', 'Part II', 'Catch 7 Pokémon');
      const later = Date.UTC(2026, 10, 6, 1);
      expect(read(first + second).tasks[0]?.endsAt).toBe(later);
      expect(read(second + first).tasks[0]?.endsAt).toBe(later);
    });

    it('is counted, and no end, where it cannot be read: the task stays offered', () => {
      const page = section('soon', 'Halloween', 'Catch 8 Ghost-type Pokémon');
      const parsed = read(page);
      expect(parsed.tasks[0]).not.toHaveProperty('endsAt');
      expect(parsed.unreadEnds).toBe(1);
      expect(read(section('2026-11-01T10:00:00-0800', 'A', 'Catch 7 Pokémon')).unreadEnds).toBe(0);
      // The attribute in another shape is no silent "never".
      const quoted =
        '<div class="task-category event-field-research" data-event-end=\'2026-11-01T10:00:00\'>' +
        `<h2>Halloween Tasks</h2>${task('Catch 7 Pokémon')}</div>`;
      expect(read(quoted).unreadEnds).toBe(1);
    });
  });

  it('reads an event’s section by the words of its class, and no class that only starts alike', () => {
    const task = (text: string) =>
      `<li class="task-item"><span class="task-text"><span>${text}</span></span></li>`;
    // The page of 2026-10-30: the event's section first, with a second class word and attributes.
    const page =
      '<div class="task-category event-field-research" style="--cat:#f39c12;" ' +
      'data-event-end="2026-11-01T10:00:00-0800"><h2>Pokémon GO Halloween 2026 Part I Tasks</h2>' +
      task('Catch 8 Ghost-type Pokémon') +
      '</div>' +
      // A name for the costume and a picture of its own, as Noibat's on the page.
      '<div class="task-category event-field-research"><h2>Costumes Tasks</h2>' +
      '<li class="task-item"><span class="task-text"><span>Win a raid</span></span><ul>' +
      '<li class="reward" data-reward-type="encounter"><img src="https://cdn.leekduck.com/assets/img/' +
      'pokemon_icons_crop/Headband Noibat.png" /><span class="reward-label"><span>Noibat wearing a ' +
      'headband</span></span></li></ul></li></div>' +
      '<div class="task-category" style="--cat:#27ae60;"><h2>Catching Tasks</h2>' +
      task('Catch 7 Pokémon') +
      '</div>' +
      // Not a section, though its class starts with those letters: it belongs to Catching.
      '<div class="task-category-note"><h2>Not a section</h2></div>' +
      task('Catch 9 Pokémon') +
      '<div class="event-field-research task-category"><h2>Words the other way Tasks</h2>' +
      task('Spin 3 PokéStops') +
      '</div>';
    const read = parseResearchPage(page, catalogueFixture(), ZONE);
    expect(read.tasks.map((one) => [one.category, one.text])).toEqual([
      ['Pokémon GO Halloween 2026 Part I', 'Catch 8 Ghost-type Pokémon'],
      ['Costumes', 'Win a raid'],
      ['Catching', 'Catch 7 Pokémon'],
      ['Catching', 'Catch 9 Pokémon'],
      ['Words the other way', 'Spin 3 PokéStops'],
    ]);
    expect(read.skipped).toBe(0);
    expect(read.unknown).toEqual([]);
    expect(read.tasks[1]?.rewards[0]).toMatchObject({
      name: 'Noibat wearing a headband',
      key: 'noibat',
      image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/Headband%20Noibat.png',
    });
  });

  it('counts the sections it cannot read, none on the pages Leek Duck serves', () => {
    const task = '<li class="task-item"><span class="task-text"><span>Catch</span></span></li>';
    const page =
      `<div class="task-category"><h2>Catching Tasks</h2>${task}</div>` +
      `<div id="x" class="task-category"><h2>Another Tasks</h2>${task}</div>` +
      `<div class='task-category event-field-research'><h2>Quoted Tasks</h2>${task}</div>` +
      // No section: the word is part of another, a class that only starts alike.
      '<div class="task-category-note"></div>';
    expect(parseResearchPage(page, catalogueFixture(), ZONE).unreadSections).toBe(2);
    expect(parsed.unreadSections).toBe(0);
  });

  it('keeps a plain and a costumed reward of one Pokémon in a task apart (plan 8R-4)', () => {
    const encounter = (name: string, picture: string) =>
      '<li class="reward" data-reward-type="encounter"><span class="reward-bubble encounter-reward">' +
      `<img class="reward-image" src="https://cdn.leekduck.com/assets/img/pokemon_icons_crop/${picture}" />` +
      `</span><span class="reward-label"><span>${name}</span></span></li>`;
    // The task listed twice: its rewards are merged, each once.
    const task = (...rewards: string[]) =>
      '<li class="task-item"><span class="task-text"><span>Spin 26 PokéStops or Gyms</span></span>' +
      `<ul class="reward-list">${rewards.join('')}</ul></li>`;
    const page =
      '<div class="task-category"><h2>Exploring Tasks</h2><ul class="task-list">' +
      task(encounter('Pikachu', 'pm25.icon.png')) +
      task(
        encounter('Pikachu wearing a Cosmog suit', 'pm25.fPXP_2026.icon.png'),
        encounter('Pikachu', 'pm25.icon.png'),
      ) +
      '</ul></div>';
    const [read] = parseResearchPage(page, catalogueFixture(), ZONE).tasks;
    expect(read?.rewards.map((reward) => [reward.name, 'key' in reward ? reward.key : ''])).toEqual(
      [
        ['Pikachu', 'pikachu'],
        ['Pikachu wearing a Cosmog suit', 'pikachu'],
      ],
    );
  });

  it('reads the Spawns section of an event page, and only it (plan 8R-4)', () => {
    const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
    const article =
      'https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-27-halloween-2026-part-1/';
    // Halloween 2026 Part I: the one-star raids' Pikachu and Sinistea are no spawns.
    expect(parseEventSpawns(readEventPage('leekduck-event-halloween-2026-part-1.html'))).toEqual([
      { name: 'Zubat wearing a top hat', image: `${article}zubat-top-hat.png` },
      { name: 'Duskull', image: `${crop}pokemon_icon_355_00.png` },
      {
        name: 'Piplup wearing a Halloween Mischief costume',
        image: `${crop}pm393.cHALLOWEEN_2021_NOEVOLVE.icon.png`,
      },
      // Named only in a sentence below the list (B-D2): "you might also encounter **Drifblim
      // wearing a Halloween Mischief costume**!".
      { name: 'Drifblim wearing a Halloween Mischief costume' },
    ]);
    expect(parseEventSpawns(readEventPage('leekduck-event-spotlight-2026-11-05.html'))).toEqual([
      {
        name: 'Teddiursa wearing a witch hat',
        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm216.cHALLOWEEN_2025.icon.png',
      },
    ]);
    expect(parseEventSpawns('<html><h2 id="raids">Raids</h2></html>')).toEqual([]);
    // A sentence's bold names count only where they say what is worn; another section's never.
    expect(
      parseEventSpawns(
        '<h2 id="spawns">Spawns</h2><p>Lucky trainers may encounter <b>Pikachu wearing a ' +
          'party hat</b> or <strong>Shiny Eevee</strong>, and <strong>Bulbasaur wearing ' +
          'a &amp; costume</strong>.</p><h2 id="raids">Raids</h2><p><strong>Mewtwo wearing ' +
          'armor</strong></p>',
      ),
    ).toEqual([{ name: 'Pikachu wearing a party hat' }, { name: 'Bulbasaur wearing a & costume' }]);
    // Only a sentence of a wild encounter (review C2): not eggs, raids or research, nor what no
    // longer appears.
    const spawnsOf = (paragraphs: string) =>
      parseEventSpawns(`<h2 id="spawns">Spawns</h2>${paragraphs}<h2 id="eggs">Eggs</h2>`);
    expect(
      spawnsOf(
        '<p>Hatch <b>Pikachu wearing a hat</b> from 2 km Eggs.</p>' +
          '<p>Field Research task encounters include <b>Eevee wearing a bow</b>.</p>' +
          '<p>Defeat <b>Gengar wearing a crown</b> in raids.</p>' +
          '<p><b>Zubat wearing a top hat</b> will no longer appear in the wild.</p>' +
          '<p>Some Pokémon appear more often in the wild, among them <b>Duskull wearing a ' +
          'scarf</b>.</p>',
      ),
    ).toEqual([{ name: 'Duskull wearing a scarf' }]);
    // At most 100 of a page's Pokémon (B4): no event lists more.
    const many = Array.from(
      { length: 150 },
      (_, i) => `<li class="pkmn-list-item"><div class="pkmn-name">Pokémon ${String(i)}</div></li>`,
    ).join('');
    const read = parseEventSpawns(`<h2 id="spawns">Spawns</h2><ul>${many}</ul>`);
    expect(read).toHaveLength(100);
    expect(read[99]).toEqual({ name: 'Pokémon 99' });
  });

  it('reads the sentences of the Spawns section with bounded work (review C3)', () => {
    const spawnsOf = (paragraphs: string) =>
      parseEventSpawns(`<h2 id="spawns">Spawns</h2>${paragraphs}`);
    // An unclosed paragraph ends where the next begins, as a browser reads it.
    expect(
      spawnsOf(
        '<p>You might encounter <b>Pikachu wearing a hat</b>' +
          '<p><b>Eevee wearing a bow</b> will no longer appear.</p>',
      ),
    ).toEqual([{ name: 'Pikachu wearing a hat' }]);
    // At most 4,000 characters of a paragraph and 50 paragraphs are read.
    expect(
      spawnsOf(`<p>You might encounter ${'x'.repeat(4_000)} <b>Pikachu wearing a hat</b>.</p>`),
    ).toEqual([]);
    const paragraphs = Array.from(
      { length: 60 },
      (_, i) => `<p>You might encounter <b>Pokémon ${String(i)} wearing a hat</b>.</p>`,
    ).join('');
    const read = spawnsOf(paragraphs);
    expect(read).toHaveLength(50);
    expect(read[49]).toEqual({ name: 'Pokémon 49 wearing a hat' });
  });

  // Fix round of 8Z-2: a bold name is found from its opening tag to the first close of that tag,
  // in one pass (the pattern before was quadratic on opening tags that are never closed).
  it('reads the bold names of a sentence in one pass over it', () => {
    const spawnsOf = (paragraph: string) =>
      parseEventSpawns(`<h2 id="spawns">Spawns</h2><p>You might encounter ${paragraph}</p>`);
    // A tag with attributes; an opening tag never closed before one that is; a line break,
    // which is no bold; the other tag's close, which ends nothing.
    expect(
      spawnsOf(
        '<b>Eevee wearing a bow <strong class="x">Pikachu wearing a hat</strong>, <br>' +
          '<b data-a="1">Zubat wearing a cape</strong> and a crown</b>.',
      ),
    ).toEqual([
      // Tags read as a space, as `htmlText` reads them.
      { name: 'Eevee wearing a bow Pikachu wearing a hat , Zubat wearing a cape and a crown' },
    ]);
    expect(spawnsOf('<b>Eevee <b>Pikachu wearing a hat</b> wearing a bow</b>')).toEqual([
      { name: 'Eevee Pikachu wearing a hat' },
    ]);
    // Opening tags by the hundreds that are never closed, then one that is: only that one.
    expect(spawnsOf(`${'<b>'.repeat(900)}<strong>Pikachu wearing a hat</strong>`)).toEqual([
      { name: 'Pikachu wearing a hat' },
    ]);
    // A tag of more than 200 characters is no tag of a name.
    expect(spawnsOf(`<b ${'x'.repeat(200)}>Pikachu wearing a hat</b>`)).toEqual([]);
    expect(spawnsOf(`<b ${'x'.repeat(198)}>Pikachu wearing a hat</b>`)).toEqual([
      { name: 'Pikachu wearing a hat' },
    ]);
  });

  it('reads text as it shows: tags out, entities read, controls and gaps one space', () => {
    expect(htmlText('<span>Buddy &amp; Friendship</span>  Tasks')).toBe('Buddy & Friendship Tasks');
    expect(htmlText('Farfetch&#39;d &#x2014;\u200B ok')).toBe("Farfetch'd — ok");
  });

  // Plan 8Z-2: the entities are looked up by a name the page chose.
  it('leaves a name every object has as the text it is', () => {
    const names = '&constructor; &toString; &valueOf; &__proto__; &isPrototypeOf;';
    expect(htmlText(names)).toBe(names);
    expect(htmlText('&AMP; &Eacute;')).toBe('& é');
  });
});

describe('parseEventRaidHours', () => {
  it('reads the Raid Hours of an event page’s Raids section with their bosses', () => {
    expect(parseEventRaidHours(readEventPage('leekduck-event-into-the-wild-2026.html'))).toEqual([
      { month: 11, day: 9, bosses: ['Zacian (Crowned Sword)'] },
      { month: 11, day: 10, bosses: ['Zamazenta (Crowned Shield)'] },
    ]);
    // Pages without any: no Raids section, or one without Raid Hours.
    expect(parseEventRaidHours(readEventPage('leekduck-event-halloween-2026-part-1.html'))).toEqual(
      [],
    );
    expect(parseEventRaidHours(readEventPage('leekduck-event-spotlight-2026-11-05.html'))).toEqual(
      [],
    );
  });

  it('reads a Raid Hour heading without a weekday, and "Raid Hours:", in the Raids section only', () => {
    const boss = (name: string) =>
      `<li class="pkmn-list-item"><div class="pkmn-name">${name}</div></li>`;
    const html =
      '<h2 id="spawns">Spawns</h2><h3>Raid Hour: Monday, March 2</h3><ul>' +
      boss('Pidgey') +
      '</ul><h2 id="raids" class="event-section-header raids">Raids</h2>' +
      `<h3 id="raid-hour-march-3">Raid Hour: March 3</h3><ul>${boss('Dialga')}</ul>` +
      `<hr /><h3>Raid Hours: Wed, Mar. 4</h3><ul>${boss('Palkia')}${boss('Giratina')}</ul>` +
      `<h3>Raid Hour: Thursday, March 5</h3><p>Nothing listed.</p>` +
      `<h3 id="five-star-raids">Five-Star Raids</h3><ul>${boss('Kyogre')}</ul>` +
      `<h2 id="max-battles">Max Battles</h2><h3>Raid Hour: Friday, March 6</h3><ul>${boss('Groudon')}</ul>`;
    expect(parseEventRaidHours(html)).toEqual([
      { month: 3, day: 3, bosses: ['Dialga'] },
      { month: 3, day: 4, bosses: ['Palkia', 'Giratina'] },
      { month: 3, day: 5, bosses: [] },
    ]);
    // A heading that names no date is none.
    expect(
      parseEventRaidHours('<h2 id="raids">Raids</h2><h3>Raid Hour: the whole week</h3>'),
    ).toEqual([]);
    expect(parseEventRaidHours('<h2 id="raids">Raids</h2><h3>Raid Hour: February 30</h3>')).toEqual(
      [],
    );
  });

  it('reads at most 20 Raid Hours of a page', () => {
    const headings = Array.from(
      { length: 30 },
      (_, i) => `<h3>Raid Hour: January ${String(i + 1)}</h3>`,
    ).join('');
    const read = parseEventRaidHours(`<h2 id="raids">Raids</h2>${headings}`);
    expect(read).toHaveLength(20);
    expect(read[19]).toEqual({ month: 1, day: 20, bosses: [] });
  });

  it('counts the Raid Hour headings of the Raids section by their dated ids (review ER-3)', () => {
    expect(raidHourHeadings(readEventPage('leekduck-event-into-the-wild-2026.html'))).toBe(2);
    expect(
      raidHourHeadings(
        '<h2 id="raids">Raids</h2><h3 class="x" id="raid-hour-monday">?</h3><h3 id="raid-hours">?</h3>' +
          '<h2 id="raid-hour">Raid Hour</h2><h3 id="raid-hour-tuesday">?</h3>',
      ),
    ).toBe(1);
    expect(raidHourHeadings('<h3 id="raid-hour-monday">Raid Hour</h3>')).toBe(0);
  });
});

describe('eventPageTime', () => {
  const MONDAY = { month: 11, day: 9 };
  const TUESDAY = { month: 11, day: 10 };
  const raids = (...paragraphs: string[]) =>
    `<h2 id="raids">Raids</h2>${paragraphs.map((one) => `<p>${one}</p>`).join('')}` +
    '<h3 id="raid-hour-monday-november-9">Raid Hour: Monday, November 9</h3><ul></ul>' +
    '<h2 id="max-battles">Max Battles</h2><p>From 2:00 p.m. to 5:00 p.m.</p>';

  it('reads the one time range of the Raids section’s sentence (Into the Wild)', () => {
    const intoTheWild = readEventPage('leekduck-event-into-the-wild-2026.html');
    expect(eventPageTime(intoTheWild, 'raids', [MONDAY, TUESDAY])).toEqual({
      kind: 'time',
      time: { hour: 18, minute: 0, minutes: 60 },
    });
  });

  it('reads minutes, a range without the first a.m. or p.m., and the morning', () => {
    expect(
      eventPageTime(raids('Raid Hours from 5:30 p.m. to 7:00 p.m. local time'), 'raids', [MONDAY]),
    ).toEqual({ kind: 'time', time: { hour: 17, minute: 30, minutes: 90 } });
    expect(
      eventPageTime(raids('A Raid Hour from 6 to 7 p.m. on November 9'), 'raids', [MONDAY]),
    ).toEqual({ kind: 'time', time: { hour: 18, minute: 0, minutes: 60 } });
    expect(eventPageTime(raids('Raid Hour from 11 a.m. to 12 p.m.'), 'raids', [MONDAY])).toEqual({
      kind: 'time',
      time: { hour: 11, minute: 0, minutes: 60 },
    });
    // The same range said twice is one.
    expect(
      eventPageTime(
        raids('Raid Hour from 6 p.m. to 7 p.m.', 'Again, Raid Hour from 6:00 p.m. to 7:00 p.m.'),
        'raids',
        [MONDAY],
      ),
    ).toEqual({ kind: 'time', time: { hour: 18, minute: 0, minutes: 60 } });
  });

  it('reads only a paragraph that names the hours: a range of other raids is none of theirs (review)', () => {
    const shadow = 'Shadow raids will appear from 10 a.m. to 1 p.m. local time.';
    expect(
      eventPageTime(raids(shadow, 'Zacian will be featured in a Raid Hour.'), 'raids', [MONDAY]),
    ).toEqual({ kind: 'none' });
    expect(
      eventPageTime(raids(shadow, 'Raid Hour from 6 p.m. to 7 p.m. local time.'), 'raids', [
        MONDAY,
      ]),
    ).toEqual({ kind: 'time', time: { hour: 18, minute: 0, minutes: 60 } });
    // Max Battles: a paragraph that says "featured" or names Max Battles.
    const max = (paragraph: string) =>
      `<h2 id="max-battles">Max Battles</h2><p>Gigantamax Pokémon from 9 a.m. to 9 p.m.</p><p>${paragraph}</p>`;
    expect(
      eventPageTime(max('Registeel will be featured from 6 p.m. to 7 p.m.'), 'max-battles', []),
    ).toEqual({ kind: 'time', time: { hour: 18, minute: 0, minutes: 60 } });
    expect(eventPageTime(max('Bring friends.'), 'max-battles', [])).toEqual({ kind: 'none' });
  });

  it('gives none for a section that names no time, and for a page without the section', () => {
    expect(
      eventPageTime(raids('The following Pokémon will appear in raids.'), 'raids', [MONDAY]),
    ).toEqual({ kind: 'none' });
    expect(eventPageTime('<h2 id="spawns">Spawns</h2>', 'raids', [MONDAY])).toEqual({
      kind: 'none',
    });
  });

  it('is unclear with several ranges, a range it cannot read, or dates that leave a heading out', () => {
    const unclear = { kind: 'unclear' };
    expect(
      eventPageTime(
        raids(
          'Raid Hours from 6 p.m. to 7 p.m. on Monday, November 9, and from 5 p.m. to 6 p.m. on Tuesday',
        ),
        'raids',
        [MONDAY, TUESDAY],
      ),
    ).toEqual(unclear);
    expect(eventPageTime(raids('Raid Hour from 7 p.m. to 6 p.m.'), 'raids', [MONDAY])).toEqual(
      unclear,
    );
    expect(eventPageTime(raids('Raid Hour at 6 p.m. sharp'), 'raids', [MONDAY])).toEqual(unclear);
    expect(eventPageTime(raids('Raid Hour from noon to 1 p.m.'), 'raids', [MONDAY])).toEqual(
      unclear,
    );
    // The sentence names Monday only; Tuesday's heading is left out.
    expect(
      eventPageTime(
        raids('Raid Hours from 6 p.m. to 7 p.m. local time on Monday, November 9'),
        'raids',
        [MONDAY, TUESDAY],
      ),
    ).toEqual(unclear);
  });

  it('is unclear for Raid Hours of over three hours, and for a time of a named zone (review)', () => {
    const unclear = { kind: 'unclear' };
    expect(eventPageTime(raids('Raid Hours from 2 p.m. to 6 p.m.'), 'raids', [MONDAY])).toEqual(
      unclear,
    );
    expect(eventPageTime(raids('Raid Hours from 2 p.m. to 5 p.m.'), 'raids', [MONDAY])).toEqual({
      kind: 'time',
      time: { hour: 14, minute: 0, minutes: 180 },
    });
    for (const zone of ['PT', 'ET', 'UTC', '(PDT)', 'GMT+1']) {
      expect(
        eventPageTime(raids(`Raid Hour from 6 p.m. to 7 p.m. ${zone}.`), 'raids', [MONDAY]),
        zone,
      ).toEqual(unclear);
    }
    expect(
      eventPageTime(raids('Raid Hour from 6 p.m. to 7 p.m. local time.'), 'raids', [MONDAY]),
    ).toEqual({ kind: 'time', time: { hour: 18, minute: 0, minutes: 60 } });
  });

  // Plan 8Z-2: the section is read paragraph by paragraph, a bounded number of bounded length,
  // never by one pattern over the whole of it (quadratic on paragraphs that are not closed).
  it('reads a paragraph that is not closed up to the next one, as a browser does', () => {
    const html =
      '<h2 id="raids">Raids</h2><p>Raid Hour from 6 p.m. to 7 p.m. local time.' +
      '<p class="note">Shadow raids will appear from 10 a.m. to 1 p.m.</p>';
    expect(eventPageTime(html, 'raids', [MONDAY])).toEqual({
      kind: 'time',
      time: { hour: 18, minute: 0, minutes: 60 },
    });
  });

  it('is unclear for a section with more paragraphs, or a longer one, than it reads', () => {
    const unclear = { kind: 'unclear' };
    // The audit's page: paragraphs by the tens of thousands, none closed.
    const open = `<h2 id="raids">Raids</h2>${'<p>'.repeat(30_000)}`;
    expect(eventPageTime(open, 'raids', [MONDAY])).toEqual(unclear);
    // The fifty-first paragraph is not read: what it says of the hours is not known.
    const filler = Array.from({ length: 50 }, () => 'The following Pokémon will appear in raids.');
    expect(
      eventPageTime(raids(...filler, 'Raid Hour from 6 p.m. to 7 p.m.'), 'raids', [MONDAY]),
    ).toEqual(unclear);
    expect(
      eventPageTime(raids(...filler.slice(1), 'Raid Hour from 6 p.m. to 7 p.m.'), 'raids', [
        MONDAY,
      ]),
    ).toEqual({ kind: 'time', time: { hour: 18, minute: 0, minutes: 60 } });
    // Nor the end of a paragraph of over 4,000 characters: another range may follow there.
    const long = `Raid Hour from 6 p.m. to 7 p.m. ${'and so on '.repeat(400)}`;
    expect(eventPageTime(raids(long), 'raids', [MONDAY])).toEqual(unclear);
  });

  // Fix round of 8Z-2: each paragraph's close is looked for within its own room, never to the
  // section's end (3 MB of `<p>` took 400 ms, fifty times over the rest of the section).
  it('looks for a paragraph’s close only as far as it reads the paragraph', () => {
    const time = { kind: 'time', time: { hour: 18, minute: 0, minutes: 60 } };
    const sentence = 'Raid Hour from 6 p.m. to 7 p.m.';
    // Closed at its 4,000th character: read whole. A character more: the end is not read.
    expect(eventPageTime(raids(sentence.padEnd(4_000, ' ')), 'raids', [MONDAY])).toEqual(time);
    expect(eventPageTime(raids(sentence.padEnd(4_001, ' ')), 'raids', [MONDAY])).toEqual({
      kind: 'unclear',
    });
    // A million paragraphs that are never closed: the fifty read, the rest unclear.
    const open = `<h2 id="raids">Raids</h2><p>${sentence}${'<p>'.repeat(1_000_000)}`;
    expect(eventPageTime(open, 'raids', [MONDAY])).toEqual({ kind: 'unclear' });
  });
});

describe('parseEventMaxHours', () => {
  const intoTheWild = readEventPage('leekduck-event-into-the-wild-2026.html');
  const boss = (name: string) =>
    `<li class="pkmn-list-item"><div class="pkmn-name">${name}</div></li>`;

  it('reads the dated Max Battle headings of an event page with their bosses (Into the Wild)', () => {
    expect(parseEventMaxHours(intoTheWild)).toEqual([
      { month: 11, day: 11, bosses: ['Registeel'], gigantamax: false },
      { month: 11, day: 12, bosses: ['Regidrago'], gigantamax: false },
      { month: 11, day: 13, bosses: ['Latias', 'Latios'], gigantamax: false },
    ]);
    expect(maxHourHeadings(intoTheWild)).toBe(3);
    // The section's sentence: 6 to 7 p.m. for one day each, no dates named.
    expect(
      eventPageTime(intoTheWild, 'max-battles', [
        { month: 11, day: 11 },
        { month: 11, day: 12 },
      ]),
    ).toEqual({ kind: 'time', time: { hour: 18, minute: 0, minutes: 60 } });
  });

  it('reads Gigantamax headings, other shapes of the date, and the Max Battles section only', () => {
    const html =
      `<h2 id="raids">Raids</h2><h3>Five-Star Max Battles: Monday, March 2</h3><ul>${boss('Mew')}</ul>` +
      '<h2 id="max-battles">Max Battles</h2>' +
      `<h3 id="one-star-max-battles">One-Star Max Battles</h3><ul>${boss('Ralts')}</ul><hr />` +
      `<h3 id="gigantamax-max-battles-march-3">Gigantamax Max Battles: March 3</h3><ul>${boss('Gigantamax Toxtricity')}</ul>` +
      `<h3>Max Battles: Wed, Mar. 4</h3><ul>${boss('Zapdos')}${boss('Moltres')}</ul>` +
      `<h3>Max Battle Hour: Thursday, March 5th</h3><p>To be announced.</p>` +
      `<h2 id="raid-hours">More</h2><h3>Max Battles: Friday, March 6</h3>`;
    expect(parseEventMaxHours(html)).toEqual([
      { month: 3, day: 3, bosses: ['Gigantamax Toxtricity'], gigantamax: true },
      { month: 3, day: 4, bosses: ['Zapdos', 'Moltres'], gigantamax: false },
      { month: 3, day: 5, bosses: [], gigantamax: false },
    ]);
    expect(
      parseEventMaxHours('<h2 id="max-battles">Max</h2><h3>Max Battles: the week</h3>'),
    ).toEqual([]);
    expect(parseEventMaxHours(readEventPage('leekduck-event-halloween-2026-part-1.html'))).toEqual(
      [],
    );
  });

  it('reads a Max Battle Weekend heading, and counts a dated id that goes on past the day (review)', () => {
    const html =
      '<h2 id="max-battles">Max Battles</h2>' +
      `<h3 id="max-battle-weekend-saturday-march-7">Max Battle Weekend: Saturday, March 7</h3><ul>${boss('Zapdos')}</ul>` +
      `<h3 id="max-battles-sunday-march-8-6-pm">Max Battles: Sunday, March 8, 6 p.m.</h3><ul>${boss('Moltres')}</ul>`;
    expect(parseEventMaxHours(html)).toEqual([
      { month: 3, day: 7, bosses: ['Zapdos'], gigantamax: false },
    ]);
    // The heading with its own time is not read, but counted: the service warns of it.
    expect(maxHourHeadings(html)).toBe(2);
  });

  it('takes a heading whose every boss is Gigantamax for Gigantamax hours (review)', () => {
    const html =
      '<h2 id="max-battles">Max Battles</h2>' +
      `<h3>Max Battles: Saturday, March 7</h3><ul>${boss('Gigantamax Lapras')}${boss('Gigantamax Snorlax')}</ul>` +
      `<h3>Max Battles: Sunday, March 8</h3><ul>${boss('Gigantamax Lapras')}${boss('Snorlax')}</ul>` +
      `<h3>Max Battles: Monday, March 9</h3><ul></ul>`;
    expect(parseEventMaxHours(html).map((one) => one.gigantamax)).toEqual([true, false, false]);
  });

  it('counts the dated headings of the Max Battles section by their ids', () => {
    expect(
      maxHourHeadings(
        '<h2 id="max-battles">Max</h2><h3 id="five-star-max-battles-wednesday-november-11">?</h3>' +
          '<h3 id="five-star-max-battles">?</h3><h3 id="max-battles-sept-3">?</h3>' +
          '<h2 id="raids">Raids</h2><h3 id="max-battles-monday-november-9">?</h3>',
      ),
    ).toBe(2);
  });
});
