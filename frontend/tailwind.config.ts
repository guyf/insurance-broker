import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: "#18181B",
          hover: "#27272A",
          border: "#3F3F46",
          text: "#F4F4F5",
          muted: "#A1A1AA",
          dim: "#71717A",
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
