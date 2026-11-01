/** The start was ended between two steps because a stop was asked for (SIGTERM, SIGINT). */
export class StartStopped extends Error {
  constructor() {
    super('stopped during the start');
  }
}

/**
 * A point between two steps of the start where a stop asked for in the meantime ends it: a step
 * under way (the migrations above all, whose DDL is not transactional) always finishes first.
 * Throws `StartStopped`; the start's own error handling closes what was opened.
 */
export function startCheckpoint(stopRequested: (() => boolean) | undefined): () => void {
  return () => {
    if (stopRequested?.()) throw new StartStopped();
  };
}
