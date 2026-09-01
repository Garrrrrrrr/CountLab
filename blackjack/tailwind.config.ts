import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: { extend: { colors: {
    ink: "var(--ink)", paper: "var(--paper)", panel: "var(--paper-raised)", rule: "var(--rule)", felt: "var(--felt)",
    "count-cold": "var(--count-cold)", "count-low": "var(--count-low)", "count-flat": "var(--count-flat)", "count-warm": "var(--count-warm)", "count-hot": "var(--count-hot)",
  } } },
  plugins: []
} satisfies Config;
