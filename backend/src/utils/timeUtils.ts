/**
 * ⏳ TIME UTILITIES
 * Helper functions for delays, timing, and pausing execution.
 */

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const getRandomDelay = (minMs: number, maxMs: number): number => {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
};
