import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getGooglePlacesApiKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

export async function GET(request: NextRequest) {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Google Places photo service is not configured" },
      { status: 404 },
    );
  }

  const name = String(request.nextUrl.searchParams.get("name") || "").trim();
  if (!/^places\/[^/]+\/photos\/[^/]+$/u.test(name)) {
    return NextResponse.json(
      { ok: false, error: "Invalid place photo name" },
      { status: 400 },
    );
  }

  const url = new URL(`https://places.googleapis.com/v1/${name}/media`);
  url.searchParams.set("maxWidthPx", "480");
  url.searchParams.set("skipHttpRedirect", "true");
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `Place photo ${response.status}` },
        { status: response.status },
      );
    }

    const payload = (await response.json()) as { photoUri?: string };
    const photoUri = String(payload.photoUri || "").trim();
    if (!/^https:\/\//i.test(photoUri)) {
      return NextResponse.json(
        { ok: false, error: "Place photo URL unavailable" },
        { status: 404 },
      );
    }

    const redirect = NextResponse.redirect(photoUri, 307);
    redirect.headers.set("Cache-Control", "private, no-store, max-age=0");
    return redirect;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Place photo failed",
      },
      { status: 502 },
    );
  }
}
