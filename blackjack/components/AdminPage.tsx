"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { AdminAdvancedAnalytics } from "./AdminAdvancedAnalytics";

type Scalar = string | number | boolean | null;

interface Overview {
  visitors: number;
  authenticated_visitors: number;
  active_users: number;
  events: number;
  page_views: number;
  sessions: number;
  avg_engaged_ms: number;
  median_session_ms: number;
  bounce_rate: number | null;
  activation_rate: number | null;
  active_now: number;
  dau: number;
  wau: number;
  mau: number;
  new_visitors: number;
  returning_visitors: number;
}

interface DailyRow {
  day: string;
  visitors: number;
  active_users: number;
  page_views: number;
  events: number;
  completed_practice: number;
}

interface FunnelRow { stage: string; users: number }
interface TrainingRow { drill: string; attempts: number; accuracy: number | null; median_response_ms: number | null; p90_response_ms: number | null; starts: number; completions: number; completion_rate: number | null; improvement_pp: number | null }
interface ScenarioRow { drill: string; scenario: string; attempts: number; misses: number; miss_rate: number; median_response_ms: number | null }
interface FeatureRow { feature: string; users: number; sessions: number; opens: number; completions: number; completion_rate: number | null; uses_per_user: number }
interface AcquisitionRow { channel: string; visitors: number; sessions: number; new_visitors: number; returning_visitors: number }
interface PageRow { path: string; views: number; visitors: number; sessions: number }
interface FrictionRow { path: string; element: string; kind: string; occurrences: number }
interface ErrorRow { error_type: string; message: string; path: string; occurrences: number; affected_users: number; first_seen: string; last_seen: string }
interface VitalRow { metric: string; path: string; p50: number; p75: number; p95: number; samples: number }
interface ApiRow { service: string; operation: string; requests: number; error_rate: number; p50_ms: number; p95_ms: number; p99_ms: number }
interface RetentionRow { cohort_week: string; cohort_size: number; d1: number | null; d3: number | null; d7: number | null; d14: number | null; d30: number | null }
interface RecentRow { event: string; path: string; occurred_at: string; visitor: string; properties: Record<string, unknown> }
interface Segments { devices: string[]; browsers: string[]; os: string[]; countries: string[]; regions: string[]; channels: string[]; campaigns: string[]; versions: string[]; drills: string[]; rules: string[]; scenarios: string[] }
interface Quality { last_event_at: string | null; events_24h: number; events_previous_24h: number; missing_required_properties: number; active_releases_7d: number; rejected_events_24h: number; rejections_by_reason: Record<string, number> }

interface DashboardData {
  overview: Overview;
  daily: DailyRow[];
  funnel: FunnelRow[];
  training: TrainingRow[];
  scenarios: ScenarioRow[];
  features: FeatureRow[];
  acquisition: AcquisitionRow[];
  pages: PageRow[];
  friction: FrictionRow[];
  errors: ErrorRow[];
  vitals: VitalRow[];
  api: ApiRow[];
  quality: Quality;
  retention: RetentionRow[];
  recent: RecentRow[];
  segments: Segments;
}

interface VisitorSummary {
  visitor_id: string;
  user_id: string | null;
  email: string | null;
  event_count: number;
  session_count: number;
  active_days: number;
  first_seen: string;
  last_seen: string;
}

interface TimelineRow { id: string; event: string; path: string; properties: Record<string, unknown>; occurred_at: string }
interface SelectedVisitor { visitorId: string; userId: string | null; label: string }
interface VisitorProfile {
  email?: string | null;
  account_created_at?: string | null;
  first_seen?: string;
  last_seen?: string;
  first_authenticated_at?: string | null;
  sessions?: number;
  active_days?: number;
  meaningful_events?: number;
  returning_user?: boolean;
  user_role?: string | null;
  account_status?: string | null;
  acquisition_source?: string | null;
  signup_source?: string | null;
  first_feature?: string | null;
  lifecycle_state?: string;
  resurrected?: boolean;
  average_gap_hours?: number | null;
  features?: Array<{ feature: string; uses: number; sessions: number; completions: number; last_used_at: string }>;
  mastery?: Array<{ drill: string; recent_attempts: number; recent_accuracy: number; median_response_ms: number | null; mastery_score: number; mastered: boolean }>;
}
interface LifecycleRow { lifecycle_state: string; users: number; resurrected: number }
interface IdentitySummary { profiles: number; authenticated: number; returning: number; resurrected: number; avg_active_days: number; avg_sessions: number; avg_meaningful_actions: number; avg_gap_hours: number | null }
interface ActivationRow { milestone: string; users: number; avg_minutes_to_milestone: number | null }
interface AdoptionRow { feature: string; users: number; avg_hours_to_first_use: number | null; repeat_rate: number; week_1_retention: number; month_1_retention: number; uses_per_user: number; abandonment_rate: number }
interface MasteryRow { drill: string; users: number; recent_accuracy: number; median_response_ms: number; avg_mastery: number; mastered_users: number }
interface JourneyRow { path: string; sessions: number; success_rate: number }
interface TransitionRow { from_path: string; to_path: string; mechanism: string; transitions: number }
interface ReturnRow { first_action: string; sessions: number }
interface AdvancedPageRow { path: string; views: number; visitors: number; repeat_visitors: number; entries: number; exits: number }
interface AdvancedScenarioRow { drill: string; scenario: string; attempts: number; correct_median_ms: number | null; p90_ms: number; accuracy: number }
interface StreakRow { streak_bucket: string; answers: number }
interface ContentRow { content: string; opens: number; users: number; completions: number; completion_rate: number; feature_launches: number; avg_reading_ms: number | null }
interface CalculatorRow { calculator: string; opens: number; input_changes: number; runs: number; repeats: number; users: number; repeat_users: number }
interface PeakRow { weekday: number; hour: number; active_users: number }
interface NorthStarRow { week: string; returning_users_completing_training: number; completed_training_sessions: number }
export interface AdvancedData {
  lifecycle: LifecycleRow[];
  identity: IdentitySummary;
  activation: ActivationRow[];
  adoption: AdoptionRow[];
  mastery: MasteryRow[];
  power_users: { threshold: number; users: number; share: number };
  journeys: JourneyRow[];
  transitions: TransitionRow[];
  abandonment: { practice_started_no_answer: number; practice_answered_no_completion: number; calculator_opened_no_run: number; signup_started_no_completion: number };
  return_behavior: ReturnRow[];
  friction_derived: Array<{ kind: string; path: string; element: string; occurrences: number; affected_sessions: number }>;
  pages_advanced: AdvancedPageRow[];
  scenarios_advanced: AdvancedScenarioRow[];
  streaks: StreakRow[];
  content: ContentRow[];
  calculators: CalculatorRow[];
  experiments: Array<{ experiment: string; variant: string; users: number; conversions: number; conversion_rate: number; users_with_errors: number }>;
  feature_flags: Array<{ flag: string; variation: string; users: number; users_with_errors: number }>;
  peak_hours: PeakRow[];
  time_series: Array<{ grain: string; period: string; active_users: number; sessions: number; page_views: number; meaningful_actions: number }>;
  north_star: NorthStarRow[];
}
export interface SegmentedCohortRow { cohort_week: string; segment: string; cohort_size: number; d1: number | null; d7: number | null; d30: number | null; week_1: number | null; month_1: number | null }
export interface OrderedFunnelRow { step: number; event: string; users: number; conversion_from_prior: number | null; median_ms_from_prior: number | null }
export interface AlertRow { metric: string; value: number | null; threshold: number; triggered: boolean; last_sent_at?: string | null; delivery_count?: number }

const PRESETS = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["7", "Last 7 days"],
  ["30", "Last 30 days"], ["90", "Last 90 days"], ["custom", "Custom"],
] as const;

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("en");
const tooltipStyle = { background: "#111", border: "1px solid #333", borderRadius: 10 };

function isoDay(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function presetRange(preset: string): { start: string; end: string } {
  const end = new Date();
  if (preset === "yesterday") end.setDate(end.getDate() - 1);
  const start = new Date(end);
  const days = preset === "today" || preset === "yesterday" ? 1 : Number(preset) || 30;
  start.setDate(start.getDate() - days + 1);
  return { start: isoDay(start), end: isoDay(end) };
}

function priorRange(start: string, end: string): { start: string; end: string } {
  const from = new Date(`${start}T12:00:00`), to = new Date(`${end}T12:00:00`);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const priorEnd = new Date(from); priorEnd.setDate(priorEnd.getDate() - 1);
  const priorStart = new Date(priorEnd); priorStart.setDate(priorStart.getDate() - days + 1);
  return { start: isoDay(priorStart), end: isoDay(priorEnd) };
}

function duration(value: number | null | undefined): string {
  if (!value) return "0s";
  const seconds = Math.round(value / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const percent = (value: number | null | undefined) => value == null ? "—" : `${value.toFixed(1)}%`;
const delta = (current: number, previous: number | undefined) => {
  if (previous == null) return undefined;
  if (previous === 0) return current ? "new vs prior period" : "no change";
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs prior period`;
};

function displayName(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function visitorLabel(visitor: VisitorSummary): string {
  if (visitor.email) return visitor.email;
  const raw = visitor.visitor_id.replace(/^anon:/, "");
  return `${visitor.user_id ? "user" : "guest"} ${raw.slice(0, 8)}`;
}

function safeCsv(value: unknown): string {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function DataTable<T extends object>({
  rows,
  columns,
  empty = "No data for this period.",
}: {
  rows: T[];
  columns: Array<{ key: keyof T; label: string; format?: (value: T[keyof T], row: T) => string | number }>;
  empty?: string;
}) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-zinc-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-zinc-500"><tr>{columns.map((column) => <th className="whitespace-nowrap pb-3 pr-4 font-medium" key={String(column.key)}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => (
          <tr className="border-t border-white/[.06]" key={rowIndex}>
            {columns.map((column, columnIndex) => {
              const value = row[column.key];
              return <td className={`whitespace-nowrap py-3 pr-4 ${columnIndex ? "text-zinc-400" : "font-medium"}`} key={String(column.key)}>{column.format ? column.format(value, row) : String(value ?? "—")}</td>;
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-2"><h2 className="text-lg font-semibold">{title}</h2>{note && <p className="text-xs text-zinc-500">{note}</p>}</div>;
}

function VisitorProfilePanel({ label, profile }: { label: string; profile: VisitorProfile }) {
  return <Panel className="mt-6">
    <SectionTitle title={`Visitor profile · ${label}`} note="Purpose-limited aggregates" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Sessions" value={integer.format(profile.sessions ?? 0)} sub={`${profile.active_days ?? 0} active days`} />
      <Metric label="Meaningful actions" value={integer.format(profile.meaningful_events ?? 0)} sub={profile.returning_user ? "Returning visitor" : "New visitor"} />
      <Metric label="Lifecycle" value={displayName(profile.lifecycle_state ?? "unknown")} sub={profile.resurrected ? "Resurrected" : undefined} />
      <Metric label="First feature" value={profile.first_feature ? displayName(profile.first_feature) : "None"} sub={profile.acquisition_source ? displayName(profile.acquisition_source) : undefined} />
    </div>
    {Boolean(profile.features?.length) && <div className="mt-6"><SectionTitle title="Feature use" /><DataTable rows={profile.features ?? []} columns={[
      { key: "feature", label: "Feature", format: (value) => displayName(String(value)) },
      { key: "uses", label: "Uses" }, { key: "sessions", label: "Sessions" }, { key: "completions", label: "Completions" },
      { key: "last_used_at", label: "Last used", format: (value) => new Date(String(value)).toLocaleDateString() },
    ]} /></div>}
    {Boolean(profile.mastery?.length) && <div className="mt-6"><SectionTitle title="Training progress" /><DataTable rows={profile.mastery ?? []} columns={[
      { key: "drill", label: "Drill", format: (value) => displayName(String(value)) },
      { key: "recent_attempts", label: "Recent attempts" },
      { key: "recent_accuracy", label: "Accuracy", format: (value) => percent(Number(value)) },
      { key: "median_response_ms", label: "Median response", format: (value) => duration(value as number | null) },
      { key: "mastery_score", label: "Mastery", format: (value) => percent(Number(value)) },
    ]} /></div>}
  </Panel>;
}

export default function AdminPage() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const initial = useMemo(() => presetRange("30"), []);
  const [preset, setPreset] = useState("30"), [start, setStart] = useState(initial.start), [end, setEnd] = useState(initial.end);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dashboard, setDashboard] = useState<DashboardData>();
  const [advanced, setAdvanced] = useState<AdvancedData>();
  const [cohorts, setCohorts] = useState<SegmentedCohortRow[]>([]);
  const [orderedFunnel, setOrderedFunnel] = useState<OrderedFunnelRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [cohortDimension, setCohortDimension] = useState("acquisition");
  const [funnelInput, setFunnelInput] = useState("page_viewed,feature_opened,practice_started,question_answered,practice_completed");
  const [funnelDraft, setFunnelDraft] = useState(funnelInput);
  const [previous, setPrevious] = useState<Overview>();
  const [visitors, setVisitors] = useState<VisitorSummary[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState<string>();
  const [lastLoaded, setLastLoaded] = useState<Date>();
  const [selectedVisitor, setSelectedVisitor] = useState<SelectedVisitor>();
  const [timeline, setTimeline] = useState<TimelineRow[]>([]), [timelineLoading, setTimelineLoading] = useState(false);
  const [visitorProfile, setVisitorProfile] = useState<VisitorProfile>();

  const activeFilters = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), [filters]);

  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    const prior = priorRange(start, end);
    const funnelSteps = funnelInput.split(",").map((step) => step.trim()).filter(Boolean).slice(0, 10);
    const [currentResult, previousResult, visitorsResult, advancedResult, cohortResult, funnelResult, alertsResult] = await Promise.all([
      supabase.rpc("admin_analytics_dashboard", { p_start: start, p_end: end, p_filters: activeFilters }),
      supabase.rpc("admin_analytics_dashboard", { p_start: prior.start, p_end: prior.end, p_filters: activeFilters }),
      supabase.rpc("admin_visitor_summary"),
      supabase.rpc("admin_analytics_advanced", { p_start: start, p_end: end, p_filters: activeFilters }),
      supabase.rpc("admin_analytics_cohorts", { p_start: start, p_end: end, p_dimension: cohortDimension, p_filters: activeFilters }),
      supabase.rpc("admin_analytics_funnel", { p_start: start, p_end: end, p_steps: funnelSteps, p_filters: activeFilters }),
      supabase.rpc("admin_analytics_alerts"),
    ]);
    if (currentResult.error) setError(currentResult.error.message);
    else setDashboard(currentResult.data as DashboardData);
    if (!previousResult.error) setPrevious((previousResult.data as DashboardData).overview);
    if (!visitorsResult.error) setVisitors(visitorsResult.data as VisitorSummary[]);
    if (!advancedResult.error) setAdvanced(advancedResult.data as AdvancedData);
    if (!cohortResult.error) setCohorts((cohortResult.data as SegmentedCohortRow[] | null) ?? []);
    if (!funnelResult.error) setOrderedFunnel((funnelResult.data as OrderedFunnelRow[] | null) ?? []);
    if (!alertsResult.error) setAlerts((alertsResult.data as AlertRow[] | null) ?? []);
    setLastLoaded(new Date()); setLoading(false);
  }, [activeFilters, cohortDimension, end, funnelInput, start]);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);
  const refreshRealtime = useCallback(async () => {
    const { data, error: realtimeError } = await supabase.rpc("admin_analytics_realtime");
    if (realtimeError || !data) return;
    const realtime = data as { active_now: number; recent: RecentRow[] };
    setDashboard((current) => current ? {
      ...current,
      overview: { ...current.overview, active_now: realtime.active_now },
      recent: realtime.recent,
    } : current);
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    const refresh = window.setInterval(() => { if (document.visibilityState === "visible") void refreshRealtime(); }, 30_000);
    return () => clearInterval(refresh);
  }, [isAdmin, refreshRealtime]);

  const choosePreset = (value: string) => {
    setPreset(value);
    if (value !== "custom") { const range = presetRange(value); setStart(range.start); setEnd(range.end); }
  };

  const updateFilter = (key: string, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  const viewVisitor = useCallback(async (visitor: VisitorSummary) => {
    const selected = { visitorId: visitor.visitor_id, userId: visitor.user_id, label: visitorLabel(visitor) };
    setSelectedVisitor(selected); setVisitorProfile(undefined); setTimelineLoading(true);
    const [eventsResult, profileResult] = await Promise.all([
      supabase.rpc("admin_visitor_events", {
        target_user_id: visitor.user_id,
        target_anon_id: visitor.user_id ? null : visitor.visitor_id,
      }),
      supabase.rpc("admin_visitor_profile", { target_visitor_id: visitor.visitor_id }),
    ]);
    setTimeline((eventsResult.data as TimelineRow[] | null) ?? []);
    setVisitorProfile((profileResult.data as VisitorProfile | null) ?? undefined);
    setTimelineLoading(false);
  }, []);

  const exportData = (format: "csv" | "json") => {
    if (!dashboard) return;
    const aggregate = {
      ...Object.fromEntries(Object.entries(dashboard).filter(([key]) => key !== "recent")),
      advanced, cohorts, ordered_funnel: orderedFunnel, alerts,
    };
    if (format === "json") {
      download(`countlab-analytics-${start}-${end}.json`, JSON.stringify({ range: { start, end }, filters: activeFilters, ...aggregate }, null, 2), "application/json");
      return;
    }
    const rows = [
      ...dashboard.daily.map((row) => ({ section: "daily", ...row })),
      ...dashboard.training.map((row) => ({ section: "training", ...row })),
      ...dashboard.scenarios.map((row) => ({ section: "scenarios", ...row })),
      ...dashboard.features.map((row) => ({ section: "features", ...row })),
      ...dashboard.acquisition.map((row) => ({ section: "acquisition", ...row })),
      ...dashboard.pages.map((row) => ({ section: "pages", ...row })),
      ...dashboard.vitals.map((row) => ({ section: "vitals", ...row })),
      ...dashboard.api.map((row) => ({ section: "api", ...row })),
      ...(advanced?.adoption.map((row) => ({ section: "feature_adoption", ...row })) ?? []),
      ...(advanced?.mastery.map((row) => ({ section: "mastery", ...row })) ?? []),
      ...(advanced?.content.map((row) => ({ section: "content", ...row })) ?? []),
      ...(advanced?.calculators.map((row) => ({ section: "calculators", ...row })) ?? []),
      ...cohorts.map((row) => ({ section: "segmented_cohorts", ...row })),
      ...orderedFunnel.map((row) => ({ section: "ordered_funnel", ...row })),
    ] as Array<Record<string, Scalar>>;
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const csv = [headers.map(safeCsv).join(","), ...rows.map((row) => headers.map((header) => safeCsv(row[header])).join(","))].join("\n");
    download(`countlab-analytics-${start}-${end}.csv`, csv, "text/csv;charset=utf-8");
  };

  if (!user) return <Panel className="mt-7"><p className="text-zinc-400">Sign in with an admin account to view analytics.</p></Panel>;
  if (isAdmin === null) return null;
  if (!isAdmin) return <Panel className="mt-7"><h1 className="text-xl font-semibold">Not authorized</h1><p className="mt-2 text-zinc-400">This account does not have analytics access.</p></Panel>;

  const overview = dashboard?.overview;
  const latestRetention = dashboard?.retention.find((row) => row.d1 != null || row.d7 != null || row.d30 != null);
  const stickiness = overview?.mau ? (100 * overview.dau) / overview.mau : 0;
  const maxFunnel = Math.max(1, ...(dashboard?.funnel.map((row) => row.users) ?? []));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Admin</p><h1 className="mt-2 text-3xl font-semibold">Product analytics</h1><p className="mt-2 max-w-3xl text-zinc-400">Actionable usage, learning, retention, acquisition, reliability, and performance metrics. Bots, internal accounts, staging, and development are excluded.</p></div>
        <div className="flex flex-wrap gap-2"><GhostButton onClick={() => exportData("csv")} disabled={!dashboard}>Export CSV</GhostButton><GhostButton onClick={() => exportData("json")} disabled={!dashboard}>Export JSON</GhostButton><GhostButton onClick={() => void load()} disabled={loading}><i className={`fa-solid fa-arrows-rotate mr-2 ${loading ? "animate-spin" : ""}`} />Refresh</GhostButton></div>
      </div>

      <Panel className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs text-zinc-500">Range<select className="field min-h-10 rounded-xl px-3 text-sm text-zinc-200" value={preset} onChange={(event) => choosePreset(event.target.value)}>{PRESETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-zinc-500">Start<input type="date" className="field min-h-10 rounded-xl px-3 text-sm text-zinc-200" value={start} max={end} onChange={(event) => { setPreset("custom"); setStart(event.target.value); }} /></label>
          <label className="grid gap-1 text-xs text-zinc-500">End<input type="date" className="field min-h-10 rounded-xl px-3 text-sm text-zinc-200" value={end} min={start} max={isoDay(new Date())} onChange={(event) => { setPreset("custom"); setEnd(event.target.value); }} /></label>
          <label className="grid gap-1 text-xs text-zinc-500">Authentication<select className="field min-h-10 rounded-xl px-3 text-sm text-zinc-200" value={filters.auth ?? ""} onChange={(event) => updateFilter("auth", event.target.value)}><option value="">All visitors</option><option value="authenticated">Authenticated</option><option value="anonymous">Anonymous</option></select></label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {([
            ["device", "Device", dashboard?.segments.devices], ["browser", "Browser", dashboard?.segments.browsers],
            ["os", "OS", dashboard?.segments.os], ["country", "Country", dashboard?.segments.countries],
            ["region", "Region", dashboard?.segments.regions], ["channel", "Channel", dashboard?.segments.channels],
            ["campaign", "Campaign", dashboard?.segments.campaigns], ["app_version", "Release", dashboard?.segments.versions],
          ] as Array<[string, string, string[] | undefined]>).map(([key, label, values]) => (
            <label className="grid gap-1 text-xs text-zinc-500" key={key}>{label}<select className="field min-h-9 min-w-0 rounded-lg px-2 text-xs text-zinc-200" value={filters[key] ?? ""} onChange={(event) => updateFilter(key, event.target.value)}><option value="">All</option>{values?.filter(Boolean).sort().map((value) => <option key={value}>{value}</option>)}</select></label>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <label className="grid gap-1 text-xs text-zinc-500">New / returning<select className="field min-h-9 rounded-lg px-2 text-xs text-zinc-200" value={filters.visitor_type ?? ""} onChange={(event) => updateFilter("visitor_type", event.target.value)}><option value="">All</option><option value="new">New</option><option value="returning">Returning</option></select></label>
          <label className="grid gap-1 text-xs text-zinc-500">Feature<select className="field min-h-9 rounded-lg px-2 text-xs text-zinc-200" value={filters.feature ?? ""} onChange={(event) => updateFilter("feature", event.target.value)}><option value="">All</option>{advanced?.adoption.map((row) => <option key={row.feature}>{row.feature}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-zinc-500">Lifecycle<select className="field min-h-9 rounded-lg px-2 text-xs text-zinc-200" value={filters.lifecycle ?? ""} onChange={(event) => updateFilter("lifecycle", event.target.value)}><option value="">All</option><option value="recently_active">Recently active</option><option value="slipping">Slipping</option><option value="churned">Churned</option></select></label>
          <label className="grid gap-1 text-xs text-zinc-500">Cohort dimension<select className="field min-h-9 rounded-lg px-2 text-xs text-zinc-200" value={cohortDimension} onChange={(event) => setCohortDimension(event.target.value)}>{["acquisition","first_feature","device","country","app_version","auth_state","signup"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-zinc-500">Training drill<select className="field min-h-9 rounded-lg px-2 text-xs text-zinc-200" value={filters.drill ?? ""} onChange={(event) => updateFilter("drill", event.target.value)}><option value="">All</option>{dashboard?.segments.drills?.filter(Boolean).sort().map((value) => <option key={value} value={value}>{displayName(value)}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-zinc-500">Rules preset<select className="field min-h-9 rounded-lg px-2 text-xs text-zinc-200" value={filters.rules_preset ?? ""} onChange={(event) => updateFilter("rules_preset", event.target.value)}><option value="">All</option>{dashboard?.segments.rules?.filter(Boolean).sort().map((value) => <option key={value} value={value}>{displayName(value)}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-zinc-500">Scenario<select className="field min-h-9 rounded-lg px-2 text-xs text-zinc-200" value={filters.scenario ?? ""} onChange={(event) => updateFilter("scenario", event.target.value)}><option value="">All</option>{dashboard?.segments.scenarios?.filter(Boolean).sort().map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="grid flex-1 gap-1 text-xs text-zinc-500">Ordered funnel events (comma separated)<input className="field min-h-9 rounded-lg px-3 text-xs text-zinc-200" value={funnelDraft} onChange={(event) => setFunnelDraft(event.target.value)} /></label>
          <GhostButton className="min-h-9" onClick={() => setFunnelInput(funnelDraft)}>Apply funnel</GhostButton>
        </div>
        {lastLoaded && <p className="mt-3 text-right text-xs text-zinc-600">Loaded {lastLoaded.toLocaleTimeString()}</p>}
      </Panel>

      {error && <Panel className="mb-6 border border-red-400/20 bg-red-400/[.04]"><p className="text-sm text-red-300">Analytics could not load: {error}. Apply the comprehensive analytics section in <code>supabase/schema.sql</code>, then retry.</p></Panel>}

      {overview && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <Metric label="Active now" value={compact.format(overview.active_now ?? 0)} sub="Last 5 minutes" />
          <Metric label="DAU" value={compact.format(overview.dau)} sub={delta(overview.dau, previous?.dau)} />
          <Metric label="WAU" value={compact.format(overview.wau)} sub={delta(overview.wau, previous?.wau)} />
          <Metric label="MAU" value={compact.format(overview.mau)} sub={`${stickiness.toFixed(1)}% DAU / MAU`} />
          <Metric label="Visitors" value={compact.format(overview.visitors)} sub={delta(overview.visitors, previous?.visitors)} />
          <Metric label="New visitors" value={compact.format(overview.new_visitors)} sub={`${overview.returning_visitors} returning`} />
          <Metric label="Sessions" value={compact.format(overview.sessions)} sub={delta(overview.sessions, previous?.sessions)} />
          <Metric label="Page views" value={compact.format(overview.page_views)} sub={`${overview.sessions ? (overview.page_views / overview.sessions).toFixed(1) : "0"} / session`} />
          <Metric label="Meaningful users" value={compact.format(overview.active_users)} sub={`${overview.authenticated_visitors} authenticated`} />
          <Metric label="Events" value={compact.format(overview.events)} sub={delta(overview.events, previous?.events)} />
          <Metric label="Avg engaged time" value={duration(overview.avg_engaged_ms)} sub={`Median session ${duration(overview.median_session_ms)}`} />
          <Metric label="Activation" value={percent(overview.activation_rate)} sub="Completed a drill" />
          <Metric label="Bounce rate" value={percent(overview.bounce_rate)} sub="1 page and <10s engaged" />
          <Metric label="D1 retention" value={percent(latestRetention?.d1)} />
          <Metric label="D7 retention" value={percent(latestRetention?.d7)} />
          <Metric label="D30 retention" value={percent(latestRetention?.d30)} />
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Panel><SectionTitle title="Active users and completed practice" note="Meaningful activity only" /><div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={dashboard.daily}><CartesianGrid stroke="#ffffff0d" /><XAxis dataKey="day" stroke="#71717a" tickFormatter={(value) => String(value).slice(5)} /><YAxis stroke="#71717a" allowDecimals={false} /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="active_users" name="Active users" stroke="#b5ed5c" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="completed_practice" name="Completed practice" stroke="#38bdf8" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></Panel>
          <Panel><SectionTitle title="Training funnel" note="Unique visitors reaching each stage" /><div className="space-y-4">{dashboard.funnel.map((row, index) => { const priorUsers = dashboard.funnel[index - 1]?.users; return <div key={row.stage}><div className="mb-1 flex justify-between text-sm"><span>{row.stage}</span><span className="text-zinc-400">{integer.format(row.users)}{priorUsers ? ` · ${((100 * row.users) / priorUsers).toFixed(1)}%` : ""}</span></div><div className="h-3 rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-emerald-400/70" style={{ width: `${Math.max(2, (100 * row.users) / maxFunnel)}%` }} /></div></div>; })}</div></Panel>
        </div>

        <Panel className="mt-6"><SectionTitle title="Training performance" note="Accuracy, speed, completion, and change across the selected period" /><DataTable rows={dashboard.training} columns={[
          { key: "drill", label: "Drill", format: (value) => displayName(String(value)) }, { key: "attempts", label: "Answers" },
          { key: "accuracy", label: "Accuracy", format: (value) => percent(value as number | null) },
          { key: "median_response_ms", label: "Median response", format: (value) => duration(value as number | null) },
          { key: "p90_response_ms", label: "P90 response", format: (value) => duration(value as number | null) },
          { key: "completion_rate", label: "Completion", format: (value) => percent(value as number | null) },
          { key: "improvement_pp", label: "Improvement", format: (value) => value == null ? "—" : `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)} pp` },
        ]} /></Panel>

        <Panel className="mt-6"><SectionTitle title="Commonly missed scenarios" note="Stable blackjack/counting scenario keys; no private text" /><DataTable rows={dashboard.scenarios.slice(0, 20)} columns={[
          { key: "drill", label: "Drill", format: (value) => displayName(String(value)) }, { key: "scenario", label: "Scenario" },
          { key: "attempts", label: "Attempts" }, { key: "misses", label: "Misses" },
          { key: "miss_rate", label: "Miss rate", format: (value) => percent(value as number) },
          { key: "median_response_ms", label: "Median response", format: (value) => duration(value as number | null) },
        ]} /></Panel>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Panel><SectionTitle title="Feature adoption" note="Users by explicit feature-open event" /><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.features.slice(0, 10)} layout="vertical" margin={{ left: 40 }}><CartesianGrid stroke="#ffffff0d" horizontal={false} /><XAxis type="number" stroke="#71717a" allowDecimals={false} /><YAxis type="category" dataKey="feature" tickFormatter={displayName} stroke="#71717a" width={130} tick={{ fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="users" fill="#1e8f62" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div></Panel>
          <Panel><SectionTitle title="Acquisition quality" note="First-touch channel and returning visitors" /><DataTable rows={dashboard.acquisition} columns={[
            { key: "channel", label: "Channel", format: (value) => displayName(String(value)) }, { key: "visitors", label: "Visitors" },
            { key: "sessions", label: "Sessions" }, { key: "new_visitors", label: "New" }, { key: "returning_visitors", label: "Returning" },
          ]} /></Panel>
        </div>

        <Panel className="mt-6"><SectionTitle title="Retention cohorts" note="Exact-day return after first meaningful activity" /><DataTable rows={dashboard.retention} columns={[
          { key: "cohort_week", label: "Cohort week", format: (value) => String(value).slice(0, 10) }, { key: "cohort_size", label: "Users" },
          { key: "d1", label: "D1", format: (value) => percent(value as number | null) }, { key: "d3", label: "D3", format: (value) => percent(value as number | null) },
          { key: "d7", label: "D7", format: (value) => percent(value as number | null) }, { key: "d14", label: "D14", format: (value) => percent(value as number | null) },
          { key: "d30", label: "D30", format: (value) => percent(value as number | null) },
        ]} /></Panel>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Panel><SectionTitle title="Pages" note="SPA page views" /><DataTable rows={dashboard.pages.slice(0, 15)} columns={[{ key: "path", label: "Route" }, { key: "views", label: "Views" }, { key: "visitors", label: "Visitors" }, { key: "sessions", label: "Sessions" }]} /></Panel>
          <Panel><SectionTitle title="UI friction" note="Rage and dead clicks" /><DataTable rows={dashboard.friction.slice(0, 15)} columns={[{ key: "path", label: "Route" }, { key: "element", label: "Element" }, { key: "kind", label: "Signal", format: (value) => displayName(String(value)) }, { key: "occurrences", label: "Count" }]} /></Panel>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Panel><SectionTitle title="Core Web Vitals" note="P50 / P75 / P95 distributions" /><DataTable rows={dashboard.vitals.slice(0, 20)} columns={[{ key: "metric", label: "Metric" }, { key: "path", label: "Route" }, { key: "p50", label: "P50" }, { key: "p75", label: "P75" }, { key: "p95", label: "P95" }, { key: "samples", label: "N" }]} /></Panel>
          <Panel><SectionTitle title="API performance" note="Normalized Supabase operations; no URLs or payloads" /><DataTable rows={dashboard.api.slice(0, 20)} columns={[{ key: "operation", label: "Operation" }, { key: "requests", label: "Requests" }, { key: "error_rate", label: "Error rate", format: (value) => percent(value as number) }, { key: "p50_ms", label: "P50", format: (value) => `${value} ms` }, { key: "p95_ms", label: "P95", format: (value) => `${value} ms` }, { key: "p99_ms", label: "P99", format: (value) => `${value} ms` }]} /></Panel>
        </div>

        {advanced && <AdminAdvancedAnalytics advanced={advanced} cohorts={cohorts} funnel={orderedFunnel} alerts={alerts} cohortDimension={cohortDimension} />}

        {selectedVisitor && visitorProfile && <VisitorProfilePanel label={selectedVisitor.label} profile={visitorProfile} />}

        <Panel className="mt-6"><SectionTitle title="Analytics data quality" note="Database validation rejects unknown/malformed writes before storage" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Events · 24h" value={integer.format(dashboard.quality.events_24h)} sub={delta(dashboard.quality.events_24h, dashboard.quality.events_previous_24h)} /><Metric label="Rejected · 24h" value={integer.format(dashboard.quality.rejected_events_24h ?? 0)} sub={Object.entries(dashboard.quality.rejections_by_reason ?? {}).map(([reason, count]) => `${displayName(reason)} ${count}`).join(" · ") || "Expected: 0"} /><Metric label="Missing required fields" value={dashboard.quality.missing_required_properties} sub="Expected: 0" /><Metric label="Active releases · 7d" value={dashboard.quality.active_releases_7d} /><Metric label="Last event" value={dashboard.quality.last_event_at ? new Date(dashboard.quality.last_event_at).toLocaleTimeString() : "None"} /></div></Panel>

        <Panel className="mt-6"><SectionTitle title="Errors" note="Normalized messages and grouped impact" /><DataTable rows={dashboard.errors.slice(0, 20)} columns={[{ key: "error_type", label: "Type" }, { key: "message", label: "Normalized message" }, { key: "path", label: "Route" }, { key: "occurrences", label: "Count" }, { key: "affected_users", label: "Affected users" }, { key: "last_seen", label: "Last seen", format: (value) => new Date(String(value)).toLocaleString() }]} /></Panel>

        <Panel className="mt-6"><SectionTitle title="Visitor aggregates" note="Email shown for signed-in accounts; guests remain pseudonymous. No answer text." /><DataTable rows={visitors.slice(0, 100)} columns={[
          { key: "visitor_id", label: "Visitor", format: (_value, row) => visitorLabel(row) }, { key: "event_count", label: "Events" },
          { key: "session_count", label: "Sessions" }, { key: "active_days", label: "Active days" },
          { key: "last_seen", label: "Last active", format: (value) => new Date(String(value)).toLocaleString() },
          { key: "first_seen", label: "First seen", format: (value) => new Date(String(value)).toLocaleDateString() },
        ]} />{visitors.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{visitors.slice(0, 20).map((visitor) => <GhostButton className="min-h-8 px-3 py-1 text-xs" key={visitor.visitor_id} onClick={() => void viewVisitor(visitor)}>{visitorLabel(visitor)}</GhostButton>)}</div>}</Panel>

        {selectedVisitor && <Panel className="mt-6"><div className="mb-5 flex items-center justify-between"><SectionTitle title={`High-level timeline · ${selectedVisitor.label}`} note="Answers and sensitive values are omitted" /><GhostButton onClick={() => setSelectedVisitor(undefined)}>Close</GhostButton></div>{timelineLoading ? <p className="py-8 text-center text-zinc-500">Loading…</p> : <DataTable rows={timeline} columns={[{ key: "occurred_at", label: "Time", format: (value) => new Date(String(value)).toLocaleString() }, { key: "event", label: "Event", format: (value) => displayName(String(value)) }, { key: "path", label: "Route" }, { key: "properties", label: "Safe details", format: (value) => JSON.stringify(value) }]} />}</Panel>}

        <Panel className="mt-6"><SectionTitle title="Recent meaningful activity" note="Most recent first; click/vital noise excluded" /><DataTable rows={dashboard.recent} columns={[{ key: "occurred_at", label: "Time", format: (value) => new Date(String(value)).toLocaleString() }, { key: "event", label: "Event", format: (value) => displayName(String(value)) }, { key: "path", label: "Route" }, { key: "visitor", label: "Visitor" }, { key: "properties", label: "Safe details", format: (value) => JSON.stringify(value) }]} /></Panel>
      </>}
    </>
  );
}
