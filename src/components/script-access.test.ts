import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeButton,
  sent,
  type FakeInteraction,
  type FakeRow,
} from '../../test/support/fake-interactions.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { accessRequest } from '../../test/support/script-access-cases.js';
import { MemoryScriptAccess } from '../../test/support/script-access.js';
import { createTestContext } from '../../test/support/test-context.js';
import { TEST_ENV } from '../../test/support/test-env.js';
import { InteractionRouter } from '../discord/router.js';
import type { V2Message } from '../discord/party-gateway.js';
import { ACCESS_KEY, REASK_MS } from '../domain/script-access/access.js';
import { accessRequestDm } from '../render/script-access-dm.js';
import { ScriptAccessService } from '../services/script-access-service.js';
import { components } from './index.js';
import { SCRIPT_ACCESS_THROTTLE, scriptAccessControls } from './script-access.js';

const OWNER = TEST_ENV.OWNER_ID ?? '';
const NOW = Date.UTC(2026, 9, 19, 12);

function setup() {
  const store = new MemoryScriptAccess();
  const clock = { now: NOW };
  const { ctx, entries } = createTestContext();
  const scriptAccess = new ScriptAccessService({
    store,
    ownerId: OWNER,
    now: () => clock.now,
    log: ctx.log,
  });
  (ctx as { scriptAccess: ScriptAccessService }).scriptAccess = scriptAccess;
  const router = new InteractionRouter(ctx, [], [scriptAccessControls]);
  /** A press of `customId` under `dm`, in the owner's DM (or by `userId`). */
  const pressOn = async (
    dm: V2Message | undefined,
    customId: string,
    userId = OWNER,
  ): Promise<FakeInteraction> => {
    const interaction = fakeButton({
      customId,
      isDm: true,
      userId,
      messageRows: dm ? (dm.components as unknown as FakeRow[]) : [],
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** The DM of request `id` as it is drawn now (undefined without the row). */
  const dmOf = async (id: number): Promise<V2Message | undefined> => {
    const row = await store.byId(id);
    return row && accessRequestDm(row);
  };
  /** The custom id of a button of `dm` by its label. */
  const idOn = (dm: V2Message | undefined, label: string): string =>
    buttonsOf(dm ?? { v2: true, components: [] }).find((button) => button.label === label)
      ?.customId ?? '';
  /** A press of Approve or Refuse under the DM of request `id` as drawn now. */
  const press = async (id: number, action: string, userId = OWNER): Promise<FakeInteraction> => {
    const dm = await dmOf(id);
    const label = action === 'approve' ? 'Approve' : action === 'refuse' ? 'Refuse' : undefined;
    const asked = (await store.byId(id))?.askedAt ?? NOW;
    const customId =
      label === undefined
        ? `scriptaccess:${id}:${action}:${asked.toString(36)}`
        : idOn(dm, label) || `scriptaccess:${id}:${action}:${asked.toString(36)}`;
    return pressOn(dm, customId, userId);
  };
  /** The DM as a press left it. */
  const edited = (interaction: FakeInteraction): V2Message => {
    const edit = sent(interaction.editReply);
    expect(edit.flags).toBe(MessageFlags.IsComponentsV2);
    return { v2: true, components: edit.components as V2Message['components'] };
  };
  return { store, clock, ctx, entries, press, pressOn, dmOf, idOn, edited };
}

describe('Approve and Refuse in the owner’s DM of a request for the Wayspot export tool', () => {
  it('approves the request with a key, and the DM says so, without its buttons', async () => {
    const made = setup();
    const { access } = await made.store.ask(accessRequest());
    made.clock.now += 60_000;
    const pressed = await made.press(access.id, 'approve');
    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    const row = await made.store.byId(access.id);
    expect(row).toMatchObject({ state: 'approved', decidedAt: NOW + 60_000 });
    expect(row?.key).toMatch(ACCESS_KEY);
    const dm = made.edited(pressed);
    expect(buttonsOf(dm)).toEqual([]);
    expect(textOf(dm)).toContain(`**Approved** <t:${(NOW + 60_000) / 1000}:f>.`);
    expect(textOf(dm)).toContain('Pinewood raiders');
  });

  it('refuses it as well', async () => {
    const made = setup();
    const { access } = await made.store.ask(accessRequest());
    const pressed = await made.press(access.id, 'refuse');
    expect((await made.store.byId(access.id))?.state).toBe('refused');
    expect(textOf(made.edited(pressed))).toContain(`**Refused** <t:${NOW / 1000}:f>.`);
  });

  it('decides a request decided already no more, and says what it was', async () => {
    const made = setup();
    const { access } = await made.store.ask(accessRequest());
    await made.press(access.id, 'refuse');
    const late = await made.press(access.id, 'approve');
    expect((await made.store.byId(access.id))?.state).toBe('refused');
    expect(textOf(made.edited(late))).toContain(
      `Decided already: **refused** <t:${NOW / 1000}:f>.`,
    );
  });

  it('decides with an old DM nothing of a request asked again since', async () => {
    const made = setup();
    const { access } = await made.store.ask(accessRequest());
    const first = await made.dmOf(access.id);
    await made.pressOn(first, made.idOn(first, 'Refuse'));
    made.clock.now += REASK_MS;
    await made.store.ask(accessRequest({ at: made.clock.now, community: 'Oakdale trainers' }));
    const renewed = await made.dmOf(access.id);
    // The first DM's Approve, pressed (again) once the member asked anew.
    const old = await made.pressOn(first, made.idOn(first, 'Approve'));
    expect((await made.store.byId(access.id))?.state).toBe('asked');
    // Redrawn as its own asking: its time, not the new asking's community line.
    expect(textOf(made.edited(old))).toContain(`Asked <t:${NOW / 1000}:f>.`);
    expect(textOf(made.edited(old))).not.toContain('Oakdale');
    expect(textOf(made.edited(old))).toContain(
      `Asked again since, <t:${made.clock.now / 1000}:f>: decide it on its new DM or on the page.`,
    );
    const current = await made.pressOn(renewed, made.idOn(renewed, 'Approve'));
    expect((await made.store.byId(access.id))?.state).toBe('approved');
    expect(textOf(made.edited(current))).toContain('**Approved**');
  });

  it('refuses every press but the owner’s, never throttling a stranger for it; the owner still decides', async () => {
    const made = setup();
    const { access } = await made.store.ask(accessRequest());
    // More presses than the throttle allows a minute: the guard refuses each before the throttle,
    // so the stranger is told who decides every time, never to wait.
    for (let n = 0; n <= SCRIPT_ACCESS_THROTTLE.uses + 4; n += 1) {
      const pressed = await made.press(access.id, 'approve', '200000000000000099');
      expect(pressed.editReply).not.toHaveBeenCalled();
      expect(sent(pressed.reply).content).toBe(
        'Only the owner of this Pine decides who gets the Wayspot export tool.',
      );
    }
    expect((await made.store.byId(access.id))?.state).toBe('asked');
    await made.press(access.id, 'approve');
    expect((await made.store.byId(access.id))?.state).toBe('approved');
  });

  it('answers a request that is gone, or a button it does not know, as out of date', async () => {
    const made = setup();
    for (const [id, action] of [
      [41, 'approve'],
      [0, 'approve'],
    ] as const) {
      const pressed = await made.press(id, action);
      expect(pressed.editReply).not.toHaveBeenCalled();
      expect(sent(pressed.reply).content).toMatch(/no longer|out of date|expired/i);
    }
    const { access } = await made.store.ask(accessRequest());
    const unknown = await made.press(access.id, 'revoke');
    expect((await made.store.byId(access.id))?.state).toBe('asked');
    expect(unknown.editReply).not.toHaveBeenCalled();
    // A button without the asking it was drawn for, or with no time in it.
    const dm = await made.dmOf(access.id);
    for (const customId of [
      `scriptaccess:${access.id}:approve`,
      `scriptaccess:${access.id}:approve:-x`,
    ]) {
      const pressed = await made.pressOn(dm, customId);
      expect(pressed.editReply).not.toHaveBeenCalled();
      expect(sent(pressed.reply).content).toMatch(/no longer|out of date|expired/i);
    }
    expect((await made.store.byId(access.id))?.state).toBe('asked');
  });

  it('is a handler of the bot', () => {
    expect(components).toContain(scriptAccessControls);
  });
});
