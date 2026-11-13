import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, PARTY_NOW, REPORTER, at } from '../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  reportedMax,
  reportedRaid,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import {
  partyWebWith,
  webServerWith,
  type TestWeb,
  type WebTestOptions,
} from '../../test/support/web.js';
import type { GymProvider } from '../services/gym-directory.js';
import type {
  PartiesView,
  PostButtonView,
  PostLine,
  PostNode,
  PostView,
  PostViewBlock,
} from '../domain/web/party-data.js';
import { PartyStatus } from '../domain/party/status.js';
import { linkableOnTheMap, type PartyWebDeps } from './party-routes.js';
import { BARRED_FRESH_MS } from './party-viewers.js';

const PARTIES = `/s/${FAKE_GUILD_ID}/api/parties`;
const postOf = (id: string, key: string | null | undefined) =>
  `${PARTIES}/${encodeURIComponent(id)}/post?k=${key ?? ''}`;

type Made = Parameters<typeof partyWebWith>[0];

/** A web server over a test's parties, Alice a member of the server, on the parties' clock. */
function onTheMap(
  made: Made,
  overrides: Partial<PartyWebDeps> = {},
  options: WebTestOptions = {},
): TestWeb {
  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
  const web = webServerWith({
    members,
    parties: { ...partyWebWith(made), ...overrides },
    ...options,
  });
  web.clock.now = PARTY_NOW;
  return web;
}

/** The words a reader sees of nodes, emoji by name, times by their moment. */
function shown(nodes: readonly PostNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
        case 'code':
          return node.text;
        case 'emoji':
          return `:${node.name}:`;
        case 'time':
          return `[${node.style}]`;
        default:
          return shown(node.children);
      }
    })
    .join('');
}

/** A text block's lines as words. */
const lines = (block: PostViewBlock | undefined): string[] =>
  block?.type === 'text' ? block.lines.map((line: PostLine) => shown(line.nodes)) : [];

/** The text blocks of a role. */
const ofRole = (view: PostView, role: string) =>
  view.blocks.filter((block) => block.type === 'text' && block.role === role);

/** Every button of a view, row by row. */
const buttons = (view: PostView): PostButtonView[] =>
  view.blocks.flatMap((block) => (block.type === 'controls' ? block.rows.flat() : []));

/** Every link node of a view. */
function links(view: PostView): Array<{ href: string; text: string }> {
  const found: Array<{ href: string; text: string }> = [];
  const visit = (nodes: readonly PostNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'link') found.push({ href: node.href, text: shown(node.children) });
      if ('children' in node) visit(node.children);
    }
  };
  for (const block of view.blocks) {
    if (block.type === 'text') for (const line of block.lines) visit(line.nodes);
  }
  return found;
}

/** The key of a party in Alice's list, then its post as she gets it. */
async function postFor(
  web: TestWeb,
  kind: keyof Omit<PartiesView, 'zone' | 'readOnly'>,
  id: string,
) {
  const cookie = await web.loggedIn(ALICE, 'Alice');
  const list = (await web.app.inject({ url: PARTIES, headers: { cookie } })).json<PartiesView>();
  const party = (list[kind] as Array<{ id: string; postKey: string | null }>).find(
    (one) => one.id === id,
  );
  const answer = await web.app.inject({ url: postOf(id, party?.postKey), headers: { cookie } });
  return { key: party?.postKey, answer, view: answer.json<PostView>(), cookie };
}

describe('linkableOnTheMap', () => {
  const PUBLIC = 'https://map.example.test';
  it('links Google Maps, this server on Discord and Pine’s pages, by https alone', () => {
    const linkable = (url: string) => linkableOnTheMap(url, FAKE_GUILD_ID, PUBLIC);
    expect(linkable('https://www.google.com/maps/search/?api=1&query=1%2C2')).toBe(true);
    expect(linkable(`https://discord.com/channels/${FAKE_GUILD_ID}/123`)).toBe(true);
    expect(linkable(`${PUBLIC}/s/${FAKE_GUILD_ID}/map`)).toBe(true);
    expect(linkable('http://www.google.com/maps/x')).toBe(false);
    expect(linkable('https://www.google.com/search?q=x')).toBe(false);
    expect(linkable('https://discord.com/channels/999999999999999999/123')).toBe(false);
    expect(linkable('https://user@www.google.com/maps/x')).toBe(false);
    expect(linkable('https://www.google.com:8443/maps/x')).toBe(false);
    expect(linkable('javascript:alert(1)')).toBe(false);
    expect(linkable('https://evil.example/maps')).toBe(false);
    expect(linkableOnTheMap('http://localhost:8787/s/1/map', '1', 'http://localhost:8787')).toBe(
      true,
    );
  });

  it('links Pine’s own pages only under this server’s addresses, never a login link (plan 8Z-2)', () => {
    const linkable = (url: string) => linkableOnTheMap(url, FAKE_GUILD_ID, PUBLIC);
    expect(linkable(`${PUBLIC}/s/${FAKE_GUILD_ID}/history`)).toBe(true);
    expect(linkable(`${PUBLIC}/auth/link/${FAKE_GUILD_ID}/${'A'.repeat(43)}`)).toBe(false);
    expect(linkable(`${PUBLIC}/auth/link/x`)).toBe(false);
    expect(linkable(`${PUBLIC}/s/999999999999999999/map`)).toBe(false);
    expect(linkable(`${PUBLIC}/`)).toBe(false);
    expect(linkable(`${PUBLIC}/s/${FAKE_GUILD_ID}/../../auth/link/x`)).toBe(false);
  });
});

describe('a party’s post on the map (plan 8M-8A)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('is the raid’s post as Discord shows it, names and all, kept by its key', async () => {
    const made = await reportedRaid({ reporter: { name: 'Rhea' } });
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.service.flush();
    web = onTheMap(made);
    const { key, answer, view } = await postFor(web, 'raids', made.party.id);
    expect(key).toMatch(/^[0-9a-f]{16}$/u);
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, max-age=86400');
    expect(view.key).toBe(key);
    expect(view.accent).toBe('egg');
    expect(lines(ofRole(view, 'head')[0])[0]).toBe('Level 5 raid (egg)');
    const head = ofRole(view, 'head')[0];
    expect(head?.type === 'text' && head.lines[0]?.style).toBe('heading');
    expect(lines(ofRole(view, 'where')[0])[0]).toBe('Where');
    expect(lines(ofRole(view, 'trainers')[0]).join('\n')).toContain('Bob');
    expect(lines(ofRole(view, 'note')[0])).toEqual(['Reported by Rhea']);
    expect(links(view).map((link) => link.text)).toEqual(['Map']);
    expect(links(view)[0]?.href).toMatch(/^https:\/\/www\.google\.com\/maps\//u);
    expect(buttons(view).map((button) => button.does.kind)).toContain('press');
    // Nothing of Discord's controls or members' ids reaches the page.
    expect(answer.body).not.toContain(`party:${made.party.id}`);
    expect(answer.body).not.toContain(BOB);
  });

  it('shows an egg its post carries as a file by Pine’s own egg picture (review 8A-15)', async () => {
    const made = await reportedRaid();
    web = onTheMap(made);
    const { view } = await postFor(web, 'raids', made.party.id);
    expect(ofRole(view, 'head')[0]).toMatchObject({
      beside: { kind: 'picture', src: expect.stringMatching(/^\/eggs\/[\w-]+\.png$/u) as unknown },
    });
  });

  it('answers the post as it is now, not kept, when the key is another', async () => {
    const made = await reportedRaid();
    web = onTheMap(made);
    const cookie = await web.loggedIn(ALICE, 'Alice');
    const answer = await web.app.inject({ url: postOf(made.party.id, 'old'), headers: { cookie } });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    expect(answer.json<PostView>().key).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('is for members only, and of a party they may see on the map', async () => {
    const made = await reportedRaid();
    web = onTheMap(made);
    const url = postOf(made.party.id, 'x');
    expect((await web.app.inject({ url })).statusCode).toBe(401);
    const stranger = await web.loggedIn(BOB, 'Bob');
    expect((await web.app.inject({ url, headers: { cookie: stranger } })).statusCode).toBe(403);
    const cookie = await web.loggedIn(ALICE, 'Alice');
    const unknown = await web.app.inject({
      url: postOf('no-such-party', 'x'),
      headers: { cookie },
    });
    expect(unknown.statusCode).toBe(404);
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await web.app.inject({ url, headers: { cookie } })).statusCode).toBe(404);
  });

  it('is none for a party whose post was not shown since the start', async () => {
    const made = await reportedRaid();
    web = onTheMap(made, { layoutOf: () => undefined });
    const { key, answer } = await postFor(web, 'raids', made.party.id);
    expect(key).toBeNull();
    expect(answer.statusCode).toBe(404);
  });

  it('shows a hatched raid from a screenshot with its guessed times and the screenshot’s note', async () => {
    const made = await reportedRaid({
      boss: { key: 'yveltal' },
      time: { end: at('2026-10-13T14:40') },
      screenshot: { id: 'abcdefghijkl', timeUncertain: true },
    });
    web = onTheMap(made);
    const { view } = await postFor(web, 'raids', made.party.id);
    expect(view.accent).toBe('hatched');
    const head = ofRole(view, 'head')[0];
    expect(lines(head)[0]).toMatch(/^Level 5 raid against Yveltal/u);
    expect(head?.type === 'text' && head.lines.flatMap((line) => line.nodes)).toContainEqual({
      kind: 'code',
      text: '/hatch',
    });
    expect(buttons(view).map((button) => button.does)).toContainEqual({ kind: 'screenshot' });
  });

  it('shows a max battle’s post', async () => {
    const made = await reportedMax();
    web = onTheMap(made);
    const { view } = await postFor(web, 'maxes', made.party.id);
    expect(view.accent).toBe('max');
    expect(lines(ofRole(view, 'head')[0])[0]).toBe('Dynamax Machamp (2★)');
    expect(lines(ofRole(view, 'where')[0])[1]).toMatch(/\(Power Spot\)/u);
  });

  it('shows a train with its route ahead, and the post it was split off from by name', async () => {
    const made = await createdTrain({ route: [1, 2, 3, 4, 5] });
    const other = await made.service.createTrain({
      name: 'Evening run',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
    });
    if (other.kind !== 'created') throw new Error(other.kind);
    await made.store.update(made.party.id, (party) =>
      party.type === 'train'
        ? {
            party: {
              ...party,
              train: {
                ...party.train,
                splitFrom: { partyId: other.party.id, postId: other.party.forumPostId ?? '' },
              },
            },
          }
        : {},
    );
    made.service.changed(made.party.id);
    await made.service.flush();
    web = onTheMap(made);
    const { view } = await postFor(web, 'trains', made.party.id);
    expect(view.accent).toBe('timed');
    const where = ofRole(view, 'where').map((block) => lines(block)[0]);
    expect(where).toEqual(['Where · stop 1 of 5', expect.stringMatching(/^Next: 2\. /u)]);
    expect(links(view)).toContainEqual({
      href: `https://discord.com/channels/${FAKE_GUILD_ID}/${other.party.forumPostId ?? ''}`,
      text: 'Train · Evening run',
    });
    expect(buttons(view).find((button) => button.label === 'Move…')?.does).toEqual({
      kind: 'panel',
      panel: 'moves',
    });
  });

  it('names another post in a forum the member is kept out of as another post, kept 5 minutes (review 8A-5)', async () => {
    const made = await createdTrain();
    const other = await made.service.createTrain({
      name: 'East run',
      creatorId: REPORTER,
      regionChannelId: EAST_CHANNEL,
    });
    if (other.kind !== 'created') throw new Error(other.kind);
    const otherPost = other.party.forumPostId ?? '';
    await made.store.update(made.party.id, (party) =>
      party.type === 'train'
        ? {
            party: {
              ...party,
              train: { ...party.train, splitFrom: { partyId: other.party.id, postId: otherPost } },
            },
          }
        : {},
    );
    made.service.changed(made.party.id);
    await made.service.flush();
    made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    web = onTheMap(made);
    const { view, answer } = await postFor(web, 'trains', made.party.id);
    expect(links(view)).toContainEqual({
      href: `https://discord.com/channels/${FAKE_GUILD_ID}/${otherPost}`,
      text: 'another post',
    });
    expect(answer.headers['cache-control']).toBe('private, max-age=300');
  });

  it('names a post the member may not see as another post', async () => {
    const made = await createdTrain();
    await made.store.update(made.party.id, (party) =>
      party.type === 'train'
        ? {
            party: {
              ...party,
              train: {
                ...party.train,
                splitFrom: {
                  partyId: '00000000-0000-4000-8000-000000000000',
                  postId: '987654321098765432',
                },
              },
            },
          }
        : {},
    );
    made.service.changed(made.party.id);
    await made.service.flush();
    web = onTheMap(made);
    const { view } = await postFor(web, 'trains', made.party.id);
    expect(links(view)).toContainEqual({
      href: `https://discord.com/channels/${FAKE_GUILD_ID}/987654321098765432`,
      text: 'another post',
    });
  });

  it('shows a meetup at a pin', async () => {
    const made = await createdMeetup({
      place: { kind: 'pin', lat: 40.05, lon: -80.05, near: null, linkName: 'Blue Tent' },
    });
    web = onTheMap(made);
    const { view } = await postFor(web, 'meetups', made.party.id);
    expect(view.accent).toBe('timed');
    expect(lines(ofRole(view, 'where')[0])).toEqual([
      'Where',
      expect.stringContaining('Blue Tent'),
    ]);
    expect(links(view).map((link) => link.text)).toContain('Map');
  });
});

const SERVED = '111111111111111111';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
const LIBRARY_PICTURE = 'https://lh3.googleusercontent.com/library';

describe('the pictures of a post on the map (plan 8M-8A)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('serves the application emoji by id, kept for good, and nothing else', async () => {
    const made = await reportedRaid();
    web = onTheMap(
      made,
      {},
      {
        emoji: {
          address: (id) => (id === SERVED ? `/emoji/${id}.png` : undefined),
          read: (id) =>
            Promise.resolve(id === SERVED ? { bytes: PNG, type: 'image/png' } : undefined),
        },
      },
    );
    const answer = await web.app.inject({ url: `/emoji/${SERVED}.png` });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toBe('image/png');
    expect(answer.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(answer.rawPayload).toEqual(PNG);
    expect((await web.app.inject({ url: '/emoji/222222222222222222.png' })).statusCode).toBe(404);
    expect((await web.app.inject({ url: `/emoji/${SERVED}.gif` })).statusCode).toBe(404);
    expect((await web.app.inject({ url: '/emoji/..%2Fsecret.png' })).statusCode).toBe(404);
  });

  it('names the application emoji of a post’s buttons and lines by Pine’s address', async () => {
    const made = await reportedRaid(
      {},
      { appEmoji: { get: (name) => (name === 'pinejoin' ? `<:pinejoin:${SERVED}>` : undefined) } },
    );
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.service.flush();
    web = onTheMap(
      made,
      {},
      {
        emoji: {
          address: (id) => (id === SERVED ? `/emoji/${id}.png` : undefined),
          read: () => Promise.resolve(undefined),
        },
      },
    );
    const { view } = await postFor(web, 'raids', made.party.id);
    expect(buttons(view).find((button) => button.name === 'Coming')?.emoji).toEqual({
      name: 'pinejoin',
      src: `/emoji/${SERVED}.png`,
    });
    const trainers = ofRole(view, 'trainers')[0];
    expect(
      trainers?.type === 'text' && trainers.lines.flatMap((line) => line.nodes),
    ).toContainEqual({
      kind: 'emoji',
      name: 'pinejoin',
      src: `/emoji/${SERVED}.png`,
    });
  });

  it('puts the gym’s picture beside Where by Pine’s address, for members who see the post', async () => {
    const base = gymsFixture();
    const gyms = Object.assign(Object.create(base) as GymProvider, {
      stored: (id: number) => {
        const gym = base.stored(id);
        return gym && id === 1 ? { ...gym, imageUrl: LIBRARY_PICTURE } : gym;
      },
    });
    const made = await reportedRaid({}, { gyms });
    const asked: string[] = [];
    web = onTheMap(made, {
      places: {
        keyOf: (url) => (url === `${LIBRARY_PICTURE}=s400` ? 'gym/1' : undefined),
        read: (kind, id) => {
          asked.push(`${kind}/${id}`);
          return Promise.resolve(
            kind === 'gym' && id === '1' ? { bytes: JPEG, type: 'image/jpeg' } : undefined,
          );
        },
        urlOf: (kind, id) => (kind === 'gym' && id === '1' ? `${LIBRARY_PICTURE}=s400` : undefined),
      },
    });
    const { view, cookie } = await postFor(web, 'raids', made.party.id);
    const picture = `/s/${FAKE_GUILD_ID}/pictures/gym/1`;
    expect(ofRole(view, 'where')[0]).toMatchObject({ beside: { kind: 'picture', src: picture } });
    expect((await web.app.inject({ url: picture })).statusCode).toBe(401);
    const stranger = await web.loggedIn(BOB, 'Bob');
    expect((await web.app.inject({ url: picture, headers: { cookie: stranger } })).statusCode).toBe(
      403,
    );
    const answer = await web.app.inject({ url: picture, headers: { cookie } });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toBe('image/jpeg');
    expect(answer.headers['cache-control']).toBe('private, max-age=86400');
    expect(answer.rawPayload).toEqual(JPEG);
    // A gym no post the member sees shows: nothing is fetched for it.
    const other = await web.app.inject({
      url: `/s/${FAKE_GUILD_ID}/pictures/gym/2`,
      headers: { cookie },
    });
    expect(other.statusCode).toBe(404);
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    // What Discord said of the forum is used for a minute (`BARRED_FRESH_MS`).
    web.clock.now += BARRED_FRESH_MS;
    const barred = await web.app.inject({ url: picture, headers: { cookie } });
    expect(barred.statusCode).toBe(404);
    expect(asked).toEqual(['gym/1']);
  });
});
