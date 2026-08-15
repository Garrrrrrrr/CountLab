"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GhostButton, Metric, Panel } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useIsAdmin } from "@/lib/supabase/admin";

interface AnalyticsEvent {
  id: string;
  user_id: string | null;
  anon_id: string;
  session_id: string;
  event: string;
  path: string | null;
  properties: Record<string, unknown> | null;
  created_at: string;
}

interface VisitorSummary {
  visitor_id: string;
  user_id: string | null;
  email: string | null;
  event_count: number;
  first_seen: string;
  last_seen: string;
}

interface SelectedVisitor {
  visitorId: string;
  userId: string | null;
  anonId: string | null;
  label: string;
}

const SAMPLE_SIZE = 2000;
const DAYS_BACK = 14;
// Autocaptured events fire constantly and would otherwise drown out the
// named, higher-signal events in "Top actions" — surfaced as their own
// stats instead.
const NOISY_EVENTS = new Set(["ui_click", "scroll_depth", "page_view"]);

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function visitorLabel(v: VisitorSummary) {
  return v.email ?? `guest ${v.visitor_id.slice(0, 8)}`;
}

export default function AdminPage() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [lastLoaded, setLastLoaded] = useState<Date>();
  const [visitors, setVisitors] = useState<VisitorSummary[]>([]);
  const [visitorsError, setVisitorsError] = useState<string>();
  const [selectedVisitor, setSelectedVisitor] = useState<SelectedVisitor>();
  const [timeline, setTimeline] = useState<AnalyticsEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const [sampleRes, countRes, todayRes, visitorsRes] = await Promise.all([
      supabase
        .from("analytics_events")
        .select("id, user_id, anon_id, session_id, event, path, properties, created_at")
        .order("created_at", { ascending: false })
        .limit(SAMPLE_SIZE),
      supabase.from("analytics_events").select("*", { count: "exact", head: true }),
      supabase
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startOfToday.toISOString()),
      supabase.rpc("admin_visitor_summary"),
    ]);
    if (sampleRes.error) setError(sampleRes.error.message);
    else setEvents(sampleRes.data as AnalyticsEvent[]);
    if (visitorsRes.error) setVisitorsError(visitorsRes.error.message);
    else setVisitors(visitorsRes.data as VisitorSummary[]);
    setTotalCount(countRes.count ?? null);
    setTodayCount(todayRes.count ?? null);
    setLastLoaded(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const viewVisitor = useCallback(async (visitor: SelectedVisitor) => {
    setSelectedVisitor(visitor);
    setTimelineLoading(true);
    const { data, error: timelineError } = await supabase.rpc("admin_visitor_events", {
      target_user_id: visitor.userId,
      target_anon_id: visitor.anonId,
    });
    if (!timelineError) setTimeline(data as AnalyticsEvent[]);
    setTimelineLoading(false);
  }, []);

  if (!user) {
    return (
      <Panel className="mt-7">
        <p className="text-zinc-400">Sign in with an admin account to view analytics.</p>
      </Panel>
    );
  }
  if (isAdmin === null) return null;
  if (!isAdmin) {
    return (
      <Panel className="mt-7">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-zinc-400">
          Your account isn&apos;t in <code className="text-zinc-300">admin_users</code>, so analytics data isn&apos;t
          visible here.
        </p>
      </Panel>
    );
  }

  const uniqueVisitors = new Set(events.map((e) => e.user_id ?? e.anon_id)).size;
  const signedInVisitors = new Set(events.filter((e) => e.user_id).map((e) => e.user_id)).size;

  const byEvent = Object.entries(
    events
      .filter((e) => !NOISY_EVENTS.has(e.event))
      .reduce<Record<string, number>>((all, e) => {
        all[e.event] = (all[e.event] ?? 0) + 1;
        return all;
      }, {}),
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const clickCount = events.filter((e) => e.event === "ui_click").length;
  const rageClickCount = events.filter((e) => e.event === "rage_click").length;

  const byPath = Object.entries(
    events
      .filter((e) => e.event === "page_view")
      .reduce<Record<string, number>>((all, e) => {
        const key = e.path || "(unknown)";
        all[key] = (all[key] ?? 0) + 1;
        return all;
      }, {}),
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const dailyBuckets: Record<string, number> = {};
  for (let i = DAYS_BACK - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyBuckets[dayKey(d.toISOString())] = 0;
  }
  for (const e of events) {
    const key = dayKey(e.created_at);
    if (key in dailyBuckets) dailyBuckets[key] += 1;
  }
  const daily = Object.entries(dailyBuckets).map(([date, count]) => ({
    name: date.slice(5),
    count,
  }));

  const recent = events.slice(0, 50);

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold">Analytics</h1>
          <p className="mt-2 text-zinc-400">
            Every tracked user action, from page views to drill completions and journal edits.
          </p>
        </div>
        <GhostButton onClick={() => void load()} disabled={loading}>
          <i className={`fa-solid fa-arrows-rotate mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </GhostButton>
      </div>

      {error && (
        <Panel className="mb-5 border border-red-400/20 bg-red-400/[.04]">
          <p className="text-sm text-red-300">Failed to load analytics: {error}</p>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total events" value={totalCount ?? "…"} />
        <Metric label="Events today" value={todayCount ?? "…"} />
        <Metric
          label={`Unique visitors${events.length >= SAMPLE_SIZE ? ` (last ${SAMPLE_SIZE})` : ""}`}
          value={uniqueVisitors}
        />
        <Metric label="Signed-in visitors" value={signedInVisitors} sub={`${uniqueVisitors - signedInVisitors} guest`} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Metric
          label={`UI clicks${events.length >= SAMPLE_SIZE ? ` (last ${SAMPLE_SIZE})` : ""}`}
          value={clickCount}
          sub="Autocaptured — every click on a button or link"
        />
        <Metric label="Rage clicks" value={rageClickCount} sub="3+ clicks in the same spot within 0.8s" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-5 font-semibold">Events per day (last {DAYS_BACK} days)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid stroke="#ffffff0d" />
                <XAxis dataKey="name" stroke="#71717a" />
                <YAxis stroke="#71717a" allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
                <Line type="monotone" dataKey="count" stroke="#b5ed5c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-5 font-semibold">Top actions</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byEvent} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke="#ffffff0d" horizontal={false} />
                <XAxis type="number" stroke="#71717a" allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke="#71717a" width={140} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
                <Bar dataKey="count" fill="#1e8f62" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel className="lg:col-span-2">
          <h2 className="mb-5 font-semibold">Most viewed pages</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPath}>
                <CartesianGrid stroke="#ffffff0d" />
                <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
                <YAxis stroke="#71717a" allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
                <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel className="mt-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Visitor directory</h2>
          <p className="text-xs text-zinc-500">Every user and guest with tracked activity, most recently active first.</p>
        </div>
        {visitorsError && <p className="mb-4 text-sm text-red-300">Failed to load visitors: {visitorsError}</p>}
        {visitors.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  {["Visitor", "Events", "First seen", "Last seen", ""].map((x) => (
                    <th className="pb-3 pr-4 font-medium" key={x}>
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visitors.map((v) => (
                  <tr key={v.visitor_id} className="border-t border-white/[.06]">
                    <td className="py-3 pr-4 font-medium">
                      {v.email ? v.email : <span className="text-zinc-500">guest {v.visitor_id.slice(0, 8)}</span>}
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">{v.event_count}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-zinc-500">{new Date(v.first_seen).toLocaleString()}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-zinc-500">{new Date(v.last_seen).toLocaleString()}</td>
                    <td className="py-2 text-right">
                      <GhostButton
                        className="min-h-8 px-3 py-1.5 text-xs"
                        onClick={() => void viewVisitor({ visitorId: v.visitor_id, userId: v.user_id, anonId: v.user_id ? null : v.visitor_id, label: visitorLabel(v) })}
                      >
                        View timeline
                      </GhostButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-zinc-500">{loading ? "Loading…" : "No visitors recorded yet."}</div>
        )}
      </Panel>

      {selectedVisitor && (
        <Panel className="mt-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Timeline · {selectedVisitor.label}</h2>
              <p className="mt-1 text-xs text-zinc-500">Everything this visitor did, most recent first.</p>
            </div>
            <GhostButton onClick={() => setSelectedVisitor(undefined)}>Close</GhostButton>
          </div>
          {timelineLoading ? (
            <div className="py-10 text-center text-zinc-500">Loading…</div>
          ) : timeline.length ? (
            <div className="max-h-[32rem] overflow-y-auto overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#171c18] text-zinc-500">
                  <tr>
                    {["Time", "Event", "Path", "Details"].map((x) => (
                      <th className="pb-3 pr-4 font-medium" key={x}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((e) => (
                    <tr key={e.id} className="border-t border-white/[.06] align-top">
                      <td className="whitespace-nowrap py-3 pr-4 text-zinc-500">{new Date(e.created_at).toLocaleString()}</td>
                      <td className="py-3 pr-4 font-medium">{e.event}</td>
                      <td className="py-3 pr-4 text-zinc-400">{e.path}</td>
                      <td className="max-w-md truncate py-3 text-xs text-zinc-500">{e.properties ? JSON.stringify(e.properties) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-zinc-500">No events found for this visitor.</div>
          )}
        </Panel>
      )}

      <Panel className="mt-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          {lastLoaded && (
            <p className="text-xs text-zinc-500">Loaded {lastLoaded.toLocaleTimeString()}</p>
          )}
        </div>
        {recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  {["Time", "Event", "Path", "Visitor", "Details"].map((x) => (
                    <th className="pb-3 pr-4 font-medium" key={x}>
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="border-t border-white/[.06] align-top">
                    <td className="whitespace-nowrap py-3 pr-4 text-zinc-500">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 font-medium">{e.event}</td>
                    <td className="py-3 pr-4 text-zinc-400">{e.path}</td>
                    <td className="py-3 pr-4 text-zinc-500">
                      {e.user_id ? `user ${e.user_id.slice(0, 8)}` : `guest ${e.anon_id.slice(0, 8)}`}
                    </td>
                    <td className="max-w-xs truncate py-3 text-xs text-zinc-500">
                      {e.properties ? JSON.stringify(e.properties) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-zinc-500">
            {loading ? "Loading…" : "No events recorded yet."}
          </div>
        )}
      </Panel>
    </>
  );
}
