import { describe, expect, it } from 'vitest';
import { REMOTE_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { buttonsOf, thumbnailOf } from '../../test/support/messages.js';
import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { PartyStatus } from '../domain/party/status.js';
import { ApplicationEmoji } from './application-emoji.js';
import { EMOJI_RENDER_GAP_MS } from './party-service.js';

/** Timers that run only when a test fires them. */
function handTimers() {
  const set: { run: () => void; ms: number; cancelled: boolean; fired: boolean }[] = [];
  return {
    set,
    setTimer: (run: () => void, ms: number) => {
      const timer = { run, ms, cancelled: false, fired: false };
      set.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    /** The emoji timers that wait: neither fired nor cancelled. */
    waiting: () => set.filter((t) => t.ms === EMOJI_RENDER_GAP_MS && !t.cancelled && !t.fired),
  };
}

/** Fifty meetups with their posts, over hand timers and an application emoji list. */
async function fiftyMeetups() {
  const app = new Map<string, string>();
  const timers = handTimers();
  const made = await partyServiceWith([], {
    appEmoji: { get: (name) => app.get(name) },
    setTimer: timers.setTimer,
  });
  const postIds: string[] = [];
  for (let n = 0; n < 50; n++) {
    const outcome = await made.service.createMeetup({
      name: `Picnic ${n}`,
      creatorId: `2000000000000${String(n).padStart(5, '0')}`,
      regionChannelId: WEST_CHANNEL,
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    postIds.push(outcome.party.forumPostId ?? '');
  }
  await made.service.flush();
  const edited = () => postIds.filter((id) => (made.gateway.posts.get(id)?.edits ?? 0) > 0);
  expect(edited()).toEqual([]);
  app.set('teamless', '<:teamless:1>');
  return { ...made, timers, postIds, edited };
}

describe('PartyService: the emoji of a post', () => {
  it('takes the application’s emoji first, then the server’s, then plain characters', async () => {
    const app = new Map([
      ['valor', '<:valor:1>'],
      ['rock', '<:rock:2>'],
      ['pineshiny', '<:pineshiny:3>'],
    ]);
    const made = await reportedRaid({}, { appEmoji: { get: (name) => app.get(name) } });
    made.gateway.emojis.set('valor', '<:valor:90>');
    made.gateway.emojis.set('mystic', '<:mystic:91>');
    made.gateway.emojis.set('ice', '<:ice:92>');
    const { emoji } = made.service.view(made.current());
    expect(emoji.teams).toEqual({ instinct: '⚡', mystic: '<:mystic:91>', valor: '<:valor:1>' });
    expect(emoji.teamless).toBeUndefined();
    expect(emoji.icon?.('rock')).toBe('<:rock:2>');
    expect(emoji.icon?.('ice')).toBe('<:ice:92>');
    expect(emoji.icon?.('fairy')).toBeUndefined();
    expect(emoji.remote).toBe('🛰️');
  });

  it('shows every active post anew when the emoji of the application change', async () => {
    const app = new Map<string, string>();
    const made = await reportedRaid({}, { appEmoji: { get: (name) => app.get(name) } });
    await made.attendance.signUp(
      made.party.id,
      { id: '200000000000000002', name: 'Alice', team: 'valor' },
      PartyStatus.Coming,
    );
    await made.service.flush();
    const shown = () => JSON.stringify(made.gateway.posts.get(made.postId)?.message);
    expect(shown()).toContain('🔥');
    const edits = made.gateway.posts.get(made.postId)?.edits ?? 0;
    app.set('valor', '<:valor:1>');
    made.service.emojiChanged();
    await made.service.flush();
    expect(shown()).toContain('<:valor:1>');
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(edits + 1);
    // Nothing changed for the post: no edit.
    made.service.emojiChanged();
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(edits + 1);
  });

  it("puts the application's legacy Pine icons on the buttons by id, never a server's", async () => {
    const app = new Map([
      ['pinejoin', '<:pinejoin:1400000000000000001>'],
      ['pineleave', '<a:pineleave:1400000000000000002>'],
    ]);
    const made = await reportedRaid({}, { appEmoji: { get: (name) => app.get(name) } });
    // A server that uploaded one for the legacy bot: its cache may be stale, and a button with
    // an emoji Discord does not know (or the bot may not use) has the whole post refused.
    made.gateway.emojis.set('pinehere', '<:pinehere:1400000000000000090>');
    made.service.changed(made.party.id);
    await made.service.flush();
    const emoji = (action: string) =>
      buttonsOf(made.gateway.posts.get(made.postId)?.message)
        .filter((button) => button.customId?.endsWith(`:${action}`))
        .map((button) => button.emoji);
    // Shown by the fake gateway, which refuses a button's emoji as message text.
    expect(emoji('join')).toEqual(['pinejoin']);
    expect(emoji('here')).toEqual(['✅']);
    // In text a server's emoji still shows (`:pinehere:` at worst).
    expect(made.service.view(made.current()).emoji.icon?.('pinehere')).toBe(
      '<:pinehere:1400000000000000090>',
    );
    expect(emoji('leave')).toEqual(['pineleave']);
    expect(emoji('done')).toEqual(['🎉']);
    expect(emoji('maybe')).toEqual(['🤔']);
    const message = JSON.stringify(made.gateway.posts.get(made.postId)?.message);
    expect(message).toContain('{"id":"1400000000000000001","name":"pinejoin"}');
    expect(message).toContain('{"id":"1400000000000000002","name":"pineleave","animated":true}');
  });

  describe('when Discord refuses a custom emoji of a button (deleted, or not known yet)', () => {
    const app = new Map([['pinejoin', '<:pinejoin:1400000000000000001>']]);
    const appEmoji = { get: (name: string) => app.get(name) };
    const joins = (message: Parameters<typeof buttonsOf>[0]) =>
      buttonsOf(message)
        .filter((button) => button.customId?.endsWith(':join'))
        .map((button) => button.emoji);

    it('edits the post with the plain emoji instead of failing', async () => {
      const made = await reportedRaid({}, { appEmoji });
      expect(joins(made.gateway.posts.get(made.postId)?.message)).toEqual(['pinejoin']);
      const edits = made.gateway.posts.get(made.postId)?.edits ?? 0;
      made.gateway.rejectCustomEmoji = true;
      await made.attendance.signUp(
        made.party.id,
        { id: '200000000000000002', name: 'Alice' },
        PartyStatus.Coming,
      );
      await made.service.flush();
      const post = made.gateway.posts.get(made.postId);
      expect(post?.edits).toBe(edits + 1);
      expect(joins(post?.message)).toEqual(['🏃']);
      expect(JSON.stringify(post?.message)).toContain('Alice');
    });

    /** The calls of a kind since `from`. */
    const callsSince = (made: { gateway: { calls: string[] } }, from: number, method: string) =>
      made.gateway.calls.slice(from).filter((call) => call.startsWith(`${method} `));
    const warnings = (made: { entries: Record<string, unknown>[] }) =>
      made.entries.filter((entry) => entry.level === 40).map((entry) => entry.msg);
    const signUpAlice = async (made: Awaited<ReturnType<typeof reportedRaid>>) => {
      await made.attendance.signUp(
        made.party.id,
        { id: '200000000000000002', name: 'Alice' },
        PartyStatus.Coming,
      );
      await made.service.flush();
    };

    it('tells the application emoji of each emoji Discord refuses, and of no picture', async () => {
      let refused = 0;
      const told = {
        get: appEmoji.get,
        refused: () => {
          refused++;
        },
      };
      const made = await reportedRaid({ boss: { key: 'yveltal' } }, { appEmoji: told });
      made.gateway.rejectThumbnails = true;
      await signUpAlice(made);
      expect(refused).toBe(0);
      made.gateway.rejectThumbnails = false;
      made.gateway.rejectCustomEmoji = true;
      made.gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
      await made.attendance.signUp(
        made.party.id,
        { id: '200000000000000004', name: 'Bob' },
        PartyStatus.Coming,
      );
      await made.service.flush();
      // The post's edit and the copy's send.
      expect(refused).toBe(2);
    });

    it('shows the posts with the emoji still there once a deleted one is read anew', async () => {
      const { log, entries: appLog } = createTestLogger();
      const found = new Map([
        ['pinejoin', '<:pinejoin:1400000000000000001>'],
        ['pinehere', '<:pinehere:1400000000000000002>'],
      ]);
      let read: Promise<unknown> = Promise.resolve();
      const application = new ApplicationEmoji(
        {
          list: () => {
            const list = Promise.resolve(new Map(found));
            read = list;
            return list;
          },
        },
        log,
        () => 0,
      );
      await application.refresh();
      const made = await reportedRaid({ boss: { key: 'yveltal' } }, { appEmoji: application });
      application.onChange(() => {
        made.service.emojiChanged();
      });
      const emojiOf = (action: string) =>
        buttonsOf(made.gateway.posts.get(made.postId)?.message)
          .filter((button) => button.customId?.endsWith(`:${action}`))
          .map((button) => button.emoji);
      expect(emojiOf('join')).toEqual(['pinejoin']);
      expect(emojiOf('here')).toEqual(['pinehere']);
      // Deleted from the application while the bot runs.
      found.delete('pinejoin');
      made.gateway.deletedEmojiIds.add('1400000000000000001');
      const from = made.gateway.calls.length;
      await signUpAlice(made);
      await read;
      await made.service.flush();
      expect(emojiOf('join')).toEqual(['🏃']);
      expect(emojiOf('here')).toEqual(['pinehere']);
      expect(thumbnailOf(made.gateway.posts.get(made.postId)?.message)).toBeDefined();
      // Refused once; with plain emoji; shown anew with the emoji that are still there.
      expect(callsSince(made, from, 'editPost')).toHaveLength(3);
      expect(warnings(made)).toEqual([
        'Discord refused an emoji of a button; editing with plain emoji',
      ]);
      // Nothing refused any more: a change is one edit, with no warning and no second re-read.
      const before = made.gateway.calls.length;
      await made.attendance.signUp(
        made.party.id,
        { id: '200000000000000004', name: 'Bob' },
        PartyStatus.Coming,
      );
      await made.service.flush();
      expect(callsSince(made, before, 'editPost')).toEqual([`editPost ${made.postId}`]);
      expect(JSON.stringify(made.gateway.posts.get(made.postId)?.message)).toContain('Bob');
      expect(warnings(made)).toHaveLength(1);
      const rereads = appLog.filter(
        (entry) => entry.msg === 'Discord refused an emoji of the application; reading them anew',
      );
      expect(rereads).toHaveLength(1);
    });

    it('keeps the pictures of an edited post: Discord named the emoji, so only it goes', async () => {
      const made = await reportedRaid({ boss: { key: 'yveltal' } }, { appEmoji });
      const picture = thumbnailOf(made.gateway.posts.get(made.postId)?.message);
      expect(picture).toBeDefined();
      made.gateway.rejectCustomEmoji = true;
      const from = made.gateway.calls.length;
      await signUpAlice(made);
      const post = made.gateway.posts.get(made.postId);
      expect(joins(post?.message)).toEqual(['🏃']);
      expect(thumbnailOf(post?.message)).toBe(picture);
      // Refused once, then sent with the plain emoji at once.
      expect(callsSince(made, from, 'editPost')).toHaveLength(2);
      expect(warnings(made)).toEqual([
        'Discord refused an emoji of a button; editing with plain emoji',
      ]);
    });

    it('drops the pictures as well only when the post with plain emoji is refused too', async () => {
      const made = await reportedRaid({ boss: { key: 'yveltal' } }, { appEmoji });
      made.gateway.rejectCustomEmoji = true;
      made.gateway.rejectThumbnails = true;
      const from = made.gateway.calls.length;
      await signUpAlice(made);
      const post = made.gateway.posts.get(made.postId);
      expect(joins(post?.message)).toEqual(['🏃']);
      expect(thumbnailOf(post?.message)).toBeUndefined();
      expect(callsSince(made, from, 'editPost')).toHaveLength(3);
      expect(JSON.stringify(post?.message)).toContain('Alice');
    });

    it('keeps the custom emoji where Discord refused only a picture', async () => {
      const made = await reportedRaid({ boss: { key: 'yveltal' } }, { appEmoji });
      made.gateway.rejectThumbnails = true;
      const from = made.gateway.calls.length;
      await signUpAlice(made);
      const post = made.gateway.posts.get(made.postId);
      expect(thumbnailOf(post?.message)).toBeUndefined();
      expect(joins(post?.message)).toEqual(['pinejoin']);
      expect(callsSince(made, from, 'editPost')).toHaveLength(2);
      expect(warnings(made)).toEqual(['Discord refused a picture; editing without the pictures']);
    });

    it('makes a post with its picture and the plain emoji where Discord names the emoji', async () => {
      const gateway = new FakePartyGateway();
      gateway.rejectCustomEmoji = true;
      const made = await reportedRaid({ boss: { key: 'yveltal' } }, { appEmoji }, { gateway });
      const post = made.gateway.posts.get(made.postId);
      expect(joins(post?.message)).toEqual(['🏃']);
      expect(thumbnailOf(post?.message)).toBeDefined();
      expect(made.gateway.calls.filter((call) => call.startsWith('createPost '))).toHaveLength(2);
      expect(post?.edits).toBe(0);
    });

    it('makes a post without a picture with the plain emoji instead of failing', async () => {
      const made = await partyServiceWith([], { appEmoji });
      made.gateway.rejectCustomEmoji = true;
      const outcome = await made.service.createMeetup({
        name: 'Picnic',
        creatorId: '200000000000000003',
        regionChannelId: WEST_CHANNEL,
      });
      if (outcome.kind !== 'created') throw new Error(outcome.kind);
      const post = made.gateway.posts.get(outcome.party.forumPostId ?? '');
      expect(joins(post?.message)).toEqual(['🏃']);
    });

    it('sends a copy with the plain emoji instead of failing', async () => {
      const made = await reportedRaid({ boss: { key: 'yveltal' } }, { appEmoji });
      made.gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
      made.gateway.rejectCustomEmoji = true;
      made.service.changed(made.party.id);
      await made.service.flush();
      const [copy] = made.gateway.messagesIn(REMOTE_CHANNEL);
      expect(joins(copy?.message)).toEqual(['🏃']);
      // Discord named the emoji: the copy keeps its picture.
      expect(thumbnailOf(copy?.message)).toBeDefined();
    });
  });

  it('has a teamless emoji only where one of that name exists', async () => {
    const made = await reportedRaid();
    made.gateway.emojis.set('teamless', '<:teamless:93>');
    expect(made.service.view(made.current()).emoji.teamless).toBe('<:teamless:93>');
  });

  it('shows the posts anew one at a time, a quarter of a second apart, never all at once', async () => {
    const made = await fiftyMeetups();
    made.service.emojiChanged();
    // One post now, the next when its timer comes.
    expect(made.timers.waiting()).toHaveLength(1);
    let fired = 0;
    for (let next = made.timers.waiting()[0]; next; next = made.timers.waiting()[0]) {
      next.fired = true;
      next.run();
      fired++;
    }
    expect(fired).toBe(49);
    await made.service.flush();
    expect(made.edited()).toEqual(made.postIds);
    expect(JSON.stringify(made.gateway.posts.get(made.postIds[49] ?? '')?.message)).toContain(
      '<:teamless:1>',
    );
  });

  it('takes turns between servers when it shows the posts anew (plan 19B-5)', async () => {
    const made = await fiftyMeetups();
    // The last five meetups are another server's (the Guild row 2).
    const away = made.postIds.slice(45);
    for (const party of made.store.active()) {
      if (!away.includes(party.forumPostId ?? '')) continue;
      await made.store.update(party.id, (current) => ({ party: { ...current, guildId: 2 } }));
    }
    made.service.emojiChanged();
    for (let next = made.timers.waiting()[0]; next; next = made.timers.waiting()[0]) {
      next.fired = true;
      next.run();
    }
    await made.service.flush();
    const order = [
      ...new Set(
        made.gateway.calls
          .filter((call) => call.startsWith('editPost '))
          .map((call) => call.slice('editPost '.length)),
      ),
    ];
    expect(order).toHaveLength(50);
    // One of each server in turn while both have posts waiting: the other server's five do not
    // wait behind the first one's forty-five.
    const side = (id: string | undefined) => (away.includes(id ?? '') ? 'away' : 'home');
    for (let turn = 0; turn < 5; turn++) {
      expect(new Set([side(order[2 * turn]), side(order[2 * turn + 1])])).toEqual(
        new Set(['home', 'away']),
      );
    }
  });

  it('stops showing posts anew at a flush: what waited is left as it is', async () => {
    const made = await fiftyMeetups();
    made.service.emojiChanged();
    await made.service.flush();
    expect(made.edited()).toHaveLength(1);
    expect(made.timers.waiting()).toEqual([]);
  });

  it('shows nothing anew once closed for shutdown', async () => {
    const made = await fiftyMeetups();
    await made.service.close();
    made.service.emojiChanged();
    expect(made.timers.set.filter((t) => t.ms === EMOJI_RENDER_GAP_MS)).toEqual([]);
    await made.service.flush();
    expect(made.edited()).toEqual([]);
  });
});
