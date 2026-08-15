const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v63] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v63] patched ${path}`);
}

patch('components/GeminiVoiceConsole.tsx', (source) => {
  let s = source;

  if (!s.includes('NUBO_YOUTUBE_FAST_ROUTE_ENABLED')) {
    s = s.replace(
      'const NUBO_YOUTUBE_FAST_ROUTE_DEDUPE_MS = 12_000;',
      '// V63: never execute YouTube from interim/partial Live transcription.\n// The model may still call open_youtube after the utterance is complete.\nconst NUBO_YOUTUBE_FAST_ROUTE_ENABLED = false;\nconst NUBO_YOUTUBE_FAST_ROUTE_DEDUPE_MS = 12_000;',
    );
  }

  s = s.replace(
    'if (fastYouTubeQuery) {',
    'if (NUBO_YOUTUBE_FAST_ROUTE_ENABLED && fastYouTubeQuery) {',
  );

  const oldEco = `    // Android/iOS speech recognizers emit system start/restart chimes in\n    // background/eco mode. Keep mobile eco truly silent: cloud voice stays\n    // stopped and the user taps the existing Start NUBO button to reconnect.\n    const userAgent = window.navigator.userAgent;\n    const isIpadOs =\n      /Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;\n    const isMobileBrowser =\n      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isIpadOs;\n    if (isMobileBrowser) return;\n\n    try {\n      const nativeBridge = (window as typeof window & {\n        NuboNative?: { startWakeListener?: () => boolean };\n      }).NuboNative;\n      if (nativeBridge?.startWakeListener?.()) return;\n    } catch {}\n`;
  const newEco = `    // V63: Android native wake must get first chance after the 30-second eco\n    // transition. Plain mobile browsers stay silent and never start Web Speech.\n    try {\n      const nativeBridge = (window as typeof window & {\n        NuboNative?: { startWakeListener?: () => boolean };\n      }).NuboNative;\n      if (nativeBridge?.startWakeListener?.()) return;\n    } catch {}\n\n    const userAgent = window.navigator.userAgent;\n    const isIpadOs =\n      /Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;\n    const isMobileBrowser =\n      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isIpadOs;\n    if (isMobileBrowser) return;\n`;
  if (s.includes(oldEco)) s = s.replace(oldEco, newEco);

  if (!s.includes('NUBO_YOUTUBE_FAST_ROUTE_ENABLED = false')) {
    throw new Error('V63 YouTube interim guard was not applied');
  }
  if (!s.includes('nativeBridge?.startWakeListener?.()')) {
    throw new Error('V63 native wake bridge missing');
  }
  return s;
});

patch('lib/browser-nubo-tools-line.ts', (source) => {
  let s = source;
  s = s.replace(
    '3. 語音辨識很短、不完整、非繁體中文或像錯誤外語片段時，說「我剛剛沒聽清楚，請再說一次」，不得呼叫工具。',
    '3. 語音辨識很短、不完整、像半句、只有單一動詞、非繁體中文或像錯誤外語片段時，說「我剛剛沒聽清楚，請再說一次」，不得呼叫任何工具。必須等待使用者完整說完一句後再判斷意圖。',
  );
  s = s.replace(
    '8. 只要使用者指定歌曲、歌手、MV、音樂或影片，即使說法是「開啟YouTube播放」，一律用open_youtube，不得用open_mobile_app，不得只開YouTube首頁或搜尋頁。',
    '8. 只有使用者完整且明確表達播放意圖（例如播放、播、放、我要聽、我想聽、換成）並同時提供歌曲、歌手、MV、音樂或影片目標時，才能用open_youtube。只有名稱、零碎詞、背景聲或推測意圖時禁止播放。',
  );
  s = s.replace(
    '11. 使用者在播放期間指定另一首歌時，立即再次呼叫open_youtube，不詢問確認。',
    '11. 使用者在播放期間只有在完整明確說出換歌／播放另一首的指令與目標後，才再次呼叫open_youtube；不得根據片段轉錄、NUBO自己的聲音、YouTube背景聲或不完整句子自動換歌。',
  );

  if (!s.includes('不得根據片段轉錄')) {
    throw new Error('V63 YouTube intent instruction was not applied');
  }
  return s;
});

console.log('Applied V63 web voice intent guard');
