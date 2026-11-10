import { describe, expect, it } from 'vitest';
import { textOf } from '../../test/support/messages.js';
import { pageTask, pikachuTask } from '../../test/support/research.js';
import { researchReport, reportedStop } from '../../test/support/stop-report-cases.js';
import type { TaskVersion } from '../domain/research/versions.js';
import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
import type { TaskReward } from '../domain/research/task.js';
import type { ResearchReport } from '../domain/stops/report.js';
import {
  DISCORD_CHANNEL,
  periodEndWords,
  researchAlready,
  researchAnswer,
  researchConfirmBrief,
  researchConfirmSentence,
  researchDmBrief,
  researchWords,
  type ResearchAnswerView,
} from './research.js';
import { zonedAt } from '../../test/support/time.js';

const WEST = '100000000000000011';
const EAST = '100000000000000012';

/** A task at two stops, the first in the place of another task, shown in West's and East's posts. */
function answerView(): ResearchAnswerView {
  const report = (id: number, n: number): ResearchReport => ({
    ...researchReport({ stop: reportedStop(n) }),
    id,
  });
  const before: ResearchReport = {
    ...researchReport({
      subjectKey: 'typed:0000000000000001',
      research: { text: 'Catch 7 *Pokémon*', category: null, rewards: [], typed: true },
    }),
    id: 3,
  };
  return {
    units: 'metric',
    saved: [
      { report: report(7, 1), replaced: before },
      { report: report(8, 2), replaced: undefined },
    ],
    channels: [WEST, EAST],
    boards: [WEST, EAST],
    until: 'until midnight',
    more: [{ key: 'b'.repeat(32), name: 'Little Bench', metres: 1_100, where: 'Main Street' }],
  };
}

describe('researchAnswer', () => {
  it('is the message it was before its words were shared with the map (plan 8R-3)', () => {
    expect(researchAnswer(answerView())).toMatchInlineSnapshot(`
      {
        "components": [
          {
            "accent_color": 10181046,
            "components": [
              {
                "content": "### Field research reported
      **Make 2 Excellent Throws** · Dratini
      - **Yellow Mural 1** · Market Street (was: Catch 7 \\*Pokémon\\*)
      - **Yellow Mural 2** · Market Street",
                "type": 10,
              },
              {
                "content": "-# In "Today’s Stops" on the boards of <#100000000000000011>, <#100000000000000012>, until midnight.",
                "type": 10,
              },
              {
                "components": [
                  {
                    "custom_id": "research:7:more:7f01b706630faf94",
                    "max_values": 1,
                    "min_values": 1,
                    "options": [
                      {
                        "description": "1.1 km away · Main Street",
                        "label": "Little Bench",
                        "value": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                      },
                    ],
                    "placeholder": "Same task at more stops…",
                    "type": 3,
                  },
                ],
                "type": 1,
              },
              {
                "components": [
                  {
                    "custom_id": "research:7:back:8",
                    "label": "Take back (2 stops)",
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

  it('says what it said before in every other case: no posts, no region, also, again (plan 8R-3)', () => {
    const view = answerView();
    const [first, second] = view.saved;
    if (!first || !second) throw new Error('two reports');
    // The same task again at the first stop, as "Same task at more stops…" answers.
    const again: ResearchAnswerView = {
      ...view,
      saved: [{ report: first.report, replaced: { ...first.report, id: 2 } }, second],
      also: true,
      posts: false,
    };
    expect(textOf(researchAnswer(again))).toMatchInlineSnapshot(`
      "### Also reported
      **Make 2 Excellent Throws** · Dratini
      - **Yellow Mural 1** · Market Street (again)
      - **Yellow Mural 2** · Market Street
      -# It lasts until midnight."
    `);
    expect(textOf(researchAnswer({ ...view, channels: [] }))).toMatchInlineSnapshot(`
      "### Field research reported
      **Make 2 Excellent Throws** · Dratini
      - **Yellow Mural 1** · Market Street (was: Catch 7 \\*Pokémon\\*)
      - **Yellow Mural 2** · Market Street
      -# It lies in no region now, so no post shows it; it lasts until midnight."
    `);
  });
});

describe('researchWords', () => {
  it('names the channels through the namer the caller gives', () => {
    const names = new Map([
      [WEST, '#west'],
      [EAST, '#east'],
    ]);
    const words = researchWords(answerView(), (id) => names.get(id) ?? '?');
    expect(words.head).toBe(
      '### Field research reported\n' +
        '**Make 2 Excellent Throws** · Dratini\n' +
        '- **Yellow Mural 1** · Market Street (was: Catch 7 \\*Pokémon\\*)\n' +
        '- **Yellow Mural 2** · Market Street',
    );
    expect(words.where).toBe('In "Today’s Stops" on the boards of #west, #east, until midnight.');
  });

  it('names only the boards recorded, and none where no region of the stops has one (review W4)', () => {
    const named = (id: string) => (id === WEST ? '#west' : '#east');
    expect(researchWords({ ...answerView(), boards: [EAST] }, named).where).toBe(
      'In "Today’s Stops" on the board of #east, until midnight.',
    );
    expect(researchWords({ ...answerView(), boards: [] }, named).where).toBe(
      'It lasts until midnight.',
    );
  });
});

describe('a costumed version beside the plain one (plan 8R-5, review W1)', () => {
  const { task, plain, costumed, oneOf } = pikachuTask();
  const reportOf = (id: number, version: TaskVersion): ResearchReport => ({
    ...researchReport({
      subjectKey: version.value,
      research: {
        text: task.text,
        category: task.category,
        rewards: version.rewards,
        typed: false,
      },
    }),
    id,
  });
  const words = (report: ResearchReport, replaced: ResearchReport) =>
    researchWords(
      { saved: [{ report, replaced }], channels: [], boards: [], until: 'until midnight' },
      DISCORD_CHANNEL,
    ).head;

  it('says "(costumed)" where the name is the plain one, in the answer and its "was"', () => {
    expect(words(reportOf(2, costumed), reportOf(1, plain))).toBe(
      '### Field research reported\n' +
        '**Catch 5 Electric-type Pokémon** · Pikachu (costumed)\n' +
        '- **Yellow Mural 1** · Market Street (was: Pikachu)',
    );
    expect(words(reportOf(2, plain), reportOf(1, costumed))).toContain(
      '**Catch 5 Electric-type Pokémon** · Pikachu\n' +
        '- **Yellow Mural 1** · Market Street (was: Pikachu (costumed))',
    );
    expect(words(reportOf(2, costumed), reportOf(1, oneOf))).toContain(
      '(was: one of Pikachu, Pikachu (costumed))',
    );
  });

  it('says it in "Already reported" and in the direct messages', () => {
    expect(researchAlready({ report: reportOf(1, costumed), link: undefined })).toMatch(
      /^Already reported: \*\*Catch 5 Electric-type Pokémon\*\* · Pikachu \(costumed\) at /,
    );
    expect(researchConfirmSentence({ stops: [reportedStop(1)], rewards: costumed.rewards })).toBe(
      'Confirmed: the reward at **[Yellow Mural 1](<https://www.google.com/maps/search/?api=1&query=40.4401%2C-79.99>)** is **Pikachu (costumed)**.',
    );
    expect(
      researchDmBrief({
        research: { rewards: costumed.rewards },
        stops: [],
        until: 'until midnight',
      }).lines[0],
    ).toBe('**Rewards** Pikachu (costumed)');
  });
});

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
const seconds = (time: number): string => String(Math.floor(time / 1_000));

describe('periodEndWords', () => {
  it('says midnight for the next one, the time today, and the day and time later (B7)', () => {
    const now = at('2026-11-12T15:00');
    expect(periodEndWords(at('2026-11-13T00:00'), now, ZONE)).toBe('until midnight');
    expect(periodEndWords(at('2026-11-12T20:00'), now, ZONE)).toBe(
      `until <t:${seconds(at('2026-11-12T20:00'))}:t>`,
    );
    expect(periodEndWords(at('2026-11-13T20:00'), now, ZONE)).toBe(
      `until <t:${seconds(at('2026-11-13T20:00'))}:f>`,
    );
  });
});

describe('the stops of a research DM (plan 8R-7: Matt, "maybe same for the DMs")', () => {
  it('names each stop as a link to its place, plain and without a working address', () => {
    const { lines } = researchDmBrief({
      research: { rewards: [] },
      stops: [
        reportedStop(1, { lat: 40.4433123456789, lon: -79.9436123456789 }),
        reportedStop(2, { name: 'Mural [North] at www.example.test', address: null }),
      ],
      until: 'until midnight',
    });
    expect(lines).toEqual([
      '- **[Yellow Mural 1](<https://www.google.com/maps/search/?api=1&query=40.44331%2C-79.94361>)** · Market Street',
      '- **[Mural \\[North\\] at www.\u200Bexample.test](<https://www.google.com/maps/search/?api=1&query=40.4402%2C-79.99>)**',
      'Until midnight.',
    ]);
  });

  // Review W2 of 8R-7: ten lines with links and escape-heavy names and addresses could reach
  // Discord's 4,000 characters; the stop lines stop at their room of 2,400.
  const LINK_LINE =
    /^- \*\*\[[^\n]*\]\(<https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=[^>]+>\)\*\*( · [^\n]+)?$/;
  const brief = (stops: ReturnType<typeof reportedStop>[]) =>
    researchDmBrief({ research: { rewards: [] }, stops, until: 'until midnight' }).lines;

  it('adds stop lines while they fit their room, each whole with its link, and counts the rest', () => {
    const stops = Array.from({ length: 12 }, (_, at) =>
      reportedStop(at + 1, { name: `${'[*_'.repeat(26)}${at}`, address: '*_~`|'.repeat(16) }),
    );
    const lines = brief(stops);
    expect(lines.at(-1)).toBe('Until midnight.');
    const shown = lines.filter((line) => LINK_LINE.test(line));
    const counted = lines.at(-2) ?? '';
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(10);
    expect(counted).toBe(`- …and ${String(12 - shown.length)} more stops`);
    expect([...shown, counted].join('\n').length).toBeLessThanOrEqual(2_400);
    expect(lines).toEqual([...shown, counted, 'Until midnight.']);
  });

  it('shows ten short ones at most, counting those over ten too', () => {
    const lines = brief(Array.from({ length: 12 }, (_, at) => reportedStop(at + 1)));
    expect(lines.filter((line) => LINK_LINE.test(line))).toHaveLength(10);
    expect(lines.at(-2)).toBe('- …and 2 more stops');
  });
});

describe('the stops of a confirmation (plan 8R-8: Matt, 2026-10-25)', () => {
  const CANDY: TaskReward = {
    kind: 'item',
    item: 'rare-candy',
    name: 'Rare Candy',
    quantity: 3,
    image: null,
  };
  const sentence = (stops: ReturnType<typeof reportedStop>[]) =>
    researchConfirmSentence({ stops, rewards: [CANDY] });
  const LINK =
    /\*\*\[[^\n]*?\]\(<https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=[^>]+>\)\*\*/g;

  it('names each stop as a link to its place, plain and without a working address', () => {
    expect(
      sentence([
        reportedStop(1, { lat: 40.4433123456789, lon: -79.9436123456789 }),
        reportedStop(2, { name: 'Mural [North] at www.example.test', address: null }),
      ]),
    ).toBe(
      'Confirmed: the reward at ' +
        '**[Yellow Mural 1](<https://www.google.com/maps/search/?api=1&query=40.44331%2C-79.94361>)** and ' +
        '**[Mural \\[North\\] at www.\u200Bexample.test](<https://www.google.com/maps/search/?api=1&query=40.4402%2C-79.99>)** ' +
        'is **Rare Candy ×3**.',
    );
  });

  it('names ten at most, and counts the rest', () => {
    const said = sentence(Array.from({ length: 12 }, (_, at) => reportedStop(at + 1)));
    expect(said.match(LINK)).toHaveLength(10);
    expect(said).toMatch(/\)\*\*, \*\*\[Yellow Mural 10\]\(<[^>]+>\)\*\* and 2 more stops is /);
  });

  it('keeps ten long names full of escapes within the room of a DM’s stops, counting the rest', () => {
    const said = sentence(
      Array.from({ length: 12 }, (_, at) =>
        reportedStop(at + 1, {
          name: `${'_*'.repeat(40)}${String(at)}`,
          lat: 40.44012345 + at,
          lon: -179.99123,
        }),
      ),
    );
    const shown = said.match(LINK) ?? [];
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(10);
    expect(said).toContain(` and ${String(12 - shown.length)} more stops is **Rare Candy ×3**.`);
    expect(said.length).toBeLessThanOrEqual(2_400 + 'Confirmed: the reward at  is **'.length + 20);
  });
});

describe('the pictures of the research DMs (plan 8R-6)', () => {
  const looked = (source: string) =>
    `https://map.example.test/pictures/${String(source.length)}.png`;
  const [lileep, anorith] = pageTask('Make 3 Great Throws in a row').rewards;

  it('shows the encounter picture on a "one of" DM, the reward on a reward’s, the Pokémon on a confirmation', () => {
    const brief = (rewards: TaskReward[]) =>
      researchDmBrief({ research: { rewards }, stops: [], until: 'until midnight' }, looked);
    expect(brief([lileep!, anorith!]).picture).toBe(looked(ENCOUNTER_PICTURE));
    expect(brief([lileep!]).picture).toBe(looked(lileep!.image!));
    expect(brief([]).picture).toBeUndefined();
    const confirmed = researchConfirmBrief(
      {
        research: { text: 'Make 3 Great Throws in a row', rewards: [lileep!] },
        until: 'until midnight',
      },
      looked,
    );
    expect(confirmed.picture).toBe(looked(lileep!.image!));
  });

  it('names the feed’s address without a lookup', () => {
    expect(
      researchDmBrief({
        research: { rewards: [lileep!, anorith!] },
        stops: [],
        until: 'until midnight',
      }).picture,
    ).toBe(ENCOUNTER_PICTURE);
  });
});
