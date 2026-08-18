/**
 * The timer's audio half (see issue #45 and the class-timer brainstorm).
 *
 * No audio file ships: there is no path on an origin we control that serves a binary asset, and a
 * data-URI would inflate every page load. A Web Audio oscillator needs neither. Autoplay is a
 * non-issue by construction — `getCompletionAudioContext` is meant to be called from the same user
 * gesture that starts a timer (a future control, #47), and the context it creates is reused
 * unchanged when that timer expires minutes later, so no sound is ever attempted without a prior
 * gesture in the page.
 */

const NOTE_FREQUENCIES_HZ = [660, 880];
const NOTE_DURATION_SECONDS = 0.18;
const NOTE_GAP_SECONDS = 0.04;
const PEAK_GAIN = 0.15;
const ATTACK_SECONDS = 0.015;

let sharedContext: AudioContext | null = null;

/**
 * Lazily creates one `AudioContext` and reuses it thereafter, resuming it if the browser suspended
 * it (Chrome does this to an `AudioContext` created outside a gesture handler, and can also suspend
 * an idle one). Call this from the gesture that starts a timer so the same, already-unlocked
 * context is what plays the completion cue later.
 */
export function getCompletionAudioContext(): AudioContext {
  if (!sharedContext) {
    sharedContext = new AudioContext();
  }
  if (sharedContext.state === 'suspended') {
    void sharedContext.resume();
  }
  return sharedContext;
}

export interface PlayCompletionCueOptions {
  /**
   * "Mute" must leave the timer fully functional, not degrade it — so muted is a no-op, not a
   * silent attempt: no nodes are created and nothing is scheduled.
   */
  muted: boolean;
}

/**
 * Plays a short, gentle two-note chime. Deliberately soft — sensory sensitivity travels with
 * several of the difficulties this project is built for, so the cue is not a harsh buzzer: a slow
 * attack, a low peak volume, and an exponential decay rather than a hard stop.
 */
export function playCompletionCue(context: AudioContext, { muted }: PlayCompletionCueOptions): void {
  if (muted) return;

  let noteStart = context.currentTime;
  for (const frequency of NOTE_FREQUENCIES_HZ) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, noteStart);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, noteStart);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, noteStart + ATTACK_SECONDS);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + NOTE_DURATION_SECONDS);
    gain.gain.setValueAtTime(0, noteStart + NOTE_DURATION_SECONDS);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + NOTE_DURATION_SECONDS);

    noteStart += NOTE_DURATION_SECONDS + NOTE_GAP_SECONDS;
  }
}
