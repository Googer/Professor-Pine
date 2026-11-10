import { describe, expect, it } from 'vitest';
import { BOARD_SERVER, boardReaderCases } from './board-cases.js';
import { MemoryBoards, memoryBoardWorld } from './boards.js';

describe('the boards’ reads in memory', () => {
  boardReaderCases(() => Promise.resolve(memoryBoardWorld()));

  it('counts every read, and rejects them all while failing', async () => {
    const boards = new MemoryBoards();
    await boards.onBoards(BOARD_SERVER);
    expect(boards.reads).toBe(1);
    boards.failing = new Error('away');
    await expect(boards.splitLinks(BOARD_SERVER)).rejects.toThrow('away');
    expect(boards.reads).toBe(2);
  });
});
