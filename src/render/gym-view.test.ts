import path from 'node:path';
import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { testGyms } from '../../test/support/gyms.js';
import {
  gymAnnouncement,
  gymRemovedLine,
  gymWithId,
  regionsSentence,
  renderGymView,
  renderMemberGymView,
  type GymView,
  type ViewedGym,
} from './gym-view.js';
import {
  accentOf,
  buttonLabels,
  galleryOf,
  linksOf,
  textDisplays,
  textOf,
} from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import { gymMapsUrl } from './raid-post.js';
import { mapPicture } from './v2.js';

const library = (): ViewedGym => {
  const gym = testGyms().find((one) => one.id === 1);
  if (!gym) throw new Error('no gym 1');
  return gym;
};

const view = (gym: Partial<ViewedGym> = {}, more: Partial<GymView> = {}): GymView => ({
  gym: { ...library(), ...gym },
  regions: [{ channelId: '100000000000000001' }],
  nearest: { gym: { id: 12, name: 'Pinewood Post Office Gym', nickname: null }, metres: 1_402.4 },
  targets: 3,
  units: 'metric',
  ...more,
});

describe('sentences about a gym', () => {
  it('tells a gym from its namesakes by nickname and number', () => {
    expect(gymWithId({ id: 9, name: 'Starbucks', nickname: null })).toBe('**Starbucks** (#9)');
    expect(gymWithId({ id: 1, name: 'Library', nickname: 'The *Stacks*' })).toBe(
      '**Library** (The \\*Stacks\\*, #1)',
    );
    expect(gymWithId({ id: 1, name: 'Library', nickname: '' })).toBe('**Library** (#1)');
  });

  it('cuts a long name and nickname before escaping, and always keeps the number', () => {
    const long = gymWithId({ id: 4711, name: 'a*'.repeat(128), nickname: 'b_'.repeat(128) });
    // 80 and 40 characters, the last of each an ellipsis; what is left is escaped whole.
    expect(long).toBe(`**${'a\\*'.repeat(39)}a…** (${'b\\_'.repeat(19)}b…, #4711)`);
    expect(long.length).toBeLessThan(270);
  });

  it('takes control and direction characters out of a legacy name', () => {
    expect(gymWithId({ id: 3, name: 'Old\u202e Mill\u0007', nickname: '\u200fXY\u2066' })).toBe(
      '**Old Mill** (XY, #3)',
    );
    expect(gymRemovedLine({ id: 3, name: '\u202eMill', nickname: null })).toBe(
      '**Mill** (#3) was removed from the gym list.',
    );
  });

  it('names a gym whose name shows as nothing by what it is', () => {
    const invisible = { id: 12, name: '\u202e\u200b\u0007', nickname: '\u200e', lat: 40, lon: -80 };
    expect(gymWithId(invisible)).toBe('**Gym** (#12)');
    expect(gymRemovedLine(invisible)).toBe('**Gym** (#12) was removed from the gym list.');
    expect(textDisplays(gymAnnouncement(invisible, []))[1]).toMatch(/^### \[Gym #12\]\(/);
    expect(textDisplays(renderGymView(view({ ...invisible })))[0]).toMatch(/^### \[Gym #12\]\(/);
  });

  it('counts the regions that do not fit into the sentence', () => {
    const many = Array.from({ length: 60 }, (_, n) => ({
      channelId: String(100000000000000000 + n),
    }));
    const sentence = regionsSentence(many);
    expect(sentence.length).toBeLessThan(340);
    expect(sentence).toMatch(/^It lies in <#100000000000000000>, .*, …and \d+ more\.$/);
  });

  it('names the regions a gym lies in', () => {
    expect(regionsSentence([])).toBe('It lies in no region of this server.');
    expect(regionsSentence([{ channelId: '1' }])).toBe('It lies in <#1>.');
    expect(regionsSentence([{ channelId: '1' }, { channelId: '2' }, { channelId: '3' }])).toBe(
      'It lies in <#1>, <#2> and <#3>.',
    );
  });

  it("says the nearest gym's distance in the units of the settings (task 7)", () => {
    const nearest = (units: 'metric' | 'imperial') =>
      textDisplays(renderGymView(view({}, { units }))).join(' ');
    expect(nearest('metric')).toContain('(#12), 1.4 km away');
    expect(nearest('imperial')).toContain('(#12), 0.9 mi away');
  });

  it('announces a new gym without its nickname when it has none, and without a ping', () => {
    const message = gymAnnouncement({ ...library(), nickname: null }, []);
    expect(textDisplays(message)).toEqual([
      'A gym was added to the gym list.',
      `### [Pinewood Public Library](<${gymMapsUrl(library())}>)
` + 'It lies in no region of this server.',
      '-# Gym #1',
    ]);
    expect(linksOf(message)).toEqual([`Map ${gymMapsUrl(library())}`]);
    expect(message.mention).toBeUndefined();
    expect(message.files).toBeUndefined();
  });

  it('announces a new gym with its nickname, its regions and its map', () => {
    const file = path.join('var', 'images', 'gyms', '1-abc.png');
    const message = gymAnnouncement(
      library(),
      [{ channelId: '100000000000000001' }],
      mapPicture(file, 'Map of the gym'),
    );
    expect(textDisplays(message)[1]).toBe(
      `### [Pinewood Public Library (The Stacks)](<${gymMapsUrl(library())}>)
` + 'It lies in <#100000000000000001>.',
    );
    expect(galleryOf(message)).toEqual(['attachment://1-abc.png']);
    expect(message.files).toEqual([file]);
    expectV2Sendable(message);
  });

  it('says in one line that a gym was removed', () => {
    expect(gymRemovedLine(library())).toBe(
      '**Pinewood Public Library** (The Stacks, #1) was removed from the gym list.',
    );
  });
});

describe('renderGymView', () => {
  const MAPS = 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05';

  it('shows everything that is known of a gym, as one container', () => {
    const message = renderGymView(
      view({ notice: 'Closed on *Sundays*', keywords: ['books', 'mural'] }),
    );
    expect(accentOf(message)).toBe(0x3498db);
    expect(textDisplays(message)).toEqual([
      `### [Pinewood Public Library (The Stacks)](<${MAPS}>)\n` +
        '12 Maple Avenue, Pinewood, Pennsylvania 15999\n' +
        'It lies in <#100000000000000001>.',
      'Mural of readers beside the front doors',
      '**Notice**\nClosed on \\*Sundays\\*\n' +
        '**Keywords:** books, mural\n' +
        '**Gym targets:** 3 members\n' +
        '**Elite raid gym:** no\n' +
        '**Nearest gym:** **Pinewood Post Office Gym** (#12), 1.4 km away\n' +
        '-# Nearby places (from Google): Corner Bakery, Maple Dental',
      '-# Gym #1 · 40.05, -80.05',
    ]);
    expect(linksOf(message)).toEqual([`Map ${MAPS}`]);
    expect(message.files).toBeUndefined();
  });

  it('leaves out what a gym does not have, and says none where staff would wonder', () => {
    const shown = view(
      { nickname: null, description: null, notice: null, geodata: null, places: null },
      { regions: [], nearest: undefined, targets: undefined },
    );
    expect(textDisplays(renderGymView(shown))).toEqual([
      `### [Pinewood Public Library](<${MAPS}>)\nIt lies in no region of this server.`,
      '**Keywords:** none\n' +
        '**Gym targets:** unknown\n' +
        '**Elite raid gym:** no\n' +
        '**Nearest gym:** none',
      '-# Gym #1 · 40.05, -80.05',
    ]);
  });

  it('puts what a change did above the view, and buttons beside the Map link', () => {
    const edit = {
      type: ComponentType.Button as const,
      style: ButtonStyle.Secondary as const,
      label: 'Edit…',
      custom_id: 'gymview:1:edit',
    };
    const message = renderGymView(
      view({}, { above: ['Changed it.', undefined, 'Note.'], controls: [edit] }),
    );
    expect(textDisplays(message)[0]).toBe('Changed it.\nNote.');
    expect(buttonLabels(message)).toEqual(['Map', 'Edit…']);
  });

  it('calls a gym an elite raid gym when either stored flag is set', () => {
    expect(textOf(renderGymView(view({ taggedEx: true })))).toContain('**Elite raid gym:** yes');
    expect(textOf(renderGymView(view({ confirmedEx: true })))).toContain('**Elite raid gym:** yes');
    expect(JSON.stringify(renderGymView(view({ taggedEx: true, confirmedEx: true })))).not.toMatch(
      /\bEX\b/,
    );
  });

  it('shows the map at full width with its file', () => {
    const file = path.join('var', 'images', 'gyms', '1-abc.png');
    const message = renderGymView(view({}, { map: mapPicture(file, 'Map of the gym') }));
    expect(galleryOf(message)).toEqual(['attachment://1-abc.png']);
    expect(message.files).toEqual([file]);
    expectV2Sendable(message);
  });

  it('counts one member as one', () => {
    expect(textOf(renderGymView(view({}, { targets: 1 })))).toContain('**Gym targets:** 1 member');
    expect(textOf(renderGymView(view({}, { targets: 0 })))).toContain('**Gym targets:** 0 members');
  });

  it('shows what staff typed as plain text', () => {
    const shown = view({
      name: '**Bold** [link](https://example.com)',
      nickname: '@everyone',
      description: '# Heading\n<@123> and <#456>',
      keywords: ['_under_'],
      places: '*Star* Cafe',
    });
    const message = renderGymView(shown);
    const text = textOf(message);
    expect(text).not.toContain('**Bold**');
    expect(text).not.toContain('](https://example.com)');
    // The brackets of the name cannot end the link of the heading.
    expect(textDisplays(message)[0]).toMatch(/^### \[\\\*\\\*Bold\\\*\\\* \\\[link\\\]/);
    const description = textDisplays(message)[1] ?? '';
    expect(description.startsWith('\\# Heading\n')).toBe(true);
    // A mention typed as text stays text.
    expect(description).not.toContain('<@123>');
    expect(description).not.toContain('<#456>');
    expect(text).not.toContain('@everyone');
    expect(text).toContain('**Keywords:** \\_under\\_');
    expect(text).toContain('-# Nearby places (from Google): \\*Star\\* Cafe');
  });

  it('cuts what staff and Google wrote before escaping it, never in an escape', () => {
    const stars = '*'.repeat(5_000);
    const shown = view({
      description: stars,
      notice: stars,
      places: stars,
      geodata: JSON.stringify({ addressComponents: { formatted_address: stars } }),
    });
    const text = textOf(renderGymView(shown));
    // A cut after escaping leaves a lone backslash before the ellipsis.
    expect(text).not.toContain('\\…');
    expect(text).toContain('\\*…');
  });

  it('keeps the lines above a view whole, and says how many more did not fit', () => {
    const message = renderGymView(
      view({}, { above: ['a'.repeat(900), `**Bold** ${'b'.repeat(200)}`, 'Third'] }),
    );
    expect(textDisplays(message)[0]).toBe(`${'a'.repeat(900)}\n…and 2 more lines`);
  });

  it('reserves room for its own tail within the room it is given', () => {
    const room = 1_000;
    const shownAbove = (above: string[]): string =>
      textDisplays(renderGymView(view({}, { above })))[0] ?? '';
    // Lines that hit the room exactly or leave less than the tail needs.
    for (const length of [room - 40, room - 30, room - 20, room - 10, room - 1, room]) {
      const text = shownAbove(['a'.repeat(100), 'b'.repeat(length - 101), 'c']);
      expect(text.length).toBeLessThanOrEqual(room);
    }
    // A first line too long for the room, with more after it: cut to leave room for the tail.
    const first = shownAbove(['a'.repeat(2 * room), 'second', 'third']);
    expect(first.length).toBeLessThanOrEqual(room);
    expect(first).toMatch(/…\n…and 2 more lines$/);
    // Cut where it is bold, the bold goes and its text stays: no marker is left open.
    const bold = shownAbove([`Renamed **${'b'.repeat(2 * room)}**.`, 'second']);
    expect(bold.startsWith(`Renamed ${'b'.repeat(100)}`)).toBe(true);
    expect(bold).not.toContain('**');
  });

  it('stays within the limits of a message whatever the texts of the gym', () => {
    const long = (length: number): string => '*[x] '.repeat(Math.ceil(length / 5)).slice(0, length);
    const shown = view(
      {
        name: long(255),
        nickname: long(255),
        description: long(20_000),
        notice: long(20_000),
        keywords: Array.from({ length: 400 }, (_, index) => `keyword_number_${index}`),
        geodata: JSON.stringify({
          addressComponents: Object.fromEntries(
            Array.from({ length: 80 }, (_, index) => [`type_${index}`, long(200)]),
          ),
        }),
        places: long(20_000),
      },
      {
        regions: Array.from({ length: 200 }, (_, index) => ({ channelId: `${1e17 + index}` })),
        nearest: { gym: { id: 99999, name: long(255), nickname: long(255) }, metres: 12 },
        above: [long(5_000)],
        map: mapPicture('var/images/gyms/1-abc.png'),
      },
    );
    expectV2Sendable(renderGymView(shown));
  });
});

describe('renderMemberGymView', () => {
  it('shows a gym as a member needs it, with its raids', () => {
    const raids = Array.from(
      { length: 12 },
      (_unused, i) => `<#1000000000000000${String(10 + i)}> · ends <t:1760000000:R> · 3 trainers`,
    );
    const message = renderMemberGymView({
      gym: { ...library(), notice: 'Closed', taggedEx: true },
      regions: [{ channelId: '100000000000000001' }],
      raids,
    });
    const texts = textDisplays(message);
    // An elite raid gym is not marked for members (Matt, 2026-10-17); staff's view says it.
    expect(texts[0]?.split('\n')).toEqual([
      `### [Pinewood Public Library (The Stacks)](<${gymMapsUrl(library())}>)`,
      'It lies in <#100000000000000001>.',
    ]);
    expect(texts).toContain('**Notice**\nClosed');
    expect(texts).toContain(`**Raids now**\n${raids.join('\n')}`);
    expect(texts.at(-1)).toBe('-# Gym #1');
    expect(textOf(message)).not.toContain('Keywords');
    expect(linksOf(message)).toEqual([`Map ${gymMapsUrl(library())}`]);
  });

  it('stays within the limits of a message whatever the texts of the gym', () => {
    const long = (length: number): string => '_x_ '.repeat(Math.ceil(length / 4)).slice(0, length);
    const raids = Array.from({ length: 400 }, (_, i) => `<#${1e17 + i}> · ends soon · 3 trainers`);
    const message = renderMemberGymView({
      gym: {
        ...library(),
        name: long(255),
        nickname: long(255),
        description: long(9_000),
        notice: long(9_000),
      },
      regions: Array.from({ length: 200 }, (_, index) => ({ channelId: `${1e17 + index}` })),
      raids,
      map: mapPicture('var/images/gyms/1-abc.png'),
    });
    expectV2Sendable(message);
  });
});
