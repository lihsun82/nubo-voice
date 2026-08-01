from pathlib import Path
import re

wrapper = Path("lib/browser-nubo-tools-line.ts")
text = wrapper.read_text(encoding="utf-8")

base_import = 'import { runVoiceResearchWithTimeout } from "@/lib/nubo-voice-tool-guard";\n'
direct_import = '''import {
  forceDirectMobileOpen,
  resolveWebsiteMobileResult,
} from "@/lib/mobile-direct-app-v4";
'''

if direct_import not in text:
    if base_import not in text:
        raise SystemExit("base import marker not found")
    text = text.replace(base_import, base_import + direct_import, 1)

text, removed = re.subn(
    r'const NUBO_MOBILE_OPEN_FALLBACK_ID = "nubo-mobile-open-fallback";.*?(?=async function postSetting\()',
    "",
    text,
    count=1,
    flags=re.S,
)

old_execute = '''  if (
    call.name === "open_mobile_app" ||
    call.name === "open_youtube" ||
    call.name === "open_website"
  ) {
    return forceSameTabMobileOpen(await executeBaseTool(call), call.name);
  }
'''
new_execute = '''  if (call.name === "open_website") {
    return forceDirectMobileOpen(
      resolveWebsiteMobileResult(call),
      call.name,
    );
  }
  if (
    call.name === "open_mobile_app" ||
    call.name === "open_youtube"
  ) {
    return forceDirectMobileOpen(await executeBaseTool(call), call.name);
  }
'''

if old_execute in text:
    text = text.replace(old_execute, new_execute, 1)
elif new_execute not in text:
    raise SystemExit("mobile execute block not found")

text = text.replace(
    "NUBO_MOBILE_FAST_PROMPT_V3",
    "NUBO_MOBILE_DIRECT_APP_V4",
    1,
)
text = text.replace(
    "10. 音樂或影片用open_youtube；手機瀏覽器限制自動播放時，提供可點擊連結，不要宣稱Windows限制。",
    "10. 音樂或影片用open_youtube；手機端直接啟動YouTube App並帶入影片播放，不得要求使用者再點一次。App未安裝或系統拒絕時，自動降級官方網頁。",
    1,
)
text = text.replace(
    "- FB、IG、YouTube、Google Maps、Gmail、Google與LINE不是Windows工具；在手機上要用open_mobile_app或open_website開啟官方網頁/App Link。\n- 網站能開啟的是目前使用者手上的裝置；如果是手機，就在手機瀏覽器開。不要說「我會在Windows開啟」。\n- 手機是否跳轉到App由iOS/Android決定；NUBO只負責開啟安全網址或官方App Link。",
    "- FB、IG、YouTube與LINE在手機上優先直接啟動已安裝App，不顯示要求再次點擊的中介按鈕。\n- App未安裝、URL Scheme被封鎖或作業系統不允許時，自動降級到官方網頁，不要求使用者再操作。\n- 網站能開啟的是目前使用者手上的裝置；如果是手機，就在手機瀏覽器開。不要說「我會在Windows開啟」。",
    1,
)
text = text.replace(
    '"手機/平板優先工具：開啟LINE、YouTube、YouTube Music、Facebook、Instagram、Google Maps、Gmail、Google、NUBO計算機、電話、簡訊或Email。使用者在手機要求開FB、IG、YouTube或LINE時必須使用此工具；不得改用Windows工具。"',
    '"手機/平板優先工具：直接啟動LINE、YouTube、YouTube Music、Facebook、Instagram、Google Maps、Gmail、Google、NUBO計算機、電話、簡訊或Email。FB、IG、YouTube、LINE優先開啟已安裝App，不顯示二次點擊按鈕；未安裝才自動降級官方網頁。"',
    1,
)

youtube_block = '''    if (declaration.name === "open_youtube") {
      return {
        ...declaration,
        description:
          "搜尋歌曲或影片後，手機直接啟動YouTube App並帶入該影片播放，不要求使用者再點擊；未安裝App時自動降級官方YouTube網頁。",
      };
    }
'''
website_marker = '    if (declaration.name === "open_website") {'
if youtube_block not in text:
    if website_marker not in text:
        raise SystemExit("website declaration marker not found")
    text = text.replace(website_marker, youtube_block + website_marker, 1)

text = text.replace(
    '"在目前使用者裝置開啟HTTP/HTTPS網站、Facebook、Instagram、Google、Gmail、NUBO、網址或搜尋關鍵字。手機會在手機瀏覽器或App Link開啟；不得回答只能在Windows使用。"',
    '"在目前使用者裝置開啟HTTP/HTTPS網站、Facebook、Instagram、Google、Gmail、NUBO、網址或搜尋關鍵字。手機上的Facebook與Instagram會優先直接啟動App，未安裝才自動降級官方網頁。"',
    1,
)

wrapper.write_text(text, encoding="utf-8")

page = Path("app/page.tsx")
page_text = page.read_text(encoding="utf-8")
page_text = page_text.replace(
    "<span>v0.5.1 Mobile Open Fix 2026-08-01 16:48</span>",
    "<span>v0.5.1 Mobile Direct App V4 2026-08-02</span>",
    1,
)
page_text = page_text.replace(
    "<span>應用程式採固定白名單；手機開頁含強制備援按鈕</span>",
    "<span>手機直接開啟App；未安裝時自動降級官方網頁</span>",
    1,
)
page.write_text(page_text, encoding="utf-8")

print(f"mobile direct app patch applied; removed_legacy_block={removed}")
