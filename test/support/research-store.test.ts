import { describe } from 'vitest';
import { pineStopCases } from './pine-stop-cases.js';
import { MemoryPineStops } from './pine-stops.js';
import { researchEventCases, researchTaskCases, stopPostCases } from './research-store-cases.js';
import { MemoryResearchEvents, MemoryResearchTasks, MemoryStopPosts } from './research-store.js';
import { stopLineCases } from './stop-line-cases.js';
import { MemoryStopLines } from './stop-lines.js';

describe('MemoryStopPosts', () => {
  stopPostCases(() => Promise.resolve(new MemoryStopPosts()));
});

describe('MemoryStopLines', () => {
  stopLineCases(() => Promise.resolve(new MemoryStopLines()));
});

describe('MemoryResearchEvents', () => {
  researchEventCases(() => Promise.resolve(new MemoryResearchEvents()));
});

describe('MemoryResearchTasks', () => {
  researchTaskCases(() => Promise.resolve(new MemoryResearchTasks()));
});

describe('MemoryPineStops', () => {
  pineStopCases(() => Promise.resolve(new MemoryPineStops()));
});
