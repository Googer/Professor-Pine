import { describe, expect, it } from 'vitest';
import {
  answered,
  fakeChatInput,
  fakeMessage,
  fakeSelect,
  type FakeRow,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { REGION_ROLE, regionRolesWith } from '../../../test/support/region-roles.js';
import { menusOf } from '../../../test/support/roles.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import { NONE_VALUE } from '../../domain/roles/menus.js';
import { iam, iamnot } from './iam.js';
import { roleControls } from './menus.js';

/*
 * A role taken away by `/iamnot` or the role menus (plan 8M-20, W2): the access service settles
 * the forums of the member's parties again (`SelfRoleService.onRolesTaken`, wired as `app.ts`
 * wires it, by `regionRolesWith`), so that a party she is in keeps its forum in her sight. Over
 * `regionRolesWith`: West's forum opens to the role West (of the pick-one group Home) and Metro.
 */
async function setup() {
  const party = await reportedRaid();
  const regions = await regionRolesWith({ made: party });
  regions.server.member(ALICE, REGION_ROLE.west);
  // Her interactions put her into the cache with West.
  party.gateway.memberFetched(ALICE);
  const { ctx } = createTestContext({ selfRoles: regions.selfRoles });
  const router = new InteractionRouter(ctx, [iam, iamnot], [roleControls]);
  await party.attendance.signUp(party.party.id, { id: ALICE }, PartyStatus.Coming);
  await party.access.flush();
  // She sees West's forum by her role: nobody needs to let her in.
  expect(party.access.has(WEST_FORUM, ALICE)).toBe(false);
  /** Whether she was let into West's forum once everything under way has finished. */
  const letIn = async (): Promise<boolean> => {
    await regions.selfRoles.idle();
    await party.access.flush();
    return party.access.has(WEST_FORUM, ALICE) && party.gateway.canSee(WEST_FORUM, ALICE);
  };
  return { party, regions, router, letIn };
}

describe('a region role taken away on Discord', () => {
  it('by /iamnot leaves her the forum of the party she is in', async () => {
    const { regions, router, letIn } = await setup();
    const interaction = fakeChatInput({
      commandName: 'iamnot',
      ...regions.server.interactionOf(ALICE),
      options: { role: 'West' },
    });
    await router.handle(interaction as never);
    expect(regions.server.held(ALICE)).toEqual([]);
    expect(await letIn()).toBe(true);
  });

  it('by the role menus leaves her the forum of the party she is in', async () => {
    const { regions, router, letIn } = await setup();
    const opened = fakeChatInput({ commandName: 'iam', ...regions.server.interactionOf(ALICE) });
    await router.handle(opened as never);
    const shown = answered(opened);
    const message = fakeMessage((shown.components ?? []) as FakeRow[], undefined, shown.content);
    const home = menusOf({ components: message.rows }).find((menu) =>
      menu.options.some((option) => option.value === REGION_ROLE.west),
    );
    if (!home) throw new Error('no menu offers West');
    const picked = fakeSelect({
      customId: home.custom_id,
      values: [NONE_VALUE],
      message,
      ...regions.server.interactionOf(ALICE),
    });
    await router.handle(picked as never);
    expect(regions.server.held(ALICE)).toEqual([]);
    expect(await letIn()).toBe(true);
  });

  it('settles nothing when only a role was given', async () => {
    const { party, regions, router } = await setup();
    const interaction = fakeChatInput({
      commandName: 'iam',
      ...regions.server.interactionOf(ALICE),
      options: { role: 'Metro' },
    });
    await router.handle(interaction as never);
    await regions.selfRoles.idle();
    await party.access.flush();
    expect(regions.server.held(ALICE)).toEqual([REGION_ROLE.west, REGION_ROLE.metro].sort());
    expect(party.gateway.calls.filter((call) => call.startsWith('admitMember'))).toEqual([]);
  });
});
