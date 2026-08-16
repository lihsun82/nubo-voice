import fs from 'node:fs';

const path = 'components/GeminiVoiceConsole.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('NUBO_STABLE_2_EXPLICIT_WAKE_SHUTDOWN')) {
  const anchor = `  const disconnect = async () => {\n    window.localStorage.removeItem(`;
  const replacement = `  const disconnect = async () => {\n    // NUBO_STABLE_2_EXPLICIT_WAKE_SHUTDOWN\n    try {\n      const nativeWake = (window as typeof window & {\n        NuboNative?: { stopNativeWakeService?: () => boolean };\n      }).NuboNative;\n      nativeWake?.stopNativeWakeService?.();\n    } catch {}\n\n    window.localStorage.removeItem(`;
  if (!s.includes(anchor)) throw new Error('Stable 2 shutdown: disconnect anchor missing');
  s = s.replace(anchor, replacement);
}

fs.writeFileSync(path, s);
console.log('Applied Stable 2 explicit native wake shutdown');
