import {
  ChannelType,
  Collection,
  ComponentType,
  DiscordAPIError,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  RESTJSONErrorCodes,
  RateLimitError,
  type Client,
} from 'discord.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FakePartyGateway, type DiscordErrorFields } from '../../test/support/fake-gateway.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { channelPermissions } from '../ops/permissions.js';
import {
  categoryOnlyPermissions,
  channelLimitOf,
  conversionBody,
  DiscordPartyGateway,
  editAs,
  discordPayload,
  hiddenForumOverwrites,
  isGone,
  isHiddenForum,
  isMissingPermission,
  isRefusedBody,
  isRefusedStarter,
  MAX_FORUM_TAGS,
  PostsRefusedError,
  rateLimitWaitMs,
  refusedPart,
  type OutgoingMessage,
} from './party-gateway.js';

function apiError(code: number, status = 404): DiscordAPIError {
  return new DiscordAPIError({ code, message: 'no' }, code, status, 'GET', '/x', {});
}

describe('isGone', () => {
  it('recognises what Discord answers for a deleted channel, message or server', () => {
    expect(isGone(apiError(RESTJSONErrorCodes.UnknownChannel))).toBe(true);
    expect(isGone(apiError(RESTJSONErrorCodes.UnknownMessage))).toBe(true);
    expect(isGone(apiError(RESTJSONErrorCodes.UnknownGuild))).toBe(true);
  });

  it('is false for every other failure', () => {
    expect(isGone(apiError(RESTJSONErrorCodes.MissingPermissions, 403))).toBe(false);
    expect(isGone(apiError(RESTJSONErrorCodes.MissingAccess, 403))).toBe(false);
    expect(isGone(new Error('Unknown Channel'))).toBe(false);
    expect(isGone(undefined)).toBe(false);
  });
});

describe('rateLimitWaitMs', () => {
  const limit = (timeToReset: number, sublimitTimeout: number, retryAfter = 0) =>
    new RateLimitError({
      global: false,
      hash: 'h',
      limit: 2,
      majorParameter: 'x',
      method: 'PATCH',
      retryAfter,
      route: '/channels/:id',
      scope: 'user',
      sublimitTimeout,
      timeToReset,
      url: 'https://discord.com/api/v10/channels/1',
    });

  it('is the largest of the sublimit, the bucket wait and the retry-after', () => {
    expect(rateLimitWaitMs(limit(2_000, 0, 90_000))).toBe(90_000);
    expect(rateLimitWaitMs(limit(2_000, 600_000, 90_000))).toBe(600_000);
  });

  it('is the larger of the sublimit and the bucket wait', () => {
    expect(rateLimitWaitMs(limit(30_000, 0))).toBe(30_000);
    expect(rateLimitWaitMs(limit(2_000, 600_000))).toBe(600_000);
  });

  it('is undefined for any other failure', () => {
    expect(rateLimitWaitMs(new Error('x'))).toBeUndefined();
    expect(rateLimitWaitMs(apiError(RESTJSONErrorCodes.MissingPermissions, 403))).toBeUndefined();
    expect(rateLimitWaitMs(undefined)).toBeUndefined();
  });
});

describe('isMissingPermission', () => {
  it('recognises Missing Permissions and Missing Access', () => {
    expect(isMissingPermission(apiError(RESTJSONErrorCodes.MissingPermissions, 403))).toBe(true);
    expect(isMissingPermission(apiError(RESTJSONErrorCodes.MissingAccess, 403))).toBe(true);
  });

  it('is false for every other failure', () => {
    expect(isMissingPermission(apiError(RESTJSONErrorCodes.UnknownChannel))).toBe(false);
    expect(isMissingPermission(new Error('Missing Permissions'))).toBe(false);
  });
});

describe('isRefusedBody', () => {
  it('recognises Invalid Form Body', () => {
    expect(isRefusedBody(apiError(RESTJSONErrorCodes.InvalidFormBodyOrContentType, 400))).toBe(
      true,
    );
  });

  it('is false for every other failure', () => {
    expect(isRefusedBody(apiError(RESTJSONErrorCodes.MissingPermissions, 403))).toBe(false);
    expect(isRefusedBody(apiError(RESTJSONErrorCodes.UnknownChannel))).toBe(false);
    expect(isRefusedBody(new Error('Invalid Form Body'))).toBe(false);
    expect(isRefusedBody(undefined)).toBe(false);
  });
});

describe('channelLimitOf', () => {
  const refusedFor = (field: string, code: string, message: string) =>
    new DiscordAPIError(
      {
        code: RESTJSONErrorCodes.InvalidFormBodyOrContentType,
        message: 'Invalid Form Body',
        errors: { [field]: { _errors: [{ code, message }] } } as DiscordErrorFields,
      },
      RESTJSONErrorCodes.InvalidFormBodyOrContentType,
      400,
      'POST',
      '/guilds/1/channels',
      {},
    );

  it('tells a full category from a full server', () => {
    expect(
      channelLimitOf(
        refusedFor(
          'parent_id',
          'CHANNEL_PARENT_MAX_CHANNELS',
          'Maximum number of channels in category reached (50)',
        ),
      ),
    ).toBe('category');
    expect(
      channelLimitOf(apiError(RESTJSONErrorCodes.MaximumNumberOfGuildChannelsReached, 400)),
    ).toBe('server');
  });

  it('is nothing for any other refusal', () => {
    expect(
      channelLimitOf(refusedFor('name', 'BASE_TYPE_BAD_LENGTH', 'Must be 1-100 in length.')),
    ).toBeUndefined();
    // Another refusal of the parent (a category that is no category) is no full category.
    expect(
      channelLimitOf(refusedFor('parent_id', 'CHANNEL_PARENT_INVALID_TYPE', 'Not a category')),
    ).toBeUndefined();
    expect(channelLimitOf(apiError(RESTJSONErrorCodes.MissingPermissions, 403))).toBeUndefined();
    expect(channelLimitOf(new Error('parent_id'))).toBeUndefined();
  });
});

describe('refusedPart', () => {
  /** Invalid Form Body as Discord answers it: the fields it refused, by their paths. */
  const refusal = (errors?: object, message = 'Invalid Form Body') =>
    new DiscordAPIError(
      {
        code: RESTJSONErrorCodes.InvalidFormBodyOrContentType,
        message,
        ...(errors === undefined ? {} : { errors: errors as DiscordErrorFields }),
      },
      RESTJSONErrorCodes.InvalidFormBodyOrContentType,
      400,
      'PATCH',
      '/channels/1/messages/2',
      {},
    );
  const field = (code: string, message = 'Invalid') => ({ _errors: [{ code, message }] });

  it('names an emoji Discord refused, as it did for an application emoji that was deleted', () => {
    // Seen on the staging run of 2026-10-17, after `pinedone` was deleted from the application.
    const deleted = refusal({
      components: {
        '0': {
          components: {
            '3': {
              accessory: {
                emoji: { id: field('COMPONENT_INVALID_EMOJI', 'The specified emoji is invalid') },
              },
            },
          },
        },
      },
    });
    expect(deleted.message).toContain('emoji.id[COMPONENT_INVALID_EMOJI]');
    expect(refusedPart(deleted)).toBe('emoji');
    // In a row of buttons, and by its code alone.
    expect(
      refusedPart(
        refusal({ components: { '1': { components: { '0': { emoji: field('ANY') } } } } }),
      ),
    ).toBe('emoji');
    expect(refusedPart(refusal({ components: field('COMPONENT_INVALID_EMOJI') }))).toBe('emoji');
  });

  it('names a picture where the field Discord refused is a media item', () => {
    const thumbnail = refusal({
      components: {
        '0': { components: { '1': { accessory: { media: { url: field('BASE_TYPE_BAD') } } } } },
      },
    });
    expect(refusedPart(thumbnail)).toBe('picture');
    const gallery = refusal({
      components: { '0': { components: { '2': { items: { '0': { media: field('X') } } } } } },
    });
    expect(refusedPart(gallery)).toBe('picture');
  });

  it('names the emoji where Discord refused both', () => {
    const both = refusal({
      components: {
        '0': {
          components: {
            '1': { accessory: { media: { url: field('BASE_TYPE_BAD') } } },
            '3': { accessory: { emoji: { id: field('COMPONENT_INVALID_EMOJI') } } },
          },
        },
      },
    });
    expect(refusedPart(both)).toBe('emoji');
  });

  it('reads the code in the message where the answer has no fields', () => {
    const flattened = refusal(
      undefined,
      'Invalid Form Body\ncomponents[0].components[3].accessory.emoji.id[COMPONENT_INVALID_EMOJI]: Invalid',
    );
    expect(refusedPart(flattened)).toBe('emoji');
  });

  it('names nothing where Discord named another field, none, or did not refuse the body', () => {
    expect(
      refusedPart(refusal({ components: { '0': { content: field('BASE_TYPE_MAX_LENGTH') } } })),
    ).toBeUndefined();
    expect(refusedPart(refusal())).toBeUndefined();
    expect(refusedPart(apiError(RESTJSONErrorCodes.MissingPermissions, 403))).toBeUndefined();
    expect(refusedPart(new Error('emoji.id[COMPONENT_INVALID_EMOJI]'))).toBeUndefined();
  });
});

describe('isRefusedStarter', () => {
  const formBody = apiError(RESTJSONErrorCodes.InvalidFormBodyOrContentType, 400);
  const empty = apiError(RESTJSONErrorCodes.CannotSendAnEmptyMessage, 400);

  it('takes Invalid Form Body as a refusal of the first message, whatever is known', () => {
    expect(isRefusedStarter(formBody, false)).toBe(true);
    expect(isRefusedStarter(formBody, true)).toBe(true);
  });

  it('takes an empty message as one only while direct posts are not known to work', () => {
    // A v2 message whose flag Discord dropped on the way to the post reads as empty.
    expect(isRefusedStarter(empty, false)).toBe(true);
    expect(isRefusedStarter(empty, true)).toBe(false);
  });

  it('takes nothing else as one', () => {
    expect(isRefusedStarter(apiError(RESTJSONErrorCodes.MissingPermissions, 403), false)).toBe(
      false,
    );
    expect(isRefusedStarter(new Error('Invalid Form Body'), false)).toBe(false);
  });
});

describe('FakePartyGateway', () => {
  it('edits a message that is there, and answers false for one that is gone', async () => {
    const gateway = new FakePartyGateway();
    const id = (await gateway.sendMessage('c', { content: 'one' })) ?? '';
    await expect(gateway.editMessage('c', id, { content: 'two' })).resolves.toBe(true);
    expect(gateway.messagesIn('c')).toEqual([
      { id, channelId: 'c', message: { content: 'two' }, attachments: [], edits: 1 },
    ]);
    await expect(gateway.editMessage('c', id, {})).rejects.toThrow(/content or an embed/);
    await expect(gateway.editMessage('other', id, { content: 'x' })).resolves.toBe(false);
    await gateway.deleteMessage('c', id);
    await expect(gateway.editMessage('c', id, { content: 'three' })).resolves.toBe(false);
    const second = (await gateway.sendMessage('c', { content: 'one' })) ?? '';
    gateway.gone.add(second);
    await expect(gateway.editMessage('c', second, { content: 'two' })).resolves.toBe(false);
  });

  it('keeps the files of a message through an edit that names none, and replaces them otherwise', async () => {
    const gateway = new FakePartyGateway();
    const pictured = (files?: string[]): OutgoingMessage => ({
      v2: true,
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.Section,
              components: [{ type: ComponentType.TextDisplay, content: 'An egg' }],
              accessory: { type: ComponentType.Thumbnail, media: { url: 'attachment://egg.png' } },
            },
          ],
        },
      ],
      ...(files === undefined ? {} : { files }),
    });
    const id = (await gateway.sendMessage('c', pictured(['/eggs/egg.png']))) ?? '';
    // Discord keeps the file: the picture may still name it.
    await expect(gateway.editMessage('c', id, pictured())).resolves.toBe(true);
    expect(gateway.messagesIn('c')[0]?.attachments).toEqual(['egg.png']);
    // An edit that names its files (none) takes it away: the picture can no longer name it.
    await expect(gateway.editMessage('c', id, pictured([]))).rejects.toThrow(/does not have/);
    await expect(gateway.editMessage('c', id, pictured(['/eggs/egg.png']))).resolves.toBe(true);
    // Without Attach Files Discord answers Missing Permissions, and the fake counts it.
    gateway.refuseFiles = true;
    await expect(gateway.editMessage('c', id, pictured(['/eggs/egg.png']))).rejects.toMatchObject({
      code: RESTJSONErrorCodes.MissingPermissions,
    });
    await expect(gateway.editMessage('c', id, pictured())).resolves.toBe(true);
    expect(gateway.filesRefused).toBe(1);
  });

  it('opens an archived post again for an edit of a message in it', async () => {
    const gateway = new FakePartyGateway();
    gateway.addForum('f');
    const postId =
      (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ?? '';
    const id = (await gateway.sendMessage(postId, { content: 'copy' })) ?? '';
    await gateway.archivePost(postId);
    await gateway.editMessage(postId, id, { content: 'copy, changed' });
    expect(gateway.posts.get(postId)).toMatchObject({ archived: false, reopened: 1 });
  });

  it('finds a channel of the server by its id, not one of another server', () => {
    const gateway = new FakePartyGateway();
    gateway.channelNames.set('500000000000000001', 'remote-raids');
    gateway.addChannel('500000000000000002', 'remote-raids', { guildId: '412345678901234568' });
    expect(gateway.findChannel('100000000000000001', '500000000000000001')).toBe(
      '500000000000000001',
    );
    expect(gateway.findChannel('100000000000000001', '500000000000000003')).toBeUndefined();
    expect(gateway.findChannel('100000000000000001', '500000000000000002')).toBeUndefined();
    gateway.gone.add('500000000000000001');
    expect(gateway.findChannel('100000000000000001', '500000000000000001')).toBeUndefined();
  });

  it('says who sees a forum of overwrites from the everyone role’s permissions as its shares do (8H5-3)', async () => {
    const gateway = new FakePartyGateway();
    gateway.addForum('forum');
    const view = String(PermissionFlagsBits.ViewChannel);
    gateway.forumOverwrites.set('forum', [
      { id: 'mods', type: OverwriteType.Role, allow: view, deny: '0' },
    ]);
    gateway.memberRoles.set('ash', []);
    gateway.memberRoles.set('brock', ['admins']);
    gateway.serverRoles.set('admins', {
      name: 'Admin',
      permissions: PermissionFlagsBits.Administrator,
    });
    // Discord's default everyone role sees the forum, as `shareKeeps` takes it.
    expect(gateway.canSee('forum', 'ash')).toBe(true);
    expect([...((await gateway.shareKeeps('forum', ['forum'])) ?? [])]).toEqual(['forum']);
    // A gated server: the everyone role sees nothing, an administrator everything.
    gateway.serverRoles.set(gateway.guildId, { name: '@everyone', permissions: 0n });
    expect(gateway.canSee('forum', 'ash')).toBe(false);
    expect(await gateway.memberAccess('forum', 'ash')).toBe('hidden');
    expect(gateway.canSee('forum', 'brock')).toBe(true);
  });

  it('judges a share as the real gateway does, fetching the members a channel names (plan 8H-5, R2)', async () => {
    const gateway = new FakePartyGateway();
    gateway.addForum('forum');
    gateway.addChannel('room', 'room');
    const view = String(PermissionFlagsBits.ViewChannel);
    gateway.forumOverwrites.set('room', [
      { id: gateway.guildId, type: OverwriteType.Role, allow: '0', deny: view },
      { id: 'brock', type: OverwriteType.Member, allow: view, deny: '0' },
    ]);
    gateway.forumOverwrites.set('forum', [
      { id: 'muted', type: OverwriteType.Role, allow: '0', deny: view },
    ]);
    // Brock is not in the cache and cannot be fetched: the forum is not kept.
    expect([...((await gateway.shareKeeps('room', ['forum'])) ?? [])]).toEqual([]);
    gateway.fetchableMembers.set('brock', []);
    expect([...((await gateway.shareKeeps('room', ['forum'])) ?? [])]).toEqual(['forum']);
    gateway.fetchableMembers.set('brock', ['muted']);
    expect([...((await gateway.shareKeeps('room', ['forum'])) ?? [])]).toEqual([]);
    expect(gateway.memberFetches).toEqual(['brock', 'brock', 'brock']);
    // Shared into the forum itself: the same audience.
    expect([...((await gateway.shareKeeps('forum', ['forum'])) ?? [])]).toEqual(['forum']);
    expect(await gateway.shareKeeps('nowhere', ['forum'])).toBeUndefined();
  });

  it('says where the bot may post embeds: everywhere but in the channels a test names', () => {
    const gateway = new FakePartyGateway();
    expect(gateway.mayPost('500000000000000001')).toBe(true);
    gateway.noEmbeds.add('500000000000000001');
    expect(gateway.mayPost('500000000000000001')).toBe(false);
    expect(gateway.mayPost('500000000000000002')).toBe(true);
  });

  it('creates a forum with tags, posts in it, and keeps what was done to a post', async () => {
    const gateway = new FakePartyGateway();
    const forum = await gateway.createForum('100000000000000001', 'west-raids', ['Egg', 'T5']);
    expect(Object.keys(forum?.tags ?? {})).toEqual(['Egg', 'T5']);
    const forumId = forum?.forumId ?? '';
    const postId = await gateway.createPost(forumId, {
      title: 'T5 egg · The Stacks',
      message: { content: 'one' },
      tagIds: [forum?.tags.Egg ?? ''],
    });
    expect(postId).toBeDefined();
    await expect(gateway.editPost(postId ?? '', { content: 'two' })).resolves.toBe(true);
    await expect(gateway.renamePost(postId ?? '', 'Yveltal · The Stacks')).resolves.toBe('renamed');
    await expect(gateway.pinPost(postId ?? '')).resolves.toBe(true);
    expect(gateway.postsIn(forumId)).toEqual([
      expect.objectContaining({
        title: 'Yveltal · The Stacks',
        message: { content: 'two' },
        pinned: true,
        edits: 1,
        renames: 1,
      }),
    ]);
  });

  // Final review, G2: the fake keeps Discord's limit as the gateway does.
  it('adds only the tags that fit under the limit of a forum', async () => {
    const gateway = new FakePartyGateway();
    const own = Array.from({ length: 17 }, (_, n) => `Own ${String(n)}`);
    gateway.addForum('f', own);
    const after = await gateway.ensureTags('f', ['Egg', 'Hatched', 'Ended', 'T5']);
    expect(Object.keys(after ?? {})).toEqual([...own, 'Egg', 'Hatched', 'Ended']);
    expect(Object.keys(after ?? {})).toHaveLength(MAX_FORUM_TAGS);
  });

  it('adds only the tags a forum lacks', async () => {
    const gateway = new FakePartyGateway();
    const before = gateway.addForum('f', ['Egg']);
    const after = await gateway.ensureTags('f', ['Egg', 'Hatched']);
    expect(after?.Egg).toBe(before.Egg);
    expect(Object.keys(after ?? {})).toEqual(['Egg', 'Hatched']);
  });

  it('answers as Discord does for what is gone, and rejects where a test says so', async () => {
    const gateway = new FakePartyGateway();
    gateway.addForum('f');
    const postId =
      (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ?? '';
    gateway.gone.add(postId);
    await expect(gateway.editPost(postId, { content: 'y' })).resolves.toBe(false);
    await expect(
      gateway.createPost('nowhere', { title: 't', message: { content: 'x' }, tagIds: [] }),
    ).resolves.toBeUndefined();
    gateway.gone.add('c');
    await expect(gateway.sendMessage('c', { content: 'x' })).resolves.toBeUndefined();
    gateway.failing.set('sendMessage', new Error('Missing Permissions'));
    await expect(gateway.sendMessage('d', { content: 'x' })).rejects.toThrow('Missing Permissions');
  });

  it('remembers messages until they are deleted', async () => {
    const gateway = new FakePartyGateway();
    const id = (await gateway.sendMessage('c', { content: 'x' })) ?? '';
    expect(gateway.messagesIn('c')).toHaveLength(1);
    await gateway.deleteMessage('c', id);
    expect(gateway.messagesIn('c')).toEqual([]);
    expect(gateway.calls).toEqual(['sendMessage c', `deleteMessage ${id}`]);
  });

  it('deletes a post, and a post that is gone is fine', async () => {
    const gateway = new FakePartyGateway();
    gateway.addForum('f');
    const postId =
      (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ?? '';
    await gateway.deletePost(postId);
    expect(gateway.postsIn('f')).toEqual([]);
    expect(gateway.deletedPosts).toEqual([postId]);
    await expect(gateway.deletePost(postId)).resolves.toBeUndefined();
  });

  it('answers later for a rename it was told to refuse for a while', async () => {
    const gateway = new FakePartyGateway();
    gateway.addForum('f');
    const postId =
      (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ?? '';
    gateway.renameLater.set(postId, 90_000);
    await expect(gateway.renamePost(postId, 'new')).resolves.toEqual({ laterMs: 90_000 });
    expect(gateway.posts.get(postId)?.title).toBe('t');
    expect(gateway.posts.get(postId)?.renames).toBe(0);
  });

  describe('as strict as Discord', () => {
    function forumWithTags(tagCount: number) {
      const gateway = new FakePartyGateway();
      const names = Array.from({ length: tagCount }, (_, i) => `T${i}`);
      const tags = gateway.addForum('f', names);
      return { gateway, tags, ids: Object.values(tags) };
    }

    it('refuses a message with neither content nor an embed', async () => {
      const { gateway } = forumWithTags(0);
      await expect(
        gateway.createPost('f', { title: 't', message: {}, tagIds: [] }),
      ).rejects.toThrow();
      await expect(gateway.sendMessage('c', {})).rejects.toThrow();
      await expect(gateway.sendMessage('c', { embeds: [{ title: 'x' }] })).resolves.toBeDefined();
    });

    it('refuses an empty title or one over 100 characters', async () => {
      const { gateway } = forumWithTags(0);
      const message = { content: 'x' };
      await expect(gateway.createPost('f', { title: '', message, tagIds: [] })).rejects.toThrow();
      await expect(
        gateway.createPost('f', { title: 'a'.repeat(101), message, tagIds: [] }),
      ).rejects.toThrow();
      const id =
        (await gateway.createPost('f', { title: 'a'.repeat(100), message, tagIds: [] })) ?? '';
      await expect(gateway.renamePost(id, '')).rejects.toThrow();
      await expect(gateway.renamePost(id, 'a'.repeat(101))).rejects.toThrow();
    });

    it('refuses more than five tags and tags the forum does not have', async () => {
      const { gateway, ids } = forumWithTags(6);
      const message = { content: 'x' };
      await expect(gateway.createPost('f', { title: 't', message, tagIds: ids })).rejects.toThrow();
      await expect(
        gateway.createPost('f', { title: 't', message, tagIds: ['nope'] }),
      ).rejects.toThrow();
      const id =
        (await gateway.createPost('f', { title: 't', message, tagIds: ids.slice(0, 5) })) ?? '';
      await expect(gateway.setPostTags(id, ids)).rejects.toThrow();
      await expect(gateway.setPostTags(id, ['nope'])).rejects.toThrow();
      await expect(gateway.setPostTags(id, ids.slice(1, 3))).resolves.toBe(true);
    });

    it('allows one pinned post in a forum', async () => {
      const { gateway } = forumWithTags(0);
      const message = { content: 'x' };
      const a = (await gateway.createPost('f', { title: 'a', message, tagIds: [] })) ?? '';
      const b = (await gateway.createPost('f', { title: 'b', message, tagIds: [] })) ?? '';
      await expect(gateway.pinPost(a)).resolves.toBe(true);
      await expect(gateway.pinPost(b)).rejects.toThrow();
    });

    it('does not send a message into a forum', async () => {
      const { gateway } = forumWithTags(0);
      await expect(gateway.sendMessage('f', { content: 'x' })).resolves.toBeUndefined();
    });

    it('refuses a message in an archived, locked post unless it is to be opened (review R3)', async () => {
      const gateway = new FakePartyGateway();
      gateway.addForum('f');
      const postId =
        (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ??
        '';
      await gateway.archivePost(postId);
      await expect(gateway.sendMessage(postId, { content: 'late' })).rejects.toMatchObject({
        code: RESTJSONErrorCodes.InvalidActionOnArchivedThread,
      });
      await expect(
        gateway.sendMessage(postId, { content: 'late' }, { reopen: true }),
      ).resolves.toBeDefined();
      expect(gateway.posts.get(postId)).toMatchObject({ archived: false, reopened: 1 });
    });

    it('refuses a bulk delete in an archived post unless it is to be opened (review W3)', async () => {
      const gateway = new FakePartyGateway();
      gateway.addForum('f');
      const postId =
        (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ??
        '';
      const ids = [gateway.write(postId, 'm'), gateway.write(postId, 'm')];
      await gateway.archivePost(postId);
      await expect(gateway.bulkDelete(postId, ids)).rejects.toMatchObject({
        code: RESTJSONErrorCodes.InvalidActionOnArchivedThread,
      });
      expect(gateway.bulkDeleted).toEqual([]);
      await expect(gateway.bulkDelete(postId, ids, { reopen: true })).resolves.toBe('deleted');
      expect(gateway.posts.get(postId)).toMatchObject({ archived: false });
    });

    it('archives a post again after a reported message’s deletion unless asked to leave it open (review W3)', async () => {
      const gateway = new FakePartyGateway();
      gateway.addForum('f');
      const postId =
        (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ??
        '';
      const first = gateway.write(postId, 'm');
      const second = gateway.write(postId, 'm');
      await gateway.archivePost(postId);
      await expect(gateway.deleteReported(postId, first)).resolves.toBe('deleted');
      expect(gateway.posts.get(postId)).toMatchObject({ archived: true });
      await expect(gateway.deleteReported(postId, second, { leaveOpen: true })).resolves.toBe(
        'deleted',
      );
      expect(gateway.posts.get(postId)).toMatchObject({ archived: false });
    });
  });
});

describe('hiddenForumOverwrites', () => {
  const EVERYONE = '300000000000000001';
  const BOT = '300000000000000002';
  const BOT_ROLE = '300000000000000003';
  const MODS = '300000000000000004';
  const P = PermissionFlagsBits;
  const bot = { id: BOT, roleIds: [BOT_ROLE] };
  const roleBase = P.ViewChannel | P.SendMessages;
  const roles = [
    { id: EVERYONE, name: '@everyone', permissions: P.ViewChannel },
    { id: BOT_ROLE, name: 'Pine', permissions: roleBase },
    { id: MODS, name: ' moderator ', permissions: 0n },
  ];
  // The category gives the bot what its role lacks: a forum made in it, or hidden, must too.
  const category = [
    {
      id: BOT,
      type: OverwriteType.Member,
      allow: String(P.ManageThreads | P.ManageRoles | P.EmbedLinks | P.AttachFiles),
      deny: '0',
    },
  ];
  const inCategory = channelPermissions(roleBase, EVERYONE, bot, category);

  it('keeps for the bot what it had in the forum only through its category', () => {
    const set = hiddenForumOverwrites(
      { everyoneId: EVERYONE, botId: BOT, botHas: inCategory, roles },
      { roleNames: [], memberIds: [] },
    );
    const api = set.map((one) => ({ ...one, allow: String(one.allow), deny: String(one.deny) }));
    const has = channelPermissions(roleBase, EVERYONE, bot, api);
    for (const flag of [P.ViewChannel, P.SendMessages, P.ManageThreads]) {
      expect(has & flag).toBe(flag);
    }
    expect(has & (P.EmbedLinks | P.AttachFiles)).toBe(P.EmbedLinks | P.AttachFiles);
    // Never more than it had: Discord refuses an overwrite that allows what the bot lacks.
    expect(has & P.ManageChannels).toBe(0n);
  });

  it('never puts Manage Roles in the bot overwrite, which only an administrator may set', () => {
    const set = hiddenForumOverwrites(
      { everyoneId: EVERYONE, botId: BOT, botHas: inCategory | P.ManageRoles, roles },
      { roleNames: [], memberIds: [] },
    );
    const own = set.find((one) => one.id === BOT);
    expect(own).toBeDefined();
    expect((own?.allow ?? 0n) & P.ManageRoles).toBe(0n);
  });
});

describe('categoryOnlyPermissions', () => {
  const P = PermissionFlagsBits;
  const server = P.ViewChannel | P.SendMessages | P.ManageChannels;

  it('names what only the category gives the bot', () => {
    expect(categoryOnlyPermissions(server, server | P.UseExternalEmojis)).toEqual([
      'Use External Emojis',
    ]);
  });

  it('names nothing for Manage Roles, which the bot overwrite never carries', () => {
    expect(categoryOnlyPermissions(server, server | P.ManageRoles)).toEqual([]);
  });
});

describe('isHiddenForum', () => {
  const EVERYONE = '300000000000000001';
  const BOT = '300000000000000002';
  const MODS = '300000000000000004';
  const ADMINS = '300000000000000005';
  const VALOR = '300000000000000006';
  const ALICE = '200000000000000001';
  const BOB = '200000000000000002';
  const P = PermissionFlagsBits;
  const server = {
    everyoneId: EVERYONE,
    botId: BOT,
    roles: [
      { id: EVERYONE, name: '@everyone', permissions: P.ViewChannel },
      { id: MODS, name: 'Moderator', permissions: 0n },
      { id: ADMINS, name: 'Admins', permissions: P.Administrator },
      { id: VALOR, name: 'Valor', permissions: 0n },
    ],
  };
  const access = { roleNames: [' moderator '], memberIds: [ALICE] };
  const hiddenSet = hiddenForumOverwrites({ ...server, botHas: P.ViewChannel }, access);
  const allows = (id: string, type: OverwriteType) => ({
    id,
    type,
    allow: P.ViewChannel,
    deny: 0n,
  });

  it('takes a forum as hidden when only the bot, staff and the allowlist may see it', () => {
    expect(isHiddenForum(hiddenSet, server, access)).toBe(true);
    // A role that may manage the server is staff by the same rule.
    expect(isHiddenForum([...hiddenSet, allows(ADMINS, OverwriteType.Role)], server, access)).toBe(
      true,
    );
  });

  it('does not when anybody else is let in, or everyone is not shut out', () => {
    expect(isHiddenForum([...hiddenSet, allows(VALOR, OverwriteType.Role)], server, access)).toBe(
      false,
    );
    expect(isHiddenForum([...hiddenSet, allows(BOB, OverwriteType.Member)], server, access)).toBe(
      false,
    );
    expect(
      isHiddenForum(
        hiddenSet.filter((one) => one.id !== EVERYONE),
        server,
        access,
      ),
    ).toBe(false);
    expect(isHiddenForum([], server, access)).toBe(false);
  });

  it("accepts the bot's own managed role, as an operator hiding the forum by hand lets it in", () => {
    const PINE_ROLE = '300000000000000007';
    const OTHER_BOT_ROLE = '300000000000000008';
    const withBots = {
      ...server,
      roles: [
        ...server.roles,
        { id: PINE_ROLE, name: 'Professor Pine', permissions: 0n, managedFor: BOT },
        { id: OTHER_BOT_ROLE, name: 'Other', permissions: 0n, managedFor: '300000000000000099' },
      ],
    };
    const byHand = [
      ...hiddenSet.filter((one) => one.id !== BOT),
      allows(PINE_ROLE, OverwriteType.Role),
    ];
    expect(isHiddenForum(byHand, withBots, access)).toBe(true);
    expect(
      isHiddenForum([...byHand, allows(OTHER_BOT_ROLE, OverwriteType.Role)], withBots, access),
    ).toBe(false);
  });

  it('does not when everyone is an administrator by their server permissions', () => {
    const open = {
      ...server,
      roles: server.roles.map((role) =>
        role.id === EVERYONE ? { ...role, permissions: P.Administrator } : role,
      ),
    };
    expect(isHiddenForum(hiddenSet, open, access)).toBe(false);
  });
});

describe('discordPayload and editAs', () => {
  const v2: OutgoingMessage = {
    v2: true,
    components: [{ type: ComponentType.TextDisplay, content: 'hello' }],
  };

  it('send a classic message with its content, embeds and rows, pinging nobody unnamed', () => {
    const classic: OutgoingMessage = { content: 'hi', mention: { users: ['1'] } };
    const payload = {
      content: 'hi',
      embeds: [],
      components: [],
      allowedMentions: { parse: [], users: ['1'], roles: [] },
    };
    expect(discordPayload(classic)).toEqual(payload);
  });

  it('send a components-v2 message with its flag and without content or embeds', () => {
    const payload = discordPayload(v2);
    expect(payload).toEqual({
      components: v2.components,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [], users: [], roles: [] },
    });
    expect(payload).not.toHaveProperty('content');
    expect(payload).not.toHaveProperty('embeds');
  });

  /** Discord as far as an edit goes: a classic message takes a v2 edit only with its content and embeds cleared. */
  function discord(
    classic: boolean,
    code: RESTJSONErrorCodes = RESTJSONErrorCodes.InvalidFormBodyOrContentType,
  ) {
    const edits: object[] = [];
    const conversions: object[] = [];
    const uploads: unknown[] = [];
    return {
      edits,
      conversions,
      uploads,
      edit: (payload: object) => {
        edits.push(payload);
        if (classic && 'flags' in payload) return Promise.reject(apiError(code, 400));
        return Promise.resolve();
      },
      convert: (body: object, files: unknown) => {
        conversions.push(body);
        uploads.push(files);
        return Promise.resolve();
      },
    };
  }

  /** A folder with an egg's file in it, as the bot carries one. */
  const EGG_BYTES = Buffer.from('a picture of an egg');
  let folder = '';
  beforeAll(() => {
    folder = mkdtempSync(path.join(tmpdir(), 'eggs-'));
    writeFileSync(path.join(folder, 'raid_egg_2_icon.png'), EGG_BYTES);
  });

  it('edits a v2 message with its flag and components only, nothing cleared', async () => {
    const target = discord(false);
    await editAs(v2, target.edit, target.convert);
    expect(target.edits).toEqual([discordPayload(v2)]);
    expect(target.edits[0]).not.toHaveProperty('content');
    expect(target.edits[0]).not.toHaveProperty('embeds');
    expect(target.conversions).toEqual([]);
  });

  it('converts a classic message once Discord refuses the edit, clearing content and embeds', async () => {
    const target = discord(true);
    await editAs(v2, target.edit, target.convert);
    expect(target.edits).toHaveLength(1);
    expect(target.conversions).toEqual([
      {
        content: null,
        embeds: [],
        components: v2.components,
        flags: MessageFlags.IsComponentsV2,
        allowed_mentions: { parse: [], users: [], roles: [] },
      },
    ]);
    expect(conversionBody(v2)).toEqual(target.conversions[0]);
  });

  it('converts a classic message also when Discord reads the v2 edit as an empty message', async () => {
    const target = discord(true, RESTJSONErrorCodes.CannotSendAnEmptyMessage);
    const codes: unknown[] = [];
    await editAs(v2, target.edit, target.convert, {
      refused: (code) => {
        codes.push(code);
      },
    });
    expect(target.conversions).toEqual([conversionBody(v2)]);
    expect(codes).toEqual([RESTJSONErrorCodes.CannotSendAnEmptyMessage]);
  });

  it('says with what code Discord refused the edit it converts after', async () => {
    const target = discord(true);
    const codes: unknown[] = [];
    await editAs(v2, target.edit, target.convert, {
      refused: (code) => {
        codes.push(code);
      },
    });
    expect(codes).toEqual([RESTJSONErrorCodes.InvalidFormBodyOrContentType]);
    expect(target.conversions).toHaveLength(1);
  });

  it('converts at once a message its caller knows to be classic, without a doomed edit', async () => {
    const target = discord(true);
    await editAs(v2, target.edit, target.convert, { convert: true });
    expect(target.edits).toEqual([]);
    expect(target.conversions).toEqual([conversionBody(v2)]);
    // A classic message is edited as it is, whatever the caller said.
    await editAs({ content: 'hi' }, target.edit, target.convert, { convert: true });
    expect(target.edits).toHaveLength(1);
    expect(target.conversions).toHaveLength(1);
  });

  it('replaces the files of a message whose edit says which it has, and keeps them otherwise', async () => {
    const target = discord(false);
    const egg = path.join(folder, 'raid_egg_2_icon.png');
    // The files the message has (none too) are all it keeps: `attachments` names none of the old.
    await editAs({ ...v2, files: [egg] }, target.edit, target.convert);
    await editAs({ ...v2, files: [] }, target.edit, target.convert);
    expect(target.edits).toEqual([
      { ...discordPayload(v2), files: [egg], attachments: [] },
      { ...discordPayload(v2), files: [], attachments: [] },
    ]);
    // A message that says nothing of files keeps those it has.
    await editAs(v2, target.edit, target.convert);
    expect(target.edits[2]).not.toHaveProperty('attachments');
  });

  it('converts a classic message with the files it carries, read for the API', async () => {
    const target = discord(true);
    const egg = path.join(folder, 'raid_egg_2_icon.png');
    await editAs({ ...v2, files: [egg] }, target.edit, target.convert);
    expect(target.conversions).toEqual([
      {
        ...conversionBody(v2),
        attachments: [{ id: 0, filename: 'raid_egg_2_icon.png' }],
      },
    ]);
    expect(target.uploads).toEqual([[{ name: 'raid_egg_2_icon.png', data: EGG_BYTES }]]);
    // None: the old ones go.
    await editAs({ ...v2, files: [] }, target.edit, target.convert, { convert: true });
    expect(target.conversions[1]).toEqual({ ...conversionBody(v2), attachments: [] });
    expect(target.uploads[1]).toEqual([]);
  });

  it('edits a classic message as it is, and passes on any other failure', async () => {
    const target = discord(true);
    await editAs({ content: 'hi' }, target.edit, target.convert);
    expect(target.conversions).toEqual([]);
    const gone = apiError(RESTJSONErrorCodes.UnknownMessage);
    await expect(editAs(v2, () => Promise.reject(gone), target.convert)).rejects.toBe(gone);
    expect(target.conversions).toEqual([]);
  });
});

describe('DiscordPartyGateway: edits of v2 messages', () => {
  /**
   * Discord as far as a channel's messages go: a message sent without the flag is classic and
   * refuses a v2 edit until it is converted; `refuseV2` makes the next v2 edit of any message
   * refused for what it holds (a picture Discord will not take, say).
   */
  function stubDiscord() {
    const classic = new Set<string>();
    const edits: string[] = [];
    const conversions: string[] = [];
    let next = 1;
    const state = { refuseV2: false };
    const refused = () => apiError(RESTJSONErrorCodes.InvalidFormBodyOrContentType, 400);
    const channel = {
      isTextBased: () => true,
      isThread: () => false,
      isSendable: () => true,
      send: (payload: object) => {
        const id = String(next++);
        if (!('flags' in payload)) classic.add(id);
        return Promise.resolve({ id });
      },
      messages: {
        edit: (id: string, payload: object) => {
          edits.push(id);
          if ('flags' in payload && (classic.has(id) || state.refuseV2)) {
            state.refuseV2 = false;
            return Promise.reject(refused());
          }
          return Promise.resolve();
        },
      },
    };
    const client = {
      channels: { fetch: () => Promise.resolve(channel) },
      rest: {
        patch: (route: string) => {
          const id = route.split('/').at(-1) ?? '';
          conversions.push(id);
          classic.delete(id);
          return Promise.resolve();
        },
      },
    };
    const { log, entries } = createTestLogger();
    const gateway = new DiscordPartyGateway(log);
    gateway.use(client as unknown as Client);
    return { gateway, state, edits, conversions, entries };
  }

  const v2: OutgoingMessage = {
    v2: true,
    components: [{ type: ComponentType.TextDisplay, content: 'hello' }],
  };

  it('converts a classic message Discord refuses a v2 edit of, and says it tries a conversion', async () => {
    const discord = stubDiscord();
    const id = (await discord.gateway.sendMessage('c', { content: 'old' })) ?? '';
    await expect(discord.gateway.editMessage('c', id, v2)).resolves.toBe(true);
    expect(discord.conversions).toEqual([id]);
    const said = discord.entries.map((entry) => entry.msg);
    expect(said).toEqual([
      'Discord refused a components-v2 edit of a message not known to be v2; trying it as a conversion',
    ]);
  });

  it('passes on a refusal of a message it sent as v2: no conversion is tried', async () => {
    const discord = stubDiscord();
    const id = (await discord.gateway.sendMessage('c', v2)) ?? '';
    discord.state.refuseV2 = true;
    await expect(discord.gateway.editMessage('c', id, v2)).rejects.toThrow();
    expect(discord.conversions).toEqual([]);
    expect(discord.entries).toEqual([]);
  });

  it('remembers a message it edited or converted into v2, and passes on a refusal from then on', async () => {
    const discord = stubDiscord();
    const id = (await discord.gateway.sendMessage('c', { content: 'old' })) ?? '';
    await discord.gateway.editMessage('c', id, v2);
    discord.state.refuseV2 = true;
    await expect(discord.gateway.editMessage('c', id, v2)).rejects.toThrow();
    expect(discord.conversions).toEqual([id]);
    // A message not sent through this gateway, edited into v2 as it is, is known as well.
    await discord.gateway.editMessage('c', '99', v2);
    discord.state.refuseV2 = true;
    await expect(discord.gateway.editMessage('c', '99', v2)).rejects.toThrow();
    expect(discord.conversions).toEqual([id]);
  });
});

describe('DiscordPartyGateway: what the audit log says of letting a member into a forum', () => {
  const ALICE = '300000000000000001';

  it('names what the member signed up for in words staff know', async () => {
    const reasons: string[] = [];
    const overwrites = new Collection<string, unknown>();
    const forum = {
      type: ChannelType.GuildForum,
      guild: {
        id: 'guild',
        members: { fetch: () => Promise.resolve({ roles: { cache: new Collection() } }) },
      },
      permissionOverwrites: {
        cache: overwrites,
        create: (id: string, allow: unknown, options: { reason: string }) => {
          reasons.push(options.reason);
          overwrites.set(id, {
            type: OverwriteType.Member,
            deny: new PermissionsBitField(),
            allow: new PermissionsBitField(PermissionFlagsBits.ViewChannel),
          });
          return Promise.resolve();
        },
        delete: (_id: string, reason: string) => {
          reasons.push(reason);
          return Promise.resolve();
        },
      },
    };
    const gateway = new DiscordPartyGateway();
    gateway.use({ channels: { fetch: () => Promise.resolve(forum) } } as unknown as Client);
    await expect(gateway.admitMember('forum', ALICE)).resolves.toBe(true);
    await expect(gateway.dismissMember('forum', ALICE)).resolves.toBe(true);
    expect(reasons).toEqual([
      'Signed up for a raid, max battle, train or meetup in this forum',
      'Their raid, max battle, train or meetup in this forum is over, or they left it',
    ]);
  });
});

describe('DiscordPartyGateway: a reported message deleted', () => {
  function gatewayOver(fetch: () => Promise<unknown>, log?: ReturnType<typeof createTestLogger>) {
    const gateway = new DiscordPartyGateway(log?.log);
    gateway.use({ channels: { fetch } } as unknown as Client);
    return gateway;
  }
  /**
   * A post (a thread) with one message, locked when archived unless said otherwise; `managing`
   * false where the bot lacks Manage Threads, `rearchive` a refusal of archiving it again.
   */
  function post(
    archived: boolean,
    locked = archived,
    refusal?: RESTJSONErrorCodes,
    { managing = true, rearchive }: { managing?: boolean; rearchive?: RESTJSONErrorCodes } = {},
  ) {
    const calls: string[] = [];
    const me = { id: 'bot' };
    const thread = {
      archived,
      locked,
      guild: { members: { me } },
      isTextBased: () => true,
      isThread: () => true,
      permissionsFor: (member: unknown) =>
        member === me
          ? new PermissionsBitField(
              PermissionFlagsBits.ManageMessages |
                (managing ? PermissionFlagsBits.ManageThreads : 0n),
            )
          : null,
      setArchived: (value: boolean) => {
        calls.push(`archived ${String(value)}`);
        thread.archived = value;
        return Promise.resolve(thread);
      },
      edit: (options: { archived?: boolean; locked?: boolean }) => {
        if (rearchive !== undefined) return Promise.reject(apiError(rearchive, 403));
        calls.push(`edit ${JSON.stringify(options)}`);
        return Promise.resolve(thread);
      },
      messages: {
        delete: () => {
          if (thread.archived)
            return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
          if (refusal !== undefined) return Promise.reject(apiError(refusal));
          calls.push('delete');
          return Promise.resolve();
        },
      },
    };
    return { thread, calls };
  }

  it('opens an archived post for the deletion and archives and locks it again', async () => {
    const { thread, calls } = post(true);
    const gateway = gatewayOver(() => Promise.resolve(thread));
    await expect(gateway.deleteReported('p', 'm')).resolves.toBe('deleted');
    expect(calls).toEqual(['archived false', 'delete', 'edit {"locked":true,"archived":true}']);
  });

  it('archives a post again as it was, unlocked, and also where Discord refuses the deletion', async () => {
    const unlocked = post(true, false);
    await expect(
      gatewayOver(() => Promise.resolve(unlocked.thread)).deleteReported('p', 'm'),
    ).resolves.toBe('deleted');
    expect(unlocked.calls).toEqual([
      'archived false',
      'delete',
      'edit {"locked":false,"archived":true}',
    ]);
    const refused = post(true, true, RESTJSONErrorCodes.MissingPermissions);
    await expect(
      gatewayOver(() => Promise.resolve(refused.thread)).deleteReported('p', 'm'),
    ).resolves.toBe('not-allowed');
    expect(refused.calls).toEqual(['archived false', 'edit {"locked":true,"archived":true}']);
  });

  it('keeps the deletion where archiving the post again is refused, and logs that', async () => {
    const { thread, calls } = post(true, true, undefined, {
      rearchive: RESTJSONErrorCodes.MissingPermissions,
    });
    const logged = createTestLogger();
    await expect(
      gatewayOver(() => Promise.resolve(thread), logged).deleteReported('p', 'm'),
    ).resolves.toBe('deleted');
    expect(calls).toEqual(['archived false', 'delete']);
    expect(logged.entries.map((entry) => entry.msg)).toContain(
      'could not archive a post again after deleting a reported message in it',
    );
  });

  it('answers not-allowed, opening nothing, in an archived post where it may not manage posts', async () => {
    const { thread, calls } = post(true, true, undefined, { managing: false });
    await expect(gatewayOver(() => Promise.resolve(thread)).deleteReported('p', 'm')).resolves.toBe(
      'not-allowed',
    );
    expect(calls).toEqual([]);
  });

  it('leaves the post open after the deletion where asked: the region’s board (review W3)', async () => {
    const { thread, calls } = post(true);
    await expect(
      gatewayOver(() => Promise.resolve(thread)).deleteReported('p', 'm', { leaveOpen: true }),
    ).resolves.toBe('deleted');
    expect(calls).toEqual(['archived false', 'delete']);
    expect(thread.archived).toBe(false);
    // An unlocked post is opened with Send Messages alone (Discord): no Manage Threads needed.
    const open = post(true, false, undefined, { managing: false });
    await expect(
      gatewayOver(() => Promise.resolve(open.thread)).deleteReported('p', 'm', { leaveOpen: true }),
    ).resolves.toBe('deleted');
    expect(open.calls).toEqual(['archived false', 'delete']);
    // A locked one still takes Manage Threads to open: nothing is opened without it.
    const locked = post(true, true, undefined, { managing: false });
    await expect(
      gatewayOver(() => Promise.resolve(locked.thread)).deleteReported('p', 'm', {
        leaveOpen: true,
      }),
    ).resolves.toBe('not-allowed');
    expect(locked.calls).toEqual([]);
  });

  it('deletes in an open post without touching it otherwise', async () => {
    const { thread, calls } = post(false);
    await expect(gatewayOver(() => Promise.resolve(thread)).deleteReported('p', 'm')).resolves.toBe(
      'deleted',
    );
    expect(calls).toEqual(['delete']);
  });

  it('answers not-allowed where the bot cannot even see the channel', async () => {
    const hidden = gatewayOver(() => Promise.reject(apiError(RESTJSONErrorCodes.MissingAccess)));
    await expect(hidden.deleteReported('c', 'm')).resolves.toBe('not-allowed');
  });
});

describe('DiscordPartyGateway: the region’s locked board post (plan 8R-9)', () => {
  /**
   * The board post (a thread), archived and locked as a week without messages leaves it: Discord
   * refuses a message or a deletion in it until it is opened (50083). Its forum gives the bot
   * `has`; the post is in the cache unless `cached` is false (then fetched).
   */
  function board(has: bigint, cached = true) {
    const calls: string[] = [];
    const me = { id: 'bot' };
    const thread = {
      id: 'p',
      archived: true,
      locked: true,
      guild: { members: { me } },
      parent: {
        permissionsFor: (member: unknown) => (member === me ? new PermissionsBitField(has) : null),
      },
      isTextBased: () => true,
      isThread: () => true,
      isSendable: () => true,
      setArchived: (value: boolean) => {
        calls.push(`archived ${String(value)}`);
        thread.archived = value;
        return Promise.resolve(thread);
      },
      send: (payload: { flags?: unknown }) => {
        if (thread.archived)
          return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
        calls.push(`send ${JSON.stringify(payload.flags)}`);
        return Promise.resolve({ id: 'm' });
      },
      messages: {
        delete: () => {
          if (thread.archived)
            return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
          calls.push('delete');
          return Promise.resolve();
        },
      },
    };
    const gateway = new DiscordPartyGateway();
    gateway.use({
      channels: {
        fetch: () => Promise.resolve(thread),
        cache: new Map(cached ? [['p', thread]] : []),
      },
    } as unknown as Client);
    return { gateway, calls, thread };
  }
  const ALL =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.SendMessagesInThreads |
    PermissionFlagsBits.ManageThreads |
    PermissionFlagsBits.EmbedLinks;

  it('opens the archived post before it sends where asked, and sends silently where asked (B3, B13; P4)', async () => {
    const { gateway, calls, thread } = board(ALL);
    // Not asked to open it: Discord refuses the message in the archived locked post, as before.
    await expect(gateway.sendMessage('p', { content: 'A line' })).rejects.toMatchObject({
      code: RESTJSONErrorCodes.InvalidActionOnArchivedThread,
    });
    expect(calls).toEqual([]);
    await expect(
      gateway.sendMessage(
        'p',
        { v2: true, components: [{ type: ComponentType.TextDisplay, content: 'Stops' }] },
        { silent: true, reopen: true },
      ),
    ).resolves.toBe('m');
    expect(calls).toEqual([
      'archived false',
      `send ${JSON.stringify(['IsComponentsV2', 'SuppressNotifications'])}`,
    ]);
    // Without `silent` a message notifies as before (no flag of its own where it is classic).
    await gateway.sendMessage('p', { content: 'A line' });
    expect(calls.at(-1)).toBe('send undefined');
    expect(thread.archived).toBe(false);
  });

  it('opens the archived post before it deletes a message in it where asked (B3; P4)', async () => {
    const refused = board(ALL);
    await expect(refused.gateway.deleteMessage('p', 'm')).rejects.toMatchObject({
      code: RESTJSONErrorCodes.InvalidActionOnArchivedThread,
    });
    const { gateway, calls } = board(ALL);
    await gateway.deleteMessage('p', 'm', { reopen: true });
    expect(calls).toEqual(['archived false', 'delete']);
  });

  it('says what the bot may write in the post by its forum’s permissions (B6)', async () => {
    expect(await board(ALL).gateway.postAccess('p')).toBe('v2');
    expect(await board(ALL & ~PermissionFlagsBits.EmbedLinks).gateway.postAccess('p')).toBe(
      'plain',
    );
    expect(await board(ALL & ~PermissionFlagsBits.ManageThreads).gateway.postAccess('p')).toBe(
      'refused',
    );
    expect(
      await board(ALL & ~PermissionFlagsBits.SendMessagesInThreads).gateway.postAccess('p'),
    ).toBe('refused');
  });

  it('fetches a post that is not in the cache to say what the bot may write in it (P3)', async () => {
    const { gateway } = board(ALL & ~PermissionFlagsBits.ManageThreads, false);
    expect(await gateway.postAccess('p')).toBe('refused');
  });
});

describe('DiscordPartyGateway: the region’s open board (plan 8R-9F)', () => {
  const ALL =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.SendMessagesInThreads |
    PermissionFlagsBits.ManageThreads |
    PermissionFlagsBits.ManageMessages |
    PermissionFlagsBits.EmbedLinks;
  /** A message of the board as discord.js gives it: by this bot, another bot, a webhook, a member. */
  interface Written {
    id: string;
    author: string;
    bot?: boolean;
    webhook?: boolean;
    system?: boolean;
    createdTimestamp?: number;
    /** How many reactions it has (plan 8R-9G). */
    reactions?: number;
  }
  /**
   * The board post (a thread) in a forum that gives the bot `has`: archived or not, locked or
   * not, with a slowmode, the messages written in it (newest first, as Discord gives them) and
   * the members of its server, each with Manage Messages there or not.
   */
  function board({
    has = ALL,
    archived = false,
    locked = false,
    slowmode = 0,
    written = [] as Written[],
    managers = [] as string[],
  } = {}) {
    const calls: string[] = [];
    const me = { id: 'bot' };
    const thread = {
      id: 'p',
      name: 'Today and coming up',
      appliedTags: [] as string[],
      flags: { has: () => true },
      archived,
      locked,
      rateLimitPerUser: slowmode,
      guild: {
        members: {
          me,
          fetch: ({ user, force }: { user: string; force: boolean }) => {
            calls.push(`member ${user}${force ? ' fresh' : ''}`);
            if (user === 'gone') return Promise.reject(apiError(RESTJSONErrorCodes.UnknownMember));
            return Promise.resolve({ id: user });
          },
        },
      },
      parent: {
        permissionsFor: (member: unknown) => (member === me ? new PermissionsBitField(has) : null),
      },
      permissionsFor: (member: { id: string }) =>
        new PermissionsBitField(
          managers.includes(member.id) ? PermissionFlagsBits.ManageMessages : 0n,
        ),
      isTextBased: () => true,
      isThread: () => true,
      setArchived: (value: boolean) => {
        calls.push(`archived ${String(value)}`);
        thread.archived = value;
        return Promise.resolve(thread);
      },
      edit: (options: Record<string, unknown>) => {
        if (thread.archived)
          return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
        calls.push(`edit ${JSON.stringify(options)}`);
        return Promise.resolve(thread);
      },
      messages: {
        fetch: ({ limit }: { limit: number }) => {
          calls.push(`fetch ${String(limit)}`);
          return Promise.resolve(
            new Map(
              written.slice(0, limit).map((one) => [
                one.id,
                {
                  id: one.id,
                  author: { id: one.author, bot: one.bot === true || one.author === 'bot' },
                  webhookId: one.webhook === true ? 'w' : null,
                  system: one.system === true,
                  createdTimestamp: one.createdTimestamp ?? 0,
                  reactions: { cache: { size: one.reactions ?? 0 } },
                },
              ]),
            ),
          );
        },
      },
      bulkDelete: (ids: string[]) => {
        if (thread.archived)
          return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
        calls.push(`bulk ${ids.join(',')}`);
        return Promise.resolve(new Map(ids.map((id) => [id, {}])));
      },
    };
    const gateway = new DiscordPartyGateway();
    gateway.use({
      channels: { fetch: () => Promise.resolve(thread), cache: new Map([['p', thread]]) },
      user: me,
    } as unknown as Client);
    return { gateway, calls, thread };
  }

  it('opens the board to members once: unlocked, with 45 seconds of slowmode, opened first where archived (R2, B4, plan 8R-9H)', async () => {
    const { gateway, calls } = board({ archived: true, locked: true });
    await expect(gateway.openBoard('p')).resolves.toBe(true);
    expect(calls).toEqual([
      'archived false',
      `edit ${JSON.stringify({ locked: false, rateLimitPerUser: 45 })}`,
    ]);
  });

  it('moves the board’s slowmode to its mark alone, leaving its lock, opened first where archived (plan 8R-9H)', async () => {
    const { gateway, calls } = board({ archived: true, locked: true, slowmode: 21_600 });
    await expect(gateway.setBoardSlowmode('p')).resolves.toBe(true);
    // Only the slowmode: the lock is not touched.
    expect(calls).toEqual(['archived false', `edit ${JSON.stringify({ rateLimitPerUser: 45 })}`]);
  });

  it('moves the slowmode of a board that is not archived without opening it (plan 8R-9H)', async () => {
    const { gateway, calls } = board({ slowmode: 21_600 });
    await expect(gateway.setBoardSlowmode('p')).resolves.toBe(true);
    expect(calls).toEqual([`edit ${JSON.stringify({ rateLimitPerUser: 45 })}`]);
  });

  it('says whether the board is locked and its slowmode (R2)', async () => {
    await expect(board({ locked: true, slowmode: 45 }).gateway.postInfo('p')).resolves.toEqual({
      title: 'Today and coming up',
      tagIds: [],
      pinned: true,
      locked: true,
      slowmode: 45,
      archived: false,
    });
  });

  it('writes in an open board without Manage Posts, in a locked one only with it (B5)', async () => {
    const without = ALL & ~PermissionFlagsBits.ManageThreads;
    expect(await board({ has: without }).gateway.postAccess('p')).toBe('v2');
    expect(await board({ has: without, locked: true }).gateway.postAccess('p')).toBe('refused');
    expect(await board({ locked: true }).gateway.postAccess('p')).toBe('v2');
  });

  it('reads the board’s newest messages, by whom, which are Discord’s own, and which have reactions (B6; 8R-9G)', async () => {
    const { gateway, calls } = board({
      written: [
        { id: '5', author: 'member', createdTimestamp: 50 },
        { id: '4', author: 'other-app', bot: true },
        { id: '3', author: 'hook', webhook: true },
        { id: '2', author: 'bot', system: true },
        { id: '1', author: 'bot', reactions: 2 },
      ],
    });
    const none = { system: false, createdAt: 0, reacted: false };
    await expect(gateway.boardMessages('p', 100)).resolves.toEqual([
      { ...none, id: '5', authorId: 'member', by: 'member', createdAt: 50 },
      { ...none, id: '4', authorId: 'other-app', by: 'bot' },
      { ...none, id: '3', authorId: 'hook', by: 'bot' },
      { ...none, id: '2', authorId: 'bot', by: 'me', system: true },
      { ...none, id: '1', authorId: 'bot', by: 'me', reacted: true },
    ]);
    expect(calls).toEqual(['fetch 100']);
  });

  it('deletes many members’ messages at once (B6)', async () => {
    const { gateway, calls } = board();
    await expect(gateway.bulkDelete('p', ['7', '8'])).resolves.toBe('deleted');
    expect(calls).toEqual(['bulk 7,8']);
  });

  it('opens an archived board for a bulk delete where asked, and leaves it open (review W3)', async () => {
    // Not asked to open it: Discord refuses the bulk delete in the archived post (50083).
    const refused = board({ archived: true });
    await expect(refused.gateway.bulkDelete('p', ['7', '8'])).rejects.toMatchObject({
      code: RESTJSONErrorCodes.InvalidActionOnArchivedThread,
    });
    const { gateway, calls, thread } = board({ archived: true });
    await expect(gateway.bulkDelete('p', ['7', '8'], { reopen: true })).resolves.toBe('deleted');
    expect(calls).toEqual(['archived false', 'bulk 7,8']);
    expect(thread.archived).toBe(false);
  });

  it('says whether a member may manage messages in the board, fetched afresh where asked (Q1)', async () => {
    const { gateway, calls } = board({ managers: ['mod'] });
    await expect(gateway.managesMessages('p', 'mod', true)).resolves.toBe(true);
    await expect(gateway.managesMessages('p', 'member', false)).resolves.toBe(false);
    await expect(gateway.managesMessages('p', 'gone', true)).resolves.toBe(false);
    expect(calls).toEqual(['member mod fresh', 'member member', 'member gone fresh']);
  });
});

describe('DiscordPartyGateway: reactions on the board’s messages (plan 8R-9G)', () => {
  /**
   * The board post (a thread, archived or not) whose messages have `reactions` reactions on
   * Discord, as the answer of an edit says (discord.js's message, or the REST body of a
   * conversion); removing them fails with `failure` while it is set, and in an archived post as
   * Discord does (50083). As discord.js, an edit gives the message of the channel's cache, whose
   * reactions it replaces only where Discord's body has some (Discord leaves `reactions` out
   * when there are none: review R-F2).
   */
  function board({
    reactions = 0,
    failure,
    archived = false,
  }: { reactions?: number; failure?: Error; archived?: boolean } = {}) {
    const calls: string[] = [];
    const state: { reactions: number; failure?: Error } = { reactions, failure };
    const cache = new Map<string, { id: string; reactions: { cache: Map<string, object> } }>();
    const cached = (id: string) => {
      let message = cache.get(id);
      if (!message) cache.set(id, (message = { id, reactions: { cache: new Map() } }));
      return message;
    };
    const thread = {
      id: 'p',
      archived,
      isTextBased: () => true,
      isThread: () => true,
      setArchived: (value: boolean) => {
        calls.push(`archived ${String(value)}`);
        thread.archived = value;
        return Promise.resolve(thread);
      },
      messages: {
        cache,
        edit: (id: string) => {
          calls.push(`edit ${id}`);
          const message = cached(id);
          if (state.reactions > 0) {
            message.reactions.cache = new Map(
              Array.from({ length: state.reactions }, (_, n) => [String(n), {}]),
            );
          }
          return Promise.resolve(message);
        },
      },
    };
    const client = {
      channels: { fetch: () => Promise.resolve(thread) },
      rest: {
        patch: (route: string) => {
          calls.push(`patch ${route}`);
          return Promise.resolve({
            id: route.split('/').at(-1),
            reactions: Array.from({ length: state.reactions }, () => ({ count: 1 })),
          });
        },
        delete: (route: string) => {
          if (thread.archived)
            return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread, 400));
          if (state.failure) return Promise.reject(state.failure);
          calls.push(`delete ${route}`);
          state.reactions = 0;
          return Promise.resolve();
        },
      },
    };
    const logged = createTestLogger();
    const gateway = new DiscordPartyGateway(logged.log);
    gateway.use(client as unknown as Client);
    const said = () =>
      logged.entries.filter(
        (entry) => entry.msg === 'could not remove the reactions on a message in the board',
      ).length;
    return { gateway, calls, state, thread, said, cached };
  }
  const v2: OutgoingMessage = {
    v2: true,
    components: [{ type: ComponentType.TextDisplay, content: 'Today' }],
  };
  const refused = () => apiError(RESTJSONErrorCodes.MissingPermissions, 403);

  it('removes the reactions on a message edited for the board, and only where asked', async () => {
    const { gateway, calls } = board({ reactions: 2 });
    // A party post's edit: its chat keeps its reactions.
    await expect(gateway.editMessage('p', 'm', v2)).resolves.toBe(true);
    expect(calls).toEqual(['edit m']);
    await expect(gateway.editMessage('p', 'm', v2, { clearReactions: true })).resolves.toBe(true);
    expect(calls).toEqual(['edit m', 'edit m', 'delete /channels/p/messages/m/reactions']);
    // None left: the next edit removes nothing.
    await gateway.editMessage('p', 'm', v2, { clearReactions: true });
    expect(calls.at(-1)).toBe('edit m');
  });

  it('removes them on the post’s first message, also where the edit went as a conversion', async () => {
    const plain = board({ reactions: 1 });
    await expect(plain.gateway.editPost('p', v2, { clearReactions: true })).resolves.toBe(true);
    expect(plain.calls).toEqual(['edit p', 'delete /channels/p/messages/p/reactions']);
    const { gateway, calls } = board({ reactions: 1 });
    await expect(gateway.editPost('p', v2, { convert: true, clearReactions: true })).resolves.toBe(
      true,
    );
    expect(calls).toEqual([
      'patch /channels/p/messages/p',
      'delete /channels/p/messages/p/reactions',
    ]);
  });

  it('counts the edit as done where the removal fails, said once per board until one works', async () => {
    const { gateway, state, said } = board({ reactions: 1, failure: refused() });
    await expect(gateway.editPost('p', v2, { clearReactions: true })).resolves.toBe(true);
    state.failure = new Error('Discord is away');
    await expect(gateway.editMessage('p', 'm', v2, { clearReactions: true })).resolves.toBe(true);
    expect(said()).toBe(1);
    // A message deleted meanwhile is no failure.
    state.failure = apiError(RESTJSONErrorCodes.UnknownMessage);
    await expect(gateway.editMessage('p', 'm', v2, { clearReactions: true })).resolves.toBe(true);
    expect(said()).toBe(1);
    // One that works: the next refusal is said again.
    state.failure = undefined;
    await gateway.editMessage('p', 'm', v2, { clearReactions: true });
    state.reactions = 1;
    state.failure = refused();
    await gateway.editMessage('p', 'm', v2, { clearReactions: true });
    expect(said()).toBe(2);
  });

  it('forgets the removed reactions of the cached message, so the next edit removes nothing (review R-F2)', async () => {
    const { gateway, calls, cached } = board({ reactions: 2 });
    await gateway.editPost('p', v2, { clearReactions: true });
    await gateway.editPost('p', v2, { clearReactions: true });
    expect(calls).toEqual(['edit p', 'delete /channels/p/messages/p/reactions', 'edit p']);
    // The sweep's removal too: the cached message no longer says it has reactions.
    cached('m').reactions.cache.set('x', {});
    await expect(gateway.clearReactions('p', 'm')).resolves.toBe('cleared');
    expect(cached('m').reactions.cache.size).toBe(0);
  });

  it('removes a message’s reactions for the sweep, opening an archived board and leaving it open', async () => {
    const { gateway, calls, thread } = board({ archived: true });
    await expect(gateway.clearReactions('p', 'm')).resolves.toBe('cleared');
    expect(calls).toEqual(['archived false', 'delete /channels/p/messages/m/reactions']);
    expect(thread.archived).toBe(false);
    await expect(board({ failure: refused() }).gateway.clearReactions('p', 'm')).resolves.toBe(
      'not-allowed',
    );
    const gone = board({ failure: apiError(RESTJSONErrorCodes.UnknownMessage) });
    await expect(gone.gateway.clearReactions('p', 'm')).resolves.toBe('gone');
    const away = board({ failure: new Error('Discord is away') });
    await expect(away.gateway.clearReactions('p', 'm')).rejects.toThrow('Discord is away');
  });
});

describe('DiscordPartyGateway: a post where the bot may not make one', () => {
  const post = { title: 't', message: { content: 'x' }, tagIds: ['1'] };

  /**
   * A forum in which the bot has `has` (from the cache), making a post as `create` answers;
   * `created` counts the requests that would reach Discord. Its tag `1` is moderated, as Pine
   * makes its tags, unless `availableTags` says otherwise.
   */
  function forumWith(
    has: bigint,
    create: (options: unknown) => Promise<unknown> = () => Promise.resolve({ id: '9' }),
    availableTags: readonly { id: string; moderated: boolean }[] = [{ id: '1', moderated: true }],
  ) {
    const me = { id: 'bot' };
    let created = 0;
    const forum = {
      type: ChannelType.GuildForum,
      availableTags,
      guild: { members: { me } },
      permissionsFor: (member: unknown) => (member === me ? new PermissionsBitField(has) : null),
      threads: {
        create: (options: unknown) => {
          created++;
          return create(options);
        },
      },
    };
    const gateway = new DiscordPartyGateway();
    gateway.use({ channels: { fetch: () => Promise.resolve(forum) } } as unknown as Client);
    return { gateway, created: () => created };
  }
  const ALL =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.SendMessages |
    PermissionFlagsBits.SendMessagesInThreads |
    PermissionFlagsBits.ManageThreads;

  it('refuses before asking Discord where it lacks Manage Posts (Manage Threads), by its name in a forum', async () => {
    const { gateway, created } = forumWith(ALL & ~PermissionFlagsBits.ManageThreads);
    const refusal = await gateway.createPost('f', post).catch((err: unknown) => err);
    expect(refusal).toBeInstanceOf(PostsRefusedError);
    expect(refusal).toMatchObject({ forumId: 'f', missing: ['Manage Posts'] });
    expect(created()).toBe(0);
    const none = await forumWith(0n)
      .gateway.createPost('f', post)
      .catch((err: unknown) => err);
    expect(none).toMatchObject({
      missing: ['View Channel', 'Create Posts', 'Manage Posts'],
    });
  });

  it('makes a post that archives itself after a week without messages, or as long as asked (plan 8H-8)', async () => {
    const asked: unknown[] = [];
    const { gateway } = forumWith(ALL, (options) => {
      asked.push(options);
      return Promise.resolve({ id: '9' });
    });
    await gateway.createPost('f', post);
    await gateway.createPost('f', { ...post, autoArchiveMinutes: 1_440 });
    expect(asked).toEqual([
      expect.objectContaining({ autoArchiveDuration: 10_080 }),
      expect.objectContaining({ autoArchiveDuration: 1_440 }),
    ]);
  });

  it('makes a post without Send Messages in Posts: Discord asks only Send Messages to start one', async () => {
    const without = forumWith(ALL & ~PermissionFlagsBits.SendMessagesInThreads);
    await expect(without.gateway.createPost('f', post)).resolves.toBe('9');
    expect(without.created()).toBe(1);
  });

  it('asks Manage Posts only for a moderated tag, as the forum lists its tags', async () => {
    const lacks = ALL & ~PermissionFlagsBits.ManageThreads;
    const open = forumWith(lacks, undefined, [{ id: '1', moderated: false }]);
    await expect(open.gateway.createPost('f', post)).resolves.toBe('9');
    const moderated = await forumWith(lacks, undefined, [
      { id: '1', moderated: false },
      { id: '2', moderated: true },
    ])
      .gateway.createPost('f', { ...post, tagIds: ['1', '2'] })
      .catch((err: unknown) => err);
    expect(moderated).toMatchObject({ forumId: 'f', missing: ['Manage Posts'] });
  });

  it('asks Manage Posts only for a post with tags: a summary is made without it', async () => {
    const lacking = forumWith(ALL & ~PermissionFlagsBits.ManageThreads);
    await expect(lacking.gateway.createPost('f', { ...post, tagIds: [] })).resolves.toBe('9');
    expect(lacking.created()).toBe(1);
    const refusal = await forumWith(ALL & ~PermissionFlagsBits.SendMessages)
      .gateway.createPost('f', { ...post, tagIds: [] })
      .catch((err: unknown) => err);
    expect(refusal).toMatchObject({ forumId: 'f', missing: ['Create Posts'] });
  });

  it('takes Missing Access of Discord as the same refusal, and makes the post where it may', async () => {
    const denied = forumWith(ALL, () =>
      Promise.reject(apiError(RESTJSONErrorCodes.MissingAccess, 403)),
    );
    const refusal = await denied.gateway.createPost('f', post).catch((err: unknown) => err);
    expect(refusal).toBeInstanceOf(PostsRefusedError);
    expect(refusal).toMatchObject({ forumId: 'f', missing: [] });
    await expect(forumWith(ALL).gateway.createPost('f', post)).resolves.toBe('9');
    // Another failure is no refusal of posts.
    const away = forumWith(ALL, () => Promise.reject(new Error('Discord is away')));
    await expect(away.gateway.createPost('f', post)).rejects.toThrow('Discord is away');
  });
});

describe('DiscordPartyGateway: whether a server is available (plan 19B-1)', () => {
  it('says a server Discord says is unavailable, or one the bot is not in, is not; its channels stay listed', () => {
    const channel = { id: 'c1', name: 'bot-updates', type: ChannelType.GuildText, parentId: null };
    const guildOf = (available: boolean) => ({
      available,
      channels: {
        cache: new Map([['c1', { ...channel, isThread: () => false, createdTimestamp: 1 }]]),
      },
    });
    const gateway = new DiscordPartyGateway(createTestLogger().log);
    gateway.use({
      guilds: {
        cache: new Map([
          ['up', guildOf(true)],
          ['down', guildOf(false)],
        ]),
      },
    } as unknown as Client);
    expect(gateway.serverAvailable('up')).toBe(true);
    expect(gateway.serverAvailable('down')).toBe(false);
    expect(gateway.serverAvailable('gone')).toBe(false);
    // The web map, the editor and the regions' removal read the channels during an outage too.
    const listed = [{ id: 'c1', name: 'bot-updates', kind: 'text', categoryId: null }];
    expect(gateway.serverChannels('up')).toEqual(listed);
    expect(gateway.serverChannels('down')).toEqual(listed);
    expect(gateway.serverChannels('gone')).toBeUndefined();
    // A server Pine left while it was away, which discord.js keeps in its cache, is none of the
    // bot's (plan 19C-1); the other servers still are.
    const left = new DiscordPartyGateway(createTestLogger().log, { isQuiet: (id) => id === 'up' });
    left.use({
      guilds: {
        cache: new Map([
          ['up', guildOf(true)],
          ['other', guildOf(true)],
        ]),
      },
    } as unknown as Client);
    expect(left.serverAvailable('up')).toBe(false);
    expect(left.serverAvailable('other')).toBe(true);
  });
});

describe('DiscordPartyGateway: a category that continues another (plan 8S-4)', () => {
  /**
   * A server whose category `k1` (at position 4) keeps everyone out; what `channels.create` was
   * asked, and where the new category was moved (`setPosition`, which `moved` may refuse).
   */
  function serverWith(moved: () => Promise<unknown> = () => Promise.resolve()) {
    const asked: Record<string, unknown>[] = [];
    const positions: number[] = [];
    const base = {
      id: 'k1',
      type: ChannelType.GuildCategory,
      position: 4,
      permissionOverwrites: {
        cache: [
          {
            id: 'everyone',
            type: OverwriteType.Role,
            allow: { bitfield: 0n },
            deny: { bitfield: PermissionFlagsBits.ViewChannel },
          },
        ],
      },
    };
    const guild = {
      channels: {
        cache: new Map<string, unknown>([['k1', base]]),
        create: (options: Record<string, unknown>) => {
          asked.push(options);
          return Promise.resolve({
            id: 'k2',
            name: options.name,
            setPosition: (position: number) => {
              positions.push(position);
              return moved();
            },
          });
        },
      },
    };
    const { log, entries } = createTestLogger();
    const gateway = new DiscordPartyGateway(log);
    gateway.use({ guilds: { cache: new Map([['g', guild]]) } } as unknown as Client);
    return { gateway, asked, positions, entries };
  }

  it('makes it with the overwrites of the one it continues, and moves it right after it', async () => {
    const made = serverWith();
    await expect(made.gateway.createCategory('g', 'Town 2', 'why', 'k1')).resolves.toEqual({
      ok: true,
      id: 'k2',
      name: 'Town 2',
    });
    expect(made.asked).toEqual([
      {
        name: 'Town 2',
        type: ChannelType.GuildCategory,
        parent: null,
        reason: 'why',
        permissionOverwrites: [
          {
            id: 'everyone',
            type: OverwriteType.Role,
            allow: 0n,
            deny: PermissionFlagsBits.ViewChannel,
          },
        ],
      },
    ]);
    expect(made.positions).toEqual([5]);
    await expect(made.gateway.createCategory('g', 'Town 3', 'why', 'gone')).resolves.toEqual({
      ok: false,
      reason: 'base-gone',
    });
  });

  it('keeps a category it could not move, and logs why', async () => {
    const made = serverWith(() => Promise.reject(new Error('Discord is away')));
    expect((await made.gateway.createCategory('g', 'Town 2', 'why', 'k1')).ok).toBe(true);
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        msg: 'could not move a new category after the one it continues',
      }),
    );
  });
});

// Final review, G2: Discord allows 20 available tags per forum, and refuses a list of more.
describe('DiscordPartyGateway: the tags of a forum near its limit', () => {
  function forumOf(names: readonly string[]) {
    const set: { name: string }[][] = [];
    const forum = {
      type: ChannelType.GuildForum,
      id: 'f',
      guildId: 'g',
      availableTags: names.map((name, n) => ({ id: String(n), name, moderated: false })),
      setAvailableTags: (tags: { name: string }[]) => {
        set.push(tags);
        return Promise.resolve({
          availableTags: tags.map((tag, n) => ({ id: String(n), name: tag.name })),
        });
      },
    };
    const { log, entries } = createTestLogger();
    const gateway = new DiscordPartyGateway(log);
    gateway.use({ channels: { fetch: () => Promise.resolve(forum) } } as unknown as Client);
    return { gateway, set, entries };
  }

  it('adds what fits under 20 and says which tags it left out', async () => {
    const own = Array.from({ length: 17 }, (_, n) => `Own ${String(n)}`);
    const { gateway, set, entries } = forumOf(own);
    const tags = await gateway.ensureTags('f', ['Egg', 'Hatched', 'Ended', 'T5', 'Train']);
    expect(set.map((tags) => tags.length)).toEqual([20]);
    expect(Object.keys(tags ?? {})).toEqual([...own, 'Egg', 'Hatched', 'Ended']);
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        forum: 'f',
        missing: ['T5', 'Train'],
        msg: 'a forum has no room for these tags: its posts go without them',
      }),
    );
  });

  it('asks nothing of a forum that is full, and says so', async () => {
    const own = Array.from({ length: 20 }, (_, n) => `Own ${String(n)}`);
    const { gateway, set, entries } = forumOf(own);
    const tags = await gateway.ensureTags('f', ['Egg']);
    expect(set).toEqual([]);
    expect(Object.keys(tags ?? {})).toEqual(own);
    expect(entries).toContainEqual(expect.objectContaining({ level: 40, missing: ['Egg'] }));
  });
});

describe('the events forum’s posts (plan 8V-1)', () => {
  describe('FakePartyGateway', () => {
    const made = async () => {
      const gateway = new FakePartyGateway();
      gateway.addForum('f', [], 'events');
      const postId =
        (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ??
        '';
      return { gateway, postId, post: () => gateway.posts.get(postId) };
    };

    it('sets a post’s auto-archive, leaving an archived one as it is', async () => {
      const { gateway, postId, post } = await made();
      expect(post()?.autoArchiveMinutes).toBe(10_080);
      await expect(gateway.setAutoArchive(postId, 1_440)).resolves.toBe(true);
      expect(post()).toMatchObject({ autoArchiveMinutes: 1_440, archived: false, locked: false });
      await gateway.archiveUnlocked(postId);
      await expect(gateway.setAutoArchive(postId, 10_080)).resolves.toBe(true);
      expect(post()).toMatchObject({ autoArchiveMinutes: 1_440, archived: true, reopened: 0 });
      gateway.gone.add(postId);
      await expect(gateway.setAutoArchive(postId, 1_440)).resolves.toBe(false);
    });

    it('makes a post that archives itself after as long as asked (plan 8H-8)', async () => {
      const { gateway } = await made();
      const postId =
        (await gateway.createPost('f', {
          title: 'On this day',
          message: { content: 'x' },
          tagIds: [],
          autoArchiveMinutes: 1_440,
        })) ?? '';
      expect(gateway.posts.get(postId)?.autoArchiveMinutes).toBe(1_440);
    });

    it('archives a post without locking it, and locks one without archiving it', async () => {
      const { gateway, postId, post } = await made();
      await expect(gateway.archiveUnlocked(postId)).resolves.toBe(true);
      expect(post()).toMatchObject({ archived: true, locked: false });
      await expect(gateway.lockPost(postId)).resolves.toBe(true);
      expect(post()).toMatchObject({ archived: false, locked: true, reopened: 1 });
      gateway.gone.add(postId);
      await expect(gateway.archiveUnlocked(postId)).resolves.toBe(false);
      await expect(gateway.lockPost(postId)).resolves.toBe(false);
    });

    // Review V6: the hourly draw opens an event's post that archived itself before its event.
    it('says whether a post is archived', async () => {
      const { gateway, postId } = await made();
      expect((await gateway.postInfo(postId))?.archived).toBe(false);
      await gateway.archiveUnlocked(postId);
      expect((await gateway.postInfo(postId))?.archived).toBe(true);
    });

    it('lists the bot’s archived posts of a forum, and none of a forum that is gone', async () => {
      const { gateway, postId } = await made();
      const open =
        (await gateway.createPost('f', { title: 'o', message: { content: 'y' }, tagIds: [] })) ??
        '';
      await gateway.archiveUnlocked(postId);
      await expect(gateway.archivedPosts('f')).resolves.toEqual([postId]);
      await expect(gateway.openPosts('f')).resolves.toEqual([open]);
      gateway.gone.add('f');
      await expect(gateway.archivedPosts('f')).resolves.toBeUndefined();
    });

    // Branch review BR-7.
    it('names the roles that cannot write in a forum’s posts', async () => {
      const { gateway } = await made();
      await expect(gateway.rolesWithoutReplies('f', ['Member'])).resolves.toEqual([]);
      gateway.noReplies.set('f', ['@everyone', 'Member']);
      await expect(gateway.rolesWithoutReplies('f', [])).resolves.toEqual(['@everyone']);
      await expect(gateway.rolesWithoutReplies('f', ['Member'])).resolves.toEqual([
        '@everyone',
        'Member',
      ]);
      await expect(gateway.rolesWithoutReplies('none', [])).resolves.toBeUndefined();
    });

    it('lets the bot manage the posts of a forum, refused where it may not set permissions', async () => {
      const { gateway } = await made();
      await expect(gateway.letBotManagePosts('f')).resolves.toBe('allowed');
      await expect(gateway.letBotManagePosts('f')).resolves.toBe('was-allowed');
      gateway.addForum('g');
      gateway.noReserving.add('g');
      await expect(gateway.letBotManagePosts('g')).resolves.toBe('not-allowed');
      await expect(gateway.letBotManagePosts('none')).resolves.toBeUndefined();
    });
  });

  describe('DiscordPartyGateway', () => {
    /** An events post (a thread), archived or not, locked or not, as discord.js gives it. */
    function eventPost({ archived = false, locked = false } = {}) {
      const calls: string[] = [];
      const thread = {
        id: 'p',
        archived,
        locked,
        isThread: () => true,
        setArchived: (value: boolean) => {
          calls.push(`archived ${String(value)}`);
          thread.archived = value;
          return Promise.resolve(thread);
        },
        edit: (options: Record<string, unknown>) => {
          if (thread.archived)
            return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
          calls.push(`edit ${JSON.stringify(options)}`);
          return Promise.resolve(thread);
        },
      };
      const gateway = new DiscordPartyGateway();
      gateway.use({
        channels: { fetch: () => Promise.resolve(thread) },
        user: { id: 'bot' },
      } as unknown as Client);
      return { gateway, calls, thread };
    }

    it('says in a post’s info whether it is archived', async () => {
      const shut = eventPost({ archived: true });
      Object.assign(shut.thread, {
        name: 'Events',
        appliedTags: [],
        flags: { has: () => false },
        rateLimitPerUser: 0,
      });
      await expect(shut.gateway.postInfo('p')).resolves.toMatchObject({ archived: true });
    });

    it('sets the auto-archive of an open post, and leaves an archived one shut', async () => {
      const open = eventPost();
      await expect(open.gateway.setAutoArchive('p', 1_440)).resolves.toBe(true);
      expect(open.calls).toEqual([`edit ${JSON.stringify({ autoArchiveDuration: 1_440 })}`]);
      const shut = eventPost({ archived: true });
      await expect(shut.gateway.setAutoArchive('p', 1_440)).resolves.toBe(true);
      expect(shut.calls).toEqual([]);
    });

    it('archives without locking, and nothing for a post archived already', async () => {
      const open = eventPost();
      await expect(open.gateway.archiveUnlocked('p')).resolves.toBe(true);
      expect(open.calls).toEqual(['archived true']);
      const shut = eventPost({ archived: true });
      await expect(shut.gateway.archiveUnlocked('p')).resolves.toBe(true);
      expect(shut.calls).toEqual([]);
    });

    it('locks a post, opening it first where archived, and nothing for one locked already', async () => {
      const shut = eventPost({ archived: true });
      await expect(shut.gateway.lockPost('p')).resolves.toBe(true);
      expect(shut.calls).toEqual(['archived false', `edit ${JSON.stringify({ locked: true })}`]);
      const locked = eventPost({ locked: true });
      await expect(locked.gateway.lockPost('p')).resolves.toBe(true);
      expect(locked.calls).toEqual([]);
    });

    /**
     * An events forum whose permissions the bot may not change (Pittsburgh's #pogo-events, set by
     * hand on 2026-11-09): what the bot and @everyone may do there is `bot` and `everyone`.
     */
    function lockedForum(bot: bigint, everyoneBits: bigint) {
      const me = { id: 'bot' };
      const everyone = { id: 'g', name: '@everyone' };
      const edits: string[] = [];
      const forum = {
        type: ChannelType.GuildForum,
        guild: { members: { me }, roles: { everyone, cache: new Map([['g', everyone]]) } },
        permissionOverwrites: {
          cache: new Collection(),
          edit: (who: { id: string } | string) => {
            edits.push(typeof who === 'string' ? who : who.id);
            return Promise.reject(apiError(RESTJSONErrorCodes.MissingPermissions, 403));
          },
        },
        permissionsFor: (who: { id: string }) =>
          new PermissionsBitField(who.id === 'bot' ? bot : everyoneBits),
      };
      const gateway = new DiscordPartyGateway();
      gateway.use({
        channels: { fetch: () => Promise.resolve(forum) },
        user: { id: 'bot' },
      } as unknown as Client);
      return { gateway, edits };
    }

    it('counts a forum closed and managed by hand as done, where it may not set permissions', async () => {
      const post = PermissionFlagsBits.SendMessages;
      const view = PermissionFlagsBits.ViewChannel;
      const { gateway, edits } = lockedForum(
        view | post | PermissionFlagsBits.ManageThreads,
        view | PermissionFlagsBits.SendMessagesInThreads,
      );
      await expect(gateway.reservePosts('f')).resolves.toBe('was-reserved');
      await expect(gateway.letBotManagePosts('f')).resolves.toBe('was-allowed');
      // Managing posts is read before anything is written; closing to posts after the refusal.
      expect(edits).toEqual(['bot']);
    });

    it('still says it could not where members may post or the bot may not manage posts', async () => {
      const post = PermissionFlagsBits.SendMessages;
      const view = PermissionFlagsBits.ViewChannel;
      const { gateway } = lockedForum(view | post, view | post);
      await expect(gateway.reservePosts('f')).resolves.toBe('not-allowed');
      await expect(gateway.letBotManagePosts('f')).resolves.toBe('not-allowed');
    });

    it('names @everyone and the roles named that lack View Channel or Send Messages in Posts', async () => {
      const everyone = { id: 'g', name: '@everyone' };
      const member = { id: 'm', name: 'Member' };
      const writes = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessagesInThreads;
      const forum = {
        type: ChannelType.GuildForum,
        guild: {
          roles: {
            everyone,
            cache: new Map([
              ['g', everyone],
              ['m', member],
            ]),
          },
        },
        permissionsFor: (role: { id: string }) =>
          new PermissionsBitField(role.id === 'm' ? writes : PermissionFlagsBits.ViewChannel),
      };
      const gateway = new DiscordPartyGateway();
      gateway.use({
        channels: { fetch: () => Promise.resolve(forum) },
        user: { id: 'bot' },
      } as unknown as Client);
      await expect(gateway.rolesWithoutReplies('f', ['m', 'nobody'])).resolves.toEqual([
        '@everyone',
      ]);
    });

    it('says how a member stands to a region’s text channel as to a forum (8H5-2)', async () => {
      const view = PermissionFlagsBits.ViewChannel;
      const members = new Map([
        ['ash', { id: 'ash', roles: { cache: new Map([['m', {}]]) } }],
        ['misty', { id: 'misty', roles: { cache: new Map() } }],
      ]);
      // The server's roles: everybody's sees nothing, `m` nothing by itself (plan 8M-20: what a
      // member sees is `viewsWith` over the roles they hold).
      const role = (id: string) => ({ id, permissions: new PermissionsBitField(0n) });
      const guild = {
        id: 'g',
        ownerId: 'owner',
        roles: {
          cache: new Collection([
            ['g', role('g')],
            ['m', role('m')],
          ]),
        },
        members: {
          fetch: ({ user }: { user: string }) => Promise.resolve(members.get(user)),
        },
      };
      const text = {
        id: 'text',
        type: ChannelType.GuildText,
        guild,
        permissionOverwrites: {
          cache: new Collection([
            [
              'm',
              {
                id: 'm',
                type: OverwriteType.Role,
                allow: new PermissionsBitField(view),
                deny: new PermissionsBitField(0n),
              },
            ],
          ]),
        },
      };
      // A region's channel may be an announcement channel: the same overwrites, the same rule.
      const news = { ...text, id: 'news', type: ChannelType.GuildAnnouncement };
      const channels = new Map<string, unknown>([
        ['text', text],
        ['news', news],
      ]);
      const gateway = new DiscordPartyGateway();
      gateway.use({
        channels: { fetch: (id: string) => Promise.resolve(channels.get(id) ?? null) },
        user: { id: 'bot' },
      } as unknown as Client);
      expect(await gateway.memberAccess('text', 'ash')).toBe('visible');
      expect(await gateway.memberAccess('text', 'misty')).toBe('hidden');
      expect(await gateway.memberAccess('news', 'misty')).toBe('hidden');
      expect(await gateway.memberAccess('nowhere', 'ash')).toBeUndefined();
      // Somebody who is not in the channel's server is kept out of it (plan 19B-4).
      expect(await gateway.memberAccess('text', 'brock')).toBe('barred');
    });

    it('says which gates everybody in a server can view, from the cache, and nothing of one it lacks (plan 8Z-2)', () => {
      const view = PermissionFlagsBits.ViewChannel;
      const role = (id: string, bits: bigint) => ({
        id,
        permissions: new PermissionsBitField(bits),
      });
      const overwrite = (id: string, allow: bigint, deny: bigint, type = OverwriteType.Role) => ({
        id,
        type,
        allow: new PermissionsBitField(allow),
        deny: new PermissionsBitField(deny),
      });
      /** A server whose everyone role has `everyone`, with a member role that views. */
      const server = (id: string, everyone: bigint) => ({
        id,
        ownerId: 'owner',
        roles: {
          cache: new Collection([
            [id, role(id, everyone)],
            ['m', role('m', view)],
          ]),
        },
      });
      const open = server('g', view);
      const gated = server('h', 0n);
      const channel = (
        id: string,
        type: ChannelType,
        guild: ReturnType<typeof server>,
        overwrites: ReturnType<typeof overwrite>[],
      ) => ({
        id,
        type,
        guild,
        permissionOverwrites: { cache: new Collection(overwrites.map((one) => [one.id, one])) },
      });
      const channels = new Map<string, unknown>(
        [
          // Everybody's server permission, nothing denied.
          channel('plain', ChannelType.GuildForum, open, []),
          // Denied to everybody, opened to a role: only who holds it.
          channel('by-role', ChannelType.GuildForum, open, [
            overwrite('g', 0n, view),
            overwrite('m', view, 0n),
          ]),
          // A member let in by their own overwrite does not make it everybody's.
          channel('by-member', ChannelType.GuildText, open, [
            overwrite('g', 0n, view),
            overwrite('ash', view, 0n, OverwriteType.Member),
          ]),
          // A server whose everyone role sees no channel: a channel says so itself, or is hidden.
          channel('opened', ChannelType.GuildAnnouncement, gated, [overwrite('h', view, 0n)]),
          channel('unopened', ChannelType.GuildText, gated, [overwrite('m', view, 0n)]),
          // No gate of a region: a voice channel.
          channel('voice', ChannelType.GuildVoice, open, []),
        ].map((one) => [one.id, one]),
      );
      const gateway = new DiscordPartyGateway();
      gateway.use({ channels: { cache: channels }, user: { id: 'bot' } } as unknown as Client);
      const everyone = gateway.everyoneGates([
        'plain',
        'by-role',
        'by-member',
        'opened',
        'unopened',
        'voice',
        'nowhere',
        'plain',
      ]);
      expect(everyone.access).toEqual(
        new Map([
          ['plain', 'visible'],
          ['by-role', 'hidden'],
          ['by-member', 'hidden'],
          ['opened', 'visible'],
          ['unopened', 'hidden'],
        ]),
      );
      // With the member role (F-B10): what it opens, and nothing a member's own overwrite opens.
      const member = new Set(['m']);
      expect(everyone.seesWith('by-role', member)).toBe(true);
      expect(everyone.seesWith('unopened', member)).toBe(true);
      expect(everyone.seesWith('by-member', member)).toBe(false);
      expect(everyone.seesWith('by-role', new Set())).toBe(false);
      expect(everyone.seesWith('voice', member)).toBe(false);
      expect(everyone.seesWith('nowhere', member)).toBe(false);
      expect(everyone.denials('by-role')).toEqual({ own: false, roles: [] });
    });

    it('keeps the regions of a share where everybody who sees the channel sees their forum, from the cache (plan 8H-5, R-A)', async () => {
      const guildId = 'g';
      const role = (id: string, bits: bigint) => ({
        id,
        permissions: new PermissionsBitField(bits),
      });
      const overwrite = (id: string, allow: bigint, deny: bigint, type = OverwriteType.Role) => ({
        id,
        type,
        allow: new PermissionsBitField(allow),
        deny: new PermissionsBitField(deny),
      });
      const view = PermissionFlagsBits.ViewChannel;
      const cachedMembers = new Map<string, unknown>();
      const fetched: string[] = [];
      /** Members Discord has but the cache does not: Brock with the member role. */
      const known = new Map([['brock', ['m']]]);
      const guild = {
        id: guildId,
        roles: {
          cache: new Map([
            [guildId, role(guildId, 0n)],
            ['m', role('m', view)],
          ]),
        },
        members: {
          cache: cachedMembers,
          fetch: ({ user }: { user: string }) => {
            fetched.push(user);
            const roles = known.get(user);
            if (roles === undefined) return Promise.reject(new Error('Discord is away'));
            const member = { id: user, roles: { cache: new Map(roles.map((id) => [id, {}])) } };
            cachedMembers.set(user, member);
            return Promise.resolve(member);
          },
        },
      };
      const channel = (id: string, overwrites: ReturnType<typeof overwrite>[]) => ({
        id,
        guild,
        isDMBased: () => false,
        isThread: () => false,
        permissionOverwrites: { cache: new Map(overwrites.map((one) => [one.id, one])) },
      });
      const general = channel('general', []);
      const modsForum = channel('mods-forum', [overwrite('m', 0n, view)]);
      const channels = new Map<string, unknown>([
        ['general', general],
        ['open-forum', channel('open-forum', [])],
        ['mods-forum', modsForum],
        [
          'post',
          { id: 'post', guild, isDMBased: () => false, isThread: () => true, parent: general },
        ],
        [
          'mods-post',
          {
            id: 'mods-post',
            guild,
            isDMBased: () => false,
            isThread: () => true,
            parent: modsForum,
          },
        ],
        [
          'brocks-room',
          channel('brocks-room', [
            overwrite(guildId, 0n, view),
            overwrite('brock', view, 0n, OverwriteType.Member),
            overwrite('misty', view, 0n, OverwriteType.Member),
          ]),
        ],
      ]);
      const gateway = new DiscordPartyGateway();
      gateway.use({ channels: { cache: channels }, user: { id: 'bot' } } as unknown as Client);
      const kept = async (share: string, ...regions: string[]) => {
        const found = await gateway.shareKeeps(share, regions);
        return found === undefined ? undefined : [...found].sort();
      };
      // A gated server: everyone sees nothing, the member role sees what is not kept from it.
      expect(await kept('general', 'open-forum', 'mods-forum')).toEqual(['open-forum']);
      // A post is judged by the channel it is in; its own forum has the same audience (R2).
      expect(await kept('post', 'open-forum', 'mods-forum')).toEqual(['open-forum']);
      expect(await kept('mods-post', 'mods-forum')).toEqual(['mods-forum']);
      // A region the cache does not have is not known to be safe.
      expect(await kept('general', 'gone')).toEqual([]);
      // A share channel the cache does not have: nothing can be said (R3).
      expect(await kept('unknown', 'open-forum')).toBeUndefined();
      // Members let in by name and not cached are fetched (R2): Brock has the member role and
      // sees the open forum; Misty cannot be fetched, so nothing is kept for her channel.
      expect(await kept('brocks-room', 'open-forum')).toEqual([]);
      expect(fetched.sort()).toEqual(['brock', 'misty']);
      known.set('misty', ['m']);
      expect(await kept('brocks-room', 'open-forum', 'mods-forum')).toEqual(['open-forum']);
    });

    it('asks Discord afresh of the members a share channel names, each answer kept a minute (8H5-4)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.UTC(2026, 10, 5, 17));
      try {
        const guildId = 'g';
        const view = PermissionFlagsBits.ViewChannel;
        const overwrite = (id: string, allow: bigint, deny: bigint, type = OverwriteType.Role) => ({
          id,
          type,
          allow: new PermissionsBitField(allow),
          deny: new PermissionsBitField(deny),
        });
        const asked: Array<{ user: string; force: boolean | undefined }> = [];
        const member = (id: string, roles: string[]) => ({
          id,
          roles: { cache: new Map(roles.map((role) => [role, {}])) },
        });
        const unknownMember = () => {
          const code = RESTJSONErrorCodes.UnknownMember;
          return new DiscordAPIError(
            { code, message: 'Unknown Member' },
            code,
            404,
            'GET',
            '/',
            {},
          );
        };
        const guild = {
          id: guildId,
          roles: {
            cache: new Map([
              [guildId, { id: guildId, permissions: new PermissionsBitField(view) }],
            ]),
          },
          members: {
            // The cache has Brock as his last interaction left him, before he was muted.
            cache: new Map([['brock', member('brock', [])]]),
            fetch: ({ user, force }: { user: string; force?: boolean }) => {
              asked.push({ user, force });
              return user === 'brock'
                ? Promise.resolve(member('brock', ['muted']))
                : Promise.reject(unknownMember());
            },
          },
        };
        const channel = (id: string, overwrites: ReturnType<typeof overwrite>[]) => ({
          id,
          guild,
          isDMBased: () => false,
          isThread: () => false,
          permissionOverwrites: { cache: new Map(overwrites.map((one) => [one.id, one])) },
        });
        const gateway = new DiscordPartyGateway();
        gateway.use({
          channels: {
            cache: new Map<string, unknown>([
              [
                'room',
                channel('room', [
                  overwrite(guildId, 0n, view),
                  overwrite('brock', view, 0n, OverwriteType.Member),
                  overwrite('gone', view, 0n, OverwriteType.Member),
                ]),
              ],
              ['forum', channel('forum', [overwrite('muted', 0n, view)])],
            ]),
          },
          user: { id: 'bot' },
        } as unknown as Client);
        const kept = async () => [...((await gateway.shareKeeps('room', ['forum'])) ?? [])];
        // Brock is muted now: Discord says so, whatever the cache says.
        expect(await kept()).toEqual([]);
        // Those the cache lacks first.
        expect(asked).toEqual([
          { user: 'gone', force: true },
          { user: 'brock', force: true },
        ]);
        // Within the minute nobody is asked again, the one no longer in the server neither.
        vi.setSystemTime(Date.now() + 59_000);
        expect(await kept()).toEqual([]);
        expect(asked).toHaveLength(2);
        vi.setSystemTime(Date.now() + 2_000);
        await kept();
        expect(asked.map((one) => one.user)).toEqual(['gone', 'brock', 'gone', 'brock']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('fetches at most ten members named on the share channel, and keeps nothing past them (R2)', async () => {
      const guildId = 'g';
      const view = PermissionFlagsBits.ViewChannel;
      const fetched: string[] = [];
      const guild = {
        id: guildId,
        roles: {
          cache: new Map([[guildId, { id: guildId, permissions: new PermissionsBitField(view) }]]),
        },
        members: {
          cache: new Map(),
          fetch: ({ user }: { user: string }) => {
            fetched.push(user);
            return Promise.resolve({ id: user, roles: { cache: new Map() } });
          },
        },
      };
      const overwrites = [
        {
          id: guildId,
          type: OverwriteType.Role,
          allow: new PermissionsBitField(0n),
          deny: new PermissionsBitField(view),
        },
        ...Array.from({ length: 11 }, (_, n) => ({
          id: `member${String(n)}`,
          type: OverwriteType.Member,
          allow: new PermissionsBitField(view),
          deny: new PermissionsBitField(0n),
        })),
      ];
      const room = {
        id: 'room',
        guild,
        isDMBased: () => false,
        isThread: () => false,
        permissionOverwrites: { cache: new Map(overwrites.map((one) => [one.id, one])) },
      };
      const forum = { ...room, id: 'forum', permissionOverwrites: { cache: new Map() } };
      const gateway = new DiscordPartyGateway();
      gateway.use({
        channels: {
          cache: new Map<string, unknown>([
            ['room', room],
            ['forum', forum],
          ]),
        },
        user: { id: 'bot' },
      } as unknown as Client);
      expect([...((await gateway.shareKeeps('room', ['forum'])) ?? [])]).toEqual([]);
      expect(fetched).toHaveLength(10);
    });

    it('may share where it may view and send, Send Messages in Threads in a post, no Embed Links asked, never in an ended post (P2)', () => {
      const me = {};
      const has = (bits: bigint, thread = false, ended = false) => ({
        isDMBased: () => false,
        isThread: () => thread,
        ...(thread ? { archived: ended, locked: ended } : {}),
        guild: { members: { me } },
        permissionsFor: (member: unknown) => (member === me ? new PermissionsBitField(bits) : null),
      });
      const P = PermissionFlagsBits;
      const channels = new Map<string, unknown>([
        ['text', has(P.ViewChannel | P.SendMessages)],
        ['mute', has(P.ViewChannel | P.EmbedLinks)],
        ['post', has(P.ViewChannel | P.SendMessagesInThreads, true)],
        ['closed-post', has(P.ViewChannel | P.SendMessages, true)],
        ['ended-post', has(P.ViewChannel | P.SendMessagesInThreads, true, true)],
      ]);
      const gateway = new DiscordPartyGateway();
      gateway.use({ channels: { cache: channels }, user: { id: 'bot' } } as unknown as Client);
      expect(gateway.mayShare('text')).toBe(true);
      expect(gateway.mayShare('mute')).toBe(false);
      expect(gateway.mayShare('post')).toBe(true);
      expect(gateway.mayShare('closed-post')).toBe(false);
      // An ended post (archived and locked) refuses a message, and is never opened for a share.
      expect(gateway.mayShare('ended-post')).toBe(false);
      // Not in the cache: the send decides.
      expect(gateway.mayShare('unknown')).toBe(true);
    });

    // Re-review RR-4: only a role that can see the forum and cannot write in its posts.
    it('names no role that cannot see the forum at all', async () => {
      const everyone = { id: 'g', name: '@everyone' };
      const member = { id: 'm', name: 'Member' };
      const forum = {
        type: ChannelType.GuildForum,
        guild: {
          roles: {
            everyone,
            cache: new Map([
              ['g', everyone],
              ['m', member],
            ]),
          },
        },
        permissionsFor: (role: { id: string }) =>
          new PermissionsBitField(role.id === 'm' ? PermissionFlagsBits.ViewChannel : 0n),
      };
      const gateway = new DiscordPartyGateway();
      gateway.use({
        channels: { fetch: () => Promise.resolve(forum) },
        user: { id: 'bot' },
      } as unknown as Client);
      await expect(gateway.rolesWithoutReplies('f', ['m'])).resolves.toEqual(['Member']);
    });

    it('lists the bot’s archived posts of a forum page by page, newest first', async () => {
      const asked: string[] = [];
      const page = (ids: string[], hasMore: boolean) => ({
        threads: new Map(
          ids.map((id) => [
            id,
            {
              id,
              ownerId: id.startsWith('m') ? 'member' : 'bot',
              archiveTimestamp: Number(id.slice(1)),
            },
          ]),
        ),
        hasMore,
      });
      const forum = {
        type: ChannelType.GuildForum,
        threads: {
          fetchArchived: (options: { before?: number; limit: number }) => {
            asked.push(JSON.stringify(options));
            return Promise.resolve(
              options.before === undefined ? page(['b9', 'm8', 'b7'], true) : page(['b3'], false),
            );
          },
        },
      };
      const gateway = new DiscordPartyGateway();
      gateway.use({
        channels: { fetch: () => Promise.resolve(forum) },
        user: { id: 'bot' },
      } as unknown as Client);
      await expect(gateway.archivedPosts('f')).resolves.toEqual(['b9', 'b7', 'b3']);
      expect(asked).toEqual([
        JSON.stringify({ type: 'public', limit: 100 }),
        JSON.stringify({ type: 'public', limit: 100, before: 7 }),
      ]);
    });
  });
});
