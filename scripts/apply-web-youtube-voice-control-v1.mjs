import fs from 'node:fs';

const COMPONENT_MARKER = 'NUBO_YOUTUBE_VOICE_CONTROL_V1';
const TOOL_MARKER = 'NUBO_YOUTUBE_CONTROL_TOOL_V1';

// 1) Wire voice/tool control events to the exact same playback functions used by UI buttons.
const componentPath = 'components/NuboInlineMusicPlayer.tsx';
let component = fs.readFileSync(componentPath, 'utf8');

if (!component.includes(COMPONENT_MARKER)) {
  const playEffect = `  useEffect(() => {\n    const onPlay = (event: Event) => {\n      const nextSong = readSongDetail(event);\n      if (!nextSong) return;\n      currentSongRef.current = nextSong;\n      desiredPlayingRef.current = true;\n      userPausedRef.current = false;\n      setSong(nextSong);\n    };\n\n    window.addEventListener(\"nubo-inline-music-play\", onPlay);\n    return () => window.removeEventListener(\"nubo-inline-music-play\", onPlay);\n  }, []);`;

  const controlEffect = `${playEffect}\n\n  // ${COMPONENT_MARKER}: NUBO voice/tool commands reuse the same player controls as the UI.\n  useEffect(() => {\n    const onControl = (event: Event) => {\n      const action = String(\n        (event as CustomEvent<{ action?: string }>).detail?.action ?? \"\",\n      ).toLowerCase();\n\n      if (action === \"pause\") {\n        pausePlayback();\n        return;\n      }\n      if (action === \"resume\" || action === \"play\") {\n        resumePlayback();\n        return;\n      }\n      if (action === \"stop\") {\n        stopPlayback();\n      }\n    };\n\n    window.addEventListener(\"nubo-inline-music-control\", onControl);\n    return () =>\n      window.removeEventListener(\"nubo-inline-music-control\", onControl);\n  }, []);`;

  if (!component.includes(playEffect)) {
    throw new Error('youtube voice control: play effect anchor missing');
  }
  component = component.replace(playEffect, controlEffect);
  fs.writeFileSync(componentPath, component);
}

// 2) Add a browser tool that dispatches pause/resume/stop to the active inline player.
const toolsPath = 'lib/browser-nubo-tools-line.ts';
let tools = fs.readFileSync(toolsPath, 'utf8');

if (!tools.includes(TOOL_MARKER)) {
  const helperAnchor = `async function sendGuestServiceAlert(args: Record<string, unknown>) {`;
  const helper = `// ${TOOL_MARKER}\nfunction controlYouTubePlayback(args: Record<string, unknown>) {\n  const actionRaw = String(args.action ?? \"\").trim().toLowerCase();\n  const action =\n    actionRaw === \"resume\" || actionRaw === \"play\"\n      ? \"resume\"\n      : actionRaw === \"stop\"\n        ? \"stop\"\n        : \"pause\";\n\n  const active =\n    typeof document !== \"undefined\" &&\n    document.body.classList.contains(\"nubo-inline-music-active\");\n\n  if (!active) {\n    return {\n      ok: false,\n      active: false,\n      action,\n      error: \"目前沒有NUBO內正在播放的YouTube影片\",\n    };\n  }\n\n  window.dispatchEvent(\n    new CustomEvent(\"nubo-inline-music-control\", { detail: { action } }),\n  );\n\n  return { ok: true, active: true, action };\n}\n\n${helperAnchor}`;

  if (!tools.includes(helperAnchor)) {
    throw new Error('youtube voice control: helper anchor missing');
  }
  tools = tools.replace(helperAnchor, helper);

  const executeAnchor = `export async function executeNuboBrowserTool(call: FunctionCall) {\n`;
  const executePatch = `${executeAnchor}  if (call.name === \"control_youtube\") {\n    return controlYouTubePlayback(call.args ?? {});\n  }\n\n`;
  if (!tools.includes(executeAnchor)) {
    throw new Error('youtube voice control: execute anchor missing');
  }
  tools = tools.replace(executeAnchor, executePatch);

  const instructionAnchor = `17. 音量與亮度用device_setting。已有專用工具時不得改用research_now或delegate_work。`;
  const instructionPatch = `${instructionAnchor}\n17.1 使用者在NUBO內播放YouTube期間說「暫停影片」「暫停音樂」「停一下」時，立即呼叫control_youtube(action=pause)；說「繼續播放」「繼續影片」「繼續音樂」時呼叫control_youtube(action=resume)；說「停止播放」「停止影片」「停止音樂」「關掉影片」時呼叫control_youtube(action=stop)。不得只口頭回答而不呼叫工具。`;
  if (!tools.includes(instructionAnchor)) {
    throw new Error('youtube voice control: system instruction anchor missing');
  }
  tools = tools.replace(instructionAnchor, instructionPatch);

  const mobileRule = `- 外部YouTube的暫停、下一首、關閉與進度由YouTube播放器控制，NUBO不得假裝已控制外部分頁或App。`;
  const mobilePatch = `${mobileRule}\n- 但只要是NUBO頁面內目前顯示的YouTube播放器，暫停、繼續與停止必須使用control_youtube直接控制；工具回傳active=false時才告知目前沒有可控制的NUBO內播放器。`;
  if (!tools.includes(mobileRule)) {
    throw new Error('youtube voice control: mobile rule anchor missing');
  }
  tools = tools.replace(mobileRule, mobilePatch);

  const declarationsEnd = `  {\n    name: \"delegated_work_status\",`;
  const controlDeclaration = `  {\n    name: \"control_youtube\",\n    description:\n      \"控制NUBO頁面內目前正在播放的YouTube影片。使用者要求暫停、繼續或停止目前影片/音樂時使用。不得用於控制外部YouTube App或其他分頁。\",\n    parameters: {\n      type: \"OBJECT\",\n      properties: {\n        action: {\n          type: \"STRING\",\n          enum: [\"pause\", \"resume\", \"stop\"],\n          description: \"pause=暫停；resume=繼續播放；stop=停止並收起播放器。\",\n        },\n      },\n      required: [\"action\"],\n    },\n  },\n${declarationsEnd}`;

  if (!tools.includes(declarationsEnd)) {
    throw new Error('youtube voice control: declarations anchor missing');
  }
  tools = tools.replace(declarationsEnd, controlDeclaration);

  fs.writeFileSync(toolsPath, tools);
}

for (const [path, token] of [
  [componentPath, COMPONENT_MARKER],
  [toolsPath, TOOL_MARKER],
  [toolsPath, 'name: \"control_youtube\"'],
  [toolsPath, 'nubo-inline-music-control'],
]) {
  const text = fs.readFileSync(path, 'utf8');
  if (!text.includes(token)) throw new Error(`youtube voice control missing ${token}`);
}

console.log('Applied NUBO YouTube voice pause/resume/stop controls');
