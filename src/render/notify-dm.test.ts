import { describe, expect, it } from 'vitest';
import { ButtonStyle, ComponentType } from 'discord.js';
import {
  buttonsOf,
  componentCount,
  dmBrief,
  dmReasons,
  dmSentence,
  linksOf,
  textDisplays,
  thumbnailOf,
  accentOf,
} from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import {
  bossSetSentence,
  mapLink,
  stopButtonRoom,
  maxDmSentence,
  meetingDmSentence,
  NEWS_COLOUR,
  notifyDm,
  postButton,
  postLink,
  raidDmSentence,
  reportButton,
  stopButtonId,
  stopHint,
  trainDmSentence,
  withoutButton,
  withStopped,
  changeButtonId,
  withChanged,
  type ControlRows,
  type MaxDmView,
  type RaidDmView,
  type ShownReason,
} from './notify-dm.js';

const GUILD = '412345678901234567';
const POST = '900000000000000001';
const REGION = '100000000000000001';
const LINK = postLink(GUILD, POST);

const view = (more: Partial<RaidDmView> = {}): RaidDmView => ({
  event: 'reported',
  tier: { level: 'T5', shadow: false },
  boss: 'Yveltal',
  gym: 'The Stacks',
  regionChannelId: REGION,
  reporter: { id: '200000000000000001', name: 'Rhea' },
  ...more,
});

describe('postLink', () => {
  it('is the address of a post, or of a message in a channel', () => {
    expect(LINK).toBe(`https://discord.com/channels/${GUILD}/${POST}`);
    expect(postLink(GUILD, REGION, '5')).toBe(`https://discord.com/channels/${GUILD}/${REGION}/5`);
  });
});

describe('raidDmSentence', () => {
  it('says the legacy sentence for a reported raid, naming the reporter by name alone', () => {
    expect(raidDmSentence(view())).toBe(
      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>) by **Rhea**.`,
    );
  });

  it('calls an egg by its tier, with the right article', () => {
    expect(raidDmSentence(view({ boss: undefined }))).toBe(
      `A T5 egg has been reported at **The Stacks** (<#${REGION}>) by **Rhea**.`,
    );
    expect(
      raidDmSentence(view({ boss: undefined, tier: { level: 'Elite', shadow: false } })),
    ).toMatch(/^An Elite egg has been reported/);
    expect(raidDmSentence(view({ boss: undefined, tier: { level: 'T3', shadow: true } }))).toMatch(
      /^A Shadow T3 egg has been reported/,
    );
  });

  it('names nobody for an anonymous report, and falls back to the mention without a name', () => {
    expect(raidDmSentence(view({ reporter: undefined }))).toBe(
      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>).`,
    );
    expect(raidDmSentence(view({ reporter: { id: '200000000000000001' } }))).toContain(
      'by **<@200000000000000001>**',
    );
  });

  it('leaves the region out when it is gone', () => {
    expect(raidDmSentence(view({ regionChannelId: undefined, reporter: undefined }))).toBe(
      `A raid for **Yveltal** has been reported at **The Stacks**.`,
    );
  });

  it('ends the sentence once after a gym whose name ends in a period (plan 8X-F)', () => {
    expect(
      raidDmSentence(
        view({ gym: 'Fire Company Inc.', regionChannelId: undefined, reporter: undefined }),
      ),
    ).toBe('A raid for **Yveltal** has been reported at **Fire Company Inc.**');
  });
});

describe('maxDmSentence (plan 8X-F)', () => {
  const max = (more: Partial<MaxDmView> = {}): MaxDmView => ({
    event: 'reported',
    title: 'Dynamax Machamp (2★)',
    spot: 'Gazebo of the Park',
    pin: false,
    regionChannelId: REGION,
    ...more,
  });

  it('names a Power Spot in bold, and a pin as an unlisted power spot in running text', () => {
    expect(maxDmSentence(max())).toBe(
      `A **Dynamax Machamp (2★)** battle has been reported at **Gazebo of the Park** (<#${REGION}>).`,
    );
    expect(maxDmSentence(max({ pin: true, spot: 'Unlisted power spot' }))).toBe(
      `A **Dynamax Machamp (2★)** battle has been reported at an unlisted power spot (<#${REGION}>).`,
    );
    expect(maxDmSentence(max({ event: 'boss', pin: true, regionChannelId: undefined }))).toBe(
      'The max battle at an unlisted power spot is now against **Dynamax Machamp (2★)**.',
    );
  });

  it('ends the sentence once after a spot whose name ends in a period', () => {
    expect(maxDmSentence(max({ spot: 'Fire Company Inc.', regionChannelId: undefined }))).toBe(
      'A **Dynamax Machamp (2★)** battle has been reported at **Fire Company Inc.**',
    );
  });

  it('says that the raid has its boss, without naming who acted', () => {
    expect(raidDmSentence(view({ event: 'boss' }))).toBe(
      `The raid at **The Stacks** (<#${REGION}>) now has its boss, **Yveltal**.`,
    );
    // Another boss than it had: a correction.
    expect(raidDmSentence(view({ event: 'boss', corrected: true }))).toBe(
      `The boss of the raid at **The Stacks** (<#${REGION}>) is now **Yveltal**.`,
    );
    expect(
      raidDmSentence(
        view({ event: 'boss', boss: undefined, tier: { level: 'T3', shadow: false } }),
      ),
    ).toBe(`The raid at **The Stacks** (<#${REGION}>) is a T3 egg now.`);
  });

  it('says where the raid is when its gym was corrected', () => {
    expect(raidDmSentence(view({ event: 'gym' }))).toBe(
      `The raid for **Yveltal** is at **The Stacks** (<#${REGION}>), not where it was first reported.`,
    );
    expect(raidDmSentence(view({ event: 'gym', boss: undefined }))).toBe(
      `The T5 egg is at **The Stacks** (<#${REGION}>), not where it was first reported.`,
    );
  });

  it('shows what a feed or a member wrote as plain text', () => {
    const sentence = raidDmSentence(
      view({
        boss: '**Boss** @everyone',
        gym: '[gym](https://example.com)',
        reporter: { id: '1', name: '_Rhea_ <@&5>' },
      }),
    );
    expect(sentence).not.toContain('@everyone');
    expect(sentence).not.toContain('](');
    expect(sentence).not.toContain('<@&');
    expect(sentence).toContain('\\_Rhea\\_');
  });
});

describe('a member named in a direct message', () => {
  const linked = { id: '200000000000000001', name: 'www.evil.example https://evil.example/x' };
  const shown = '**www.\u200Bevil.example https:\u200B//evil.\u200Bexample/x**';

  it('never brings a working link with their name: raid, train and meeting time', () => {
    const raid = raidDmSentence(view({ reporter: linked }));
    expect(raid).toBe(
      `A raid for **Yveltal** has been reported at **The Stacks** (<#${REGION}>) by ${shown}.`,
    );
    const train = trainDmSentence({ regionChannelId: REGION, maker: linked });
    expect(train).toBe(`A new train has been announced in <#${REGION}> by ${shown}.`);
    const meeting = meetingDmSentence({
      what: 'meeting',
      subject: 'the raid at The Stacks',
      by: linked,
      time: null,
      heads: 2,
      link: LINK,
    });
    expect(meeting).toBe(
      `No meeting time any more for the raid at The Stacks (canceled by ${shown.replaceAll('**', '')}): ${LINK}`,
    );
    // No address in the sentences of the notifier; the meeting time's one is the post's own.
    for (const sentence of [raid, train]) {
      expect(sentence).not.toContain('://');
      expect(sentence).not.toContain('www.e');
    }
    expect(meeting.match(/:\/\//g)).toHaveLength(1);
    expect(meeting).not.toContain('www.e');
  });
});

describe('notifyDm', () => {
  const PICTURE = 'https://cdn.example.test/pm717.icon.png';
  const MAPS = 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05';
  const brief = {
    accent: 0x2ecc71,
    picture: PICTURE,
    lines: ['**Level 5 raid against Yveltal** ✨', 'Ends <t:2:R>, at <t:2:t>.', '3 trainers'],
  };
  const reason = (n: number, more: Partial<ShownReason> = {}): ShownReason => ({
    label: `reason ${String(n)}`,
    stop: `dm:${GUILD}:stop:g:${String(n)}`,
    command: '/untarget',
    ...more,
  });

  it('puts the news first, the brief under it with the picture beside it, then the links', () => {
    const message = notifyDm(
      { sentence: 'A raid.', brief, links: [postButton(LINK), mapLink(MAPS)] },
      [reason(1)],
    );
    expect(dmSentence(message)).toBe('A raid.');
    expect(dmBrief(message)).toEqual(brief.lines);
    expect(thumbnailOf(message)).toBe(PICTURE);
    expect(accentOf(message)).toBe(0x2ecc71);
    expect(linksOf(message)).toEqual([`Go to post ${LINK}`, `Map ${MAPS}`]);
    expect(
      buttonsOf(message)
        .slice(0, 2)
        .map((button) => button.emoji),
    ).toEqual(['↗️', '🗺️']);
    expect(message.mention).toBeUndefined();
    expectV2Sendable(message);
  });

  it('carries the file of a picture that is one of the message (an egg without web pages)', () => {
    const egg = {
      ...brief,
      picture: 'attachment://raid_egg_2_icon.png',
      pictureFile: '/bot/pictures/eggs/raid_egg_2_icon.png',
    };
    const message = notifyDm({ sentence: 'A raid.', brief: egg, links: [] }, [reason(1)]);
    expect(thumbnailOf(message)).toBe('attachment://raid_egg_2_icon.png');
    expect(message.files).toEqual(['/bot/pictures/eggs/raid_egg_2_icon.png']);
    expectV2Sendable(message);
    // A picture by address needs no file.
    expect(notifyDm({ sentence: 'A raid.', brief, links: [] }, []).files).toBeUndefined();
  });

  it('names each reason in a section of its own with its Stop button beside it', () => {
    const message = notifyDm({ sentence: 'A raid.', brief, links: [postButton(LINK)] }, [
      reason(1, { label: 'Yveltal' }),
      reason(2, { label: 'raids at The Stacks' }),
    ]);
    const texts = textDisplays(message);
    expect(texts.slice(1)).toEqual([
      '-# You asked to be told about',
      'Yveltal',
      'raids at The Stacks',
    ]);
    expect(dmReasons(message)).toEqual(['Yveltal', 'raids at The Stacks']);
    expect(buttonsOf(message).slice(1)).toEqual([
      {
        label: 'Stop',
        emoji: undefined,
        style: ButtonStyle.Secondary,
        customId: `dm:${GUILD}:stop:g:1`,
        url: undefined,
      },
      {
        label: 'Stop',
        emoji: undefined,
        style: ButtonStyle.Secondary,
        customId: `dm:${GUILD}:stop:g:2`,
        url: undefined,
      },
    ]);
  });

  // Plan 8X-F (Matt, staging of 8X): "You won't be told … for an hour" beside Stop read as if
  // Stop silenced it for an hour. All text first, the Stop buttons last.
  it('puts the note under the links, and the Stop buttons last, after all text', () => {
    const message = notifyDm(
      {
        sentence: 'A battle.',
        brief,
        links: [postButton(LINK)],
        note: "You won't be told about more Dynamax Machamp battles for an hour.",
      },
      [reason(1, { label: 'Long form', stop: undefined, command: '/unwant' }), reason(2)],
    );
    const parts = (message.components[0] as { components: { type: ComponentType }[] }).components;
    expect(parts.map((part) => part.type)).toEqual([
      ComponentType.Section, // the news, the picture beside it
      ComponentType.ActionRow, // the links
      ComponentType.TextDisplay, // the note
      ComponentType.Separator,
      ComponentType.TextDisplay, // "You asked to be told about"
      ComponentType.TextDisplay, // the reasons without a button
      ComponentType.Section, // reason 2 with its Stop
    ]);
    expect(textDisplays(message).slice(1)).toEqual([
      "-# You won't be told about more Dynamax Machamp battles for an hour.",
      '-# You asked to be told about',
      'Long form\n-# To stop what has no button here, use `/unwant` in the server.',
      'reason 2',
    ]);
    expect(dmReasons(message)).toEqual(['reason 2', 'Long form']);
  });

  it('counts the note in the room for Stop buttons, within what Discord takes (R4)', () => {
    const reasons = Array.from({ length: 16 }, (_, n) => reason(n));
    const message = notifyDm(
      {
        sentence: 'A battle.',
        brief,
        links: [postButton(LINK), mapLink(MAPS)],
        note: "You won't be told about more Dynamax Machamp battles for an hour.",
      },
      reasons,
    );
    expectV2Sendable(message);
    expect(componentCount(message)).toBeLessThanOrEqual(40);
    // The container, the news with its picture, two links in their row, the note, the line and
    // the heading.
    const most = stopButtonRoom(1 + 3 + 3 + 1 + 2);
    expect(buttonsOf(message).filter((button) => button.customId !== undefined)).toHaveLength(most);
    expect(dmReasons(message)).toHaveLength(reasons.length);
  });

  it('gives a Pokémon or a tier Manage…, one section for every reason of it (plan 8R-4, F5)', () => {
    const change = `dm:${GUILD}:change:sp:25`;
    const message = notifyDm({ sentence: 'A raid.', brief, links: [postButton(LINK)] }, [
      {
        label: 'Costumed Pikachu',
        change: { customId: change, name: 'Costumed Pikachu', box: 'Raids' },
      },
      reason(1, { label: 'raids at The Stacks' }),
      {
        label: 'Pikachu (research)',
        change: { customId: change, name: 'Costumed Pikachu', box: 'Research' },
      },
    ]);
    expect(dmReasons(message)).toEqual([
      'Costumed Pikachu · Raids, Research',
      'raids at The Stacks',
    ]);
    expect(buttonsOf(message).slice(1)).toEqual([
      {
        label: 'Manage…',
        emoji: undefined,
        style: ButtonStyle.Secondary,
        customId: change,
        url: undefined,
      },
      {
        label: 'Stop',
        emoji: undefined,
        style: ButtonStyle.Secondary,
        customId: `dm:${GUILD}:stop:g:1`,
        url: undefined,
      },
    ]);
    expectV2Sendable(message);
    // A Manage… is a button like Stop: after all text (plan 8X-F), below a reason without one.
    const mixed = notifyDm({ sentence: 'A raid.', links: [] }, [
      { label: 'Costumed Pikachu', change: { customId: change, name: 'Pikachu', box: 'Raids' } },
      reason(2, { label: 'Long form', stop: undefined, command: '/unwant' }),
    ]);
    const types = (mixed.components[0] as { components: { type: ComponentType }[] }).components.map(
      (part) => part.type,
    );
    expect(types.at(-1)).toBe(ComponentType.Section);
    expect(types.at(-2)).toBe(ComponentType.TextDisplay);
    // A Manage… whose id does not fit is named with the commands that change and stop it (W4).
    const unfit = notifyDm({ sentence: 'A raid.', links: [] }, [
      { label: 'X', command: '/unwant', change: { customId: undefined, name: 'X', box: 'Raids' } },
    ]);
    expect(dmReasons(unfit)).toEqual(['X · Raids']);
    expect(textDisplays(unfit).at(-1)).toBe(
      'X · Raids\n-# To change or stop what has no button here, use `/want` or `/unwant` in the ' +
        'server.',
    );
  });

  it('counts one Manage… once among the buttons a message has room for', () => {
    const many = Array.from({ length: 12 }, (_, n): ShownReason => {
      const customId = `dm:${GUILD}:change:sp:${String(n + 1)}`;
      return { label: `p${String(n)}`, change: { customId, name: `P${String(n)}`, box: 'Raids' } };
    });
    // Each species twice: a second reason of one species takes no room of its own.
    const twice = many.flatMap((one) => [
      one,
      { ...one, change: { ...one.change!, box: 'Research' } },
    ]);
    const message = notifyDm({ sentence: 'A raid.', brief, links: [postButton(LINK)] }, twice);
    const changes = buttonsOf(message).filter((button) => button.label === 'Manage…');
    // The container, the news beside its picture, the row of one link, the line and the heading.
    expect(changes).toHaveLength(Math.min(12, stopButtonRoom(1 + 3 + 2 + 2)));
    expectV2Sendable(message);
  });

  it('shows the news as text alone without a picture, and in its own colour without a brief', () => {
    const plainNews = notifyDm(
      { sentence: 'A train.', brief: { accent: 0x3498db, lines: ['No route yet'] }, links: [] },
      [],
    );
    expect(textDisplays(plainNews)).toEqual(['A train.\nNo route yet']);
    expect(thumbnailOf(plainNews)).toBeUndefined();
    expect(componentCount(plainNews)).toBe(2);
    const bare = notifyDm({ sentence: 'A spawn.', links: [reportButton(LINK)] }, []);
    expect(accentOf(bare)).toBe(NEWS_COLOUR);
    expect(textDisplays(bare)).toEqual(['A spawn.']);
    expect(linksOf(bare)).toEqual([`Go to report ${LINK}`]);
    expectV2Sendable(bare);
  });

  it('lists the reasons without a button together, with the command that stops them', () => {
    const message = notifyDm({ sentence: 'A raid.', links: [] }, [
      reason(1, { label: 'Long form', stop: undefined, command: '/unwant' }),
      reason(2),
      { label: 'the boss of your eggs', stop: `dm:${GUILD}:stop:boss` },
    ]);
    expect(dmReasons(message)).toEqual(['reason 2', 'the boss of your eggs', 'Long form']);
    // Before the two Stop sections, which come last (plan 8X-F).
    expect(textDisplays(message).at(-3)).toBe(
      'Long form\n-# To stop what has no button here, use `/unwant` in the server.',
    );
    expect(buttonsOf(message).map((button) => button.customId)).toEqual([
      `dm:${GUILD}:stop:g:2`,
      `dm:${GUILD}:stop:boss`,
    ]);
  });

  it('keeps within what Discord takes with more reasons than get a button, and long texts', () => {
    // Every text needs escapes, every label is longer than a message shows of it.
    const long = (n: number) => `${'\\_'.repeat(150)}${String(n)}`;
    // The container, the news with its picture, two links in their row, the line and heading.
    const most = stopButtonRoom(1 + 3 + 3 + 2);
    expect(most).toBe(10);
    const reasons = Array.from({ length: most + 6 }, (_, n) => reason(n, { label: long(n) }));
    const message = notifyDm(
      {
        sentence: `A raid for **${'\\*'.repeat(120)}** has been reported at **${'\\['.repeat(250)}**.`,
        brief: { ...brief, lines: [...brief.lines, '\\_'.repeat(200)] },
        links: [postButton(LINK), mapLink(MAPS)],
      },
      reasons,
    );
    expectV2Sendable(message);
    expect(componentCount(message)).toBeLessThanOrEqual(40);
    expect(buttonsOf(message).filter((button) => button.customId !== undefined)).toHaveLength(most);
    // The rest are named, cut where a label is too long, never after a lone backslash.
    expect(dmReasons(message)).toHaveLength(reasons.length);
    for (const label of dmReasons(message)) {
      expect(label.length).toBeLessThanOrEqual(150);
      expect(label).not.toMatch(/(^|[^\\])(\\\\)*\\…$/);
    }
    // The listed reasons stand before the Stop sections (plan 8X-F).
    expect(textDisplays(message).at(-1 - most)).toContain('use `/untarget` in the server');
  });

  it('counts the links and the picture of the message, so any of them stays within 40', () => {
    const reasons = Array.from({ length: 20 }, (_, n) => reason(n));
    const stops = (message: ReturnType<typeof notifyDm>) =>
      buttonsOf(message).filter((button) => button.customId !== undefined).length;
    const bare = notifyDm({ sentence: 'News.', links: [] }, reasons);
    const crowded = notifyDm(
      { sentence: 'News.', brief, links: Array.from({ length: 5 }, () => postButton(LINK)) },
      reasons,
    );
    // Without picture and links: the container, the news, the line and the heading.
    expect(stops(bare)).toBe(stopButtonRoom(4));
    expect(stops(bare)).toBe(11);
    // With the picture and five links: three more for the picture, six for the row.
    expect(stops(crowded)).toBe(stopButtonRoom(1 + 3 + 6 + 2));
    expect(stops(crowded)).toBe(9);
    for (const message of [bare, crowded]) {
      expect(componentCount(message)).toBeLessThanOrEqual(40);
      expectV2Sendable(message);
    }
  });
});

describe('stopHint', () => {
  it('names each command once, and nothing for reasons no command stops', () => {
    const hint = stopHint([
      { label: 'a', command: '/unwant' },
      { label: 'b', command: '/unwant' },
      { label: 'c', command: '/untarget' },
      { label: 'd' },
    ]);
    expect(hint).toBe(
      '-# To stop what has no button here, use `/unwant` or `/untarget` in the server.',
    );
    expect(stopHint([{ label: 'the boss of your eggs' }])).toBe('');
  });

  it('names `/want` and `/unwant` for a Manage… without its button (W4)', () => {
    const changed: ShownReason = {
      label: 'Pikachu',
      command: '/unwant',
      change: { customId: undefined, name: 'Pikachu', box: 'Raids' },
    };
    expect(stopHint([changed])).toBe(
      '-# To change or stop what has no button here, use `/want` or `/unwant` in the server.',
    );
    expect(stopHint([changed, { label: 'c', command: '/untarget' }])).toBe(
      '-# To change or stop what has no button here, use `/want`, `/unwant` or `/untarget` in ' +
        'the server.',
    );
  });
});

describe('the stop buttons of a message', () => {
  it('spells the id of a button with the server as its id', () => {
    expect(stopButtonId(GUILD, { kind: 'gym', gymId: 4 })).toBe(`dm:${GUILD}:stop:g:4`);
    expect(stopButtonId(GUILD, { kind: 'boss-set' })).toBe(`dm:${GUILD}:stop:boss`);
  });

  it('spells Manage… by the server and the species, form or tier its dialog opens for', () => {
    expect(changeButtonId(GUILD, { kind: 'pokemon', dex: 25 })).toBe(`dm:${GUILD}:change:sp:25`);
    expect(changeButtonId(GUILD, { kind: 'pokemon', dex: 201, form: 'unown_a' })).toBe(
      `dm:${GUILD}:change:sp:201:unown_a`,
    );
    expect(changeButtonId(GUILD, { kind: 'tier', level: 'T5' })).toBe(`dm:${GUILD}:change:st:T5`);
  });

  it('turns Manage… after a Submit into a disabled Changed or Removed (plan 8R-4)', () => {
    const change = `dm:${GUILD}:change:sp:25`;
    const message = notifyDm({ sentence: 'A raid.', links: [] }, [
      { label: 'Pikachu', change: { customId: change, name: 'Pikachu', box: 'Raids' } },
      { label: 'a gym', stop: `dm:${GUILD}:stop:g:1` },
    ]);
    for (const [removed, label] of [
      [false, 'Changed'],
      [true, 'Removed'],
    ] as const) {
      const done = withChanged(message.components, change, removed);
      expect(buttonsOf({ v2: true, components: done }).map((button) => button.label)).toEqual([
        label,
        'Stop',
      ]);
      // The one pressed, alone, is disabled; its id stays.
      expect(JSON.stringify(done).match(/"disabled":true/g)).toHaveLength(1);
      expect(buttonsOf({ v2: true, components: done })[0]?.customId).toBe(change);
    }
  });

  it('turns a pressed button into a disabled Stopped and leaves the rest as it was', () => {
    const ids = [1, 2, 3].map((n) => `dm:${GUILD}:stop:g:${String(n)}`);
    const message = notifyDm(
      { sentence: 'A raid.', links: [postButton(LINK)] },
      ids.map((stop, n) => ({ label: `reason ${String(n)}`, stop })),
    );
    const pressed = withStopped(message.components, ids[1] ?? '');
    const after = { v2: true as const, components: pressed };
    expect(buttonsOf(after).map((button) => [button.label, button.customId])).toEqual([
      ['Go to post', undefined],
      ['Stop', ids[0]],
      ['Stopped', ids[1]],
      ['Stop', ids[2]],
    ]);
    const disabled = JSON.stringify(pressed).match(/"disabled":true/g);
    expect(disabled).toHaveLength(1);
    expect(textDisplays(after)).toEqual(textDisplays(message));
    expectV2Sendable(after);
    // A press of a button the message does not have changes nothing.
    expect(withStopped(message.components, 'dm:other')).toEqual(message.components);
  });

  it('takes a button off a classic message sent before the DMs were v2; an empty row goes', () => {
    const button = (n: number) => ({
      type: ComponentType.Button as const,
      style: ButtonStyle.Secondary as const,
      custom_id: `dm:${GUILD}:stop:g:${String(n)}`,
      label: `Stop: reason ${String(n)}`,
    });
    const rows: ControlRows = [
      { type: ComponentType.ActionRow, components: [button(1), button(2), button(3)] },
    ];
    const ids = (left: ControlRows): string[] =>
      left.flatMap((row) =>
        row.components.map((control) => ('custom_id' in control ? control.custom_id : '')),
      );
    expect(ids(withoutButton(rows, `dm:${GUILD}:stop:g:2`))).toEqual([
      `dm:${GUILD}:stop:g:1`,
      `dm:${GUILD}:stop:g:3`,
    ]);
    const one: ControlRows = [{ type: ComponentType.ActionRow, components: [button(1)] }];
    expect(withoutButton(one, `dm:${GUILD}:stop:g:1`)).toEqual([]);
    expect(withoutButton(rows, 'dm:other')).toEqual(rows);
  });
});

describe('the sentences for members of a party and for a new train', () => {
  it('says what an egg hatched into, or what its boss is while it has not hatched', () => {
    const view = { boss: 'Yveltal', gym: 'The Stacks', regionChannelId: REGION };
    expect(bossSetSentence({ ...view, hatched: true })).toBe(
      `The egg at **The Stacks** (<#${REGION}>) hatched into **Yveltal**.`,
    );
    expect(bossSetSentence({ ...view, hatched: false })).toBe(
      `The boss of the egg at **The Stacks** (<#${REGION}>) is **Yveltal**.`,
    );
  });

  it('says the legacy sentence for a new train', () => {
    expect(trainDmSentence({ regionChannelId: REGION, maker: { id: '1', name: 'Rhea' } })).toBe(
      `A new train has been announced in <#${REGION}> by **Rhea**.`,
    );
    expect(trainDmSentence({ regionChannelId: undefined, maker: { id: '1' } })).toBe(
      `A new train has been announced by **<@1>**.`,
    );
    // A maker who chose not to be named is not named here either.
    expect(trainDmSentence({ regionChannelId: REGION })).toBe(
      `A new train has been announced in <#${REGION}>.`,
    );
    // A train of max battles is named by its kind (plan 8X-4); a raid train as it always was.
    expect(trainDmSentence({ regionChannelId: REGION, kind: 'gigantamax' })).toBe(
      `A new Gigantamax Train has been announced in <#${REGION}>.`,
    );
    expect(trainDmSentence({ regionChannelId: REGION, kind: 'dynamax' })).toBe(
      `A new Max Battle Train has been announced in <#${REGION}>.`,
    );
    expect(trainDmSentence({ regionChannelId: REGION, kind: 'raid' })).toBe(
      `A new train has been announced in <#${REGION}>.`,
    );
  });

  it('says a meeting time for the phone: the time first, no markdown, the address last', () => {
    // A push notification shows the text raw (Matt, 2026-10-15): no `**`, and what matters first.
    const by = { id: '1', name: 'Rhea' };
    const raid = 'the raid at The Stacks';
    const at = (view: Omit<Parameters<typeof meetingDmSentence>[0], 'subject' | 'link'>) =>
      meetingDmSentence({ ...view, subject: raid, link: LINK });
    expect(at({ what: 'meeting', by, time: '<t:1:t>', heads: 4 })).toBe(
      `Meet at <t:1:t> for the raid at The Stacks (set by Rhea). 4 trainers are attending: ${LINK}`,
    );
    expect(at({ what: 'meeting', by, time: '<t:1:t>', heads: 1 })).toBe(
      `Meet at <t:1:t> for the raid at The Stacks (set by Rhea). 1 trainer is attending: ${LINK}`,
    );
    expect(at({ what: 'meeting', by, time: null, heads: 4 })).toBe(
      `No meeting time any more for the raid at The Stacks (canceled by Rhea): ${LINK}`,
    );
    const train = { subject: 'the train Dialga loop', link: LINK };
    expect(meetingDmSentence({ ...train, what: 'start', by, time: '<t:1:f>', heads: 2 })).toBe(
      `Start at <t:1:f> for the train Dialga loop (set by Rhea). 2 trainers are attending: ${LINK}`,
    );
    expect(meetingDmSentence({ ...train, what: 'start', by, time: null, heads: 2 })).toBe(
      `No start time any more for the train Dialga loop (removed by Rhea): ${LINK}`,
    );
    // Nobody to name: the maker of a train who asked not to be named.
    expect(
      meetingDmSentence({ ...train, what: 'start', by: null, time: '<t:1:f>', heads: 2 }),
    ).toBe(`Start at <t:1:f> for the train Dialga loop. 2 trainers are attending: ${LINK}`);
    expect(meetingDmSentence({ ...train, what: 'start', by: null, time: null, heads: 2 })).toBe(
      `No start time any more for the train Dialga loop: ${LINK}`,
    );
    // A member without a name is named by the mention, the one fallback there is.
    expect(at({ what: 'meeting', by: { id: '7' }, time: '<t:1:t>', heads: 2 })).toContain(
      '(set by <@7>)',
    );
  });
});
