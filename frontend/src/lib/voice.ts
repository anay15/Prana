/**
 * Throttled spoken coaching using the browser's built-in speech synthesis.
 *
 * Mobile browsers need extra care:
 *  - iOS (Safari, and every iOS browser) only allows speech that starts from a
 *    user gesture. `unlock()` must be called synchronously inside a tap
 *    handler, before any `await`; after that, speech works for the page.
 *  - `speechSynthesis.speaking` can get stuck `true` on Safari, so we track our
 *    own utterance (with a timeout) instead of trusting it.
 *  - Chrome may drop an utterance queued right after `cancel()`, so we leave a
 *    short gap.
 *  - Some Android devices have no default voice; we pick an English one.
 */

const CANCEL_GAP_MS = 80;
/** If a browser never fires onend, assume the line finished after this long. */
const MAX_UTTERANCE_MS = 8000;

export class VoiceCoach {
  enabled = true;
  private lastSpokenAt = -Infinity;
  private lastText = "";
  private busyUntil = 0;
  private voice: SpeechSynthesisVoice | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly minGapMs = 3500) {
    if (!this.supported) return;
    this.pickVoice();
    // Voices load asynchronously on Chrome/Android
    window.speechSynthesis.addEventListener?.("voiceschanged", () => this.pickVoice());
  }

  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  }

  /** Call synchronously from a tap/click handler to allow speech on iOS. */
  unlock() {
    if (!this.supported) return;
    const synth = window.speechSynthesis;
    synth.resume(); // Safari can be left paused after the page was backgrounded
    const primer = new SpeechSynthesisUtterance(" ");
    primer.volume = 0;
    synth.speak(primer);
  }

  say(text: string, { force = false } = {}) {
    if (!this.enabled || !this.supported) return;
    const now = performance.now();
    if (!force) {
      if (now - this.lastSpokenAt < this.minGapMs) return;
      if (text === this.lastText && now - this.lastSpokenAt < this.minGapMs * 2) return;
      if (now < this.busyUntil) return; // still saying the previous line
    }
    this.lastSpokenAt = now;
    this.lastText = text;

    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.lang = this.voice?.lang ?? "en-US";
    if (this.voice) utterance.voice = this.voice;
    this.busyUntil = now + MAX_UTTERANCE_MS;
    utterance.onend = utterance.onerror = () => {
      this.busyUntil = 0;
    };

    if (this.pending) clearTimeout(this.pending);
    if (synth.speaking || synth.pending) {
      synth.cancel();
      this.pending = setTimeout(() => {
        this.pending = null;
        synth.resume();
        synth.speak(utterance);
      }, CANCEL_GAP_MS);
    } else {
      synth.resume();
      synth.speak(utterance);
    }
  }

  stop() {
    if (!this.supported) return;
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
    this.busyUntil = 0;
    window.speechSynthesis.cancel();
  }

  /** Prefer a local English voice matching the user's locale. */
  private pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    const locale = (navigator.language || "en-US").toLowerCase();
    const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
    this.voice =
      english.find((v) => v.lang.toLowerCase() === locale && v.localService) ??
      english.find((v) => v.lang.toLowerCase() === locale) ??
      english.find((v) => v.default) ??
      english.find((v) => v.localService) ??
      english[0] ??
      null;
  }
}
