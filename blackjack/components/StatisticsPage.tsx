"use client";
import { ButtonLink } from "./ui";
import { useEffect, useState } from "react";
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
import { Metric, Panel, Select } from "@/components/ui";
import { countingMastery } from "@/lib/blackjack/countingTraining";
import { Session, storage } from "@/lib/statistics/storage";

export default function StatisticsPage() {
  const [allSessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    const load = () => setSessions(storage.sessions());
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
  const [drill, setDrill] = useState("all");
  const [days, setDays] = useState("30");
  const [rules, setRules] = useState("all");
  const sessions = allSessions.filter((session) => (drill === "all" || session.drill === drill) && (days === "all" || new Date(session.date).getTime() >= Date.now() - Number(days) * 86400000) && (rules === "all" || (session.metrics?.rules ?? "Not recorded") === rules));
  const trendDrill = drill === "all" ? sessions[0]?.drill : drill;
  const chart = [...sessions.filter((session) => session.drill === trendDrill)]
    .reverse()
    .slice(-20)
    .map((s, i) => ({
      name: i + 1,
      accuracy: s.accuracy,
      response: Math.round(s.averageResponseTime / 100) / 10,
    }));
  const byDrill = Object.entries(
    sessions.reduce<Record<string, { total: number; correct: number }>>(
      (a, s) => {
        a[s.drill] ??= { total: 0, correct: 0 };
        a[s.drill].total += s.questions;
        a[s.drill].correct += s.correct;
        return a;
      },
      {},
    ),
  ).map(([name, v]) => ({
    name,
    accuracy: v.total ? Math.round((v.correct / v.total) * 100) : 0,
    total: v.total,
  }));
  const byCategory = Object.entries(
    sessions.reduce<Record<string, { total: number; correct: number }>>(
      (all, session) => {
        for (const [category, result] of Object.entries(session.categories ?? {})) {
          const key = `${session.drill}: ${category}`;
          all[key] ??= { total: 0, correct: 0 };
          all[key].total += result.total;
          all[key].correct += result.correct;
        }
        return all;
      },
      {},
    ),
  )
    .map(([name, result]) => ({
      name,
      accuracy: Math.round((result.correct / result.total) * 100),
      total: result.total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
  const accuracySince = (days: number) => {
    const cutoff = Date.now() - days * 86400000;
    const recent = sessions.filter((session) => new Date(session.date).getTime() >= cutoff);
    const total = recent.reduce((sum, session) => sum + session.questions, 0);
    return total ? Math.round(recent.reduce((sum, session) => sum + session.correct, 0) / total * 100) : null;
  };
  const counting = sessions.filter((session) => ["Running Count", "True Count", "Deck Estimation", "Full Shoe"].includes(session.drill));
  const numericMetric = (key: string) => counting.map((session) => Number(session.metrics?.[key])).filter(Number.isFinite);
  const cardSpeeds = numericMetric("cardsPerSecond"), deckErrors = numericMetric("meanAbsoluteDeckError"), mastery = countingMastery(sessions);
  const perfectShoes = counting.filter((session) => session.drill === "Full Shoe" && session.accuracy === 100).length;
  const errorCounts = Object.entries(counting.flatMap((session) => session.mistakes).reduce<Record<string, number>>((all, mistake) => {
    const key = mistake.category ?? "uncategorized";
    all[key] = (all[key] ?? 0) + 1;
    return all;
  }, {})).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <h1 className="text-3xl font-semibold">Statistics</h1>
      <p className="mt-2 text-[var(--ink-muted)]">
        Persistent performance history across every training mode.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><Select label="Drill" value={drill} onChange={(event) => setDrill(event.target.value)}><option value="all">All drills</option>{[...new Set(allSessions.map((session) => session.drill))].map((name) => <option key={name}>{name}</option>)}</Select><Select label="Time period" value={days} onChange={(event) => setDays(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All history</option></Select><Select label="Table rules" value={rules} onChange={(event) => setRules(event.target.value)}><option value="all">All rules</option>{[...new Set(allSessions.map((session) => String(session.metrics?.rules ?? "Not recorded")))].map((name) => <option key={name}>{name}</option>)}</Select></div>
      <p className="mt-3 text-sm text-[var(--ink-muted)]" role="status">{sessions.length} sessions · {sessions.reduce((sum, session) => sum + session.questions, 0)} answers. Trends compare {trendDrill ?? "one drill"} only.</p>
      {sessions.length === 0 ? (
        <Panel className="mt-7 py-16 text-center">
          <p className="text-[var(--ink-muted)]">
            No sessions match these filters. Choose another period or complete a drill.
          </p>
          <ButtonLink href="/training/running-count"  className="mt-5">Start a drill</ButtonLink>
        </Panel>
      ) : (
        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-5">
            <Metric label="7-day accuracy" value={accuracySince(7) === null ? "Not measured" : `${accuracySince(7)}%`} />
            <Metric label="30-day accuracy" value={accuracySince(30) === null ? "Not measured" : `${accuracySince(30)}%`} />
            <Metric label="Best card speed" value={cardSpeeds.length ? `${Math.max(...cardSpeeds).toFixed(1)}/s` : "Not measured"} />
            <Metric label="Latest deck MAE" value={deckErrors.length ? `${deckErrors[0].toFixed(2)} decks` : "Not measured"} />
            <Metric label="Counting mastery" value={`${mastery.score}%`} sub={`${perfectShoes} perfect shoes`} />
          </div>
          <Panel>
            <h2 className="mb-5 font-semibold">Accuracy over time</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid stroke="#ffffff0d" />
                  <XAxis dataKey="name" stroke="#71717a" minTickGap={24} />
                  <YAxis domain={[0, 100]} stroke="#71717a" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--paper-raised)", color: "var(--ink)",
                      border: "1px solid var(--rule)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="var(--accent)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-5 font-semibold">Response time over time</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid stroke="#ffffff0d" />
                  <XAxis dataKey="name" stroke="#71717a" minTickGap={28} interval="preserveStartEnd" />
                  <YAxis stroke="#71717a" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--paper-raised)", color: "var(--ink)",
                      border: "1px solid var(--rule)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="response"
                    stroke="var(--info)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="lg:col-span-2">
            <h2 className="mb-5 font-semibold">Performance by drill</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDrill}>
                  <CartesianGrid stroke="#ffffff0d" />
                  <XAxis dataKey="name" stroke="#71717a" minTickGap={28} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} stroke="#71717a" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--paper-raised)", color: "var(--ink)",
                      border: "1px solid var(--rule)",
                    }}
                  />
                  <Bar
                    dataKey="accuracy"
                    fill="#1e8f62"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          {byCategory.length > 0 && (
            <Panel className="lg:col-span-2">
              <h2 className="font-semibold">Accuracy by decision category</h2>
              <p className="mb-5 mt-1 text-sm text-[var(--ink-muted)]">
                Lowest-performing categories appear first.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {byCategory.map((row) => (
                  <div key={row.name} className="rounded-xl bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>{row.name}</span>
                      <b>{row.accuracy}%</b>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-emerald-500" style={{ width: `${row.accuracy}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-[var(--ink-muted)]">{row.total} answers</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {errorCounts.length > 0 && <Panel className="lg:col-span-2"><h2 className="font-semibold">Counting error diagnosis</h2><p className="mb-4 mt-1 text-sm text-[var(--ink-muted)]">Use the most frequent error as the focus for the next spaced-practice session.</p><div className="flex flex-wrap gap-2">{errorCounts.map(([name, count]) => <span key={name} className="rounded-full bg-black/25 px-3 py-2 text-sm"><b className="text-[var(--warning)]">{count}</b> {name}</span>)}</div></Panel>}
          <section className="sr-only" aria-label="Statistics text summary">
            <h2>Performance summary</h2>
            <ul>
              {byDrill.map((row) => (
                <li key={row.name}>{row.name}: {row.accuracy}% accuracy across {row.total} answers</li>
              ))}
              {byCategory.map((row) => (
                <li key={row.name}>{row.name}: {row.accuracy}% across {row.total} answers</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
