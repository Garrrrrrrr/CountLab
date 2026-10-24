import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "CountLab: card counting trainer, strategy charts, calculator and journal";

/**
 * Plain ASCII text and an inline SVG mark only: any glyph outside the bundled
 * font (a suit symbol, an emoji) makes the renderer fetch a font from a CDN at
 * build time, which fails in a sandboxed or offline build.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 96px", background: "linear-gradient(135deg, #0B0D11 0%, #15181E 60%, #1c2230 100%)", fontFamily: "sans-serif" }}>
        <svg width="120" height="120" viewBox="0 0 64 64">
          <rect width="64" height="64" rx="15" fill="#20242c" />
          <rect x="17" y="11" width="30" height="42" rx="5.5" fill="#F5B93C" transform="rotate(-9 32 32)" />
          <path d="M32 21.5c-2.9 4.6-9.2 7.6-9.2 12.6 0 3.3 2.6 5.7 5.7 5.7 1.3 0 2.5-.4 3.3-1.2-.4 2.3-1.6 4.1-3.3 5.3h7c-1.7-1.2-2.9-3-3.3-5.3.8.8 2 1.2 3.3 1.2 3.1 0 5.7-2.4 5.7-5.7 0-5-6.3-8-9.2-12.6Z" fill="#20242c" transform="rotate(-9 32 32)" />
        </svg>
        <div style={{ display: "flex", marginTop: 44, fontSize: 84, fontWeight: 700, letterSpacing: -3, color: "#ECEEF2" }}>
          Count<span style={{ color: "#F5B93C" }}>Lab</span>
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 36, color: "#A4ABB8", maxWidth: 900 }}>
          Hi-Lo training with real discard-tray photos, accurate charts for your rules, a bankroll calculator and a session journal.
        </div>
      </div>
    ),
    { ...size },
  );
}
