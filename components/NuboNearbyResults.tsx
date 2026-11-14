"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    let clearTimer: number | null = null;
    const onResults = (event: Event) => {
      const detail = (event as CustomEvent<NearbyResult>).detail;
      if (!detail || !Array.isArray(detail.results)) return;
      const results = detail.results
        .filter((place) => place && typeof place.name === "string" && place.name.trim())
        .slice(0, 8);
      setSearch({
        query: String(detail.query || "附近店家"),
        location: String(detail.location || "目前位置"),
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
      <h2>{search.location}附近的{search.query}</h2>
      <ol>
        {search.results.map((place, index) => (
          <li key={`${place.name}-${index}`}>
            <strong>{place.name}</strong>
            <span>
              {typeof place.distanceMeters === "number" && Number.isFinite(place.distanceMeters)
                ? `約 ${Math.round(place.distanceMeters)} 公尺`
                : ""}
              {place.address ? ` · ${place.address}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
