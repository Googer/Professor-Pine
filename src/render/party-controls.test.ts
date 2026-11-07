import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  PARTY_NOW,
  testMeetup,
  testRaid,
  testRaidRules,
  testTrain,
  withAttendees,
} from '../../test/support/parties.js';
import { decodeCustomId, MAX_CUSTOM_ID_LENGTH } from '../discord/custom-id.js';
import type { Party, RaidParty } from '../domain/party/party.js';
import { setHatchTime } from '../domain/party/raid.js';
import {
  bottomControls,
  completionQuestion,
  manageTrainButton,
  moveTrainButton,
  statusButton,
  type ControlIcons,
  groupWords,
  isPartyAction,
  isRaidAction,
  PARTY_ACTIONS,
  PARTY_KIND,
  splitGroupButton,
  customIconText,
  statusIcon,
  wholeRouteButton,
} from './party-controls.js';
import type { PostButton } from './party-post.js';

/** An application without emoji of its own (the plain ones stand in). */
const NO_ICONS: ControlIcons = {};

/** The id of an application emoji in these tests. */
const EMOJI_ID = '1400823744760905729';

/** An application with legacy Pine's icons as its emoji, as message text. */
const PINE_ICONS: ControlIcons = {
  controlIcon: (name) => (name.startsWith('pine') ? `<:${name}:${EMOJI_ID}>` : undefined),
};

/** The emoji of a button of a post. */
const emojiOf = ({ button }: PostButton) => ('emoji' in button ? button.emoji : undefined);

/** A raid with times: it has Meet… and no "Set time". */
const timed = setHatchTime(testRaid(), PARTY_NOW + 30 * 60_000, testRaidRules(), PARTY_NOW);

/**
 * The rows of the controls of a post of this party: per button its emoji (a custom one by its
 * name), its label when it has one, and its action.
 */
function rows(party: Party, emoji: ControlIcons = NO_ICONS, opens: PostButton[] = []) {
  return bottomControls(party, { emoji, opens }).map((row) =>
    row.map(({ button }) => {
      const label = 'label' in button ? button.label : undefined;
      const shown = 'emoji' in button ? button.emoji?.name : undefined;
      const action = 'custom_id' in button ? decodeCustomId(button.custom_id)?.action : undefined;
      return [shown, label, action].filter((part) => part !== undefined).join(' ');
    }),
  );
}

/** The actions of each row. */
const actions = (party: Party, opens: PostButton[] = []) =>
  bottomControls(party, { emoji: NO_ICONS, opens }).map((row) =>
    row.map(({ button }) =>
      'custom_id' in button ? decodeCustomId(button.custom_id)?.action : undefined,
    ),
  );

const withShot = <P extends RaidParty>(raid: P): P => ({
  ...raid,
  raid: { ...raid.raid, screenshot: { id: 'a1', timeUncertain: false } },
});

describe('the controls of a post (plan 8X-1B: one layout for one group and several)', () => {
  it('has the statuses and Leave, then Meet…, the head count and Remote, then Group…, as icons', () => {
    // Matt, 2026-10-20: the first two rows icons only, legacy Pine's order; the buttons with a
    // label, which open something, in the third.
    expect(rows(withAttendees(timed, { [ALICE]: {} }))).toEqual([
      ['🤔 maybe', '🏃 join', '✅ here', '🎉 done', '👋 leave'],
      ['⏰ meet', '⬇️ less', '⬆️ more', '📡 remote'],
      ['👥 Group… regroup', 'Manage… manage'],
    ]);
  });

  it("shows legacy Pine's icons where the application has them, by id and name", () => {
    expect(rows(timed, PINE_ICONS)).toEqual([
      ['🤔 maybe', 'pinejoin join', 'pinehere here', 'pinedone done', 'pineleave leave'],
      ['pinemeet meet', '⬇️ less', '⬆️ more', 'pineremote remote'],
      ['👥 Group… regroup', 'Manage… manage'],
    ]);
    expect(emojiOf(statusButton(timed, 'present', PINE_ICONS))).toEqual({
      id: EMOJI_ID,
      name: 'pinehere',
    });
    const animated: ControlIcons = { controlIcon: (name) => `<a:${name}:${EMOJI_ID}>` };
    expect(emojiOf(statusButton(timed, 'complete', animated))).toEqual({
      id: EMOJI_ID,
      name: 'pinedone',
      animated: true,
    });
  });

  it('keeps the plain emoji where an emoji of that name is no custom emoji', () => {
    const odd: ControlIcons = { controlIcon: () => '🦶' };
    expect(emojiOf(statusButton(timed, 'coming', odd))).toEqual({ name: '🏃' });
    const broken: ControlIcons = { controlIcon: () => '<:pinejoin:>' };
    expect(emojiOf(statusButton(timed, 'coming', broken))).toEqual({ name: '🏃' });
  });

  it('gives each status line the icon of its button, as text', () => {
    expect(
      (['interested', 'coming', 'present', 'complete'] as const).map((status) =>
        statusIcon(PINE_ICONS, status),
      ),
    ).toEqual([
      '🤔',
      `<:pinejoin:${EMOJI_ID}>`,
      `<:pinehere:${EMOJI_ID}>`,
      `<:pinedone:${EMOJI_ID}>`,
    ]);
    expect(statusIcon(NO_ICONS, 'present')).toBe('✅');
    // Plan 8M-11A: the application's emoji alone, by the same resolver; none where it has none.
    expect(
      customIconText({ controlIcon: () => '<:pinetrain:1400823744760905730>' }, 'pinetrain'),
    ).toBe('<:pinetrain:1400823744760905730>');
    expect(customIconText(NO_ICONS, 'pinetrain')).toBeUndefined();
    expect(customIconText({ controlIcon: () => '🚆' }, 'pinetrain')).toBeUndefined();
    expect(statusIcon({ controlIcon: () => '🦶' }, 'coming')).toBe('🏃');
  });

  it('is the same with one group and with several: no group has buttons of its own', () => {
    const grouped: RaidParty = {
      ...withAttendees(timed, { [ALICE]: { group: 'B' } }),
      groups: [{ id: 'A' }, { id: 'B' }],
    };
    expect(rows(grouped)).toEqual(rows(withAttendees(timed, { [ALICE]: {} })));
  });

  it('has Group… switched off while nobody is signed up, and on for everybody once one is', () => {
    const groupButton = (party: Party) =>
      bottomControls(party, { emoji: NO_ICONS })
        .flat()
        .find(({ button }) => 'custom_id' in button && button.custom_id.endsWith(':regroup'));
    const nobody = { ...timed, attendees: {} };
    expect(groupButton(nobody)?.button).toMatchObject({ disabled: true, label: 'Group…' });
    expect(groupButton(timed)?.button).not.toHaveProperty('disabled');
  });

  it('names the party in every custom id, within the length Discord allows', () => {
    for (const party of [timed, testRaid(), testTrain(), testMeetup()]) {
      for (const { button } of bottomControls(party, { emoji: PINE_ICONS }).flat()) {
        if (!('custom_id' in button)) throw new Error('a control without a custom id');
        expect(button.custom_id.length).toBeLessThanOrEqual(MAX_CUSTOM_ID_LENGTH);
        const id = decodeCustomId(button.custom_id);
        expect(id).toMatchObject({ kind: PARTY_KIND, id: party.id });
        expect(isPartyAction(id?.action ?? '')).toBe(true);
      }
    }
  });

  it('is the same whatever the time: no control is switched off for it', () => {
    const egg = testRaid();
    const hatched = testRaid({ boss: { key: 'yveltal' } });
    expect(rows(egg)).toEqual(rows(hatched));
    expect(
      bottomControls(egg, { emoji: NO_ICONS })
        .flat()
        .some(({ button }) => button.disabled),
    ).toBe(false);
  });

  it('puts Set time in the place of Meet… while the raid has no times, after Group… and Manage…', () => {
    // A meeting time needs the raid's times: the two never show together.
    expect(actions(testRaid())).toEqual([
      ['maybe', 'join', 'here', 'done', 'leave'],
      ['less', 'more', 'remote'],
      ['regroup', 'manage', 'time'],
    ]);
    expect(actions(withShot(testRaid()))).toEqual([
      ['maybe', 'join', 'here', 'done', 'leave'],
      ['less', 'more', 'remote'],
      ['regroup', 'manage', 'time', 'shot'],
    ]);
    expect(actions(withShot(timed))).toEqual([
      ['maybe', 'join', 'here', 'done', 'leave'],
      ['meet', 'less', 'more', 'remote'],
      ['regroup', 'manage', 'shot'],
    ]);
    expect(rows(withShot(testRaid())).at(-1)).toEqual([
      '👥 Group… regroup',
      'Manage… manage',
      '⏰ Set time… time',
      '📷 Screenshot feedback shot',
    ]);
  });

  it('has no remote switch for an elite raid', () => {
    const elite = setHatchTime(
      testRaid({ tier: { level: 'Elite', shadow: false } }),
      PARTY_NOW + 30 * 60_000,
      testRaidRules(),
      PARTY_NOW,
    );
    expect(actions(elite)[1]).toEqual(['meet', 'less', 'more']);
  });

  it('gives a train no Done and no Meet…, and its own labelled buttons after Group…, words only', () => {
    const train = testTrain();
    const opens = [
      moveTrainButton(train),
      manageTrainButton(train),
      splitGroupButton(train),
      wholeRouteButton(train),
    ];
    // Plan 8X-G (Matt, 2026-10-22): Group… · Move… · Manage… · Split… · Route, no emoji.
    expect(rows(train, NO_ICONS, opens)).toEqual([
      ['🤔 maybe', '🏃 join', '✅ here', '👋 leave'],
      ['⬇️ less', '⬆️ more', '📡 remote'],
      ['Group… regroup', 'Move… move', 'Manage… manage', 'Split… split', 'Route route'],
    ]);
    // A raid's Group… keeps its emoji.
    expect(rows(testRaid())[2]?.[0]).toBe('👥 Group… regroup');
  });

  it('gives a meetup, which has no groups, no Done, Meet… or Group…, and Manage… alone in the third row', () => {
    expect(rows(testMeetup())).toEqual([
      ['🤔 maybe', '🏃 join', '✅ here', '👋 leave'],
      ['⬇️ less', '⬆️ more', '📡 remote'],
      ['Manage… manage'],
    ]);
  });

  it('has buttons that say no word but Group… and those that open something', () => {
    const party = testRaid();
    expect(statusButton(party, 'coming', NO_ICONS).button).toEqual({
      type: ComponentType.Button,
      style: ButtonStyle.Primary,
      emoji: { name: '🏃' },
      custom_id: `party:${party.id}:join`,
    });
    expect(moveTrainButton(party)).toMatchObject({
      moves: true,
      button: { label: 'Move…', custom_id: `party:${party.id}:move` },
    });
    expect(manageTrainButton(party)).toMatchObject({
      moves: true,
      button: { label: 'Manage…', custom_id: `party:${party.id}:manage` },
    });
  });

  it('knows its own actions and no others, and which only a raid has', () => {
    for (const action of PARTY_ACTIONS) expect(isPartyAction(action)).toBe(true);
    expect(isPartyAction('gym')).toBe(false);
    // The letter Join of a post drawn before plan 8X-1B still works: a train has groups too.
    expect(isPartyAction('group')).toBe(true);
    expect(isRaidAction('group')).toBe(false);
    // Set time and Screenshot feedback only: Done, its answers and Meet… are a max battle's too.
    expect(isRaidAction('time')).toBe(true);
    expect(isRaidAction('shot')).toBe(true);
    for (const battles of ['done', 'answer', 'meet']) expect(isRaidAction(battles)).toBe(false);
    expect(isRaidAction('regroup')).toBe(false);
  });
});

describe('completionQuestion', () => {
  it('names the members and offers the two answers', () => {
    const party = testRaid();
    const question = completionQuestion(party.id, [ALICE, BOB], 5);
    expect(question.content).toBe(
      `<@${ALICE}>, <@${BOB}>: have you completed this raid? ` +
        'Without an answer within 5 minutes I will take it that you have.',
    );
    const buttons = question.components[0]?.components ?? [];
    expect(
      buttons.map((b) => ('custom_id' in b ? decodeCustomId(b.custom_id) : undefined)),
    ).toEqual([
      { kind: PARTY_KIND, id: party.id, action: 'answer', args: ['yes'] },
      { kind: PARTY_KIND, id: party.id, action: 'answer', args: ['no'] },
    ]);
  });

  it('says one minute as one minute', () => {
    expect(completionQuestion(testRaid().id, [ALICE], 1).content).toContain('within 1 minute I');
  });

  it('stays a message Discord takes however many are asked, and says how many it left out', () => {
    const members = Array.from(
      { length: 150 },
      (_, n) => `3000000000000000${String(n).padStart(3, '0')}`,
    );
    const { content } = completionQuestion(testRaid().id, members, 5);
    expect(content.length).toBeLessThanOrEqual(2000);
    const named = content.match(/<@\d+>/g)?.length ?? 0;
    expect(named).toBeGreaterThan(50);
    expect(content).toContain(`…and ${150 - named} more: have you completed`);
  });
});

describe('groupWords', () => {
  it('names a group with its label, made safe', () => {
    expect(groupWords({ id: 'B' })).toBe('group B');
    expect(groupWords({ id: 'B', label: '**park**' })).toBe('group B (\\*\\*park\\*\\*)');
  });
});
