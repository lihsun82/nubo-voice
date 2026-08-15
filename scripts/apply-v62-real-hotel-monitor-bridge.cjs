const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v62] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v62] patched ${path}`);
}

patch('lib/browser-nubo-tools-line.ts', (source) => {
  let s = source;

  if (!s.includes('async function hotelMonitorStatus()')) {
    const marker = 'export async function executeNuboBrowserTool(call: FunctionCall) {';
    const helper = `async function hotelMonitorStatus() {\n  const response = await fetch("/api/hotel-radar/health", { cache: "no-store" });\n  const payload = await response.json().catch(() => ({}));\n  // Health endpoint intentionally returns structured failure state instead of hiding it.\n  if (!response.ok && !payload?.connected) {\n    throw new Error(payload?.error ?? "新寶旅宿監控系統目前無法連線");\n  }\n  return payload;\n}\n\n`;
    if (!s.includes(marker)) throw new Error('V62 helper insertion marker missing');
    s = s.replace(marker, helper + marker);
  }

  if (!s.includes('call.name === "hotel_monitor_status"')) {
    const marker = '  if (call.name === "research_now") {';
    const block = `  if (call.name === "hotel_monitor_status") {\n    return hotelMonitorStatus();\n  }\n\n`;
    if (!s.includes(marker)) throw new Error('V62 execute insertion marker missing');
    s = s.replace(marker, block + marker);
  }

  const oldHotelRule = '5. 旅館房價與競品行情用hotel_market_report；明確要求重新抓取才用hotel_market_refresh。';
  const newHotelRule = '5. 新寶旅宿監控系統、AinuboX1、旅宿雷達、監控是否正常、最後更新時間或工作流狀態，一律先用hotel_monitor_status；詢問實際旅館房價與競品行情再用hotel_market_report；明確要求重新抓取才用hotel_market_refresh。不得把過期資料說成即時資料。';
  if (s.includes(oldHotelRule)) s = s.replace(oldHotelRule, newHotelRule);

  if (!s.includes('name: "hotel_monitor_status"')) {
    const marker = '  {\n    name: "google_home_light",';
    const declaration = `  {\n    name: "hotel_monitor_status",\n    description:\n      "真實查詢新寶旅宿監控系統（AinuboX1）的連線、最新正式工作流成功/失敗、最後更新時間、資料是否過期與最近失敗狀態。使用者問監控系統是否正常、是否有串接、最後更新、雷達狀態時必須使用。",\n    parameters: { type: "OBJECT", properties: {} },\n  },\n`;
    if (!s.includes(marker)) throw new Error('V62 declaration insertion marker missing');
    s = s.replace(marker, declaration + marker);
  }

  return s;
});

patch('lib/ainubo-x1-base.ts', (source) => {
  let s = source;

  if (!s.includes('"響馨行旅"')) {
    const taipeiBlock = `  if (\n    [\n      "taipei",\n      "台北",\n      "忠孝復興",\n      "忠孝復興站",\n      "台北忠孝復興",\n    ].includes(key)\n  ) {\n    return "taipei";\n  }\n`;
    const tainanBlock = `${taipeiBlock}\n  if (\n    [\n      "tainan",\n      "台南",\n      "台南中西區",\n      "康樂街",\n      "響馨",\n      "響馨行旅",\n      "resona",\n      "resonahotel",\n    ].includes(key)\n  ) {\n    return "tainan";\n  }\n`;
    if (!s.includes(taipeiBlock)) throw new Error('V62 tainan normalize marker missing');
    s = s.replace(taipeiBlock, tainanBlock);
  }

  if (!s.includes('if (zone === "tainan")')) {
    const marker = `  if (zone === "taipei") {\n    return (\n      zoneId.includes(\n        "taipei",\n      ) ||\n      zoneId.includes(\n        "zhongxiao",\n      )\n    );\n  }\n`;
    const replacement = `${marker}\n  if (zone === "tainan") {\n    return (\n      zoneId.includes("tainan") ||\n      zoneId.includes("resona") ||\n      zoneId.includes("kangle")\n    );\n  }\n`;
    if (!s.includes(marker)) throw new Error('V62 tainan matcher marker missing');
    s = s.replace(marker, replacement);
  }

  return s;
});

console.log('Applied V62 real AinuboX1 hotel monitor bridge');
