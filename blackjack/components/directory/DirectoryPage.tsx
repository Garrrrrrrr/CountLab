"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { DirectoryDetail } from "./DirectoryDetail";
import { DIRECTORY_PAGE_SIZE, searchDirectory, searchDirectoryMap } from "@/lib/directory/queries";
import { loadPrivateDirectory, searchPrivateDirectory, type PrivateDirectoryData } from "@/lib/directory/privateDirectory";
import { useIsAdmin } from "@/lib/supabase/admin";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { label, money, monthLabel } from "@/lib/directory/format";
import type { DirectoryFilters, DirectorySearchLocation } from "@/lib/directory/types";

const DirectoryMap = dynamic(() => import("./DirectoryMap").then((module) => module.DirectoryMap), { ssr: false, loading: () => <div className="grid h-[calc(100dvh-10rem)] min-h-96 place-items-center rounded-xl border border-[var(--rule)]">Loading map…</div> });
const inputClass = "min-h-11 w-full rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] px-3 text-sm text-[var(--ink)]";

function readFilters(params: URLSearchParams): DirectoryFilters {
  const filters: DirectoryFilters = {};
  for (const key of ["q", "game_type", "currency", "soft_17", "payout", "surrender", "mid_shoe_entry"] as const) if (params.get(key)) filters[key] = params.get(key)!;
  for (const key of ["decks", "min_bet_max", "min_penetration"] as const) {
    const value = Number(params.get(key));
    if (params.get(key) && Number.isFinite(value)) filters[key] = value;
  }
  if (params.get("double_after_split") === "true") filters.double_after_split = true;
  if (params.get("double_after_split") === "false") filters.double_after_split = false;
  if (params.get("fresh") === "recent") { const since = new Date(); since.setMonth(since.getMonth() - 6); filters.reported_since = since.toISOString().slice(0, 10); }
  return filters;
}

function DirectoryContent() {
  const { loading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const searchParams = useSearchParams();
  const serialized = searchParams.toString();
  const params = useMemo(() => new URLSearchParams(serialized), [serialized]);
  const filterParams = useMemo(() => {
    const next = new URLSearchParams(serialized);
    for (const key of ["location", "page", "sort"]) next.delete(key);
    return next.toString();
  }, [serialized]);
  const filters = useMemo(() => readFilters(new URLSearchParams(filterParams)), [filterParams]);
  const selectedId = params.get("location");
  const page = Math.max(0, Number.parseInt(params.get("page") || "1", 10) - 1 || 0);
  const requestedSort = params.get("sort") || "name";
  const [query, setQuery] = useState(filters.q ?? "");
  const [publicResults, setPublicResults] = useState<{ total: number; locations: DirectorySearchLocation[] }>({ total: 0, locations: [] });
  const [publicMapResults, setPublicMapResults] = useState<{ total: number; locations: DirectorySearchLocation[] }>({ total: 0, locations: [] });
  const [publicMapLoading, setPublicMapLoading] = useState(false);
  const [publicMapError, setPublicMapError] = useState<string | null>(null);
  const [privateData, setPrivateData] = useState<PrivateDirectoryData | null>(null);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<"list" | "map">(selectedId ? "list" : "map");
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const sort = requestedSort === "distance" && !position ? "name" : requestedSort;
  const requestFilters = useMemo(() => sort === "distance" && position ? { ...filters, latitude: position.lat, longitude: position.lon } : filters, [filters, sort, position]);
  useEffect(() => setQuery(filters.q ?? ""), [filters.q]);
  useEffect(() => {
    if (authLoading || isAdmin !== false) return;
    let active = true;
    setPublicLoading(true); setPublicError(null);
    searchDirectory(requestFilters, page, sort === "min_bet" && !filters.currency ? "name" : sort).then((data) => { if (active) setPublicResults(data); }).catch(() => { if (active) setPublicError("The directory could not load. Check your connection and try again."); }).finally(() => { if (active) setPublicLoading(false); });
    return () => { active = false; };
  }, [authLoading, isAdmin, requestFilters, filters.currency, page, sort, retry]);
  useEffect(() => {
    if (authLoading || view !== "map" || isAdmin !== false) return;
    let active = true;
    setPublicMapLoading(true); setPublicMapError(null);
    setPublicMapResults({ total: 0, locations: [] });
    searchDirectoryMap(filters).then((data) => { if (active) setPublicMapResults(data); }).catch(() => { if (active) setPublicMapError("The casino markers could not load. Try again or use the list."); }).finally(() => { if (active) setPublicMapLoading(false); });
    return () => { active = false; };
  }, [authLoading, filters, isAdmin, retry, view]);
  useEffect(() => {
    if (authLoading || isAdmin !== true) { setPrivateData(null); return; }
    let active = true;
    setPrivateLoading(true); setPrivateError(null);
    loadPrivateDirectory().then((data) => { if (active) setPrivateData(data); })
      .catch(() => { if (active) setPrivateError("The private directory could not load. Check your connection and try again."); })
      .finally(() => { if (active) setPrivateLoading(false); });
    return () => { active = false; };
  }, [authLoading, isAdmin, retry]);
  const update = useCallback((changes: Record<string, string | null>) => {
    // All directory data and filtering live in this client component. Update
    // its URL state without a route transition that can reset scroll in the
    // static export.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) if (value) next.set(key, value); else next.delete(key);
    if (!("page" in changes)) next.delete("page");
    const value = next.toString();
    if (value !== window.location.search.replace(/^\?/, "")) {
      window.history.replaceState(null, "", `${window.location.pathname}${value ? `?${value}` : ""}${window.location.hash}`);
    }
  }, []);
  const select = useCallback((id: string) => { setView("list"); update({ location: id }); }, [update]);
  const selectFromMap = useCallback((id: string) => { setClusterIds([]); update({ location: id }); }, [update]);
  const selectCluster = useCallback((ids: string[]) => { setClusterIds(ids); update({ location: null }); }, [update]);
  useEffect(() => setClusterIds([]), [filterParams, isAdmin]);
  const nearby = () => {
    setLocationError(null);
    if (!navigator.geolocation) { setLocationError("Location is not available on this device."); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => { setPosition({ lat: coords.latitude, lon: coords.longitude }); update({ sort: "distance" }); }, () => setLocationError("Location access was declined. You can still browse by city."), { timeout: 10000 });
  };
  const distance = (location: DirectorySearchLocation) => {
    if (!position || location.latitude == null || location.longitude == null || location.coordinate_quality !== "verified") return Infinity;
    const rad = Math.PI / 180, dLat = (location.latitude - position.lat) * rad, dLon = (location.longitude - position.lon) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(position.lat * rad) * Math.cos(location.latitude * rad) * Math.sin(dLon / 2) ** 2;
    return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };
  const activePrivateData = isAdmin === true ? privateData : null;
  const privateLocations = useMemo(() => activePrivateData ? searchPrivateDirectory(activePrivateData, requestFilters, sort) : [], [activePrivateData, requestFilters, sort]);
  const results = isAdmin === true ? { total: privateLocations.length, locations: privateLocations.slice(page * DIRECTORY_PAGE_SIZE, (page + 1) * DIRECTORY_PAGE_SIZE) } : publicResults;
  const mapResults = isAdmin === true ? { total: privateLocations.length, locations: privateLocations } : publicMapResults;
  const awaitingPrivate = isAdmin === true && !activePrivateData && !privateError;
  const loading = authLoading || isAdmin === null || (isAdmin === true ? privateLoading || awaitingPrivate : publicLoading);
  const error = isAdmin === true ? privateError : publicError;
  const mapLoading = authLoading || isAdmin === null || (isAdmin === true ? privateLoading || awaitingPrivate : publicMapLoading);
  const mapError = isAdmin === true ? privateError : publicMapError;
  const locations = results.locations;
  const mappedCount = mapResults.locations.filter((location) => location.coordinate_quality === "verified" && location.latitude != null && location.longitude != null).length;
  const clusterLocations = clusterIds.map((id) => mapResults.locations.find((location) => location.id === id)).filter((location): location is DirectorySearchLocation => !!location);
  const totalPages = Math.max(1, Math.ceil(results.total / DIRECTORY_PAGE_SIZE));
  const privateView = isAdmin === true;

  return <div><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--accent)]">Explore real tables</p><h1 className="mt-2 text-3xl font-semibold">Game directory</h1><p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)]">Find reported blackjack and Spanish 21 games by venue and rules. Reports describe conditions at a point in time.</p></div></div>
    {isAdmin === true && <div className="mb-4 rounded-lg border border-[var(--accent)]/40 bg-[var(--paper-raised)] p-3 text-sm">Private admin view. Casino locations and games load automatically for signed-in admins.</div>}
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); update({ q: query.trim() || null }); }}><label htmlFor="directory-search" className="sr-only">Search locations</label><input id="directory-search" className={`${inputClass} max-w-xl`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Casino, city, province, or country" /><button type="submit" className="min-h-11 rounded-lg bg-[var(--accent)] px-4 font-semibold text-[#112010]">Search</button></form>
    <div className="mt-4 grid gap-3 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Game"><select className={inputClass} value={params.get("game_type") ?? ""} onChange={(e) => update({ game_type: e.target.value })}><option value="">Any game</option><option value="blackjack">Blackjack</option><option value="spanish_21">Spanish 21</option></select></Field>
      <Field label="Decks"><select className={inputClass} value={params.get("decks") ?? ""} onChange={(e) => update({ decks: e.target.value })}><option value="">Any deck count</option>{[1, 2, 4, 6, 8].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
      <Field label="Minimum bet at most"><input className={inputClass} type="number" min="0" step="1" value={params.get("min_bet_max") ?? ""} onChange={(e) => update({ min_bet_max: e.target.value })} placeholder="Any" /></Field>
      <Field label="Currency"><select className={inputClass} value={params.get("currency") ?? ""} onChange={(e) => update({ currency: e.target.value, ...(e.target.value ? {} : { sort: sort === "min_bet" ? "name" : sort }) })}><option value="">Any currency</option><option value="USD">USD</option><option value="CAD">CAD</option><option value="BSD">BSD</option></select></Field>
      <Field label="Dealer soft 17"><select className={inputClass} value={params.get("soft_17") ?? ""} onChange={(e) => update({ soft_17: e.target.value })}><option value="">Any rule</option><option value="H17">H17</option><option value="S17">S17</option></select></Field>
      <Field label="Blackjack payout"><select className={inputClass} value={params.get("payout") ?? ""} onChange={(e) => update({ payout: e.target.value })}><option value="">Any payout</option><option value="3:2">3:2</option><option value="6:5">6:5</option></select></Field>
      <Field label="Double after split"><select className={inputClass} value={params.get("double_after_split") ?? ""} onChange={(e) => update({ double_after_split: e.target.value })}><option value="">Any</option><option value="true">Allowed</option><option value="false">Not allowed</option></select></Field>
      <Field label="Surrender"><select className={inputClass} value={params.get("surrender") ?? ""} onChange={(e) => update({ surrender: e.target.value })}><option value="">Any</option><option value="late">Late</option><option value="early">Early</option><option value="none">None</option></select></Field>
      <Field label="Penetration at least"><select className={inputClass} value={params.get("min_penetration") ?? ""} onChange={(e) => update({ min_penetration: e.target.value })}><option value="">Any</option><option value="0.5">50%</option><option value="0.6">60%</option><option value="0.7">70%</option><option value="0.75">75%</option><option value="0.8">80%</option></select></Field>
      <Field label="Mid-shoe entry"><select className={inputClass} value={params.get("mid_shoe_entry") ?? ""} onChange={(e) => update({ mid_shoe_entry: e.target.value })}><option value="">Any</option><option value="allowed">Allowed</option><option value="restricted">Restricted</option><option value="not_allowed">Not allowed</option></select></Field>
      <Field label="Report date"><select className={inputClass} value={params.get("fresh") ?? ""} onChange={(e) => update({ fresh: e.target.value })}><option value="">Any date</option><option value="recent">Within six months</option></select></Field>
      <Field label="Sort"><select className={inputClass} value={sort} onChange={(e) => update({ sort: e.target.value })}><option value="name">Name</option><option value="report_date">Latest report</option>{filters.currency && <option value="min_bet">Lowest minimum</option>}{position && <option value="distance">Nearest first</option>}</select></Field>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]"><span role="status">{loading ? "Searching…" : `${results.total} location${results.total === 1 ? "" : "s"}`}</span><button type="button" className="text-[var(--accent)] underline" onClick={nearby}>Near me</button>{locationError && <span role="alert">{locationError}</span>}</div><div className="flex gap-2" role="group" aria-label="Directory view"><button type="button" onClick={() => setView("map")} aria-pressed={view === "map"} className="min-h-11 rounded-lg border border-[var(--rule)] px-4">Map</button><button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} className="min-h-11 rounded-lg border border-[var(--rule)] px-4">List</button></div></div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 p-4">{error} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
    <div className={view === "map" ? "mt-4" : "hidden"}>
      <div className="relative">
        <DirectoryMap locations={mapResults.locations} selectedId={selectedId} onSelect={selectFromMap} onClusterSelect={selectCluster} active={view === "map"} />
        {selectedId && <aside aria-label="Selected casino details" className="absolute inset-x-0 bottom-0 z-10 max-h-[65%] overflow-y-auto rounded-xl bg-[var(--paper)] shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[min(34rem,48%)]"><DirectoryDetail id={selectedId} onClose={() => update({ location: null })} backLabel="Back to map" /></aside>}
        {!selectedId && clusterLocations.length > 0 && <aside aria-label="Casinos at this map location" className="absolute inset-x-0 bottom-0 z-10 max-h-[65%] overflow-y-auto rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-4 shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[min(28rem,42%)]"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{clusterLocations.length} casinos nearby</h2><button type="button" className="min-h-11 text-sm text-[var(--accent)]" onClick={() => setClusterIds([])}>Close</button></div><div className="mt-3 grid gap-2">{clusterLocations.map((location) => <button key={location.id} type="button" onClick={() => selectFromMap(location.id)} className="rounded-lg border border-[var(--rule)] p-3 text-left hover:border-[var(--accent)]"><strong className="block">{location.name}</strong><span className="text-xs text-[var(--ink-muted)]">{[location.city, location.subdivision, location.country].filter(Boolean).join(", ")}</span></button>)}</div></aside>}
        {mapLoading && <p role="status" className="absolute bottom-3 left-3 rounded-lg bg-[var(--paper-raised)] p-3 text-sm">Loading casino markers…</p>}
        {mapError && <p role="alert" className="absolute bottom-3 left-3 rounded-lg bg-[var(--paper-raised)] p-3 text-sm">{mapError} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
        {!mapLoading && !mapError && mapResults.total === 0 && <p role="status" className="absolute bottom-3 left-3 rounded-lg bg-[var(--paper-raised)] p-3 text-sm">{privateView ? "No private casino records match these filters." : "No published casinos are available. Sign in as an admin to view private records."}</p>}
      </div>
      <p className="mt-2 text-xs text-[var(--ink-muted)]">Scroll to zoom, drag to pan, or use the map controls. Click a casino icon to see its details. Only confirmed venue coordinates appear as pins. {privateView && "Private venues without a confirmed venue coordinate stay in the list until reviewed."} {mapLoading ? `Loading ${privateView ? "private" : "published"} locations…` : `${mappedCount} of ${mapResults.total} matching locations have map coordinates.`}</p>
    </div>
    <div className={view === "list" ? "mt-4" : "hidden"}>{selectedId ? <DirectoryDetail id={selectedId} onClose={() => update({ location: null })} /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{!loading && !error && locations.length === 0 && <p className="rounded-xl border border-[var(--rule)] p-6">{privateView ? "No private locations match these filters." : "No published locations match these filters."}</p>}{locations.map((location) => <button key={location.id} type="button" onClick={() => select(location.id)} className="block w-full rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] p-4 text-left transition hover:border-[var(--accent)]"><span className="flex flex-wrap items-start justify-between gap-2"><strong className="text-lg">{location.name}</strong><span className="text-xs text-[var(--ink-muted)]">{location.game_count} game{location.game_count === 1 ? "" : "s"}</span></span><span className="mt-1 block text-sm text-[var(--ink-muted)]">{[location.city, location.subdivision, location.country].filter(Boolean).join(", ")}</span><span className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--ink-muted)]"><span>{filters.currency && location.earliest_min_bet != null ? `From ${money(location.earliest_min_bet, filters.currency)}` : "Limits in details"}</span><span>{monthLabel(location.latest_reported_month)}</span>{position && Number.isFinite(distance(location)) && <span>{distance(location)} km away</span>}<span>{label(location.operating_status)}</span></span></button>)}</div>}
      {!selectedId && results.total > DIRECTORY_PAGE_SIZE && <nav aria-label="Directory pages" className="mt-4 flex items-center justify-between gap-3"><button type="button" className="min-h-11 rounded-lg border border-[var(--rule)] px-4 disabled:opacity-40" disabled={page === 0} onClick={() => update({ page: String(page) })}>Previous</button><span className="text-sm">Page {page + 1} of {totalPages}</span><button type="button" className="min-h-11 rounded-lg border border-[var(--rule)] px-4 disabled:opacity-40" disabled={page + 1 >= totalPages} onClick={() => update({ page: String(page + 2) })}>Next</button></nav>}</div>
  </div>;
}

function Field({ label: fieldLabel, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">{fieldLabel}</span>{children}</label>; }

export function DirectoryPage() { return <Suspense fallback={<p role="status">Loading directory…</p>}><DirectoryContent /></Suspense>; }
