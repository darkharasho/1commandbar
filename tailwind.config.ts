import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bar: {
          bg: "#1e1e1e",
          surface: "#252525",
          elevated: "#2e2e2e",
          border: "#3a3a3a",
        },
        ink: {
          primary: "#f3f3f3",
          secondary: "#9a9a9a",
          tertiary: "#6a6a6a",
          muted: "#4a4a4a",
        },
        accent: "#5e9eff",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
