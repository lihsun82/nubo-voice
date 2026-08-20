import fs from 'node:fs';

const voicePath = 'components/GeminiVoiceConsole.tsx';
let voice = fs.readFileSync(voicePath, 'utf8');

if (!voice.includes('NUBO_COMPLETE_UTTERANCE_V1')) {
  const anchor = `              inputAudioTranscription: {},\n              outputAudioTranscription: {},`;
  const replacement = `              inputAudioTranscription: {},\n              // NUBO_COMPLETE_UTTERANCE_V1\n              // Tolerate natural Mandarin pauses before declaring end-of-turn.\n              realtimeInputConfig: {\n                automaticActivityDetection: {\n                  disabled: false,\n                  startOfSpeechSensitivity: \"START_SENSITIVITY_HIGH\",\n                  endOfSpeechSensitivity: \"END_SENSITIVITY_LOW\",\n                  prefixPaddingMs: 150,\n                  silenceDurationMs: 1300,\n                },\n              },\n              outputAudioTranscription: {},`;

  if (!voice.includes(anchor)) {
    throw new Error('voice turn patch: Gemini setup anchor missing');
  }
  voice = voice.replace(anchor, replacement);
  fs.writeFileSync(voicePath, voice);
}

const toolsPath = 'lib/browser-nubo-tools-line.ts';
let tools = fs.readFileSync(toolsPath, 'utf8');

if (!tools.includes('NUBO_COMPLETE_GUEST_INTAKE_V1')) {
  const anchor = '快速路由：';
  const rule = `NUBO_COMPLETE_GUEST_INTAKE_V1：客訴／抱怨／客務建檔時，必須讓使用者把整段話說完並完成一個語音回合後，才可判斷資料是否完整。姓氏、房號、聯絡方式、實質客訴／需求內容四項缺一不可；「尚未提供客訴內容」「未提供」「待補」「不知道」「無」等佔位文字一律視為缺少客訴內容，禁止呼叫guest_service_alert。使用者仍在說話或句子尚未完成時，不得寄送郵件。\\n\\n`;
  if (!tools.includes(anchor)) {
    throw new Error('voice turn patch: system instruction anchor missing');
  }
  tools = tools.replace(anchor, rule + anchor);
  fs.writeFileSync(toolsPath, tools);
}

console.log('Applied complete-utterance VAD + guest intake guard');
