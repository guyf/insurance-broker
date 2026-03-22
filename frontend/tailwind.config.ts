import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0D1B2A",
        brass: "#C9A84C",
        midtone: "#2A3F54",
        panel: "#F5F0E8",
        "panel-border": "#DDD8CC",
      },
      fontFamily: {
        cormorant: ['"Cormorant Garamond"', "serif"],
        sans: ['"DM Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 1px 3px 0 rgba(13,27,42,0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
