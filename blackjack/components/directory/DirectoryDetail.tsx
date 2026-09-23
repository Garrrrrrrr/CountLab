"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDirectoryLocation } from "@/lib/directory/queries";
import { isStale, label, money, monthLabel, penetration } from "@/lib/directory/format";
import { directoryGameToLab } from "@/lib/directory/labCompatibility";
import type { DirectoryGame, DirectoryLocation, DirectoryNote } from "@/lib/directory/types";

function GameCard({ game, notes }: { game: DirectoryGame; notes: DirectoryNote[] }) {
  const visibleNotes = notes.filter((note) => note.game_id === game.id);
  const cut = penetration(game);
  const lab = directoryGameToLab(game);
  return <article className="rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{label(game.game_type)} · {game.decks == null ? "Decks unknown" : `${game.decks} deck${game.decks === 1 ? "" : "s"}`}</h3><p className="mt-1 text-xs text-[var(--ink-muted)]">{game.table_count == null ? "Table count unknown" : `${game.table_count} reported table${game.table_count === 1 ? "" : "s"}`} · {monthLabel(game.reported_month)}{game.verified_at ? ` · Verified ${new Date(game.verified_at).toLocaleDateString()}` : ""}</p></div><div className="flex gap-2">{game.availability !== "reported" && <span className="rounded-full border border-[var(--rule)] px-2 py-1 text-xs">{label(game.availability)}</span>}{isStale(game) && <span className="rounded-full border border-amber-400/30 px-2 py-1 text-xs text-amber-300">Older report</span>}</div></div>
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-[var(--ink-muted)]">Limits</dt><dd>{money(game.min_bet, game.currency)} – {money(game.max_bet, game.currency)}</dd></div><div><dt className="text-xs text-[var(--ink-muted)]">Dealer soft 17</dt><dd>{game.soft_17 ?? "Unknown"}</dd></div><div><dt className="text-xs text-[var(--ink-muted)]">Blackjack payout</dt><dd>{game.payout ?? "Unknown"}</dd></div><div><dt className="text-xs text-[var(--ink-muted)]">Penetration</dt><dd>{cut == null ? "Unknown" : `${Math.round(cut * 100)}% (${game.decks_cut} decks cut)`}</dd></div><div><dt className="text-xs text-[var(--ink-muted)]">Double after split</dt><dd>{game.double_after_split == null ? "Unknown" : game.double_after_split ? "Yes" : "No"}</dd></div><div><dt className="text-xs text-[var(--ink-muted)]">Surrender</dt><dd>{label(game.surrender)}</dd></div></dl>
    <div className="mt-4 rounded-lg border border-[var(--rule)] p-3 text-sm">{lab.config ? <><Link className="inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-4 font-semibold text-[#112010]" href={`/cvcx?directoryLocation=${encodeURIComponent(game.location_id)}&directoryGame=${encodeURIComponent(game.id)}`}>Analyze this game <i className="fa-solid fa-arrow-right ml-2" aria-hidden="true" /></Link><p className="mt-2 text-xs text-[var(--ink-muted)]">The lab will load the reported rules and minimum bet. {lab.notes.join(" ")}</p></> : <><p className="font-medium">Lab handoff unavailable</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-muted)]">{lab.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><Link href="/cvcx" className="mt-2 inline-block text-xs text-[var(--accent)] underline">Open the lab to enter a separate scenario</Link></>}</div>
    <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium text-[var(--accent)]">More rules and explanations</summary><dl className="mt-3 grid gap-2 text-[var(--ink-muted)]"><div>Mid-shoe entry: {label(game.mid_shoe_entry)}</div><div>Dealer procedure: {label(game.dealer_procedure)}</div><div>Dealer blackjack wagers: {label(game.dealer_blackjack_wager_treatment)}</div><div>Doubling: {game.double_rules || "Unknown"}</div><div>Split limit: {game.max_split_hands ?? "Unknown"}; resplit aces: {game.resplit_aces == null ? "Unknown" : game.resplit_aces ? "Yes" : "No"}</div><div>Dealing: {label(game.dealing_method)}; shuffle: {label(game.shuffle_method)}</div>{game.reported_house_edge_pct != null && <div>Source reported house edge: {game.reported_house_edge_pct.toFixed(2)}%</div>}{Object.entries(game.extra_rules ?? {}).filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean").map(([key, value]) => <div key={key}>{label(key)}: {String(value)}</div>)}</dl><p className="mt-3 text-xs">H17 means the dealer hits soft 17; S17 means the dealer stands. DAS means doubling after a split. Penetration is the share of the shoe dealt before reshuffling; source “cut” is decks left undealt.</p>{visibleNotes.map((note) => <p key={note.id} className="mt-2">{note.body}</p>)}</details>
  </article>;
}

export function DirectoryDetail({ id, onClose, backLabel = "Back to results" }: { id: string; onClose: () => void; backLabel?: string }) {
  const [data, setData] = useState<{ location: DirectoryLocation; games: DirectoryGame[]; notes: DirectoryNote[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setData(null);
    getDirectoryLocation(id).then((result) => { if (active) setData(result); }).catch(() => { if (active) setError("This location could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  const location = data?.location;
  const address = location ? [location.address, location.city, location.subdivision, location.country].filter(Boolean).join(", ") : "";
  const directions = location?.latitude != null && location.longitude != null && location.coordinate_quality === "verified" ? `${location.latitude},${location.longitude}` : address;
  const website = location?.website && /^https?:\/\//i.test(location.website) ? location.website : null;
  return <section aria-label="Location details" className="min-w-0 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-4 sm:p-6">
    <button type="button" onClick={onClose} className="mb-4 min-h-11 text-sm font-medium text-[var(--accent)]"><i className="fa-solid fa-arrow-left mr-2" aria-hidden="true" />{backLabel}</button>
    {loading && <p role="status">Loading location…</p>}{error && <p role="alert">{error}</p>}{!loading && !error && !location && <p role="status">This location is unavailable or has not been published.</p>}
    {location && <><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--accent)]">Game directory</p><h2 className="mt-1 text-2xl font-semibold">{location.name}</h2><p className="mt-1 text-sm text-[var(--ink-muted)]">{address}</p></div><span className="rounded-full border border-[var(--rule)] px-3 py-1 text-xs">{label(location.operating_status)}</span></div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">{directions && <a className="text-[var(--accent)] underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directions)}`} target="_blank" rel="noopener noreferrer">Directions</a>}{website && <a className="text-[var(--accent)] underline" href={website} target="_blank" rel="noopener noreferrer">Website</a>}<button type="button" className="text-[var(--accent)] underline" onClick={() => void navigator.clipboard?.writeText(window.location.href)}>Copy link</button></div>
      <div className="mt-6"><h3 className="text-lg font-semibold">Reported games</h3><p className="mt-1 text-sm text-[var(--ink-muted)]">Conditions can change. Confirm limits and rules with the venue before playing.</p><div className="mt-3 space-y-3">{data.games.length ? data.games.map((game) => <GameCard key={game.id} game={game} notes={data.notes} />) : <p className="rounded-xl border border-[var(--rule)] p-4 text-sm">{location.operating_status === "closed" ? "This location is closed." : location.game_availability === "none_reported" ? "No currently reported games." : "No games are listed in this source."}</p>}</div></div>
      {data.notes.filter((note) => !note.game_id).length > 0 && <div className="mt-6"><h3 className="font-semibold">Location notes</h3>{data.notes.filter((note) => !note.game_id).map((note) => <p key={note.id} className="mt-2 text-sm text-[var(--ink-muted)]">{note.body}</p>)}</div>}
    </>}
  </section>;
}
