import { NextResponse, type NextRequest } from "next/server";

function hostName(value: string | null) {
  return (value ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

export function proxy(request: NextRequest) {
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
