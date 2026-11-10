import {
  decidedState,
  decisionFits,
  FETCH_RECORD_MS,
  mayAskAgain,
  type AccessRequest,
  type AskOutcome,
  type DecideOutcome,
  type DecisionTaken,
  type ScriptAccess,
  type ScriptAccessStore,
} from '../../src/domain/script-access/access.js';

/**
 * `ScriptAccessRepository` in memory, for tests: the same answers (`scriptAccessCases` runs on
 * both). `failing` makes every method of that name reject.
 */
export class MemoryScriptAccess implements ScriptAccessStore {
  readonly rows = new Map<number, ScriptAccess>();
  readonly failing = new Set<keyof ScriptAccessStore>();
  private nextId = 1;

  private check(method: keyof ScriptAccessStore): Promise<void> {
    return this.failing.has(method)
      ? Promise.reject(new Error(`the database refused ${method}`))
      : Promise.resolve();
  }

  private find(test: (row: ScriptAccess) => boolean): ScriptAccess | undefined {
    const found = [...this.rows.values()].find(test);
    return found && { ...found };
  }

  private put(row: ScriptAccess): ScriptAccess {
    this.rows.set(row.id, { ...row });
    return { ...row };
  }

  async byId(id: number) {
    await this.check('byId');
    return this.find((row) => row.id === id);
  }

  async byUser(userId: string) {
    await this.check('byUser');
    return this.find((row) => row.userId === userId);
  }

  async byKey(key: string) {
    await this.check('byKey');
    return this.find((row) => row.key === key);
  }

  async ask(request: AccessRequest): Promise<AskOutcome> {
    await this.check('ask');
    const row = this.find((one) => one.userId === request.userId);
    if (!row) {
      const access = this.put({
        id: this.nextId++,
        userId: request.userId,
        name: request.name,
        community: request.community,
        state: 'asked',
        key: null,
        askedAt: request.at,
        decidedAt: null,
        lastFetchAt: null,
        lastVersion: null,
      });
      return { kind: 'asked', access };
    }
    if (!mayAskAgain(row, request.at)) return { kind: 'standing', access: row };
    const access = this.put({
      ...row,
      name: request.name,
      community: request.community,
      state: 'asked',
      key: null,
      askedAt: request.at,
      decidedAt: null,
    });
    return { kind: 'asked', access };
  }

  async decide(id: number, taken: DecisionTaken): Promise<DecideOutcome> {
    await this.check('decide');
    const row = this.find((one) => one.id === id);
    if (!row) return { kind: 'gone' };
    if (
      row.state !== taken.from ||
      (taken.askedAt !== undefined && row.askedAt !== taken.askedAt) ||
      !decisionFits(taken.decision, row.state)
    ) {
      return { kind: 'changed', access: row };
    }
    const access = this.put({
      ...row,
      state: decidedState(taken.decision),
      key: taken.decision === 'approve' ? taken.key : null,
      decidedAt: taken.at,
    });
    return { kind: 'decided', access };
  }

  async newKey(userId: string, key: string) {
    await this.check('newKey');
    const row = this.find((one) => one.userId === userId);
    if (row?.state !== 'approved') return undefined;
    return this.put({ ...row, key });
  }

  async ownerLink(owner: { userId: string; name: string }, key: string, at: number) {
    await this.check('ownerLink');
    const row = this.find((one) => one.userId === owner.userId);
    if (row?.state === 'approved') return row;
    if (row) return this.put({ ...row, state: 'approved', key, decidedAt: at });
    return this.put({
      id: this.nextId++,
      userId: owner.userId,
      name: owner.name,
      community: '',
      state: 'approved',
      key,
      askedAt: at,
      decidedAt: at,
      lastFetchAt: null,
      lastVersion: null,
    });
  }

  async recordFetch(id: number, version: string, at: number) {
    await this.check('recordFetch');
    const row = this.find((one) => one.id === id);
    if (row?.state !== 'approved') return false;
    const due =
      row.lastFetchAt === null ||
      row.lastFetchAt <= at - FETCH_RECORD_MS ||
      row.lastVersion !== version;
    if (!due) return false;
    this.put({ ...row, lastFetchAt: at, lastVersion: version });
    return true;
  }

  async all() {
    await this.check('all');
    return [...this.rows.values()]
      .map((row) => ({ ...row }))
      .sort((a, b) => b.askedAt - a.askedAt || b.id - a.id);
  }

  async openCount() {
    await this.check('openCount');
    return [...this.rows.values()].filter((row) => row.state === 'asked').length;
  }
}
