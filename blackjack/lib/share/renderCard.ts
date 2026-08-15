import type { JournalSession } from "@/lib/blackjack/journal";
import type { TheoreticalOutcome } from "@/lib/blackjack/journalAnalysis";

const WIDTH = 1200;
const HEIGHT = 630;
const BG = "#101411";
const PANEL = "#171c18";
const ACCENT = "#a8ee72";
const WIN = "#86efac";
const LOSS = "#fca5a5";
const MUTED = "#a1a1aa";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const money = (value: number, digits = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "auto" }).format(value);

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Renders a shareable session-summary card onto `canvas`. Draws synchronously once system fonts are ready. */
export async function renderSessionCard(canvas: HTMLCanvasElement, session: JournalSession, outcome: TheoreticalOutcome, bankrollName?: string) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (typeof document !== "undefined" && "fonts" in document) {
    try { await document.fonts.ready; } catch { /* best-effort; canvas still renders with fallback fonts */ }
  }

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Corner accent glow
  const gradient = ctx.createRadialGradient(WIDTH - 80, 60, 20, WIDTH - 80, 60, 420);
  gradient.addColorStop(0, "rgba(168,238,114,.14)");
  gradient.addColorStop(1, "rgba(168,238,114,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  ctx.fillStyle = ACCENT;
  ctx.font = `700 22px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("♠ COUNTLAB", 56, 76);
  ctx.fillStyle = MUTED;
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText("SESSION JOURNAL" + (bankrollName ? ` · ${bankrollName.toUpperCase()}` : ""), 56, 102);

  const dateLabel = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${session.date}T12:00:00`));
  ctx.fillStyle = "#f4f4f5";
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(dateLabel + (session.location ? ` · ${session.location}` : ""), 56, 160);

  // Net result, large
  const win = session.netResult >= 0;
  ctx.fillStyle = win ? WIN : LOSS;
  ctx.font = `800 108px ${FONT}`;
  ctx.fillText(money(session.netResult, 0), 56, 300);
  ctx.fillStyle = MUTED;
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(`${session.hours} hour${session.hours === 1 ? "" : "s"} · $${session.bettingUnit} unit · ${session.rules.decks}D ${session.rules.dealerHitsSoft17 ? "H17" : "S17"}`, 58, 336);

  // Stat cards row
  const stats: [string, string][] = [
    ["Theoretical EV", money(outcome.tripEv, 0)],
    ["Standard deviation", `± ${money(outcome.standardDeviation, 0)}`],
    ["Player edge", `${(outcome.playerEdge * 100).toFixed(2)}%`],
  ];
  const cardW = (WIDTH - 56 * 2 - 24 * 2) / 3;
  const cardY = 396;
  const cardH = 140;
  stats.forEach(([label, value], index) => {
    const x = 56 + index * (cardW + 24);
    ctx.fillStyle = PANEL;
    roundedRect(ctx, x, cardY, cardW, cardH, 18);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(label.toUpperCase(), x + 24, cardY + 40);
    ctx.fillStyle = "#f4f4f5";
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText(value, x + 24, cardY + 92);
  });

  ctx.fillStyle = MUTED;
  ctx.font = `500 16px ${FONT}`;
  ctx.fillText("countlab.ca — theoretical EV computed from the audited true-count profile for these exact rules and ramp.", 56, HEIGHT - 32);
}
