import { TableNode, type Kysely, type KyselyPlugin, type RootOperationNode } from 'kysely';
import type { DB } from '../../src/db/types.js';

/** A deadlock as MySQL reports it to its victim (errno 1213, what `isDeadlock` looks for). */
export function deadlockError(): Error {
  return Object.assign(new Error('Deadlock found when trying to get lock'), { errno: 1213 });
}

/** The statements `deadlockingOnce` can refuse, by what they do. */
type Kind = 'insert' | 'update' | 'delete';

/** The table a statement of `kind` writes, as the node of its query names it. */
function writes(node: RootOperationNode, kind: Kind): string | undefined {
  if (kind === 'insert' && node.kind === 'InsertQueryNode') {
    return node.into?.table.identifier.name;
  }
  if (kind === 'update' && node.kind === 'UpdateQueryNode') {
    return node.table && TableNode.is(node.table) ? node.table.table.identifier.name : undefined;
  }
  if (kind === 'delete' && node.kind === 'DeleteQueryNode') {
    const from = node.from.froms[0];
    return from && TableNode.is(from) ? from.table.identifier.name : undefined;
  }
  return undefined;
}

/**
 * The database, whose first statement that does `kind` to `table` fails as a deadlock, as when
 * MySQL chose its transaction as the victim: a Kysely plugin sees each statement before it is
 * sent and throws in its place, and the transaction around it is rolled back (Kysely's
 * `execute` does that on any failure, as MySQL does after a deadlock). The statements after it
 * go through. `deadlocks()` says how many were thrown, so that a test sees the deadlock came.
 */
export function deadlockingOnce(
  db: Kysely<DB>,
  kind: Kind,
  table: keyof DB,
): { db: Kysely<DB>; deadlocks: () => number } {
  let thrown = 0;
  const plugin: KyselyPlugin = {
    transformQuery({ node }) {
      if (thrown === 0 && writes(node, kind) === table) {
        thrown += 1;
        throw deadlockError();
      }
      return node;
    },
    transformResult: ({ result }) => Promise.resolve(result),
  };
  return { db: db.withPlugin(plugin), deadlocks: () => thrown };
}
