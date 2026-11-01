import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  channelLimitOf,
  isRefusedBody,
  refusedPart,
  type OutgoingMessage,
  type V2Message,
} from '../../src/discord/party-gateway.js';
import { FakePartyGateway } from './fake-gateway.js';
import { EAST_FORUM, WEST_FORUM } from './gyms.js';
import { ALICE, BOB } from './parties.js';

describe('FakePartyGateway: who can see a forum', () => {
  function gateway(): FakePartyGateway {
    const fake = new FakePartyGateway();
    fake.addForum(WEST_FORUM);
    fake.addForum(EAST_FORUM);
    return fake;
  }

  it('lets everybody see a forum unless they are shut out of it', async () => {
    const fake = gateway();
    fake.shutOut(EAST_FORUM, ALICE);
    expect(await fake.memberAccess(WEST_FORUM, ALICE)).toBe('visible');
    expect(await fake.memberAccess(EAST_FORUM, ALICE)).toBe('hidden');
    expect(await fake.memberAccess(EAST_FORUM, BOB)).toBe('visible');
    // Looking is not a call to Discord.
    expect(fake.calls).toEqual([]);
  });

  it('admits a member with an overwrite of their own and dismisses them again', async () => {
    const fake = gateway();
    fake.shutOut(EAST_FORUM, ALICE);
    expect(await fake.admitMember(EAST_FORUM, ALICE)).toBe(true);
    expect(await fake.memberAccess(EAST_FORUM, ALICE)).toBe('visible');
    expect(fake.canSee(EAST_FORUM, ALICE)).toBe(true);
    expect(await fake.dismissMember(EAST_FORUM, ALICE)).toBe(true);
    expect(await fake.dismissMember(EAST_FORUM, ALICE)).toBe(true);
    expect(await fake.memberAccess(EAST_FORUM, ALICE)).toBe('hidden');
    expect(fake.calls).toEqual([
      `admitMember ${EAST_FORUM} ${ALICE}`,
      `dismissMember ${EAST_FORUM} ${ALICE}`,
      `dismissMember ${EAST_FORUM} ${ALICE}`,
    ]);
  });

  it('knows a member who is kept out on purpose, a forum that is gone and a member who left', async () => {
    const fake = gateway();
    fake.barred.set(EAST_FORUM, new Set([ALICE]));
    expect(await fake.memberAccess(EAST_FORUM, ALICE)).toBe('barred');
    fake.leftServer.add(BOB);
    expect(await fake.memberAccess(EAST_FORUM, BOB)).toBeUndefined();
    fake.gone.add(WEST_FORUM);
    expect(await fake.memberAccess(WEST_FORUM, ALICE)).toBeUndefined();
    expect(await fake.admitMember(WEST_FORUM, ALICE)).toBe(false);
    expect(await fake.dismissMember(WEST_FORUM, ALICE)).toBe(true);
  });

  it('does not dismiss a member whose overwrite somebody turned into a bar', async () => {
    const fake = gateway();
    fake.shutOut(EAST_FORUM, ALICE);
    await fake.admitMember(EAST_FORUM, ALICE);
    fake.admitted.get(EAST_FORUM)?.delete(ALICE);
    fake.barred.set(EAST_FORUM, new Set([ALICE]));
    expect(await fake.dismissMember(EAST_FORUM, ALICE)).toBe(false);
    expect(await fake.memberAccess(EAST_FORUM, ALICE)).toBe('barred');
  });

  it('fails as told, also when only looking', async () => {
    const fake = gateway();
    fake.failing.set('memberAccess', new Error('no access'));
    fake.failing.set('admitMember', new Error('no permission'));
    await expect(fake.memberAccess(WEST_FORUM, ALICE)).rejects.toThrow('no access');
    await expect(fake.admitMember(WEST_FORUM, ALICE)).rejects.toThrow('no permission');
    expect(fake.canSee(WEST_FORUM, ALICE)).toBe(true);
  });
});

describe('FakePartyGateway: the limits of an embed', () => {
  const POST = '300000000000000001';
  const field = (name: string, value: string) => ({ name, value });

  async function sending(embed: object): Promise<string> {
    const fake = new FakePartyGateway();
    try {
      await fake.sendMessage(POST, { embeds: [embed] });
      return 'sent';
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  it('takes an embed that is exactly as long as Discord allows', async () => {
    expect(await sending({ title: 't'.repeat(256), description: 'd'.repeat(4096) })).toBe('sent');
    expect(
      await sending({
        fields: Array.from({ length: 5 }, () => field('n'.repeat(176), 'v'.repeat(1024))),
      }),
    ).toBe('sent');
    expect(await sending({ fields: Array.from({ length: 25 }, () => field('n', 'v')) })).toBe(
      'sent',
    );
  });

  it('refuses each part that is too long, as Discord does', async () => {
    const refused = /^Invalid Form Body: /;
    expect(await sending({ title: 't'.repeat(257) })).toMatch(refused);
    expect(await sending({ description: 'd'.repeat(4097) })).toMatch(refused);
    expect(await sending({ fields: [field('n'.repeat(257), 'v')] })).toMatch(refused);
    expect(await sending({ fields: [field('n', 'v'.repeat(1025))] })).toMatch(refused);
    expect(await sending({ fields: [field('n', '')] })).toMatch(refused);
    expect(await sending({ fields: [field('', 'v')] })).toMatch(refused);
    expect(await sending({ fields: Array.from({ length: 26 }, () => field('n', 'v')) })).toMatch(
      refused,
    );
  });

  it('refuses an embed of more than 6000 characters in all, and checks edits too', async () => {
    const big = {
      description: 'd'.repeat(4096),
      fields: [field('n', 'v'.repeat(1024)), field('n', 'v'.repeat(879))],
    };
    expect(await sending(big)).toBe(
      'Invalid Form Body: the embeds have at most 6000 characters in all, not 6001',
    );
    const fake = new FakePartyGateway();
    const id = (await fake.sendMessage(POST, { content: 'hello' })) ?? '';
    await expect(
      fake.editMessage(POST, id, { embeds: [{ title: 't'.repeat(257) }] }),
    ).rejects.toThrow('Invalid Form Body');
  });

  it('counts the 6000 over all embeds of a message, with footers and author names', async () => {
    const half = { description: 'd'.repeat(3000) };
    const fake = new FakePartyGateway();
    await expect(fake.sendMessage(POST, { embeds: [half, half] })).resolves.toBeDefined();
    await expect(
      fake.sendMessage(POST, { embeds: [half, { description: 'd'.repeat(3001) }] }),
    ).rejects.toThrow('the embeds have at most 6000 characters in all, not 6001');
    expect(
      await sending({ description: 'd'.repeat(4096), footer: { text: 'f'.repeat(1904) } }),
    ).toBe('sent');
    expect(
      await sending({ description: 'd'.repeat(4096), footer: { text: 'f'.repeat(1905) } }),
    ).toMatch(/not 6001$/);
    expect(
      await sending({ description: 'd'.repeat(4096), author: { name: 'a'.repeat(1905) } }),
    ).toMatch(/not 6001$/);
  });

  it('refuses a field whose name or value is nothing but white space', async () => {
    const refused = /^Invalid Form Body: /;
    expect(await sending({ fields: [field('n', ' \n\t ')] })).toMatch(refused);
    expect(await sending({ fields: [field('  ', 'v')] })).toMatch(refused);
    expect(await sending({ fields: [field(' n ', ' v ')] })).toBe('sent');
  });
});

describe('FakePartyGateway: a channel in which the bot may not post embeds', () => {
  const CHANNEL = '300000000000000002';
  const embed = { title: 'Yveltal' };

  it('keeps a message that is sent or edited there without its embed, as Discord does', async () => {
    const fake = new FakePartyGateway();
    fake.noEmbeds.add(CHANNEL);
    expect(fake.mayPost(CHANNEL)).toBe(false);
    const id = await fake.sendMessage(CHANNEL, { content: 'A raid', embeds: [embed] });
    expect(id).toBeDefined();
    expect(fake.messagesIn(CHANNEL)[0]?.message).toEqual({ content: 'A raid' });
    expect(await fake.editMessage(CHANNEL, id ?? '', { content: 'A train', embeds: [embed] })).toBe(
      true,
    );
    expect(fake.messagesIn(CHANNEL)[0]?.message).toEqual({ content: 'A train' });
    // The embed is still checked: one that Discord refuses is refused there too.
    await expect(
      fake.sendMessage(CHANNEL, { content: 'A raid', embeds: [{ title: 't'.repeat(257) }] }),
    ).rejects.toThrow(/^Invalid Form Body: /);
  });

  it('keeps the embed everywhere else, and there again once the bot may', async () => {
    const fake = new FakePartyGateway();
    fake.noEmbeds.add(CHANNEL);
    await fake.sendMessage('300000000000000003', { content: 'A raid', embeds: [embed] });
    expect(fake.messagesIn('300000000000000003')[0]?.message.embeds).toEqual([embed]);
    const id = await fake.sendMessage(CHANNEL, { content: 'A raid', embeds: [embed] });
    fake.noEmbeds.delete(CHANNEL);
    await fake.editMessage(CHANNEL, id ?? '', { content: 'A raid', embeds: [embed] });
    expect(fake.messagesIn(CHANNEL)[0]?.message.embeds).toEqual([embed]);
  });
});

describe('FakePartyGateway: the channels of a server', () => {
  const OTHER_GUILD = '412345678901234568';

  it('lists the channels a server was given, and the forums of its own server', () => {
    const fake = new FakePartyGateway();
    fake.addForum(WEST_FORUM, [], 'west-meetups');
    fake.addChannel('c1', 'west');
    fake.addChannel('k1', 'North', { kind: 'category' });
    fake.addChannel('c2', 'east', { categoryId: 'k1' });
    fake.addChannel('x1', 'north', { guildId: OTHER_GUILD });
    expect(fake.serverChannels(fake.guildId)).toEqual([
      { id: 'c1', name: 'west', kind: 'text', categoryId: null },
      { id: 'k1', name: 'North', kind: 'category', categoryId: null },
      { id: 'c2', name: 'east', kind: 'text', categoryId: 'k1' },
      { id: WEST_FORUM, name: 'west-meetups', kind: 'forum', categoryId: null },
    ]);
    expect(fake.serverChannels(OTHER_GUILD)).toEqual([
      { id: 'x1', name: 'north', kind: 'text', categoryId: null },
    ]);
    expect(fake.serverChannels('999')).toBeUndefined();
    expect(fake.channelName('c1')).toBe('west');
    // A channel that somebody deleted is no longer listed.
    fake.gone.add('c1');
    expect(fake.serverChannels(fake.guildId)?.map((channel) => channel.id)).not.toContain('c1');
  });

  it('creates categories and text channels, and writes a text channel’s name as Discord does', async () => {
    const fake = new FakePartyGateway();
    const category = await fake.createCategory(fake.guildId, 'North Hills');
    if (!category.ok) throw new Error('no category');
    expect(category.name).toBe('North Hills');
    const channel = await fake.createTextChannel(fake.guildId, 'West End', category.id);
    expect(channel).toEqual({ ok: true, id: expect.any(String) as string, name: 'west-end' });
    expect(fake.serverChannels(fake.guildId)).toEqual([
      { id: category.id, name: 'North Hills', kind: 'category', categoryId: null },
      {
        id: channel.ok ? channel.id : '',
        name: 'west-end',
        kind: 'text',
        categoryId: category.id,
      },
    ]);
    expect(fake.createdChannels).toHaveLength(2);
    expect(fake.calls).toEqual(['createCategory North Hills', 'createTextChannel West End']);
  });

  it('makes a category that continues another with its overwrites, after it, and none when it is gone', async () => {
    const fake = new FakePartyGateway();
    fake.addChannel('k1', 'Town', { kind: 'category' });
    const overwrites = [{ id: fake.guildId, type: 0, allow: '0', deny: '1024' }];
    fake.categoryOverwrites.set('k1', overwrites);
    const made = await fake.createCategory(fake.guildId, 'Town 2', undefined, 'k1');
    if (!made.ok) throw new Error('not made');
    expect(fake.categoryOverwrites.get(made.id)).toEqual(overwrites);
    expect(fake.placedAfter.get(made.id)).toBe('k1');
    fake.gone.add('k1');
    expect(await fake.createCategory(fake.guildId, 'Town 3', undefined, 'k1')).toEqual({
      ok: false,
      reason: 'base-gone',
    });
    expect(await fake.createCategory(fake.guildId, 'Town 4', undefined, 'no-such')).toEqual({
      ok: false,
      reason: 'base-gone',
    });
  });

  it('refuses as Discord does: no permission, a bad name, a full category, a full server', async () => {
    const fake = new FakePartyGateway();
    expect(fake.mayCreateChannels(fake.guildId)).toBe(true);
    fake.noCreating.add(fake.guildId);
    expect(fake.mayCreateChannels(fake.guildId)).toBe(false);
    expect(await fake.createTextChannel(fake.guildId, 'a', null)).toEqual({
      ok: false,
      reason: 'no-permission',
    });
    fake.noCreating.clear();
    expect(await fake.createTextChannel(fake.guildId, '', null)).toEqual({
      ok: false,
      reason: 'bad-name',
    });
    expect(await fake.createCategory(fake.guildId, 'x'.repeat(101))).toEqual({
      ok: false,
      reason: 'bad-name',
    });
    expect((await fake.createCategory(fake.guildId, 'x'.repeat(100))).ok).toBe(true);
    expect(await fake.createTextChannel(fake.guildId, 'a', 'no-such-category')).toEqual({
      ok: false,
      reason: 'no-server',
    });
    expect(await fake.createTextChannel('999', 'a', null)).toEqual({
      ok: false,
      reason: 'no-server',
    });
    fake.addChannel('k1', 'Full', { kind: 'category' });
    for (let i = 0; i < 50; i++) fake.addChannel(`in${i}`, `in-${i}`, { categoryId: 'k1' });
    expect(await fake.createTextChannel(fake.guildId, 'one-more', 'k1')).toEqual({
      ok: false,
      reason: 'category-full',
    });
    // A forum beside a channel of a full category is refused as Discord refuses it.
    fake.addChannel('c1', 'inside', { categoryId: 'k1' });
    const refused: unknown = await fake
      .createForum('c1', 'inside-raids', [])
      .catch((err: unknown) => err);
    expect(channelLimitOf(refused)).toBe('category');
    expect((await fake.createTextChannel(fake.guildId, 'one-more', null)).ok).toBe(true);
    for (let i = 0; i < 500; i++) fake.addChannel(`many${i}`, `many-${i}`);
    expect(await fake.createTextChannel(fake.guildId, 'too-many', null)).toEqual({
      ok: false,
      reason: 'server-full',
    });
    fake.addChannel('c2', 'outside');
    const tooMany: unknown = await fake
      .createForum('c2', 'outside-raids', [])
      .catch((err: unknown) => err);
    expect(channelLimitOf(tooMany)).toBe('server');
  });

  it('says what kind of channel an id is, from what it knows', () => {
    const fake = new FakePartyGateway();
    fake.addForum(WEST_FORUM);
    fake.addChannel('c1', 'west');
    fake.addChannel('k1', 'Town', { kind: 'category' });
    expect(fake.channelKind(WEST_FORUM)).toBe('forum');
    expect(fake.channelKind('c1')).toBe('text');
    expect(fake.channelKind('k1')).toBe('category');
    expect(fake.channelKind('nothing')).toBeUndefined();
    fake.gone.add(WEST_FORUM);
    expect(fake.channelKind(WEST_FORUM)).toBeUndefined();
    // Looking is not a call to Discord.
    expect(fake.calls).toEqual([]);
  });

  it('deletes a forum with its posts, and a channel', async () => {
    const fake = new FakePartyGateway();
    fake.addForum(WEST_FORUM);
    fake.addChannel('c1', 'west');
    const postId = await fake.createPost(WEST_FORUM, {
      title: 'A raid',
      message: { content: 'x' },
      tagIds: [],
    });
    await fake.deleteChannel(WEST_FORUM);
    await fake.deleteChannel('c1');
    await fake.deleteChannel('never-there');
    expect(fake.deletedChannels).toEqual([WEST_FORUM, 'c1']);
    expect(fake.serverChannels(fake.guildId)).toEqual([]);
    expect(await fake.postInfo(postId ?? '')).toBeUndefined();
    expect(await fake.openPosts(WEST_FORUM)).toBeUndefined();
  });
});

describe('FakePartyGateway: the limits of a components-v2 message', () => {
  const POST = '300000000000000001';
  const FORUM = '300000000000000002';
  const text = (content: string) => ({ type: ComponentType.TextDisplay, content });
  const button = (id: string, label = 'Go') => ({
    type: ComponentType.Button,
    style: ButtonStyle.Secondary,
    label,
    custom_id: id,
  });
  const thumbnail = (url: string) => ({ type: ComponentType.Thumbnail, media: { url } });
  const container = (...components: object[]) => ({ type: ComponentType.Container, components });
  const message = (...components: object[]) => ({ v2: true, components }) as V2Message;

  async function sending(sent: OutgoingMessage): Promise<string> {
    const fake = new FakePartyGateway();
    try {
      await fake.sendMessage(POST, sent);
      return 'sent';
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  it('takes a container of text, a section with a button, a thumbnail and a row', async () => {
    expect(
      await sending(
        message(
          container(
            {
              type: ComponentType.Section,
              components: [text('### Title')],
              accessory: thumbnail('https://x.test/a.png'),
            },
            { type: ComponentType.Separator, divider: true, spacing: 1 },
            { type: ComponentType.Section, components: [text('Coming')], accessory: button('a') },
            { type: ComponentType.ActionRow, components: [button('b'), button('c')] },
          ),
        ),
      ),
    ).toBe('sent');
  });

  it('refuses content or embeds beside the flag, even empty ones', async () => {
    const refused = /^Invalid Form Body: a v2 message has no content/;
    expect(await sending({ ...message(text('a')), content: '' } as never)).toMatch(refused);
    expect(await sending({ ...message(text('a')), embeds: [] } as never)).toMatch(refused);
  });

  it('counts every component, nested ones included, up to 40', async () => {
    // A container and 39 text displays are 40; one more is refused.
    const many = (n: number) => Array.from({ length: n }, (_, i) => text(`line ${i}`));
    expect(await sending(message(container(...many(39))))).toBe('sent');
    expect(await sending(message(container(...many(40))))).toBe(
      'Invalid Form Body: a message has at most 40 components, not 41',
    );
    // A section counts itself, its text and its button.
    const sections = Array.from({ length: 14 }, (_, i) => ({
      type: ComponentType.Section,
      components: [text('x')],
      accessory: button(`s${i}`),
    }));
    expect(await sending(message(...sections))).toBe(
      'Invalid Form Body: a message has at most 40 components, not 42',
    );
  });

  it('refuses more than 4000 characters over the text displays, and an empty one', async () => {
    expect(await sending(message(text('a'.repeat(2000)), text('b'.repeat(2000))))).toBe('sent');
    expect(await sending(message(text('a'.repeat(2000)), text('b'.repeat(2001))))).toBe(
      'Invalid Form Body: the text displays have at most 4000 characters, not 4001',
    );
    expect(await sending(message(text(' ')))).toBe('Invalid Form Body: a text display needs text');
  });

  it('refuses a section without its accessory or with too many texts', async () => {
    expect(await sending(message({ type: ComponentType.Section, components: [text('a')] }))).toBe(
      'Invalid Form Body: a section needs a button or a thumbnail beside it',
    );
    expect(
      await sending(
        message({
          type: ComponentType.Section,
          components: [text('a'), text('b'), text('c'), text('d')],
          accessory: button('a'),
        }),
      ),
    ).toBe('Invalid Form Body: a section has 1 to 3 text displays, not 4');
  });

  it('refuses a custom id used twice, a long label, a full row and a nested container', async () => {
    const row = (...buttons: object[]) => ({ type: ComponentType.ActionRow, components: buttons });
    expect(await sending(message(row(button('a'), button('a'))))).toBe(
      'Invalid Form Body: the custom id a is used twice in the message',
    );
    expect(await sending(message(row(button('a', 'l'.repeat(81)))))).toBe(
      'Invalid Form Body: a button label has at most 80 characters',
    );
    expect(
      await sending(message(row(...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => button(id))))),
    ).toBe('Invalid Form Body: a row has 1 to 5 controls, not 6');
    expect(await sending(message(container(container(text('a')))))).toBe(
      'Invalid Form Body: a container cannot be inside another component',
    );
  });

  it('takes a button with a label or an emoji, a custom emoji by its id and name', async () => {
    const row = (...buttons: object[]) => ({ type: ComponentType.ActionRow, components: buttons });
    const bare = { type: ComponentType.Button, style: ButtonStyle.Secondary, custom_id: 'a' };
    const custom = { id: '1400823744760905729', name: 'pinejoin' };
    expect(await sending(message(row({ ...bare, emoji: { name: '🤔' } })))).toBe('sent');
    expect(await sending(message(row({ ...bare, emoji: custom })))).toBe('sent');
    expect(await sending(message(row(bare)))).toBe(
      'Invalid Form Body: a button needs a label or an emoji',
    );
    expect(await sending(message(row({ ...bare, emoji: {} })))).toBe(
      'Invalid Form Body: a button needs a label or an emoji',
    );
    // A custom emoji's text is message text, not an emoji of a button.
    expect(
      await sending(message(row({ ...bare, emoji: { name: '<:pinejoin:1400823744760905729>' } }))),
    ).toBe('Invalid Form Body: an emoji of a button is a name or an id with its name');
    expect(
      await sending(message(row({ ...bare, emoji: { id: 'pinejoin', name: 'pinejoin' } }))),
    ).toBe('Invalid Form Body: an emoji of a button is a name or an id with its name');
    // A name alone is a character: a custom emoji's name without its id is refused.
    for (const name of ['pinejoin', 'A']) {
      expect(await sending(message(row({ ...bare, emoji: { name } })))).toBe(
        'Invalid Form Body: an emoji of a button is a name or an id with its name',
      );
    }
    for (const name of ['⬇️', '✅', '🇦', '🔃', '⏰']) {
      expect(await sending(message(row({ ...bare, emoji: { name } })))).toBe('sent');
    }
  });

  it('refuses a select menu Discord would refuse, and a control outside a row', async () => {
    const row = (...items: object[]) => ({ type: ComponentType.ActionRow, components: items });
    const menu = (custom_id: string, n: number, extra: object = {}) => ({
      type: ComponentType.StringSelect,
      custom_id,
      options: Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: `v${i}` })),
      ...extra,
    });
    const refusal = (what: string) => `Invalid Form Body: a select menu: ${what}`;
    expect(await sending(message(row(menu('m', 25)), row(button('b'))))).toBe('sent');
    expect(await sending(message(row(menu('m', 26))))).toBe(refusal('1 to 25 options, not 26'));
    expect(await sending(message(row(menu('m', 2), button('b'))))).toBe(
      'Invalid Form Body: a row with a select menu holds that menu alone',
    );
    expect(await sending(message(row(menu('a', 2)), row(button('a'))))).toBe(
      'Invalid Form Body: the custom id a is used twice in the message',
    );
    expect(
      await sending(
        message(row(menu('m', 1, { options: [{ label: 'x'.repeat(101), value: 'v' }] }))),
      ),
    ).toBe(refusal("an option's label and value of 1 to 100 characters"));
    expect(
      await sending(
        message(
          row(
            menu('m', 1, {
              options: [
                { label: 'a', value: 'v' },
                { label: 'b', value: 'v' },
              ],
            }),
          ),
        ),
      ),
    ).toBe(refusal('the value v twice'));
    expect(await sending(message(row(menu('m', 2, { max_values: 3 }))))).toBe(
      refusal('min_values 1 and max_values 3 with 2 options'),
    );
    const ticked = menu('m', 2, {
      options: [
        { label: 'a', value: 'a', default: true },
        { label: 'b', value: 'b', default: true },
      ],
    });
    expect(await sending(message(row(ticked)))).toBe(
      refusal('2 options ticked by default, at most 1'),
    );
    // A message's menu may be left empty without saying anything more.
    expect(await sending(message(row(menu('m', 2, { min_values: 0 }))))).toBe('sent');
    expect(await sending(message(menu('m', 2)))).toBe(
      'Invalid Form Body: a select menu stands only in a row',
    );
    expect(await sending(message(button('b')))).toBe(
      'Invalid Form Body: a button stands only in a row or beside a section',
    );
  });

  it('refuses a thumbnail that is not at an https address', async () => {
    const section = {
      type: ComponentType.Section,
      components: [text('a')],
      accessory: thumbnail('http://x.test/a.png'),
    };
    expect(await sending(message(section))).toBe(
      'Invalid Form Body: a thumbnail needs an https address or a file of the message (attachment://<name>)',
    );
  });

  it('takes a gallery of the files the message sends, and refuses one of a file it lacks', async () => {
    const gallery = (...urls: string[]) => ({
      type: ComponentType.MediaGallery,
      items: urls.map((url) => ({ media: { url } })),
    });
    const withFiles = (files: string[], ...components: object[]) =>
      ({ ...message(...components), files }) as V2Message;
    expect(
      await sending(withFiles(['var/images/gyms/1-abc.png'], gallery('attachment://1-abc.png'))),
    ).toBe('sent');
    expect(await sending(message(gallery('https://x.test/a.png')))).toBe('sent');
    expect(await sending(message(gallery('attachment://1-abc.png')))).toBe(
      'Invalid Form Body: a gallery picture names attachment://1-abc.png, which the message does not have',
    );
    expect(await sending(message(gallery()))).toBe(
      'Invalid Form Body: a gallery holds 1 to 10 pictures, not 0',
    );
    const eleven = Array.from({ length: 11 }, (_, i) => `https://x.test/${i}.png`);
    expect(await sending(message(gallery(...eleven)))).toBe(
      'Invalid Form Body: a gallery holds 1 to 10 pictures, not 11',
    );
    const pictured = {
      type: ComponentType.Section,
      components: [text('a')],
      accessory: thumbnail('attachment://shot.png'),
    };
    expect(await sending(withFiles(['held/shot.png'], pictured))).toBe('sent');
    expect(await sending(message(pictured))).toBe(
      'Invalid Form Body: a thumbnail names attachment://shot.png, which the message does not have',
    );
  });

  it('lets an edit make a classic message v2, never back, and checks edits of posts', async () => {
    const fake = new FakePartyGateway();
    fake.addForum(FORUM);
    const post = { title: 'Old', message: { content: 'old' }, tagIds: [] };
    const postId = (await fake.createPost(FORUM, post)) ?? '';
    expect(await fake.editPost(postId, message(text('new')))).toBe(true);
    await expect(fake.editPost(postId, { content: 'back' })).rejects.toThrow(
      'a components-v2 message cannot become classic',
    );
    await expect(fake.editPost(postId, message(text(' ')))).rejects.toThrow('needs text');
    const id = (await fake.sendMessage(POST, { content: 'hello' })) ?? '';
    expect(await fake.editMessage(POST, id, message(text('new')))).toBe(true);
    await expect(fake.editMessage(POST, id, { content: 'back' })).rejects.toThrow(
      'cannot become classic',
    );
  });

  it('records how a classic message became v2: told it was classic, or after a refused edit', async () => {
    const fake = new FakePartyGateway();
    fake.addForum(FORUM);
    const post = { title: 'Old', message: { content: 'old' }, tagIds: [] };
    const known = (await fake.createPost(FORUM, post)) ?? '';
    const unknown = (await fake.createPost(FORUM, post)) ?? '';
    await fake.editPost(known, message(text('new')), { convert: true });
    await fake.editPost(unknown, message(text('new')));
    // A v2 message edited again is no conversion.
    await fake.editPost(known, message(text('newer')), { convert: true });
    const id = (await fake.sendMessage(POST, { content: 'hello' })) ?? '';
    await fake.editMessage(POST, id, message(text('new')), { convert: true });
    expect(fake.converted).toEqual([
      { id: known, direct: true },
      { id: unknown, direct: false },
      { id, direct: true },
    ]);
  });

  it('refuses a v2 first message of a post when told to, and a thumbnail when told to', async () => {
    const fake = new FakePartyGateway();
    fake.addForum(FORUM);
    fake.refuseV2Starter = true;
    await expect(
      fake.createPost(FORUM, { title: 'A', message: message(text('a')), tagIds: [] }),
    ).rejects.toThrow('Invalid Form Body');
    expect(
      await fake.createPost(FORUM, { title: 'A', message: { content: 'a' }, tagIds: [] }),
    ).toBeDefined();
    fake.rejectThumbnails = true;
    const pictured = message({
      type: ComponentType.Section,
      components: [text('a')],
      accessory: thumbnail('https://x.test/a.png'),
    });
    await expect(fake.sendMessage(POST, pictured)).rejects.toThrow('Invalid Form Body');
    // Naming the picture's field, as Discord names what it refuses.
    const refused: unknown = await fake.sendMessage(POST, pictured).catch((err: unknown) => err);
    expect(refusedPart(refused)).toBe('picture');
  });

  it('refuses a button with a custom emoji when told to, as for an emoji that is gone', async () => {
    const fake = new FakePartyGateway();
    const row = (emoji: object) =>
      message({
        type: ComponentType.ActionRow,
        components: [
          { type: ComponentType.Button, style: ButtonStyle.Primary, custom_id: 'a', emoji },
        ],
      });
    fake.rejectCustomEmoji = true;
    await expect(
      fake.sendMessage(POST, row({ id: '1400000000000000001', name: 'pinejoin' })),
    ).rejects.toThrow('Invalid Form Body');
    // As Discord answered for a deleted application emoji: the field and its code.
    const refused: unknown = await fake
      .sendMessage(POST, row({ id: '1400000000000000001', name: 'pinejoin' }))
      .catch((err: unknown) => err);
    expect(refusedPart(refused)).toBe('emoji');
    expect((refused as Error).message).toContain(
      'components[0].components[0].emoji.id[COMPONENT_INVALID_EMOJI]',
    );
    expect(await fake.sendMessage(POST, row({ name: '🏃' }))).toBeDefined();
    // Or only the emoji deleted from the application, by their ids.
    fake.rejectCustomEmoji = false;
    fake.deletedEmojiIds.add('1400000000000000001');
    await expect(
      fake.sendMessage(POST, row({ id: '1400000000000000001', name: 'pinejoin' })),
    ).rejects.toThrow('Invalid Form Body');
    expect(
      await fake.sendMessage(POST, row({ id: '1400000000000000002', name: 'pinehere' })),
    ).toBeDefined();
  });
});

describe('FakePartyGateway: how it refuses', () => {
  const POST = '300000000000000001';
  const FORUM = '300000000000000002';
  const text = (content: string) => ({ type: ComponentType.TextDisplay, content });
  const message = (...components: object[]) => ({ v2: true, components }) as V2Message;
  const container = (...components: object[]) => ({ type: ComponentType.Container, components });

  async function refusal(work: () => Promise<unknown>): Promise<unknown> {
    try {
      await work();
      return undefined;
    } catch (err) {
      return err;
    }
  }

  it('answers as Discord does, Invalid Form Body, for a message, a title or tags it will not take', async () => {
    const fake = new FakePartyGateway();
    fake.addForum(FORUM);
    const refusals = [
      await refusal(() => fake.sendMessage(POST, message(text(' ')))),
      await refusal(() => fake.sendMessage(POST, { content: 'x'.repeat(2001) })),
      await refusal(() => fake.sendMessage(POST, { embeds: [{ title: 't'.repeat(257) }] })),
      await refusal(() =>
        fake.createPost(FORUM, { title: '', message: { content: 'a' }, tagIds: [] }),
      ),
      await refusal(() =>
        fake.createPost(FORUM, { title: 'A', message: { content: 'a' }, tagIds: ['nope'] }),
      ),
    ];
    for (const err of refusals) {
      expect(isRefusedBody(err)).toBe(true);
      expect((err as Error).message).toMatch(/^Invalid Form Body: /);
    }
  });

  it('refuses a v2 message whose text is over the limit a test gave it', async () => {
    const fake = new FakePartyGateway();
    fake.textLimit = 10;
    const err = await refusal(() => fake.sendMessage(POST, message(text('a'.repeat(11)))));
    expect(isRefusedBody(err)).toBe(true);
    expect(await fake.sendMessage(POST, message(text('a'.repeat(10))))).toBeDefined();
  });

  it('refuses a link button with a custom id, another button without one, a stray thumbnail', async () => {
    const fake = new FakePartyGateway();
    const row = (button: object) => ({ type: ComponentType.ActionRow, components: [button] });
    const send = (sent: V2Message) => refusal(() => fake.sendMessage(POST, sent));
    const link = { type: ComponentType.Button, style: ButtonStyle.Link, label: 'Map' };
    expect(await send(message(row({ ...link, url: 'https://x.test' })))).toBeUndefined();
    expect(String(await send(message(row(link))))).toContain('a link button has an address');
    expect(
      String(await send(message(row({ ...link, url: 'https://x.test', custom_id: 'a' })))),
    ).toContain('a link button has an address and no custom id');
    const plain = { type: ComponentType.Button, style: ButtonStyle.Secondary, label: 'Go' };
    expect(String(await send(message(row(plain))))).toContain('a button has a custom id');
    const picture = { type: ComponentType.Thumbnail, media: { url: 'https://x.test/a.png' } };
    expect(String(await send(message(container(picture))))).toContain(
      'a thumbnail stands only beside a section',
    );
  });

  it('refuses an empty container and an accent colour out of range', async () => {
    const fake = new FakePartyGateway();
    const send = (sent: V2Message) => refusal(() => fake.sendMessage(POST, sent));
    expect(String(await send(message(container())))).toContain('a container needs a component');
    expect(
      String(
        await send(
          message({
            type: ComponentType.Container,
            accent_color: 0x1000000,
            components: [text('a')],
          }),
        ),
      ),
    ).toContain('an accent colour is a number from 0 to 0xFFFFFF');
    expect(
      await send(
        message({ type: ComponentType.Container, accent_color: 0xffffff, components: [text('a')] }),
      ),
    ).toBeUndefined();
  });
});

describe('FakePartyGateway: what a test waits for', () => {
  it('counts the edits of each post, for a test to wait for one made in the background', async () => {
    const fake = new FakePartyGateway();
    fake.addForum(WEST_FORUM);
    const post = (title: string) =>
      fake.createPost(WEST_FORUM, { title, message: { content: title }, tagIds: [] });
    const first = (await post('A raid')) ?? '';
    const second = (await post('Another raid')) ?? '';
    const edited = fake.postEdits(first).reached(2);
    void fake.editPost(first, { content: 'once' });
    void fake.editPost(second, { content: 'elsewhere' });
    void fake.editPost(first, { content: 'twice' });
    await edited;
    expect(fake.posts.get(first)?.edits).toBe(2);
    // An edit refused is none.
    fake.gone.add(second);
    await fake.editPost(second, { content: 'gone' });
    expect(fake.postEdits(second).count).toBe(1);
  });
});
