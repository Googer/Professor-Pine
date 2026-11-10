import { describe, expect, it } from 'vitest';
import type { MapMoves } from '../../domain/web/party-data.js';
import type { MapManage, MapSplit } from '../../domain/web/train-data.js';
import type { PageNode } from './popup.js';
import { sendPostForm } from './post-forms.js';
import { GIGANTAMAX_ICON, REPORT_ICONS } from './report-icons.js';
import { iconNode } from './report-menu.js';
import {
  manageBody,
  manageForm,
  moveBody,
  moveForm,
  splitBody,
  splitForm,
} from './train-post-forms.js';

/** Every node of a tree, depth first. */
function all(node: PageNode): PageNode[] {
  return [node, ...(node.children ?? []).flatMap(all)];
}

/** What a reader sees of a tree: its texts, in order. */
function seen(node: PageNode): string {
  return (node.text ?? '') + (node.children ?? []).map(seen).join('');
}

/** The radio inputs of a form by their group's name: their values, the one checked marked. */
function radios(form: PageNode, name: string): string[] {
  return all(form)
    .filter((one) => one.attributes?.type === 'radio' && one.attributes.name === name)
    .map((one) => `${one.attributes?.value ?? ''}${one.attributes?.checked === '' ? ' *' : ''}`);
}

const manage = (more: Partial<MapManage> = {}): MapManage => ({
  title: 'Manage the train',
  text: 'At stop 1 of 3: Veterans Memorial Bridge\nNext is The Stacks',
  route: {
    label: 'The route',
    options: [
      { value: 'keep', label: 'Keep it as it is' },
      { value: 'reverse', label: 'Reverse it' },
      { value: 'finish', label: 'Finish it here' },
    ],
    picked: 'keep',
  },
  atEnd: {
    label: 'At the end of the route',
    options: [
      { value: 'finish', label: 'Finish at the last stop', line: 'The train stops', emoji: '🏁' },
      { value: 'loop', label: 'Loop: back to the first stop', line: 'After the last', emoji: '🔁' },
    ],
    picked: 'loop',
  },
  kind: {
    label: 'What the train is mainly for',
    options: [
      { value: 'raid', label: 'Raids', line: 'Members choose', emoji: '⚔️' },
      { value: 'dynamax', label: 'Dynamax Battles', line: 'Lobbies form', emoji: '🔴' },
    ],
    picked: 'raid',
  },
  shown: { from: '4', first: '4', atEnd: 'loop', kind: 'raid' },
  ...more,
});

describe('the times in Manage… on the map (Matt, 2026-10-30)', () => {
  const ZONE = 'America/New_York';
  const NOW = Date.UTC(2026, 9, 30, 16);
  const asked = manage({
    times: { zone: ZONE, startTime: Date.UTC(2026, 9, 30, 22), endTime: null },
  });
  const form = (of: MapManage) => all(manageForm('t1', of, NOW, ZONE));

  it('says the start and end as they are over a line for each, as a meetup does, no Set', () => {
    const nodes = form(asked);
    const typed = nodes.filter((one) => one.attributes?.type === 'text');
    expect(typed.map((one) => one.attributes?.name)).toEqual(['start', 'end']);
    const words = nodes.map((one) => one.text);
    expect(words).toContain('Starts now: 6:00 PM');
    expect(words).toContain('Ends now: none');
    expect(words).not.toContain('Set');
  });

  it('draws neither for who may not arrange the train', () => {
    expect(form(manage()).find((one) => one.attributes?.type === 'text')).toBeUndefined();
  });

  it('sends what is typed, and nothing of a blank field', () => {
    const fields = { kind: 'raid', route: 'keep', atEnd: 'loop' };
    expect(manageBody(asked, { ...fields, start: ' 6:15pm ', end: ' in 90 ' })).toMatchObject({
      body: { picked: { start: '6:15pm', end: 'in 90' } },
    });
    const blank = JSON.stringify(manageBody(asked, { ...fields, start: '  ', end: '' }));
    expect(blank).not.toContain('start');
    expect(blank).not.toContain('"end"');
  });
});

describe('Manage… on the map (plan 8M-8C)', () => {
  it("draws the dialog: its title and text, the route's choices, the mode and the kind, each with the train's own picked", () => {
    const form = manageForm('t1', manage());
    expect(form.className).toBe('post-form');
    expect(form.attributes).toMatchObject({ 'data-form': 'manage', 'data-party': 't1' });
    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Manage the train');
    expect(all(form).find((one) => one.className === 'form-text')?.text).toBe(
      'At stop 1 of 3: Veterans Memorial Bridge\nNext is The Stacks',
    );
    expect(
      all(form)
        .filter((one) => one.tag === 'legend')
        .map((one) => one.text),
    ).toEqual(['The route', 'At the end of the route', 'What the train is mainly for']);
    expect(radios(form, 'route')).toEqual(['keep *', 'reverse', 'finish']);
    expect(radios(form, 'atEnd')).toEqual(['finish', 'loop *']);
    expect(radios(form, 'kind')).toEqual(['raid *', 'dynamax']);
    // A menu's emoji before its words, as Discord shows them, and its description under them.
    expect(
      all(form)
        .filter((one) => one.className === 'choice')
        .map(seen)
        .slice(3, 5),
    ).toEqual([
      '🏁 Finish at the last stopThe train stops',
      '🔁 Loop: back to the first stopAfter the last',
    ]);
    expect(
      all(form)
        .filter((one) => one.tag === 'button')
        .map((one) => one.text),
    ).toEqual(['Submit', 'Cancel']);
  });

  // Matt, 2026-10-30: Discord's dialog can show no icon but an emoji; the page has the game's.
  it("draws the kinds with the game's icons", () => {
    const form = manageForm(
      't1',
      manage({
        kind: {
          label: 'What the train is mainly for',
          options: [
            { value: 'raid', label: 'Raids', emoji: '⚔️' },
            { value: 'dynamax', label: 'Dynamax Battles', emoji: '🔴' },
            { value: 'gigantamax', label: 'Gigantamax Battles', emoji: '🌋' },
          ],
          picked: 'raid',
        },
      }),
    );
    const kinds = all(form)
      .filter((one) => one.className === 'choice')
      .filter((one) => all(one).some((part) => part.attributes?.name === 'kind'));
    expect(kinds.map(seen)).toEqual(['Raids', 'Dynamax Battles', 'Gigantamax Battles']);
    const icons = kinds.map((one) =>
      all(one).find((part) => part.className?.includes('report-icon')),
    );
    expect(icons[0]).toEqual(iconNode(REPORT_ICONS.raid));
    expect(icons[1]).toEqual(iconNode(REPORT_ICONS.max));
    expect(icons[2]).toEqual(iconNode(GIGANTAMAX_ICON));
    // The other choices keep their emoji.
    expect(
      all(form)
        .filter((one) => one.className === 'choice')
        .map(seen),
    ).toContain('🏁 Finish at the last stopThe train stops');
  });

  it('asks a train without a route its kind alone', () => {
    const {
      route: _route,
      atEnd: _atEnd,
      ...routeless
    } = manage({
      text: 'This train has no route yet. Add its stops with /route add.',
    });
    const form = manageForm('t1', routeless);
    expect(radios(form, 'route')).toEqual([]);
    expect(radios(form, 'atEnd')).toEqual([]);
    expect(radios(form, 'kind')).toEqual(['raid *', 'dynamax']);
  });

  it('sends back what it showed with what is picked, the parts it did not ask left out', () => {
    expect(manageBody(manage(), { route: 'reverse', atEnd: 'finish', kind: 'dynamax' })).toEqual({
      body: {
        shown: { from: '4', first: '4', atEnd: 'loop', kind: 'raid' },
        picked: { kind: 'dynamax', route: 'reverse', atEnd: 'finish' },
      },
    });
    const { route: _route, atEnd: _atEnd, ...routeless } = manage();
    expect(manageBody(routeless, { kind: 'raid' })).toEqual({
      body: { shown: manage().shown, picked: { kind: 'raid' } },
    });
    expect(manageBody(manage(), { kind: 'max', route: 'keep', atEnd: 'loop' })).toEqual({
      text: 'Pick what the train is mainly for first.',
    });
  });
});

const moves = (more: Partial<MapMoves> = {}): MapMoves => ({
  title: 'Move the train',
  place: '7',
  text: 'At stop 3 of 3: Harbor Lighthouse Mural\nNext turns back to The Stacks',
  label: 'Where to',
  moves: [
    { move: 'next', target: '1', label: 'Next: turn back to The Stacks' },
    {
      move: 'previous',
      target: '1',
      label: 'Previous: back to The Stacks (undo)',
      line: 'Back one stop, still heading for the end: undoes a Next made by mistake',
    },
  ],
  ...more,
});

describe('Move… on the map (plan 8M-8C, R1)', () => {
  it('draws the dialog: where the train is, then the moves as its radio choice in its words, Next first and picked', () => {
    const form = moveForm('t1', moves());
    expect(form.attributes).toMatchObject({ 'data-form': 'move', 'data-party': 't1' });
    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Move the train');
    expect(all(form).find((one) => one.tag === 'legend')?.text).toBe('Where to');
    expect(radios(form, 'move')).toEqual(['next:1 *', 'previous:1']);
    expect(
      all(form)
        .filter((one) => one.className === 'choice')
        .map(seen),
    ).toEqual([
      'Next: turn back to The Stacks',
      'Previous: back to The Stacks (undo)Back one stop, still heading for the end: undoes a Next made by mistake',
    ]);
  });

  it('asks nothing where one move is left: the text says what Submit does', () => {
    const one = moves({
      place: 'end',
      text: 'The train has finished its route of 3 stops.\n\nSubmit takes it back to stop 3, Harbor Lighthouse Mural.',
      moves: [
        {
          move: 'previous',
          target: '7',
          label: 'Previous: back to stop 3, Harbor Lighthouse Mural',
        },
      ],
    });
    const form = moveForm('t1', one);
    expect(radios(form, 'move')).toEqual([]);
    expect(all(form).find((node) => node.attributes?.type === 'hidden')?.attributes?.value).toBe(
      'previous:7',
    );
  });

  it('sends the move picked to its address, with where the train was and where the move leads', () => {
    expect(moveBody(moves(), { move: 'previous:1' })).toEqual({
      path: 'move/previous',
      body: { from: '7', target: '1' },
    });
    expect(moveBody(moves(), { move: 'skip:4' })).toEqual({ text: 'Pick where to first.' });
  });
});

describe('Split… on the map (plan 8M-8C)', () => {
  const several: MapSplit = {
    title: 'Split a group off the train',
    text: 'The group you pick leaves Loop…\n\nGroup A (2 trainers): Ash, Misty\nGroup B (Fast) (2 trainers): Alice, Bob',
    choice: {
      label: 'Group that leaves',
      options: [
        { value: 'A:1.x', label: 'Group A · 2 trainers' },
        { value: 'B:2.y', label: 'Group B (Fast) · 2 trainers' },
      ],
    },
  };

  it('asks which group leaves as the dialog does, nothing picked: it is picked on purpose', () => {
    const form = splitForm('t1', several);
    expect(form.attributes).toMatchObject({ 'data-form': 'split', 'data-party': 't1' });
    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Split a group off the train');
    expect(all(form).find((one) => one.className === 'form-text')?.text).toBe(several.text);
    expect(radios(form, 'group')).toEqual(['A:1.x', 'B:2.y']);
    expect(splitBody(several, { group: 'B:2.y' })).toEqual({ body: { group: 'B', mark: '2.y' } });
    expect(splitBody(several, {})).toEqual({ text: 'Pick the group that leaves first.' });
  });

  it('asks nothing of the one group a member may split: the text says what Submit does', () => {
    const one: MapSplit = {
      title: 'Split a group off the train',
      text: 'Group B (Fast) leaves Loop…\n\nSubmit splits it off.',
      only: { group: 'B', mark: '2.y' },
    };
    const form = splitForm('t1', one);
    expect(radios(form, 'group')).toEqual([]);
    expect(splitBody(one, {})).toEqual({ body: { group: 'B', mark: '2.y' } });
  });
});

describe('a train form’s answer (sendPostForm)', () => {
  it('takes a 409 that gives the train as it is now for a refusal, not for a train that is over', async () => {
    const stale = await sendPostForm('t', {
      post: () =>
        Promise.resolve({
          status: 409,
          body: { ok: false, text: 'The train has moved on.', train: { id: 't1', route: [] } },
        }),
      me: () => Promise.reject(new Error('not asked')),
    });
    expect(stale).toMatchObject({ ok: false, gone: false, text: 'The train has moved on.' });
    const over = await sendPostForm('t', {
      post: () =>
        Promise.resolve({ status: 409, body: { ok: false, text: 'This train is over.' } }),
      me: () => Promise.reject(new Error('not asked')),
    });
    expect(over).toMatchObject({ ok: false, gone: true });
  });
});
