import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: { extend: { colors: {
    ink: "var(--ink)", paper: "var(--paper)", panel: "var(--paper-raised)", rule: "var(--rule)", felt: "var(--felt)",
    "count-cold": "var(--count-cold)", "count-low": "var(--count-low)", "count-flat": "var(--count-flat)", "count-warm": "var(--count-warm)", "count-hot": "var(--count-hot)",
    // Theme-aware translucent layers. `overlay` lifts a surface toward the
    // foreground (white on dark, ink on light) for hairlines, hovers, and
    // selected states; `well` recesses it (black on dark, a faint ink tint on
    // light) for inset fields and tracks. Each theme scales the alpha so the
    // same `/[.07]` or `/20` modifier reads with similar weight on either paper.
    overlay: "rgb(var(--overlay-rgb) / calc(<alpha-value> * var(--overlay-scale)))",
    well: "rgb(var(--well-rgb) / calc(<alpha-value> * var(--well-scale)))",
  } } },
  plugins: []
} satisfies Config;
