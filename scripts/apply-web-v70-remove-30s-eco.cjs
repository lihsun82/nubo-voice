const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v70] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v70] patched ${path}`);
}

patch('components/GeminiVoiceConsole.tsx', (source) => {
  let s = source;

  const oldBlock = `  useEffect(() => {\n    ecoTimerRef.current = window.setInterval(() => {\n      if (ecoSleepingRef.current || closingRef.current) return;\n      const socket = socketRef.current;\n      if (!socket || socket.readyState !== WebSocket.OPEN) return;\n      if (Date.now() - lastInteractionAtRef.current >= NUBO_ECO_IDLE_MS) {\n        void enterEcoSleep();\n      }\n    }, 1000);\n\n    return () => {\n      if (ecoTimerRef.current) {\n        window.clearInterval(ecoTimerRef.current);\n        ecoTimerRef.current = null;\n      }\n    };\n  }, []);`;

  const newBlock = `  // NUBO_V70_NO_30S_ECO\n  // Keep the Gemini Live session active until the user explicitly stops NUBO,\n  // the app/background lifecycle disconnects it, or the network requires reconnect.\n  // Do not automatically enter eco/native-wake mode after 30 seconds.\n  useEffect(() => {\n    if (ecoTimerRef.current) {\n      window.clearInterval(ecoTimerRef.current);\n      ecoTimerRef.current = null;\n    }\n    return () => {};\n  }, []);`;

  if (s.includes(oldBlock)) {
    s = s.replace(oldBlock, newBlock);
  } else if (!s.includes('NUBO_V70_NO_30S_ECO')) {
    throw new Error('V70 could not locate 30s eco timer block');
  }

  if (!s.includes('NUBO_V70_NO_30S_ECO')) throw new Error('V70 marker missing');
  if (s.includes('Date.now() - lastInteractionAtRef.current >= NUBO_ECO_IDLE_MS')) {
    throw new Error('V70 30s eco trigger still present');
  }
  return s;
});

console.log('Applied V70 web: removed automatic 30-second eco shutdown only');
