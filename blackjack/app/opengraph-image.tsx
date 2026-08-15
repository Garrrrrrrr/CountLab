import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #101411 0%, #0b1a12 55%, #143621 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            height: 132,
            width: 132,
            borderRadius: 30,
            background: "linear-gradient(135deg, #b4f27d, #65c875)",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 68,
            fontWeight: 700,
            color: "#112010",
          }}
        >
          A♠
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 76, fontWeight: 700, letterSpacing: -2, color: "#f4f7f2" }}>
          CountLab
        </div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 32, color: "#9fb0a4" }}>
          Hi-Lo card counting &amp; blackjack training
        </div>
      </div>
    ),
    { ...size },
  );
}
