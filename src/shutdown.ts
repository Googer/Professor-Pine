import type { Logger } from './log.js';

export interface ShutdownStep {
  name: string;
  timeoutMs: number;
  run(): Promise<void>;
}

async function withTimeout(work: () => Promise<void>, ms: number, name: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms} ms`)), ms);
  });
  try {
    await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs steps in order, each time-limited; a failed step never blocks the next. */
export function createShutdown(steps: readonly ShutdownStep[], log: Logger): () => Promise<void> {
  let running: Promise<void> | undefined;
  return () =>
    (running ??= (async () => {
      for (const step of steps) {
        try {
          await withTimeout(() => step.run(), step.timeoutMs, step.name);
          log.info({ step: step.name }, 'shutdown step finished');
        } catch (err) {
          log.error({ err, step: step.name }, 'shutdown step failed');
        }
      }
    })());
}
