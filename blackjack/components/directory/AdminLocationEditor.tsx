"use client";

import { useState } from "react";
import { Button, GhostButton, Panel } from "@/components/ui";
import type { DirectoryLocation } from "@/lib/directory/types";
import { saveLocation } from "@/lib/directory/admin";
import { AdminCoordinatePicker } from "./AdminCoordinatePicker";

type Draft = Partial<DirectoryLocation>;

const fieldClass = "field min-h-11 w-full rounded-lg px-3 text-[var(--ink)]";

function initialDraft(location?: DirectoryLocation): Draft {
  if (location) return { ...location };
  return {
    name: "", aliases: [], operator: "", country: "US", subdivision: "", city: "", address: "",
    website: "", latitude: null, longitude: null, coordinate_quality: "unknown", coordinate_source: "",
    operating_status: "open", game_availability: "unknown", publication_status: "draft",
  };
}

export function AdminLocationEditor({ location, onSaved, onCancel, onReload }: {
  location?: DirectoryLocation;
  onSaved: (saved: DirectoryLocation) => void;
  onCancel: () => void;
  onReload: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(location));
  const [aliases, setAliases] = useState((location?.aliases ?? []).join(", "));
  const [latitudeText, setLatitudeText] = useState(location?.latitude?.toString() ?? "");
  const [longitudeText, setLongitudeText] = useState(location?.longitude?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const latitude = latitudeText.trim() === "" ? null : Number(latitudeText);
    const longitude = longitudeText.trim() === "" ? null : Number(longitudeText);
    if (!draft.name?.trim() || !draft.city?.trim() || !draft.country?.trim()) {
      setError("Name, city, and country are required."); return;
    }
    if ((latitude == null) !== (longitude == null) ||
      (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      setError("Enter both valid latitude and longitude, or leave both blank."); return;
    }
    setSaving(true);
    try {
      const values: Draft = {
        name: draft.name.trim(),
        aliases: aliases.split(",").map((value) => value.trim()).filter(Boolean),
        operator: draft.operator?.trim() || null,
        country: draft.country.trim().length <= 3 ? draft.country.trim().toUpperCase() : draft.country.trim(),
        subdivision: draft.subdivision?.trim() || null,
        city: draft.city.trim(),
        address: draft.address?.trim() || null,
        website: draft.website?.trim() || null,
        latitude, longitude,
        coordinate_quality: latitude == null ? "unknown" : draft.coordinate_quality,
        coordinate_source: latitude == null ? null : draft.coordinate_source?.trim() || "admin entry",
        operating_status: draft.operating_status,
        game_availability: draft.game_availability,
        publication_status: draft.publication_status,
      };
      onSaved(await saveLocation(values, location));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save location.");
    } finally { setSaving(false); }
  }

  const input = (label: string, key: keyof Draft, required = false, placeholder = "") => (
    <label className="grid gap-2 text-sm text-[var(--ink-muted)]">{label}
      <input className={fieldClass} required={required} value={String(draft[key] ?? "")} placeholder={placeholder} onChange={(event) => change(key, event.target.value as never)} />
    </label>
  );
  const select = (label: string, key: keyof Draft, options: Array<[string, string]>) => (
    <label className="grid gap-2 text-sm text-[var(--ink-muted)]">{label}
      <select className={fieldClass} value={String(draft[key] ?? "")} onChange={(event) => change(key, event.target.value as never)}>
        {options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select>
    </label>
  );
  return <Panel>
    <div className="mb-5 flex items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{location ? `Edit ${location.name}` : "Add a location"}</h2><p className="mt-1 text-sm text-[var(--ink-muted)]">Address search and manual placement are both available. Save the profile before adding games.</p></div>
      <GhostButton type="button" onClick={onCancel}>Close</GhostButton>
    </div>
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {input("Venue name", "name", true)}
        <label className="grid gap-2 text-sm text-[var(--ink-muted)]">Aliases, separated by commas<input className={fieldClass} value={aliases} onChange={(event) => setAliases(event.target.value)} /></label>
        {input("Operator", "operator")}
        {input("City", "city", true)}
        {input("State or province", "subdivision")}
        {input("Country", "country", true, "US, CA, BS")}
        <div className="sm:col-span-2">{input("Street address", "address")}</div>
        <div className="sm:col-span-2">{input("Website", "website", false, "https://")}</div>
      </div>
      <AdminCoordinatePicker latitude={draft.latitude ?? null} longitude={draft.longitude ?? null} searchContext={`${draft.city ?? ""} ${draft.subdivision ?? ""} ${draft.country ?? ""}`} onSelect={(selection) => {
        setDraft((previous) => ({ ...previous, address: selection.address || previous.address, latitude: selection.latitude, longitude: selection.longitude, coordinate_quality: selection.coordinate_quality, coordinate_source: selection.coordinate_source }));
        setLatitudeText(String(selection.latitude)); setLongitudeText(String(selection.longitude));
      }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm text-[var(--ink-muted)]">Latitude<input className={fieldClass} inputMode="decimal" value={latitudeText} onChange={(event) => { setLatitudeText(event.target.value); const number = Number(event.target.value); change("latitude", event.target.value.trim() && Number.isFinite(number) ? number : null); }} /></label>
        <label className="grid gap-2 text-sm text-[var(--ink-muted)]">Longitude<input className={fieldClass} inputMode="decimal" value={longitudeText} onChange={(event) => { setLongitudeText(event.target.value); const number = Number(event.target.value); change("longitude", event.target.value.trim() && Number.isFinite(number) ? number : null); }} /></label>
        {select("Coordinate quality", "coordinate_quality", [["unknown", "Unknown"], ["approximate", "Approximate"], ["verified", "Verified exact pin"]])}
        {input("Coordinate source", "coordinate_source")}
        {select("Operating status", "operating_status", [["open", "Open"], ["temporarily_closed", "Temporarily closed"], ["closed", "Closed"], ["unknown", "Unknown"]])}
        {select("Game availability", "game_availability", [["unknown", "Unknown"], ["reported", "Games reported"], ["none_reported", "No current games reported"], ["not_listed", "Not listed in source"]])}
        {select("Publication", "publication_status", [["draft", "Draft"], ["published", "Published"]])}
      </div>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-[var(--negative)]"><span>{error}</span>{error.startsWith("Another admin") && <GhostButton type="button" className="min-h-9 px-3 py-1 text-xs" onClick={onReload}>Reload latest</GhostButton>}</div>}
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={saving}>{saving ? "Saving…" : location ? "Save changes" : "Add location"}</Button><GhostButton type="button" onClick={onCancel}>Cancel</GhostButton></div>
    </form>
  </Panel>;
}
