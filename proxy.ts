import { NextResponse, type NextRequest } from "next/server";

function hostName(value: string | null) {
  return (value ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 只保護 LINE webhook，不攔截 NUBO 的其他頁面與 API。
  if (pathname !== "/api/line/webhook") {
    return NextResponse.next();
  }

  const configuredHost = hostName(process.env.LINE_PUBLIC_HOST ?? null);
  const requestHost = hostName(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );

  // LINE webhook 僅允許 POST；如有設定專用 host，也必須符合。
  if (request.method !== "POST") {
    return new NextResponse(null, { status: 404 });
  }

  if (configuredHost && requestHost !== configuredHost) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.next();
}

export const config = { matcher: "/:path*" };
