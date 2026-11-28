"use client";

import { tryNativeAndroidLaunch } from "../lib/mobile-direct-app-v4";
import type { MouseEvent } from "react";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NuboKioskOrb } from "@/components/NuboKioskOrb";
import { NuboPhoneAction } from "@/components/NuboPhoneAction";
import { NuboRoomPhotoGallery } from "@/components/NuboRoomPhotoGallery";
import {
  NUBO_KIOSK_LANGUAGES,
  NUBO_KIOSK_LOCALES,
  resetNuboKioskLanguage,
  selectNuboKioskLanguage,
  useNuboKioskLanguage,
  type NuboKioskLanguage,
} from "@/lib/nubo-kiosk-language";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const GUEST_SERVICE_URL = "https://nubosci.ainubohub.com/";
const FOOD_MAP_URL = "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("台中市北區錦新街18號附近美食");
const GUEST_WIFI = { network: "NUBO-Hotels🌞", password: "0422231157" };

type CallState = "idle" | "ringing" | "connecting" | "connected" | "error";

const COPY = {
  zh: {
    location: "台中錦新館", language: "介面語言", response: "AI 管家回覆", services: "快捷禮賓服務",
    brandRole: "AI 智慧禮賓", title: "AINUBO 新寶智慧酒店",
    auto: "自動跟隨語音", error: "NUBO 暫時無法處理，請再試一次或聯絡飯店。",
    greeting: "您好，我是您的智慧管家 NUBO。請問今天需要什麼服務？",
    phases: ["AI 管家待命中", "正在接通語音…", "正在聆聽您的語音…", "正在處理您的需求…", "AI 管家正在回覆…", "語音尚未連線"],
    ring: "正在撥號…", sleeping: "語音暫停收音，待喚醒",
    cards: [
      ["訂房／入住", "查詢訂房、住宿與休息"],
      ["LINE QR Code", "掃碼加入飯店官方 LINE"],
      ["周邊景點與美食", "查看錦新館附近的店家"],
      ["客房照片", "依樓層瀏覽客房"],
      ["聯絡飯店", "官方 LINE 與電話"],
    ],
    wifi: { title: "Wi-Fi 密碼", network: "帳號", password: "密碼" },
    hints: ["我要辦理入住", "附近有什麼美食？"],
    controls: ["點我說話", "掛斷電話", "連線中"], close: "關閉",
    contact: "飯店官方 LINE", qr: "掃描 QR Code 聯絡新寶智慧酒店官方 LINE",
  },
  en: {
    location: "Taichung Jinxin", language: "Interface language", response: "AI Assistant Response", services: "Quick Concierge Actions",
    brandRole: "AI CONCIERGE", title: "AINUBO Hotel AI Concierge",
    auto: "Follow spoken language", error: "NUBO couldn’t complete the request. Please try again or contact the hotel.",
    greeting: "Hello, I’m NUBO, your smart hotel concierge. How may I help?",
    phases: ["AI concierge on standby", "Connecting…", "Listening to your voice…", "Working on your request…", "NUBO is responding…", "Voice disconnected"],
    ring: "Ringing…", sleeping: "Voice paused. Say the wake word to continue.",
    cards: [
      ["Booking / Check-in", "Find a reservation, stay or rest"],
      ["LINE QR Code", "Scan to add the hotel on LINE"],
      ["Nearby Food & Sights", "Explore places near the hotel"],
      ["Room Photos", "Explore guest rooms by floor"],
      ["Contact the Hotel", "Official LINE and phone number"],
    ],
    wifi: { title: "Wi-Fi Password", network: "Network", password: "Password" },
    hints: ["I’d like to check in", "Nearby food?"],
    controls: ["Tap to talk", "End call", "Connecting"], close: "Close",
    contact: "Official Hotel LINE", qr: "Scan to contact the hotel on LINE",
  },
  ja: {
    location: "台中錦新館", language: "表示言語", response: "AI コンシェルジュの回答", services: "クイックサービス",
    brandRole: "AI コンシェルジュ", title: "AINUBO ホテルの AI コンシェルジュ",
    auto: "会話の言語に合わせる", error: "ただいま対応できません。もう一度お試しいただくか、ホテルへお問い合わせください。",
    greeting: "こんにちは。スマートコンシェルジュの NUBO です。ご用件をお聞かせください。",
    phases: ["AI コンシェルジュ待機中", "接続中…", "お話を聞いています…", "確認中…", "NUBO が回答中…", "音声未接続"],
    ring: "呼び出し中…", sleeping: "音声待機中。呼びかけて再開できます。",
    cards: [
      ["予約・チェックイン", "予約・宿泊・休憩の案内"],
      ["LINE QRコード", "公式 LINE を追加"],
      ["周辺観光・グルメ", "ホテル周辺のお店を探す"],
      ["客室の写真", "フロア別に客室を見る"],
      ["ホテルに連絡", "公式 LINE・電話番号"],
    ],
    wifi: { title: "Wi-Fi パスワード", network: "SSID", password: "パスワード" },
    hints: ["チェックインしたい", "近くの飲食店は？"],
    controls: ["タップして話す", "通話を終了", "接続中"], close: "閉じる",
    contact: "ホテル公式 LINE", qr: "QR コードを読み取ってホテルの LINE に連絡",
  },
  ko: {
    location: "타이중 진신관", language: "화면 언어", response: "AI 컨시어지 답변", services: "빠른 서비스",
    brandRole: "AI 컨시어지", title: "AINUBO 호텔 AI 컨시어지",
    auto: "대화 언어에 맞추기", error: "요청을 처리하지 못했습니다. 다시 시도하거나 호텔에 문의해 주세요.",
    greeting: "안녕하세요. 스마트 호텔 컨시어지 NUBO입니다. 무엇을 도와드릴까요?",
    phases: ["AI 컨시어지 대기 중", "연결 중…", "듣고 있어요…", "요청을 확인 중…", "NUBO가 답변 중…", "음성 연결 끊김"],
    ring: "호출 중…", sleeping: "음성 대기 중입니다. 호출어로 다시 시작할 수 있어요.",
    cards: [
      ["예약 / 체크인", "예약 조회, 숙박 및 대실 안내"],
      ["LINE QR 코드", "호텔 공식 LINE 친구 추가"],
      ["주변 맛집 및 명소", "호텔 근처 장소 검색"],
      ["객실 사진", "층별 객실 사진 보기"],
      ["호텔에 연락", "공식 LINE 및 전화번호"],
    ],
    wifi: { title: "Wi-Fi 비밀번호", network: "SSID", password: "비밀번호" },
    hints: ["체크인하고 싶어요", "근처에 맛집이 있나요?"],
    controls: ["눌러서 말하기", "통화 종료", "연결 중"], close: "닫기",
    contact: "호텔 공식 LINE", qr: "QR 코드를 스캔하여 LINE으로 호텔에 연락",
  },
  vi: {
    location: "Taichung Jinxin", language: "Ngôn ngữ giao diện", response: "NUBO trả lời", services: "Dịch vụ nhanh",
    brandRole: "LỄ TÂN AI", title: "Lễ tân AI của khách sạn AINUBO",
    auto: "Theo ngôn ngữ đang nói", error: "NUBO chưa xử lý được yêu cầu. Vui lòng thử lại hoặc liên hệ khách sạn.",
    greeting: "Xin chào, tôi là NUBO, trợ lý lễ tân của quý khách. Tôi có thể giúp gì cho quý khách?",
    phases: ["NUBO sẵn sàng", "Đang kết nối…", "Đang lắng nghe…", "Đang xử lý yêu cầu…", "NUBO đang trả lời…", "Đã ngắt kết nối"],
    ring: "Đang gọi…", sleeping: "Đã tạm dừng nghe. Hãy nói từ đánh thức để tiếp tục.",
    cards: [
      ["Đặt phòng / Nhận phòng", "Tra cứu đặt phòng, lưu trú và nghỉ theo giờ"],
      ["Mã QR LINE", "Quét mã để thêm LINE của khách sạn"],
      ["Ăn uống và tham quan", "Khám phá các địa điểm gần khách sạn"],
      ["Ảnh phòng", "Xem ảnh phòng theo tầng"],
      ["Liên hệ khách sạn", "LINE và số điện thoại của khách sạn"],
    ],
    wifi: { title: "Mật khẩu Wi-Fi", network: "Tên mạng", password: "Mật khẩu" },
    hints: ["Tôi muốn nhận phòng", "Gần đây có món gì ngon?"],
    controls: ["Nhấn để nói", "Kết thúc", "Đang kết nối"], close: "Đóng",
    contact: "LINE của khách sạn", qr: "Quét mã QR để liên hệ khách sạn qua LINE",
  },
} satisfies Record<NuboKioskLanguage, {
  location: string; language: string; response: string; services: string; greeting: string;
  brandRole: string; title: string;
  auto: string; error: string;
  phases: string[]; ring: string; sleeping: string; cards: Array<[string, string]>; hints: [string, string];
  wifi: { title: string; network: string; password: string };
  controls: string[]; close: string; contact: string; qr: string;
}>;

const PHASE_INDEX: Record<NuboVoicePhase, number> = {
  idle: 0, connecting: 1, listening: 2, thinking: 3, speaking: 4, error: 5,
};
const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const ICONS = {
  hotel: "M4 21h16M6 21V5h12v16M10 21v-5h4v5M9 8h1m4 0h1m-6 4h1m4 0h1",
  key: "M15.5 3a5.5 5.5 0 0 0-5 7.8L3 18.3V21h3v-2h2v-2h2.5l3.2-3.2A5.5 5.5 0 1 0 15.5 3zM16 7h.01",
  qr: "M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15v3h3v3m3-6v3m-6 3h.01M12 12h.01",
  map: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15",
  camera: "M4 7h4l2-3h4l2 3h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  wifi: "M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-4 4h.01",
  headset: "M3 13v-2a9 9 0 0 1 18 0v5a5 5 0 0 1-5 5h-4M3 13h4v5H5a2 2 0 0 1-2-2zm18 0h-4v5h2a2 2 0 0 0 2-2z",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2c5 5 5 15 0 20-5-5-5-15 0-20z",
  sparkle: "M12 2c0 6 4 10 10 10-6 0-10 4-10 10 0-6-4-10-10-10 6 0 10-4 10-10Z",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

type Props = {
  state: CallState;
  transcript?: string;
  error?: string;
  sleeping?: boolean;
  onToggleCall: (language: NuboKioskLanguage) => void;
  bookingUrl?: string;
  roomPhotoRequest?: number | null;
  contact?: { visible: boolean; open: () => void; close: () => void };
  children?: ReactNode;
};

export function NuboConciergeKiosk({
  state, transcript, error, sleeping, onToggleCall, bookingUrl = GUEST_SERVICE_URL,
  contact, roomPhotoRequest, children,
}: Props) {
  const { language, preference } = useNuboKioskLanguage();
  const openDuringCall = (event: MouseEvent<HTMLAnchorElement>) => {
    if (state !== "connected" && state !== "ringing" && state !== "connecting") return;
    if (tryNativeAndroidLaunch(event.currentTarget.href, "網站")) event.preventDefault();
  };
  const locale = NUBO_KIOSK_LOCALES[language];
  const date = useMemo(() => new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", weekday: "short",
  }), [locale]);
  const [languageOpen, setLanguageOpen] = useState(false);
  const wasConnected = useRef(false);
  const [clock, setClock] = useState<Date | null>(null);
  const [voicePhase, setVoicePhase] = useState<NuboVoicePhase>("idle");
  const [photosOpen, setPhotosOpen] = useState(false);
  const [localContactAt, setLocalContactAt] = useState<number | null>(null);
  const copy = COPY[language];
  useEffect(() => {
    if (roomPhotoRequest != null) setPhotosOpen(true);
  }, [roomPhotoRequest]);
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
    if (state === "connected") wasConnected.current = true;
    if (state === "idle" && wasConnected.current) {
      wasConnected.current = false;
      resetNuboKioskLanguage();
    }
  }, [state]);

  useEffect(() => {
    const root = document.documentElement;
    const previousLang = root.lang;
    const previousTitle = document.title;
    root.lang = locale;
    document.title = copy.title;
    return () => {
      root.lang = previousLang;
      document.title = previousTitle;
    };
  }, [locale, copy.title]);

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

  const languageLabel = NUBO_KIOSK_LANGUAGES.find(([id]) => id === language)?.[2];

  return (
    <section className="nubo-guest-console nubo-concierge" lang={locale}>
      <header className="nubo-kiosk-header">
        <div className="nubo-kiosk-brand">
          <span className="nubo-kiosk-brand-mark"><Icon name="hotel" /></span>
          <div><h1>AINUBO</h1><span>{copy.brandRole}</span></div>
        </div>
        <span className="nubo-kiosk-location">{copy.location}</span>
        <time className="nubo-kiosk-clock" dateTime={clock?.toISOString()}>
          <strong>{clock ? TIME.format(clock) : "--:--"}</strong>
          <small>{clock ? date.format(clock) : "\u00a0"}</small>
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
              <li><button type="button" aria-pressed={preference === "auto"}
                onClick={() => { selectNuboKioskLanguage("auto"); setLanguageOpen(false); }}>
                {copy.auto}
              </button></li>
              {NUBO_KIOSK_LANGUAGES.map(([id, label, shortLabel]) => (
                <li key={id}><button type="button" lang={NUBO_KIOSK_LOCALES[id]} aria-pressed={preference === id}
                  onClick={() => { selectNuboKioskLanguage(id); setLanguageOpen(false); }}>
                  {label}<small>{shortLabel}</small>
                </button></li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {contactVisible && (
        <aside id="nubo-kiosk-contact" className="nubo-kiosk-contact" aria-label={copy.contact}>
          <div><strong>{copy.contact}</strong>
            <button type="button" onClick={closeContact} aria-label={copy.close}>×</button>
          </div>
          <img src="/images/jinxin-official-line-qr.png" alt={copy.qr} width={492} height={492} />
          <a href="tel:+886422231157">04-2223-1157</a>
        </aside>
      )}

      <div className="nubo-kiosk-content">
        <div className="nubo-kiosk-call-panel">
          <section className="nubo-kiosk-stage" data-phase={phase}>
            <div className="nubo-kiosk-status" role="status"><span aria-hidden="true" />{status}</div>
            <button type="button" className="nubo-kiosk-orb-action" onClick={() => onToggleCall(language)} disabled={busy}
              aria-label={state === "connected" ? copy.controls[1] : copy.controls[0]}>
              <NuboKioskOrb phase={phase} />
            </button>
          </section>
          <div className="nubo-kiosk-dock">
            <a href={bookingUrl} onClick={openDuringCall} target="_blank" rel="noopener noreferrer">{copy.hints[0]}</a>
            <NuboPhoneAction state={state} onClick={() => onToggleCall(language)} kioskLabels={copy.controls} />
            <a href={FOOD_MAP_URL} onClick={openDuringCall} target="_blank" rel="noopener noreferrer">{copy.hints[1]}</a>
          </div>
        </div>

        <div className="nubo-kiosk-details">
          <section className="nubo-kiosk-response" aria-labelledby="nubo-kiosk-response-title">
            <h2 id="nubo-kiosk-response-title"><Icon name="sparkle" />{copy.response}</h2>
            <p className="voice-transcript">{transcript || (state === "idle" ? copy.greeting : status)}</p>
          </section>

          <nav aria-labelledby="nubo-kiosk-services-title" className="nubo-kiosk-services">
            <h2 id="nubo-kiosk-services-title">{copy.services}</h2>
            <div className="nubo-kiosk-grid">
              <a className="nubo-kiosk-tile" href={bookingUrl} onClick={openDuringCall} target="_blank" rel="noopener noreferrer">{card(0, "key")}</a>
              <button className="nubo-kiosk-tile nubo-kiosk-cyan" type="button" onClick={openContact}
                aria-expanded={contactVisible} aria-controls="nubo-kiosk-contact">{card(1, "qr")}</button>
              <a className="nubo-kiosk-tile" href={FOOD_MAP_URL} onClick={openDuringCall} target="_blank" rel="noopener noreferrer">{card(2, "map")}</a>
              <button className="nubo-kiosk-tile nubo-kiosk-cyan" type="button" aria-haspopup="dialog"
                onClick={() => setPhotosOpen(true)}>{card(3, "camera")}</button>
              <div className="nubo-kiosk-tile nubo-kiosk-wifi">
                <span className="nubo-kiosk-tile-icon"><Icon name="wifi" /></span>
                <span>
                  <strong>{copy.wifi.title}</strong>
                  <small>{copy.wifi.network} <bdi>{GUEST_WIFI.network}</bdi><br />
                    {copy.wifi.password} <bdi>{GUEST_WIFI.password}</bdi></small>
                </span>
              </div>
              <button className="nubo-kiosk-tile nubo-kiosk-green" type="button" onClick={openContact}>{card(4, "headset")}</button>
            </div>
          </nav>

          {children}
          {error ? <div className="error" role="alert">{language === "zh" ? error : copy.error}</div> : null}
        </div>
      </div>

      {photosOpen && (
        <NuboRoomPhotoGallery language={language} title={copy.cards[3][0]} close={copy.close}
          onClose={() => setPhotosOpen(false)} />
      )}
    </section>
  );
}
