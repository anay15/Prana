import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceCoach } from "./voice";

class FakeUtterance {
  volume = 1;
  rate = 1;
  pitch = 1;
  lang = "";
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

function installSpeech(voices: { lang: string; localService?: boolean; default?: boolean; name?: string }[] = []) {
  const spoken: FakeUtterance[] = [];
  const listeners: Record<string, () => void> = {};
  const synth = {
    speaking: false,
    pending: false,
    voices,
    speak: vi.fn((u: FakeUtterance) => {
      spoken.push(u);
      synth.speaking = true;
    }),
    cancel: vi.fn(() => {
      synth.speaking = false;
    }),
    resume: vi.fn(),
    getVoices: () => synth.voices,
    addEventListener: (name: string, fn: () => void) => {
      listeners[name] = fn;
    },
  };
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("window", { speechSynthesis: synth });
  vi.stubGlobal("navigator", { language: "en-IN" });
  return { synth, spoken, listeners };
}

describe("VoiceCoach", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("unlocks speech with a silent utterance (iOS needs one inside the tap)", () => {
    const { spoken, synth } = installSpeech();
    new VoiceCoach().unlock();
    expect(spoken[0].volume).toBe(0);
    expect(synth.resume).toHaveBeenCalled();
  });

  it("speaks a forced line even right after unlocking, after a short gap", () => {
    const { spoken } = installSpeech();
    const coach = new VoiceCoach();
    coach.unlock(); // leaves the engine 'speaking'
    coach.say("Let's begin", { force: true });
    expect(spoken.map((u) => u.text)).toEqual([" "]); // queued, not dropped
    vi.advanceTimersByTime(100);
    expect(spoken.map((u) => u.text)).toEqual([" ", "Let's begin"]);
  });

  it("isn't silenced forever by a stuck 'speaking' flag", () => {
    const { spoken, synth } = installSpeech();
    const coach = new VoiceCoach(0);
    coach.say("First cue");
    synth.speaking = true; // Safari bug: never resets, onend never fires
    vi.advanceTimersByTime(9000);
    coach.say("Second cue");
    vi.advanceTimersByTime(100);
    expect(spoken.map((u) => u.text)).toContain("Second cue");
  });

  it("throttles repeated cues", () => {
    const { spoken } = installSpeech();
    const coach = new VoiceCoach(3500);
    coach.say("Straighten your left leg");
    spoken[0].onend?.();
    coach.say("Straighten your left leg");
    expect(spoken).toHaveLength(1);
  });

  it("picks an English voice matching the locale, once voices load", () => {
    const { spoken, synth, listeners } = installSpeech([]);
    const coach = new VoiceCoach();
    synth.voices = [
      { lang: "hi-IN", name: "Hindi", localService: true },
      { lang: "en-US", name: "US", default: true },
      { lang: "en-IN", name: "India", localService: true },
    ];
    listeners.voiceschanged();
    coach.say("Hello", { force: true });
    expect((spoken[0].voice as { name: string }).name).toBe("India");
    expect(spoken[0].lang).toBe("en-IN");
  });

  it("does nothing when muted", () => {
    const { spoken } = installSpeech();
    const coach = new VoiceCoach();
    coach.enabled = false;
    coach.say("Hello", { force: true });
    expect(spoken).toHaveLength(0);
  });
});
