import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogFields, shownDialog } from '../../test/support/dialogs.js';
import {
  FAKE_GUILD_ID,
  fakeButton,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, at, PARTY_NOW, PARTY_ZONE } from '../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  partyServiceWith,
  reportedRaid,
} from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import {
  FakeActingMembers,
  meetupWebWith,
  partyWebWith,
  raidWebWith,
  RecordingDraws,
  trainWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { meetupManageControls } from '../commands/meetups/manage.js';
import { raidManageControls } from '../commands/raids/manage.js';
import { manageControls } from '../commands/trains/move.js';
import { partyButtons } from '../components/party.js';
import { InteractionRouter } from '../discord/router.js';
import { isTrain, type Party } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { MapManage } from '../domain/web/train-data.js';
import {
  MEETUP_END_INPUT,
  MEETUP_NAME_INPUT,
  RAID_BOSS_INPUT,
  RAID_END_INPUT,
  RAID_HATCH_INPUT,
} from '../render/manage-dialogs.js';
import {
  MANAGE_AT_END_INPUT,
  MANAGE_END_INPUT,
  MANAGE_KIND_INPUT,
  MANAGE_ROUTE_INPUT,
  MANAGE_START_INPUT,
} from '../render/train-dialogs.js';
import { pageWords } from './page-words.js';

/*
 * Review M9 of manage-on-discord (Matt: Discord and the web "100% consistent"): the same input to
 * a post's Manage… on Discord and to the map's form of that kind gives the same answer (the map's
 * words being Discord's made text of the page) and the same party.
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Discord's answer as the map would say it. */
const asOnTheMap = (text: string): string => pageWords(text, PARTY_ZONE, PARTY_NOW);

/** What the party services of a test made, with the party and its post (`partyServiceWith`). */
type Made = Awaited<ReturnType<typeof partyServiceWith>> & { party: Party; postId: string };

/** One party on Discord and on the map at once, Alice signed up, on one clock. */
async function both<M extends Made>(made: M) {
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  await made.attendance.flush();
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
    timedParties: made.timed,
    trains: made.trains,
    users: made.users,
  });
  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
  const acting = new FakeActingMembers().add(ALICE, 'Alice');
  const web = webServerWith({
    members,
    parties: partyWebWith(made, {
      acting,
      throttles: ctx.throttles,
      drawn: new RecordingDraws(made.store),
    }),
    raids: raidWebWith(ctx),
    meetups: meetupWebWith(ctx),
    trains: trainWebWith(ctx),
  });
  web.clock.now = PARTY_NOW;
  const router = new InteractionRouter(
    ctx,
    [],
    [partyButtons, raidManageControls, meetupManageControls, manageControls],
  );
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const who = { userId: ALICE, displayName: 'Alice', channelId: made.postId };
  const open = async () =>
    shownDialog(await handle(fakeButton({ customId: `party:${made.party.id}:manage`, ...who })));
  const submit = async (
    dialog: ReturnType<typeof shownDialog>,
    given: {
      fields?: Record<string, string>;
      selected?: Record<string, string[]>;
      picked?: Record<string, string>;
    },
  ) => {
    const ids = new Set(dialogFields(dialog).map((field) => field.id));
    const shown = new Map(dialogFields(dialog).map((field) => [field.id, field.value ?? '']));
    const fields = Object.fromEntries(
      [...ids]
        .filter((id) => dialogFields(dialog).find((field) => field.id === id)?.kind === 'text')
        .map((id) => [id, given.fields?.[id] ?? shown.get(id) ?? '']),
    );
    const done = await handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        fields,
        ...(given.selected ? { selected: given.selected } : {}),
        ...(given.picked ? { picked: given.picked } : {}),
        ...who,
      }),
    );
    return sent(done.editReply).content ?? '';
  };
  const post = async (path: string, body: unknown) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: `/s/${FAKE_GUILD_ID}/api/${path}`,
      headers: { ...(await web.posting(ALICE, 'Alice')), 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return answer.json<{ ok: boolean; text: string }>();
  };
  const get = async <T>(path: string) => {
    const answer = await web.app.inject({
      url: `/s/${FAKE_GUILD_ID}/api/${path}`,
      headers: { cookie: await web.loggedIn(ALICE, 'Alice') },
    });
    return answer.json<T>();
  };
  return { made, web, open, submit, post, get };
}

describe('Manage… on Discord answers as the map’s form of its kind (review M9)', () => {
  const webs: TestWeb[] = [];
  afterEach(async () => {
    for (const web of webs.splice(0)) await web.app.close();
  });

  it('of a raid: a boss and a hatch time', async () => {
    const discord = await both(await reportedRaid());
    const map = await both(await reportedRaid());
    webs.push(discord.web, map.web);
    const said = await discord.submit(await discord.open(), {
      fields: { [RAID_HATCH_INPUT]: '30', [RAID_END_INPUT]: '' },
      selected: { [RAID_BOSS_INPUT]: ['b:yveltal:T5:0'] },
    });
    // The page sends what was filled in, in turn (`changesAsked`): the boss, then the time.
    const raids = `raids/${map.made.party.id}`;
    const boss = await map.post(`${raids}/boss`, { boss: 'b:yveltal:T5:0' });
    const hatch = await map.post(`${raids}/hatch`, { time: '30' });
    expect(asOnTheMap(said)).toBe(`${boss.text} ${hatch.text}`);
    const { raid: a, hatchTime: hatchA } = discord.made.current();
    const { raid: b, hatchTime: hatchB } = map.made.current();
    expect([a.boss, hatchA]).toEqual([b.boss, hatchB]);
  });

  it('of a meetup: its name and its end', async () => {
    const request = { name: 'Picnic', creatorId: ALICE, creator: { name: 'Alice' } };
    const discord = await both(await createdMeetup(request));
    const map = await both(await createdMeetup(request));
    webs.push(discord.web, map.web);
    const said = await discord.submit(await discord.open(), {
      fields: { [MEETUP_NAME_INPUT]: 'Park picnic', [MEETUP_END_INPUT]: '8pm' },
    });
    const meetups = `meetups/${map.made.party.id}`;
    const name = await map.post(`${meetups}/name`, { drawn: 'Picnic', name: 'Park picnic' });
    const end = await map.post(`${meetups}/end`, { drawn: null, time: '8pm' });
    expect(asOnTheMap(said)).toBe(`${name.text} ${end.text}`);
    expect(discord.made.current()).toMatchObject({
      timed: { name: 'Park picnic' },
      endTime: at('2026-10-13T20:00'),
    });
    expect(map.made.current()).toMatchObject({
      timed: { name: 'Park picnic' },
      endTime: at('2026-10-13T20:00'),
    });
  });

  it('of a train: its kind, its start and its end', async () => {
    const discord = await both(await createdTrain({ route: [4, 1, 7] }));
    const map = await both(await createdTrain({ route: [4, 1, 7] }));
    webs.push(discord.web, map.web);
    const said = await discord.submit(await discord.open(), {
      fields: { [MANAGE_START_INPUT]: 'in 30', [MANAGE_END_INPUT]: 'in 90' },
      selected: { [MANAGE_AT_END_INPUT]: ['finish'], [MANAGE_KIND_INPUT]: ['dynamax'] },
      picked: { [MANAGE_ROUTE_INPUT]: 'keep' },
    });
    const form = await map.get<MapManage>(`trains/${map.made.party.id}/manage`);
    const answer = await map.post(`trains/${map.made.party.id}/manage`, {
      shown: form.shown,
      picked: { kind: 'dynamax', route: 'keep', atEnd: 'finish', start: 'in 30', end: 'in 90' },
    });
    expect(asOnTheMap(said)).toBe(answer.text);
    const shown = (made: {
      store: { get(id: string): Party | undefined };
      party: { id: string };
    }) => {
      const train = made.store.get(made.party.id);
      if (!train || !isTrain(train)) throw new Error('the train is gone');
      return [train.timed.startTime, train.endTime, train.train.kind];
    };
    expect(shown(discord.made)).toEqual(shown(map.made));
  });
});
