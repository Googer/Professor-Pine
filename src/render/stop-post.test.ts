import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ComponentType } from 'discord.js';
import { describe, expect, it, onTestFinished } from 'vitest';
import { textOf } from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import { pageTask, pikachuTask } from '../../test/support/research.js';
import { bytesResponse } from '../../test/support/responses.js';
import { reportedStop } from '../../test/support/stop-report-cases.js';
import { feedChoice } from '../../test/support/rocket.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { TaskReward } from '../domain/research/task.js';
import { GIOVANNI_PORTRAIT, LEADER_PORTRAITS } from '../domain/rocket/portraits.js';
import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
import { StopPictures } from '../services/stop-pictures.js';
import {
  BLOCK_ROOM,
  CLASSIC_BLOCK_ROOM,
  MAX_POST_MESSAGES,
  postPictures,
  stopPostMessages,
  stopPostText,
  type PostHideout,
  type PostTask,
} from './stop-post.js';

const DRAGON = pageTask('Catch a Dragon-type Pokémon');

/** Where `reportedStop(n)` lies on Google Maps (40.44 + n / 10,000, −79.99), as the post links it. */
const mapOf = (n: number): string =>
  `https://www.google.com/maps/search/?api=1&query=${String((404_400 + n) / 10_000)}%2C-79.99`;
/** The name of `reportedStop(n)` in the post (plan 8R-7): bold, the link to its place. */
const named = (n: number, name = `Stop ${String(n)}`): string => `**[${name}](<${mapOf(n)}>)**`;

/** The dragon task at `n` stops (or `stops`), each by a reporter of its own: one version. */
function atStops(
  n: number,
  key = 'dragon',
  stops?: PostTask['versions'][number]['stops'],
): PostTask {
  return {
    key,
    research: {
      text: DRAGON.text,
      category: DRAGON.category,
      rewards: DRAGON.rewards,
      typed: false,
    },
    versions: [
      {
        key,
        rewards: DRAGON.rewards,
        stops:
          stops ??
          Array.from({ length: n }, (_, i) => ({
            stop: reportedStop(i + 1, { name: `Stop ${'x'.repeat(60)} ${String(i + 1)}` }),
            reporter: { id: `20000000000000${String(1000 + i)}`, name: `Member ${String(i)}` },
          })),
      },
    ],
  };
}

describe('the post "Today’s Stops"', () => {
  it('names fifteen stops of a task and counts the rest, within Discord’s limits', () => {
    const [message, ...more] = stopPostMessages({
      day: 'Saturday, November 21',
      tasks: [atStops(40)],
    }).messages;
    expect(more).toEqual([]);
    if (!message) throw new Error('no message');
    expectV2Sendable(message);
    const text = textOf(message);
    expect(text).toContain('Stop xxxxxxxxxx');
    expect(text).toContain('- …and 25 more stops');
    expect(text).toContain(` 15](<${mapOf(15)}>)** · Market Street · **Member 14**`);
    expect(text).not.toContain(' 16](<');
  });

  it('says so when nothing is reported, and names the task beside its picture', () => {
    const [empty] = stopPostMessages({ day: 'Saturday, November 21', tasks: [] }).messages;
    expect(textOf(empty)).toContain('Nothing reported right now.');
    const [one] = stopPostMessages({ day: 'Saturday, November 21', tasks: [atStops(1)] }).messages;
    // Its reward is one of seven: the encounter picture (plan 8R-6).
    expect(JSON.stringify(one)).toContain(ENCOUNTER_PICTURE);
  });

  it('shows a task’s versions in one block, a line before each one’s stops (plan 8R-5)', () => {
    const [lileep, anorith] = pageTask('Make 3 Great Throws in a row').rewards;
    const by = (n: number) => ({
      stop: reportedStop(n, { name: `Stop ${String(n)}`, address: null }),
      reporter: { id: `20000000000000${String(1000 + n)}`, name: `Member ${String(n)}` },
    });
    const task: PostTask = {
      key: 'task',
      research: { text: 'Make 3 Great Throws in a row', category: null, rewards: [], typed: false },
      versions: [
        { key: 'task:0000000a', rewards: [lileep!], stops: [by(1), by(2)] },
        { key: 'task', rewards: [lileep!, anorith!], stops: [by(3)] },
      ],
    };
    const layout = stopPostMessages({ day: 'Saturday, November 21', tasks: [task] });
    const text = textOf(layout.messages[0]);
    expect(text).toContain(
      [
        '**Make 3 Great Throws in a row**',
        'Lileep',
        `- ${named(1)} · **Member 1**`,
        `- ${named(2)} · **Member 2**`,
        'one of Lileep, Anorith',
        `- ${named(3)} · **Member 3**`,
      ].join('\n'),
    );
    expect([...layout.placement]).toEqual([
      ['task', 0],
      ['task:0000000a', 0],
    ]);
  });

  it('tells a costumed version from the plain one of the same name (review W1)', () => {
    const { task, plain, costumed, oneOf } = pikachuTask();
    const by = (n: number) => ({
      stop: reportedStop(n, { name: `Stop ${String(n)}`, address: null }),
      reporter: { id: `20000000000000${String(1000 + n)}`, name: `Member ${String(n)}` },
    });
    const post: PostTask = {
      key: task.key,
      research: { text: task.text, category: null, rewards: [], typed: false },
      versions: [
        { key: plain.value, rewards: plain.rewards, stops: [by(1)] },
        { key: costumed.value, rewards: costumed.rewards, stops: [by(2)] },
        { key: oneOf.value, rewards: oneOf.rewards, stops: [by(3)] },
      ],
    };
    const text = textOf(
      stopPostMessages({ day: 'Saturday, November 21', tasks: [post] }).messages[0],
    );
    expect(text).toContain(
      [
        'Pikachu',
        `- ${named(1)} · **Member 1**`,
        'Pikachu (costumed)',
        `- ${named(2)} · **Member 2**`,
        'one of Pikachu, Pikachu (costumed)',
        `- ${named(3)} · **Member 3**`,
      ].join('\n'),
    );
  });

  /** A task of several versions at `perVersion` stops each, the last without a reward said. */
  function versioned(n: number, perVersion: number): PostTask {
    const [lileep, anorith] = pageTask('Make 3 Great Throws in a row').rewards;
    const at = (version: number) =>
      Array.from({ length: perVersion }, (_, i) => ({
        stop: reportedStop(100 * version + i + 1, {
          name: `Stop ${'y'.repeat(50)} ${String(n)}-${String(version)}-${String(i)}`,
        }),
        reporter: { id: `20000000000000${String(1000 + i)}`, name: `Member ${'z'.repeat(40)}` },
      }));
    return {
      key: `task${String(n)}`,
      research: {
        text: `Task ${String(n)} ${'w'.repeat(80)}`,
        category: null,
        rewards: [],
        typed: true,
      },
      versions: [
        { key: `task${String(n)}:0000000a`, rewards: [lileep!], stops: at(1) },
        { key: `task${String(n)}`, rewards: [lileep!, anorith!], stops: at(2) },
        { key: `task${String(n)}:x`, rewards: [], stops: at(3) },
      ],
    };
  }

  it('gives a version without its reward said a line of its own among others (review R1)', () => {
    const task = versioned(1, 1);
    for (const text of [
      textOf(stopPostMessages({ day: 'Saturday, November 21', tasks: [task] }).messages[0]),
      stopPostText({ day: 'Saturday, November 21', tasks: [task] }).messages[0]?.content ?? '',
    ]) {
      const lines = text.split('\n');
      const at = lines.findIndex((line) => line.includes('1-3-0'));
      expect(lines[at - 1]).toBe('reward not said');
      expect(lines[at - 3]).toBe('one of Lileep, Anorith');
      expect(lines[at - 5]).toBe('Lileep');
    }
  });

  it('keeps many tasks of several versions within Discord’s limits', () => {
    const view = {
      day: 'Saturday, November 21',
      tasks: Array.from({ length: 100 }, (_, n) => versioned(n, 4)),
    };
    const { messages } = stopPostMessages(view);
    expect(messages).toHaveLength(MAX_POST_MESSAGES);
    for (const message of messages) expectV2Sendable(message);
    expect(textOf(messages.at(-1))).toMatch(/…and \d+ more tasks$/);
    const classic = stopPostText(view).messages;
    for (const message of classic) expect(message.content?.length).toBeLessThanOrEqual(2_000);
  });

  it('is classic text of at most 2,000 characters a message, three at most', () => {
    const many = Array.from({ length: 100 }, () => atStops(10));
    const { messages } = stopPostText({ day: 'Saturday, November 21', tasks: many });
    expect(messages).toHaveLength(MAX_POST_MESSAGES);
    for (const message of messages) expect(message.content?.length).toBeLessThanOrEqual(2_000);
    expect(messages.at(-1)?.content).toMatch(/…and \d+ more tasks$/);
  });

  it('names whole stop lines only, counting those that do not fit (B6)', () => {
    // Long names and addresses with marks that escaping lengthens, long reporters' names.
    const task: PostTask = atStops(
      0,
      'dragon',
      Array.from({ length: 15 }, (_, i) => ({
        stop: reportedStop(i + 1, {
          name: `The_Old *Mural* of the ${'Long_'.repeat(13)}Street ${String(i + 1)}`,
          address: `${String(1000 + i)} ${'Market_Street '.repeat(5)}Pittsburgh`,
        }),
        reporter: {
          id: `20000000000000${String(1000 + i)}`,
          name: `Trainer_${'Name_'.repeat(18)}${String(i)}`,
        },
      })),
    );
    const lines = (text: string) => text.split('\n').filter((line) => line.startsWith('- '));
    const view = { day: 'Saturday, November 21', tasks: [task] };
    const [v2] = stopPostMessages(view).messages;
    const [classic] = stopPostText(view).messages;
    for (const text of [textOf(v2), classic?.content ?? '']) {
      const stops = lines(text).filter((line) => !line.startsWith('- …and'));
      const more = /^- …and (\d+) more stops?$/.exec(lines(text).at(-1) ?? '');
      // Every line named is whole: it ends with its reporter's name in bold.
      for (const line of stops) expect(line).toMatch(/ · \*\*Trainer\\_.*\*\*$/);
      expect(stops.length + Number(more?.[1] ?? 0)).toBe(15);
    }
    // The classic text has room for fewer than all fifteen.
    expect(lines(classic?.content ?? '').at(-1)).toMatch(/^- …and \d+ more stops?$/);
  });

  describe('each stop’s name a link to its place (plan 8R-7, E1; Matt’s R6)', () => {
    /** Where these stops lie: 15-digit coordinates, rounded to five decimals in the link. */
    const FAR = { lat: 40.4433123456789, lon: -79.9436123456789 };
    const URL = 'https://www.google.com/maps/search/?api=1&query=40.44331%2C-79.94361';

    it('links every stop line to Google Maps, its coordinates rounded to five decimals', () => {
      const view = {
        day: 'Saturday, November 21',
        tasks: [
          atStops(0, 'dragon', [
            {
              stop: reportedStop(1, { name: 'Yellow Mural', ...FAR }),
              reporter: { id: '200000000000001000', name: 'Misty' },
            },
          ]),
        ],
        hideouts: [
          {
            key: 'leader:arlo',
            name: 'Arlo',
            catches: [],
            stops: [
              {
                stop: reportedStop(2, { name: 'Blue Door', address: null, ...FAR }),
                reporter: { id: '200000000000001001', name: 'Brock' },
              },
            ],
          },
        ],
        waiting: {
          at: Date.UTC(2026, 10, 21, 22),
          tasks: [
            atStops(0, 'day', [
              {
                stop: reportedStop(3, { name: 'Red Bench', ...FAR }),
                reporter: { id: '200000000000001002', name: 'Ash' },
              },
            ]),
          ],
        },
      };
      for (const text of [
        textOf(stopPostMessages(view).messages[0]),
        stopPostText(view).messages[0]?.content ?? '',
      ]) {
        expect(text).toContain(`- **[Yellow Mural](<${URL}>)** · Market Street · **Misty**`);
        expect(text).toContain(`- **[Blue Door](<${URL}>)** · **Brock**`);
        expect(text).toContain(`- **[Red Bench](<${URL}>)** · Market Street · **Ash**`);
      }
    });

    it('keeps a bracket of a stop’s name from ending the link early', () => {
      const view = {
        day: 'Saturday, November 21',
        tasks: [
          atStops(0, 'dragon', [
            {
              stop: reportedStop(1, { name: 'Mural [North] (Old)', address: null, ...FAR }),
              reporter: { id: '200000000000001000', name: 'Misty' },
            },
          ]),
        ],
      };
      expect(textOf(stopPostMessages(view).messages[0])).toContain(
        `- **[Mural \\[North\\] (Old)](<${URL}>)** · **Misty**`,
      );
    });

    it('shows no address of its own in a stop’s name: the link goes only to the stop’s place (8R7-1)', () => {
      const view = {
        day: 'Saturday, November 21',
        tasks: [
          atStops(0, 'dragon', [
            {
              stop: reportedStop(1, { name: 'https://evil.test/x', address: null, ...FAR }),
              reporter: { id: '200000000000001000', name: 'Misty' },
            },
            {
              stop: reportedStop(2, { name: 'www.example.test', address: null, ...FAR }),
              reporter: { id: '200000000000001001', name: 'Brock' },
            },
          ]),
        ],
      };
      for (const text of [
        textOf(stopPostMessages(view).messages[0]),
        stopPostText(view).messages[0]?.content ?? '',
      ]) {
        expect(text).toContain(`- **[https:\u200B//evil.\u200Btest/x](<${URL}>)** · **Misty**`);
        expect(text).toContain(`- **[www.\u200Bexample.test](<${URL}>)** · **Brock**`);
      }
    });

    it('fits a busy day by the old rules: as many whole lines as the room holds, links never cut (R7)', () => {
      const stops = Array.from({ length: 15 }, (_, i) => ({
        stop: reportedStop(i + 1, {
          name: `Stop ${String(i + 10)} ${'n'.repeat(62)}`,
          address: `${String(1000 + i)} ${'a'.repeat(65)}`,
          ...FAR,
        }),
        reporter: { id: `20000000000000${String(1000 + i)}`, name: `Reporter ${'r'.repeat(21)}` },
      }));
      const view = { day: 'Saturday, November 21', tasks: [atStops(0, 'dragon', stops)] };
      const line = (i: number) =>
        `- **[${stops[i]!.stop.name}](<${URL}>)** · ${stops[i]!.stop.address!} · ` +
        `**${stops[i]!.reporter.name}**`;
      const length = line(0).length;
      const more = (left: number) => `- …and ${String(left)} more stop${left === 1 ? '' : 's'}`;
      /** How many lines fit `room` after the head, the line counting the rest kept: `fill`'s rule. */
      const fitting = (head: string, room: number): number => {
        let n = 0;
        while (
          n < 15 &&
          head.length + (n + 1) * (1 + length) + (n + 1 < 15 ? 1 + more(14 - n).length : 0) <= room
        ) {
          n += 1;
        }
        return n;
      };
      const [v2, ...spilt] = stopPostMessages(view).messages;
      const [classic] = stopPostText(view).messages;
      expect(spilt).toEqual([]);
      // The room of a block's text, a message's and the plain text's.
      for (const [text, room] of [
        [textOf(v2), BLOCK_ROOM],
        [classic?.content ?? '', CLASSIC_BLOCK_ROOM],
      ] as const) {
        const lines = text.split('\n');
        const head = lines.find((one) => one.startsWith('**Catch a Dragon-type Pokémon**')) ?? '';
        const shown = fitting(head, room);
        expect(shown).toBeLessThan(15);
        const linked = lines.filter((one) => one.startsWith('- **['));
        expect(linked).toEqual(Array.from({ length: shown }, (_, i) => line(i)));
        expect(lines).toContain(more(15 - shown));
      }
      // The pictures as before: the task's, beside it.
      expect(JSON.stringify(v2)).toContain(ENCOUNTER_PICTURE);
    });
  });

  describe('the hideouts of Team GO Rocket (plan 8R-2)', () => {
    const hideout = (key: string, n: number): PostHideout => ({
      key,
      name: feedChoice(key).name,
      catches: feedChoice(key).catches,
      stops: Array.from({ length: n }, (_, i) => ({
        stop: reportedStop(i + 1, { name: `Hideout stop ${String(i + 1)}`, address: null }),
        reporter: { id: `20000000000000${String(2000 + i)}`, name: `Grunt fan ${String(i)}` },
      })),
    });

    it('come after the research, each with what can be caught and its stops', () => {
      const layout = stopPostMessages({
        day: 'Saturday, November 21',
        tasks: [atStops(1)],
        hideouts: [hideout('giovanni', 1), hideout('leader:arlo', 2)],
      });
      const text = textOf(layout.messages[0]);
      expect(text).toContain('-# Saturday, November 21 · field research and Team GO Rocket');
      const research = text.indexOf('Catch a Dragon-type Pokémon');
      const rocket = text.indexOf('### Team GO Rocket hideouts');
      expect(research).toBeGreaterThan(0);
      expect(rocket).toBeGreaterThan(research);
      expect(text.slice(rocket)).toContain(
        `**Giovanni** · catch Zekrom\n- ${named(1, 'Hideout stop 1')} · **Grunt fan 0**`,
      );
      expect(text.slice(rocket)).toContain(
        `**Arlo** · catch Alolan Grimer\n- ${named(1, 'Hideout stop 1')} · **Grunt fan 0**\n` +
          `- ${named(2, 'Hideout stop 2')} · **Grunt fan 1**`,
      );
      expect(layout.placement.get('giovanni')).toBe(0);
      expect(layout.placement.get('leader:arlo')).toBe(0);
      expectV2Sendable(layout.messages[0]!);
    });

    it('make the post without research, and say what is reported where nothing is', () => {
      const [only] = stopPostMessages({
        day: 'Saturday, November 21',
        tasks: [],
        hideouts: [hideout('decoy', 1)],
      }).messages;
      expect(textOf(only)).not.toContain('Nothing reported right now.');
      expect(textOf(only)).toContain('**Decoy grunt** · catch Bellsprout');
      const [empty] = stopPostMessages({
        day: 'Saturday, November 21',
        tasks: [],
        hideouts: [],
      }).messages;
      expect(textOf(empty)).toContain(
        'Nothing reported right now. `/research report` and `/rocket report` tell the region what a stop has.',
      );
    });

    it('spill after a full research into the next messages, counted at the end', () => {
      const tasks = Array.from({ length: 100 }, (_, i) => atStops(10, `task-${String(i)}`));
      const hideouts = [hideout('giovanni', 3), hideout('leader:cliff', 3)];
      for (const layout of [
        stopPostMessages({ day: 'Saturday, November 21', tasks, hideouts }),
        stopPostText({ day: 'Saturday, November 21', tasks, hideouts }),
      ]) {
        expect(layout.messages).toHaveLength(MAX_POST_MESSAGES);
        expect(layout.placement.get('giovanni')).toBeUndefined();
        const last = JSON.stringify(layout.messages.at(-1));
        expect(last).toMatch(/…and \d+ more tasks and 2 more hideouts/);
      }
    });

    it('spill a busy day into as many as ten messages rather than cut a hideout (plan 8R-9F)', () => {
      const tasks = Array.from({ length: 6 }, (_, i) => atStops(10, `task-${String(i)}`));
      const hideouts = [hideout('giovanni', 3), hideout('leader:cliff', 3)];
      for (const layout of [
        stopPostMessages({ day: 'Saturday, November 21', tasks, hideouts }),
        stopPostText({ day: 'Saturday, November 21', tasks, hideouts }),
      ]) {
        expect(layout.messages.length).toBeGreaterThan(3);
        expect(layout.messages.length).toBeLessThanOrEqual(10);
        expect(layout.placement.get('giovanni')).toBe(layout.messages.length - 1);
        expect(JSON.stringify(layout.messages)).not.toMatch(/…and \d+ more (tasks|hideout)/);
      }
    });

    it('is plain text too, after the research', () => {
      const { messages, placement } = stopPostText({
        day: 'Saturday, November 21',
        tasks: [atStops(1)],
        hideouts: [hideout('leader:sierra', 1)],
      });
      expect(messages[0]?.content).toContain(
        `### Team GO Rocket hideouts\n**Sierra** · catch Pancham\n- ${named(1, 'Hideout stop 1')} · **Grunt fan 0**`,
      );
      expect(placement.get('leader:sierra')).toBe(0);
    });
  });

  it('says which message holds each task, and none for a task counted only', () => {
    const many = Array.from({ length: 30 }, (_, i) => atStops(10, `task-${String(i)}`));
    for (const layout of [
      stopPostMessages({ day: 'Saturday, November 21', tasks: many }),
      stopPostText({ day: 'Saturday, November 21', tasks: many }),
    ]) {
      expect(layout.placement.get('task-0')).toBe(0);
      const last = Math.max(...layout.placement.values());
      expect(last).toBe(layout.messages.length - 1);
      expect(layout.placement.get('task-29')).toBeUndefined();
      const lastTask = [...layout.placement].find(([, index]) => index === last)?.[0];
      expect(JSON.stringify(layout.messages[last])).toContain('Stop xxx');
      expect(lastTask).toBeDefined();
    }
  });
});

/** A part of a post's message: a text display, or a section's text with its picture. */
interface Piece {
  text: string;
  picture?: string;
}

/** The parts of a post's message in order, separators left out. */
function piecesOf(message: V2Message | undefined): Piece[] {
  const [box] = message?.components ?? [];
  const parts = (box as { components?: unknown[] } | undefined)?.components ?? [];
  return parts.flatMap((part): Piece[] => {
    const one = part as {
      type: ComponentType;
      content?: string;
      components?: { content: string }[];
      accessory?: { media: { url: string } };
    };
    if (one.type === ComponentType.TextDisplay) return [{ text: one.content ?? '' }];
    if (one.type === ComponentType.Section) {
      return [
        {
          text: one.components?.[0]?.content ?? '',
          ...(one.accessory ? { picture: one.accessory.media.url } : {}),
        },
      ];
    }
    return [];
  });
}

/** Every picture of a post's messages, in order. */
function picturesIn(messages: readonly V2Message[]): string[] {
  return messages.flatMap((message) =>
    piecesOf(message).flatMap((piece) => (piece.picture === undefined ? [] : [piece.picture])),
  );
}

describe('the pictures of the post (plan 8R-6)', () => {
  const DAY = 'Saturday, November 21';
  const [LILEEP, ANORITH] = pageTask('Make 3 Great Throws in a row').rewards;
  const item = (name: string): TaskReward => ({
    kind: 'item',
    item: name.toLowerCase().replace(/ /g, '-'),
    name,
    quantity: 1,
    image: `https://cdn.leekduck.com/assets/img/items/${name.replace(/ /g, '%20')}.png`,
  });
  const by = (n: number, name = `Stop ${String(n)}`) => ({
    stop: reportedStop(n, { name, address: null }),
    reporter: { id: `20000000000000${String(1000 + n)}`, name: `Member ${String(n)}` },
  });
  /** A task of these versions, each at one stop of its own (or `stops` each). */
  const taskOf = (
    key: string,
    versions: readonly (readonly TaskReward[])[],
    stops = 1,
  ): PostTask => ({
    key,
    research: { text: `Task ${key}`, category: null, rewards: [], typed: false },
    versions: versions.map((rewards, v) => ({
      key: `${key}:${String(v)}`,
      rewards,
      stops: Array.from({ length: stops }, (_, i) => by(100 * v + i + 1)),
    })),
  });

  it('gives every reward line its picture and "one of" the encounter picture, the task’s text a line above', () => {
    const task = taskOf('throws', [[LILEEP!], [item('Rare Candy')], [LILEEP!, ANORITH!], []]);
    const [message] = stopPostMessages({ day: DAY, tasks: [task] }).messages;
    const pieces = piecesOf(message).slice(1);
    expect(pieces).toEqual([
      { text: '**Task throws**' },
      { text: `Lileep\n- ${named(1)} · **Member 1**`, picture: LILEEP!.image },
      {
        text: `Rare Candy ×1\n- ${named(101)} · **Member 101**`,
        picture: item('Rare Candy').image,
      },
      {
        text: `one of Lileep, Anorith\n- ${named(201)} · **Member 201**`,
        picture: ENCOUNTER_PICTURE,
      },
      // A line without a picture: text alone.
      { text: `reward not said\n- ${named(301)} · **Member 301**` },
    ]);
  });

  it('keeps one block for a task of one version, "one of" with the encounter picture', () => {
    const [message] = stopPostMessages({
      day: DAY,
      tasks: [taskOf('one', [[LILEEP!, ANORITH!]], 2)],
    }).messages;
    expect(piecesOf(message).slice(1)).toEqual([
      {
        text: `**Task one** · one of Lileep, Anorith\n- ${named(1)} · **Member 1**\n- ${named(2)} · **Member 2**`,
        picture: ENCOUNTER_PICTURE,
      },
    ]);
  });

  it('pictures at most six lines of a task, Pokémon first, and puts lines without one in one text', () => {
    const items = ['Poke Ball', 'Great Ball', 'Ultra Ball', 'Razz Berry'].map((name) => [
      item(name),
    ]);
    const pokemon = Array.from({ length: 5 }, () => [LILEEP!]);
    const task = taskOf('many', [...items, ...pokemon]);
    const [message] = stopPostMessages({ day: DAY, tasks: [task] }).messages;
    expect(picturesIn([message!])).toEqual([
      item('Poke Ball').image,
      ...pokemon.map(() => LILEEP!.image),
    ]);
    // The task's text and the three items without a picture after the first: two texts.
    const texts = piecesOf(message)
      .slice(1)
      .filter((piece) => piece.picture === undefined);
    expect(texts.map((piece) => piece.text)).toEqual([
      '**Task many**',
      [
        'Great Ball ×1',
        `- ${named(101)} · **Member 101**`,
        'Ultra Ball ×1',
        `- ${named(201)} · **Member 201**`,
        'Razz Berry ×1',
        `- ${named(301)} · **Member 301**`,
      ].join('\n'),
    ]);
    expectV2Sendable(message!);
  });

  it('gives a version with no stop shown no picture (the fifteen stops of a task)', () => {
    const task = taskOf('full', [[LILEEP!], [item('Rare Candy')]], 15);
    const [message] = stopPostMessages({ day: DAY, tasks: [task] }).messages;
    expect(picturesIn([message!])).toEqual([LILEEP!.image]);
    expect(textOf(message)).toContain('- …and 15 more stops');
    expect(textOf(message)).not.toContain('Rare Candy');
  });

  it('shows a leader’s and Giovanni’s portrait, a decoy’s one catch, and the encounter picture for a decoy of several', () => {
    const hideout = (key: string, catches = feedChoice(key).catches): PostHideout => ({
      key,
      name: feedChoice(key).name,
      catches,
      stops: [by(1, 'Hideout stop')],
    });
    const decoy = feedChoice('decoy').catches;
    const layout = stopPostMessages({
      day: DAY,
      tasks: [],
      hideouts: [
        hideout('giovanni'),
        hideout('leader:cliff'),
        hideout('decoy'),
        hideout('decoy', [...decoy, ...feedChoice('leader:arlo').catches]),
      ],
    });
    expect(picturesIn(layout.messages)).toEqual([
      GIOVANNI_PORTRAIT,
      LEADER_PORTRAITS.cliff,
      decoy[0]!.image,
      ENCOUNTER_PICTURE,
    ]);
    // The heading stands on its own, the Pokémon caught stay in the text.
    const pieces = piecesOf(layout.messages[0]);
    expect(pieces[1]).toEqual({ text: '### Team GO Rocket hideouts' });
    expect(pieces[2]?.text).toContain('**Giovanni** · catch Zekrom');
  });

  it('names each picture as the lookup gives it, and lists every source for `prepare`', () => {
    const view = {
      day: DAY,
      tasks: [taskOf('throws', [[LILEEP!], [LILEEP!, ANORITH!]])],
      hideouts: [
        {
          key: 'leader:arlo',
          name: 'Arlo',
          catches: feedChoice('leader:arlo').catches,
          stops: [by(9)],
        },
      ],
    };
    const looked = (source: string) =>
      `https://map.example.test/pictures/${String(source.length)}.png`;
    expect(picturesIn(stopPostMessages(view, looked).messages)).toEqual(
      [LILEEP!.image!, ENCOUNTER_PICTURE, LEADER_PORTRAITS.arlo].map(looked),
    );
    expect(postPictures(view)).toEqual([LILEEP!.image, ENCOUNTER_PICTURE, LEADER_PORTRAITS.arlo]);
  });

  it('asks `prepare` only for the pictures the layout shows', () => {
    const items = ['Poke Ball', 'Great Ball', 'Ultra Ball', 'Razz Berry'].map((name) => [
      item(name),
    ]);
    // Six pictures of a task at most: of four items and five Pokémon, the first item's alone.
    const many = taskOf('many', [...items, ...Array.from({ length: 5 }, () => [LILEEP!])]);
    expect(postPictures({ day: DAY, tasks: [many] })).toEqual([
      LILEEP!.image,
      item('Poke Ball').image,
    ]);
    // A version with no stop shown, the day's research under a window: none.
    const full = taskOf('full', [[LILEEP!], [item('Rare Candy')]], 15);
    const waiting = { at: Date.UTC(2026, 10, 21, 22), tasks: [taskOf('day', [[ANORITH!]])] };
    expect(postPictures({ day: DAY, tasks: [full], waiting })).toEqual([LILEEP!.image]);
  });

  it('asks `prepare` for the pictures the lookup draws: a source gone frees its place for the seventh line', () => {
    const own = (n: number): TaskReward => ({ ...LILEEP!, image: `${LILEEP!.image!}?n=${n}` });
    const sources = Array.from({ length: 7 }, (_, n) => own(n).image!);
    const view = {
      day: DAY,
      tasks: [
        taskOf(
          'seven',
          sources.map((_, n) => [own(n)]),
        ),
      ],
    };
    const gone = (source: string) => (source === sources[0] ? undefined : source);
    expect(postPictures(view)).toEqual(sources.slice(0, 6));
    // The gone one stays listed: `prepare` asks for it again once its failure is old.
    expect(postPictures(view, gone)).toEqual(sources);
    expect(picturesIn(stopPostMessages(view, gone).messages)).toEqual(sources.slice(1));
  });

  it('shows no picture where the lookup names none (a source gone), the line’s text kept', () => {
    const view = {
      day: DAY,
      tasks: [taskOf('throws', [[LILEEP!], [item('Rare Candy')]])],
      hideouts: [{ key: 'leader:arlo', name: 'Arlo', catches: [], stops: [by(9)] }],
    };
    const gone = new Set([LEADER_PORTRAITS.arlo, LILEEP!.image]);
    const { messages } = stopPostMessages(view, (source) =>
      gone.has(source) ? undefined : source,
    );
    expect(picturesIn(messages)).toEqual([item('Rare Candy').image]);
    expect(textOf(messages[0])).toContain('**Arlo**');
    expect(textOf(messages[0])).toContain('Lileep');
    expectV2Sendable(messages[0]!);
  });

  it('shows a hideout without its portrait when the portrait answers 404, and with the feed’s address when it answers 500 (StopPictures)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pine-pictures-'));
    onTestFinished(() => {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    });
    const status: Record<string, number> = {
      [LEADER_PORTRAITS.cliff]: 404,
      [LEADER_PORTRAITS.arlo]: 500,
    };
    const pictures = new StopPictures({
      settings: {
        web: {
          port: 8080,
          host: '127.0.0.1',
          publicUrl: 'https://map.example.test',
          trustProxy: false,
          tiles: 'osm',
        },
      },
      folder: dir,
      fetch: (url) =>
        Promise.resolve({
          ...bytesResponse(new Uint8Array(0), { status: status[url] ?? 500 }),
          ok: false,
        }),
      log: createTestLogger().log,
    });
    const hideout = (leader: 'cliff' | 'arlo'): PostHideout => ({
      key: `leader:${leader}`,
      name: leader === 'cliff' ? 'Cliff' : 'Arlo',
      catches: [],
      stops: [by(leader === 'cliff' ? 1 : 2)],
    });
    const view = { day: DAY, tasks: [], hideouts: [hideout('cliff'), hideout('arlo')] };
    await pictures.prepare(postPictures(view));
    pictures.serving();
    const { messages } = stopPostMessages(view, (source) => pictures.url(source));
    expect(picturesIn(messages)).toEqual([LEADER_PORTRAITS.arlo]);
    expect(textOf(messages[0])).toContain('**Cliff**');
    expectV2Sendable(messages[0]!);
  });

  describe('a busy day, decided for the whole post (Matt, 2026-10-24: no task is cut for pictures)', () => {
    /** A Pokémon of a picture of its own: task `t`, version `v`. */
    const own = (t: number, v = 0): TaskReward => ({
      ...LILEEP!,
      image: `${LILEEP!.image!}?t=${String(t)}&v=${String(v)}`,
    });
    /** `n` tasks of `versions` Pokémon versions each, every version at `stops` stops. */
    const pokemonTasks = (n: number, versions: number, stops: number): PostTask[] =>
      Array.from({ length: n }, (_, t) =>
        taskOf(
          `busy${String(t)}`,
          Array.from({ length: versions }, (_, v) => [own(t, v)]),
          stops,
        ),
      );
    /** `n` tasks of a Pokémon and an item. */
    const mixedTasks = (n: number): PostTask[] =>
      Array.from({ length: n }, (_, t) =>
        taskOf(`mixed${String(t)}`, [[own(t)], [item('Rare Candy')]]),
      );
    /** The layout of these tasks, checked to place every one within Discord's limits. */
    const placingEvery = (tasks: PostTask[], picture?: (source: string) => string | undefined) => {
      const layout = stopPostMessages({ day: DAY, tasks }, picture);
      expect(tasks.filter((task) => !layout.placement.has(task.key))).toEqual([]);
      expect(layout.messages.map((message) => textOf(message)).join('\n')).not.toContain(
        'more task',
      );
      for (const message of layout.messages) expectV2Sendable(message);
      return layout;
    };

    it.each([
      [20, 2, 1],
      [20, 3, 1],
      [12, 3, 2],
    ])(
      'places every task of %i tasks of %i versions at %i stop(s) each (the review’s cases)',
      (n, versions, stops) => {
        placingEvery(pokemonTasks(n, versions, stops));
      },
    );

    it('keeps every picture where every task fits with them, in more than one message too', () => {
      const tasks = mixedTasks(10);
      const { messages } = placingEvery(tasks);
      expect(messages.length).toBeGreaterThan(1);
      expect(picturesIn(messages)).toEqual(
        tasks.flatMap((_, t) => [own(t).image, item('Rare Candy').image]),
      );
    });

    it('lets the item and Mega Energy pictures go first, and keeps the Pokémon’s', () => {
      const tasks = mixedTasks(50);
      const layout = placingEvery(tasks);
      expect(picturesIn(layout.messages)).toEqual(tasks.map((_, t) => own(t).image));
      // The same input, the same layout: redraws do not flicker.
      expect(stopPostMessages({ day: DAY, tasks })).toEqual(layout);
    });

    it('then keeps one picture per task, its first pictured line', () => {
      const tasks = pokemonTasks(40, 3, 2);
      const { messages } = placingEvery(tasks);
      expect(picturesIn(messages)).toEqual(tasks.map((_, t) => own(t, 0).image));
      // Its first line by the order of the six: a Pokémon before an item listed above it.
      const first = taskOf('first', [[item('Rare Candy')], [own(99)], [own(98)]]);
      const both = placingEvery([first, ...tasks]);
      expect(picturesIn(both.messages)[0]).toBe(own(99).image);
    });

    it('then shows no picture rather than cut a task', () => {
      expect(picturesIn(placingEvery(pokemonTasks(70, 3, 1)).messages)).toEqual([]);
    });

    it('spills and counts tasks away, without pictures, only when even that does not place every task', () => {
      const tasks = pokemonTasks(250, 3, 1);
      const { messages, placement } = stopPostMessages({ day: DAY, tasks });
      expect(messages).toHaveLength(MAX_POST_MESSAGES);
      for (const message of messages) expectV2Sendable(message);
      expect(textOf(messages.at(-1))).toMatch(/…and \d+ more tasks/);
      expect(tasks.filter((task) => placement.has(task.key)).length).toBeLessThan(tasks.length);
      expect(picturesIn(messages)).toEqual([]);
    });

    // Review W5 of 8R-7: pictures cost components, not text, so on a day limited by text dropping
    // them places no more tasks; Matt's rule is about tasks.
    it('keeps every picture on a day limited by text, tasks spilling as they must', () => {
      const tasks: PostTask[] = Array.from({ length: 20 }, (_, t) => ({
        key: `long${String(t)}`,
        research: { text: `Task long${String(t)}`, category: null, rewards: [], typed: false },
        versions: [
          {
            key: `long${String(t)}:0`,
            rewards: [own(t)],
            stops: Array.from({ length: 15 }, (_, i) => ({
              stop: reportedStop(100 * t + i + 1, {
                name: `Stop ${String(t)}-${String(i)} ${'n'.repeat(70)}`,
                address: 'a'.repeat(70),
              }),
              reporter: { id: `2000000000000${String(10_000 + 100 * t + i)}`, name: 'Member' },
            })),
          },
        ],
      }));
      const { messages, placement } = stopPostMessages({ day: DAY, tasks });
      for (const message of messages) expectV2Sendable(message);
      const placed = tasks.filter((task) => placement.has(task.key));
      expect(placed.length).toBeGreaterThan(0);
      expect(placed.length).toBeLessThan(tasks.length);
      expect(textOf(messages.at(-1))).toContain(
        `…and ${String(tasks.length - placed.length)} more tasks`,
      );
      expect(picturesIn(messages)).toEqual(placed.map((_, t) => own(t).image));
      expect(postPictures({ day: DAY, tasks })).toEqual(placed.map((_, t) => own(t).image));
    });

    it('asks `prepare` only for what the chosen layout shows, with the same lookup', () => {
      for (const tasks of [
        mixedTasks(10),
        mixedTasks(50),
        pokemonTasks(40, 3, 2),
        pokemonTasks(70, 3, 1),
      ]) {
        const view = { day: DAY, tasks };
        // Each source once.
        expect(postPictures(view)).toEqual([
          ...new Set(picturesIn(stopPostMessages(view).messages)),
        ]);
      }
      // One picture per task: a source gone gives its place to the task’s next line, both asked for.
      const tasks = pokemonTasks(40, 3, 2);
      const gone = (source: string) => (source === own(0, 0).image ? undefined : source);
      const view = { day: DAY, tasks };
      expect(postPictures(view, gone)).toEqual([
        own(0, 0).image,
        own(0, 1).image,
        ...tasks.slice(1).map((_, t) => own(t + 1, 0).image),
      ]);
      expect(picturesIn(placingEvery(tasks, gone).messages)).toEqual(
        postPictures(view, gone).slice(1),
      );
    });
  });

  it('keeps the day’s research under an event’s window last, after the window’s tasks and the hideouts, without pictures', () => {
    const at = Date.UTC(2026, 10, 21, 22);
    const view = {
      day: DAY,
      event: 'Pawniard Community Day',
      until: 'until 5:00 PM',
      tasks: [taskOf('window', [[LILEEP!]])],
      waiting: { at, tasks: [taskOf('day', [[ANORITH!], [item('Rare Candy')]])] },
      hideouts: [{ key: 'giovanni', name: 'Giovanni', catches: [], stops: [by(7)] }],
    };
    const layout = stopPostMessages(view);
    const text = textOf(layout.messages[0]);
    const heading = `### Back at <t:${String(at / 1_000)}:t>, after Pawniard Community Day`;
    expect(text.indexOf('**Task window**')).toBeGreaterThan(0);
    // The hideouts belong to the day and come before it (Matt, 2026-10-24: so it is cut first).
    expect(text.indexOf('### Team GO Rocket hideouts')).toBeGreaterThan(
      text.indexOf('**Task window**'),
    );
    expect(text.indexOf(heading)).toBeGreaterThan(text.indexOf('**Giovanni**'));
    expect(text.indexOf('**Task day**')).toBeGreaterThan(text.indexOf(heading));
    expect(text).not.toContain('comes back');
    expect(picturesIn(layout.messages)).toEqual([LILEEP!.image, GIOVANNI_PORTRAIT]);
    expect(layout.placement.get('day')).toBe(0);
    const classic = stopPostText(view).messages[0]?.content ?? '';
    expect(classic.indexOf('**Task day**')).toBeGreaterThan(classic.indexOf(heading));
    // Only the day's research waiting: something is reported.
    const waitingOnly = stopPostMessages({ ...view, tasks: [], hideouts: [] });
    expect(textOf(waitingOnly.messages[0])).not.toContain('Nothing reported right now.');
    expect(textOf(waitingOnly.messages[0])).toContain(heading);
  });

  it('cuts only the day’s research waiting on a busy event day, the hideouts placed', () => {
    const waiting = Array.from({ length: 100 }, (_, n) =>
      taskOf(`day${String(n)}`, [[LILEEP!], [ANORITH!], [item('Rare Candy')]], 5),
    );
    const hideouts: PostHideout[] = [
      'giovanni',
      'leader:cliff',
      'leader:arlo',
      'leader:sierra',
    ].map((key, n) => ({
      key,
      name: feedChoice(key).name,
      catches: feedChoice(key).catches,
      stops: [by(500 + n, 'Hideout stop')],
    }));
    const view = {
      day: DAY,
      event: 'Pawniard Community Day',
      until: 'until 5:00 PM',
      tasks: [taskOf('window', [[LILEEP!]], 3)],
      waiting: { at: Date.UTC(2026, 10, 21, 22), tasks: waiting },
      hideouts,
    };
    for (const layout of [stopPostMessages(view), stopPostText(view)]) {
      expect(layout.messages).toHaveLength(MAX_POST_MESSAGES);
      for (const key of ['window', ...hideouts.map((hideout) => hideout.key)]) {
        expect(layout.placement.has(key)).toBe(true);
      }
      expect(waiting.filter((task) => !layout.placement.has(task.key)).length).toBeGreaterThan(0);
      const last = JSON.stringify(layout.messages.at(-1));
      expect(last).toMatch(/…and \d+ more tasks?"/);
      expect(last).not.toContain('more hideout');
    }
  });
});
