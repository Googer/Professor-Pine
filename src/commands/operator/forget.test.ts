import { ButtonStyle, MessageFlags } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dialogOf, dialogText, shownDialog } from '../../../test/support/dialogs.js';
import {
  asV2,
  fakeButton,
  fakeChatInput,
  fakeMessage,
  fakeModal,
  sent,
  type FakeMessage,
  type FakeOptions,
  type FakeRow,
} from '../../../test/support/fake-interactions.js';
import { memberRemovalWith } from '../../../test/support/member-data.js';
import { buttonsOf, customIdsOf, textDisplays, textOf } from '../../../test/support/messages.js';
import type { RecordingDms } from '../../../test/support/dms.js';
import { testMeetup, testRaid, withAttendees } from '../../../test/support/parties.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { TEST_ENV } from '../../../test/support/test-env.js';
import { components } from '../../components/index.js';
import { REMOVAL_STEPS } from '../../db/repositories/member-data-repository.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { InteractionRouter } from '../../discord/router.js';
import { ONLY_OPERATORS, ONLY_OPERATORS_IN_A_DM } from '../../discord/guards.js';
import { instanceConfig, OPERATOR_ID } from '../../../test/support/operators.js';
import { operator } from './index.js';

const OWNER = TEST_ENV.OWNER_ID ?? '';
const MODERATOR = '700000000000000001';
const DEVELOPER = '700000000000000002';
const ASH = '300000000000000001';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

/** Everything the database can hold of a member, as `MemberDataRepository.held` counts it. */
const EVERYTHING = {
  user: {
    friendCode: true,
    inGameName: true,
    pokebattlerId: false,
    wants: 9,
    targetWants: 3,
    gymTargets: 1,
    savedRoutes: 2,
  },
  newTrains: 2,
  unownGifts: 1,
  history: { optIns: 2, boards: 1, fillIns: 1, named: 340, words: 3 },
  sessions: 2,
  toolAccess: true,
  reports: { reasons: 2, about: 1 },
  meetups: { blocks: 1, open: 1, unmade: 0, live: 0, over: 3 },
  audit: 5,
  stopReports: 1,
  stopConfirms: 2,
  accessGrants: 1,
  staffActs: 4,
};

/**
 * `requestsRepo`: the installation sends gym requests to that GitHub repository (`/request`);
 * `legacyPartiesDir`: it has the old bot's own `parties/` folder (`LEGACY_PARTIES_DIR`);
 * `operators`: the settings' `operators` (plan 19B-1).
 */
function setup(
  options: Parameters<typeof memberRemovalWith>[0] & {
    requestsRepo?: string;
    legacyPartiesDir?: string;
    operators?: string[];
  } = {},
) {
  const made = memberRemovalWith(options);
  const plain = createTestContext({ memberRemoval: made.removal });
  const base = plain.ctx;
  const { requestsRepo, legacyPartiesDir, operators } = options;
  /** `logged`: what the command itself logged (the service logs in `entries`). */
  const { ctx, entries: logged } =
    requestsRepo === undefined && legacyPartiesDir === undefined && operators === undefined
      ? plain
      : createTestContext({
          memberRemoval: made.removal,
          config: {
            ...instanceConfig(base, operators === undefined ? {} : { operators }),
            env: {
              ...base.config.env,
              ...(requestsRepo === undefined
                ? {}
                : { GITHUB_TOKEN: 'token', GITHUB_REPO: requestsRepo }),
              ...(legacyPartiesDir === undefined ? {} : { LEGACY_PARTIES_DIR: legacyPartiesDir }),
            },
          },
        });
  const router = new InteractionRouter(ctx, [operator], components);
  /** The private message of the latest look, as the owner sees it: its Submit edits it. */
  let look: FakeMessage | undefined;
  /** `/operator forget member:` as somebody; the owner, who needs no role, unless `by` says. */
  const ask = async (by: FakeOptions = { userId: OWNER }, memberId = ASH, inServer = true) => {
    const interaction = fakeChatInput({
      commandName: 'operator',
      subcommand: 'forget',
      resolved: { member: { id: memberId, bot: false, username: 'ash', globalName: 'Ash' } },
      // Discord sends the member with the option only for an account in this server.
      resolvedMembers: { member: inServer ? { displayName: 'Ash of Pallet' } : null },
      ...by,
    });
    await router.handle(interaction as never);
    const answer = interaction.editReply.mock.calls[0]?.[0];
    if (answer !== undefined) look = fakeMessage((answer.components ?? []) as FakeRow[]);
    return interaction;
  };
  const press = async (customId: string, by: FakeOptions = { userId: OWNER }) => {
    const interaction = fakeButton({
      customId,
      askedBy: OWNER,
      ephemeralMessage: true,
      v2Message: true,
      ...by,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const submit = async (
    dialog: NonNullable<ReturnType<typeof dialogOf>>,
    by: FakeOptions = { userId: OWNER },
    prepare: (interaction: ReturnType<typeof fakeModal>) => void = () => undefined,
  ) => {
    // Submitted from the look's message, the owner's private answer.
    const interaction = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      askedBy: OWNER,
      ephemeralMessage: true,
      v2Message: true,
      ...(look === undefined ? {} : { message: look }),
      ...by,
    });
    prepare(interaction);
    await router.handle(interaction as never);
    return interaction;
  };
  /** The latest look's message as it is now. */
  const lookNow = (): V2Message => ({
    v2: true,
    components: (look?.rows ?? []) as unknown as V2Message['components'],
  });
  /** The jobs of the DM queue: what the owner was told (plan 19B-1). */
  const toldOwner = () => (ctx.dms as RecordingDms).jobs;
  return { ...made, logged, ask, press, submit, lookNow, toldOwner };
}

/** The command's answer as a message, and its text. */
const lookOf = (interaction: { editReply: Parameters<typeof sent>[0] }) =>
  asV2(sent(interaction.editReply));
const refusalOf = (interaction: { reply: Parameters<typeof sent>[0] }) =>
  (sent(interaction.reply) as { content?: string } | undefined)?.content;

describe('/operator forget', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is the instance operators’ alone: a moderator and a bot developer are refused, and nothing is looked up', async () => {
    const { ask, data } = setup();
    data.hold(ASH, EVERYTHING);
    const moderator = await ask({ userId: MODERATOR, roleNames: ['Moderator'] });
    expect(refusalOf(moderator)).toBe(ONLY_OPERATORS);
    const developer = await ask({ userId: DEVELOPER, roleNames: ['Bot Developer'] });
    expect(refusalOf(developer)).toBe(ONLY_OPERATORS);
    // Somebody who is no staff at all is refused by `/operator` itself.
    const member = await ask({ userId: '700000000000000003' });
    expect(refusalOf(member)).toBe('Only admins, moderators and bot developers can do that.');
    for (const refused of [moderator, developer, member]) {
      expect(refused.deferReply).not.toHaveBeenCalled();
      expect(sent(refused.reply)).toMatchObject({ flags: MessageFlags.Ephemeral });
    }
    expect(data.looks).toEqual([]);
    expect(data.removals).toEqual([]);
  });

  it('shows the owner what Pine holds, what the removal takes and what it leaves, and changes nothing', async () => {
    const live = [
      testRaid({ createdById: ASH }),
      withAttendees(testMeetup({ createdById: MODERATOR }), { [ASH]: {} }),
    ];
    const { ask, data, screenshots } = setup({ parties: live });
    data.hold(ASH, EVERYTHING);
    screenshots.keep(ASH, 4, 1);

    const asked = await ask();

    expect(asked.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const look = lookOf(asked);
    expect(textOf(look).split('\n')).toEqual([
      `### What Pine holds of **Ash of Pallet** (<@${ASH}>)`,
      'Across every server.',
      '**Remove… takes away, for good:**',
      '- Their settings, with their friend code and in-game name',
      '- 12 wants, 1 gym notice and 2 saved routes',
      '- Their new-train notices in 2 servers',
      '- The record of their one-time Unown want in 1 server',
      '- Their history switch in 2 servers and their place on the boards in 1',
      '- Their Discord id on 340 history entries (the entries stay and count, without it)',
      '- The name and description of 3 trains and meetups they made, in the history',
      '- 1 request to add their old-bot history',
      '- 2 web logins',
      '- Their access to the Wayfarer export tool',
      '- Their Discord id and name on 2 reports they made to the moderators',
      '- Their Discord id and name on 3 meetup requests, appeals and place asks that are ' +
        'decided and over',
      '- 4 kept screenshots they sent, and their feedback on 1 other',
      '**It leaves:**',
      '- 1 meetup block, lifted or not: the moderators need it for the safety of others.',
      '- 1 report to the moderators about them: the moderators’ record.',
      '- Their reasons on 2 reports to the moderators and the words of 3 meetup requests, ' +
        'appeals and place asks of theirs (a meetup’s name, information and place; an ' +
        'appeal’s or ask’s text) stay, without their name or Discord id: the moderators’ ' +
        'record.',
      '- 1 meetup request, appeal or place ask of theirs is still open and keeps their ' +
        'Discord id and name: have the moderators decide it, then run this again.',
      '- 5 entries of the staff’s log of who did what that name them: they age out after 30 ' +
        'days.',
      '- What is live ends by itself: 2 parties they made or signed up for (their settings go ' +
        'at once: until those end, Pine treats them in those as a new member), 1 report at a ' +
        'stop, 2 confirmations of others’ reports at stops, 1 forum they were let into for a ' +
        'party.',
      '- 4 records of what they did as staff (decisions, rulings, boss overrides, gyms and ' +
        'stops): the servers’ record.',
      '- Counts without a name: the history’s entries and the activity.',
      '- Wild spawns they reported name them for about half an hour (the region’s message, the ' +
        'map), and the database holds no id of theirs; the direct messages others got of them ' +
        'keep the name they had.',
      '**Left for you to do by hand:**',
      '- Backups made before the removal hold this data until they age out ' +
        '(`BACKUP_KEEP_DAYS`: 90 days unless you changed it).',
      '- The bot’s logs can hold their Discord id (a command they used, an error); they roll ' +
        'over by themselves.',
      '- Posts on Discord that name them are not edited.',
      '-# Only you can press Remove…, within 10 minutes. Nothing is sent to them.',
    ]);
    expect(buttonsOf(look)).toMatchObject([{ label: 'Remove…', style: ButtonStyle.Danger }]);
    expect(customIdsOf(look)).toEqual([expect.stringMatching(/^forget:[0-9a-f]{16}:ask$/)]);
    // Nobody is pinged, and nothing has changed.
    expect(sent(asked.editReply)).not.toHaveProperty('content');
    expect(data.removals).toEqual([]);
  });

  it('asks once more in a dialog, and removes only on its Submit', async () => {
    const { ask, press, submit, data, screenshots, entries, ended, reporters, lookNow, toldOwner } =
      setup();
    data.hold(ASH, EVERYTHING);
    screenshots.keep(ASH, 4, 1);
    const [remove] = customIdsOf(lookOf(await ask()));
    expect(reporters).toEqual([]);

    const pressed = await press(remove ?? '');
    const dialog = shownDialog(pressed);
    expect(dialog.title).toBe('Remove a member’s data');
    expect(dialogText(dialog)).toBe(
      'Remove what Pine holds of **Ash of Pallet** across every server?\n' +
        'This cannot be undone. Submit removes it.',
    );
    // The press itself removes nothing, and neither does closing the dialog.
    expect(pressed.deferReply).not.toHaveBeenCalled();
    expect(data.removals).toEqual([]);

    expect(buttonsOf(lookNow())).toMatchObject([{ label: 'Remove…' }]);
    const submitted = await submit(dialog);
    // Answered in the look's place: the look no longer offers Remove….
    expect(submitted.deferUpdate).toHaveBeenCalled();
    expect(submitted.deferReply).not.toHaveBeenCalled();
    expect(buttonsOf(lookNow())).toEqual([]);
    expect(textOf(lookNow())).toContain('### Removed the data of **Ash of Pallet**');
    expect(data.removals).toEqual([ASH]);
    expect(ended).toHaveLength(2);
    // Their reasons held in memory for a report's next post go too.
    expect(reporters).toEqual([ASH]);
    const outcome = asV2(sent(submitted.editReply));
    expect(textOf(outcome).split('\n')).toEqual([
      `### Removed the data of **Ash of Pallet** (<@${ASH}>)`,
      '**Removed, from every server:**',
      '- Their settings, with their friend code and in-game name',
      '- 12 wants, 1 gym notice and 2 saved routes',
      '- Their new-train notices in 2 servers',
      '- The record of their one-time Unown want in 1 server',
      '- Their history switch in 2 servers and their place on the boards in 1',
      '- Their Discord id on 340 history entries (the entries stay and count, without it)',
      '- The name and description of 3 trains and meetups they made, in the history',
      '- 1 request to add their old-bot history',
      '- 2 web logins',
      '- Their access to the Wayfarer export tool',
      '- Their Discord id and name on 2 reports they made to the moderators',
      '- Their Discord id and name on 3 meetup requests, appeals and place asks that are ' +
        'decided and over',
      '- 4 kept screenshots they sent, and their feedback on 1 other',
      '**Left:**',
      '- 1 meetup block, lifted or not: the moderators need it for the safety of others.',
      '- 1 report to the moderators about them: the moderators’ record.',
      // Counted before the ids went: the look after the removal no longer finds them.
      '- Their reasons on 2 reports to the moderators and the words of 3 meetup requests, ' +
        'appeals and place asks of theirs (a meetup’s name, information and place; an ' +
        'appeal’s or ask’s text) stay, without their name or Discord id: the moderators’ ' +
        'record.',
      '- 1 meetup request, appeal or place ask of theirs is still open and keeps their ' +
        'Discord id and name: have the moderators decide it, then run this again.',
      '- 5 entries of the staff’s log of who did what that name them: they age out after 30 ' +
        'days.',
      '- What is live ends by itself: 1 report at a stop, 2 confirmations of others’ reports ' +
        'at stops, 1 forum they were let into for a party.',
      '- 4 records of what they did as staff (decisions, rulings, boss overrides, gyms and ' +
        'stops): the servers’ record.',
      '- Counts without a name: the history’s entries and the activity.',
      '- Wild spawns they reported name them for about half an hour (the region’s message, the ' +
        'map), and the database holds no id of theirs; the direct messages others got of them ' +
        'keep the name they had.',
      '**Left for you to do by hand:**',
      '- Backups made before the removal hold this data until they age out ' +
        '(`BACKUP_KEEP_DAYS`: 90 days unless you changed it).',
      '- The bot’s logs can hold their Discord id (a command they used, an error); they roll ' +
        'over by themselves.',
      '- Posts on Discord that name them are not edited.',
    ]);
    expect(buttonsOf(outcome)).toEqual([]);
    // The owner removed it: nobody is told (plan 19B-1).
    expect(toldOwner()).toEqual([]);
    // One line says who was removed and who asked.
    expect(
      entries.filter((entry) => entry.msg === 'removed a member’s data on request'),
    ).toMatchObject([{ member: ASH, by: OWNER }]);

    // The look is answered: its button no longer removes anything.
    const again = await press(remove ?? '');
    expect(dialogOf(again)).toBeUndefined();
    expect(refusalOf(again)).toBe('That has expired. Use the command again.');
    expect(data.removals).toEqual([ASH]);
  });

  it('is an operator’s of the settings too, also in a DM with the bot (plan 19B-1)', async () => {
    const { ask, press, submit, data, toldOwner } = setup({ operators: [OPERATOR_ID] });
    data.hold(ASH, EVERYTHING);
    const operatorInDm = { userId: OPERATOR_ID, isDm: true, globalName: 'Ollie' };
    // Staff of a server are refused in a DM as in their server.
    const moderator = await ask({ userId: MODERATOR, roleNames: ['Moderator'], isDm: true });
    expect(refusalOf(moderator)).toBe(ONLY_OPERATORS_IN_A_DM);
    const asked = await ask(operatorInDm, ASH, false);
    expect(textOf(lookOf(asked))).toContain('### What Pine holds of **Ash** (<@');
    const [remove] = customIdsOf(lookOf(asked));
    const dialog = shownDialog(await press(remove ?? '', operatorInDm));
    await submit(dialog, operatorInDm);
    expect(data.removals).toEqual([ASH]);
    // The owner is told who removed somebody's data, and from where; never whose.
    const told = toldOwner();
    expect(told.map((job) => job.userId)).toEqual([OWNER]);
    expect(told.map((job) => textDisplays(job.message).slice(1))).toEqual([
      [
        `**Ollie** · ${OPERATOR_ID}\nfrom a direct message`,
        'Removed a member’s data on request, in every server (`/operator forget`).',
      ],
    ]);
    const all = JSON.stringify(told);
    expect(all).not.toContain(ASH);
    expect(all).not.toContain('Ash');
  });

  it('lets only the owner press and submit', async () => {
    const { ask, press, submit, data } = setup();
    data.hold(ASH, EVERYTHING);
    const [remove] = customIdsOf(lookOf(await ask()));
    const moderator = { userId: MODERATOR, roleNames: ['Moderator'] };

    const pressed = await press(remove ?? '', moderator);
    expect(dialogOf(pressed)).toBeUndefined();
    expect(refusalOf(pressed)).toBe(ONLY_OPERATORS);

    // A Submit that somebody else sends for the owner's question is refused the same way.
    const dialog = shownDialog(await press(remove ?? ''));
    const forged = await submit(dialog, moderator);
    expect(refusalOf(forged)).toBe(ONLY_OPERATORS);
    expect(forged.deferReply).not.toHaveBeenCalled();
    expect(data.removals).toEqual([]);

    // The owner's own Submit still stands.
    await submit(dialog);
    expect(data.removals).toEqual([ASH]);
  });

  it('lets the look expire as other pending questions do', async () => {
    const { ask, press, submit, data } = setup();
    data.hold(ASH, EVERYTHING);
    const [remove] = customIdsOf(lookOf(await ask()));
    const dialog = shownDialog(await press(remove ?? ''));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1);

    const late = await press(remove ?? '');
    expect(dialogOf(late)).toBeUndefined();
    expect(refusalOf(late)).toBe('That has expired. Use the command again.');
    // A dialog left open past it expires too.
    const lateSubmit = await submit(dialog);
    expect(refusalOf(lateSubmit)).toBe('That has expired. Use the command again.');
    expect(lateSubmit.deferReply).not.toHaveBeenCalled();
    expect(data.removals).toEqual([]);
  });

  it('says there is nothing to remove, without a button: for an unknown id, and run again', async () => {
    const { ask, press, submit, data } = setup();
    // Somebody Pine has never met, who is not in this server.
    const unknown = lookOf(await ask({ userId: OWNER }, '300000000000000009', false));
    expect(textOf(unknown).split('\n')).toEqual([
      '### What Pine holds of **Ash** (<@300000000000000009>)',
      'Nothing that a removal would take: there is nothing to remove.',
      '**Left for you to do by hand:**',
      '- Backups made before the removal hold this data until they age out ' +
        '(`BACKUP_KEEP_DAYS`: 90 days unless you changed it).',
      // Whoever Pine never kept a row of may still be in its logs.
      '- The bot’s logs can hold their Discord id (a command they used, an error); they roll ' +
        'over by themselves.',
      '- Posts on Discord that name them are not edited.',
    ]);
    expect(buttonsOf(unknown)).toEqual([]);
    expect(data.removals).toEqual([]);

    // Removed once, a second run finds what was left and nothing more to take.
    data.hold(ASH, EVERYTHING);
    const [remove] = customIdsOf(lookOf(await ask()));
    await submit(shownDialog(await press(remove ?? '')));
    const second = lookOf(await ask());
    const lines = textOf(second).split('\n');
    expect(lines.slice(0, 3)).toEqual([
      `### What Pine holds of **Ash of Pallet** (<@${ASH}>)`,
      'Nothing that a removal would take: there is nothing to remove.',
      '**What stays:**',
    ]);
    expect(lines).toContain(
      '- 1 meetup block, lifted or not: the moderators need it for the safety of others.',
    );
    expect(buttonsOf(second)).toEqual([]);
    expect(data.removals).toEqual([ASH]);
  });

  it('names the old-bot history files to delete by hand where the member index holds any', async () => {
    const { ask, press, submit, data } = setup({ index: { [ASH]: [HOME, AWAY] } });
    data.hold(ASH, EVERYTHING);
    const asked = lookOf(await ask());
    const byHand =
      '- Their old-bot history on the host, which I can only read: delete ' +
      `\`${HOME}/${ASH}.json\` and \`${AWAY}/${ASH}.json\` in the member index folder ` +
      '(`LEGACY_INDEX_DIR`).';
    const lines = textOf(asked).split('\n');
    expect(lines[lines.indexOf('**Left for you to do by hand:**') + 1]).toBe(byHand);
    // After the removal the files are still there: the answer says so again.
    const [remove] = customIdsOf(asked);
    const outcome = await submit(shownDialog(await press(remove ?? '')));
    expect(textOf(asV2(sent(outcome.editReply))).split('\n')).toContain(byHand);
    // Without a file of theirs, or without an index, nothing is said of it.
    const other = setup({ index: {} });
    expect(textOf(lookOf(await other.ask()))).not.toContain('old-bot history on the host');
    expect(textOf(lookOf(await setup().ask()))).not.toContain('old-bot history on the host');
  });

  it('names the public gym requests on GitHub and the old bot’s folder among the hand-work where the installation has them', async () => {
    const { ask, press, submit, data } = setup({
      requestsRepo: 'owner/repo',
      legacyPartiesDir: '/legacy/parties',
    });
    data.hold(ASH, EVERYTHING);
    const asked = lookOf(await ask());
    const onGitHub =
      '- Gym requests they sent with `/request` are public issues of `owner/repo` on GitHub, ' +
      'under the name they had: edit or delete them there.';
    const oldFolder =
      '- The old bot’s own `parties/` folder on the host (`LEGACY_PARTIES_DIR`) holds their ' +
      'Discord id in the files of the parties they made or joined, as that bot wrote them; I ' +
      'can only read it: edit those files there.';
    const lines = textOf(asked).split('\n');
    expect(lines.slice(lines.indexOf('**Left for you to do by hand:**') + 1)).toEqual([
      oldFolder,
      '- Backups made before the removal hold this data until they age out ' +
        '(`BACKUP_KEEP_DAYS`: 90 days unless you changed it).',
      '- The bot’s logs can hold their Discord id (a command they used, an error); they roll ' +
        'over by themselves.',
      onGitHub,
      '- Posts on Discord that name them are not edited.',
      '-# Only you can press Remove…, within 10 minutes. Nothing is sent to them.',
    ]);
    const [remove] = customIdsOf(asked);
    const outcome = await submit(shownDialog(await press(remove ?? '')));
    const after = textOf(asV2(sent(outcome.editReply))).split('\n');
    expect(after).toContain(onGitHub);
    expect(after).toContain(oldFolder);
    // Without `/request` or the folder nothing is said of them.
    const plain = textOf(lookOf(await setup().ask()));
    expect(plain).not.toContain('GitHub');
    expect(plain).not.toContain('LEGACY_PARTIES_DIR');
  });

  it('says which step failed and that nothing was removed', async () => {
    const { ask, press, submit, data, entries, reporters, lookNow } = setup();
    data.hold(ASH, EVERYTHING);
    data.failing = REMOVAL_STEPS.history;
    const [remove] = customIdsOf(lookOf(await ask()));
    const failed = await submit(shownDialog(await press(remove ?? '')));
    // In the look's place too: its Remove… is taken, as the look is.
    expect(buttonsOf(lookNow())).toEqual([]);
    expect(textOf(asV2(sent(failed.editReply))).split('\n')).toEqual([
      `### Nothing was removed of **Ash of Pallet** (<@${ASH}>)`,
      'The database refused the removal at **their history**, so I undid all of it: ' +
        'everything is as it was. The log says why. Use the command again once that is solved.',
    ]);
    expect(data.removals).toEqual([]);
    // Nothing outside the database is touched either.
    expect(reporters).toEqual([]);
    expect(
      entries.filter((entry) => entry.msg === 'could not remove a member’s data; nothing changed'),
    ).toMatchObject([{ member: ASH, by: OWNER, step: 'their history' }]);
    // The same look still holds everything.
    expect(textOf(lookOf(await ask()))).toContain('- 2 web logins');
  });

  it('says the data was removed when only the look after it fails, and to look again', async () => {
    const { ask, press, submit, data, entries } = setup();
    data.hold(ASH, EVERYTHING);
    const [remove] = customIdsOf(lookOf(await ask()));
    const pressed = await press(remove ?? '');
    // The removal commits; the database fails the look that follows it.
    data.lookFailing = true;
    const submitted = await submit(shownDialog(pressed));
    expect(data.removals).toEqual([ASH]);
    const lines = textOf(asV2(sent(submitted.editReply))).split('\n');
    expect(lines[0]).toBe(`### Removed the data of **Ash of Pallet** (<@${ASH}>)`);
    expect(lines).toContain('- 2 web logins');
    expect(lines).toContain(
      'I could not look at what is left of them just now: use the command again to see it.',
    );
    // Nothing of a failure: the data is gone.
    expect(lines.join('\n')).not.toContain('Nothing was removed');
    expect(lines.join('\n')).not.toContain('Something went wrong');
    expect(
      entries.filter((entry) => entry.msg === 'removed a member’s data on request'),
    ).toHaveLength(1);
    expect(
      entries.filter(
        (entry) => entry.msg === 'could not look at what is left of a member after the removal',
      ),
    ).toMatchObject([{ level: 40, member: ASH }]);
  });

  it('still answers when the look can no longer be edited (dismissed, its token lapsed)', async () => {
    const { ask, press, submit, data, entries, logged } = setup();
    data.hold(ASH, EVERYTHING);
    const [remove] = customIdsOf(lookOf(await ask()));
    const pressed = await press(remove ?? '');
    const submitted = await submit(shownDialog(pressed), { userId: OWNER }, (interaction) => {
      // Discord refuses the edit of the look, once: the owner dismissed it.
      interaction.editReply.mockImplementationOnce(() =>
        Promise.reject(new Error('Unknown Message')),
      );
    });
    expect(data.removals).toEqual([ASH]);
    // The outcome comes below, privately, whole.
    const below = sent(submitted.followUp);
    expect(below.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    const lines = textOf(asV2(below)).split('\n');
    expect(lines[0]).toBe(`### Removed the data of **Ash of Pallet** (<@${ASH}>)`);
    expect(lines).toContain('- 2 web logins');
    expect(
      logged.filter((entry) => entry.msg === 'could not show the outcome in place of the look'),
    ).toMatchObject([{ level: 40, member: ASH }]);
    expect([...entries, ...logged].some((entry) => Number(entry.level) >= 50)).toBe(false);
  });

  it('does not answer a committed removal as a failure when its answer cannot be sent', async () => {
    const { ask, press, submit, data, entries, logged } = setup();
    data.hold(ASH, EVERYTHING);
    const [remove] = customIdsOf(lookOf(await ask()));
    const pressed = await press(remove ?? '');
    const submitted = await submit(shownDialog(pressed), { userId: OWNER }, (interaction) => {
      // Discord refuses the outcome, in the look's place and below it.
      interaction.editReply.mockImplementationOnce(() =>
        Promise.reject(new Error('Invalid Form Body')),
      );
      interaction.followUp.mockImplementationOnce(() =>
        Promise.reject(new Error('Invalid Form Body')),
      );
    });
    expect(data.removals).toEqual([ASH]);
    // Nothing more is tried: no "Something went wrong" after the data is gone.
    expect(submitted.editReply).toHaveBeenCalledTimes(1);
    expect(submitted.followUp).toHaveBeenCalledTimes(1);
    expect(
      logged.filter(
        (entry) => entry.msg === 'removed a member’s data; the answer could not be sent',
      ),
    ).toMatchObject([{ level: 40, member: ASH }]);
    expect([...entries, ...logged].some((entry) => Number(entry.level) >= 50)).toBe(false);
  });

  it('says so when a kept screenshot could not be removed', async () => {
    const { ask, press, submit, data, screenshots } = setup();
    data.hold(ASH, { sessions: 1 });
    screenshots.keep(ASH, 3);
    screenshots.failing = 1;
    const [remove] = customIdsOf(lookOf(await ask()));
    const outcome = await submit(shownDialog(await press(remove ?? '')));
    const lines = textOf(asV2(sent(outcome.editReply))).split('\n');
    expect(lines.slice(1, 5)).toEqual([
      '**Removed, from every server:**',
      '- 1 web login',
      '- 2 kept screenshots they sent',
      '**1 kept screenshot could not be removed** (the log says why): run this again for it.',
    ]);
  });

  it('says in its help that it is the operators’, and what it takes and leaves', () => {
    const part = operator.subcommands.get('forget');
    const details = typeof part?.help?.details === 'string' ? part.help.details : '';
    expect(details).toContain(
      'Only the operators of this Pine (its owner and those its settings name) can use it',
    );
    expect(details).toContain('cannot be undone');
    expect(details).toContain('meetup blocks');
    // As the removal does since fix round 1: ids too, and what they wrote of their parties.
    expect(details).toContain('their id and name off the reports they made to the moderators');
    // Only those recorded with their id: made while their history was on (final review).
    expect(details).toContain(
      'the trains and meetups they made while their history was on (a record made without it ' +
        'does not say who made it)',
    );
    expect(part?.help?.examples).toEqual(['/operator forget member:@Ash']);
  });
});
