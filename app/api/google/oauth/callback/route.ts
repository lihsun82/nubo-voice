import { exchangeGoogleCode } from "@/lib/google-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function html(title: string, message: string, ok: boolean) {
  const safeTitle = title.replace(/[<>&"]/g, "");
  const safeMessage = message.replace(/[<>&"]/g, "");
  return new Response(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${safeTitle}</title></head><body style="font-family:system-ui;background:#0b0d12;color:#fff;padding:40px"><h1>${safeTitle}</h1><p>${safeMessage}</p><p>${ok ? "你可以關閉這個視窗並回到 NUBO。" : "請關閉視窗後重新操作。"}</p><script>if(window.opener){window.opener.postMessage({type:'nubo-gmail-oauth',ok:${ok}},location.origin);}</script></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return html("Gmail連接取消", oauthError, false);
  if (!code || !state) return html("Gmail連接失敗", "缺少OAuth授權資料", false);

  try {
    const result = await exchangeGoogleCode(code, state);
    return html("Gmail連接完成", result.email ?? "Google帳號已授權", true);
  } catch (error) {
    return html(
      "Gmail連接失敗",
      error instanceof Error ? error.message : "Google OAuth處理失敗",
      false,
    );
  }
}
