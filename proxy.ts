import { NextResponse, type NextRequest } from "next/server";

function hostName(value: string | null) {
  return (value ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

export function proxy(request: NextRequest) {
  const configuredHost = hostName(process.env.LINE_PUBLIC_HOST ?? null);
  const requestHost = hostName(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );

  // 此 Proxy 只會套用在 LINE webhook 路徑，不接觸任何其他 NUBO 頁面或 API。
  if (request.method !== "POST") {
    return new NextResponse(null, { status: 404 });
  }

  if (configuredHost && requestHost !== configuredHost) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/line/webhook",
};
