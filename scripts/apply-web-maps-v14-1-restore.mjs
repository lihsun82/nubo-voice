import fs from 'node:fs';

const toolsPath = 'lib/browser-nubo-tools-line.ts';
let source = fs.readFileSync(toolsPath, 'utf8');

if (!source.includes('NUBO_MAPS_WEB_OVERLAY_V2_LIST')) {
  const helperAnchor = `function normalizeAppName(value: unknown) {`;
  const helpers = String.raw`// NUBO_MAPS_WEB_OVERLAY_V2_LIST
// Google Maps only: keep the NUBO page, microphone and realtime voice session
// alive while a full-screen Google Maps web layer is displayed above it.
// Restore a bottom-left scrollable place-result list without changing YouTube,
// Google Home, Gmail, wake-word, voice model, animation or any non-Maps tool.
const NUBO_MAP_WEB_APP_NAMES = new Set([
  "maps",
  "googlemaps",
  "地圖",
  "google地圖",
]);

const NUBO_MAP_OVERLAY_ID = "nubo-google-maps-web-overlay-v2";
const NUBO_MAP_FRAME_ID = "nubo-google-maps-web-frame-v2";
const NUBO_MAP_LIST_ID = "nubo-google-maps-result-list-v2";
const NUBO_MAP_LIST_BODY_ID = "nubo-google-maps-result-body-v2";
let nuboMapsSearchSerial = 0;

type NuboMapPlaceResult = {
  name?: string;
  category?: string;
  address?: string;
  lat?: number;
  lng?: number;
  distanceMeters?: number;
  mapsUrl?: string;
};

function isPureWebNuboRuntime() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  try {
    const bridge = (window as typeof window & {
      NuboNative?: { isNativeApp?: () => boolean };
    }).NuboNative;
    if (bridge?.isNativeApp?.() === true) return false;
  } catch {}
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "")
    || window.matchMedia("(pointer: coarse) and (max-width: 1100px)").matches;
}

function normalizeNuboMapApp(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function readBrowserPosition() {
  return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (value: { latitude: number; longitude: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    navigator.geolocation.getCurrentPosition(
      (position) => finish({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => finish(null),
      {
        enableHighAccuracy: false,
        timeout: 2500,
        maximumAge: 300000,
      },
    );
  });
}

function buildNuboMapsEmbedUrl(
  queryValue: unknown,
  locationValue?: unknown,
  position?: { latitude: number; longitude: number } | null,
) {
  const query = String(queryValue ?? "").trim();
  const location = String(locationValue ?? "").trim();
  let searchText = [query, location].filter(Boolean).join(" ").trim();

  if (query && !location && position) {
    searchText =
      query +
      " near " +
      position.latitude.toFixed(6) +
      "," +
      position.longitude.toFixed(6);
  }

  if (!searchText) {
    return "https://www.google.com/maps?output=embed";
  }

  return (
    "https://www.google.com/maps?q=" +
    encodeURIComponent(searchText) +
    "&output=embed"
  );
}

function buildNuboExactPlaceEmbedUrl(place: NuboMapPlaceResult) {
  const name = String(place.name ?? "").trim();
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  const coordinates =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? String(lat) + "," + String(lng)
      : "";
  const searchText = [name, coordinates].filter(Boolean).join(" ");
  return (
    "https://www.google.com/maps?q=" +
    encodeURIComponent(searchText) +
    "&output=embed"
  );
}

function formatNuboMapDistance(value: unknown) {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return Math.round(meters) + " 公尺";
  return (meters / 1000).toFixed(meters < 10000 ? 1 : 0) + " 公里";
}

function setNuboMapsListMessage(body: HTMLDivElement, message: string) {
  body.replaceChildren();
  const text = document.createElement("div");
  text.textContent = message;
  Object.assign(text.style, {
    padding: "13px 14px",
    color: "#5f6368",
    fontSize: "14px",
    lineHeight: "1.4",
  });
  body.appendChild(text);
}

function ensureNuboMapsOverlay() {
  if (typeof document === "undefined") return null;

  const existingOverlay = document.getElementById(
    NUBO_MAP_OVERLAY_ID,
  ) as HTMLDivElement | null;
  const existingFrame = document.getElementById(
    NUBO_MAP_FRAME_ID,
  ) as HTMLIFrameElement | null;
  const existingList = document.getElementById(
    NUBO_MAP_LIST_ID,
  ) as HTMLDivElement | null;
  const existingListBody = document.getElementById(
    NUBO_MAP_LIST_BODY_ID,
  ) as HTMLDivElement | null;

  if (existingOverlay && existingFrame && existingList && existingListBody) {
    existingOverlay.style.display = "block";
    return {
      overlay: existingOverlay,
      frame: existingFrame,
      list: existingList,
      listBody: existingListBody,
    };
  }

  existingOverlay?.remove();

  const overlay = document.createElement("div");
  overlay.id = NUBO_MAP_OVERLAY_ID;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    background: "#ffffff",
    margin: "0",
    padding: "0",
    overflow: "hidden",
  });

  const frame = document.createElement("iframe");
  frame.id = NUBO_MAP_FRAME_ID;
  frame.title = "Google Maps";
  frame.setAttribute("allow", "geolocation *; fullscreen *");
  frame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
  Object.assign(frame.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    border: "0",
    margin: "0",
    padding: "0",
    background: "#ffffff",
  });

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "返回 NUBO");
  closeButton.textContent = "‹";
  Object.assign(closeButton.style, {
    position: "absolute",
    top: "max(10px, env(safe-area-inset-top))",
    left: "12px",
    zIndex: "5",
    width: "44px",
    height: "44px",
    borderRadius: "22px",
    border: "1px solid rgba(0,0,0,.14)",
    background: "rgba(255,255,255,.94)",
    color: "#202124",
    fontSize: "34px",
    lineHeight: "38px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,.18)",
  });
  closeButton.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  const list = document.createElement("div");
  list.id = NUBO_MAP_LIST_ID;
  Object.assign(list.style, {
    position: "absolute",
    left: "12px",
    bottom: "max(12px, env(safe-area-inset-bottom))",
    zIndex: "4",
    width: "min(360px, calc(100vw - 24px))",
    maxHeight: "42vh",
    borderRadius: "16px",
    border: "1px solid rgba(0,0,0,.14)",
    background: "rgba(255,255,255,.96)",
    boxShadow: "0 4px 18px rgba(0,0,0,.22)",
    overflow: "hidden",
    color: "#202124",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  });

  const listHeader = document.createElement("div");
  Object.assign(listHeader.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    padding: "10px 12px 8px",
    borderBottom: "1px solid rgba(0,0,0,.09)",
    background: "rgba(255,255,255,.98)",
  });

  const listTitle = document.createElement("div");
  listTitle.textContent = "附近店家";
  Object.assign(listTitle.style, {
    fontSize: "15px",
    fontWeight: "700",
  });

  const collapseButton = document.createElement("button");
  collapseButton.type = "button";
  collapseButton.textContent = "收合";
  Object.assign(collapseButton.style, {
    border: "0",
    background: "transparent",
    color: "#1a73e8",
    fontSize: "13px",
    padding: "5px 6px",
  });

  const listBody = document.createElement("div");
  listBody.id = NUBO_MAP_LIST_BODY_ID;
  Object.assign(listBody.style, {
    maxHeight: "calc(42vh - 44px)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
  });

  let collapsed = false;
  collapseButton.addEventListener("click", () => {
    collapsed = !collapsed;
    listBody.style.display = collapsed ? "none" : "block";
    collapseButton.textContent = collapsed ? "展開" : "收合";
  });

  listHeader.appendChild(listTitle);
  listHeader.appendChild(collapseButton);
  list.appendChild(listHeader);
  list.appendChild(listBody);
  overlay.appendChild(frame);
  overlay.appendChild(closeButton);
  overlay.appendChild(list);
  document.body.appendChild(overlay);

  return { overlay, frame, list, listBody };
}

async function loadNuboMapsPlaceList(
  holder: {
    frame: HTMLIFrameElement;
    list: HTMLDivElement;
    listBody: HTMLDivElement;
  },
  query: string,
  location: string,
  position: { latitude: number; longitude: number } | null,
  serial: number,
) {
  if (!query) {
    holder.list.style.display = "none";
    return;
  }

  holder.list.style.display = "block";
  setNuboMapsListMessage(holder.listBody, "正在整理附近店家…");

  try {
    const response = await fetch("/api/places/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        location: location || undefined,
        latitude: !location && position ? position.latitude : undefined,
        longitude: !location && position ? position.longitude : undefined,
        limit: 10,
        radiusMeters: 2500,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      results?: NuboMapPlaceResult[];
    };

    if (serial !== nuboMapsSearchSerial) return;

    const results = Array.isArray(payload.results) ? payload.results : [];
    if (!response.ok || !payload.ok || results.length === 0) {
      setNuboMapsListMessage(
        holder.listBody,
        "地圖已開啟，店家列表暫時沒有可顯示的資料。",
      );
      return;
    }

    holder.listBody.replaceChildren();

    results.forEach((place, index) => {
      const button = document.createElement("button");
      button.type = "button";
      Object.assign(button.style, {
        display: "block",
        width: "100%",
        border: "0",
        borderBottom:
          index === results.length - 1 ? "0" : "1px solid rgba(0,0,0,.08)",
        background: "#ffffff",
        color: "#202124",
        textAlign: "left",
        padding: "11px 13px",
      });

      const name = document.createElement("div");
      name.textContent = String(place.name ?? "未命名店家");
      Object.assign(name.style, {
        fontSize: "15px",
        fontWeight: "700",
        lineHeight: "1.3",
      });

      const meta = document.createElement("div");
      const distance = formatNuboMapDistance(place.distanceMeters);
      const category = String(place.category ?? "").trim();
      meta.textContent = [distance, category].filter(Boolean).join(" · ");
      Object.assign(meta.style, {
        marginTop: "3px",
        color: "#5f6368",
        fontSize: "12px",
        lineHeight: "1.3",
      });

      const address = String(place.address ?? "").trim();
      button.appendChild(name);
      if (meta.textContent) button.appendChild(meta);
      if (address) {
        const addressText = document.createElement("div");
        addressText.textContent = address;
        Object.assign(addressText.style, {
          marginTop: "3px",
          color: "#5f6368",
          fontSize: "12px",
          lineHeight: "1.3",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        });
        button.appendChild(addressText);
      }

      button.addEventListener("click", () => {
        holder.frame.src = buildNuboExactPlaceEmbedUrl(place);
      });

      holder.listBody.appendChild(button);
    });
  } catch {
    if (serial !== nuboMapsSearchSerial) return;
    setNuboMapsListMessage(
      holder.listBody,
      "地圖已開啟，店家列表目前連線較慢，可稍後再搜尋一次。",
    );
  }
}

async function showNuboMapsWebOverlay(
  queryValue: unknown,
  locationValue?: unknown,
) {
  const holder = ensureNuboMapsOverlay();
  if (!holder) return null;

  const query = String(queryValue ?? "").trim();
  const location = String(locationValue ?? "").trim();
  const position = location ? null : await readBrowserPosition();
  const targetUrl = buildNuboMapsEmbedUrl(query, location, position);
  const serial = ++nuboMapsSearchSerial;

  holder.frame.src = targetUrl;
  holder.overlay.style.display = "block";
  void loadNuboMapsPlaceList(
    holder,
    query,
    location,
    position,
    serial,
  );

  try {
    window.localStorage.setItem("nubo_voice_auto_resume_v1", "true");
  } catch {}

  return {
    ok: true,
    opened: true,
    provider: "Google Maps",
    query,
    location: location || "目前位置",
    url: targetUrl,
    mode: "same-page-maps-web-overlay-with-list",
    mapsOverlay: true,
    mapsResultList: true,
    preserveNubo: true,
    nuboVoiceKeepAlive: true,
    autoOpen: false,
    supported: true,
    build: "maps-same-page-web-overlay-v2-list-20260820",
  };
}

async function tryNuboMapsWebOverlay(call: FunctionCall) {
  if (!isPureWebNuboRuntime()) return null;

  const args = call.args ?? {};

  if (call.name === "search_nearby") {
    const query = String(args.query ?? "").trim();
    if (!query) return null;
    return showNuboMapsWebOverlay(query, args.location);
  }

  if (call.name !== "open_mobile_app") return null;
  const app = normalizeNuboMapApp(args.app);
  if (!NUBO_MAP_WEB_APP_NAMES.has(app)) return null;

  return showNuboMapsWebOverlay(args.query, undefined);
}

`;

  if (!source.includes(helperAnchor)) {
    throw new Error('maps list overlay: helper anchor missing');
  }
  source = source.replace(helperAnchor, helpers + helperAnchor);

  const executeAnchor = `export async function executeNuboBrowserTool(call: FunctionCall) {`;
  const executePatch = `${executeAnchor}\n  const mapsWebOverlayResult = await tryNuboMapsWebOverlay(call);\n  if (mapsWebOverlayResult) return mapsWebOverlayResult;`;

  if (!source.includes(executeAnchor)) {
    throw new Error('maps list overlay: execute anchor missing');
  }
  source = source.replace(executeAnchor, executePatch);
}

fs.writeFileSync(toolsPath, source);
console.log('Applied Google Maps same-page overlay with bottom-left result list only');
