import { describe, expect, it } from 'vitest';
import {
  classic,
  customIdsOf,
  galleryOf,
  textOf,
  thumbnailBeside,
  thumbnailsOf,
} from '../../test/support/messages.js';
import { feedChoice } from '../../test/support/rocket.js';
import {
  magikarpLineup,
  MUDKIP,
  reportedStop,
  rocketReport,
} from '../../test/support/stop-report-cases.js';
import { LEADER_PORTRAITS } from '../domain/rocket/portraits.js';
import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
import type { RocketReport } from '../domain/stops/report.js';
import {
  alreadyReported,
  catchWords,
  gruntHourNote,
  gruntMessage,
  gruntTextMessage,
  ROCKET_COLOUR,
  rocketAnswer,
  rocketDmBrief,
  rocketDmSentence,
  rocketLabel,
  rocketWords,
  type GruntView,
  type RocketAnswerView,
} from './rocket.js';

const GONE = Date.UTC(2026, 9, 22, 16, 30);
const WEST = '100000000000000011';
const EAST = '100000000000000012';
const STOP_PICTURE = 'https://lh3.googleusercontent.com/abc';

const view = (overrides: Partial<GruntView> = {}): GruntView => ({
  name: 'Water-type grunt',
  catches: feedChoice('grunt:water').catches,
  stop: reportedStop(1, { name: 'Yellow Mural', address: 'Market Street', image: STOP_PICTURE }),
  reporter: { id: '200000000000000061', name: 'Ash' },
  ...overrides,
});

describe('gruntMessage', () => {
  it('shows the grunt with one picture beside its heading, its catches, the stop, when it goes, and who reported it', () => {
    const message = gruntMessage(view({ picture: ENCOUNTER_PICTURE }), GONE);
    const text = textOf(message);
    expect(text).toContain('### Water-type grunt');
    expect(text).toContain('**Catch** one of Mudkip, Tentacool, Krabby, Magikarp, Feebas');
    expect(text).toContain('This report goes away <t:1792686600:R>.');
    expect(text).toMatch(/\*\*Where\*\* \*\*Yellow Mural\*\* · Market Street · \[Map\]\(<https:/);
    expect(text).toContain('-# Reported by **Ash**');
    expect(text).not.toContain('<@');
    // One picture beside the heading (plan 8R-6), the stop's photo beside Where; no gallery.
    expect(thumbnailBeside(message, '### Water-type grunt')).toBe(ENCOUNTER_PICTURE);
    expect(thumbnailBeside(message, '**Where**')).toMatch(
      /^https:\/\/lh3\.googleusercontent\.com\/abc/,
    );
    expect(thumbnailsOf(message)).toHaveLength(2);
    expect(galleryOf(message)).toEqual([]);
    expect(message.components[0]).toMatchObject({ accent_color: ROCKET_COLOUR });
  });

  it('makes what members and the stop say plain, without links', () => {
    const message = gruntMessage(
      view({
        stop: reportedStop(1, { name: 'Go to http://x.test', address: null, image: null }),
        reporter: { id: '200000000000000061', name: '@everyone' },
        catches: [],
      }),
      GONE,
    );
    const text = textOf(message);
    expect(text).toContain('**Go to http:​//x.test**');
    expect(text).not.toContain('@everyone');
    expect(text).not.toContain('**Catch**');
    expect(galleryOf(message)).toEqual([]);
    expect(thumbnailsOf(message)).toEqual([]);
  });
});

describe('rocketDmBrief (plan 8R-6)', () => {
  const looked = (source: string) =>
    `https://map.example.test/pictures/${String(source.length)}.png`;
  const pictureOf = (key: string, catches = feedChoice(key).catches) =>
    rocketDmBrief({ key, catches, stop: reportedStop(1), ends: { goneAt: GONE } }, looked).picture;

  it('names the stop as a link to its place (plan 8R-7), plain and without a working address', () => {
    const { lines } = rocketDmBrief({
      key: 'leader:arlo',
      catches: [],
      stop: reportedStop(1, {
        name: 'Mural [North] at www.example.test',
        lat: 40.4433123456789,
        lon: -79.9436123456789,
      }),
      ends: { until: 'until midnight' },
    });
    expect(lines).toEqual([
      '- **[Mural \\[North\\] at www.\u200Bexample.test](<https://www.google.com/maps/search/?api=1&query=40.44331%2C-79.94361>)** · Market Street',
      'Until midnight.',
    ]);
  });

  it('shows the encounter picture while the catch is open, the Pokémon of one, a leader’s portrait', () => {
    const water = feedChoice('grunt:water').catches;
    expect(pictureOf('grunt:water')).toBe(looked(ENCOUNTER_PICTURE));
    expect(pictureOf('grunt:water:male', water.slice(0, 1))).toBe(looked(water[0]!.image!));
    expect(pictureOf('leader:arlo')).toBe(looked(LEADER_PORTRAITS.arlo));
    expect(pictureOf('grunt:none', [])).toBeUndefined();
  });
});

describe('gruntTextMessage', () => {
  it('says the same as text, where the bot may not embed', () => {
    const { content } = classic(gruntTextMessage(view(), GONE));
    expect(content).toContain('**Water-type grunt** has been reported by **Ash**');
    expect(content).toContain('at **Yellow Mural** · Market Street');
    expect(content).toContain('one of Mudkip, Tentacool, Krabby, Magikarp, Feebas');
    expect(content).toContain('<t:1792686600:R>');
    // The article by the name (fix B4).
    expect(classic(gruntTextMessage(view({ name: 'Electric-type grunt' }), GONE)).content).toMatch(
      /^An \*\*Electric-type grunt\*\* has been reported/,
    );
  });
});

describe('gruntHourNote', () => {
  it('says the hour without making a plural of the name (fix B4)', () => {
    expect(gruntHourNote()).toBe("You won't be told about this grunt type again for an hour.");
  });
});

describe('rocketDmSentence', () => {
  it('names a grunt with its article and a leader by name, plain and without links', () => {
    const reporter = { id: '200000000000000061', name: 'Ash' };
    const sentence = (name: string, named: boolean) =>
      rocketDmSentence({ name, named, regionChannelId: '1', reporter });
    expect(sentence('Electric-type grunt', false)).toBe(
      'An **Electric-type grunt** has been reported in <#1> by **Ash**.',
    );
    expect(sentence('Decoy grunt', false)).toBe(
      'A **Decoy grunt** has been reported in <#1> by **Ash**.',
    );
    expect(sentence('Arlo', true)).toBe('**Arlo** has been reported in <#1> by **Ash**.');
  });
});

/** A grunt posted in West and East in the place of Arlo, and a hideout in their posts. */
function answerViews(): { grunt: RocketAnswerView; hideout: RocketAnswerView } {
  const arlo: RocketReport = {
    ...rocketReport({ subjectKey: 'leader:arlo', rocket: { name: 'Arlo', catches: [] } }),
    id: 3,
  };
  const grunt: RocketReport = { ...rocketReport(), id: 7 };
  return {
    grunt: {
      report: grunt,
      replaced: arlo,
      hideout: false,
      channels: [WEST, EAST],
      boards: [WEST, EAST],
      posted: [{ channelId: WEST }, { channelId: EAST }],
      rehearsal: false,
      until: 'until midnight',
    },
    hideout: {
      report: { ...arlo, id: 9 },
      replaced: undefined,
      hideout: true,
      channels: [WEST, EAST],
      boards: [WEST, EAST],
      posted: [],
      rehearsal: false,
      until: 'until midnight',
    },
  };
}

describe('rocketAnswer', () => {
  it('is the message it was before its words were shared with the map (plan 8R-3)', () => {
    const { grunt, hideout } = answerViews();
    expect(rocketAnswer(grunt)).toMatchInlineSnapshot(`
      {
        "components": [
          {
            "accent_color": 11740719,
            "components": [
              {
                "content": "### Team GO Rocket reported
      **Water-type grunt** at **Yellow Mural 1** · Market Street · catch Mudkip (was: Arlo)",
                "type": 10,
              },
              {
                "content": "-# Posted in <#100000000000000011>, <#100000000000000012>; it goes away <t:1792593000:R>.",
                "type": 10,
              },
              {
                "components": [
                  {
                    "custom_id": "rocket:7:back:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1.16:grunt.water:mvi6im80",
                    "label": "Take back",
                    "style": 4,
                    "type": 2,
                  },
                ],
                "type": 1,
              },
            ],
            "type": 17,
          },
        ],
        "v2": true,
      }
    `);
    expect(rocketAnswer(hideout)).toMatchInlineSnapshot(`
      {
        "components": [
          {
            "accent_color": 11740719,
            "components": [
              {
                "content": "### Team GO Rocket reported
      **Arlo** at **Yellow Mural 1** · Market Street",
                "type": 10,
              },
              {
                "content": "-# In "Today’s Stops" on the boards of <#100000000000000011>, <#100000000000000012>, until midnight.",
                "type": 10,
              },
              {
                "components": [
                  {
                    "custom_id": "rocket:9:back:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1.16:leader.arlo:mvi6im80",
                    "label": "Take back",
                    "style": 4,
                    "type": 2,
                  },
                ],
                "type": 1,
              },
            ],
            "type": 17,
          },
        ],
        "v2": true,
      }
    `);
  });

  it('says what it said before in every other case: rehearsal, unposted, no region, again (plan 8R-3)', () => {
    const { grunt, hideout } = answerViews();
    const again: RocketAnswerView = {
      ...grunt,
      replaced: { ...grunt.report, id: 2 },
      rehearsal: true,
      posted: [],
    };
    expect(textOf(rocketAnswer(again))).toMatchInlineSnapshot(`
      "### Team GO Rocket reported
      **Water-type grunt** at **Yellow Mural 1** · Market Street · catch Mudkip (again)
      -# It stands until <t:1792593000:t> (rehearsal mode posts nothing)."
    `);
    expect(textOf(rocketAnswer({ ...grunt, posted: [] }))).toMatchInlineSnapshot(`
      "### Team GO Rocket reported
      **Water-type grunt** at **Yellow Mural 1** · Market Street · catch Mudkip (was: Arlo)
      -# It could not be posted in a region channel; it stands until <t:1792593000:t>."
    `);
    expect(textOf(rocketAnswer({ ...hideout, rehearsal: true }))).toMatchInlineSnapshot(`
      "### Team GO Rocket reported
      **Arlo** at **Yellow Mural 1** · Market Street
      -# It stands until midnight."
    `);
    expect(textOf(rocketAnswer({ ...hideout, channels: [] }))).toMatchInlineSnapshot(`
      "### Team GO Rocket reported
      **Arlo** at **Yellow Mural 1** · Market Street
      -# It lies in no region now, so no post shows it; it stands until midnight."
    `);
  });
});

describe('a lineup of a grunt type in the answer (plan 8R-4L)', () => {
  const lineup = (overrides: Partial<Omit<RocketReport, 'id'>> = {}): RocketReport => ({
    ...magikarpLineup(overrides),
    id: 7,
  });

  it('names what it replaced of the same type by its lineup, or as not sure which (B8)', () => {
    const { grunt } = answerViews();
    const notSure: RocketReport = { ...rocketReport(), id: 7 };
    const refined: RocketAnswerView = { ...grunt, report: lineup(), replaced: notSure };
    expect(textOf(rocketAnswer(refined))).toMatchInlineSnapshot(`
      "### Team GO Rocket reported
      **Water-type grunt** at **Yellow Mural 1** · Market Street · catch Magikarp (was: Water-type grunt, not sure which)
      -# Posted in <#100000000000000011>, <#100000000000000012>; it goes away <t:1792593060:R>."
    `);
    const mudkip = lineup({
      subjectKey: 'grunt:water:female',
      rocket: { name: 'Water-type grunt', catches: [MUDKIP], lineup: 'Mudkip, Tentacool, Krabby' },
    });
    expect(rocketWords({ ...refined, replaced: mudkip }, () => '#west').head).toContain(
      '· catch Magikarp (was: Water-type grunt · Mudkip, Tentacool, Krabby)',
    );
    // Another type is named as before, a lineup of it with its first slot.
    const fire: RocketReport = {
      ...rocketReport({
        subjectKey: 'grunt:fire',
        rocket: { name: 'Fire-type grunt', catches: [] },
      }),
      id: 3,
    };
    expect(rocketWords({ ...refined, replaced: fire }, () => '#west').head).toContain(
      '(was: Fire-type grunt)',
    );
    expect(rocketWords({ ...grunt, replaced: lineup() }, () => '#west').head).toContain(
      '(was: Water-type grunt · Magikarp, Feebas)',
    );
    // The same lineup whose first slot rotated (L-3) is named as it was, never "again".
    const rotated = lineup({ rocket: { ...lineup().rocket, lineup: 'Magikarp, Goldeen' } });
    expect(textOf(rocketAnswer({ ...refined, replaced: rotated }))).toMatchInlineSnapshot(`
      "### Team GO Rocket reported
      **Water-type grunt** at **Yellow Mural 1** · Market Street · catch Magikarp (was: Water-type grunt · Magikarp, Goldeen)
      -# Posted in <#100000000000000011>, <#100000000000000012>; it goes away <t:1792593060:R>."
    `);
    // A grunt changed in place says its messages were changed (plan 8R-6).
    expect(rocketWords({ ...refined, changed: true }, () => '#west').where).toBe(
      'Changed in #west, #west; it goes away <t:1792593060:R>.',
    );
    // The very same lineup is "again".
    expect(rocketWords({ ...refined, replaced: lineup() }, () => '#west').head).toContain(
      '· catch Magikarp (again)',
    );
  });

  it('spells every colon of who in Take back, and leaves the arguments out where they do not fit', () => {
    const { grunt } = answerViews();
    // The longest Wayfarer key and the longest lineup key (B10): 90 characters, which fit.
    const longest = lineup({
      stop: reportedStop(1, { key: `${'f'.repeat(32)}.999` }),
      subjectKey: 'grunt:electric:female',
    });
    const [id] = customIdsOf(rocketAnswer({ ...grunt, report: { ...longest, id: 9_999_999_999 } }));
    expect(id).toBe(
      `rocket:9999999999:back:${'f'.repeat(32)}.999:grunt.electric.female:` +
        longest.madeAt.toString(36),
    );
    expect(id).toHaveLength(90);
    const overlong = lineup({
      stop: reportedStop(1, { key: `pine-${'9'.repeat(60)}` }),
      subjectKey: 'grunt:electric:female',
    });
    expect(customIdsOf(rocketAnswer({ ...grunt, report: overlong }))).toEqual(['rocket:7:back']);
  });

  it('names the lineup that stands where it is reported already', () => {
    expect(alreadyReported(lineup(), undefined)).toMatch(
      /^Already reported: a \*\*Water-type grunt · Magikarp, Feebas\*\* at \*\*Yellow Mural 1\*\*/,
    );
  });

  it('names a grunt apart from its catches by its lineup, the type alone without one', () => {
    expect(rocketLabel(lineup().rocket)).toBe('Water-type grunt · Magikarp, Feebas');
    expect(rocketLabel(rocketReport().rocket)).toBe('Water-type grunt');
  });
});

describe('rocketWords', () => {
  it('names the channels through the namer the caller gives', () => {
    const names = new Map([
      [WEST, '#west'],
      [EAST, '#east'],
    ]);
    const named = (id: string) => names.get(id) ?? '?';
    const { grunt, hideout } = answerViews();
    expect(rocketWords(grunt, named)).toEqual({
      head:
        '### Team GO Rocket reported\n' +
        '**Water-type grunt** at **Yellow Mural 1** · Market Street · catch Mudkip (was: Arlo)',
      where: 'Posted in #west, #east; it goes away <t:1792593000:R>.',
    });
    expect(rocketWords(hideout, named).where).toBe(
      'In "Today’s Stops" on the boards of #west, #east, until midnight.',
    );
  });

  it('names only the boards recorded, and none where no region of the stop has one (review W4)', () => {
    const named = (id: string) => (id === WEST ? '#west' : '#east');
    const { grunt, hideout } = answerViews();
    expect(rocketWords({ ...hideout, boards: [WEST] }, named).where).toBe(
      'In "Today’s Stops" on the board of #west, until midnight.',
    );
    expect(rocketWords({ ...hideout, boards: [] }, named).where).toBe('It stands until midnight.');
    // A grunt's messages are in the region channels, board or not.
    expect(rocketWords({ ...grunt, boards: [] }, named).where).toMatch(/^Posted in #west, #east;/);
  });
});

describe('alreadyReported', () => {
  it('names the reporter as the caller gives them', () => {
    const standing: RocketReport = { ...rocketReport(), id: 7 };
    expect(alreadyReported(standing, undefined)).toContain(', by **Brock** <t:');
    expect(alreadyReported(standing, 'https://x.test/1', 'Brock')).toMatch(
      /, by Brock <t:\d+:R>; it goes away <t:\d+:R>\. https:\/\/x\.test\/1$/,
    );
  });
});

describe('catchWords', () => {
  it('names one catch alone and several as one of them, the first few and the rest counted', () => {
    expect(catchWords(feedChoice('decoy').catches)).toBe('Bellsprout');
    expect(catchWords(feedChoice('grunt:normal').catches, 3)).toBe(
      'one of Teddiursa, Hoothoot, Porygon +3',
    );
    expect(catchWords([])).toBe('');
  });
});
