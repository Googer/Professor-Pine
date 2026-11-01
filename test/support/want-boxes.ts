import type { BoxChange, WantBoxStorage } from '../../src/db/repositories/want-box-repository.js';
import type { TargetWant } from '../../src/domain/notify/target-wants.js';
import {
  heldRows,
  planAnswer,
  type AnswerScope,
  type BoxAnswer,
  type HeldRow,
} from '../../src/domain/pogo/species-answer.js';
import { baseTarget, shadowTarget } from '../../src/domain/pogo/want-boxes.js';
import type { FormReader } from '../../src/domain/pogo/wants.js';
import type { TargetWantStorage } from '../../src/db/repositories/target-want-repository.js';
import type { WantStorage } from '../../src/db/repositories/pokemon-notification-repository.js';
import { MemoryTargetWants } from './target-wants.js';
import { fixtureForms, MemoryWants } from './wants.js';

/**
 * The boxes of `/want`'s dialog in memory: the twin of `WantBoxRepository` over the wants and
 * the target wants of a test (`wants`, `targets`, which a test reads), running `wantBoxCases`
 * as it does: one answer per species (plan 8R-4), the megas by `forms` (the fixture's by
 * default). It writes one table after the other (nothing here can fail half-way but a `failing`
 * of either).
 */
export class MemoryWantBoxes implements WantBoxStorage {
  constructor(
    readonly wants: WantStorage = new MemoryWants(),
    readonly targets: TargetWantStorage = new MemoryTargetWants(),
    private readonly forms: FormReader = fixtureForms(),
  ) {}

  async held(memberId: string, guildId: string, scope: AnswerScope): Promise<HeldRow[]> {
    const { wants } = await this.wants.list(memberId, guildId);
    const { wants: targets } = await this.targets.list(memberId, guildId);
    return heldRows(scope, wants, targets);
  }

  async set(memberId: string, guildId: string, answer: BoxAnswer, at: number): Promise<BoxChange> {
    const { scope } = answer;
    const held = await this.held(memberId, guildId, scope);
    const dex = scope.subject.kind === 'pokemon' ? scope.subject.dex : 0;
    const plan = planAnswer(scope, held, answer, (form) => this.forms(dex, form).mega);
    const targets: { add: TargetWant[]; remove: TargetWant[] } = { add: [], remove: [] };
    for (const row of plan.rows) {
      const base = baseTarget(row.subject);
      if (row.base === null) await this.wants.remove(memberId, guildId, base);
      else await this.wants.set(memberId, guildId, base, row.base, row.costumed);
      const shadow = shadowTarget(row.subject);
      if (shadow) {
        if (row.shadow) await this.wants.set(memberId, guildId, shadow, 'raid', row.costumed);
        else await this.wants.remove(memberId, guildId, shadow);
      }
      targets.add.push(...row.targets.add);
      targets.remove.push(...row.targets.remove);
    }
    await this.targets.change(memberId, guildId, targets, at);
    return { before: held, after: plan.after };
  }
}
