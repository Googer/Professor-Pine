import { describe, expect, it } from 'vitest';
import type { MapAttendance, MapMeet, MapRaid, MapRegroup } from '../../domain/web/party-data.js';
import type { PageNode } from './popup.js';
import {
  closeBody,
  closeForm,
  focusBack,
  formStep,
  meetBody,
  meetForm,
  regroupBody,
  regroupForm,
  reportBody,
  reportForm,
  sendPostForm,
  showsParty,
  type FormTimes,
} from './post-forms.js';

/** Tuesday 13 October 2026, 14:00 in New York. */
const NOW = Date.UTC(2026, 9, 13, 18);
const MINUTE = 60_000;
const GUILD = '412345678901234567';
const LINK = `https://discord.com/channels/${GUILD}/700000000000000001`;
const ORIGIN = 'https://map.example.test';
const times: FormTimes = { now: NOW, time: { locale: 'en-US', timeZone: 'America/Los_Angeles' } };

const attendance: MapAttendance = {
  groups: [{ id: 'A', interested: 0, coming: 1, present: 0 }],
  going: 1,
  mine: { status: 'coming', group: 'A' },
  actions: [],
  remote: { offered: true, on: false },
  count: true,
};

const raid: MapRaid = {
  kind: 'raid',
  postKey: 'k',
  id: 'r1',
  gymId: 1,
  picture: null,
  tier: 'Level 5 raid',
  tierGroup: '5',
  heading: 'Level 5 raid',
  boss: null,
  stage: 'hatched',
  hatchTime: NOW - 10 * MINUTE,
  endTime: NOW + 35 * MINUTE,
  link: LINK,
  place: null,
  mayChange: true,
  attendance,
};

type Choices = Extract<MapRegroup, { choices: unknown }>;

const regroup = (more: Partial<Choices> = {}): Choices => ({
  title: 'Change group',
  text: "You're in group A.",
  label: 'Move to',
  signedUp: true,
  choices: [
    { group: 'B', stamp: 'b1', label: 'Group B: by the bridge', size: '2 trainers', meeting: null },
    { group: 'C', stamp: 'c1', label: 'Group C', size: '1 trainer', meeting: NOW + 20 * MINUTE },
  ],
  newGroup: true,
  ...more,
});

/** Every node of a tree, depth first. */
function all(node: PageNode): PageNode[] {
  return [node, ...(node.children ?? []).flatMap(all)];
}

/** What a reader sees of a tree: its texts, in order. */
function seen(node: PageNode): string {
  return (node.text ?? '') + (node.children ?? []).map(seen).join('');
}

describe('Group… on the map (plan 8M-8B)', () => {
  it('draws the dialog’s words, the groups as a radio choice with their lines, the first picked', () => {
    const form = regroupForm(raid, regroup(), times, ORIGIN, GUILD);
    expect(form.className).toBe('post-form');
    expect(form.attributes).toMatchObject({ 'data-form': 'regroup', 'data-party': 'r1' });
    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Change group');
    expect(all(form).find((one) => one.className === 'form-text')?.text).toBe("You're in group A.");
    const radios = all(form).filter((one) => one.attributes?.type === 'radio');
    expect(radios.map((one) => one.attributes)).toEqual([
      { type: 'radio', name: 'way', value: 'B:b1', checked: '' },
      { type: 'radio', name: 'way', value: 'C:c1' },
    ]);
    // Meeting times in the reader's own zone (Los Angeles here), as the post shows them.
    expect(
      all(form)
        .filter((one) => one.className === 'choice')
        .map(seen),
    ).toEqual([
      'Group B: by the bridge2 trainers · no meeting time yet',
      'Group C1 trainer · meeting at 11:20 AM',
    ]);
    expect(all(form).find((one) => one.tag === 'legend')?.text).toBe('Move to');
    const link = all(form).find((one) => one.className === 'to-discord');
    expect(link?.text).toBe('Start a new group on Discord →');
    expect(link?.attributes?.href).toBe(LINK);
    expect(
      all(form)
        .filter((one) => one.tag === 'button')
        .map((one) => one.text),
    ).toEqual(['Submit', 'Cancel']);
  });

  it('asks nothing where one way is left: the text says what Submit does', () => {
    const one = regroup({
      text: "You're in group A. Submit moves you to group B.",
      choices: [{ group: 'B', stamp: 'b1', label: 'Group B', size: '2 trainers' }],
      newGroup: false,
    });
    const form = regroupForm(raid, one, times, ORIGIN, GUILD);
    expect(all(form).some((node) => node.attributes?.type === 'radio')).toBe(false);
    expect(all(form).find((node) => node.attributes?.type === 'hidden')?.attributes?.value).toBe(
      'B:b1',
    );
    expect(all(form).some((node) => node.className === 'to-discord')).toBe(false);
  });

  it('sends the group picked by its letter and stamp, and whether it was drawn for a member signed up', () => {
    expect(regroupBody(regroup(), 'C:c1')).toEqual({
      body: { group: 'C', stamp: 'c1', signedUp: true },
    });
    expect(regroupBody(regroup({ signedUp: false }), 'B:b1')).toEqual({
      body: { group: 'B', stamp: 'b1', signedUp: false },
    });
    expect(regroupBody(regroup(), undefined)).toEqual({ text: 'Pick a group first.' });
    expect(regroupBody(regroup(), 'D:d1')).toEqual({ text: 'Pick a group first.' });
  });
});

describe('Meet… on the map (plan 8M-8B)', () => {
  const meet = (more: Partial<MapMeet> = {}): MapMeet => ({
    title: 'Meeting time for group B',
    text: 'For your group: everybody in it is told.',
    label: 'When does your group meet?',
    group: 'B',
    stamp: 'b1',
    times: [
      { at: NOW + 10 * MINUTE, rsvp: true, hatch: true },
      { at: NOW + 15 * MINUTE, rsvp: false },
      { at: NOW + 25 * MINUTE, rsvp: true },
    ],
    set: NOW + 15 * MINUTE,
    picked: NOW + 15 * MINUTE,
    ...more,
  });

  it('offers the times as the dialog’s menu in the reader’s zone, the group’s own said, "No meeting time" last', () => {
    const form = meetForm(raid, meet(), times);
    expect(form.attributes).toMatchObject({ 'data-form': 'meet', 'data-party': 'r1' });
    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Meeting time for group B');
    const options = all(form).filter((one) => one.tag === 'option');
    expect(options.map((one) => [one.attributes?.value, one.text])).toEqual([
      [String(NOW + 10 * MINUTE), 'At hatch (11:10 AM) · in-game RSVP'],
      [String(NOW + 15 * MINUTE), "11:15 AM · Your group's meeting time now"],
      [String(NOW + 25 * MINUTE), '11:25 AM · in-game RSVP'],
      ['none', 'No meeting time'],
    ]);
    expect(options[1]?.attributes).toHaveProperty('selected');
    expect(all(form).find((one) => one.className === 'form-label')?.text).toBe(
      'When does your group meet?',
    );
    // No "No meeting time" for a group without one.
    const unset = meetForm(raid, meet({ set: null, picked: NOW + 10 * MINUTE }), times);
    expect(all(unset).filter((one) => one.tag === 'option')).toHaveLength(3);
  });

  it('sends the group drawn and the time chosen, null for "No meeting time"', () => {
    expect(meetBody(meet(), String(NOW + 25 * MINUTE))).toEqual({
      body: { group: 'B', stamp: 'b1', time: NOW + 25 * MINUTE },
    });
    expect(meetBody(meet(), 'none')).toEqual({ body: { group: 'B', stamp: 'b1', time: null } });
    expect(meetBody(meet(), '')).toEqual({ text: 'Pick a time first.' });
  });
});

describe("staff's Delete… on the map (plan 8M-8B)", () => {
  it("asks /delete's question: archive or delete, nothing picked", () => {
    // The party's word as the server sent it (review W-4), never worked out by the page.
    const form = closeForm(raid, { mayDelete: true, forum: '#west-raids', word: 'max battle' });
    expect(form.attributes).toMatchObject({ 'data-form': 'close', 'data-party': 'r1' });
    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Close this max battle');
    expect(all(form).find((one) => one.className === 'form-text')?.text).toBe(
      'Close this max battle?',
    );
    expect(all(form).find((one) => one.tag === 'legend')?.text).toBe('The post');
    const radios = all(form).filter((one) => one.attributes?.type === 'radio');
    expect(radios.map((one) => one.attributes)).toEqual([
      { type: 'radio', name: 'removal', value: 'archive' },
      { type: 'radio', name: 'removal', value: 'delete' },
    ]);
    expect(
      all(form)
        .filter((one) => one.className === 'choice')
        .map(seen),
    ).toEqual([
      'Archive postKeeps it readable and locked.',
      'Delete postRemoves it with everything written in it: for what nobody should keep reading, like a home address.',
    ]);
  });

  it('says the post will be archived, and why, where the bot may not delete it', () => {
    const form = closeForm(raid, { mayDelete: false, forum: '#west-raids', word: 'raid' });
    expect(all(form).some((one) => one.attributes?.type === 'radio')).toBe(false);
    expect(all(form).find((one) => one.className === 'form-text')?.text).toBe(
      "Close this raid?\n\nIts post will be archived (kept readable and locked): I can't delete " +
        'posts in #west-raids (Manage Threads is missing there), so deleting it is not offered. ' +
        'Delete it yourself if nobody should keep reading it.\n\nSubmit archives its post.',
    );
    expect(all(form).find((one) => one.attributes?.type === 'hidden')?.attributes?.value).toBe(
      'archive',
    );
  });

  it('sends the way picked, and asks for one first', () => {
    expect(closeBody('delete')).toEqual({ body: { removal: 'delete' } });
    expect(closeBody('archive')).toEqual({ body: { removal: 'archive' } });
    expect(closeBody('')).toEqual({ text: 'Pick Archive post or Delete post first.' });
  });
});

describe('Report… on the map (plan 8M-8B)', () => {
  it("asks what is wrong in /report's words, as long as its form takes", () => {
    const form = reportForm(raid, {
      title: 'Report this raid to the moderators',
      label: 'What is wrong?',
      placeholder: 'Only the moderators read this.',
      maxLength: 1000,
    });
    expect(form.attributes).toMatchObject({ 'data-form': 'report', 'data-party': 'r1' });
    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe(
      'Report this raid to the moderators',
    );
    expect(all(form).find((one) => one.className === 'form-label')?.text).toBe('What is wrong?');
    expect(all(form).find((one) => one.tag === 'textarea')?.attributes).toEqual({
      name: 'reason',
      maxlength: '1000',
      placeholder: 'Only the moderators read this.',
      rows: '4',
    });
  });

  it('sends the reason as typed: the server reads it as the form does', () => {
    expect(reportBody(' A front yard. ')).toEqual({ body: { reason: ' A front yard. ' } });
    expect(reportBody(undefined)).toEqual({ body: { reason: '' } });
  });
});

describe('what a form does after its answer (reviews W-2, W-5)', () => {
  it('stays on a refusal, unless its choices may be stale; closes when done or over', () => {
    expect(formStep({ ok: false, gone: false }, {})).toBe('stay');
    // Group…'s choices came with the list: a refusal closes it and the list is asked for again.
    expect(formStep({ ok: false, gone: false }, { refusalCloses: true })).toBe('close');
    expect(formStep({ ok: true, gone: false }, {})).toBe('close');
    expect(formStep({ ok: false, gone: true }, {})).toBe('close');
    // A time it could not read: the choices are not what was refused, the form stays.
    expect(formStep({ ok: false, gone: false, keepsForm: true }, { refusalCloses: true })).toBe(
      'stay',
    );
  });

  it('reads whether the server says a refusal keeps the form', async () => {
    const sent = async (body: unknown) =>
      sendPostForm('token', {
        post: () => Promise.resolve({ status: 422, body }),
        me: () => Promise.reject(new Error('not asked')),
      });
    expect((await sent({ ok: false, text: 'No.', keepsForm: true })).keepsForm).toBe(true);
    expect((await sent({ ok: false, text: 'No.' })).keepsForm).toBeUndefined();
  });

  it('gives the focus back to the button that opened it, while it is in the page', () => {
    const focused: string[] = [];
    focusBack({ isConnected: true, focus: () => focused.push('in') });
    focusBack({ isConnected: false, focus: () => focused.push('out') });
    expect(focused).toEqual(['in']);
  });
});

describe('which popup or card shows a party (review W-6)', () => {
  it('knows a raid by its gym, a train by its ring and line, a meetup by its own key', () => {
    expect(showsParty('gym:1', raid)).toBe(true);
    expect(showsParty('gym:2', raid)).toBe(false);
    expect(showsParty('train:r1', raid)).toBe(false);
    const train = { kind: 'train', id: 't1' } as const;
    expect(showsParty('train:t1', train)).toBe(true);
    expect(showsParty('route:t1', train)).toBe(true);
    expect(showsParty('meetup:t1', train)).toBe(false);
    expect(showsParty('meetup:m1', { kind: 'meetup', id: 'm1' })).toBe(true);
  });

  // Plan 8M-9A (A2): a max battle's marker, at a Power Spot or a pin, is its own.
  it('knows a max battle by its own key, wherever it is', () => {
    const max = { kind: 'max', id: 'x1' } as const;
    expect(showsParty('max:x1', max)).toBe(true);
    expect(showsParty('max:x2', max)).toBe(false);
    expect(showsParty('gym:x1', max)).toBe(false);
  });
});

describe('sendPostForm', () => {
  it('says the words, renews a stale token once, and tells a refusal and an ended party apart', async () => {
    const asked: string[] = [];
    const sent = await sendPostForm('old', {
      post: (token) => {
        asked.push(token);
        return Promise.resolve(
          token === 'old'
            ? { status: 403, body: { error: 'Not allowed.' } }
            : { status: 200, body: { ok: true, text: 'You are coming, in group B.' } },
        );
      },
      me: () =>
        Promise.resolve({ loggedIn: true, name: 'A', member: true, csrf: 'new', readOnly: false }),
    });
    expect(asked).toEqual(['old', 'new']);
    expect(sent).toEqual({
      text: 'You are coming, in group B.',
      csrf: 'new',
      ok: true,
      gone: false,
    });
    const gone = await sendPostForm('t', {
      post: () => Promise.resolve({ status: 409, body: { ok: false, text: 'This has ended.' } }),
      me: () => Promise.reject(new Error('not asked')),
    });
    expect(gone).toMatchObject({ ok: false, gone: true, text: 'This has ended.' });
  });
});
