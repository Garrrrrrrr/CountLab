"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { DirectorySearchLocation } from "@/lib/directory/types";

const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function casinoIcon(fill: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 80;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.scale(2, 2);
  context.fillStyle = "#112010";
  context.beginPath();
  context.moveTo(20, 47);
  context.bezierCurveTo(16, 40, 2, 28, 2, 20);
  context.arc(20, 20, 18, Math.PI, 0);
  context.bezierCurveTo(38, 28, 24, 40, 20, 47);
  context.fill();
  context.fillStyle = fill;
  context.beginPath();
  context.arc(20, 20, 14, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#112010";
  context.font = "bold 21px Georgia, serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("♠", 20, 21);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function DirectoryMap({ locations, selectedId, onSelect, active }: { locations: DirectorySearchLocation[]; selectedId: string | null; onSelect: (id: string) => void; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const points = useMemo(() => locations.filter((location) => location.latitude != null && location.longitude != null && ["verified", "approximate"].includes(location.coordinate_quality ?? "")), [locations]);

  useEffect(() => {
    if (!host.current || !key) return;
    let disposed = false;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    void import("maplibre-gl").then((mod) => {
      if (disposed || !host.current) return;
      mod.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.js");
      const instance = new mod.Map({
        container: host.current,
        style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`,
        center: [-100, 39],
        zoom: 3,
        scrollZoom: true,
        dragPan: true,
        touchZoomRotate: true,
        attributionControl: false,
      });
      map.current = instance;
      loadTimer = setTimeout(() => setError("The map is taking too long to load. Browse locations in the list."), 15000);
      instance.addControl(new mod.NavigationControl(), "top-right");
      instance.addControl(new mod.FullscreenControl(), "top-right");
      instance.addControl(new mod.AttributionControl({ compact: true }), "bottom-right");
      instance.on("error", () => { clearTimeout(loadTimer); setError("Map tiles are unavailable. The list remains available."); });
      instance.on("load", () => {
        clearTimeout(loadTimer);
        instance.addImage("casino-marker", casinoIcon("#b4f27d"), { pixelRatio: 2 });
        instance.addImage("casino-marker-approximate", casinoIcon("#f5c66a"), { pixelRatio: 2 });
        instance.addSource("directory-locations", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 45 });
        instance.addLayer({ id: "clusters", type: "circle", source: "directory-locations", filter: ["has", "point_count"], paint: { "circle-color": "#65c875", "circle-radius": ["step", ["get", "point_count"], 17, 20, 23, 100, 29], "circle-stroke-color": "#112010", "circle-stroke-width": 2 } });
        instance.addLayer({ id: "cluster-count", type: "symbol", source: "directory-locations", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#112010" } });
        instance.addLayer({ id: "locations", type: "symbol", source: "directory-locations", filter: ["!", ["has", "point_count"]], layout: { "icon-image": ["match", ["get", "coordinate_quality"], "verified", "casino-marker", "casino-marker-approximate"], "icon-anchor": "bottom", "icon-allow-overlap": true } });
        instance.on("click", "locations", (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelect(id);
        });
        instance.on("click", "clusters", (event) => {
          const features = instance.queryRenderedFeatures(event.point, { layers: ["clusters"] });
          const clusterId = features[0]?.properties?.cluster_id;
          const source = instance.getSource("directory-locations") as import("maplibre-gl").GeoJSONSource;
          if (typeof clusterId === "number") void source.getClusterExpansionZoom(clusterId).then((zoom) => instance.easeTo({ center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number], zoom }));
        });
        for (const layer of ["locations", "clusters"]) {
          instance.on("mouseenter", layer, () => { instance.getCanvas().style.cursor = "pointer"; });
          instance.on("mouseleave", layer, () => { instance.getCanvas().style.cursor = ""; });
        }
        setError(null);
        setLoaded(true);
      });
    }).catch(() => setError("The map could not load. The list remains available."));
    return () => { disposed = true; clearTimeout(loadTimer); map.current?.remove(); map.current = null; setLoaded(false); };
  }, [onSelect]);

  useEffect(() => {
    const source = map.current?.getSource("directory-locations") as import("maplibre-gl").GeoJSONSource | undefined;
    if (!source) return;
    source.setData({ type: "FeatureCollection", features: points.map((location) => ({ type: "Feature", geometry: { type: "Point", coordinates: [location.longitude!, location.latitude!] }, properties: { id: location.id, name: location.name, coordinate_quality: location.coordinate_quality } })) });
    if (points.length === 1) map.current?.easeTo({ center: [points[0].longitude!, points[0].latitude!], zoom: 10 });
    else if (points.length > 1) {
      const longitudes = points.map((location) => location.longitude!);
      const latitudes = points.map((location) => location.latitude!);
      map.current?.fitBounds([[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]], { padding: 40, maxZoom: 10, duration: 500 });
    }
  }, [points, loaded]);

  useEffect(() => {
    const selected = points.find((location) => location.id === selectedId);
    if (selected) map.current?.easeTo({ center: [selected.longitude!, selected.latitude!], zoom: Math.max(map.current.getZoom(), 10) });
  }, [selectedId, points]);

  useEffect(() => { if (active) map.current?.resize(); }, [active]);

  if (!key) return <div className="grid h-[calc(100dvh-10rem)] min-h-96 place-items-center rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] p-6 text-center text-sm text-[var(--ink-muted)]">Map is unavailable. Browse locations in the list.</div>;
  return <div className="relative h-[calc(100dvh-10rem)] min-h-96 max-h-[70rem] overflow-hidden rounded-xl border border-[var(--rule)]"><div ref={host} className="h-full w-full" data-map-loaded={loaded} data-map-marker-count={points.length} aria-label="Map of directory locations" role="img" />{error && <p role="status" className="absolute inset-x-3 bottom-3 rounded-lg bg-[var(--paper-raised)] p-3 text-sm">{error}</p>}</div>;
}
