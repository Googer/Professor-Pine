import type { Kysely } from 'kysely';
import { describe, expect, it, vi } from 'vitest';
import { DEADLOCK_TRIES, inTransaction, retryOnDeadlock } from './transaction.js';

/** A Kysely that is a caller's transaction already, as far as `inTransaction` looks. */
function joined(): Kysely<unknown> {
  return { isTransaction: true } as unknown as Kysely<unknown>;
}

/** A Kysely that is no transaction, as far as `retryOnDeadlock` looks. */
function root(): Kysely<unknown> {
  return { isTransaction: false } as unknown as Kysely<unknown>;
}

const deadlock = () => Object.assign(new Error('Deadlock found'), { errno: 1213 });

describe('inTransaction', () => {
  it('joins a caller’s transaction', async () => {
    const work = vi.fn(() => Promise.resolve(7));
    expect(await inTransaction(joined(), work)).toBe(7);
    expect(work).toHaveBeenCalledOnce();
  });

  it('refuses an isolation level it cannot set: a caller’s transaction has its own', async () => {
    const work = vi.fn(() => Promise.resolve(7));
    await expect(inTransaction(joined(), work, { isolation: 'read committed' })).rejects.toThrow(
      /isolation/,
    );
    expect(work).not.toHaveBeenCalled();
  });
});

describe('retryOnDeadlock', () => {
  it('runs its work again after a deadlock', async () => {
    const work = vi.fn().mockRejectedValueOnce(deadlock()).mockResolvedValue(7);
    expect(await retryOnDeadlock(root(), work)).toBe(7);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('lets the last deadlock through once its tries are spent', async () => {
    const work = vi.fn(() => Promise.reject(deadlock()));
    await expect(retryOnDeadlock(root(), work)).rejects.toThrow(/Deadlock/);
    expect(work).toHaveBeenCalledTimes(DEADLOCK_TRIES);
  });

  it('runs its work once on any other failure', async () => {
    const work = vi.fn(() => Promise.reject(new Error('gone')));
    await expect(retryOnDeadlock(root(), work)).rejects.toThrow('gone');
    expect(work).toHaveBeenCalledOnce();
  });

  it('runs its work once inside a caller’s transaction, which the deadlock took', async () => {
    const work = vi.fn(() => Promise.reject(deadlock()));
    await expect(retryOnDeadlock(joined(), work)).rejects.toThrow(/Deadlock/);
    expect(work).toHaveBeenCalledOnce();
  });
});
