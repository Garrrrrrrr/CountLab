import type { Config } from "tailwindcss";

/** Each token is an RGB triplet in app/globals.css, so every colour takes an alpha modifier. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["variant", [":root[data-theme='dark'] &", "@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) & }"]],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        "surface-3": token("surface-3"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        "ink-3": token("ink-3"),
        brand: token("brand"),
        "brand-ink": token("brand-ink"),
        "brand-text": token("brand-text"),
        pos: token("pos"),
        neg: token("neg"),
        warn: token("warn"),
        info: token("info"),
        felt: token("felt"),
        "felt-2": token("felt-2"),
        "act-h": token("act-h"),
        "act-h-ink": token("act-h-ink"),
        "act-s": token("act-s"),
        "act-d": token("act-d"),
        "act-p": token("act-p"),
        "act-r": token("act-r"),
        "act-ink": token("act-ink"),
      },
      borderColor: {
        line: "rgb(var(--line) / var(--line-a))",
        "line-strong": "rgb(var(--line) / calc(var(--line-a) * 2))",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
      },
      screens: {
        xs: "400px",
      },
    },
  },
  plugins: [],
} satisfies Config;
