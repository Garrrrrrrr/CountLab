"use client";
import { useEffect, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui";
import { JournalSheet } from "./parts";
import { analytics } from "@/lib/analytics";
import { isJournalDate, type JournalSession } from "@/lib/blackjack/journal";
import type { TheoreticalOutcome } from "@/lib/blackjack/journalAnalysis";
import { hoursLabel, money, signedMoney } from "@/lib/blackjack/journalFormat";
import { exactMoney } from "./model";

const WIDTH = 1200;
const HEIGHT = 630;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/** A design token as a canvas colour, read from the page so the image matches the theme in use. */
function tokens() {
  const style = getComputedStyle(document.documentElement);
  const rgb = (name: string, alpha = 1) => `rgb(${style.getPropertyValue(`--${name}`).trim()} / ${alpha})`;
  return { rgb };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the shareable session summary: date and casino, the result, and its expectation. */
async function renderSessionCard(canvas: HTMLCanvasElement, session: JournalSession, outcome: TheoreticalOutcome, bankrollName?: string) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  try { await document.fonts?.ready; } catch { /* best effort: the canvas still draws with fallback fonts */ }
  const { rgb } = tokens();

  ctx.fillStyle = rgb("bg");
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH - 80, 60, 20, WIDTH - 80, 60, 460);
  glow.addColorStop(0, rgb("brand", 0.22));
  glow.addColorStop(1, rgb("brand", 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = rgb("brand-text");
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText("CountLab", 56, 76);
  ctx.fillStyle = rgb("ink-3");
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText(`SESSION JOURNAL${bankrollName ? ` · ${bankrollName.toUpperCase()}` : ""}`, 56, 104);

  const dateLabel = isJournalDate(session.date) ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${session.date}T12:00:00`)) : "Date needs fixing";
  ctx.fillStyle = rgb("ink");
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText(`${dateLabel}${session.location?.trim() ? ` · ${session.location.trim()}` : ""}`.slice(0, 64), 56, 164);

  ctx.fillStyle = rgb(session.netResult > 0 ? "pos" : session.netResult < 0 ? "neg" : "ink");
  ctx.font = `800 112px ${FONT}`;
  ctx.fillText(signedMoney(session.netResult), 52, 300);
  ctx.fillStyle = rgb("ink-2");
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(`${hoursLabel(session.hours)} · ${exactMoney(session.bettingUnit)} unit · ${session.rules.decks} decks ${session.rules.dealerHitsSoft17 ? "H17" : "S17"}`, 56, 342);

  const stats: [string, string][] = [
    ["Expected (EV)", signedMoney(outcome.tripEv)],
    ["Swing (1 SD)", `±${money(outcome.standardDeviation)}`],
    ["Player edge", `${(outcome.playerEdge * 100).toFixed(2)}%`],
  ];
  const cardW = (WIDTH - 56 * 2 - 24 * 2) / 3;
  stats.forEach(([label, value], index) => {
    const x = 56 + index * (cardW + 24);
    ctx.fillStyle = rgb("surface");
    roundedRect(ctx, x, 396, cardW, 140, 20);
    ctx.fill();
    ctx.strokeStyle = rgb("line", 0.12);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = rgb("ink-3");
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText(label.toUpperCase(), x + 26, 438);
    ctx.fillStyle = rgb("ink");
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(value, x + 26, 494);
  });

  ctx.fillStyle = rgb("ink-3");
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText("countlab.ca · expected value from the audited true-count model for these rules and this spread", 56, HEIGHT - 34);
}

/** A picture of one session to share, with the system share sheet where there is one and a download everywhere. */
export function ShareSheet({ session, outcome, bankrollName, onClose }: { session: JournalSession; outcome: TheoreticalOutcome; bankrollName?: string; onClose: () => void }) {
  // A callback ref: the Sheet portals its content after its own first render, so the canvas arrives later than this component.
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const fileName = `countlab-session-${session.date}.png`;

  useEffect(() => {
    if (!canvas) return;
    let cancelled = false;
    void renderSessionCard(canvas, session, outcome, bankrollName).then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [canvas, session, outcome, bankrollName]);

  const toBlob = () => new Promise<Blob | null>((resolve) => canvas ? canvas.toBlob((blob) => resolve(blob), "image/png") : resolve(null));
  const download = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    analytics.track("result_shared", { feature: "session_journal", method: "download" });
  };
  const share = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "CountLab session" });
        analytics.track("result_shared", { feature: "session_journal", method: "native" });
        return;
      } catch {
        // Cancelled, or sharing failed: fall back to the download.
      }
    }
    await download();
    setNotice("Sharing isn't available here, so the image downloaded instead.");
  };

  return (
    <JournalSheet open title="Share this session" description="An image with the result and what the game should pay. Notes are never included." onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" disabled={!ready} icon={<Share2 size={17} aria-hidden />} onClick={() => void share()}>Share</Button>
          <Button disabled={!ready} icon={<Download size={17} aria-hidden />} onClick={() => void download()}>Download image</Button>
        </div>
      }>
      <canvas ref={setCanvas} role="img" aria-label={`Session image: ${signedMoney(session.netResult)}, expected ${signedMoney(outcome.tripEv)}`} className="aspect-[1200/630] w-full rounded-xl border border-line" />
      <p role="status" className="mt-3 text-sm text-ink-2 empty:hidden">{notice}</p>
    </JournalSheet>
  );
}
