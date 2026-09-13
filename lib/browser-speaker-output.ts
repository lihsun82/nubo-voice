// Browser/Android sink switching can trigger audible system routing ticks/chimes.
// NUBO already uses the browser's current default media output, so these helpers
// intentionally remain no-ops. Native routing, if needed, stays in the native app.
export async function preferMultimediaAudioContext(_context: AudioContext) {
  return false;
}

export async function preferMultimediaMediaElement(_element: HTMLMediaElement) {
  return false;
}

export async function disableHardwareOutputForCaptureContext(_context: AudioContext) {
  return false;
}
