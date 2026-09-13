import { NextResponse, type NextRequest } from "next/server";

function hostName(value: string | null) {
  return (value ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

export function proxy(request: NextRequest) {
  /*
   * AinuboX1旅館行情Agent API必須在所有主機上可用。
   * 此放行規則不變更LINE webhook、驗證或指令解析。
   */
  if (
    request.nextUrl.pathname.startsWith(
      "/api/hotel-radar/",
    )
  ) {
    return NextResponse.next();
  }

  const configuredHost = hostName(process.env.LINE_PUBLIC_HOST ?? null);
  if (!configuredHost) return NextResponse.next();

  const requestHost = hostName(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
  if (requestHost !== configuredHost) return NextResponse.next();

  if (
    request.nextUrl.pathname === "/api/line/webhook" &&
    request.method === "POST"
  ) {
    return NextResponse.next();
  }

  return new NextResponse(null, { status: 404 });
}

export const config = { matcher: "/:path*" };
