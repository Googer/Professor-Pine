import { describe, expect, it } from 'vitest';
import { sent } from '../../../test/support/fake-interactions.js';
import { answerOf, buttonId, gymCommandsWith, said } from '../../../test/support/gym-commands.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { MAX_DUPLICATE_MESSAGES, pagedGroups } from './duplicates.js';

const FREE = '40.015, -80.015';

interface Form {
  custom_id: string;
  components: { components: { custom_id: string; value?: string }[] }[];
}

const filled = (form: Form): Record<string, string> =>
  Object.fromEntries(
    form.components.map((row) => [
      row.components[0]?.custom_id ?? '',
      row.components[0]?.value ?? '',
    ]),
  );

describe('gyms that share a name', () => {
  it('says so when there are none: two Starbucks of two regions are no pair', async () => {
    const made = await gymCommandsWith();
    const listed = answerOf(await made.use('duplicates'));
    expect(said(listed)).toBe('No two gyms of a region of this server are shown by the same name.');
  });

  it('warns, and adds all the same, when a new gym is shown by the name of another of its region', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'STAR-BUCKS' }));
    const added = answerOf(await made.press(buttonId(question, 'Add')));
    expect(said(added)).toContain('Added **STAR-BUCKS** (#13).');
    expect(said(added)).toContain(
      'Another gym of its region is shown as "STAR-BUCKS" too: **Starbucks** (#5). Members and ' +
        'screenshots can tell such gyms apart only by a nickname: give one with `/gym edit`.',
    );
    expect(made.gymStore.row(13)).toMatchObject({ name: 'STAR-BUCKS' });

    const listed = answerOf(await made.use('duplicates'));
    expect(said(listed)).toBe(
      'One name is shared by gyms of one region. Give each such gym a nickname with `/gym edit`.' +
        `\n\n**<#${WEST_CHANNEL}>** "Starbucks":\n- **Starbucks** (#5) — Sponsored gym\n` +
        '- **STAR-BUCKS** (#13)',
    );
  });

  it('warns of a nickname that is the shown name of another gym of the region', async () => {
    const made = await gymCommandsWith();
    const used = await made.use('edit', { gym: 'id:6' });
    const form = used.showModal.mock.calls[0]?.[0] as Form;
    const submitted = await made.submit(
      form.custom_id,
      { ...filled(form), nickname: 'Old Stone Fountain' },
      { modalFromCommand: true },
    );
    expect(said(answerOf(submitted))).toContain(
      'Another gym of its region is shown as "Old Stone Fountain" too: **Old Stone Fountain** (#2).',
    );
  });

  it('warns when a gym is moved into a region with a gym of its name', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('move', { gym: 'id:9', location: '40.021, -80.07' }));
    const moved = answerOf(await made.press(buttonId(question, 'Move anyway')));
    expect(said(moved)).toContain(
      'Another gym of its region is shown as "Starbucks" too: **Starbucks** (#5).',
    );
  });

  it('answers a long list in several messages, cut between groups, and says what did not fit', () => {
    const group = (i: number) => `**<#1>** "Gym ${i}":\n- ${'x'.repeat(400)}`;
    const pages = pagedGroups(
      'Head.',
      Array.from({ length: 60 }, (_, i) => group(i)),
    );
    expect(pages).toHaveLength(MAX_DUPLICATE_MESSAGES);
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(2_000);
    expect(pages[0]?.startsWith('Head.')).toBe(true);
    expect(pages.at(-1)).toMatch(/… and \d+ more not shown\.$/);
    // Every group shown is whole.
    expect(pages.join('\n\n').match(/"Gym \d+":\n- x{400}/g)?.length).toBe(
      60 - Number(/and (\d+) more/.exec(pages.at(-1) ?? '')?.[1] ?? 0),
    );
    const few = pagedGroups('Head.', [group(1), group(2)]);
    expect(few).toHaveLength(1);
  });

  it('sends the further messages as private follow-ups', async () => {
    const made = await gymCommandsWith();
    const listed = await made.use('duplicates');
    expect(said(sent(listed.editReply))).toMatch(/^No two gyms/);
    expect(listed.followUp).not.toHaveBeenCalled();
  });
});
