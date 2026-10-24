/** Throttled spoken coaching using the browser's built-in speech synthesis. */
export class VoiceCoach {
  enabled = true;
  private lastSpokenAt = 0;
  private lastText = "";

  constructor(private readonly minGapMs = 3500) {}

  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  say(text: string, { force = false } = {}) {
    if (!this.enabled || !this.supported) return;
    const now = performance.now();
    if (!force && (now - this.lastSpokenAt < this.minGapMs || (text === this.lastText && now - this.lastSpokenAt < this.minGapMs * 2))) {
      return;
    }
    if (window.speechSynthesis.speaking && !force) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
    this.lastSpokenAt = now;
    this.lastText = text;
  }

  stop() {
    if (this.supported) window.speechSynthesis.cancel();
  }
}
