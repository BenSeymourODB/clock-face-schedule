import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createMockAudioParam(initial = 0) {
  return {
    value: initial,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn()
  };
}

function createMockOscillator() {
  return {
    type: 'sine',
    frequency: createMockAudioParam(),
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  };
}

function createMockGain() {
  return {
    gain: createMockAudioParam(),
    connect: vi.fn()
  };
}

class MockAudioContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  createOscillator = vi.fn(() => createMockOscillator());
  createGain = vi.fn(() => createMockGain());
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCompletionAudioContext', () => {
  it('creates and reuses a single context across calls', async () => {
    const { getCompletionAudioContext } = await import('./timer-audio-cue');
    const first = getCompletionAudioContext();
    const second = getCompletionAudioContext();
    expect(second).toBe(first);
  });

  it('resumes the shared context if the browser suspended it', async () => {
    const { getCompletionAudioContext } = await import('./timer-audio-cue');
    const context = getCompletionAudioContext() as unknown as MockAudioContext;
    context.state = 'suspended';
    getCompletionAudioContext();
    expect(context.resume).toHaveBeenCalledTimes(1);
  });
});

describe('playCompletionCue', () => {
  it('creates no audio nodes at all when muted — mute must silence, not merely fail quietly', async () => {
    const { getCompletionAudioContext, playCompletionCue } = await import('./timer-audio-cue');
    const context = getCompletionAudioContext() as unknown as MockAudioContext;
    playCompletionCue(context as unknown as AudioContext, { muted: true });
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(context.createGain).not.toHaveBeenCalled();
  });

  it('plays a two-note sine chime through a gain envelope when unmuted', async () => {
    const { getCompletionAudioContext, playCompletionCue } = await import('./timer-audio-cue');
    const context = getCompletionAudioContext() as unknown as MockAudioContext;
    playCompletionCue(context as unknown as AudioContext, { muted: false });

    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    expect(context.createGain).toHaveBeenCalledTimes(2);

    const oscillators = context.createOscillator.mock.results.map((result) => result.value);
    const gains = context.createGain.mock.results.map((result) => result.value);

    for (const oscillator of oscillators) {
      expect(oscillator.type).toBe('sine');
      expect(oscillator.start).toHaveBeenCalledTimes(1);
      expect(oscillator.stop).toHaveBeenCalledTimes(1);
    }

    oscillators.forEach((oscillator, index) => {
      expect(oscillator.connect).toHaveBeenCalledWith(gains[index]);
      expect(gains[index].connect).toHaveBeenCalledWith(context.destination);
    });

    // Gentle: ramps up to peak rather than jumping there, and decays rather than clipping to silence.
    for (const gain of gains) {
      expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalled();
      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
    }

    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(660, expect.any(Number));
    expect(oscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(880, expect.any(Number));

    // The second note starts strictly after the first has finished, not layered on top of it.
    const firstStartTime = oscillators[0].frequency.setValueAtTime.mock.calls[0][1] as number;
    const secondStartTime = oscillators[1].frequency.setValueAtTime.mock.calls[0][1] as number;
    expect(secondStartTime).toBeGreaterThan(firstStartTime);
  });
});
