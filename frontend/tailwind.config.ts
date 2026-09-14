import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // denney.insure's "Navy Teal Coral" system — see denney-site/site/static/css/style.css.
        // Overrides Tailwind's built-in slate shades with denney's exact neutrals; primary/accent
        // are new names (not Tailwind's own rose/teal scales) so there's no ambiguity about which
        // "teal" or "rose" a class means.
        slate: {
          50: "#f6f7fb",
          100: "#eef1f6",
          200: "#dce1ec",
          300: "#c3cadb",
          400: "#94a0b5",
          500: "#64728a",
          600: "#47536f",
          700: "#2a3a63",
          800: "#1e2c4e",
          900: "#16213d",
        },
        primary: { DEFAULT: "#ef2a5c", tint: "#fde7ed" },
        accent: { DEFAULT: "#0b7a6e", tint: "#e4f7f4" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        md: "0.85rem",
        lg: "1.1rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
