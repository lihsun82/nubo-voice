"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { NuboKioskOrb } from "@/components/NuboKioskOrb";
import { NuboPhoneAction } from "@/components/NuboPhoneAction";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const GUEST_SERVICE_URL = "https://nubosci.ainubohub.com/";
const FOOD_MAP_URL = "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("台中市北區錦新街18號附近美食");

const LANGUAGES = [
  ["zh", "繁體中文", "繁中"],
  ["en", "English", "EN"],
  ["ja", "日本語", "JA"],
  ["ko", "한국어", "KO"],
] as const;
type Language = (typeof LANGUAGES)[number][0];
type CallState = "idle" | "ringing" | "connecting" | "connected" | "error";

const COPY = {
  zh: {
    location: "台中錦新館", language: "介面語言", response: "AI 管家回覆", services: "快捷禮賓服務",
    greeting: "您好，我是您的智慧管家 NUBO。請問今天需要什麼服務？",
    phases: ["AI 管家待命中", "正在接通語音…", "正在聆聽您的語音…", "正在處理您的需求…", "AI 管家正在回覆…", "語音尚未連線"],
    ring: "正在撥號…", sleeping: "語音暫停收音，待喚醒",
    cards: [
      ["訂房／入住", "查詢訂房、住宿與休息"],
      ["備品與送物", "詢問毛巾、礦泉水與備品"],
      ["周邊景點與美食", "查看錦新館附近的店家"],
      ["客房設備", "詢問冷氣、照明或設備問題"],
      ["Wi-Fi 與設施", "查看連線及旅宿服務說明"],
      ["聯絡飯店", "官方 LINE 與電話"],
    ],
    hints: ["我要辦理入住", "請送兩瓶礦泉水", "附近有什麼美食？"],
    help: [
      "接通後，可以說「請送兩瓶礦泉水」或告訴 NUBO 您需要的備品。",
      "接通後，可以詢問客房設備的操作方式，或請飯店人員協助。",
      "Wi-Fi 連線資訊請查看房內指引。也可以詢問 NUBO 館內設施。",
    ],
    controls: ["點我說話", "掛斷電話", "連線中"], close: "關閉", continue: "返回通話",
    contact: "飯店官方 LINE", qr: "掃描 QR Code 聯絡新寶智慧酒店官方 LINE",
  },
  en: {
    location: "Taichung Jinxin", language: "Interface language", response: "AI Assistant Response", services: "Quick Concierge Actions",
    greeting: "Hello, I’m NUBO, your smart hotel concierge. How may I help?",
    phases: ["AI concierge on standby", "Connecting…", "Listening to your voice…", "Working on your request…", "NUBO is responding…", "Voice disconnected"],
    ring: "Ringing…", sleeping: "Voice paused. Say the wake word to continue.",
    cards: [
      ["Booking / Check-in", "Find a reservation, stay or rest"],
      ["Guest Amenities", "Ask for towels, bottled water or supplies"],
      ["Nearby Food & Sights", "Explore places near the hotel"],
      ["Room Equipment", "Help with AC, lighting or other equipment"],
      ["Wi-Fi & Facilities", "Connection and hotel information"],
      ["Contact the Hotel", "Official LINE and phone number"],
    ],
    hints: ["I’d like to check in", "Can I have two bottles of water?", "What food is nearby?"],
    help: [
      "Start a call and tell NUBO which items you need, such as two bottles of water.",
      "Start a call to ask about room equipment or request help from hotel staff.",
      "See the in-room instructions for Wi-Fi, or ask NUBO about hotel facilities.",
    ],
    controls: ["Tap to talk", "End call", "Connecting"], close: "Close", continue: "Return to call",
    contact: "Official Hotel LINE", qr: "Scan to contact the hotel on LINE",
  },
  ja: {
    location: "台中錦新館", language: "表示言語", response: "AI コンシェルジュの回答", services: "クイックサービス",
    greeting: "こんにちは。スマートコンシェルジュの NUBO です。ご用件をお聞かせください。",
    phases: ["AI コンシェルジュ待機中", "接続中…", "お話を聞いています…", "確認中…", "NUBO が回答中…", "音声未接続"],
    ring: "呼び出し中…", sleeping: "音声待機中。呼びかけて再開できます。",
    cards: [
      ["予約・チェックイン", "ご予約・宿泊・休憩のご案内"],
      ["客室備品", "タオル・お水などのご依頼"],
      ["周辺観光・グルメ", "ホテル周辺のお店を探す"],
      ["客室設備", "空調・照明などの使い方"],
      ["Wi-Fi・施設案内", "接続方法と施設のご案内"],
      ["ホテルに連絡", "公式 LINE・電話番号"],
    ],
    hints: ["チェックインしたい", "お水を2本ください", "近くに飲食店はありますか？"],
    help: [
      "通話を開始し、お水2本など必要な備品を NUBO にお伝えください。",
      "客室設備の使い方や不具合について、NUBO にご相談ください。",
      "Wi-Fi の接続情報は客室内の案内をご覧ください。施設については NUBO にも質問できます。",
    ],
    controls: ["タップして話す", "通話を終了", "接続中"], close: "閉じる", continue: "通話に戻る",
    contact: "ホテル公式 LINE", qr: "QR コードを読み取ってホテルの LINE に連絡",
  },
  ko: {
    location: "타이중 진신관", language: "화면 언어", response: "AI 컨시어지 답변", services: "빠른 서비스",
    greeting: "안녕하세요. 스마트 호텔 컨시어지 NUBO입니다. 무엇을 도와드릴까요?",
    phases: ["AI 컨시어지 대기 중", "연결 중…", "듣고 있어요…", "요청을 확인 중…", "NUBO가 답변 중…", "음성 연결 끊김"],
    ring: "호출 중…", sleeping: "음성 대기 중입니다. 호출어로 다시 시작할 수 있어요.",
    cards: [
      ["예약 / 체크인", "예약 조회, 숙박 및 대실 안내"],
      ["객실 비품", "수건, 생수 등 비품 요청"],
      ["주변 맛집 및 명소", "호텔 근처 장소 검색"],
      ["객실 설비", "냉방, 조명 등 사용 문의"],
      ["Wi-Fi 및 시설", "연결 방법과 시설 안내"],
      ["호텔에 연락", "공식 LINE 및 전화번호"],
    ],
    hints: ["체크인하고 싶어요", "생수 두 병 주세요", "근처에 맛집이 있나요?"],
    help: [
      "음성 통화를 시작한 뒤 필요한 객실 비품을 NUBO에게 말씀해 주세요.",
      "객실 설비 사용법이나 직원의 도움이 필요하면 NUBO에게 물어보세요.",
      "Wi-Fi 연결 정보는 객실 안내를 확인하세요. 호텔 시설도 NUBO에게 문의할 수 있어요.",
    ],
    controls: ["눌러서 말하기", "통화 종료", "연결 중"], close: "닫기", continue: "통화로 돌아가기",
    contact: "호텔 공식 LINE", qr: "QR 코드를 스캔하여 LINE으로 호텔에 연락",
  },
} satisfies Record<Language, {
  location: string; language: string; response: string; services: string; greeting: string;
  phases: string[]; ring: string; sleeping: string; cards: Array<[string, string]>; hints: string[];
  help: string[]; controls: string[]; close: string; continue: string; contact: string; qr: string;
}>;

const PHASE_INDEX: Record<NuboVoicePhase, number> = {
  idle: 0, connecting: 1, listening: 2, thinking: 3, speaking: 4, error: 5,
};
const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", weekday: "short",
});

const ICONS = {
  hotel: "M4 21h16M6 21V5h12v16M10 21v-5h4v5M9 8h1m4 0h1m-6 4h1m4 0h1",
  key: "M15.5 3a5.5 5.5 0 0 0-5 7.8L3 18.3V21h3v-2h2v-2h2.5l3.2-3.2A5.5 5.5 0 1 0 15.5 3zM16 7h.01",
  robot: "M12 4v3m-2-3h4M5 10a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Zm-2 2h2m14 0h2m-12 0h.01m6 0h.01m-6 4h6",
  map: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15",
  sliders: "M6 3v4m0 4v10m6-18v10m0 4v4m6-18v6m0 4v8M3 7h6m0 10h6m0-8h6",
  wifi: "M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-4 4h.01",
  headset: "M3 13v-2a9 9 0 0 1 18 0v5a5 5 0 0 1-5 5h-4M3 13h4v5H5a2 2 0 0 1-2-2zm18 0h-4v5h2a2 2 0 0 0 2-2z",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2c5 5 5 15 0 20-5-5-5-15 0-20z",
  sparkle: "M12 2c0 6 4 10 10 10-6 0-10 4-10 10 0-6-4-10-10-10 6 0 10-4 10-10Z",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

type HelpIndex = 0 | 1 | 2;
type Props = {
  state: CallState;
  transcript?: string;
  sleeping?: boolean;
  onToggleCall: () => void;
  bookingUrl?: string;
  contact?: { visible: boolean; open: () => void; close: () => void };
  children?: ReactNode;
};

export function NuboConciergeKiosk({
  state, transcript, sleeping, onToggleCall, bookingUrl = GUEST_SERVICE_URL,
  contact, children,
}: Props) {
  const [language, setLanguage] = useState<Language>("zh");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [clock, setClock] = useState<Date | null>(null);
  const [voicePhase, setVoicePhase] = useState<NuboVoicePhase>("idle");
  const [help, setHelp] = useState<HelpIndex | null>(null);
  const [localContactAt, setLocalContactAt] = useState<number | null>(null);
  const copy = COPY[language];
  const phase = state === "connected" ? (
    sleeping ? "idle" : voicePhase === "speaking" || voicePhase === "thinking" ? voicePhase : "listening"
  ) : state === "ringing" || state === "connecting" ? "connecting" : state;
  const status = state === "ringing" ? copy.ring
    : sleeping && state === "connected" ? copy.sleeping : copy.phases[PHASE_INDEX[phase]];
  const busy = state === "ringing" || state === "connecting";
  const contactVisible = contact?.visible ?? localContactAt !== null;
  const openContact = contact?.open ?? (() => setLocalContactAt(performance.now()));
  const closeContact = contact?.close ?? (() => setLocalContactAt(null));

  useEffect(() => {
    const tick = () => setClock(new Date());
    const phaseChanged = (event: Event) => {
      const value = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail?.phase;
      if (value && value in PHASE_INDEX) setVoicePhase(value);
    };
    tick();
    const timer = window.setInterval(tick, 10_000);
    window.addEventListener("nubo-voice-phase", phaseChanged);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("nubo-voice-phase", phaseChanged);
    };
  }, []);

  useEffect(() => {
    if (localContactAt === null) return;
    const timer = window.setTimeout(() => setLocalContactAt(null), 60_000);
    return () => window.clearTimeout(timer);
  }, [localContactAt]);

  const card = (index: number, icon: keyof typeof ICONS) => (
    <>
      <span className="nubo-kiosk-tile-icon"><Icon name={icon} /></span>
      <span><strong>{copy.cards[index][0]}</strong><small>{copy.cards[index][1]}</small></span>
    </>
  );

  const languageLabel = LANGUAGES.find(([id]) => id === language)?.[2];

  return (
    <section className="console nubo-guest-console nubo-concierge" lang={language === "zh" ? "zh-Hant" : language}>
      <header className="nubo-kiosk-header">
        <div className="nubo-kiosk-brand">
          <span className="nubo-kiosk-brand-mark"><Icon name="hotel" /></span>
          <div><h1>AINUBO</h1><span>AI CONCIERGE</span></div>
        </div>
        <span className="nubo-kiosk-location">{copy.location}</span>
        <time className="nubo-kiosk-clock" dateTime={clock?.toISOString()}>
          <strong>{clock ? TIME.format(clock) : "--:--"}</strong>
          <small>{clock ? DATE.format(clock).toUpperCase() : "\u00a0"}</small>
        </time>
        <div className="nubo-kiosk-language">
          <button type="button" onClick={() => setLanguageOpen(!languageOpen)} aria-label={copy.language}
            aria-expanded={languageOpen} aria-controls="nubo-kiosk-language-options"
            onKeyDown={(event) => { if (event.key === "Escape") setLanguageOpen(false); }}>
            <Icon name="globe" />{languageLabel}<span aria-hidden="true">⌄</span>
          </button>
          {languageOpen && (
            <ul id="nubo-kiosk-language-options" aria-label={copy.language}
              onKeyDown={(event) => { if (event.key === "Escape") setLanguageOpen(false); }}>
              {LANGUAGES.map(([id, label, shortLabel]) => (
                <li key={id}><button type="button" lang={id === "zh" ? "zh-Hant" : id} aria-pressed={language === id}
                  onClick={() => { setLanguage(id); setLanguageOpen(false); }}>
                  {label}<small>{shortLabel}</small>
                </button></li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {contactVisible && (
        <aside className="nubo-kiosk-contact" aria-label={copy.contact}>
          <div><strong>{copy.contact}</strong>
            <button type="button" onClick={closeContact} aria-label={copy.close}>×</button>
          </div>
          <img src="/images/jinxin-official-line-qr.png" alt={copy.qr} width={492} height={492} />
          <a href="tel:+886422231157">04-2223-1157</a>
        </aside>
      )}

      <section className="nubo-kiosk-stage" data-phase={phase}>
        <div className="nubo-kiosk-status" role="status"><span aria-hidden="true" />{status}</div>
        <button type="button" className="nubo-kiosk-orb-action" onClick={onToggleCall} disabled={busy}
          aria-label={state === "connected" ? copy.controls[1] : copy.controls[0]}>
          <NuboKioskOrb phase={phase} />
        </button>
      </section>

      <section className="nubo-kiosk-response" aria-labelledby="nubo-kiosk-response-title">
        <h2 id="nubo-kiosk-response-title"><Icon name="sparkle" />{copy.response}</h2>
        <p className="voice-transcript">{transcript || (state === "idle" ? copy.greeting : status)}</p>
      </section>

      <nav aria-labelledby="nubo-kiosk-services-title" className="nubo-kiosk-services">
        <h2 id="nubo-kiosk-services-title">{copy.services}</h2>
        <div className="nubo-kiosk-grid">
          <a className="nubo-kiosk-tile" href={bookingUrl} target="_blank" rel="noopener noreferrer">{card(0, "key")}</a>
          <button className="nubo-kiosk-tile nubo-kiosk-cyan" type="button" onClick={() => setHelp(0)}>{card(1, "robot")}</button>
          <a className="nubo-kiosk-tile" href={FOOD_MAP_URL} target="_blank" rel="noopener noreferrer">{card(2, "map")}</a>
          <button className="nubo-kiosk-tile nubo-kiosk-cyan" type="button" onClick={() => setHelp(1)}>{card(3, "sliders")}</button>
          <button className="nubo-kiosk-tile" type="button" onClick={() => setHelp(2)}>{card(4, "wifi")}</button>
          <button className="nubo-kiosk-tile nubo-kiosk-green" type="button" onClick={openContact}>{card(5, "headset")}</button>
        </div>
      </nav>

      {children}

      <div className="nubo-kiosk-dock">
        <div className="nubo-kiosk-hints">
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer">{copy.hints[0]}</a>
          <button type="button" onClick={() => setHelp(0)}>{copy.hints[1]}</button>
          <a href={FOOD_MAP_URL} target="_blank" rel="noopener noreferrer">{copy.hints[2]}</a>
        </div>
        <NuboPhoneAction state={state} onClick={onToggleCall} kioskLabels={copy.controls} />
      </div>

      {help !== null && (
        <KioskHelp title={copy.cards[[1, 3, 4][help]][0]} message={copy.help[help]} close={copy.close}
          label={state === "connected" ? copy.continue : copy.controls[0]} busy={busy}
          onClose={() => setHelp(null)}
          onTalk={() => {
            setHelp(null);
            if (state !== "connected") onToggleCall();
          }} />
      )}
    </section>
  );
}

function KioskHelp({ title, message, close, label, busy, onClose, onTalk }: {
  title: string; message: string; close: string; label: string; busy: boolean;
  onClose: () => void; onTalk: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog className="nubo-kiosk-help" ref={dialogRef} aria-labelledby="nubo-kiosk-help-title" onClose={onClose}>
      <header><h2 id="nubo-kiosk-help-title">{title}</h2>
        <form method="dialog"><button aria-label={close}>×</button></form>
      </header>
      <p>{message}</p>
      <button className="nubo-kiosk-help-action" type="button" onClick={onTalk} disabled={busy}>{label}</button>
    </dialog>
  );
}
