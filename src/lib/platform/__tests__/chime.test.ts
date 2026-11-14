import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeOsc {
  frequency: { value: number };
  start: ReturnType<typeof vi.fn>;
}

const oscillators: FakeOsc[] = [];
let created = 0;
let state: AudioContextState = 'suspended';
const resume = vi.fn(() => {
  state = 'running';
  return Promise.resolve();
});

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  resume = resume;
  constructor() {
    created += 1;
  }
  get state(): AudioContextState {
    return state;
  }
  createOscillator(): FakeOsc & { type: string; connect: () => void; stop: () => void } {
    const o = {
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    oscillators.push(o);
    return o;
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
}

beforeEach(() => {
  vi.resetModules();
  oscillators.length = 0;
  created = 0;
  state = 'suspended';
  resume.mockClear();
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chime', () => {
  it('does nothing before unlock', async () => {
    const { playChime } = await import('../chime');
    playChime();
    expect(created).toBe(0);
    expect(oscillators).toHaveLength(0);
  });

  it('creates one context and resumes on every unlock', async () => {
    const { unlockChime } = await import('../chime');
    unlockChime();
    unlockChime();
    expect(created).toBe(1);
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('plays two oscillators once running', async () => {
    const { unlockChime, playChime } = await import('../chime');
    unlockChime();
    playChime();
    expect(oscillators).toHaveLength(2);
    expect(oscillators.map((o) => o.frequency.value)).toEqual([880, 1320]);
  });

  it('is silent when the context is not running', async () => {
    const { unlockChime, playChime } = await import('../chime');
    unlockChime();
    state = 'suspended';
    playChime();
    expect(oscillators).toHaveLength(0);
  });
});
