import { renderSe, renderTrack } from '@core/audio/synth';
import type { Settings } from '@core/settings';
import type { BgmKey } from '@data/audio/bgm';
import { BGM_KEYS, BGM_TRACKS } from '@data/audio/bgm';
import type { SeKey } from '@data/audio/se';
import { SE_KEYS, SE_RECIPES } from '@data/audio/se';

/**
 * Web Audio front end for the synthesized music and effects
 * (docs/ADR/0004-synthesized-audio.md). Tracks are rendered to PCM by the pure synth
 * on first use and cached per sample rate; BGM loops through an AudioBufferSourceNode
 * with a short crossfade, effects are fire-and-forget sources.
 *
 * Browsers only start audio after a user gesture, so nothing is created until
 * `unlock()` is called from an input handler; a BGM requested before that starts
 * when the context opens.
 */
const DEFAULT_FADE_MS = 400;
/** Window inside which a repeated effect key is treated as the same hit. */
const SE_DEDUPE_SEC = 0.05;

interface Playing {
  key: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private bgmBus: GainNode | null = null;
  private seBus: GainNode | null = null;
  private readonly bgmBuffers = new Map<string, AudioBuffer>();
  private readonly seBuffers = new Map<string, AudioBuffer>();
  private current: Playing | null = null;
  private pending: { key: string; fadeMs: number } | null = null;
  /** When each effect last started (AudioContext seconds), for the duplicate guard. */
  private readonly seStarted = new Map<string, number>();
  private bgmVolume = 0.7;
  private seVolume = 0.8;
  private warming = false;

  /** The BGM key playing (or queued until the context opens), `null` when silent. */
  get currentBgm(): string | null {
    return this.current?.key ?? this.pending?.key ?? null;
  }

  /** True once a user gesture has opened the audio context. */
  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** Call from an input handler (a user gesture): opens the context and starts queued BGM. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.bgmBus = this.ctx.createGain();
      this.seBus = this.ctx.createGain();
      this.bgmBus.connect(this.ctx.destination);
      this.seBus.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.pending) {
      const { key, fadeMs } = this.pending;
      this.pending = null;
      this.playBgm(key, fadeMs);
    }
    this.warmUp();
  }

  /** Volumes from the settings (§12.3): 0〜10, perceptual curve. */
  applySettings(settings: Pick<Settings, 'bgmVolume' | 'seVolume'>): void {
    this.bgmVolume = (settings.bgmVolume / 10) ** 2;
    this.seVolume = (settings.seVolume / 10) ** 2;
    this.applyVolumes();
  }

  /**
   * Switches the music. The same key keeps playing (map transitions, §15.1); `none`
   * stops it. `restart` forces the track from the top (after a battle).
   */
  playBgm(key: string, fadeMs = DEFAULT_FADE_MS, options: { restart?: boolean } = {}): void {
    if (key === 'none') {
      this.stopBgm(fadeMs);
      return;
    }
    if (!isBgmKey(key)) return;
    if (!this.ctx || !this.bgmBus) {
      this.pending = { key, fadeMs };
      return;
    }
    if (this.current?.key === key && !options.restart) return;
    const buffer = this.bgmBuffer(key);
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const fade = Math.max(0.01, fadeMs / 1000);
    this.stopBgm(fadeMs);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = BGM_TRACKS[key].loop;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1, now + fade);
    source.connect(gain);
    gain.connect(this.bgmBus);
    source.start(now);
    this.current = { key, source, gain };
    source.onended = () => {
      if (this.current?.source === source) this.current = null;
    };
    this.publish();
  }

  stopBgm(fadeMs = DEFAULT_FADE_MS): void {
    this.pending = null;
    const playing = this.current;
    if (!playing || !this.ctx) {
      this.current = null;
      this.publish();
      return;
    }
    const now = this.ctx.currentTime;
    const fade = Math.max(0.01, fadeMs / 1000);
    playing.gain.gain.cancelScheduledValues(now);
    playing.gain.gain.setValueAtTime(Math.max(0.0001, playing.gain.gain.value), now);
    playing.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    playing.source.stop(now + fade + 0.05);
    this.current = null;
    this.publish();
  }

  playSe(key: string): void {
    if (!this.ctx || !this.seBus || !isSeKey(key)) return;
    // The same effect requested twice within a frame (a dialog granting three items,
    // two status effects landing together) plays once instead of doubling in volume.
    const now = this.ctx.currentTime;
    const last = this.seStarted.get(key);
    if (last !== undefined && now - last < SE_DEDUPE_SEC) return;
    this.seStarted.set(key, now);
    const source = this.ctx.createBufferSource();
    source.buffer = this.seBuffer(key);
    source.connect(this.seBus);
    source.start();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.bgmBus || !this.seBus) return;
    this.bgmBus.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.02);
    this.seBus.gain.setTargetAtTime(this.seVolume, this.ctx.currentTime, 0.02);
  }

  private bgmBuffer(key: BgmKey): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const cached = this.bgmBuffers.get(key);
    if (cached) return cached;
    const rendered = renderTrack(BGM_TRACKS[key], ctx.sampleRate);
    const buffer = ctx.createBuffer(1, rendered.samples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(rendered.samples);
    this.bgmBuffers.set(key, buffer);
    return buffer;
  }

  private seBuffer(key: SeKey): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const cached = this.seBuffers.get(key);
    if (cached) return cached;
    const rendered = renderSe(SE_RECIPES[key], ctx.sampleRate);
    const buffer = ctx.createBuffer(1, rendered.samples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(rendered.samples);
    this.seBuffers.set(key, buffer);
    return buffer;
  }

  /** Renders the remaining tracks and effects one per timeout so later switches are instant. */
  private warmUp(): void {
    if (this.warming) return;
    this.warming = true;
    const queue: (() => void)[] = [
      ...SE_KEYS.map((k) => () => void this.seBuffer(k)),
      ...BGM_KEYS.map((k) => () => void this.bgmBuffer(k)),
    ];
    const step = (): void => {
      const job = queue.shift();
      if (!job || !this.ctx) return;
      job();
      setTimeout(step, 60);
    };
    setTimeout(step, 300);
  }

  /** Mirrors the state onto the e2e/debug hook. */
  private publish(): void {
    if (typeof window !== 'undefined' && window.__starfall) {
      window.__starfall.bgm = this.current?.key ?? null;
    }
  }
}

function isBgmKey(key: string): key is BgmKey {
  return (BGM_KEYS as readonly string[]).includes(key);
}

function isSeKey(key: string): key is SeKey {
  return (SE_KEYS as readonly string[]).includes(key);
}

/** The one player for the game; scenes and widgets import this. */
export const AUDIO = new AudioPlayer();
