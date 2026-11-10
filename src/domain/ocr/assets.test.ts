import { describe, expect, it } from 'vitest';
import { deviceProblem, OCR_ASSETS } from './assets.js';

describe('deviceProblem', () => {
  it('allows the CPU everywhere, DirectML on Windows and CUDA on Linux x64 only', () => {
    expect(deviceProblem('cpu', 'linux', 'arm64')).toBeUndefined();
    expect(deviceProblem('directml', 'win32', 'x64')).toBeUndefined();
    expect(deviceProblem('directml', 'linux', 'x64')).toBe('DirectML runs on Windows only');
    expect(deviceProblem('cuda', 'linux', 'x64')).toBeUndefined();
    expect(deviceProblem('cuda', 'linux', 'arm64')).toBe('CUDA runs on Linux x64 only');
    expect(deviceProblem('cuda', 'win32', 'x64')).toBe('CUDA runs on Linux x64 only');
  });
});

describe('OCR_ASSETS', () => {
  it('names each file once, with its size and a SHA-256', () => {
    expect(OCR_ASSETS.map((asset) => asset.name)).toEqual([
      'detector',
      'recogniser',
      'dictionary',
      'headIcon',
    ]);
    for (const asset of OCR_ASSETS) expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
