import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bossCommandsWith,
  MEMBER,
  MODERATOR,
  textsOf,
} from '../../../test/support/boss-commands.js';
import { FEED_READ_AT, feedReply, readRaidBossFeed } from '../../../test/support/raid-bosses.js';
import type { NewBossOverride } from '../../domain/pogo/raid-bosses.js';
import type { RaidTier } from '../../domain/pogo/raid-tier.js';
import { fitMessages } from '../../render/text.js';
import { keptTogether } from './boss-list.js';
import { operator } from './index.js';

const T3: RaidTier = { level: 'T3', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };
const DAY = 24 * 60 * 60 * 1000;
const at = (ms: number) => String(Math.floor(ms / 1000));

function override(extra: Partial<NewBossOverride>): NewBossOverride {
  return {
    action: 'add',
    pokemonId: 'ZEKROM',
    form: null,
    tier: T5,
    shiny: null,
    expiresAt: null,
    createdBy: MODERATOR,
    ...extra,
  };
}

/** The feed as downloaded, with these entries added. */
function feedWith(...more: object[]): string {
  return JSON.stringify([...(readRaidBossFeed() as object[]), ...more]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FEED_READ_AT + DAY);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('/operator boss: who may use it', () => {
  it('is a group of /operator with list and sync', () => {
    const json = operator.data.toJSON();
    const group = json.options?.find((option) => option.name === 'boss');
    expect(group?.description).toBe(
      'The raid and max boss lists: what the feeds say, and your changes to them',
    );
    expect([...operator.subcommands.keys()]).toEqual(
      expect.arrayContaining(['boss list', 'boss sync']),
    );
  });

  it('refuses a member who is not staff', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'list', {}, { userId: MEMBER, roleNames: [] });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'Only admins, moderators and bot developers can do that.',
      flags: MessageFlags.Ephemeral,
    });
    const synced = await made.use('boss', 'sync', {}, { userId: MEMBER, roleNames: [] });
    expect(synced.reply).toHaveBeenCalledTimes(1);
    expect(made.bosses.state.requests).toBe(0);
  });
});

describe('/operator boss list', () => {
  it('shows the bosses tier by tier, how each was found, and when the feed was read', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'list');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const text = textsOf(used).join('\n');
    expect(text).toContain(`**Raid bosses** · the feed was read <t:${at(FEED_READ_AT)}:R>`);
    expect(text).toContain('**T5** · eggs hatch as Yveltal');
    expect(text).toContain(
      `- **Yveltal** · shiny · from the feed, found by picture and name, since <t:${at(FEED_READ_AT)}:d>`,
    );
    expect(text).toContain('**Shadow T5** · eggs hatch as Landorus (Incarnate Forme)');
    expect(text).toContain('**T3**\n- **Gothitelle**');
    // The costume is found by its picture: its form is newer than the game data.
    expect(text).toMatch(/- \*\*Pikachu\*\* · shiny · from the feed, found by .*/);
    expect(text).not.toContain('Hidden');
  });

  it('shows one tier when asked', async () => {
    const made = await bossCommandsWith();
    const text = textsOf(await made.use('boss', 'list', { tier: 'T3' })).join('\n');
    expect(text).toContain('**T3**');
    expect(text).not.toContain('Yveltal');
    expect(text).not.toContain('Shadow T3');
    const shadow = textsOf(await made.use('boss', 'list', { tier: 'T3:shadow' })).join('\n');
    expect(shadow).toContain('**Shadow T3**\n- **Drapion**');
    const none = textsOf(await made.use('boss', 'list', { tier: 'Elite' })).join('\n');
    expect(none).toContain('That tier has no bosses.');
  });

  it('marks the overrides, lists hidden bosses and idle overrides apart, and old ones', async () => {
    const created = FEED_READ_AT - 31 * DAY;
    const made = await bossCommandsWith({
      overrides: [
        override({ action: 'add', pokemonId: 'ZEKROM', expiresAt: FEED_READ_AT + 30 * DAY }),
        override({ action: 'hide', pokemonId: 'STARMIE', tier: T3 }),
        override({ action: 'autoset', pokemonId: 'MEWTWO', tier: T5 }),
        override({ action: 'shiny', pokemonId: 'YVELTAL', tier: null, shiny: false }),
        override({ action: 'hide', pokemonId: 'MEWTWO', tier: T5 }),
        override({ action: 'hide', pokemonId: 'CELEBI', tier: T5 }),
      ],
    });
    // Saved at the service's clock; one of them made old by hand.
    const [, , , , , celebi] = await made.bosses.store.listOverrides();
    if (celebi) {
      await made.bosses.store.removeOverride(celebi.id);
      await made.bosses.store.saveOverride(
        override({ action: 'hide', pokemonId: 'CELEBI', tier: T5 }),
        created,
      );
      await made.bosses.service.load();
    }
    const text = textsOf(await made.use('boss', 'list')).join('\n');
    expect(text).toContain(`- **Zekrom** · added (#1, until <t:${at(FEED_READ_AT + 30 * DAY)}:d>)`);
    expect(text).toContain(
      '- **Yveltal** · from the feed, found by picture and name, since ' +
        `<t:${at(FEED_READ_AT)}:d> · never shiny (any raid tier) (#4, for good)`,
    );
    expect(text).toContain('**Hidden**\n- Celebi (T5)');
    expect(text).toContain('- Starmie (T3) · hidden (#2, for good)\n');
    expect(text).toContain(
      '- Mewtwo (T5) · hidden (#5, for good) · **old?** (the feed does not list it)',
    );
    expect(text).toContain(
      '- Celebi (T5) · hidden (#7, for good) · **old?** (older than 30 days, the feed does not list it)',
    );
    expect(text).toContain(
      '**Overrides that change nothing now** (their boss is hidden, or is no boss of that tier now)\n' +
        '- Mewtwo (T5) · eggs hatch as it (#3, for good)',
    );
  });

  it('lists a boss the game data does not know by the feed name with its ids', async () => {
    const made = await bossCommandsWith();
    made.bosses.state.respond = () =>
      Promise.resolve(
        feedReply(
          200,
          feedWith({
            name: 'Brandnew_mon',
            tier: '5-Star Raids',
            canBeShiny: false,
            image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm9999.icon.png',
          }),
        ),
      );
    await made.bosses.service.sync();
    const text = textsOf(await made.use('boss', 'list', { tier: 'T5' })).join('\n');
    expect(text).toContain(
      '- **Brandnew\\_mon** · **not in the game data** (feed ids `BRANDNEW_MON`, no form) · ' +
        'from the feed, ' +
        'found by neither picture nor name',
    );
    expect(text).not.toContain('eggs hatch as');
  });

  it('splits a long list into several answers, keeping a tier heading with its bosses', async () => {
    const many: NewBossOverride[] = [];
    const names = ['MEW', 'MEWTWO', 'CELEBI', 'ZEKROM', 'RESHIRAM', 'KYOGRE', 'GROUDON', 'LUGIA'];
    for (const level of ['T1', 'T3', 'T5', 'Elite'] as const) {
      for (const pokemonId of names) {
        many.push(
          override({
            action: 'add',
            pokemonId,
            tier: { level, shadow: false },
            expiresAt: FEED_READ_AT + 20 * DAY,
          }),
        );
      }
    }
    const made = await bossCommandsWith({ overrides: many });
    const texts = textsOf(await made.use('boss', 'list'));
    expect(texts.length).toBeGreaterThan(1);
    for (const text of texts) {
      expect(text.length).toBeLessThanOrEqual(2000);
      // No answer ends with a heading whose bosses are in the next.
      expect(text.split('\n').at(-1)).not.toMatch(/^\*\*/);
    }
    expect(texts.join('\n').match(/^- \*\*/gm)?.length).toBe(14 + 32);
  });

  it('shows a name from the feed as text, never as a mention, a link or formatting', async () => {
    const made = await bossCommandsWith();
    made.bosses.state.respond = () =>
      Promise.resolve(
        feedReply(
          200,
          feedWith({
            name: '@everyone [click](https://evil.test) **Mon**',
            tier: '5-Star Raids',
            canBeShiny: false,
          }),
        ),
      );
    await made.bosses.service.sync();
    const text = textsOf(await made.use('boss', 'list', { tier: 'T5' })).join('\n');
    expect(text).toContain('[click]\\(https://evil.test)');
    expect(text).toContain('\\*\\*Mon\\*\\*');
    expect(text).not.toContain('](https');
  });

  it('names the headings of the feed it does not know', async () => {
    const made = await bossCommandsWith();
    made.bosses.state.respond = () =>
      Promise.resolve(
        feedReply(200, feedWith({ name: 'Mew', tier: 'Brand New Raids', canBeShiny: false })),
      );
    await made.bosses.service.sync();
    const text = textsOf(await made.use('boss', 'list')).join('\n');
    expect(text).toContain(
      'The feed has headings I do not know, whose bosses are left out: Brand New Raids.',
    );
  });

  it('says when the feed has never been read, and that there are no bosses', async () => {
    const made = await bossCommandsWith({ empty: true });
    const text = textsOf(await made.use('boss', 'list')).join('\n');
    expect(text).toBe(
      '**Raid bosses** · the feed has not been read yet\nThere are no raid bosses.\n' +
        '**Max bosses** · the feed has not been read yet\nThere are no max bosses.',
    );
  });
});

describe('/operator boss sync', () => {
  it('says that nothing changed', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'sync');
    expect(made.bosses.state.requests).toBe(1);
    expect(textsOf(used)).toEqual(['The feed lists the same bosses as before.']);
  });

  it('says nothing more when members see the same change in another order', async () => {
    const made = await bossCommandsWith();
    const feed = readRaidBossFeed() as object[];
    feed.push({ name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false });
    feed.push({ name: 'Mew', tier: '5-Star Raids', canBeShiny: false });
    made.bosses.state.respond = () => Promise.resolve(feedReply(200, JSON.stringify(feed)));
    expect(textsOf(await made.use('boss', 'sync'))).toEqual([
      'The feed lists other bosses now:\n- **T5** · New: Zekrom, Mew',
    ]);
  });

  it('speaks of no override when a costume stays beside a plain form that went', async () => {
    const made = await bossCommandsWith();
    const plainPikachu = {
      name: 'Pikachu',
      tier: '1-Star Raids',
      canBeShiny: true,
      image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm25.icon.png',
    };
    made.bosses.state.respond = () =>
      Promise.resolve(
        feedReply(200, JSON.stringify([...(readRaidBossFeed() as object[]), plainPikachu])),
      );
    await made.bosses.service.sync();
    made.bosses.state.respond = () =>
      Promise.resolve(feedReply(200, JSON.stringify(readRaidBossFeed())));
    expect(textsOf(await made.use('boss', 'sync'))).toEqual([
      'The feed lists other bosses now:\n- **T1** · Gone: Pikachu',
    ]);
  });

  it('says what members see when it differs from what the feed says', async () => {
    const made = await bossCommandsWith({
      overrides: [
        {
          action: 'hide',
          pokemonId: 'ZEKROM',
          form: null,
          tier: T5,
          shiny: null,
          expiresAt: null,
          createdBy: MODERATOR,
        },
      ],
    });
    const feed = readRaidBossFeed() as object[];
    feed.push({ name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false });
    feed.push({ name: 'Mew', tier: '5-Star Raids', canBeShiny: false });
    made.bosses.state.respond = () => Promise.resolve(feedReply(200, JSON.stringify(feed)));
    const used = await made.use('boss', 'sync');
    expect(textsOf(used)).toEqual([
      'The feed lists other bosses now:\n- **T5** · New: Zekrom, Mew\n' +
        'Members see this, with the overrides in force:\n- **T5** · New: Mew',
    ]);
  });

  it('says each way a read can fail without an address or a database message', async () => {
    const made = await bossCommandsWith();
    const said = async () => textsOf(await made.use('boss', 'sync'))[0]?.split('\n')[0];
    made.bosses.state.respond = () => Promise.resolve(feedReply(200, '<html>'));
    expect(await said()).toBe(
      'I could not read the raid boss feed: the feed sent something I cannot read.',
    );
    made.bosses.state.respond = () =>
      Promise.reject(new TypeError('fetch failed', { cause: new Error('ENOTFOUND secret.host') }));
    expect(await said()).toBe(
      'I could not read the raid boss feed: the feed could not be reached.',
    );
    made.bosses.store.failing = new Error('Access denied for user pine@10.0.0.3');
    made.bosses.state.respond = () =>
      Promise.resolve(feedReply(200, JSON.stringify(readRaidBossFeed())));
    expect(await said()).toBe(
      'I could not read the raid boss feed: something went wrong while storing it (see the log).',
    );
  });

  it('may be used three times a minute', async () => {
    const made = await bossCommandsWith();
    for (let use = 0; use < 3; use++) await made.use('boss', 'sync');
    const fourth = await made.use('boss', 'sync');
    expect(made.bosses.state.requests).toBe(3);
    expect(textsOf(fourth)[0]).toMatch(/^You can use \/operator boss sync again in/);
  });

  it('says what changed, by tier', async () => {
    const made = await bossCommandsWith();
    const feed = (readRaidBossFeed() as { name: string }[]).filter(
      (entry) => entry.name !== 'Yveltal',
    );
    feed.push({ name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false } as never);
    made.bosses.state.respond = () => Promise.resolve(feedReply(200, JSON.stringify(feed)));
    const used = await made.use('boss', 'sync');
    expect(textsOf(used)).toEqual([
      'The feed lists other bosses now:\n- **T5** · New: Zekrom · Gone: Yveltal',
    ]);
  });

  it('says why a read failed and that the list stays', async () => {
    const made = await bossCommandsWith();
    made.bosses.state.respond = () => Promise.resolve(feedReply(503));
    const used = await made.use('boss', 'sync');
    expect(textsOf(used)).toEqual([
      'I could not read the raid boss feed: the feed answered 503.\n' +
        `The list stays as it was when the feed was last read, <t:${at(FEED_READ_AT)}:R>.`,
    ]);
  });

  it('warns of a list that shrank to less than half, and of headings it does not know', async () => {
    const made = await bossCommandsWith();
    made.bosses.state.respond = () =>
      Promise.resolve(
        feedReply(
          200,
          JSON.stringify([
            { name: 'Yveltal', tier: '5-Star Raids', canBeShiny: true },
            { name: 'Mew', tier: 'Brand New Raids', canBeShiny: false },
          ]),
        ),
      );
    const text = textsOf(await made.use('boss', 'sync')).join('\n');
    expect(text).toContain('Gone: ');
    expect(text).toContain(
      'The feed has headings I do not know, whose bosses are left out: Brand New Raids.',
    );
    expect(text).toContain('**The feed lists 1 boss where it listed 14.**');
  });
});

describe('keptTogether', () => {
  it('moves a heading into the next message with its items', () => {
    const item = `- ${'x'.repeat(998)}`;
    const lines = ['**T1**', item, '**T3**', item];
    const firstLines = (texts: string[]) => texts.map((text) => text.split('\n')[0]);
    expect(firstLines(fitMessages(lines))).toEqual(['**T1**', item]);
    expect(firstLines(fitMessages(keptTogether(lines)))).toEqual(['**T1**', '**T3**']);
  });

  it('leaves a block too long for one message as its lines', () => {
    const item = `- ${'x'.repeat(998)}`;
    expect(keptTogether(['**T1**', item, item, item])).toEqual(['**T1**', item, item, item]);
  });
});
