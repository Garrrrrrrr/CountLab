"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;

export interface CoordinateSelection {
  address: string;
  latitude: number;
  longitude: number;
  coordinate_quality: string;
  coordinate_source: string;
}

interface Candidate {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
}

export function AdminCoordinatePicker({
  latitude,
  longitude,
  searchContext,
  onSelect,
}: {
  latitude: number | null;
  longitude: number | null;
  searchContext: string;
  onSelect: (selection: CoordinateSelection) => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState("");
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const initialCoordinates = useRef({ latitude, longitude });
  const selectionRef = useRef(onSelect);
  selectionRef.current = onSelect;

  useEffect(() => {
    if (!key || !mapElement.current) return;
    let disposed = false;
    let map: import("maplibre-gl").Map | undefined;
    import("maplibre-gl").then((module) => {
      if (disposed || !mapElement.current) return;
      module.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.js");
      const instance = new module.Map({
        container: mapElement.current,
        style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`,
        center: initialCoordinates.current.longitude != null && initialCoordinates.current.latitude != null ? [initialCoordinates.current.longitude, initialCoordinates.current.latitude] : [-98.5, 39.8],
        zoom: initialCoordinates.current.longitude != null && initialCoordinates.current.latitude != null ? 14 : 3,
      });
      map = instance;
      mapRef.current = instance;
      instance.addControl(new module.NavigationControl(), "top-right");
      if (initialCoordinates.current.longitude != null && initialCoordinates.current.latitude != null) {
        const marker = new module.Marker({ draggable: true }).setLngLat([initialCoordinates.current.longitude, initialCoordinates.current.latitude]).addTo(instance);
        markerRef.current = marker;
        marker.on("dragend", () => {
          const position = marker.getLngLat();
          selectionRef.current({ address: "", latitude: position.lat, longitude: position.lng, coordinate_quality: "approximate", coordinate_source: "admin map pin" });
        });
      }
      instance.on("click", (event) => {
        selectionRef.current({
          address: "",
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
          coordinate_quality: "approximate",
          coordinate_source: "admin map pin",
        });
      });
    }).catch(() => setMessage("Map unavailable. You can enter coordinates manually."));
    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !key) return;
    if (longitude == null || latitude == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    import("maplibre-gl").then((module) => {
      if (!mapRef.current) return;
      markerRef.current?.remove();
      const marker = new module.Marker({ draggable: true })
        .setLngLat([longitude, latitude])
        .addTo(map);
      markerRef.current = marker;
      marker.on("dragend", () => {
        const position = markerRef.current?.getLngLat();
        if (position) selectionRef.current({
          address: "",
          latitude: position.lat,
          longitude: position.lng,
          coordinate_quality: "approximate",
          coordinate_source: "admin map pin",
        });
      });
    });
    map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 13) });
  }, [latitude, longitude]);

  useEffect(() => {
    if (!key || query.trim().length < 3) {
      setCandidates([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const term = `${query.trim()} ${searchContext.trim()}`.trim();
        const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(term)}.json?key=${key}&limit=6`, { signal: controller.signal });
        if (!response.ok) throw new Error("Address search is unavailable.");
        const result = await response.json() as { features?: Array<{ id: string; text?: string; place_name?: string; center: [number, number] }> };
        setCandidates((result.features ?? []).map((feature) => ({
          id: feature.id,
          name: feature.text ?? feature.place_name ?? "Location",
          address: feature.place_name ?? feature.text ?? "",
          longitude: feature.center[0],
          latitude: feature.center[1],
        })));
        setMessage("");
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Address search failed.");
      }
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, searchContext]);

  return (
    <div className="space-y-3">
      <label className="grid gap-2 text-sm text-[var(--ink-muted)]">
        Search venue or address
        <input className="field min-h-11 rounded-lg px-3 text-[var(--ink)]" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={key ? "Search MapTiler" : "Configure MapTiler to enable search"} disabled={!key} />
      </label>
      {candidates.length > 0 && <div className="max-h-48 overflow-auto rounded-lg border border-[var(--rule)]" role="listbox" aria-label="Address candidates">
        {candidates.map((candidate) => <button type="button" role="option" aria-selected={false} key={candidate.id} className="block w-full border-b border-[var(--rule)] px-3 py-2 text-left text-sm hover:bg-[var(--paper-raised)]" onClick={() => {
          onSelect({ address: candidate.address, latitude: candidate.latitude, longitude: candidate.longitude, coordinate_quality: "approximate", coordinate_source: "MapTiler" });
          setQuery(""); setCandidates([]);
        }}><strong className="block">{candidate.name}</strong><span className="text-[var(--ink-muted)]">{candidate.address}</span></button>)}
      </div>}
      {message && <p className="text-xs text-[var(--ink-muted)]">{message}</p>}
      {key ? <div ref={mapElement} className="h-64 overflow-hidden rounded-lg border border-[var(--rule)]" aria-label="Click map to set location pin" /> : <p className="text-xs text-[var(--ink-muted)]">Map preview needs a MapTiler browser key. Manual coordinates remain available.</p>}
      {key && <p className="text-xs text-[var(--ink-muted)]">Choose an address, click the map, or drag the pin. Map data © MapTiler © OpenStreetMap contributors.</p>}
    </div>
  );
}
