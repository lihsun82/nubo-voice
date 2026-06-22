import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const schema = z.object({
  action: z.enum(["set", "increase", "decrease", "status"]),
  value: z.number().min(0).max(100).optional().default(10),
});

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function getBrightness() {
  const command = [
    "$item = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1;",
    "if (-not $item) { throw 'This display does not expose Windows brightness control.' };",
    "Write-Output ([int]$item.CurrentBrightness)",
  ].join(" ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true, timeout: 10000 },
  );
  const value = Number(stdout.trim());
  if (!Number.isFinite(value)) throw new Error("無法讀取螢幕亮度");
  return clamp(value);
}

async function setBrightness(value: number) {
  const target = clamp(value);
  const command = [
    `$target = [byte]${target};`,
    "$methods = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods;",
    "if (-not $methods) { throw 'This display does not expose Windows brightness control.' };",
    "$methods | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = $target } | Out-Null };",
    "Write-Output ([int]$target)",
  ].join(" ");
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true, timeout: 10000 },
  );
  return target;
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "亮度參數不正確" }, { status: 400 });
  }

  if (process.platform !== "win32") {
    return NextResponse.json({ error: "亮度調整目前只支援Windows" }, { status: 400 });
  }

  try {
    const { action, value } = parsed.data;
    const current = await getBrightness();
    const brightness =
      action === "status"
        ? current
        : await setBrightness(
            action === "set"
              ? value
              : action === "increase"
                ? current + value
                : current - value,
          );

    return NextResponse.json({ ok: true, brightness });
  } catch (error) {
    const message = error instanceof Error ? error.message : "亮度調整失敗";
    return NextResponse.json(
      {
        error:
          message.includes("does not expose")
            ? "這台螢幕不支援Windows內建亮度控制；外接螢幕通常需使用螢幕按鍵或DDC/CI工具。"
            : message,
      },
      { status: 500 },
    );
  }
}
