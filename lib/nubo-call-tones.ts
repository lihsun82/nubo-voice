"use client";

import type { NuboKioskLanguage } from "./nubo-kiosk-language";

const RING_URL = "/audio/nubo-guest-call-ring.mp3";
const clips = new Map<string, Promise<AudioBuffer>>();

function greetingUrl(language: NuboKioskLanguage) {
  return `/audio/nubo-jinxin-welcome-${language}-20261128.mp3?v=clear-hello`;
}

function loadClip(url: string) {
  const cached = clips.get(url);
  if (cached) return cached;
  const pending = (async () => {
    const response = await fetch(url, { cache: "force-cache", signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error("Call audio unavailable");
    const decoder = new OfflineAudioContext(1, 1, 48_000);
    return decoder.decodeAudioData(await response.arrayBuffer());
  })().catch((error) => {
    clips.delete(url);
    throw error;
  });
  clips.set(url, pending);
  return pending;
}

export function preloadNuboCallOpening(language: NuboKioskLanguage) {
  void Promise.allSettled([loadClip(RING_URL), loadClip(greetingUrl(language))]);
}

function playMedia(audio: HTMLAudioElement, url: string, timeout: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return resolve();
    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.removeEventListener("ended", end);
      audio.removeEventListener("error", fail);
      signal?.removeEventListener("abort", end);
      audio.pause();
    }
    function end() { finish(); resolve(); }
    function fail() { finish(); reject(new Error("Call audio playback failed")); }
    const timer = window.setTimeout(fail, timeout);
    audio.addEventListener("ended", end, { once: true });
    signal?.addEventListener("abort", end, { once: true });
    audio.addEventListener("error", fail);
    audio.src = url;
    void audio.play().catch(fail);
  });
}

export function playNuboCallTones() {
  return playMedia(new Audio(), RING_URL, 4000).catch(() => undefined);
}

// Start on the dial gesture. Both recordings use this output until the welcome ends.
export class NuboCallOpening {
  private context: AudioContext | null = null;
  private readonly controller = new AbortController();
  private readonly media = new Audio();
  private readonly ready: Promise<void>;
  readonly ring: Promise<void>;

  readonly language: NuboKioskLanguage;

  constructor(language: NuboKioskLanguage) {
    this.language = language;
    try {
      this.context = new AudioContext({ latencyHint: "playback" });
      this.ready = this.context.resume();
    } catch (error) {
      this.ready = Promise.reject(error);
    }
    preloadNuboCallOpening(language);
    this.ring = this.play(RING_URL, 4000).catch(() => undefined);
  }

  private async play(url: string, timeout: number) {
    const signal = this.controller.signal;
    const context = this.context;
    try {
      const [, buffer] = await Promise.all([this.ready, loadClip(url)]);
      if (signal.aborted) return;
      if (!context || context.state !== "running") throw new Error("Speaker unavailable");
      await new Promise<void>((resolve, reject) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        function finish() {
          signal.removeEventListener("abort", stop);
          source.disconnect();
          resolve();
        }
        function stop() {
          source.onended = null;
          source.stop();
          finish();
        }
        source.connect(context.destination);
        source.onended = finish;
        try {
          source.start();
          signal.addEventListener("abort", stop, { once: true });
        } catch (error) {
          source.disconnect();
          reject(error);
        }
      });
    } catch {
      await playMedia(this.media, url, timeout, signal);
    }
  }

  async playGreeting() {
    await this.play(greetingUrl(this.language), 14000);
    const signal = this.controller.signal;
    if (signal.aborted) return;
    // An ended event means the buffer was rendered. Let the device drain
    // its output before closing the speaker and switching to microphone mode.
    const latency = (this.context?.baseLatency || 0) + (this.context?.outputLatency || 0);
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(finish, Math.min(500, Math.max(100, latency * 1000)));
      function finish() {
        window.clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      }
      signal.addEventListener("abort", finish, { once: true });
    });
  }

  close() {
    this.controller.abort();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => undefined);
  }
}
