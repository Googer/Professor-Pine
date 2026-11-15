import { describe, expect, it } from 'vitest';
import { expectSendable } from '../../test/support/post-limits.js';
import { catalogueFixture, iconsFixture } from '../../test/support/game-data.js';
import { testGyms } from '../../test/support/gyms.js';
import {
  accentOf,
  buttonLabels,
  buttonNames,
  buttonsOf,
  componentCount,
  partTexts,
  sectionsOf,
  textDisplays,
  textOf,
  thumbnailBeside,
  thumbnailOf,
  thumbnailsOf,
} from '../../test/support/messages.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  PARTY_ZONE,
  REPORTER,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../test/support/parties.js';
import { raidBossesFixture } from '../../test/support/raid-bosses.js';
import { roleLines, withoutRoles } from '../../test/support/post-roles.js';
import { renderMirror } from './mirrors.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { Attendee, RaidParty } from '../domain/party/party.js';
import { setBoss, setHatchTime } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import { effectiveBosses } from '../domain/pogo/raid-bosses.js';
import { PokemonIcons } from '../domain/pogo/pokemon-icons.js';
import {
  ENDED_COLOUR,
  FORUM_TAGS,
  KEPT_OPEN,
  layoutTextLength,
  LEAD_ROOM,
  LOBBY_OVER,
  MAX_COMPONENTS,
  postMessage,
  TEXT_BUDGET,
  type RenderedPost,
} from './party-post.js';
import {
  gymMapsUrl,
  raidLook,
  raidNeighborLine,
  raidTags,
  raidTitle,
  renderRaidPost,
  shownAutoset,
  shownBoss,
  UNCERTAIN_TIME,
  type PostGym,
  type RaidPostView,
} from './raid-post.js';

const catalogue = catalogueFixture();
const bosses = raidBossesFixture().bosses();
const rules = testRaidRules();
const [library, fountain] = testGyms();
const T5 = { level: 'T5', shadow: false } as const;
const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const emoji = { shiny: '✨', remote: '🛰️', teams };

function view(party: RaidParty, extra: Partial<RaidPostView> = {}): RaidPostView {
  return {
    party,
    now: PARTY_NOW,
    gym: library,
    boss: shownBoss(party, catalogue, bosses),
    catalogue,
    showUnknownMoves: true,
    emoji,
    zone: PARTY_ZONE,
    ...extra,
  };
}

const HOUR = 60 * MINUTE;

/** A gym's picture as an import writes it: on Google's image CDN. */
const GYM_PICTURE = 'https://lh3.googleusercontent.com/library';
/** That picture as a post shows it: asked for at 400 pixels. */
const SHOWN_PICTURE = `${GYM_PICTURE}=s400`;
const WHERE = '**Where**';
/** The address line of the library (gym 1) as a post shows it. */
const LIBRARY_ADDRESS = '12 Maple Avenue, Pinewood, Pennsylvania 15999';
/** The library's Map link in the Where line: masked, its address in angle brackets. */
const LIBRARY_MAP = '[Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)';

/** `count` coming trainers with snowflakes that start with a 3. */
function trainers(count: number, extra: Partial<Attendee> = {}): Record<string, Partial<Attendee>> {
  const result: Record<string, Partial<Attendee>> = {};
  for (let n = 0; n < count; n++) result[`300000000000${String(n).padStart(6, '0')}`] = extra;
  return result;
}

/** An egg reported at 14:00 that hatches at 14:30 and ends at 15:15. */
const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
const yveltal = setBoss(egg, { tier: T5, boss: { key: 'yveltal' } }, rules, PARTY_NOW).party;

describe('shownBoss', () => {
  it('is undefined for an egg', () => {
    expect(shownBoss(egg, catalogue, bosses)).toBeUndefined();
  });

  it('takes name and stats from the catalogue and shiny and picture from the boss list', () => {
    const shown = shownBoss(yveltal, catalogue, bosses);
    expect(shown).toMatchObject({ name: 'Yveltal', shiny: true });
    expect(shown?.entry?.key).toBe('yveltal');
    expect(shown?.image).toMatch(/pm717\.icon\.png$/);
  });

  it('is costumed only where the list has the boss costumed in the raid’s own tier (plan 8R-4)', () => {
    const list = effectiveBosses(
      [
        {
          pokemonId: 'PIKACHU',
          form: 'PIKACHU_GLASS_HELMET_2026',
          tier: { level: 'T1', shadow: false },
          shiny: false,
          name: 'Astronaut Pikachu',
        },
      ],
      [],
      catalogue,
      PARTY_NOW,
    );
    const pikachu = (level: 'T1' | 'T3') =>
      setBoss(egg, { tier: { level, shadow: false }, boss: { key: 'pikachu' } }, rules, PARTY_NOW)
        .party;
    expect(shownBoss(pikachu('T1'), catalogue, list)?.costumed).toBe(true);
    // The T1 boss is the only one of Pikachu: a T3 raid takes its picture, never its costume.
    expect(shownBoss(pikachu('T3'), catalogue, list)).not.toHaveProperty('costumed');
  });

  it('shows a Pokémon that is no current boss without shiny mark or picture', () => {
    const mewtwo = setBoss(egg, { tier: T5, boss: { key: 'mewtwo' } }, rules, PARTY_NOW).party;
    const shown = shownBoss(mewtwo, catalogue, bosses);
    expect(shown).toMatchObject({ name: 'Mewtwo', shiny: false });
    expect(shown).not.toHaveProperty('image');
  });

  it('shows a boss the game master does not know by the name of the feed, without an entry', () => {
    const newmon = setBoss(egg, { tier: T5, boss: { name: 'Newmon' } }, rules, PARTY_NOW).party;
    expect(shownBoss(newmon, catalogue, bosses)).toEqual({ name: 'Newmon', shiny: false });
  });

  // Mega Chandelure, 2026-10-31: the feed had it, the game master not. What you catch is its species.
  describe('a mega the game master does not have yet', () => {
    const chandelure = catalogue.byKey('chandelure');
    if (!chandelure) throw new Error('no Chandelure in the fixture');
    const cp = catalogue.raidCatchCp(chandelure);
    const CATCH = `**Catch CP** ${String(cp.min)}–${String(cp.max)} · ${String(cp.minBoosted)}–${String(cp.maxBoosted)}`;
    const said = (party: RaidParty, extra: Partial<RaidPostView>) =>
      JSON.stringify(renderRaidPost(view(party, { showUnknownMoves: true, ...extra })));

    it('says the catch CP of its species, and neither weaknesses nor moves', () => {
      const raid = setBoss(egg, { tier: T5, boss: { name: 'Mega Chandelure' } }, rules, PARTY_NOW);
      const post = said(raid.party, { now: at('2026-10-13T14:31') });
      expect(post).toContain(CATCH);
      expect(post).not.toContain('Weaknesses');
      expect(post).not.toContain('Moveset');
    });

    it('says the same of what an egg hatches as', () => {
      const post = said(egg, { hatchesAs: { name: 'Mega Chandelure', shiny: false } });
      expect(post).toContain(CATCH);
      expect(post).not.toContain('Weaknesses');
    });

    it('says nothing of a name that is no mega of a known species', () => {
      const raid = setBoss(egg, { tier: T5, boss: { name: 'Mega Newmon' } }, rules, PARTY_NOW);
      expect(said(raid.party, { now: at('2026-10-13T14:31') })).not.toContain('Catch CP');
    });
  });

  it('finds a boss held by name in the game data when the list no longer has it', () => {
    const held = setBoss(egg, { tier: T5, boss: { name: 'Yveltal' } }, rules, PARTY_NOW).party;
    expect(shownBoss(held, catalogue, [])?.entry?.key).toBe('yveltal');
  });

  it('finds a boss named by text in the list whether or not the game master knows it', () => {
    const named = testRaid({ boss: { name: 'Yveltal' } });
    const shown = shownBoss(named, catalogue, bosses);
    expect(shown).toMatchObject({ name: 'Yveltal', shiny: true });
    expect(shown?.entry?.key).toBe('yveltal');
    expect(shown?.image).toMatch(/pm717\.icon\.png$/);
  });

  it('gives a boss the list has no picture of the icon of its catalogue entry', () => {
    const mewtwo = setBoss(egg, { tier: T5, boss: { key: 'mewtwo' } }, rules, PARTY_NOW).party;
    expect(shownBoss(mewtwo, catalogue, bosses, iconsFixture())?.image).toBe(
      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm150.icon.png',
    );
    // A boss a moderator added by override is in the list without a picture.
    const added = bosses.map((boss) => {
      const { image: _image, ...rest } = boss;
      return rest;
    });
    expect(shownBoss(yveltal, catalogue, added, iconsFixture())?.image).toBe(
      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png',
    );
  });

  it('keeps the picture of the list when there is one: it shows what the boss wears now', () => {
    const costume = 'https://example.test/pm717.cFALL_2026.icon.png';
    const dressed = bosses.map((boss) =>
      boss.entry?.key === 'yveltal' ? { ...boss, image: costume } : boss,
    );
    expect(shownBoss(yveltal, catalogue, dressed, iconsFixture())?.image).toBe(costume);
  });

  it('shows no picture when neither the list nor the icons have one', () => {
    const newmon = setBoss(egg, { tier: T5, boss: { name: 'Newmon' } }, rules, PARTY_NOW).party;
    expect(shownBoss(newmon, catalogue, bosses, iconsFixture())).not.toHaveProperty('image');
    const mewtwo = setBoss(egg, { tier: T5, boss: { key: 'mewtwo' } }, rules, PARTY_NOW).party;
    expect(shownBoss(mewtwo, catalogue, bosses, new PokemonIcons([]))).not.toHaveProperty('image');
    expect(shownBoss(mewtwo, catalogue, bosses, undefined)).not.toHaveProperty('image');
  });

  it('gives a key the catalogue has lost a readable name', () => {
    const gone = setBoss(egg, { tier: T5, boss: { key: 'gone_mon' } }, rules, PARTY_NOW).party;
    expect(shownBoss(gone, catalogue, bosses)).toEqual({ name: 'Gone Mon', shiny: false });
  });
});

describe('shownAutoset', () => {
  it('names what an egg will hatch as only for the tier it was asked for', () => {
    const t5 = raidBossesFixture().autoset(T5);
    expect(shownAutoset(T5, t5)?.name).toBe(t5?.name);
    expect(shownAutoset({ level: 'T3', shadow: false }, t5)).toBeUndefined();
    expect(shownAutoset(T5, undefined)).toBeUndefined();
    // What it will hatch as has its picture by the same rule as a boss.
    if (!t5) throw new Error('the fixture has no certain T5 boss');
    const { image: _image, ...bare } = t5;
    expect(shownAutoset(T5, bare)).not.toHaveProperty('image');
    const pictures = { catalogue, icons: iconsFixture() };
    expect(shownAutoset(T5, bare, { catalogue })).not.toHaveProperty('image');
    expect(shownAutoset(T5, bare, pictures)?.image).toMatch(/pokemon_icons\/pm\d+/);
    expect(shownAutoset(T5, { ...t5, image: 'https://example.test/x.png' }, pictures)?.image).toBe(
      'https://example.test/x.png',
    );
  });
});

describe('raidTitle and raidTags', () => {
  it('collapses white space in the gym name, so it matches what Discord reports', () => {
    const gym: PostGym = { ...library!, name: ' The  Stacks  ', nickname: null };
    expect(raidTitle(view(egg, { gym }))).toBe('T5 egg · The Stacks');
  });

  it('names the boss or the egg, and the gym by its nickname', () => {
    expect(raidTitle(view(egg))).toBe('T5 egg · The Stacks');
    expect(raidTitle(view(yveltal))).toBe('Yveltal · The Stacks');
    expect(raidTitle(view(egg, { gym: fountain }))).toBe('T5 egg · Old Stone Fountain');
    expect(raidTitle(view(egg, { gym: undefined }))).toBe('T5 egg · Unknown gym');
    const hatched = view(egg, { now: at('2026-10-13T14:31') });
    expect(raidTitle(hatched)).toBe('T5 raid · The Stacks');
    const shadow = testRaid({ tier: { level: 'T3', shadow: true } });
    expect(raidTitle(view(shadow))).toBe('Shadow T3 egg · The Stacks');
  });

  it('never exceeds the 100 characters of a post title, and keeps the gym', () => {
    const gym: PostGym = { ...library!, nickname: null, name: 'G'.repeat(90) };
    const long = setBoss(egg, { tier: T5, boss: { name: 'B'.repeat(90) } }, rules, PARTY_NOW);
    const title = raidTitle(view(long.party, { gym }));
    expect(title.length).toBeLessThanOrEqual(100);
    expect(title).toMatch(/^B+… · G{59}…$/);
  });

  it('tags the stage, the tier and shadow raids', () => {
    expect(raidTags(egg, PARTY_NOW)).toEqual(['Egg', 'T5']);
    expect(raidTags(egg, at('2026-10-13T14:30'))).toEqual(['Hatched', 'T5']);
    expect(raidTags(egg, at('2026-10-13T15:15'))).toEqual(['Ended', 'T5']);
    expect(raidTags(testRaid({ tier: { level: 'T1', shadow: true } }), PARTY_NOW)).toEqual([
      'Egg',
      'T1',
      'Shadow',
    ]);
    for (const level of ['Mega', 'MegaLegendary', 'SuperMega'] as const) {
      expect(raidTags(testRaid({ tier: { level, shadow: false } }), PARTY_NOW)).toEqual([
        'Egg',
        'Mega',
      ]);
    }
    expect(raidTags(testRaid({ tier: { level: 'Elite', shadow: false } }), PARTY_NOW)[1]).toBe(
      'Elite',
    );
    // No tag for the EX tier, which is gone.
    expect(FORUM_TAGS).not.toContain('EX');
  });
});

/** What a test reads of a post: its title, tags, colour, picture, texts and buttons. */
function shown(post: RenderedPost) {
  return {
    title: post.title,
    tags: post.tags,
    accent: accentOf(post.message),
    picture: thumbnailOf(post.message),
    texts: textDisplays(post.message),
    buttons: buttonsOf(post.message).map(
      (button) =>
        `${button.emoji ?? ''} ${button.label ?? ''} ${button.customId ?? button.url ?? ''}`,
    ),
  };
}

/** The lines of the first block of a post: the raid, its times, its boss. */
function header(post: RenderedPost): string[] {
  return textDisplays(post.message)[0]?.split('\n') ?? [];
}

/**
 * A part of a post from its line that starts so (a heading, or the boss's lines in the heading
 * block) to its end, a status with its names under it (`partTexts`), or undefined.
 */
function block(post: RenderedPost, start: string): string | undefined {
  for (const text of partTexts(post.message)) {
    const lines = text.split('\n');
    const from = lines.findIndex((line) => line.startsWith(start));
    if (from >= 0) return lines.slice(from).join('\n');
  }
  return undefined;
}

/**
 * The line of a status in a post, by its word (`🏃 Coming (3): …`: plan 8X-1B, its button's icon
 * first); undefined when nobody has that status.
 */
function statusLine(post: RenderedPost, word: string): string | undefined {
  return textOf(post.message)
    .split('\n')
    .find((line) => new RegExp(`^\\S+ ${word} \\(\\d+\\): `).test(line));
}

describe('renderRaidPost', () => {
  it('shows an egg with its times and who is interested', () => {
    expect(shown(renderRaidPost(view(egg)))).toMatchInlineSnapshot(`
      {
        "accent": 15844367,
        "buttons": [
          "🤔  party:00000000-0000-4000-8000-000000000001:maybe",
          "🏃  party:00000000-0000-4000-8000-000000000001:join",
          "✅  party:00000000-0000-4000-8000-000000000001:here",
          "🎉  party:00000000-0000-4000-8000-000000000001:done",
          "👋  party:00000000-0000-4000-8000-000000000001:leave",
          "⏰  party:00000000-0000-4000-8000-000000000001:meet",
          "⬇️  party:00000000-0000-4000-8000-000000000001:less",
          "⬆️  party:00000000-0000-4000-8000-000000000001:more",
          "📡  party:00000000-0000-4000-8000-000000000001:remote",
          "👥 Group… party:00000000-0000-4000-8000-000000000001:regroup",
          " Manage… party:00000000-0000-4000-8000-000000000001:manage",
        ],
        "picture": undefined,
        "tags": [
          "Egg",
          "T5",
        ],
        "texts": [
          "### Level 5 raid (egg)
      Hatches <t:1791916200:R>, at <t:1791916200:t>. Ends at <t:1791918900:t>.",
          "**Where**
      **The Stacks** · 12 Maple Avenue, Pinewood, Pennsylvania 15999 · [Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)",
          "1 trainer
      🤔 Interested (1): <@200000000000000001>
      -# No meeting time yet: ⏰ sets one.",
          "-# Reported by <@200000000000000001>",
        ],
        "title": "T5 egg · The Stacks",
      }
    `);
  });

  it('shows a hatched raid with boss, groups, a meeting time and everybody in their place', () => {
    const party: RaidParty = {
      ...withAttendees(
        { ...yveltal, raid: { ...yveltal.raid, fastMove: 'SNARL_FAST' } },
        {
          [ALICE]: { status: PartyStatus.Present, number: 3 },
          [BOB]: { status: PartyStatus.Coming, remote: true, group: 'B' },
          [CAROL]: { status: PartyStatus.Complete },
          '200000000000000009': { status: PartyStatus.CompletePending, pendingUntil: PARTY_NOW },
        },
      ),
      groups: [{ id: 'A', label: 'park *side*', startTime: at('2026-10-13T14:45') }, { id: 'B' }],
      defaultGroupId: 'B',
    };
    const post = renderRaidPost(view(party, { now: at('2026-10-13T14:40') }));
    expect(shown(post)).toMatchInlineSnapshot(`
      {
        "accent": 3066993,
        "buttons": [
          "🤔  party:00000000-0000-4000-8000-000000000001:maybe",
          "🏃  party:00000000-0000-4000-8000-000000000001:join",
          "✅  party:00000000-0000-4000-8000-000000000001:here",
          "🎉  party:00000000-0000-4000-8000-000000000001:done",
          "👋  party:00000000-0000-4000-8000-000000000001:leave",
          "⏰  party:00000000-0000-4000-8000-000000000001:meet",
          "⬇️  party:00000000-0000-4000-8000-000000000001:less",
          "⬆️  party:00000000-0000-4000-8000-000000000001:more",
          "📡  party:00000000-0000-4000-8000-000000000001:remote",
          "👥 Group… party:00000000-0000-4000-8000-000000000001:regroup",
          " Manage… party:00000000-0000-4000-8000-000000000001:manage",
        ],
        "picture": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png",
        "tags": [
          "Hatched",
          "T5",
        ],
        "texts": [
          "### Level 5 raid against Yveltal ✨
      Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.
      **Weaknesses** Rock, Electric, Ice, Fairy
      **Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)
      **Moveset** Snarl / ????",
          "**Where**
      **The Stacks** · 12 Maple Avenue, Pinewood, Pennsylvania 15999 · [Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)",
          "**Group A: park \\*side\\*** · 5 trainers · meeting at <t:1791917100:t>
      🤔 Interested (1): <@200000000000000001>
      ✅ Here (4): <@200000000000000002> +2, <@200000000000000009>",
          "**Group B** · 1 trainer
      🏃 Coming (1): <@200000000000000003> 🛰️",
          "🎉 Done (1): <@200000000000000004>",
          "-# Group B has no meeting time yet: ⏰ sets your group's.",
          "-# Reported by <@200000000000000001>",
        ],
        "title": "Yveltal · The Stacks",
      }
    `);
    // The brief of a direct message: what it is, when, how many come; the post's colour and
    // picture, and the gym's place for the Map button. Who comes stays in the post.
    expect(post.brief).toEqual({
      accent: 0x2ecc71,
      picture: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png',
      lines: [
        '**Level 5 raid against Yveltal** ✨',
        'Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.',
        '6 trainers',
      ],
      map: 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05',
    });
  });

  it('shows an ended raid without times as over, and an anonymous report without the reporter', () => {
    const raid = testRaid({ anonymous: true, boss: { name: 'Newmon' } });
    const post = renderRaidPost(view(raid, { now: PARTY_NOW + 50 * MINUTE }));
    expect(post.tags).toEqual(['Ended', 'T5']);
    expect(header(post)).toEqual(['### Level 5 raid against Newmon', 'This raid is over.']);
    // A boss the game master does not know has no types, CP or moves to show.
    expect(textOf(post.message)).not.toContain('Weaknesses');
    expect(textOf(post.message)).not.toContain('Reported by');
    expect(accentOf(post.message)).toBe(ENDED_COLOUR);
  });

  it('shows an egg as the game shows the egg, also when its boss is known, and a hatched raid as its boss', () => {
    const picture = 'https://example.test/raid_egg_2_icon.png';
    const pictured = (party: RaidParty, now = PARTY_NOW) =>
      thumbnailOf(renderRaidPost(view(party, { now, eggPicture: picture })).message);
    expect(pictured(egg)).toBe(picture);
    const named = setBoss(
      egg,
      { tier: { level: 'T5', shadow: false }, boss: { key: 'yveltal' } },
      rules,
      PARTY_NOW,
    ).party;
    expect(pictured(named)).toBe(picture);
    expect(pictured(named, at('2026-10-13T14:40'))).not.toBe(picture);
  });

  it('carries the egg’s file where its picture is one of the message, until it hatches', () => {
    const carried = {
      eggPicture: 'attachment://raid_egg_2_icon.png',
      eggFile: '/bot/pictures/eggs/raid_egg_2_icon.png',
    };
    const post = renderRaidPost(view(egg, carried));
    expect(thumbnailOf(post.message)).toBe('attachment://raid_egg_2_icon.png');
    expect(post.message.files).toEqual(['/bot/pictures/eggs/raid_egg_2_icon.png']);
    expectSendable(post);
    // A direct message shows the same picture, and so carries the file too.
    expect(post.brief).toMatchObject({
      picture: 'attachment://raid_egg_2_icon.png',
      pictureFile: '/bot/pictures/eggs/raid_egg_2_icon.png',
    });
    // Hatched, it shows its boss by address and carries nothing.
    const named = setBoss(egg, { tier: T5, boss: { key: 'yveltal' } }, rules, PARTY_NOW).party;
    const hatched = renderRaidPost(view(named, { ...carried, now: at('2026-10-13T14:40') }));
    expect(thumbnailOf(hatched.message)).toMatch(/^https:\/\/.*pm717/);
    expect(hatched.message.files).toEqual([]);
    expect(hatched.brief).not.toHaveProperty('pictureFile');
  });

  it('gives the live map the picture and the boss the post shows (raidLook)', () => {
    const picture = 'https://example.test/raid_egg_2_icon.png';
    const named = setBoss(egg, { tier: T5, boss: { key: 'yveltal' } }, rules, PARTY_NOW).party;
    const looked = (party: RaidParty, now = PARTY_NOW) => {
      const shown = view(party, { now, eggPicture: picture });
      expect(raidLook(shown).picture).toBe(thumbnailOf(renderRaidPost(shown).message));
      // The heading's words as the post's own heading says them (plan 8M-7, fix round 1).
      expect(textOf(renderRaidPost(shown).message)).toContain(`### ${raidLook(shown).heading}`);
      return raidLook(shown);
    };
    const place = { name: 'The Stacks', lat: 40.05, lon: -80.05, address: LIBRARY_ADDRESS };
    const egged = 'Level 5 raid (egg)';
    expect(looked(egg)).toEqual({ picture, place, heading: egged });
    expect(looked(named)).toEqual({ picture, boss: 'Yveltal', place, heading: egged });
    expect(looked(named, at('2026-10-13T14:40'))).toEqual({
      picture: expect.stringMatching(/pm717/) as unknown,
      boss: 'Yveltal',
      place,
      heading: 'Level 5 raid against Yveltal',
    });
  });

  it('gives the live map where the raid is as its Where names it, without an address unknown', () => {
    expect(raidLook(view(egg)).place).toEqual({
      name: 'The Stacks',
      lat: 40.05,
      lon: -80.05,
      address: LIBRARY_ADDRESS,
    });
    expect(raidLook(view(egg, { gym: { ...library!, geodata: null } })).place).toEqual({
      name: 'The Stacks',
      lat: 40.05,
      lon: -80.05,
      address: null,
    });
    // A gym that is gone: nowhere to go.
    expect(raidLook(view(egg, { gym: undefined }))).not.toHaveProperty('place');
  });

  it('shows a raid closed while it was an egg as that egg in its last showing', () => {
    // Seen in the staging of 8A: an egg moved to another region ended with its boss's picture.
    const picture = 'https://example.test/raid_egg_5_icon.png';
    const named = setBoss(
      egg,
      { tier: { level: 'T5', shadow: false }, boss: { key: 'yveltal' } },
      rules,
      PARTY_NOW,
    ).party;
    const closed = 'This raid was closed by **Mo** (<@9>).';
    const post = renderRaidPost(view(named, { eggPicture: picture, closed }));
    expect(thumbnailOf(post.message)).toBe(picture);
    expect(header(post)[0]).toBe('### Level 5 raid (egg)');
    expect(header(post)[1]).toBe(closed);
    expect(accentOf(post.message)).toBe(ENDED_COLOUR);
    expect(post.brief.picture).toBe(picture);
    expect(post.brief.lines[0]).toBe('**Level 5 raid** (egg)');
    expect(post.brief.lines.slice(1, 3)).toEqual(['**Hatches as Yveltal** ✨', closed]);
    // One that had hatched is shown as its boss.
    const hatched = renderRaidPost(
      view(named, { eggPicture: picture, closed, now: at('2026-10-13T14:40') }),
    );
    expect(thumbnailOf(hatched.message)).not.toBe(picture);
    expect(header(hatched)[0]).toContain('against Yveltal');
  });

  it('says when the times are a guess from a screenshot, until they are set or the raid is over', () => {
    const guessed: RaidParty = {
      ...egg,
      raid: { ...egg.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true } },
    };
    const lines = (party: RaidParty, now = PARTY_NOW) =>
      header(renderRaidPost(view(party, { now })));
    expect(lines(guessed)[2]).toBe(UNCERTAIN_TIME);
    const sure: RaidParty = {
      ...guessed,
      raid: { ...guessed.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: false } },
    };
    expect(lines(sure)).not.toContain(UNCERTAIN_TIME);
    expect(lines(guessed, PARTY_NOW + 6 * 60 * MINUTE)).not.toContain(UNCERTAIN_TIME);
  });

  it('names the reporter by the name the party has, and by a mention when it has none', () => {
    const reported = (party: RaidParty) => block(renderRaidPost(view(party)), '-# Reported by');
    expect(reported(testRaid())).toBe(`-# Reported by <@${REPORTER}>`);
    // Not signed up: the name kept with the party. Signed up: the newer one of their record.
    const unlisted: RaidParty = { ...testRaid(), attendees: {}, makerName: 'Rae *the* Reporter' };
    // The name alone: a mention that pings nobody reads "@unknown-user" to whoever has not
    // loaded that member (Matt, 2026-10-15, staging of 8A).
    expect(reported(unlisted)).toBe(`-# Reported by **Rae \\*the\\* Reporter**`);
    const listed = withAttendees(
      { ...testRaid(), makerName: 'Old' },
      { [REPORTER]: { name: 'Rae' } },
    );
    expect(reported(listed)).toBe(`-# Reported by **Rae**`);
    // The brief names nobody: a DM's sentence names the reporter.
    expect(JSON.stringify(renderRaidPost(view(listed)).brief)).not.toContain(REPORTER);
  });

  it('says what an egg will hatch as when that is certain, with that boss its picture', () => {
    const hatchesAs = shownBoss(yveltal, catalogue, bosses);
    const post = renderRaidPost(view(egg, { hatchesAs }));
    // Said once: by the heading of the block under it (Matt, 2026-10-11).
    expect(header(post)[0]).toBe('### Level 5 raid (egg)');
    expect(thumbnailOf(post.message)).toMatch(/pm717/);
    const about = block(post, '**Hatches as Yveltal** ✨');
    expect(about).toContain('**Weaknesses**');
    // The moves of a boss that is not there yet are not shown.
    expect(about).not.toContain('Moveset');
    // The brief calls it an egg and says what it hatches as.
    expect(post.brief.lines.slice(0, 2)).toEqual([
      '**Level 5 raid** (egg)',
      '**Hatches as Yveltal** ✨',
    ]);
  });

  it('says what an egg hatches as also when nothing more is known of that boss', () => {
    const post = renderRaidPost(view(egg, { hatchesAs: { name: 'New*mon', shiny: false } }));
    expect(header(post)[0]).toBe('### Level 5 raid (egg)');
    expect(block(post, '**Hatches as')).toBe('**Hatches as New\\*mon**');
  });

  it('shows an egg whose boss was named as an egg until it hatches', () => {
    const before = renderRaidPost(view(yveltal));
    expect(before.title).toBe('Yveltal · The Stacks');
    expect(header(before)[0]).toBe('### Level 5 raid (egg)');
    // Moves nobody knows are not asked for before there is a boss to look at.
    expect(block(before, '**Hatches as Yveltal**')).not.toContain('Moveset');
    const known = { ...yveltal, raid: { ...yveltal.raid, chargedMove: 'DARK_PULSE' } };
    expect(block(renderRaidPost(view(known)), '**Hatches as Yveltal**')).toContain(
      '**Moveset** ???? / Dark Pulse',
    );
    const hatched = renderRaidPost(view(yveltal, { now: at('2026-10-13T14:31') }));
    expect(header(hatched)[0]).toBe('### Level 5 raid against Yveltal ✨');
    expect(block(hatched, '**Weaknesses**')).toContain('**Moveset** ???? / ????');
    expect(hatched.brief.lines[0]).toBe('**Level 5 raid against Yveltal** ✨');
  });

  it('hides the moves line while no move is known when the setting says so', () => {
    const hatched = at('2026-10-13T14:31');
    const quiet = renderRaidPost(view(yveltal, { showUnknownMoves: false, now: hatched }));
    expect(textOf(quiet.message)).not.toContain('Moveset');
    const known = { ...yveltal, raid: { ...yveltal.raid, chargedMove: 'DARK_PULSE' } };
    expect(
      textOf(renderRaidPost(view(known, { showUnknownMoves: false, now: hatched })).message),
    ).toContain('**Moveset** ???? / Dark Pulse');
  });

  it('shows types and weather by the emoji of the game icons, and in words where one is missing', () => {
    const icons = new Map([
      ['rock', '<:rock:1>'],
      ['electric', '<:electric:2>'],
      ['ice', '<:ice:3>'],
      ['fairy', '<:fairy:4>'],
      ['windy', '<:windy:5>'],
      ['fog', '<:fog:6>'],
    ]);
    const hatched = at('2026-10-13T14:31');
    const facts = (names: Map<string, string>) =>
      block(
        renderRaidPost(
          view(yveltal, { now: hatched, emoji: { ...emoji, icon: (name) => names.get(name) } }),
        ),
        '**Weaknesses**',
      )?.split('\n');
    expect(facts(icons)?.slice(0, 2)).toEqual([
      '**Weaknesses** <:rock:1> <:electric:2> <:ice:3> <:fairy:4>',
      '**Catch CP** 2073–2160 · 2591–2701 <:windy:5> <:fog:6>',
    ]);
    const fewer = new Map([...icons].filter(([name]) => name !== 'fog' && name !== 'ice'));
    expect(facts(fewer)?.slice(0, 2)).toEqual([
      '**Weaknesses** Rock, Electric, Ice, Fairy',
      '**Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)',
    ]);
  });

  it('says where the raid is in one line: the gym, its address and its map, then its notice', () => {
    const where = (gym: Partial<PostGym>, party = egg) =>
      block(renderRaidPost(view(party, { gym: { ...library!, ...gym } })), WHERE);
    // The name plain bold (never a link), the address, the one Map link without a preview.
    expect(where({})).toBe(`${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}`);
    expect(where({ notice: 'Closes at **dusk** @everyone' })).toBe(
      `${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}\n` +
        'Closes at \\*\\*dusk\\*\\* @\u200beveryone',
    );
    // Without an address: the gym and its map.
    expect(where({ geodata: null })).toBe(`${WHERE}\n**The Stacks** · ${LIBRARY_MAP}`);
    // The name is made plain (no link: its brackets need no escape).
    expect(where({ nickname: null, name: 'M*A*S*H [Memorial]' })).toBe(
      `${WHERE}\n**M\\*A\\*S\\*H [Memorial]** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}`,
    );
  });

  it('marks no elite raid gym anywhere in the post: members are not told any more', () => {
    for (const party of [egg, testRaid({ tier: { level: 'Elite', shadow: false } })]) {
      const post = renderRaidPost(
        view(party, { gym: { ...library!, taggedEx: true, confirmedEx: true } }),
      );
      expect(textOf(post.message)).not.toMatch(/elite raid gym/i);
      expect(post.brief.lines.join('\n')).not.toMatch(/elite raid gym/i);
    }
  });

  it('keeps the lines of a notice that was written as a paragraph', () => {
    const post = renderRaidPost(
      view(egg, {
        gym: {
          ...library!,
          geodata: null,
          notice: 'Park closes at *dusk*.\r\n\r\n\r\n  Use the east gate.\n# Not a heading',
        },
      }),
    );
    expect(block(post, WHERE)).toBe(
      `${WHERE}\n**The Stacks** · ${LIBRARY_MAP}\nPark closes at \\*dusk\\*.\n\nUse the east gate.\n\\# Not a heading`,
    );
  });

  it('adds no line for a notice that is empty once it is made plain', () => {
    const post = renderRaidPost(view(egg, { gym: { ...library!, notice: '     ' } }));
    expect(block(post, WHERE)).toBe(
      `${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}`,
    );
    for (const text of textDisplays(post.message)) expect(text.trim()).not.toBe('');
  });

  it("shows the gym's Wayfarer picture beside where the raid is", () => {
    const yveltalNow = at('2026-10-13T14:40');
    const shown = (gym: Partial<PostGym>) =>
      renderRaidPost(view(yveltal, { now: yveltalNow, gym: { ...library!, ...gym } }));
    const alone = shown({ imageUrl: GYM_PICTURE });
    expect(thumbnailBeside(alone.message, WHERE)).toBe(SHOWN_PICTURE);
    // The boss keeps its picture beside the heading.
    expect(thumbnailOf(alone.message)).toMatch(/pm717/);
    const noted = shown({ imageUrl: GYM_PICTURE, notice: 'Use the east gate.' });
    expect(block(noted, WHERE)).toBe(
      `${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}\nUse the east gate.`,
    );
    expect(thumbnailBeside(noted.message, WHERE)).toBe(SHOWN_PICTURE);
    // A picture from elsewhere is not shown: the section stands without one.
    const elsewhere = shown({ imageUrl: 'https://example.com/x.jpg' });
    expect(thumbnailBeside(elsewhere.message, WHERE)).toBeUndefined();
    expect(block(elsewhere, WHERE)).toBe(
      `${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}`,
    );
    expect(thumbnailsOf(elsewhere.message)).toEqual([thumbnailOf(elsewhere.message)]);
    // One by plain http on Google's host is shown by https, small.
    const plainHttp = shown({ imageUrl: 'http://lh3.googleusercontent.com/x' });
    expect(thumbnailBeside(plainHttp.message, WHERE)).toBe(
      'https://lh3.googleusercontent.com/x=s400',
    );
    // Where Discord refuses the pictures, the post goes without either, and says the same.
    expect(thumbnailsOf(postMessage(noted.layout, { picture: false }))).toEqual([]);
    expect(textDisplays(postMessage(noted.layout, { picture: false }))).toContain(
      `${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}\nUse the east gate.`,
    );
    expectSendable(noted);
  });

  it('says that a gym beside its picture has no address, and only there', () => {
    const yveltalNow = at('2026-10-13T14:40');
    const shown = (gym: Partial<PostGym>) =>
      renderRaidPost(view(yveltal, { now: yveltalNow, gym: { ...library!, ...gym } }));
    // A picture and no address (a gym deep in a park): the picture never sits by a name alone.
    const lost = shown({ imageUrl: GYM_PICTURE, geodata: null, notice: 'By the pond.' });
    expect(block(lost, WHERE)).toBe(
      `${WHERE}\n**The Stacks** · (no address available) · ${LIBRARY_MAP}\nBy the pond.`,
    );
    expect(thumbnailBeside(lost.message, WHERE)).toBe(SHOWN_PICTURE);
    // Where the picture is left out, so is what was said for it.
    expect(textDisplays(postMessage(lost.layout, { picture: false }))).toContain(
      `${WHERE}\n**The Stacks** · ${LIBRARY_MAP}\nBy the pond.`,
    );
    // The address is made plain.
    const marked = JSON.stringify({ addressComponents: { route: '*Main* Street' } });
    expect(block(shown({ imageUrl: GYM_PICTURE, geodata: marked }), WHERE)).toBe(
      `${WHERE}\n**The Stacks** · \\*Main\\* Street · ${LIBRARY_MAP}`,
    );
    expectSendable(lost);
  });

  it('opens with what the raid is, its times and its boss, and has no Map button of its own', () => {
    const hatched = renderRaidPost(
      view(
        { ...yveltal, raid: { ...yveltal.raid, fastMove: 'SNARL_FAST' } },
        { now: at('2026-10-13T14:40') },
      ),
    );
    expect(header(hatched)).toEqual([
      '### Level 5 raid against Yveltal ✨',
      'Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.',
      '**Weaknesses** Rock, Electric, Ice, Fairy',
      '**Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)',
      '**Moveset** Snarl / ????',
    ]);
    expect(buttonLabels(hatched.message)).not.toContain('Map');
    // The direct message keeps its map: it has no Where.
    expect(hatched.brief.map).toBe(gymMapsUrl(library!));
    const kept = renderRaidPost(view({ ...yveltal, saved: true }));
    expect(header(kept)).toEqual([
      '### Level 5 raid (egg)',
      'Hatches <t:1791916200:R>, at <t:1791916200:t>. Ends at <t:1791918900:t>.',
      KEPT_OPEN,
      '**Hatches as Yveltal** ✨',
      '**Weaknesses** Rock, Electric, Ice, Fairy',
      '**Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)',
    ]);
  });

  it('holds the whole message in one place: the layout made a message', () => {
    const post = renderRaidPost(view(egg));
    expect(post.message).toEqual(postMessage(post.layout));
  });

  it('marks a trainer with their team and lists by team, then by name', () => {
    const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), {
      '300000000000000001': { name: 'zed', team: 'valor' },
      '300000000000000002': { name: 'Yan', team: 'instinct' },
      '300000000000000003': { name: 'bea' },
      '300000000000000004': {},
      '300000000000000005': { name: 'Abe', team: 'instinct', number: 2, remote: true },
      '300000000000000006': { name: 'Al' },
    });
    expect(statusLine(renderRaidPost(view(party)), 'Coming')).toBe(
      '🏃 Coming (7): Al, bea, <@300000000000000004>, ⚡ Abe +1 🛰️, Yan, 🔥 zed',
    );
  });

  it('orders names as a reader would: accents and capitals do not send a name to the end', () => {
    const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), {
      '300000000000000001': { name: 'zed' },
      '300000000000000002': { name: 'Émile' },
      '300000000000000003': { name: 'adam' },
      '300000000000000004': { name: 'Émile' },
    });
    expect(statusLine(renderRaidPost(view(party)), 'Coming')).toBe(
      '🏃 Coming (4): adam, Émile, Émile, zed',
    );
  });

  it("shows a full lobby of twenty with the server's own team emoji, every team among them", () => {
    const custom = {
      instinct: '<:instinct:1234567890123456789>',
      mystic: '<:mystic:1234567890123456789>',
      valor: '<:valor:1234567890123456789>',
    };
    const remote = '<:pineremote:1234567890123456789>';
    const names = ['instinct', 'mystic', 'valor'] as const;
    const many: Record<string, object> = {};
    for (let n = 0; n < 20; n++) {
      many[`3000000000000000${String(n).padStart(2, '0')}`] = {
        name: `trainer ${n}`,
        team: names[n % 3],
        remote: n % 4 === 0,
      };
    }
    const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), many);
    const post = renderRaidPost(view(party, { emoji: { shiny: '✨', remote, teams: custom } }));
    const value = statusLine(post, 'Coming') ?? '';
    expect(value.match(/trainer \d+/g)).toHaveLength(20);
    expect(value).not.toMatch(/…and \d+ more/);
    // Each team's emoji stands once, before the first of its members.
    for (const team of names) expect(value.split(custom[team])).toHaveLength(2);
  });

  it('lists those who completed it by team and name as well', () => {
    const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), {
      '300000000000000001': { name: 'zed', team: 'mystic', status: PartyStatus.Complete },
      '300000000000000002': { name: 'amy', team: 'mystic', status: PartyStatus.Complete },
    });
    expect(statusLine(renderRaidPost(view(party)), 'Done')).toBe('🎉 Done (2): ❄️ amy, zed');
  });

  it('warns a group of more than twenty trainers to split up', () => {
    const many: Record<string, object> = {};
    for (let n = 0; n < 300; n++) many[`300000000000000${String(n).padStart(3, '0')}`] = {};
    const post = renderRaidPost(view(withAttendees(egg, many)));
    // Under the group's head count, before its lines.
    expect(textOf(post.message)).toContain(
      '301 trainers\nMore than 20 trainers: a lobby holds 20, so split up.\n🤔 Interested (1): ',
    );
    // The note stands although the list itself is cut.
    const value = statusLine(post, 'Coming') ?? '';
    expect(value).toMatch(/^🏃 Coming \(300\): /);
    const listed = value.match(/<@3/g)?.length ?? 0;
    const left = Number(/…and (\d+) more$/.exec(value)?.[1]);
    expect(left).toBeGreaterThan(0);
    expect(listed + left).toBe(300);
  });

  it('shows thirty trainers who are all coming in full', () => {
    const post = renderRaidPost(view(withAttendees(egg, trainers(30))));
    const value = statusLine(post, 'Coming') ?? '';
    expect(value).not.toMatch(/…and \d+ more/);
    expect(value.match(/<@3/g)).toHaveLength(30);
  });

  it('shows as many trainers as the text of a post holds, and counts the rest', () => {
    const remote = '<:pineremote:1234567890123456789>';
    const party = withAttendees(egg, trainers(200, { remote: true }));
    const post = renderRaidPost(view(party, { emoji: { shiny: '✨', remote, teams } }));
    const value = statusLine(post, 'Coming') ?? '';
    const listed = value.match(/<@3/g)?.length ?? 0;
    const left = Number(/…and (\d+) more/.exec(value)?.[1]);
    expect(listed + left).toBe(200);
    expect(listed).toBeGreaterThanOrEqual(50);
    expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
    // One more trainer would not have fitted.
    expect(layoutTextLength(post.layout)).toBeGreaterThan(TEXT_BUDGET - LEAD_ROOM - 80);
  });

  it('keeps within what Discord takes of a message with every part a raid can have', () => {
    const groups = (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({
      id,
      label: 'L'.repeat(100),
      startTime: at('2026-10-13T14:45'),
    }));
    const statuses = [
      PartyStatus.Present,
      PartyStatus.Coming,
      PartyStatus.Interested,
      PartyStatus.Complete,
    ];
    const attendees: Record<string, Partial<Attendee>> = {};
    groups.forEach(({ id }, g) => {
      for (let n = 0; n < 60; n++) {
        const memberId = `4${String(g)}0000000000${String(n).padStart(6, '0')}`;
        attendees[memberId] = {
          group: id,
          name: `A rather long display name ${n}`,
          status: statuses[n % 4] ?? PartyStatus.Coming,
        };
      }
    });
    // A raid without times (Set time) from a kept screenshot (Screenshot feedback), with a boss
    // and its picture, at an elite raid gym with a long notice and its own picture, in five
    // groups.
    const party: RaidParty = {
      ...withAttendees(testRaid({ boss: { key: 'yveltal' } }), attendees),
      raid: {
        ...testRaid({ boss: { key: 'yveltal' } }).raid,
        screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: false },
      },
      groups,
    };
    const gym: PostGym = {
      ...library!,
      taggedEx: true,
      notice: 'n'.repeat(900),
      imageUrl: GYM_PICTURE,
    };
    const post = renderRaidPost(view(party, { gym, now: at('2026-10-13T14:40') }));
    expect(componentCount(post.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
    expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
    // Every group keeps its heading, label uncut, with its count and meeting time (the
    // reporter is coming in A).
    const meeting = `<t:${String(at('2026-10-13T14:45') / 1000)}:t>`;
    const headings = textDisplays(post.message)
      .filter((text) => text.startsWith('**Group'))
      .map((text) => text.split('\n')[0]);
    expect(headings).toEqual(
      groups.map(
        ({ id }) =>
          `**Group ${id}: ${'L'.repeat(100)}** · ${id === 'A' ? 46 : 45} trainers · meeting at ${meeting}`,
      ),
    );
    // Plan 8X-1B: the statuses and Leave, the head count and Remote, then Group… and the
    // labelled buttons of a raid without times; no group has a button of its own.
    expect(buttonNames(post.message)).toEqual([
      '🤔',
      '🏃',
      '✅',
      '🎉',
      '👋',
      '⬇️',
      '⬆️',
      '📡',
      'Group…',
      'Manage…',
      'Set time…',
      'Screenshot feedback',
    ]);
    expect(sectionsOf(post.message).filter(({ button }) => button !== undefined)).toEqual([]);
    expect(thumbnailOf(post.message)).toMatch(/pm717/);
    // The boss's lines in the heading block and no Map button leave room for the gym's picture
    // even in so full a post (`postMessage` would leave it out past `MAX_COMPONENTS`).
    expect(thumbnailBeside(post.message, WHERE)).toBe(SHOWN_PICTURE);
    expect(textDisplays(post.message).some((text) => text.startsWith(WHERE))).toBe(true);
    // Each group one text and three rows of buttons: well within Discord's 40 with both
    // pictures (before plan 8X-1B the groups' Join and their details needed 43, folded to 40;
    // plan 8M-21's Manage… one more in the third row).
    expect(componentCount(post.message)).toBe(32);
    // And the fake gateway, as strict as Discord, takes it, and every copy of it.
    expectSendable(post);
    // With times (Meet… in the place of Set time) and no meeting times, the hint after the
    // groups is one more text, and it still fits.
    const untimed = renderRaidPost(
      view(
        {
          ...party,
          hatchTime: egg.hatchTime,
          endTime: egg.endTime,
          groups: groups.map(({ id, label }) => ({ id, label })),
        },
        { gym, now: at('2026-10-13T14:40') },
      ),
    );
    expect(textDisplays(untimed.message)).toContain(
      "-# Groups A, B, C, D and E have no meeting time yet: ⏰ sets your group's.",
    );
    expect(buttonNames(untimed.message).slice(5, 9)).toEqual(['⏰', '⬇️', '⬆️', '📡']);
    expect(thumbnailBeside(untimed.message, WHERE)).toBe(SHOWN_PICTURE);
    expect(componentCount(untimed.message)).toBe(33);
    expectSendable(untimed);
    // A gym without an address: beside its picture that is said, and without the picture
    // (where Discord refuses one) the words go with it.
    const lost = renderRaidPost(
      view(party, { gym: { ...gym, geodata: null }, now: at('2026-10-13T14:40') }),
    );
    const whereOf = (message: V2Message) =>
      textDisplays(message).find((text) => text.startsWith(WHERE));
    expect(whereOf(lost.message)).toMatch(
      /^\*\*Where\*\*\n\*\*The Stacks\*\* · \(no address available\) · \[Map\]\(<[^>]+>\)\nn{100}/,
    );
    expect(whereOf(postMessage(lost.layout, { picture: false }))).toMatch(
      /^\*\*Where\*\*\n\*\*The Stacks\*\* · \[Map\]\(<[^>]+>\)\nn{100}/,
    );
    expectSendable(lost);
    // With a lobby size (plan 8X-1) every group counts its lobby, and each, over its size, says
    // so in the place of the split-up note: the post still fits.
    const lobbies = renderRaidPost(view(party, { gym, now: at('2026-10-13T14:40'), lobbySize: 4 }));
    const lobbyHeadings = textDisplays(lobbies.message)
      .filter((text) => text.startsWith('**Group'))
      .map((text) => text.split('\n')[0]);
    expect(lobbyHeadings[0]).toBe(
      `**Group A: ${'L'.repeat(100)}** · 30/4 coming · 16 interested · meeting at ${meeting}`,
    );
    expect(textOf(lobbies.message)).toContain(LOBBY_OVER);
    expect(textOf(lobbies.message)).not.toContain('so split up');
    expect(layoutTextLength(lobbies.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
    expectSendable(lobbies);
  });

  it('keeps within those limits with the longest texts that need escaping everywhere', () => {
    const groups = (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({
      id,
      label: '*'.repeat(100),
      startTime: at('2026-10-13T14:45'),
    }));
    const attendees: Record<string, Partial<Attendee>> = {};
    groups.forEach(({ id }, g) => {
      for (let n = 0; n < 80; n++) {
        attendees[`4${String(g)}0000000000${String(n).padStart(6, '0')}`] = {
          group: id,
          name: `${'_'.repeat(28)}${String(n).padStart(4, '0')}`,
          status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
        };
      }
    });
    const party: RaidParty = {
      ...withAttendees(testRaid({ boss: { key: 'yveltal' } }), {
        ...attendees,
        [REPORTER]: { name: '*'.repeat(32) },
      }),
      raid: {
        ...testRaid({ boss: { key: 'yveltal' } }).raid,
        screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true },
      },
      groups,
      saved: true,
    };
    const gym: PostGym = {
      ...library!,
      name: '[*]'.repeat(85),
      nickname: null,
      taggedEx: true,
      notice: '<'.repeat(500),
      imageUrl: `${GYM_PICTURE}/${'p'.repeat(200)}`,
      geodata: JSON.stringify({ addressComponents: { route: '*_'.repeat(150) } }),
    };
    const post = renderRaidPost(view(party, { gym }));
    expectSendable(post);
    // The address and the notice are cut to their room; the lists are cut down with a count.
    expect(textOf(post.message)).toMatch(
      /\*\*Where\*\*\n\*\*[^\n]+\*\* · [^\n]*… · \[Map\]\(<[^>]+>\)\n[^\n]*…/,
    );
    expect(textOf(post.message)).toMatch(/…and \d+ more/);
  });

  it('keeps within those limits with one group as well', () => {
    const many: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 400; n++) {
      many[`5000000000000${String(n).padStart(5, '0')}`] = {
        name: `Trainer with a long name ${n}`,
        status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
      };
    }
    const party: RaidParty = {
      ...withAttendees(testRaid({ boss: { key: 'yveltal' } }), many),
      raid: {
        ...testRaid().raid,
        boss: { key: 'yveltal' },
        screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true },
      },
    };
    const post = renderRaidPost(
      view(party, {
        now: at('2026-10-13T14:40'),
        gym: { ...library!, taggedEx: true, notice: 'n'.repeat(500), imageUrl: GYM_PICTURE },
      }),
    );
    // One group leaves room for the gym's picture.
    expect(thumbnailBeside(post.message, WHERE)).toBe(SHOWN_PICTURE);
    expect(componentCount(post.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
    expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
    expectSendable(post);
  });

  it('puts the gym name through plain() in the post, but not in the post title', () => {
    const gym: PostGym = { ...library!, nickname: null, name: 'M*A*S*H [Memorial]' };
    const post = renderRaidPost(view(egg, { gym }));
    expect(block(post, WHERE)?.split('\n')[1]).toMatch(/^\*\*M\\\*A\\\*S\\\*H \[Memorial\]\*\* · /);
    expect(post.title).toBe('T5 egg · M*A*S*H [Memorial]');
  });

  it('calls a gym with an empty nickname by its name', () => {
    const gym: PostGym = { ...library!, nickname: '' };
    expect(raidTitle(view(egg, { gym }))).toBe('T5 egg · Pinewood Public Library');
    expect(block(renderRaidPost(view(egg, { gym })), WHERE)?.split('\n')[1]).toMatch(
      /^\*\*Pinewood Public Library\*\* · /,
    );
  });

  it('gives the date when the clock time alone would not say which day an egg hatches', () => {
    const elite = testRaid({ tier: { level: 'Elite', shadow: false } });
    const hatch = PARTY_NOW + 24 * HOUR;
    const end = hatch + 45 * MINUTE;
    const party: RaidParty = { ...elite, hatchTime: hatch, endTime: end };
    const expected =
      `Hatches <t:${hatch / 1000}:R>, at <t:${hatch / 1000}:f>. ` + `Ends at <t:${end / 1000}:f>.`;
    for (const now of [PARTY_NOW, PARTY_NOW + 5 * HOUR]) {
      expect(header(renderRaidPost(view(party, { now })))).toContain(expected);
    }
  });

  it('drops the date on the day itself: from midnight on the clock time is enough', () => {
    const elite = testRaid({ tier: { level: 'Elite', shadow: false } });
    const hatch = at('2026-10-14T18:00');
    const end = hatch + 30 * MINUTE;
    const party: RaidParty = { ...elite, hatchTime: hatch, endTime: end };
    const dated = `at <t:${hatch / 1000}:f>. Ends at <t:${end / 1000}:f>.`;
    const today = `at <t:${hatch / 1000}:t>. Ends at <t:${end / 1000}:t>.`;
    const times = (now: number, zone = PARTY_ZONE) =>
      header(renderRaidPost(view(party, { now, zone })))[1];
    expect(times(at('2026-10-13T23:59'))).toContain(dated);
    expect(times(at('2026-10-14T00:00'))).toContain(today);
    expect(times(at('2026-10-14T17:59'))).toContain(today);
    // The day is the one of the settings' time zone, not UTC's.
    expect(times(at('2026-10-13T23:59'), 'UTC')).toContain(today);
  });

  it('keeps the clock time alone for an egg that hatches within twelve hours of its report', () => {
    const hatch = PARTY_NOW + 12 * HOUR;
    const party: RaidParty = { ...egg, hatchTime: hatch, endTime: hatch + 45 * MINUTE };
    expect(header(renderRaidPost(view(party)))).toContain(
      `Hatches <t:${hatch / 1000}:R>, at <t:${hatch / 1000}:t>. Ends at <t:${hatch / 1000 + 2700}:t>.`,
    );
  });

  it('gives the date of the end of a raid that is over', () => {
    const end = at('2026-10-13T15:15') / 1000;
    const post = renderRaidPost(view(egg, { now: at('2026-10-13T16:00') }));
    expect(header(post)).toContain(`Ended at <t:${end}:f>.`);
  });

  it('counts the heads of those who completed it, and shows a member’s guests', () => {
    const party = withAttendees(egg, { [CAROL]: { status: PartyStatus.Complete, number: 3 } });
    expect(statusLine(renderRaidPost(view(party)), 'Done')).toBe(`🎉 Done (3): <@${CAROL}> +2`);
  });

  it('marks a double weakness with ×2 and a single one without', () => {
    const dragonite = testRaid({ boss: { key: 'dragonite' } });
    const hatched = renderRaidPost(view(dragonite, { now: at('2026-10-13T14:31') }));
    const value = block(hatched, '**Weaknesses**') ?? '';
    expect(value).toContain('Ice ×2');
    expect(value).toContain('Ice ×2, Rock, ');
  });

  it('shows a lower catch CP at the bottom of a shadow raid than of the same boss in a plain one', () => {
    const minCp = (shadow: boolean): number => {
      const party = testRaid({
        tier: { level: 'T5', shadow },
        boss: { key: 'landorus_incarnate' },
      });
      const value = textOf(renderRaidPost(view(party, { now: at('2026-10-13T14:31') })).message);
      return Number(/\*\*Catch CP\*\* (\d+)–/.exec(value)?.[1]);
    };
    expect(minCp(true)).toBeLessThan(minCp(false));
  });

  it('shows a post without its gym when the gym is gone', () => {
    const post = renderRaidPost(view(egg, { gym: undefined }));
    expect(header(post)[0]).toBe('### Level 5 raid (egg)');
    // Where names the gym as unknown, without a map or a picture.
    expect(block(post, WHERE)).toBe(`${WHERE}\n**Unknown gym**`);
    expect(textOf(post.message)).not.toContain('[Map]');
    expect(buttonLabels(post.message)).not.toContain('Map');
    expect(post.brief).not.toHaveProperty('map');
  });

  it('has the same result for the same view', () => {
    expect(renderRaidPost(view(yveltal))).toEqual(renderRaidPost(view(yveltal)));
  });
});

describe('the hint of a raid without a meeting time (8D-F, F4; Meet… by its icon since 8X-1B)', () => {
  const ONE = '-# No meeting time yet: ⏰ sets one.';
  const texts = (party: RaidParty, extra: Partial<RaidPostView> = {}) =>
    textDisplays(renderRaidPost(view(party, extra)).message);
  const hints = (party: RaidParty, extra: Partial<RaidPostView> = {}) =>
    texts(party, extra)
      .join('\n')
      .split('\n')
      .filter((line) => line.includes('no meeting time yet') || line.includes('No meeting time'));

  it("tells a raid of one group how to set one, by Meet…'s icon, last in the group's text", () => {
    const shown = texts(egg);
    expect(hints(egg)).toEqual([ONE]);
    const group = shown.find((text) => text.includes(ONE)) ?? '';
    expect(group.split('\n')).toEqual([
      '1 trainer',
      '🤔 Interested (1): <@200000000000000001>',
      ONE,
    ]);
    expect(shown.indexOf(group)).toBeGreaterThan(
      shown.findIndex((text) => text.startsWith('**Where**')),
    );
    // With the application's own icon, that one.
    const icons = { controlIcon: (name: string) => `<:${name}:1400823744760905729>` };
    expect(hints(egg, { emoji: { ...emoji, ...icons } })).toEqual([
      '-# No meeting time yet: <:pinemeet:1400823744760905729> sets one.',
    ]);
  });

  it('says it under a labelled group too, and drops it once the group has a time', () => {
    const labelled: RaidParty = { ...egg, groups: [{ id: 'A', label: 'park' }] };
    expect(texts(labelled).find((text) => text.startsWith('**Group A: park**'))).toMatch(
      new RegExp(`\\n${ONE}$`),
    );
    const meeting: RaidParty = {
      ...egg,
      groups: [{ id: 'A', label: 'park', startTime: at('2026-10-13T14:45') }],
    };
    expect(hints(meeting)).toEqual([]);
  });

  it('says it once after the groups, naming those without one, and not once all have one', () => {
    const grouped: RaidParty = withAttendees(
      { ...egg, groups: [{ id: 'A', startTime: at('2026-10-13T14:45') }, { id: 'B' }] },
      { [BOB]: { name: 'Bob', group: 'B' } },
    );
    const shown = texts(grouped);
    const several = "-# Group B has no meeting time yet: ⏰ sets your group's.";
    expect(hints(grouped)).toEqual([several]);
    // After the last group's text, as small print of its own; group A keeps its time.
    expect(shown.indexOf(several)).toBe(
      shown.findIndex((text) => text.startsWith('**Group B**')) + 1,
    );
    expect(shown.some((text) => /^\*\*Group A\*\* · .* · meeting at <t:\d+:t>\n/.test(text))).toBe(
      true,
    );
    const timed: RaidParty = {
      ...grouped,
      groups: [
        { id: 'A', startTime: at('2026-10-13T14:45') },
        { id: 'B', startTime: at('2026-10-13T14:50') },
      ],
    };
    expect(hints(timed)).toEqual([]);
  });

  it('says nothing of a group nobody is in', () => {
    const grouped: RaidParty = {
      ...egg,
      groups: [{ id: 'A', startTime: at('2026-10-13T14:45') }, { id: 'B' }],
    };
    expect(hints(grouped)).toEqual([]);
  });

  it('says nothing while the raid has no times: Set time stands in the place of Meet…', () => {
    expect(hints(testRaid())).toEqual([]);
  });

  it('says it in the post and in every copy, where Meet… works as well', () => {
    const place = { postId: '900000000000000001', regionChannelId: '100000000000000001' };
    const grouped: RaidParty = withAttendees(
      { ...egg, groups: [{ id: 'A' }, { id: 'B' }] },
      { [BOB]: { name: 'Bob', group: 'B' } },
    );
    for (const party of [egg, grouped]) {
      const post = renderRaidPost(view(party));
      for (const kind of ['status', 'remote', 'ex', 'region'] as const) {
        expect(textOf(renderMirror(kind, post, place)), kind).toMatch(/no meeting time yet/i);
      }
    }
  });

  it('says nothing of it once the raid is over or closed', () => {
    const grouped: RaidParty = { ...egg, groups: [{ id: 'A' }, { id: 'B' }] };
    for (const party of [egg, grouped]) {
      expect(hints(party, { now: at('2026-10-13T15:15') })).toEqual([]);
      expect(hints(party, { closed: 'This raid was closed by **Mo** (<@9>).' })).toEqual([]);
    }
  });
});

describe('the roles of a raid post’s blocks (plan 8M-8A)', () => {
  it('marks its heading, Where, trainers and small print, which its message does not show', () => {
    const party = withAttendees(yveltal, {
      [ALICE]: { name: 'Alice' },
      [BOB]: { name: 'Bob', status: PartyStatus.Interested },
    });
    const post = renderRaidPost(view(party));
    expect(roleLines(post.layout)).toEqual([
      ['head', '### Level 5 raid (egg)'],
      ['where', WHERE],
      ['trainers', '3 trainers'],
      ['note', expect.stringMatching(/^-# Reported by /u)],
    ]);
    expect(postMessage(post.layout)).toEqual(postMessage(withoutRoles(post.layout)));
  });
});

describe('renderRaidPost: neighbors (plan 19E)', () => {
  const LINK = 'https://discord.com/channels/412345678901234502/900000000000000009';
  const neighbor = { server: 'Pewter City', link: LINK };

  it('words a neighbor’s raid as its own post does, its time in the reading server’s zone', () => {
    const theirs = withAttendees(egg, {
      [ALICE]: { status: PartyStatus.Coming, number: 2 },
    });
    // 14:30 in New York is 00:00 the next day in Kolkata: the date is said there.
    expect(raidNeighborLine(view(theirs), neighbor, 'Asia/Kolkata')).toBe(
      `- **Pewter City** · Level 5 raid (egg) · hatches <t:${String(at('2026-10-13T14:30') / 1000)}:f> · ` +
        `Interested (1), Coming (2) · [Its post](<${LINK}>)`,
    );
    expect(raidNeighborLine(view(theirs), neighbor, PARTY_ZONE)).toContain(
      `hatches <t:${String(at('2026-10-13T14:30') / 1000)}:t>`,
    );
    const hatched = setBoss(
      setHatchTime(testRaid(), at('2026-10-13T13:30'), rules, PARTY_NOW),
      { tier: T5, boss: { key: 'yveltal' } },
      rules,
      PARTY_NOW,
    ).party;
    expect(raidNeighborLine(view(hatched), neighbor, PARTY_ZONE)).toMatch(
      /^- \*\*Pewter City\*\* · Level 5 raid against Yveltal ✨ · until <t:\d+:t> · /,
    );
  });

  it('shows the neighbors’ lines below who comes, and none in the last showing', () => {
    const lines = ['- **Pewter City** · Level 5 raid (egg) · nobody yet'];
    const rendered = renderRaidPost(view(testRaid(), { neighbors: { at: 'gym', lines } }));
    const texts = textDisplays(rendered.message);
    const block = texts.indexOf(`**Neighbors at this gym**\n${lines[0]!}`);
    expect(block).toBeGreaterThan(texts.findIndex((text) => text.includes('Interested (1)')));
    expect(rendered.brief.lines.join('\n')).not.toContain('Pewter');
    expectSendable(rendered);
    const closed = renderRaidPost(
      view(testRaid(), { neighbors: { at: 'gym', lines }, closed: 'Closed by staff.' }),
    );
    expect(textOf(closed.message)).not.toContain('Neighbors');
  });

  it('fits the neighbors by whole lines in a crowded post, counting the rest (review R6)', () => {
    const lines = Array.from(
      { length: 40 },
      (_, n) =>
        `- **${'Pewter City '.repeat(8)}${String(n)}** · Level 5 raid against Yveltal · ` +
        `Interested (1), Coming (2) · [Its post](<${LINK}${String(n)}>)`,
    );
    const crowded = withAttendees(egg, trainers(30));
    const post = renderRaidPost(view(crowded, { neighbors: { at: 'gym', lines } }));
    expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
    const block = textDisplays(post.message).find((text) => text.startsWith('**Neighbors'));
    const [heading, ...shown] = (block ?? '').split('\n');
    expect(heading).toBe('**Neighbors at this gym**');
    const more = /^…and (\d+) more$/.exec(shown.at(-1) ?? '');
    const whole = shown.slice(0, -1);
    expect(whole.length).toBeGreaterThan(0);
    // Every line shown is whole, never cut inside its markup, and the rest are counted.
    expect(whole).toEqual(lines.slice(0, whole.length));
    expect(whole.length + Number(more?.[1])).toBe(lines.length);
  });
});
