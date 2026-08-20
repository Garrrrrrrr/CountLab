"use client";
import Link from "next/link";
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
import { Button, Metric, Panel } from "@/components/ui";
import { countingMastery } from "@/lib/blackjack/countingTraining";
import { Session, storage } from "@/lib/statistics/storage";

export default function StatisticsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    const load = () => setSessions(storage.sessions());
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
  const chart = [...sessions]
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
    accuracy: Math.round((v.correct / v.total) * 100),
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
    return total ? Math.round(recent.reduce((sum, session) => sum + session.correct, 0) / total * 100) : 0;
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
      <p className="mt-2 text-zinc-400">
        Persistent performance history across every training mode.
      </p>
      {sessions.length === 0 ? (
        <Panel className="mt-7 py-16 text-center">
          <p className="text-zinc-400">
            Complete a drill to start building your history.
          </p>
          <Link href="/training/running-count">
            <Button className="mt-5">Start a drill</Button>
          </Link>
        </Panel>
      ) : (
        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-5">
            <Metric label="7-day accuracy" value={`${accuracySince(7)}%`} />
            <Metric label="30-day accuracy" value={`${accuracySince(30)}%`} />
            <Metric label="Best card speed" value={`${Math.max(0, ...cardSpeeds).toFixed(1)}/s`} />
            <Metric label="Latest deck MAE" value={`${(deckErrors[0] ?? 0).toFixed(2)} decks`} />
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
                      background: "#111",
                      border: "1px solid #333",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#b5ed5c"
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
                  <XAxis dataKey="name" stroke="#71717a" />
                  <YAxis stroke="#71717a" />
                  <Tooltip
                    contentStyle={{
                      background: "#111",
                      border: "1px solid #333",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="response"
                    stroke="#38bdf8"
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
                  <XAxis dataKey="name" stroke="#71717a" />
                  <YAxis domain={[0, 100]} stroke="#71717a" />
                  <Tooltip
                    contentStyle={{
                      background: "#111",
                      border: "1px solid #333",
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
              <p className="mb-5 mt-1 text-sm text-zinc-500">
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
                    <p className="mt-2 text-xs text-zinc-500">{row.total} answers</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {errorCounts.length > 0 && <Panel className="lg:col-span-2"><h2 className="font-semibold">Counting error diagnosis</h2><p className="mb-4 mt-1 text-sm text-zinc-500">Use the most frequent error as the focus for the next spaced-practice session.</p><div className="flex flex-wrap gap-2">{errorCounts.map(([name, count]) => <span key={name} className="rounded-full bg-black/25 px-3 py-2 text-sm"><b className="text-amber-300">{count}</b> {name}</span>)}</div></Panel>}
          <section className="sr-only" aria-label="Statistics text summary">
            <h2>Performance summary</h2>
            <ul>
              {byDrill.map((row) => (
                <li key={row.name}>{row.name}: {row.accuracy}% accuracy</li>
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
