import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const html = `<!doctype html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1,viewport-fit=cover"
  >
  <title>NUBO 手機修復</title>
  <style>
    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      min-height: 100%;
      background: #080b12;
      color: #ffffff;
      font-family: system-ui, -apple-system, sans-serif;
    }

    body {
      padding: 32px 18px;
    }

    main {
      width: min(620px, 100%);
      margin: 0 auto;
    }

    h1 {
      margin: 0 0 16px;
      font-size: 30px;
    }

    p {
      color: #b6c0d2;
      line-height: 1.7;
    }

    #status {
      margin: 24px 0;
      padding: 18px;
      min-height: 130px;
      border: 1px solid #39445a;
      border-radius: 16px;
      background: #111824;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.6;
    }

    button {
      width: 100%;
      min-height: 54px;
      border: 0;
      border-radius: 16px;
      background: #f4a35b;
      color: #111111;
      font-size: 18px;
      font-weight: 800;
    }

    button:disabled {
      opacity: 0.45;
    }
  </style>
</head>
<body>
  <main>
    <h1>NUBO 手機修復</h1>
    <p>
      正在解除舊 Service Worker，並清除舊版 JavaScript 快取。
      不會刪除 Cloudflare 登入 Cookie。
    </p>

    <div id="status">修復程序啟動中……</div>

    <button id="go" disabled>
      重新開啟 NUBO
    </button>
  </main>

  <script>
    const statusBox = document.getElementById("status");
    const goButton = document.getElementById("go");

    async function repair() {
      try {
        let registrationCount = 0;
        let cacheCount = 0;

        if ("serviceWorker" in navigator) {
          const registrations =
            await navigator.serviceWorker.getRegistrations();

          registrationCount = registrations.length;

          await Promise.all(
            registrations.map((registration) =>
              registration.unregister()
            )
          );
        }

        if ("caches" in window) {
          const names = await caches.keys();
          cacheCount = names.length;

          await Promise.all(
            names.map((name) => caches.delete(name))
          );
        }

        localStorage.clear();
        sessionStorage.clear();

        statusBox.textContent =
          "修復完成。\\n\\n" +
          "已解除 Service Worker：" + registrationCount + " 個\\n" +
          "已刪除快取：" + cacheCount + " 組\\n\\n" +
          "請按下方按鈕重新開啟 NUBO。";

        goButton.disabled = false;
      } catch (error) {
        statusBox.textContent =
          "修復失敗：\\n" +
          (error instanceof Error ? error.message : String(error));
      }
    }

    goButton.addEventListener("click", () => {
      location.replace("/?fresh=" + Date.now());
    });

    void repair();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Clear-Site-Data": '"cache", "storage"',
    },
  });
}
