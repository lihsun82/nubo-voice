"use client";

const KEY = "nubo.voice.owner";
const CHANNEL = "nubo.voice.channel";
const TTL_MS = 8000;

type VoiceOwner = {
  id: string;
  label: string;
  updatedAt: number;
};

function now() {
  return Date.now();
}

function readOwner(): VoiceOwner | null {
  try {
    const value = window.localStorage.getItem(KEY);
    if (!value) return null;
    const owner = JSON.parse(value) as VoiceOwner;
    if (!owner?.id || now() - Number(owner.updatedAt ?? 0) > TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return owner;
  } catch {
    window.localStorage.removeItem(KEY);
    return null;
  }
}

function writeOwner(owner: VoiceOwner) {
  window.localStorage.setItem(KEY, JSON.stringify(owner));
}

export function createVoiceOwnerId() {
  return crypto.randomUUID();
}

export function acquireVoiceLock(id: string, label: string) {
  const owner = readOwner();
  if (owner && owner.id !== id) return false;
  writeOwner({ id, label, updatedAt: now() });
  return true;
}

export function refreshVoiceLock(id: string, label: string) {
  const owner = readOwner();
  if (owner && owner.id !== id) return false;
  writeOwner({ id, label, updatedAt: now() });
  return true;
}

export function releaseVoiceLock(id: string) {
  const owner = readOwner();
  if (!owner || owner.id === id) window.localStorage.removeItem(KEY);
}

export function listenForVoiceOwnerChanges(id: string, onLost: () => void) {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
  const notify = () => {
    const owner = readOwner();
    if (owner && owner.id !== id) onLost();
  };
  const storageHandler = (event: StorageEvent) => {
    if (event.key === KEY) notify();
  };
  channel?.addEventListener("message", notify);
  window.addEventListener("storage", storageHandler);
  return () => {
    channel?.removeEventListener("message", notify);
    channel?.close();
    window.removeEventListener("storage", storageHandler);
  };
}

export function announceVoiceOwnerChange() {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: "changed", at: now() });
    channel.close();
  } catch {
    // BroadcastChannel may be unavailable in older browsers.
  }
}
