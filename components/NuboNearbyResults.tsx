"use client";

import { useEffect, useState } from "react";
import { useNuboKioskLanguage } from "@/lib/nubo-kiosk-language";

const COPY = {
  zh: { places: "店家", location: "目前位置", heading: (query: string, location: string) => `${location}附近的${query}`, distance: (meters: number) => `約 ${meters} 公尺` },
  en: { places: "Places", location: "your location", heading: (query: string, location: string) => `${query} near ${location}`, distance: (meters: number) => `About ${meters} m` },
  ja: { places: "お店", location: "現在地", heading: (query: string, location: string) => `${location}周辺の${query}`, distance: (meters: number) => `約 ${meters} m` },
  ko: { places: "매장", location: "현재 위치", heading: (query: string, location: string) => `${location} 주변 ${query}`, distance: (meters: number) => `약 ${meters} m` },
  vi: { places: "Địa điểm", location: "vị trí hiện tại", heading: (query: string, location: string) => `${query} gần ${location}`, distance: (meters: number) => `Khoảng ${meters} m` },
};

type NearbyPlace = {
  name: string;
  address?: string;
  distanceMeters?: number;
};

type NearbyResult = {
  query: string;
  location: string;
  results: NearbyPlace[];
};

export function NuboNearbyResults() {
  const [search, setSearch] = useState<NearbyResult | null>(null);
  const { language } = useNuboKioskLanguage();
  const copy = COPY[language];

  useEffect(() => {
    let clearTimer: number | null = null;
    const onResults = (event: Event) => {
      const detail = (event as CustomEvent<NearbyResult>).detail;
      if (!detail || !Array.isArray(detail.results)) return;
      const results = detail.results
        .filter((place) => place && typeof place.name === "string" && place.name.trim())
        .slice(0, 8);
      setSearch({
        query: String(detail.query || ""),
        location: String(detail.location || ""),
        results,
      });
      if (clearTimer !== null) window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => setSearch(null), 120_000);
    };
    window.addEventListener("nubo:nearby-results", onResults);
    return () => {
      window.removeEventListener("nubo:nearby-results", onResults);
      if (clearTimer !== null) window.clearTimeout(clearTimer);
    };
  }, []);

  if (!search?.results.length) return null;

  return (
    <section className="nubo-nearby-results" aria-live="polite">
      <h2>{copy.heading(search.query || copy.places, search.location || copy.location)}</h2>
      <ol>
        {search.results.map((place, index) => (
          <li key={`${place.name}-${index}`}>
            <strong>{place.name}</strong>
            <span>
              {typeof place.distanceMeters === "number" && Number.isFinite(place.distanceMeters)
                ? copy.distance(Math.round(place.distanceMeters))
                : ""}
              {place.address ? ` · ${place.address}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
