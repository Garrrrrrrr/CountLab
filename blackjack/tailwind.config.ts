import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#111412", panel: "#191d1b", felt: "#1e8f62", lime: "#b5ed5c" } } },
  plugins: []
} satisfies Config;
