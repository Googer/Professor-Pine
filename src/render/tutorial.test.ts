import { ComponentType, createComponent } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { commands } from '../commands/index.js';
import { declaredSubcommands } from '../discord/command.js';
import {
  isTutorialMessage,
  TUTORIAL_MARK,
  tutorialMessages,
  tutorialPlan,
  type TutorialFacts,
} from './tutorial.js';

const ALL = new Set(['want', 'maps', 'raid']);
const FACTS: TutorialFacts = {
  commands: ALL,
  screenshots: true,
  liveMap: true,
  hasStops: true,
  meetupsChecked: true,
  icons: {},
};

const textsOf = (facts: TutorialFacts): string[] =>
  tutorialMessages(facts).map((message) => JSON.stringify(message.components));
const allText = (facts: TutorialFacts): string => textsOf(facts).join('\n');

describe('the course', () => {
  it('is one marked message per block, each within what Discord takes', () => {
    const messages = tutorialMessages(FACTS);
    expect(messages).toHaveLength(7);
    for (const message of messages) {
      FakePartyGateway.checkV2(message);
      expect(message.components).toHaveLength(1);
      expect((message.components[0] as { id?: number }).id).toBe(TUTORIAL_MARK);
    }
  });

  it('reads as the old tutorial did: its headings and its welcome', () => {
    const text = allText(FACTS);
    expect(text).toContain('__**Meet Professor Pine!**__');
    expect(text).toContain('our friendly neighborhood raid bot');
    expect(text).toContain('__**Joining a Raid**__');
  });

  it('names only commands the bot has', () => {
    const names = new Set(
      commands.flatMap((command) => {
        const json = command.data.toJSON();
        return [
          json.name,
          ...declaredSubcommands(json.options).map((path) => `${json.name} ${path}`),
        ];
      }),
    );
    const said = [...allText(FACTS).matchAll(/`\/([a-z-]+(?: [a-z-]+)?)`/gu)].map(
      (match) => match[1] ?? '',
    );
    expect(said.length).toBeGreaterThan(10);
    for (const name of said) expect(names, name).toContain(name);
  });

  it('leaves out what this server does not have', () => {
    expect(allText({ ...FACTS, screenshots: false })).not.toContain('via Screenshot');
    const noStops = allText({ ...FACTS, hasStops: false });
    expect(noStops).not.toContain('/research report');
    expect(noStops).not.toContain('/rocket report');
    expect(noStops).toContain('/max');
    expect(noStops).not.toContain('research rewards');
    expect(allText(FACTS)).toContain('research rewards');
    expect(allText({ ...FACTS, meetupsChecked: false })).not.toContain('moderators');
  });

  it('says what /maps gives here, and nothing where it is not there', () => {
    expect(allText(FACTS)).toContain('opens the live map');
    expect(allText({ ...FACTS, liveMap: false })).toContain('shows the map of all regions');
    expect(allText({ ...FACTS, commands: new Set(['want']) })).not.toContain('/maps');
  });

  it('drops a block with nothing left in it, heading and all', () => {
    const off = tutorialMessages({ ...FACTS, commands: new Set(['maps']) });
    expect(off).toHaveLength(6);
    expect(JSON.stringify(off)).not.toContain('Get Notified');
  });

  it('shows the icons of the post, plain until the application has its own', () => {
    expect(allText(FACTS)).toContain('👋 Leave');
    expect(allText(FACTS)).toContain('📡 Raiding remotely');
    const custom = allText({
      ...FACTS,
      icons: { controlIcon: (name) => `<:${name}:123456789012345678>` },
    });
    expect(custom).toContain('<:pineleave:123456789012345678> Leave');
    expect(custom).toContain('<:pinejoin:123456789012345678> Join');
    expect(custom).toContain('<:pineremote:123456789012345678> Raiding remotely');
  });

  it('pings nobody: no mention markup in any block', () => {
    expect(allText(FACTS)).not.toMatch(/<@/u);
  });
});

describe('what a run does', () => {
  it('posts everything the first time', () => {
    expect(tutorialPlan([], 3)).toEqual({ edits: [], posts: [0, 1, 2], deletes: [] });
  });

  it('edits in place when run again', () => {
    expect(tutorialPlan(['a', 'b'], 2)).toEqual({
      edits: [
        { id: 'a', block: 0 },
        { id: 'b', block: 1 },
      ],
      posts: [],
      deletes: [],
    });
  });

  it('adds what a longer course needs, and deletes what a shorter one does not', () => {
    expect(tutorialPlan(['a'], 2).posts).toEqual([1]);
    expect(tutorialPlan(['a', 'b', 'c'], 2).deletes).toEqual(['c']);
  });
});

describe('which messages are its own', () => {
  const BOT = '42';
  const marked = [{ id: TUTORIAL_MARK }];

  it('reads the mark where discord.js puts it on a message it fetched', () => {
    const container = createComponent({
      type: ComponentType.Container,
      id: TUTORIAL_MARK,
      components: [],
    });
    expect(isTutorialMessage({ author: { id: BOT }, components: [container] }, BOT)).toBe(true);
  });

  it('only Pine’s, and only marked', () => {
    expect(isTutorialMessage({ author: { id: BOT }, components: marked }, BOT)).toBe(true);
    // A moderators' request of Pine's stays what it is, however the channel was used.
    expect(isTutorialMessage({ author: { id: BOT }, components: [{ id: 1 }] }, BOT)).toBe(false);
    expect(isTutorialMessage({ author: { id: BOT }, components: [] }, BOT)).toBe(false);
    expect(isTutorialMessage({ author: { id: '7' }, components: marked }, BOT)).toBe(false);
  });
});
