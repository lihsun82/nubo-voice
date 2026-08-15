import fs from 'node:fs';

function replaceOnce(text, oldText, newText, label) {
  if (text.includes(newText)) return text;
  if (!text.includes(oldText)) throw new Error(`V61 missing pattern: ${label}`);
  return text.replace(oldText, newText);
}

// 1) Harden Live routing for volatile facts, hotel radar, and natural latency masking.
{
  const path = 'lib/browser-nubo-tools-line.ts';
  let s = fs.readFileSync(path, 'utf8');

  const anchor = '快速路由：\n';
  const insert = `即時資料與查詢銜接硬規則（V61）：\n- 只要使用者提到「今天、現在、目前、剛剛、剛才、最新、近期、本週、新聞、國際時事、地震、海嘯、災害、戰爭、衝突、選舉、股市、匯率、金價、油價、天氣、颱風、比賽結果」或陳述一件可能剛發生的事件，即使沒有說「幫我查」，也必須先呼叫research_now取得即時資料；禁止只靠模型記憶回答。\n- 對上述高時效問題，如果工具查不到，必須明確說目前無法確認，不得把舊知識當成今天的事實。\n- 在呼叫research_now、hotel_market_report、hotel_market_refresh、travel_plan或其他可能需要超過約1秒的查詢工具前，先用目前NUBO聲線自然說一個短銜接句，例如「哦…我現在幫你查一下最新的喔。」、「嗯…這個我確認一下最新資料，等我一下。」或「欸，我現在直接幫你查給你看喔。」；只說一句，說完立刻呼叫工具，不要等語助詞播完才開始查詢。\n- 如果查詢超過約3秒仍未完成，最多再補一句「有，我還在查，等我一下下喔。」；結果一回來立即停止語助詞並接正式答案。不得連續重複同一句。\n- 新寶旅宿監控系統、旅宿監控、旅宿雷達、房價監控、市場雷達、AinuboX1旅館行情都視為hotel_market_report意圖。沒有指定館別或區域時使用zone=all。\n\n快速路由：\n`;
  s = replaceOnce(s, anchor, insert, 'system instruction V61 anchor');

  s = s.replace(
    '1. 一般聊天、常識、簡單建議直接回答，不得呼叫research_now。',
    '1. 一般聊天、穩定常識、簡單建議直接回答；但只要涉及今天、現在、剛剛、最新、新聞、地震或其他可能變動的事實，必須依V61即時資料硬規則呼叫research_now。',
  );
  s = s.replace(
    '2. 只有使用者明確要求查詢、搜尋、最新、查證、比較、來源、研究或深入分析，且確實需要外部即時資料時，才能呼叫research_now。',
    '2. 使用者明確要求查詢、搜尋、最新、查證、比較、來源、研究或深入分析時呼叫research_now；此外任何高時效事件或當日國際時事即使沒有明講「查」，也必須呼叫research_now。',
  );
  s = s.replace(
    '5. 旅館房價與競品行情用hotel_market_report；明確要求重新抓取才用hotel_market_refresh。',
    '5. 旅館房價與競品行情，以及「新寶旅宿監控系統／旅宿監控／旅宿雷達／房價監控／市場雷達」都用hotel_market_report；沒有指定館別時zone=all。明確要求重新抓取才用hotel_market_refresh。',
  );

  fs.writeFileSync(path, s);
}

// 2) Expand current-affairs guard so disasters and breaking events cannot fall back to model memory.
{
  const path = 'lib/nubo-voice-tool-guard.ts';
  let s = fs.readFileSync(path, 'utf8');
  s = s.replace(
    '颱風|颱風警報|熱帶性低氣壓|豪雨|地震|國際時事|國際新聞|政治|選舉',
    '颱風|颱風警報|熱帶性低氣壓|豪雨|地震|海嘯|災害|火山|洪水|空難|重大事故|國際時事|國際新聞|政治|選舉',
  );
  fs.writeFileSync(path, s);
}

// 3) International disasters must not be answered from Taiwan CWA direct data.
{
  const path = 'app/api/current-info/route.ts';
  let s = fs.readFileSync(path, 'utf8');
  const oldFn = `function isDisasterQuestion(question: string) {\n  return /(豪雨|大雨特報|地震|停班停課|強風|海嘯)/i.test(question);\n}\n`;
  const newFn = `${oldFn}\nfunction isForeignDisasterQuestion(question: string) {\n  return /(印尼|印度尼西亞|日本|菲律賓|美國|中國|土耳其|智利|墨西哥|紐西蘭|俄羅斯|阿拉斯加|歐洲|國際|海外)/i.test(question);\n}\n`;
  s = replaceOnce(s, oldFn, newFn, 'foreign disaster detector');
  s = replaceOnce(
    s,
    '  const disaster = isDisasterQuestion(question);\n',
    '  const disaster = isDisasterQuestion(question);\n  const foreignDisaster = disaster && isForeignDisasterQuestion(question);\n',
    'foreign disaster flag',
  );
  s = replaceOnce(
    s,
    '    typhoon || disaster\n      ? fetchCwaDirect().catch(() => ({ configured: false, summaries: [] as string[] }))',
    '    typhoon || (disaster && !foreignDisaster)\n      ? fetchCwaDirect().catch(() => ({ configured: false, summaries: [] as string[] }))',
    'CWA scope',
  );
  fs.writeFileSync(path, s);
}

console.log('Applied V61 web smart-assistant patch: freshness + international disaster + hotel routing + latency masking');
