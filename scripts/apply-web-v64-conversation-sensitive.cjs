const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v64] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v64] patched ${path}`);
}

patch('lib/browser-audio.ts', (source) => {
  let s = source;

  // V64 conversation-sensitive profile:
  // - react to softer speech sooner
  // - keep echo/noise/AGC protection enabled
  // - do not change any tool execution gate
  s = s.replace('this.processor = this.context.createScriptProcessor(2048, 1, 1);',
    'this.processor = this.context.createScriptProcessor(1024, 1, 1);');
  s = s.replace('const threshold = Math.max(0.02, this.noiseFloor * 2.6);',
    'const threshold = Math.max(0.015, this.noiseFloor * 2.2);');
  s = s.replace('const voiceDetected = this.hotFrames >= 2;',
    'const voiceDetected = this.hotFrames >= 1;');

  if (!s.includes('createScriptProcessor(1024, 1, 1)')) {
    throw new Error('V64 lower-latency capture buffer not applied');
  }
  if (!s.includes('Math.max(0.015, this.noiseFloor * 2.2)')) {
    throw new Error('V64 speech sensitivity threshold not applied');
  }
  if (!s.includes('this.hotFrames >= 1')) {
    throw new Error('V64 fast voice onset not applied');
  }
  if (!s.includes('echoCancellation: true') || !s.includes('noiseSuppression: true') || !s.includes('autoGainControl: true')) {
    throw new Error('V64 microphone protection settings missing');
  }
  return s;
});

patch('lib/browser-nubo-tools-line.ts', (source) => {
  let s = source;
  const marker = '3. 語音辨識很短、不完整、像半句、只有單一動詞、非繁體中文或像錯誤外語片段時，說「我剛剛沒聽清楚，請再說一次」，不得呼叫任何工具。必須等待使用者完整說完一句後再判斷意圖。';
  const replacement = '3. 一般聊天可以快速理解與自然接話，但任何工具執行仍必須等待完整且明確的最終意圖。語音辨識很短、不完整、像半句、只有單一動詞、非繁體中文或像錯誤外語片段時，說「我剛剛沒聽清楚，請再說一次」，不得呼叫任何工具。';
  if (s.includes(marker)) s = s.replace(marker, replacement);
  if (!s.includes('一般聊天可以快速理解與自然接話')) {
    throw new Error('V64 conversation/tool separation instruction not applied');
  }
  return s;
});

console.log('Applied V64 conversation-sensitive microphone profile');
