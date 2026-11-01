import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { shownDialog } from '../../test/support/dialogs.js';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeChatInput,
  fakeModal,
  answered,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { textOf } from '../../test/support/messages.js';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { ALICE, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { HISTORY_MUST_NOT_FAIL } from '../../test/support/history.js';
import { createTestContext } from '../../test/support/test-context.js';
import { fixtureForms } from '../../test/support/wants.js';
import { AccessGrantRepository } from '../db/repositories/access-grant-repository.js';
import { GuildRepository } from '../db/repositories/guild-repository.js';
import { GymNotificationRepository } from '../db/repositories/gym-notification-repository.js';
import { HistoryRepository } from '../db/repositories/history-repository.js';
import { NewTrainRepository } from '../db/repositories/new-train-repository.js';
import { PartyRepository } from '../db/repositories/party-repository.js';
import { PokemonNotificationRepository } from '../db/repositories/pokemon-notification-repository.js';
import { RowIds } from '../db/repositories/row-ids.js';
import { UserRepository } from '../db/repositories/user-repository.js';
import type { DB } from '../db/types.js';
import { InteractionRouter } from '../discord/router.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import type { GymAdminService } from '../services/gym-admin-service.js';
import { gym } from './gyms/index.js';
import { target, targetControls, untarget } from './notifications/targets.js';
import { unwant, want, wantBoxControls, wants as wantsCommand } from './notifications/wants.js';
import { TargetWantRepository } from '../db/repositories/target-want-repository.js';
import { WantBoxRepository } from '../db/repositories/want-box-repository.js';
import { wildCommand } from './notifications/wild.js';
import { raid, raidControls } from './raids/raid.js';
import { settings } from './settings/settings.js';

/**
 * How often a command goes to the database, counted on the real tables (plan 4F, after the
 * staging of Phase 4 measured 0.6 to 0.7 s for every command that touches it). Every statement
 * Kysely sends is a round trip, `begin` and `commit` included. One costs well under a
 * millisecond against this container, so the time that was measured is not spent here: a
 * command with one statement was as slow as one with eight. The counts are pinned all the
 * same: a round trip costs more over a network, and what was plainly waste (the row ids of the
 * server and the member, asked for before every statement) is gone and should stay gone.
 *
 * The numbers are upper bounds: a change that needs fewer is welcome, one that needs more must
 * say why here.
 */
describe('round trips to the database per command', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  /** The statements since they were last cleared, as Kysely sent them. */
  const statements: string[] = [];

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase({
      log: (event) => {
        statements.push(event.query.sql);
      },
    }));
    await sql`insert into Guild (id, snowflake) values (1, ${FAKE_GUILD_ID})`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
      db,
    );
    await sql`insert into Region (id, guildId, channelId) values (2, 1, 1234567890123456789)`.execute(
      db,
    );
    await sql`insert into Gym (id, name) values (1, 'Library'), (2, 'Fountain')`.execute(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
    for (const table of ['Party', 'PartyAccessGrant', 'PokemonNotification', 'GymNotification']) {
      await sql`delete from ${sql.table(table)}`.execute(db);
    }
    await db.deleteFrom('User').execute();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The bot over the real tables: every repository a command reaches is the real one, built as
   * `src/app.ts` builds them, over one memory of the rows the process has seen (`RowIds`).
   */
  async function bot() {
    const rowIds = new RowIds();
    const users = new UserRepository(db, rowIds);
    const guilds = new GuildRepository(db, rowIds);
    const wants = new PokemonNotificationRepository(db, fixtureForms(), rowIds);
    const targetWants = new TargetWantRepository(db, rowIds);
    const wantBoxes = new WantBoxRepository(db, fixtureForms(), rowIds);
    const gymTargets = new GymNotificationRepository(db, rowIds);
    const newTrains = new NewTrainRepository(db);
    const historyOptIns = new HistoryRepository(db);
    const made = await partyServiceWith(
      [],
      { users, guilds, notifying: { users, guilds, wants, gymTargets, newTrains } },
      {
        database: new PartyRepository(db, HISTORY_MUST_NOT_FAIL),
        historyStorage: historyOptIns,
        grants: new AccessGrantRepository(db),
      },
    );
    const { ctx } = createTestContext({
      users,
      guilds,
      wants,
      targetWants,
      wantBoxes,
      gymTargets,
      newTrains,
      historyOptIns,
      partyService: made.service,
      attendance: made.attendance,
      raids: made.raids,
      parties: made.store,
      regions: made.regions,
      spawns: made.spawns,
      // Every gym is within reach: what is counted is the look for the server's row.
      gymAdmin: { mayTouch: () => true } as unknown as GymAdminService,
    });
    const router = new InteractionRouter(
      ctx,
      [settings, want, unwant, wantsCommand, target, untarget, wildCommand, raid, gym],
      [targetControls, raidControls, wantBoxControls],
    );
    /** Everything that goes on beside the answer: the post, its copies, who is told. */
    const settle = async () => {
      await made.service.flush();
      await made.attendance.flush();
      await made.access.flush();
      await made.notify.flush();
    };
    /**
     * Uses a command and counts the statements: `answered` when the member has their answer,
     * `settled` when everything that follows from it is done as well.
     */
    const counted = async (interaction: FakeInteraction) => {
      await settle();
      statements.length = 0;
      await router.handle(interaction as never);
      const answered = statements.length;
      await settle();
      return { answered, settled: statements.length };
    };
    const command = (
      userId: string,
      commandName: string,
      options: Record<string, string | boolean> = {},
      subcommand?: string,
    ) =>
      fakeChatInput({
        commandName,
        ...(subcommand === undefined ? {} : { subcommand }),
        userId,
        channelId: WEST_CHANNEL,
        displayName: 'Trainer',
        options,
      });
    const typing = (
      userId: string,
      commandName: string,
      focusedName: string,
      focused: string,
      extra: object = {},
    ) =>
      fakeAutocomplete({
        commandName,
        userId,
        channelId: WEST_CHANNEL,
        focusedName,
        focused,
        ...extra,
      });
    return { ...made, ctx, router, counted, command, typing, wants, gymTargets, users };
  }

  it('uses the connections of the pool again, and says what a round trip costs here', async () => {
    const times: number[] = [];
    const connections = new Set<unknown>();
    for (let n = 0; n < 50; n++) {
      const started = performance.now();
      const answer = await sql<{ id: unknown }>`select connection_id() as id`.execute(db);
      times.push(performance.now() - started);
      connections.add(String(answer.rows[0]?.id));
    }
    // Fifty queries one after the other: never more connections than the pool keeps (ten),
    // where a connection made for every query would be fifty.
    expect(connections.size).toBeLessThanOrEqual(10);
    // The time is printed, not pinned: it is the machine's.
    times.sort((a, b) => a - b);
    process.stdout.write(`a round trip here: ${(times[25] ?? 0).toFixed(2)} ms (median of 50)\n`);
  });

  it('sends the pool no more statements than these for each command', async () => {
    const made = await bot();
    const measured: Record<string, { answered: number; settled: number }> = {};
    /**
     * Uses a command, counts, and makes sure it did its work: a use that was refused sends no
     * statement and would meet any bound. A command was deferred and answered by the edit of
     * that answer, with neither a refusal (`reply`) nor an error after it (`followUp`).
     */
    const use = async (name: string, interaction: FakeInteraction): Promise<string> => {
      measured[name] = await made.counted(interaction);
      // One answer: the edited acknowledgement of a command that defers, or the direct answer
      // of one that would be acknowledged only late.
      const { deferReply, reply, editReply } = interaction;
      expect(interaction.followUp, name).not.toHaveBeenCalled();
      expect(reply.mock.calls.length + editReply.mock.calls.length, name).toBe(1);
      expect(deferReply.mock.calls.length, name).toBe(editReply.mock.calls.length);
      const answer = answered(interaction);
      // A components-v2 answer (`/wants` since plan 8B-1) has its text in its components.
      return answer.content ?? JSON.stringify(answer.embeds ?? answer.components);
    };
    /** Types into an option, counts, and gives the names of the choices that were offered. */
    const type = async (name: string, interaction: FakeInteraction): Promise<string[]> => {
      measured[name] = await made.counted(interaction);
      expect(interaction.respond, name).toHaveBeenCalledTimes(1);
      const choices = interaction.respond.mock.calls[0]?.[0] ?? [];
      return choices.map((choice) => choice.name);
    };
    /** A member's rows of a table that hangs on their `User` row, as `[column value]`. */
    const wantsOf = async (member: string) =>
      (
        await db
          .selectFrom('PokemonNotification as n')
          .innerJoin('User as u', 'u.id', 'n.userId')
          .select('n.pokemon')
          .where('u.userSnowflake', '=', member)
          .orderBy('n.id')
          .execute()
      ).map((row) => row.pokemon);
    const gymsOf = async (member: string) =>
      (
        await db
          .selectFrom('GymNotification as n')
          .innerJoin('User as u', 'u.id', 'n.userId')
          .select(['n.gym', 'n.guildId'])
          .where('u.userSnowflake', '=', member)
          .execute()
      ).map((row) => [row.gym, row.guildId]);
    // Alice first: with her the process sees the server's row. Bob is who is counted.
    for (const member of [ALICE, BOB]) {
      const { command, typing } = made;
      await use('/settings mentions', command(member, 'settings', { enabled: false }, 'mentions'));
      const row = await db
        .selectFrom('User')
        .select('mentions')
        .where('userSnowflake', '=', member)
        .executeTakeFirst();
      expect(row).toEqual({ mentions: 0 });
      const shown = await use('/settings show', command(member, 'settings', {}, 'show'));
      expect(shown).toContain('- Pings in posts: **off**');
      expect(await use('/want', command(member, 'want', { target: 'iv:perfect' }))).toContain(
        'with perfect IVs',
      );
      expect(await wantsOf(member)).toEqual([-6]);
      // A Pokémon: its dialog (plan 8R-1), whose read is all that comes before it opens, then
      // its Submit.
      const asked = command(member, 'want', { target: 'pokemon:147' });
      measured['/want, its dialog'] = await made.counted(asked);
      const dialog = shownDialog(asked);
      const submitted = fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        checked: { boxes: ['raids', 'research'] },
        userId: member,
        channelId: WEST_CHANNEL,
      });
      measured['/want, its Submit'] = await made.counted(submitted);
      expect(sent(submitted.editReply).content).toMatch(/^\*\*Dratini\*\*: Raids, Research\./);
      expect(await wantsOf(member)).toEqual([-6, 147]);
      expect(await type('/unwant, typing', typing(member, 'unwant', 'target', 'dra'))).toEqual([
        'Dratini: Raids, Research',
      ]);
      const listed = await use('/wants', command(member, 'wants'));
      expect(listed).toContain('Dratini');
      expect(listed).toContain('Perfect IVs**: Spawns');
      expect(await type('/target, typing', typing(member, 'target', 'gym', 'lib'))).toContain(
        'Pinewood Public Library · The Stacks',
      );
      expect(await use('/target', command(member, 'target', { gym: 'g:1' }))).toContain(
        'is one of your gyms now',
      );
      expect(await gymsOf(member)).toEqual([['1', 1]]);
      expect(await type('/untarget, typing', typing(member, 'untarget', 'gym', 'lib'))).toEqual([
        'Pinewood Public Library · The Stacks',
      ]);
      const reports = made.gateway.messagesIn(WEST_CHANNEL).length;
      expect(
        await use(
          '/wild',
          command(member, 'wild', { pokemon: 'dratini', details: 'by the fountain' }),
        ),
      ).toContain('Reported: a wild Dratini.');
      const posted = made.gateway.messagesIn(WEST_CHANNEL);
      expect(posted).toHaveLength(reports + 1);
      expect(textOf(posted.at(-1)?.message)).toContain('### Wild Dratini');
      // The staff member was let in, and the list has the Library.
      const staff = typing(member, 'gym', 'gym', 'lib', {
        subcommand: 'show',
        roleNames: ['Admin'],
      });
      expect((await type('/gym show, typing', staff)).join()).toContain('Pinewood Public Library');
    }
    // Carol wants the boss of the raid that is reported next: somebody is to be told.
    await made.wants.set(CAROL, FAKE_GUILD_ID, pokemonTarget(717), 'both');
    expect(
      await use('/raid', made.command(BOB, 'raid', { boss: 'b:yveltal:T5:0', gym: 'g:2' })),
    ).toContain('Reported: ');
    const raids = await db.selectFrom('Party').select(['type', 'gymId', 'status']).execute();
    expect(raids).toEqual([{ type: 'raid', gymId: 2, status: 'active' }]);
    expect(raids.length).toBe(made.store.active().length);
    // Carol was told of it, which is what the two reads on the side were for.
    expect(made.dms.recipients).toContain(CAROL);
    process.stdout.write(
      `${Object.entries(measured)
        .map(([name, { answered, settled }]) => `${name}: ${String(answered)} / ${String(settled)}`)
        .join('\n')}\n`,
    );

    // Until the member is answered, and until everything that follows is done.
    const limits: Record<string, { answered: number; settled: number }> = {
      // One statement: the row is written, or made, in one.
      '/settings mentions': { answered: 1, settled: 1 },
      // The settings, the new-train row, the history opt-in, the member's wants of both tables
      // (the lines of `/wants`, plan 8R-1) and their gyms: one read each.
      '/settings show': { answered: 6, settled: 6 },
      // begin, the lock on the member's row, their rows, the insert, commit.
      '/want': { answered: 5, settled: 5 },
      // The dialog's read (plan 8R-1): the subject's rows of both tables, by their keys.
      '/want, its dialog': { answered: 2, settled: 2 },
      // begin, the lock, the subject's rows of both tables, the inserts of both, commit.
      '/want, its Submit': { answered: 7, settled: 7 },
      // The member's rows of both tables, and nothing else: on every keystroke.
      '/unwant, typing': { answered: 2, settled: 2 },
      '/wants': { answered: 2, settled: 2 },
      // The gyms are in memory, and so is the row of the server.
      '/target, typing': { answered: 0, settled: 0 },
      '/target': { answered: 5, settled: 5 },
      '/untarget, typing': { answered: 1, settled: 1 },
      // The report is a message; who wants the Pokémon is read on the side, in one query.
      '/wild': { answered: 0, settled: 1 },
      '/gym show, typing': { answered: 0, settled: 0 },
      // The reporter's settings, the party's row, the steps of its party history (who signed up
      // when: one insert, plan 8H), and its post and its link line written to it as each exists;
      // on the side, who wants the boss and who the gym.
      '/raid': { answered: 5, settled: 7 },
    };
    expect(Object.keys(measured).sort()).toEqual(Object.keys(limits).sort());
    for (const [name, limit] of Object.entries(limits)) {
      expect(measured[name]?.answered, `${name}, answered`).toBeLessThanOrEqual(limit.answered);
      expect(measured[name]?.settled, `${name}, settled`).toBeLessThanOrEqual(limit.settled);
    }
    // Before plan 4F these were 8 for `/settings show`, 7 for `/want`, 8 for `/target`, 3 for
    // each list of a member's own and 1 for every keystroke of `/target`.
  });

  it('asks once for a row it has not seen, and makes a member’s row inside the transaction', async () => {
    const made = await bot();
    // The first want of a member without a row, in a server this process has not seen: the
    // looks for both rows, then begin, the member's row, the lock, the rows, the insert, commit.
    const first = await made.counted(made.command(ALICE, 'want', { target: 'iv:perfect' }));
    expect(first.settled).toBeLessThanOrEqual(8);
    // The first want of another member: only the look for their row comes before.
    const second = await made.counted(made.command(BOB, 'want', { target: 'iv:perfect' }));
    expect(second.settled).toBeLessThanOrEqual(7);
    // From then on nothing is asked twice.
    const third = await made.counted(made.command(BOB, 'want', { target: 'iv:zero' }));
    expect(third.settled).toBeLessThanOrEqual(5);
    expect(await made.wants.count(BOB, FAKE_GUILD_ID)).toBe(2);
    // A member without a row has nothing to list: the look for their row is all there is, and
    // it is made again the next time (a row that is missing is never remembered).
    for (let n = 0; n < 2; n++) {
      const typed = await made.counted(made.typing(CAROL, 'unwant', 'target', 'dra'));
      // The look for the row, by each of the two tables' reads (plan 8R-1).
      expect(typed.settled).toBe(2);
    }
  });
});
