import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { missingPermissions } from '../../test/support/fake-gateway.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  OTHER_GUILD_ID,
  OTHER_GUILD_ROW,
  WEST_CHANNEL,
} from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { pageTask, researchTasksFixture } from '../../test/support/research.js';
import { feedChoice } from '../../test/support/rocket.js';
import { STOP_NOON, STOP_ROWS, stopReportingWith } from '../../test/support/stop-reporting.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import {
  FakeActingMembers,
  partyWebWith,
  stopWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import {
  NO_STOPS_HERE,
  STOP_OPTIONS,
  PICK_THE_REWARD,
  readTask,
  RESEARCH_REMOVE,
  researchThrottle,
  researchWindow,
  TASK_LIST_CHANGED,
} from '../commands/research/research-input.js';
import {
  NOT_YOUR_REPORT,
  NOTHING_LEFT,
  REPORT_CHANGED,
  REPORT_ENDED,
  stopsByKey,
} from '../commands/research/research-report.js';
import { LINEUPS_CHANGED, rocketThrottle, rocketWindow } from '../commands/rocket/rocket-input.js';
import { lineupValue } from '../domain/rocket/lineups.js';
import { MEMBER_WRITE_THROTTLE, Throttles } from '../discord/throttle.js';
import { stopsAtMost, type StopReportAnswer } from '../domain/web/stop-report-data.js';
import { STOP_WRITES_PER_ADDRESS_MINUTE, TYPED_TASK_KEY, type StopWebDeps } from './stop-routes.js';

const BASE = `/s/${FAKE_GUILD_ID}/api`;
const DRAGON = pageTask('Catch a Dragon-type Pokémon');

/**
 * The map of the fakes' server over the stop reports' services, Alice and Bob members (fetched
 * fresh as `Alice` and `Bob`), the clock at `STOP_NOON` (Date faked to it too); West's channel
 * named `west`; the messages of the posts of the stops read from `posts` (none by default).
 */
async function setup(rows?: Parameters<typeof stopReportingWith>[0], posts?: StopWebDeps['posts']) {
  const made = await stopReportingWith(rows);
  const throttles = new Throttles();
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const acting = new FakeActingMembers().add(ALICE, 'Alice').add(BOB, 'Bob');
  const web = webServerWith({
    members,
    parties: partyWebWith(made.made, { acting, throttles }),
    stops: stopWebWith(made.ctx, {
      channelName: (id) => (id === WEST_CHANNEL ? 'west' : undefined),
      grunts: made.grunts,
      posts,
    }),
  });
  web.clock.now = STOP_NOON;
  const alice = await web.posting(ALICE, 'Alice');
  const bob = await web.posting(BOB, 'Bob');
  const post = async (path: string, body: unknown, headers = alice) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: `${BASE}${path}`,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<StopReportAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  const { settings } = made.ctx.config;
  /** Uses `n` of Alice's uses of a command's window, as Discord would have. */
  const fill = (window: string, throttle: { uses: number; perSeconds: number }, n: number) => {
    for (let use = 0; use < n; use++) throttles.use(window, ALICE, throttle, web.clock.now);
  };
  const fillResearch = (n: number) => fill(researchWindow(settings), researchThrottle(settings), n);
  const fillRocket = (n: number) => fill(rocketWindow(settings), rocketThrottle(settings), n);
  return { ...made, web, members, acting, throttles, post, alice, bob, fillResearch, fillRocket };
}

describe('reports at stops from the map', () => {
  let web: TestWeb | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: STOP_NOON });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  describe('research', () => {
    describe('the versions of a task (plan 8R-5)', () => {
      const THROWS = pageTask('Make 3 Excellent Throws in a row');
      const version = (label: string): string => {
        const found = researchTasksFixture()
          .versions(THROWS)
          .find((one) => one.label === label);
        if (!found) throw new Error(`no version ${label}`);
        return found.value;
      };

      it('answers a version standing already with it, given back (R8, plan 8R-6)', async () => {
        const made = await setup();
        web = made.web;
        expect(
          (
            await made.post(
              '/research',
              { task: version('Gible'), stops: [wayspotId(1)] },
              made.bob,
            )
          ).status,
        ).toBe(200);
        made.fillResearch(9);
        const answer = await made.post('/research', { task: THROWS.key, stops: [wayspotId(1)] });
        expect(answer.status).toBe(409);
        // The machine part the page acts on (branch review W2, B4).
        expect(answer.json.reason).toBe('already');
        expect(answer.json.text).toMatch(
          /^Already reported: Make 3 Excellent Throws in a row · Gible at Yellow Mural, by Bob /,
        );
        expect(answer.json.already?.map((one) => [one.stop.name, one.reporter, one.oneOf])).toEqual(
          [['Yellow Mural', 'Bob', false]],
        );
        // Given back, as /research gives it back (plan 8R-6): the tenth use is still there.
        expect(
          (await made.post('/research', { task: version('Beldum'), stops: [wayspotId(2)] })).status,
        ).toBe(200);
        expect(
          (await made.post('/research', { task: version('Beldum'), stops: [wayspotId(3)] })).status,
        ).toBe(429);
      });

      it('asks before contradicting another’s report, uncounted, and replaces what is ticked (R7)', async () => {
        const made = await setup();
        web = made.web;
        const stops = [wayspotId(1), wayspotId(2)];
        await made.post('/research', { task: version('Gible'), stops }, made.bob);
        const asked = await made.post('/research', { task: version('Beldum'), stops });
        expect(asked.status).toBe(422);
        expect(asked.json.text).toContain('Make 3 Excellent Throws in a row · Beldum');
        const contested = asked.json.asks?.reports ?? [];
        expect(contested.map((one) => [one.stop.name, one.reporter, one.task])).toEqual([
          ['Yellow Mural', 'Bob', version('Gible')],
          ['Paititi Inti', 'Bob', version('Gible')],
        ]);
        // Uncounted: all ten uses are there after it.
        made.fillResearch(9);
        const answer = await made.post('/research', {
          task: version('Beldum'),
          stops,
          replacing: [contested[0]?.id],
        });
        expect(answer.status).toBe(200);
        expect(answer.json.research?.map((one) => [one.stop.name, one.task])).toEqual([
          ['Yellow Mural', version('Beldum')],
        ]);
        expect(answer.json.already?.map((one) => one.stop.name)).toEqual(['Paititi Inti']);
        expect(answer.json.text).toContain('Already reported: ');
      });

      it('refuses the question with the window full, as Discord does before its dialog', async () => {
        const made = await setup();
        web = made.web;
        await made.post('/research', { task: version('Gible'), stops: [wayspotId(1)] }, made.bob);
        made.fillResearch(10);
        const answer = await made.post('/research', {
          task: version('Beldum'),
          stops: [wayspotId(1)],
        });
        expect(answer.status).toBe(429);
        expect([...made.store.rows.values()].map((one) => one.reporter.id)).toEqual([BOB]);
      });

      it('names a contested report the member may not see by its id and stop (review R5)', async () => {
        const made = await setup();
        web = made.web;
        const stops = [wayspotId(1), wayspotId(3)];
        await made.post('/research', { task: version('Gible'), stops }, made.bob);
        const [west, east] = [...made.store.rows.values()];
        made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
        const asked = await made.post('/research', { task: version('Beldum'), stops });
        expect(asked.status).toBe(422);
        expect(asked.json.asks?.reports?.map((one) => one.id)).toEqual([west?.id]);
        expect(asked.json.asks?.hidden).toEqual([{ id: east?.id, stop: east?.stop.name }]);
        // Overruled by its id, as the page sends it.
        const answer = await made.post('/research', {
          task: version('Beldum'),
          stops,
          replacing: [west?.id, east?.id],
        });
        expect(answer.status).toBe(200);
        expect(
          [...made.store.rows.values()].map((one) => [one.stop.name, one.reporter.id]),
        ).toEqual([
          [west?.stop.name, ALICE],
          [east?.stop.name, ALICE],
        ]);
      });

      it('names every contested report by its id and stop where none can be shown (R5)', async () => {
        let postsFail = false;
        const made = await setup(undefined, {
          linkOf: () => {
            if (postsFail) throw new Error('the posts cannot be read');
            return undefined;
          },
        });
        web = made.web;
        await made.post('/research', { task: version('Gible'), stops: [wayspotId(1)] }, made.bob);
        const [gible] = [...made.store.rows.values()];
        postsFail = true;
        const asked = await made.post('/research', {
          task: version('Beldum'),
          stops: [wayspotId(1)],
        });
        expect(asked.status).toBe(422);
        expect(asked.json.asks).toEqual({
          reports: [],
          hidden: [{ id: gible?.id, stop: 'Yellow Mural' }],
        });
      });

      it('reports a listed report’s version by its task once that report was narrowed (R4)', async () => {
        const made = await setup();
        web = made.web;
        const first = await made.post(
          '/research',
          { task: THROWS.key, stops: [wayspotId(1)] },
          made.bob,
        );
        const [listed] = first.json.research ?? [];
        // Bob narrows it to Gible: the report the page listed is gone.
        await made.post('/research', { task: version('Gible'), stops: [wayspotId(1)] }, made.bob);
        expect(
          (await made.post('/research', { sameAs: listed?.id, stops: [wayspotId(2)] })).status,
        ).toBe(409);
        const again = await made.post('/research', { task: listed?.task, stops: [wayspotId(2)] });
        expect(again.status).toBe(200);
        expect(again.json.research?.map((one) => [one.stop.name, one.task, one.oneOf])).toEqual([
          ['Paititi Inti', THROWS.key, true],
        ]);
      });

      it('asks in "Same task at more stops…"’s words with more, as with sameAs, and reports (review F3)', async () => {
        const made = await setup();
        web = made.web;
        const first = await made.post('/research', {
          task: version('Gible'),
          stops: [wayspotId(1)],
        });
        const [listed] = first.json.research ?? [];
        await made.post('/research', { task: version('Beldum'), stops: [wayspotId(2)] }, made.bob);
        const asked = await made.post('/research', {
          task: listed?.task,
          more: true,
          stops: [wayspotId(2)],
        });
        expect(asked.status).toBe(422);
        expect(asked.json.text).toMatch(/^Another member’s report stands at a stop you picked\./);
        const bySameAs = await made.post('/research', {
          sameAs: listed?.id,
          stops: [wayspotId(2)],
        });
        expect(bySameAs.json.text).toMatch(
          /^Another member’s report stands at a stop you picked\./,
        );
        // Bob replaces Alice's report by Beldum: the report the page listed is gone.
        const replaced = await made.post(
          '/research',
          { task: version('Beldum'), stops: [wayspotId(1)], replacing: [listed?.id] },
          made.bob,
        );
        expect(replaced.status).toBe(200);
        const ended = await made.post('/research', {
          sameAs: listed?.id,
          stops: [wayspotId(3)],
        });
        expect(ended.status).toBe(409);
        expect(ended.json).toEqual({
          ok: false,
          text: REPORT_ENDED.replace(/`/g, ''),
          // What the page acts on (plan 8M-9B, B4): the words are only shown.
          reason: 'ended',
        });
        const more = await made.post('/research', {
          task: listed?.task,
          more: true,
          stops: [wayspotId(3)],
        });
        // The map's words leave the answer's heading out: "Also reported" is not seen there.
        expect(more.status).toBe(200);
        expect(more.json.research?.map((one) => [one.stop.name, one.task])).toEqual([
          ['East Fountain', version('Gible')],
        ]);
        expect(
          [...made.store.rows.values()].map((one) => [one.stop.name, one.reporter.id]),
        ).toEqual([
          ['Paititi Inti', BOB],
          ['Yellow Mural', BOB],
          ['East Fountain', ALICE],
        ]);
      });

      it('refuses more stops by a bare key of before plan 8R-5 whose task gives only items (review F3)', async () => {
        const made = await setup();
        web = made.web;
        // A report of before plan 8R-5: the task's key with every reward, all of them items.
        const ditto = pageTask('Catch a Ditto');
        expect(ditto.rewards.every((reward) => reward.kind === 'item')).toBe(true);
        await made.ctx.stopReports.reportResearch({
          serverId: FAKE_GUILD_ID,
          stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(1)]),
          subject: {
            subjectKey: ditto.key,
            research: {
              text: ditto.text,
              category: ditto.category,
              rewards: ditto.rewards,
              typed: false,
            },
          },
          reporter: { id: ALICE, name: 'Alice' },
        });
        const answer = await made.post('/research', {
          task: ditto.key,
          more: true,
          stops: [wayspotId(2)],
        });
        expect(answer.status).toBe(422);
        expect(answer.json.text).toBe(PICK_THE_REWARD);
        expect(made.store.rows.size).toBe(1);
      });
    });

    it('reports a task at the stops picked, as /research, and gives them as the map shows them', async () => {
      const made = await setup();
      web = made.web;
      const answer = await made.post('/research', {
        task: DRAGON.key,
        stops: [wayspotId(1), wayspotId(2)],
      });
      expect(answer.status).toBe(200);
      expect(answer.json.ok).toBe(true);
      expect(answer.json.text).toBe(
        'Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew\n' +
          '• Yellow Mural\n• Paititi Inti\n' +
          'In "Today’s Stops" on the board of #west, until midnight.',
      );
      expect(
        answer.json.research?.map((one) => [one.stop.name, one.reporter, one.mayTakeBack]),
      ).toEqual([
        ['Yellow Mural', 'Alice', true],
        ['Paititi Inti', 'Alice', true],
      ]);
      expect([...made.store.rows.values()].map((one) => one.reporter)).toEqual([
        { id: ALICE, name: 'Alice' },
        { id: ALICE, name: 'Alice' },
      ]);
      expect(made.web.entries).toContainEqual(
        expect.objectContaining({
          user: ALICE,
          guild: FAKE_GUILD_ID,
          stops: [wayspotId(1), wayspotId(2)],
          outcome: 'reported',
          msg: 'field research was reported on the map',
        }),
      );
    });

    it('takes a task typed in full with its reward, as /research does', async () => {
      const made = await setup();
      web = made.web;
      const answer = await made.post('/research', {
        task: 'Win 3 raids in the rain',
        reward: 'item:rare-candy',
        stops: [wayspotId(1)],
      });
      expect(answer.status).toBe(200);
      expect(answer.json.research?.[0]).toMatchObject({
        typed: true,
        rewards: [{ kind: 'item', value: 'item:rare-candy' }],
      });
    });

    it('refuses in the command’s words before counting: stops of nowhere, a task gone', async () => {
      const made = await setup();
      web = made.web;
      made.ctx.config.settings.research.throttle.uses = 2;
      try {
        made.wayspots.setPineStops([
          {
            stop: {
              id: 9,
              serverId: OTHER_GUILD_ID,
              name: 'Another server’s',
              lat: 40.0505,
              lon: -80.05,
              address: null,
              createdBy: BOB,
              createdAt: 1,
              updatedBy: BOB,
              updatedAt: 1,
            },
            guildRow: OTHER_GUILD_ROW,
          },
        ]);
        for (const stops of [[wayspotId(5)], ['pine-9'], [wayspotId(1), 'nothing']]) {
          expect((await made.post('/research', { task: DRAGON.key, stops })).status).toBe(404);
        }
        const gone = await made.post('/research', {
          task: '0123456789abcdef',
          stops: [wayspotId(1)],
        });
        expect(gone.status).toBe(422);
        expect(gone.json.text).toBe(TASK_LIST_CHANGED);
        expect(gone.json.reason).toBe('list-changed');
        const reward = await made.post('/research', {
          task: 'Win 3 raids in the rain',
          reward: 'a golden thing',
          stops: [wayspotId(1)],
        });
        expect(reward.status).toBe(422);
        expect(reward.json.text).toMatch(/^I do not know "a golden thing" as a reward\./);
        expect(reward.json).not.toHaveProperty('reason');
        expect(made.store.rows.size).toBe(0);
        // Nothing counted: both uses are there.
        for (const n of [1, 2]) {
          expect(
            (await made.post('/research', { task: DRAGON.key, stops: [wayspotId(n)] })).status,
          ).toBe(200);
        }
      } finally {
        made.ctx.config.settings.research.throttle.uses = 10;
      }
    });

    it('reports a typed task again by its report (sameAs), its text and reward kept', async () => {
      const made = await setup();
      web = made.web;
      const typed = await made.post('/research', {
        task: 'Win 3 raids in the rain',
        reward: 'item:rare-candy',
        stops: [wayspotId(1)],
      });
      const [first] = typed.json.research ?? [];
      const again = await made.post('/research', {
        sameAs: first?.id,
        stops: [wayspotId(2)],
      });
      expect(again.status).toBe(200);
      expect(again.json.text).toMatch(/^Win 3 raids in the rain · Rare Candy\n• Paititi Inti\n/);
      expect(again.json.research?.[0]).toMatchObject({
        task: first?.task,
        text: 'Win 3 raids in the rain',
        typed: true,
        rewards: [{ kind: 'item', value: 'item:rare-candy' }],
        stop: { name: 'Paititi Inti' },
      });
      expect(
        [...made.store.rows.values()].map((one) =>
          one.kind === 'research' ? one.research.text : one.kind,
        ),
      ).toEqual(['Win 3 raids in the rain', 'Win 3 raids in the rain']);
    });

    it('never takes a typed task’s key as a task to store as text', async () => {
      const made = await setup();
      web = made.web;
      const typed = await made.post('/research', {
        task: 'Win 3 raids in the rain',
        stops: [wayspotId(1)],
      });
      const key = typed.json.research?.[0]?.task ?? '';
      expect(key).toMatch(/^typed:/);
      for (const task of [key, ` ${key.toUpperCase()}`]) {
        const answer = await made.post('/research', { task, stops: [wayspotId(2)] });
        expect(answer.status).toBe(422);
        expect(answer.json).toEqual({ ok: false, text: TYPED_TASK_KEY });
      }
      expect(made.store.rows.size).toBe(1);
    });

    it('reports a listed task gone from the list since by its report (sameAs)', async () => {
      const made = await setup();
      web = made.web;
      const listed = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] });
      Object.assign(made.ctx, { researchTasks: researchTasksFixture([]) });
      const byKey = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(2)] });
      expect(byKey.status).toBe(422);
      expect(byKey.json.text).toBe(TASK_LIST_CHANGED);
      const again = await made.post('/research', {
        sameAs: listed.json.research?.[0]?.id,
        stops: [wayspotId(2)],
      });
      expect(again.status).toBe(200);
      expect(again.json.research?.[0]).toMatchObject({
        task: DRAGON.key,
        text: 'Catch a Dragon-type Pokémon',
        typed: false,
      });
      expect(made.store.rows.size).toBe(2);
    });

    it('refuses sameAs of a report ended, another server’s or a Rocket one, uncounted', async () => {
      const made = await setup();
      web = made.web;
      const subject = readTask(made.ctx, DRAGON.key, null);
      const reporter = { id: ALICE, name: 'Alice' };
      const taken = await made.ctx.stopReports.reportResearch({
        serverId: FAKE_GUILD_ID,
        stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(1)]),
        subject,
        reporter,
      });
      const takenId = taken.saved[0]?.report.id ?? 0;
      await made.ctx.stopReports.takeBack(FAKE_GUILD_ID, [takenId], ALICE, false);
      const elsewhere = await made.ctx.stopReports.reportResearch({
        serverId: OTHER_GUILD_ID,
        stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(2)]),
        subject,
        reporter,
      });
      const grunt = await made.post(
        '/rocket',
        { who: 'grunt:water', stop: wayspotId(3) },
        made.bob,
      );
      made.fillResearch(9);
      for (const sameAs of [
        takenId,
        elsewhere.saved[0]?.report.id ?? 0,
        grunt.json.grunt?.id ?? 0,
        424242,
      ]) {
        const answer = await made.post('/research', { sameAs, stops: [wayspotId(1)] });
        expect(answer.status).toBe(409);
        expect(answer.json).toEqual({
          ok: false,
          text: REPORT_ENDED.replace(/`/g, ''),
          reason: 'ended',
        });
      }
      expect(made.web.entries).toContainEqual(
        expect.objectContaining({ outcome: 'ended', stops: [wayspotId(1)] }),
      );
      // Nothing counted: the last use is there.
      expect(
        (await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] })).status,
      ).toBe(200);
      expect(
        (await made.post('/research', { task: DRAGON.key, stops: [wayspotId(2)] })).status,
      ).toBe(429);
    });

    it('says where no PokéStop is known at all', async () => {
      const made = await setup([]);
      web = made.web;
      const answer = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] });
      expect(answer.status).toBe(422);
      expect(answer.json.text).toBe(NO_STOPS_HERE.replace(/`/g, ''));
    });

    it('counts in /research report’s own window, shared with Discord', async () => {
      const made = await setup();
      web = made.web;
      made.fillResearch(10);
      const answer = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] });
      expect(answer.status).toBe(429);
      expect(answer.json.error).toMatch(/^You can do that again in /);
      expect(made.store.rows.size).toBe(0);
    });

    it('shows no report in a region the member is kept out of, though it is made', async () => {
      const made = await setup();
      web = made.web;
      made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
      const answer = await made.post('/research', {
        task: DRAGON.key,
        stops: [wayspotId(1), wayspotId(3)],
      });
      expect(answer.status).toBe(200);
      expect(answer.json.research?.map((one) => one.stop.name)).toEqual(['Yellow Mural']);
      expect(made.store.rows.size).toBe(2);
    });

    it('refuses a body other than the command’s options, and a POST without its guard', async () => {
      const made = await setup();
      web = made.web;
      const six = [1, 2, 3, 4, 5, 6].map((n) => wayspotId(n));
      // Re-review X3: too many stops said in words, by `/research report`'s count of stops.
      for (const body of [
        { task: DRAGON.key, stops: six },
        { sameAs: 1, stops: six },
      ]) {
        const many = await made.post('/research', body);
        expect(many.status).toBe(400);
        expect(many.json.text).toBe(stopsAtMost(STOP_OPTIONS.length));
        expect(many.json.text).toBe('A report names 5 stops at most.');
      }
      expect((await made.post('/research', { task: DRAGON.key, stops: [] })).status).toBe(400);
      expect(
        (await made.post('/research', { task: DRAGON.key, stops: ['x'], extra: 1 })).status,
      ).toBe(400);
      // `sameAs` instead of the task and its reward, never with them, nor neither.
      for (const body of [
        { task: DRAGON.key, sameAs: 1, stops: [wayspotId(1)] },
        { sameAs: 1, reward: 'item:rare-candy', stops: [wayspotId(1)] },
        { stops: [wayspotId(1)] },
        { sameAs: '1', stops: [wayspotId(1)] },
      ]) {
        expect((await made.post('/research', body)).status).toBe(400);
      }
      const { 'x-pine-csrf': _token, ...unguarded } = made.alice;
      expect(
        (await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] }, unguarded))
          .status,
      ).toBe(403);
      const stranger = await made.web.posting('200000000000000099', 'X');
      expect(
        (await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] }, stranger))
          .status,
      ).toBe(403);
    });
  });

  describe('Team GO Rocket', () => {
    it('reports a grunt, posted in its region, and gives it with its message’s link', async () => {
      const made = await setup();
      web = made.web;
      const answer = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
      expect(answer.status).toBe(200);
      expect(answer.json.text).toMatch(
        /^Water-type grunt at Yellow Mural · catch one of Mudkip, .*\nPosted in #west; it goes away in 30 minutes\.$/,
      );
      const [message] = made.made.gateway.messagesIn(WEST_CHANNEL);
      expect(answer.json.grunt).toMatchObject({
        who: 'grunt:water',
        reporter: 'Alice',
        link: `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/${message?.id ?? ''}`,
      });
      expect(made.web.entries).toContainEqual(
        expect.objectContaining({
          user: ALICE,
          stop: wayspotId(1),
          outcome: 'reported',
          msg: 'Team GO Rocket was reported on the map',
        }),
      );
    });

    it('answers the same grunt again as reported already, with it, and gives the use back (plan 8R-6)', async () => {
      const made = await setup();
      web = made.web;
      await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) }, made.bob);
      made.fillRocket(8);
      const again = await made.post('/rocket', { who: 'water', stop: wayspotId(1) });
      expect(again.status).toBe(409);
      expect(again.json.ok).toBe(false);
      expect(again.json.reason).toBe('already');
      expect(again.json.text).toMatch(
        /^Already reported: a Water-type grunt at Yellow Mural, by Bob a few seconds ago; it goes away in 30 minutes\.$/,
      );
      expect(again.json.grunt?.link).toMatch(/^https:\/\/discord\.com\/channels\//);
      expect(made.made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
      // Given back, as on Discord (plan 8R-6): the ninth and tenth uses are still there.
      expect((await made.post('/rocket', { who: 'grunt:fire', stop: wayspotId(2) })).status).toBe(
        200,
      );
      expect((await made.post('/rocket', { who: 'grunt:ice', stop: wayspotId(2) })).status).toBe(
        200,
      );
      expect((await made.post('/rocket', { who: 'grunt:rock', stop: wayspotId(2) })).status).toBe(
        429,
      );
    });

    it('asks before a grunt replaces a hideout, uncounted, and replaces it when told to', async () => {
      const made = await setup();
      web = made.web;
      const arlo = await made.post('/rocket', { who: 'leader:arlo', stop: wayspotId(1) }, made.bob);
      expect(arlo.status).toBe(200);
      const hideout = arlo.json.hideout?.id ?? 0;
      made.fillRocket(9);
      const asked = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
      expect(asked.status).toBe(422);
      expect(asked.json).toMatchObject({
        ok: false,
        text:
          'Arlo was reported here today, and a hideout keeps grunts away all day. Replace ' +
          'Arlo’s report with the Water-type grunt?',
        asks: { replacing: hideout },
        hideout: { id: hideout, who: 'leader:arlo' },
      });
      // A Replace of another hideout than the one standing is asked again.
      expect(
        (await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1), replacing: 999 }))
          .status,
      ).toBe(422);
      const replaced = await made.post('/rocket', {
        who: 'grunt:water',
        stop: wayspotId(1),
        replacing: hideout,
      });
      expect(replaced.status).toBe(200);
      expect(replaced.json.text).toContain('(was: Arlo)');
      // The window is full now: the question is not asked, as Discord opens no dialog.
      await made.post('/rocket', { who: 'leader:arlo', stop: wayspotId(2) }, made.bob);
      const full = await made.post('/rocket', { who: 'grunt:fire', stop: wayspotId(2) });
      expect(full.status).toBe(429);
    });

    it('asks and gives the use back where a hideout came after the route looked', async () => {
      const made = await setup();
      web = made.web;
      const arlo = await made.post('/rocket', { who: 'leader:arlo', stop: wayspotId(1) }, made.bob);
      made.fillRocket(9);
      // The route's look at the stop missed the hideout (reported in between).
      vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined);
      const asked = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
      expect(asked.status).toBe(422);
      expect(asked.json.asks).toEqual({ replacing: arlo.json.hideout?.id });
      expect((await made.post('/rocket', { who: 'grunt:fire', stop: wayspotId(2) })).status).toBe(
        200,
      );
    });

    it('gives the use back where the grunt could be posted nowhere', async () => {
      const made = await setup();
      web = made.web;
      made.fillRocket(9);
      made.made.gateway.failing.set('sendMessage', missingPermissions('POST'));
      const answer = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
      expect(answer.status).toBe(503);
      expect(answer.json.text).toBe(
        'I could not post the grunt in #west, so nothing was reported. Try again in a moment.',
      );
      made.made.gateway.failing.delete('sendMessage');
      expect((await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) })).status).toBe(
        200,
      );
    });

    it('leaves out of its answer a grunt in a region the member is kept out of', async () => {
      const made = await setup();
      web = made.web;
      made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
      const answer = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(3) });
      expect(answer.status).toBe(200);
      expect(answer.json.ok).toBe(true);
      expect(answer.json.grunt).toBeUndefined();
      expect(made.made.gateway.messagesIn(EAST_CHANNEL)).toHaveLength(1);
    });

    describe('one lineup of a grunt type (plan 8R-4L)', () => {
      const water = feedChoice('grunt:water');
      const [mudkips, magikarps] = water.lineups ?? [];
      if (!mudkips || !magikarps) throw new Error('the water grunt has two lineups');

      it('reports a lineup picked with its fingerprint, and shows it by its first slot', async () => {
        const made = await setup();
        web = made.web;
        const who = lineupValue(water, magikarps);
        const answer = await made.post('/rocket', { who, stop: wayspotId(1) });
        expect(answer.status).toBe(200);
        expect(answer.json.text).toMatch(
          /^Water-type grunt at Yellow Mural · catch one of Magikarp, Feebas\nPosted in #west;/,
        );
        expect(answer.json.grunt).toMatchObject({
          who: 'grunt:water:male',
          name: 'Water-type grunt',
          lineup: 'Magikarp, Feebas',
        });
      });

      it('refuses a lineup whose fingerprint is not of now, uncounted', async () => {
        const made = await setup();
        web = made.web;
        made.fillRocket(9);
        const stale = await made.post('/rocket', {
          who: `grunt:water:male#${mudkips.fingerprint}`,
          stop: wayspotId(1),
        });
        expect(stale.status).toBe(422);
        expect(stale.json.text).toBe(LINEUPS_CHANGED);
        expect(stale.json.reason).toBe('list-changed');
        expect(
          (await made.post('/rocket', { who: 'grunt:water:male', stop: wayspotId(1) })).json.text,
        ).toBe(LINEUPS_CHANGED);
        expect(
          (await made.post('/rocket', { who: lineupValue(water, mudkips), stop: wayspotId(1) }))
            .status,
        ).toBe(200);
      });

      it('refines not sure which in place, and asks before a hideout naming the lineup', async () => {
        const made = await setup();
        web = made.web;
        const notSure = await made.post('/rocket', { who: 'water', stop: wayspotId(1) }, made.bob);
        const refined = await made.post('/rocket', {
          who: lineupValue(water, magikarps),
          stop: wayspotId(1),
        });
        expect(refined.status).toBe(200);
        expect(refined.json.text).toContain('(was: Water-type grunt, not sure which)');
        expect(refined.json.grunt?.id).toBe(notSure.json.grunt?.id);
        expect(made.made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
        await made.post('/rocket', { who: 'leader:arlo', stop: wayspotId(2) }, made.bob);
        const asked = await made.post('/rocket', {
          who: lineupValue(water, mudkips),
          stop: wayspotId(2),
        });
        expect(asked.status).toBe(422);
        expect(asked.json.text).toBe(
          'Arlo was reported here today, and a hideout keeps grunts away all day. Replace ' +
            'Arlo’s report with the Water-type grunt · Mudkip, Tentacool, Krabby?',
        );
      });
    });

    it('refuses who is not in the lineups and a stop of nowhere, uncounted', async () => {
      const made = await setup();
      web = made.web;
      made.fillRocket(9);
      const nobody = await made.post('/rocket', { who: 'someone', stop: wayspotId(1) });
      expect(nobody.status).toBe(422);
      expect(nobody.json.text).toMatch(/^I do not know "someone" in Team GO Rocket/);
      expect((await made.post('/rocket', { who: 'arlo', stop: wayspotId(5) })).status).toBe(404);
      expect((await made.post('/rocket', { who: 'arlo', stop: wayspotId(1) })).status).toBe(200);
    });
  });

  describe('taking back', () => {
    it('takes back one’s own report, another’s only as staff, in the remove window', async () => {
      const made = await setup();
      web = made.web;
      const reported = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] });
      const id = reported.json.research?.[0]?.id ?? 0;
      // Bob has one use of /research remove left.
      for (let use = 1; use < MEMBER_WRITE_THROTTLE.uses; use++) {
        made.throttles.use(RESEARCH_REMOVE, BOB, MEMBER_WRITE_THROTTLE, STOP_NOON);
      }
      const bobs = await made.post(`/stop-reports/${String(id)}/remove`, {}, made.bob);
      expect(bobs.status).toBe(403);
      expect(bobs.json.text).toBe(NOT_YOUR_REPORT);
      expect(made.store.rows.size).toBe(1);
      // Bob's refusal was not counted: his last use is there for it as staff.
      made.acting.standing(BOB, { roleNames: ['Moderator'], administrator: false });
      const staff = await made.post(`/stop-reports/${String(id)}/remove`, {}, made.bob);
      expect(staff.status).toBe(200);
      expect(
        made.throttles.wait(RESEARCH_REMOVE, BOB, MEMBER_WRITE_THROTTLE, STOP_NOON),
      ).toBeDefined();
      expect(staff.json.text).toBe('Took back Catch a Dragon-type Pokémon at Yellow Mural.');
      expect(made.store.rows.size).toBe(0);
      expect(made.web.entries).toContainEqual(
        expect.objectContaining({
          user: BOB,
          report: id,
          outcome: 'removed',
          msg: 'a report at a stop was taken back on the map',
        }),
      );
    });

    it('takes back nothing by a version of the list refined since, for its reporter and staff (L1)', async () => {
      const made = await setup();
      web = made.web;
      const water = feedChoice('grunt:water');
      const magikarps = water.lineups?.[1];
      if (!magikarps) throw new Error('the water grunt has two lineups');
      const notSure = await made.post('/rocket', { who: 'water', stop: wayspotId(1) });
      const id = notSure.json.grunt?.id ?? 0;
      const listed = notSure.json.grunt?.madeAt;
      expect(listed).toBe(STOP_NOON);
      vi.setSystemTime(STOP_NOON + 60_000);
      const who = lineupValue(water, magikarps);
      await made.post('/rocket', { who, stop: wayspotId(1) }, made.bob);
      const remove = (madeAt: number | undefined, as = made.alice) =>
        made.post(`/stop-reports/${String(id)}/remove`, { madeAt }, as);
      // Alice took it back as she saw it in the list: it is Bob's now, changed since.
      const hers = await remove(listed);
      expect(hers.status).toBe(409);
      expect(hers.json.text).toBe(REPORT_CHANGED);
      made.acting.standing(ALICE, { roleNames: ['Moderator'], administrator: false });
      expect((await remove(listed)).json.text).toBe(REPORT_CHANGED);
      expect([...made.store.rows.values()].map((row) => row.subjectKey)).toEqual([
        'grunt:water:male',
      ]);
      // The version that stands is taken back.
      expect((await remove(STOP_NOON + 60_000, made.bob)).status).toBe(200);
      expect(made.store.rows.size).toBe(0);
    });

    // Final review of 8X-F, F3: the sentence ends once after a stop whose name ends in a period.
    it('ends its answer once after a stop whose name ends in a period', async () => {
      const made = await setup([
        ...STOP_ROWS,
        keptRow(6, { title: 'Corner Store Inc.', lat: 40.062, lon: -80.06, address: null }),
      ]);
      web = made.web;
      const reported = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(6)] });
      const id = reported.json.research?.[0]?.id ?? 0;
      const taken = await made.post(`/stop-reports/${String(id)}/remove`, {});
      expect(taken.json.text).toBe('Took back Catch a Dragon-type Pokémon at Corner Store Inc.');
    });

    it('answers alike for a report gone, another server’s and one that never was', async () => {
      const made = await setup();
      web = made.web;
      const reported = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
      const id = reported.json.grunt?.id ?? 0;
      expect((await made.post(`/stop-reports/${String(id)}/remove`, {})).status).toBe(200);
      // Alice's own report, in another server.
      const elsewhere = await made.ctx.stopReports.reportResearch({
        serverId: OTHER_GUILD_ID,
        stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(2)]),
        subject: readTask(made.ctx, DRAGON.key, null),
        reporter: { id: ALICE, name: 'Alice' },
      });
      const other = elsewhere.saved[0]?.report.id ?? 0;
      for (const gone of [id, other, 424242]) {
        const answer = await made.post(`/stop-reports/${String(gone)}/remove`, {});
        expect(answer.status).toBe(409);
        expect(answer.json.text).toBe(NOTHING_LEFT);
      }
      expect(made.store.rows.has(other)).toBe(true);
      expect((await made.post('/stop-reports/abc/remove', {})).status).toBe(404);
    });
  });

  describe('every report and take-back', () => {
    it('counts against one limit of the address, before the guard and the body are read', async () => {
      const made = await setup();
      web = made.web;
      const paths = ['/research', '/rocket', '/stop-reports/1/remove'];
      for (let n = 0; n < STOP_WRITES_PER_ADDRESS_MINUTE; n++) {
        // A body of nothing: refused after the limit counted it.
        expect((await made.post(paths[n % 3] ?? '', { nothing: true })).status).toBe(400);
      }
      const { 'x-pine-csrf': _token, ...unguarded } = made.alice;
      for (const path of paths) {
        const answer = await made.post(path, { nothing: true }, unguarded);
        expect(answer.status).toBe(429);
      }
    });

    it('takes this server’s own stops (stop:pine-<id>) as /research does', async () => {
      const made = await setup();
      web = made.web;
      made.wayspots.setPineStops([
        {
          stop: {
            id: 7,
            serverId: FAKE_GUILD_ID,
            name: 'Coffee Corner',
            lat: 40.0505,
            lon: -80.05,
            address: null,
            createdBy: ALICE,
            createdAt: 5_000,
            updatedBy: ALICE,
            updatedAt: 5_000,
          },
          guildRow: 1,
        },
      ]);
      const research = await made.post('/research', { task: DRAGON.key, stops: ['pine-7'] });
      expect(research.status).toBe(200);
      expect(research.json.research?.map((one) => one.stop)).toMatchObject([
        { key: 'pine-7', name: 'Coffee Corner' },
      ]);
      const rocket = await made.post('/rocket', { who: 'grunt:water', stop: 'pine-7' });
      expect(rocket.status).toBe(200);
      expect(rocket.json.grunt?.stop).toMatchObject({ key: 'pine-7' });
    });

    it('logs the stops it found, and only how many where it found none', async () => {
      const made = await setup();
      web = made.web;
      const odd = 'not a stop <b>';
      expect((await made.post('/research', { task: DRAGON.key, stops: [odd] })).status).toBe(404);
      expect((await made.post('/rocket', { who: 'grunt:water', stop: odd })).status).toBe(404);
      const refused = await made.post('/research', {
        task: '0123456789abcdef',
        stops: [wayspotId(1), wayspotId(1)],
      });
      expect(refused.status).toBe(422);
      expect(JSON.stringify(made.web.entries)).not.toContain(odd);
      expect(made.web.entries).toContainEqual(
        expect.objectContaining({ outcome: 'no-stop', stops: 1 }),
      );
      expect(made.web.entries).toContainEqual(
        expect.objectContaining({ outcome: 'refused', stops: [wayspotId(1)] }),
      );
    });

    it('answers a report made though the map cannot show it just now, leaving it out', async () => {
      let postsFail = false;
      const made = await setup(undefined, {
        linkOf: () => {
          if (postsFail) throw new Error('the posts cannot be read');
          return undefined;
        },
      });
      web = made.web;
      // What shows a report cannot be read once it is stored: the pinned posts, the grunts.
      postsFail = true;
      const research = await made.post('/research', { task: DRAGON.key, stops: [wayspotId(1)] });
      expect(research.status).toBe(200);
      expect(research.json).toMatchObject({ ok: true, research: [] });
      expect(research.json.text).toContain('Catch a Dragon-type Pokémon');
      made.gruntStore.failing.set('ofReports', new Error('database away'));
      const grunt = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(2) });
      expect(grunt.status).toBe(200);
      expect(grunt.json.ok).toBe(true);
      expect(grunt.json.grunt).toBeUndefined();
      expect(made.store.rows.size).toBe(2);
      expect(
        made.web.entries.filter(
          (entry) => entry.msg === 'could not show reports at stops made on the map',
        ),
      ).toHaveLength(2);
    });
  });
});
