import fs from 'node:fs';

const path = 'components/GeminiVoiceConsole.tsx';
const marker = 'NUBO_NATIVE_WAKE_FRESH_IDLE_V1';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes(marker)) {
  const oldHandler = `    const handleNativeWake = () => {\n      if (ecoSleepingRef.current) wakeFromEco();\n    };`;
  const newHandler = `    const handleNativeWake = () => {\n      // ${marker}\n      if (ecoSleepingRef.current) {\n        wakeFromEco();\n        return;\n      }\n\n      const socket = socketRef.current;\n      if (\n        socket?.readyState === WebSocket.OPEN ||\n        socket?.readyState === WebSocket.CONNECTING\n      ) {\n        return;\n      }\n\n      setError(\"\");\n      setTranscript(\"NUBO已聽到喚醒詞，正在啟動語音…\");\n      void connect(false);\n    };`;

  if (!source.includes(oldHandler)) {
    throw new Error('native wake fresh-idle handler anchor missing');
  }
  source = source.replace(oldHandler, newHandler);
  fs.writeFileSync(path, source);
}

const finalSource = fs.readFileSync(path, 'utf8');
if (!finalSource.includes(marker) || !finalSource.includes('void connect(false)')) {
  throw new Error('native wake fresh-idle patch verification failed');
}

console.log('Applied native wake -> fresh idle Gemini reconnect');
